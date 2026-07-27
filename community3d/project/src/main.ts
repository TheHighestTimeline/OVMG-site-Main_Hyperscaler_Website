/** Entry: exposes window.City3D and supports ?asset=... isolation + ?viewer for dev tools. */
import { mountCity3D, type City3D, type MountOptions } from './scene';
import { exportAllAssets } from './export/exportAssets';
import { validateLayout } from './export/validateExportedAssets';

declare global {
  interface Window {
    City3D: {
      mount(opts: MountOptions): City3D;
      exportAllAssets: typeof exportAllAssets;
      validateLayout: typeof validateLayout;
      instance?: City3D;
    };
  }
}

window.City3D = { mount: mountCity3D, exportAllAssets, validateLayout };

// Standalone / dev usage: auto-mount when a #city3d-root element exists.
const root = document.getElementById('city3d-root');
if (root) {
  const params = new URLSearchParams(location.search);
  const asset = params.get('asset') as MountOptions['isolate'] | null;
  const inst = mountCity3D({ container: root, isolate: asset ?? null });
  window.City3D.instance = inst;

  if (params.get('viewer') !== null) {
    // simple dev viewer chrome
    const bar = document.createElement('div');
    bar.style.cssText = 'position:fixed;top:8px;left:8px;display:flex;gap:6px;z-index:10;font-family:monospace;';
    for (const a of ['', 'base-world', 'market', 'community-center', 'street-lamp']) {
      const b = document.createElement('a');
      b.textContent = a || 'assembled';
      b.href = `?viewer${a ? `&asset=${a}` : ''}`;
      b.style.cssText = 'color:#44C7FF;background:#111a;padding:4px 8px;border-radius:6px;text-decoration:none;font-size:12px;';
      bar.appendChild(b);
    }
    const exp = document.createElement('button');
    exp.textContent = 'export GLBs';
    exp.style.cssText = 'font-size:12px;border-radius:6px;';
    exp.onclick = () => exportAllAssets(true);
    bar.appendChild(exp);
    document.body.appendChild(bar);
  }

  // standalone scroll driving (when page provides its own scroll length)
  const track = document.getElementById('city3d-track');
  if (track) {
    const onScroll = () => {
      const r = track.getBoundingClientRect();
      const total = r.height - window.innerHeight;
      const p = total > 0 ? Math.min(1, Math.max(0, -r.top / total)) : 0;
      inst.setProgress(p);
    };
    addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }
}
