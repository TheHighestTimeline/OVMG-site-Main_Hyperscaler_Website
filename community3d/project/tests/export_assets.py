#!/usr/bin/env python3
"""Export the four procedural assets to public/models/*.glb via headless Chromium.

Usage: python3 tests/export_assets.py
Assumes `npm run build` has already produced dist-embed/city3d.js.

Serves dist-embed/ on :8322, opens a tiny page that loads ./city3d.js, calls
window.City3D.exportAllAssets(false), base64-encodes the GLB buffers in the
page, and writes them to public/models/<name>.glb (the vite public dir, so the
next React build ships them in dist/models/).
"""
import base64
import http.server
import os
import socketserver
import sys
import threading
from functools import partial

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST_EMBED = os.path.join(ROOT, 'dist-embed')
OUT_DIR = os.path.join(ROOT, 'public', 'models')
PORT = 8322

EXPORT_PAGE = """<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>City3D asset export</title></head>
<body><script type="module" src="./city3d.js"></script></body></html>
"""


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):  # noqa: N802 - silence request logging
        pass


def main() -> int:
    if not os.path.isfile(os.path.join(DIST_EMBED, 'city3d.js')):
        print('ERROR: dist-embed/city3d.js not found — run `npm run build` first.')
        return 1

    # Test page lives inside dist-embed so ./city3d.js resolves.
    page_path = os.path.join(DIST_EMBED, '__export_page.html')
    with open(page_path, 'w') as f:
        f.write(EXPORT_PAGE)

    socketserver.ThreadingTCPServer.allow_reuse_address = True
    httpd = socketserver.ThreadingTCPServer(
        ('127.0.0.1', PORT), partial(QuietHandler, directory=DIST_EMBED))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()

    from playwright.sync_api import sync_playwright

    rc = 0
    try:
        with sync_playwright() as p:
            b = p.chromium.launch()
            pg = b.new_page()
            errors = []
            pg.on('pageerror', lambda e: errors.append(str(e)))
            pg.goto(f'http://localhost:{PORT}/__export_page.html')
            pg.wait_for_function('() => !!window.City3D', timeout=15000)

            encoded = pg.evaluate("""async () => {
              const bufs = await window.City3D.exportAllAssets(false);
              const out = {};
              for (const [name, buf] of Object.entries(bufs)) {
                const bytes = new Uint8Array(buf);
                let bin = '';
                const CHUNK = 0x8000;
                for (let i = 0; i < bytes.length; i += CHUNK) {
                  bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
                }
                out[name] = btoa(bin);
              }
              return out;
            }""")
            b.close()

        if errors:
            print('ERROR: page errors during export:')
            for e in errors[:5]:
                print('  ' + e)
            return 1
        if not encoded:
            print('ERROR: exportAllAssets returned no buffers.')
            return 1

        os.makedirs(OUT_DIR, exist_ok=True)
        for name, b64 in sorted(encoded.items()):
            data = base64.b64decode(b64)
            if len(data) < 1000 or data[:4] != b'glTF':
                print(f'ERROR: {name} export looks invalid ({len(data)} bytes).')
                rc = 1
                continue
            out_path = os.path.join(OUT_DIR, f'{name}.glb')
            with open(out_path, 'wb') as f:
                f.write(data)
            print(f'wrote {os.path.relpath(out_path, ROOT)}  {len(data):,} bytes')
    finally:
        httpd.shutdown()
        if os.path.exists(page_path):
            os.remove(page_path)
    return rc


if __name__ == '__main__':
    sys.exit(main())
