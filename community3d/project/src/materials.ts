/** Shared material library + procedural CanvasTextures. All assets reuse these. */
import * as THREE from 'three';

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')!];
}

function noise(ctx: CanvasRenderingContext2D, w: number, h: number, n: number, alpha: number, light = false) {
  for (let i = 0; i < n; i++) {
    const v = Math.floor(Math.random() * 60);
    ctx.fillStyle = light
      ? `rgba(${180 + v},${180 + v},${180 + v},${alpha})`
      : `rgba(${v},${v},${v},${alpha})`;
    ctx.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 3, 1 + Math.random() * 3);
  }
}

export function brickTexture(base = '#4a3a33', mortar = '#2c2620', repeat: [number, number] = [2, 1]): THREE.Texture {
  const [c, ctx] = canvas(256, 256);
  ctx.fillStyle = mortar; ctx.fillRect(0, 0, 256, 256);
  const bh = 16, bw = 42;
  for (let row = 0; row < 256 / bh; row++) {
    const off = row % 2 ? bw / 2 : 0;
    for (let x = -1; x < 256 / bw + 1; x++) {
      const jr = Math.random() * 14 - 7;
      ctx.fillStyle = shade(base, jr);
      ctx.fillRect(x * bw + off + 1, row * bh + 1, bw - 2, bh - 2);
    }
  }
  noise(ctx, 256, 256, 900, 0.05);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function asphaltTexture(): THREE.Texture {
  const [c, ctx] = canvas(512, 256);
  ctx.fillStyle = '#101114'; ctx.fillRect(0, 0, 512, 256);
  noise(ctx, 512, 256, 4200, 0.08);
  noise(ctx, 512, 256, 420, 0.03, true);
  // patches
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = 'rgba(15,16,18,0.5)';
    ctx.beginPath();
    ctx.ellipse(Math.random() * 512, Math.random() * 256, 30 + Math.random() * 40, 14 + Math.random() * 18, 0, 0, 7);
    ctx.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 1);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function pavingTexture(tone = '#8d8579', dark = '#6d665c'): THREE.Texture {
  const [c, ctx] = canvas(256, 256);
  ctx.fillStyle = tone; ctx.fillRect(0, 0, 256, 256);
  const s = 32;
  for (let y = 0; y < 256 / s; y++) for (let x = 0; x < 256 / s; x++) {
    ctx.fillStyle = Math.random() < 0.5 ? shade(tone, Math.random() * 10 - 5) : shade(dark, Math.random() * 10 - 5);
    ctx.fillRect(x * s + 1, y * s + 1, s - 2, s - 2);
  }
  noise(ctx, 256, 256, 1500, 0.06);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function signTexture(text: string, w = 512, h = 128, bg = '#f5ecd9', fg = '#1a2028'): THREE.Texture {
  const [c, ctx] = canvas(w, h);
  ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = fg; ctx.lineWidth = 6; ctx.strokeRect(8, 8, w - 16, h - 16);
  ctx.fillStyle = fg;
  ctx.font = `bold ${Math.floor(h * 0.5)}px Georgia, serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, h / 2 + 2);
  noise(ctx, w, h, 300, 0.05);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

let winSeed = 7;
function seeded(): number { winSeed = (winSeed * 16807) % 2147483647; return winSeed / 2147483647; }
export function windowTexture(cols: number, rows: number, litRatio = 0.88): THREE.Texture {
  const [c, ctx] = canvas(64 * cols, 96 * rows);
  ctx.fillStyle = '#141519'; ctx.fillRect(0, 0, c.width, c.height);
  for (let r = 0; r < rows; r++) for (let col = 0; col < cols; col++) {
    const lit = seeded() < litRatio;
    const g = ctx.createLinearGradient(0, r * 96, 0, r * 96 + 96);
    if (lit) { g.addColorStop(0, '#ffd489'); g.addColorStop(1, '#e8944a'); }
    else { g.addColorStop(0, '#26303e'); g.addColorStop(1, '#161c26'); }
    ctx.fillStyle = g;
    ctx.fillRect(col * 64 + 6, r * 96 + 6, 52, 84);
    ctx.fillStyle = 'rgba(20,21,25,0.9)';
    ctx.fillRect(col * 64 + 30, r * 96 + 6, 4, 84);
    ctx.fillRect(col * 64 + 6, r * 96 + 44, 52, 4);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + amt));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 0xff) + amt));
  const b = Math.max(0, Math.min(255, (n & 0xff) + amt));
  return `rgb(${r},${g},${b})`;
}

/** Shared, reused materials. */
export class MaterialLibrary {
  readonly darkBrick = new THREE.MeshStandardMaterial({ map: brickTexture('#43342d', '#241f1a'), roughness: 0.92 });
  readonly warmBrick = new THREE.MeshStandardMaterial({ map: brickTexture('#5b4436', '#2e251e'), roughness: 0.9 });
  readonly stoneTrim = new THREE.MeshStandardMaterial({ color: 0x8f8878, roughness: 0.8 });
  readonly darkRoof = new THREE.MeshStandardMaterial({ color: 0x23262c, roughness: 0.75, metalness: 0.15 });
  readonly asphalt = new THREE.MeshStandardMaterial({ map: asphaltTexture(), roughness: 0.95 });
  readonly concrete = new THREE.MeshStandardMaterial({ map: pavingTexture('#9a9184', '#7d766b'), roughness: 0.9 });
  readonly paving = new THREE.MeshStandardMaterial({ map: (() => { const t = pavingTexture('#6f695f', '#57524b'); t.repeat.set(4, 3); return t; })(), roughness: 0.95 });
  readonly soil = new THREE.MeshStandardMaterial({ color: 0x201a16, roughness: 1 });
  readonly rockSide = new THREE.MeshStandardMaterial({ map: brickTexture('#4a433d', '#211d19', [5, 1]), roughness: 1 });
  readonly paintedMetal = new THREE.MeshStandardMaterial({ color: 0x20242a, roughness: 0.55, metalness: 0.3 });
  readonly glass = new THREE.MeshStandardMaterial({ color: 0x0e1420, roughness: 0.15, metalness: 0.4 });
  readonly awning = new THREE.MeshStandardMaterial({ color: 0x1d3470, roughness: 0.8 });
  readonly foliage = new THREE.MeshStandardMaterial({ color: 0x46632a, roughness: 0.95 });
  readonly trunk = new THREE.MeshStandardMaterial({ color: 0x3d2f24, roughness: 1 });
  readonly curb = new THREE.MeshStandardMaterial({ color: 0x6f6a60, roughness: 0.85 });
  readonly marking = new THREE.MeshStandardMaterial({ color: 0xd8b13c, roughness: 0.9, emissive: 0x6a5210, emissiveIntensity: 0.5 });
  readonly whiteMarking = new THREE.MeshStandardMaterial({ color: 0xd9d4c5, roughness: 0.9, emissive: 0x3a382f, emissiveIntensity: 0.5 });
  readonly windowGlow = (cols: number, rows: number) => new THREE.MeshStandardMaterial({
    map: windowTexture(cols, rows),
    emissive: 0xffb757, emissiveIntensity: 0.55,
    emissiveMap: windowTexture(cols, rows),
    roughness: 0.4,
  });
  readonly bulb = new THREE.MeshStandardMaterial({ color: 0xffd9a0, emissive: 0xffc36b, emissiveIntensity: 3.2 });
  readonly lampGlass = new THREE.MeshStandardMaterial({ color: 0xffe9c4, transparent: true, opacity: 0.35, roughness: 0.1, emissive: 0xffc36b, emissiveIntensity: 0.5 });
  readonly lightPool = new THREE.MeshBasicMaterial({ color: 0xffb75e, transparent: true, opacity: 0.14, depthWrite: false, blending: THREE.AdditiveBlending });
  readonly aoBlob = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.38, depthWrite: false });
}

let lib: MaterialLibrary | null = null;
export function materials(): MaterialLibrary {
  if (!lib) lib = new MaterialLibrary();
  return lib;
}
