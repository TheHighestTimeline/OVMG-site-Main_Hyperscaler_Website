#!/usr/bin/env python3
"""Browser/interaction test suite for the City3D scene (run: python3 tests/run_tests.py).

Requires `npm run build` to have produced:
  dist/        — React app (scrollytelling page + asset viewer)
  dist-embed/  — imperative embed bundle (city3d.js, window.City3D API)

The script serves both itself:
  :8321 → dist-embed (with tests/embed_test.html + public/models copied in)
  :8323 → dist

Sections:
  1. Embed bundle tests (original suite) against embed_test.html
  2. React app tests (canvas, labels, scroll-driven feature sequence, viewer)
  3. Viewport matrix (no horizontal overflow, canvas present)
"""
import http.server
import os
import shutil
import socketserver
import sys
import threading
from functools import partial

from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST = os.path.join(ROOT, 'dist')
DIST_EMBED = os.path.join(ROOT, 'dist-embed')
PUBLIC_MODELS = os.path.join(ROOT, 'public', 'models')
EMBED_PORT = 8321
APP_PORT = 8323
EMBED_URL = f'http://localhost:{EMBED_PORT}/embed_test.html'
APP_URL = f'http://localhost:{APP_PORT}/index.html'

PASS, FAIL = 0, 0


def check(name, cond, detail=""):
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f"  ok  {name}")
    else:
        FAIL += 1
        print(f"FAIL  {name}  {detail}")


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):  # noqa: N802 - silence request logging
        pass


def serve(directory, port):
    socketserver.ThreadingTCPServer.allow_reuse_address = True
    try:
        httpd = socketserver.ThreadingTCPServer(
            ('127.0.0.1', port), partial(QuietHandler, directory=directory))
    except OSError as e:
        print(f"ERROR: cannot bind :{port} ({e}). A stale server is likely holding the port —\n"
              f"       free it (e.g. pkill -f 'http.server {port}') and re-run.")
        sys.exit(1)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


# --- Preflight ---------------------------------------------------------------
missing = []
if not os.path.isfile(os.path.join(DIST_EMBED, 'city3d.js')):
    missing.append('dist-embed/city3d.js')
if not os.path.isfile(os.path.join(DIST, 'index.html')):
    missing.append('dist/index.html')
if missing:
    print('ERROR: missing build outputs: ' + ', '.join(missing) + ' — run `npm run build` first.')
    sys.exit(1)

# Embed test harness page (recreates the production track/sticky/#city3d-root
# structure around city3d.js) is copied into dist-embed so ./city3d.js resolves.
shutil.copy(os.path.join(ROOT, 'tests', 'embed_test.html'),
            os.path.join(DIST_EMBED, 'embed_test.html'))
# GLBs are served from /models on the embed origin (parity + fetch tests).
if os.path.isdir(PUBLIC_MODELS):
    shutil.copytree(PUBLIC_MODELS, os.path.join(DIST_EMBED, 'models'), dirs_exist_ok=True)

servers = [serve(DIST_EMBED, EMBED_PORT), serve(DIST, APP_PORT)]

# JS helper: scroll the page so the scroll track (or whole document) sits at
# progress p in [0,1]. Used by both embed and React scroll tests.
SCROLL_TO_PROGRESS = """(p) => {
  const track = document.getElementById('city3d-track')
    || document.querySelector('[data-city3d-track], .city3d-track, [data-scroll-track]');
  if (track) {
    const rect = track.getBoundingClientRect();
    const absTop = rect.top + window.scrollY;
    const total = Math.max(1, rect.height - window.innerHeight);
    window.scrollTo(0, absTop + p * total);
  } else {
    const total = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    window.scrollTo(0, p * total);
  }
}"""

try:
    with sync_playwright() as p:
        b = p.chromium.launch()

        # =====================================================================
        # SECTION 1 — Embed bundle (window.City3D) against embed_test.html
        # =====================================================================
        pg = b.new_page(viewport={'width': 1440, 'height': 900})
        errors = []
        pg.on('pageerror', lambda e: errors.append(str(e)))
        pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
        pg.goto(EMBED_URL)
        pg.wait_for_timeout(1500)

        # 1. loads + canvas renders
        check("embed loads / canvas renders",
              pg.evaluate("() => !!document.querySelector('#city3d-root canvas')"))

        # 2. all four asset systems present
        present = pg.evaluate("""() => {
          const s = window.City3D.instance.scene;
          return {
            base: !!s.getObjectByName('BaseWorld'),
            market: !!s.getObjectByName('Market'),
            cc: !!s.getObjectByName('CommunityCenter'),
            lamps: s.getObjectByName('StreetLights')?.children.length || 0,
          };
        }""")
        check("BaseWorld present", present['base'])
        check("Market present", present['market'])
        check("CommunityCenter present", present['cc'])
        check("4 street lamps present", present['lamps'] == 4, str(present['lamps']))

        # 3. base world stationary during lifts; lift groups reach configured heights
        ys = pg.evaluate("""() => {
          const i = window.City3D.instance, s = i.scene;
          const base = s.getObjectByName('BaseWorld');
          const mk = s.getObjectByName('MarketLift');
          const cc = s.getObjectByName('CommunityCenterLift');
          const lamp0 = s.getObjectByName('StreetLampLift0');
          const out = {};
          i.setProgress(0.0); out.base0 = base.position.y; out.mk0 = mk.position.y; out.cc0 = cc.position.y;
          i.setLift('market', 1); out.mkTop = mk.position.y;
          i.setLift('market', 0);
          i.setLift('communityCenter', 1); out.ccTop = cc.position.y;
          i.setLift('communityCenter', 0);
          i.setLift('streetLamps', 1); out.lampTop = lamp0.position.y;
          i.setLift('streetLamps', 0); out.lampBack = lamp0.position.y;
          out.baseAfter = base.position.y;
          i.setProgress(1.0); out.mkEnd = mk.position.y; out.ccEnd = cc.position.y;
          return out;
        }""")
        check("base stationary", ys['base0'] == 0 and ys['baseAfter'] == 0, str(ys))
        check("market reaches lift height 2.25", abs(ys['mkTop'] - 2.25) < 0.01, str(ys['mkTop']))
        check("community center reaches 2.75", abs(ys['ccTop'] - 2.75) < 0.01, str(ys['ccTop']))
        check("lamps reach configured 1.9", abs(ys['lampTop'] - 1.9) < 0.01, str(ys['lampTop']))
        check("lamps return to 0", abs(ys['lampBack']) < 0.01, str(ys['lampBack']))
        check("all return to 0 at settle", abs(ys['mkEnd']) < 0.01 and abs(ys['ccEnd']) < 0.01, str(ys))

        # 4. activeFeature transitions at configured ranges
        feats = pg.evaluate("""() => {
          const i = window.City3D.instance, out = [];
          for (const p of [0.1, 0.32, 0.57, 0.82, 1.0]) { i.setProgress(p); out.push(i.activeFeature()); }
          return out;
        }""")
        check("feature sequence",
              feats == ['overview', 'market', 'community-center', 'street-lights', 'overview'],
              str(feats))

        # 5. spatial validation + GLB parity
        result = pg.evaluate("""async () => {
          const bufs = await window.City3D.exportAllAssets(false);
          const checks = await window.City3D.validateLayout(bufs);
          return checks.filter(c => !c.pass).map(c => c.name + ': ' + c.detail);
        }""")
        check("spatial validation + GLB parity", len(result) == 0, '; '.join(result))

        # 6. exported GLB files load from the embed origin
        glb = pg.evaluate("""async () => {
          const names = ['base-world','market','community-center','street-lamp'];
          const out = [];
          for (const n of names) {
            const r = await fetch(`/models/${n}.glb`);
            out.push(n + ':' + r.status + ':' + (await r.arrayBuffer()).byteLength);
          }
          return out;
        }""")
        check("GLBs served + non-empty",
              all((':200:' in x and int(x.split(':')[2]) > 10000) for x in glb), str(glb))

        # 7. isolated asset views render
        for asset in ['base-world', 'market', 'community-center', 'street-lamp']:
            pg.goto(f'{EMBED_URL}?asset={asset}')
            pg.wait_for_timeout(800)
            ok = pg.evaluate("() => !!document.querySelector('#city3d-root canvas')")
            check(f"isolated view: {asset}", ok)

        # 8. resize handling
        pg.goto(EMBED_URL)
        pg.wait_for_timeout(1000)
        pg.set_viewport_size({'width': 800, 'height': 900}); pg.wait_for_timeout(300)
        pg.set_viewport_size({'width': 1440, 'height': 900}); pg.wait_for_timeout(300)
        check("resize survives without errors", len(errors) == 0, str(errors[:3]))

        # 9. mobile viewport (embed)
        m = b.new_page(viewport={'width': 390, 'height': 844})
        merr = []
        m.on('pageerror', lambda e: merr.append(str(e)))
        m.goto(EMBED_URL)
        m.wait_for_timeout(1200)
        check("embed mobile renders", m.evaluate("() => !!document.querySelector('#city3d-root canvas')"))
        check("embed mobile no errors", len(merr) == 0, str(merr[:3]))
        m.close()

        check("embed zero console errors overall", len(errors) == 0, str(errors[:3]))
        pg.close()

        # =====================================================================
        # SECTION 2 — React app (dist/) on :8323
        # =====================================================================
        app = b.new_page(viewport={'width': 1440, 'height': 900})
        aerr = []
        app.on('pageerror', lambda e: aerr.append(str(e)))
        app.on('console', lambda m: aerr.append(m.text) if m.type == 'error' else None)
        app.goto(APP_URL)
        app.wait_for_timeout(2500)

        check("react app loads / canvas under #root",
              app.evaluate("() => !!document.querySelector('#root canvas')"))
        check("react API exposed (window.City3D_React.activeFeature)",
              app.evaluate("() => typeof (window.City3D_React && window.City3D_React.activeFeature) === 'function'"))

        # DOM feature labels exist
        label_count = app.evaluate("""() => {
          const sels = ['[data-feature]', '.feature-label', '.stage-label', '[data-stage]'];
          for (const s of sels) {
            const n = document.querySelectorAll(s).length;
            if (n > 0) return n;
          }
          return 0;
        }""")
        check("feature labels exist in DOM", label_count > 0, f"found {label_count}")

        # Scroll through the 600vh track; assert the active-feature sequence and
        # that the label for each active stage becomes visible.
        expected = [(0.08, 'overview'), (0.32, 'market'),
                    (0.57, 'community-center'), (0.82, 'street-lights')]
        seq = []
        label_vis = []
        for frac, want in expected:
            app.evaluate(SCROLL_TO_PROGRESS, frac)
            app.wait_for_timeout(600)
            state = app.evaluate("""() => {
              const feat = window.City3D_React && window.City3D_React.activeFeature
                ? window.City3D_React.activeFeature() : null;
              let labelVisible = null;
              if (feat) {
                const el = document.querySelector(`[data-feature="${feat}"], [data-stage="${feat}"]`);
                if (el) {
                  const cs = getComputedStyle(el);
                  labelVisible = cs.display !== 'none' && cs.visibility !== 'hidden'
                    && parseFloat(cs.opacity) > 0.1;
                }
              }
              return { feat, labelVisible };
            }""")
            seq.append(state['feat'])
            label_vis.append((want, state['labelVisible']))
        check("react scroll feature sequence",
              seq == [w for _, w in expected], str(seq))
        for want, vis in label_vis:
            # vis is None when no [data-feature]/[data-stage] element matched —
            # that already failed the "labels exist" check above.
            check(f"label visible during '{want}' stage", vis is True, f"visible={vis}")

        app.evaluate("() => window.scrollTo(0, 0)")
        check("react app no page errors", len(aerr) == 0, str(aerr[:3]))
        app.close()

        # Asset viewer route (?viewer&asset=...)
        for asset in ['base-world', 'market', 'community-center', 'street-lamp']:
            v = b.new_page(viewport={'width': 1440, 'height': 900})
            verr = []
            v.on('pageerror', lambda e, _l=verr: _l.append(str(e)))
            v.goto(f'{APP_URL}?viewer&asset={asset}')
            v.wait_for_timeout(1500)
            ok = v.evaluate("() => !!document.querySelector('#root canvas')")
            check(f"asset viewer renders: {asset}", ok and len(verr) == 0,
                  f"canvas={ok} errors={verr[:2]}")
            v.close()

        # =====================================================================
        # SECTION 3 — Viewport matrix (React app): no horizontal overflow
        # =====================================================================
        for w, h in [(390, 844), (430, 932), (768, 1024), (1440, 900), (1920, 1080)]:
            vp = b.new_page(viewport={'width': w, 'height': h})
            vp.goto(APP_URL)
            vp.wait_for_timeout(1500)
            state = vp.evaluate("""() => ({
              canvas: !!document.querySelector('#root canvas'),
              scrollW: document.documentElement.scrollWidth,
              clientW: document.documentElement.clientWidth,
            })""")
            check(f"{w}x{h}: canvas present", state['canvas'])
            check(f"{w}x{h}: no horizontal overflow",
                  state['scrollW'] <= state['clientW'] + 1,
                  f"scrollWidth={state['scrollW']} clientWidth={state['clientW']}")
            vp.close()

        b.close()
finally:
    for s in servers:
        s.shutdown()

print(f"\n{PASS} passed, {FAIL} failed")
sys.exit(1 if FAIL else 0)
