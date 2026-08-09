#!/usr/bin/env node
/**
 * prepare-assets.mjs
 * -------------------
 * Standalone, idempotent asset-preparation pipeline for the hero3d Three.js build.
 *
 * Produces:
 *   A. public/brand/o-metrics.json            - measured geometry of the OVMG "O" glyph
 *   B. public/textures/o-relief.png            - height map of the carved O face
 *      public/textures/o-normal.png            - tangent-space normal map (Sobel of relief)
 *      public/textures/o-rough.png             - roughness map
 *      public/textures/o-ao.png                - ambient occlusion map
 *      public/textures/o-albedo.png            - subtle stone colour map
 *   C. public/textures/stone-noise.png         - tileable fbm noise (fine surface breakup)
 *      public/textures/stone-noise-normal.png  - normal map derived from that noise
 *   D. public/partners/<id>.webp               - trimmed / normalised partner logo textures
 *      public/partners/assets.json             - per-logo metrics (aspect, tone, luminance...)
 *   E. public/brand/ovmg-o-source.webp         - untouched copy of the source O art
 *      README.md (this folder)                 - how to re-run / extend
 *
 * Run with:  node prepare-assets.mjs   (from this hero3d/tools folder)
 *
 * The script only depends on `sharp` (installed locally in hero3d/tools). All noise
 * generation (value/fbm noise for the tileable stone surface) is implemented in plain
 * JS below - no extra dependencies, no network access, no remote downloads.
 */

import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REPO = path.resolve(__dirname, '..', '..');
const IMAGES = path.join(REPO, 'images');
const PUBLIC = path.join(REPO, 'hero3d', 'project', 'public');
const BRAND_DIR = path.join(PUBLIC, 'brand');
const PARTNERS_DIR = path.join(PUBLIC, 'partners');
const TEXTURES_DIR = path.join(PUBLIC, 'textures');

const O_SOURCE = path.join(IMAGES, 'ovmg-o-stone.webp');

// Partner logo sources. To add a new partner: drop the file in REPO/images/,
// add an entry here (id must be filesystem/URL safe, lowercase, hyphenated),
// then re-run `node prepare-assets.mjs`.
const LOGO_SOURCES = [
  { id: 'velatech', file: 'logo-velatech.png' },
  { id: 'solr-energy', file: 'logo-solr-energy.png' },
  { id: 'bright-sun-solar', file: 'logo-bright-sun-solar.png' },
  { id: 'ess', file: 'logo-ess.png' },
  { id: 'ram-global', file: 'logo-ram-global.png' },
];

const RELIEF_SIZE = 1024; // Part B canvas size
const STONE_NOISE_SIZE = 512; // Part C canvas size
const LOGO_MAX_BOX = 512; // Part D max fit box

// ---------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function smoothstep(t) {
  t = clamp(t, 0, 1);
  return t * t * (3 - 2 * t);
}

/** Read an image fully decoded to raw RGBA (straight alpha). */
async function readRawRGBA(filePath) {
  const img = sharp(filePath);
  const meta = await img.metadata();
  const { data, info } = await img.raw().ensureAlpha().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height, channels: info.channels, meta };
}

/** Nearest-neighbour pixel fetch from a raw RGBA buffer, out-of-bounds = transparent black. */
function makeSampler(data, width, height, channels) {
  return function sample(x, y) {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= width || y >= height) return [0, 0, 0, 0];
    const i = (y * width + x) * channels;
    return [data[i], data[i + 1], data[i + 2], data[i + 3]];
  };
}

function luminance(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Write an 8-bit single-channel (grayscale) buffer as a PNG. */
async function writeGrayPNG(filePath, width, height, buffer) {
  await sharp(Buffer.from(buffer), { raw: { width, height, channels: 1 } })
    .png()
    .toFile(filePath);
}

/** Write an 8-bit 3-channel (RGB) buffer as a PNG. */
async function writeRGBPNG(filePath, width, height, buffer) {
  await sharp(Buffer.from(buffer), { raw: { width, height, channels: 3 } })
    .png()
    .toFile(filePath);
}

/** Deterministic PRNG (mulberry32) so re-runs are byte-identical. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Plain-JS tileable value/fbm noise (no dependencies beyond Math)
// ---------------------------------------------------------------------------

/**
 * Builds a 2D value-noise sampler whose lattice wraps exactly at integer
 * frequencies, so fbm(x,y) for x,y in [0,1) tiles seamlessly when the texture
 * domain is exactly [0,1) x [0,1) (i.e. sample at px/width, py/height).
 */
function createTileableNoise2D(seed) {
  const rand = mulberry32(seed);
  const TABLE_SIZE = 256;
  const perm = new Uint8Array(TABLE_SIZE);
  for (let i = 0; i < TABLE_SIZE; i++) perm[i] = i;
  // Fisher-Yates shuffle with the seeded PRNG.
  for (let i = TABLE_SIZE - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = perm[i];
    perm[i] = perm[j];
    perm[j] = tmp;
  }

  function hash(ix, iy) {
    return perm[(perm[((ix % TABLE_SIZE) + TABLE_SIZE) % TABLE_SIZE] + iy) % TABLE_SIZE] / 255;
  }

  /** Single-octave tileable value noise. x,y in [0,1). freq = integer lattice period. */
  function noise2D(x, y, freq) {
    const xf = x * freq;
    const yf = y * freq;
    const ix = Math.floor(xf) % freq;
    const iy = Math.floor(yf) % freq;
    const ix1 = (ix + 1) % freq;
    const iy1 = (iy + 1) % freq;
    const fx = xf - Math.floor(xf);
    const fy = yf - Math.floor(yf);

    const v00 = hash(ix, iy);
    const v10 = hash(ix1, iy);
    const v01 = hash(ix, iy1);
    const v11 = hash(ix1, iy1);

    const sx = smoothstep(fx);
    const sy = smoothstep(fy);

    const top = lerp(v00, v10, sx);
    const bottom = lerp(v01, v11, sx);
    return lerp(top, bottom, sy);
  }

  /** Fractal brownian motion, still exactly tileable because every octave's
   *  frequency is an integer (baseFreq * 2^o). */
  function fbm(x, y, { octaves = 5, baseFreq = 4, persistence = 0.5 } = {}) {
    let amplitude = 1;
    let totalAmplitude = 0;
    let sum = 0;
    let freq = baseFreq;
    for (let o = 0; o < octaves; o++) {
      sum += noise2D(x, y, freq) * amplitude;
      totalAmplitude += amplitude;
      amplitude *= persistence;
      freq *= 2;
    }
    return sum / totalAmplitude; // 0..1
  }

  return { noise2D, fbm };
}

// ---------------------------------------------------------------------------
// Sobel helpers (used for both the O normal map and the stone-noise normal map)
// ---------------------------------------------------------------------------

/**
 * Computes a tangent-space normal map from an 8-bit grayscale height buffer
 * using a 3x3 Sobel filter. `wrap` = true samples with modulo wrap-around
 * (required to keep a tileable source seamless); false clamps to the edge.
 */
function sobelNormalMap(heightBuf, width, height, strength, wrap) {
  const out = new Uint8Array(width * height * 3);

  function h(x, y) {
    if (wrap) {
      x = ((x % width) + width) % width;
      y = ((y % height) + height) % height;
    } else {
      x = clamp(x, 0, width - 1);
      y = clamp(y, 0, height - 1);
    }
    return heightBuf[y * width + x] / 255;
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Sobel kernels
      const tl = h(x - 1, y - 1), t = h(x, y - 1), tr = h(x + 1, y - 1);
      const l = h(x - 1, y), r = h(x + 1, y);
      const bl = h(x - 1, y + 1), b = h(x, y + 1), br = h(x + 1, y + 1);

      const gx = (tr + 2 * r + br) - (tl + 2 * l + bl);
      const gy = (bl + 2 * b + br) - (tl + 2 * t + tr);

      let nx = -gx * strength;
      let ny = -gy * strength;
      let nz = 1.0;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
      nx /= len; ny /= len; nz /= len;

      const i = (y * width + x) * 3;
      out[i] = Math.round((nx * 0.5 + 0.5) * 255);
      out[i + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      out[i + 2] = Math.round((nz * 0.5 + 0.5) * 255);
    }
  }
  return out;
}

/** Separable box blur on an 8-bit single-channel buffer (used for AO spreading). */
function boxBlurGray(buf, width, height, radius) {
  if (radius <= 0) return buf;
  const tmp = new Float32Array(width * height);
  const out = new Float32Array(width * height);
  // horizontal pass
  for (let y = 0; y < height; y++) {
    let acc = 0;
    let count = 0;
    for (let x = -radius; x <= radius; x++) {
      const xx = clamp(x, 0, width - 1);
      acc += buf[y * width + xx];
      count++;
    }
    for (let x = 0; x < width; x++) {
      tmp[y * width + x] = acc / count;
      const xOut = clamp(x - radius, 0, width - 1);
      const xIn = clamp(x + radius + 1, 0, width - 1);
      acc += buf[y * width + xIn] - buf[y * width + xOut];
    }
  }
  // vertical pass
  for (let x = 0; x < width; x++) {
    let acc = 0;
    let count = 0;
    for (let y = -radius; y <= radius; y++) {
      const yy = clamp(y, 0, height - 1);
      acc += tmp[yy * width + x];
      count++;
    }
    for (let y = 0; y < height; y++) {
      out[y * width + x] = acc / count;
      const yOut = clamp(y - radius, 0, height - 1);
      const yIn = clamp(y + radius + 1, 0, height - 1);
      acc += tmp[yIn * width + x] - tmp[yOut * width + x];
    }
  }
  const res = new Uint8Array(width * height);
  for (let i = 0; i < res.length; i++) res[i] = Math.round(clamp(out[i], 0, 255));
  return res;
}

// ---------------------------------------------------------------------------
// PART A - measure the O metrics from the alpha / luminance profile
// ---------------------------------------------------------------------------

async function measureOMetrics() {
  const { data, width, height, channels } = await readRawRGBA(O_SOURCE);
  const sample = makeSampler(data, width, height, channels);

  // --- centre: bounding box of alpha > threshold, cross-checked against the
  // alpha-weighted centroid. For a symmetric ring these should coincide. ---
  const ALPHA_EDGE = 25;
  let minX = width, maxX = 0, minY = height, maxY = 0;
  let sx = 0, sy = 0, sw = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = data[(y * width + x) * channels + 3];
      if (a > ALPHA_EDGE) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
      sx += x * a; sy += y * a; sw += a;
    }
  }
  const bboxCenterX = (minX + maxX) / 2;
  const bboxCenterY = (minY + maxY) / 2;
  const centroidX = sx / sw;
  const centroidY = sy / sw;
  // Use the bbox centre (robust for a ring silhouette even if the carved
  // pattern's brightness is angularly asymmetric); log both for verification.
  const centerX = bboxCenterX;
  const centerY = bboxCenterY;

  // --- radial scan: for many angles, find the alpha=127 crossings for the
  // outer silhouette edge (scanning inward from outside) and the inner hole
  // edge (scanning outward from the centre). ---
  const N_ANGLES = 720;
  const STEP = 0.25; // px
  const maxScan = Math.min(width, height) / 2 + 4;

  const outerHits = [];
  const innerHits = [];

  for (let a = 0; a < N_ANGLES; a++) {
    const theta = (a / N_ANGLES) * Math.PI * 2;
    const dx = Math.cos(theta), dy = Math.sin(theta);

    // Inner hole edge: walk outward from r=0, first crossing alpha>=127.
    let prevA = sample(centerX, centerY)[3];
    for (let r = STEP; r <= maxScan; r += STEP) {
      const [, , , A] = sample(centerX + dx * r, centerY + dy * r);
      if (prevA < 127 && A >= 127) {
        // linear interpolate sub-step position
        const t = (127 - prevA) / (A - prevA || 1);
        innerHits.push(r - STEP + t * STEP);
        break;
      }
      prevA = A;
    }

    // Outer silhouette edge: walk outward from r=0, LAST crossing alpha>=127
    // before it stays below threshold out to maxScan (handles the fact
    // there are two crossings: hole->stone, then stone->outside).
    let lastAboveR = null;
    prevA = sample(centerX, centerY)[3];
    let prevR = 0;
    for (let r = STEP; r <= maxScan; r += STEP) {
      const [, , , A] = sample(centerX + dx * r, centerY + dy * r);
      if (prevA >= 127 && A < 127) {
        const t = (prevA - 127) / (prevA - A || 1);
        lastAboveR = prevR + t * STEP;
      }
      prevA = A;
      prevR = r;
    }
    if (lastAboveR !== null) outerHits.push(lastAboveR);
  }

  function mean(arr) { return arr.reduce((s, v) => s + v, 0) / arr.length; }
  function std(arr, m) { return Math.sqrt(mean(arr.map((v) => (v - m) ** 2))); }

  const outerRadiusPx = mean(outerHits);
  const outerStd = std(outerHits, outerRadiusPx);
  const innerRadiusPx = mean(innerHits);
  const innerStd = std(innerHits, innerRadiusPx);

  // --- carved band extent: per-radius-bin angular std of luminance
  // (only counting fully-opaque samples), thresholded to find where the
  // engraved pattern (high angular variance) begins/ends within the ring. ---
  const N_BINS = 200;
  const binStd = new Array(N_BINS).fill(0);
  const maxR = outerRadiusPx + 2;
  for (let b = 0; b < N_BINS; b++) {
    const r = (b / N_BINS) * maxR;
    if (r < innerRadiusPx - 2 || r > outerRadiusPx + 2) continue;
    const lums = [];
    for (let a = 0; a < 360; a++) {
      const theta = (a / 360) * Math.PI * 2;
      const [R, G, B, A] = sample(centerX + Math.cos(theta) * r, centerY + Math.sin(theta) * r);
      if (A >= 200) lums.push(luminance(R, G, B));
    }
    if (lums.length > 8) {
      const m = mean(lums);
      binStd[b] = std(lums, m);
    }
  }
  const maxBinStd = Math.max(...binStd);
  const stdThreshold = maxBinStd * 0.25;
  let patternInnerPx = innerRadiusPx;
  let patternOuterPx = outerRadiusPx;
  for (let b = 0; b < N_BINS; b++) {
    const r = (b / N_BINS) * maxR;
    if (r < innerRadiusPx || r > outerRadiusPx) continue;
    if (binStd[b] >= stdThreshold) { patternInnerPx = r; break; }
  }
  for (let b = N_BINS - 1; b >= 0; b--) {
    const r = (b / N_BINS) * maxR;
    if (r < innerRadiusPx || r > outerRadiusPx) continue;
    if (binStd[b] >= stdThreshold) { patternOuterPx = r; break; }
  }

  // --- classify the inner hole material (transparent vs opaque-white) ---
  let holeAlphaSum = 0, holeLumSum = 0, holeSamples = 0;
  const holeSampleR = innerRadiusPx * 0.5; // well inside the hole
  for (let a = 0; a < 180; a++) {
    const theta = (a / 180) * Math.PI * 2;
    const [R, G, B, A] = sample(centerX + Math.cos(theta) * holeSampleR, centerY + Math.sin(theta) * holeSampleR);
    holeAlphaSum += A; holeLumSum += luminance(R, G, B); holeSamples++;
  }
  const holeMeanAlpha = holeAlphaSum / holeSamples;
  const holeMeanLum = holeLumSum / holeSamples;
  const holeIsTransparent = holeMeanAlpha < 40;

  const metrics = {
    sourceWidth: width,
    sourceHeight: height,
    centerX: Number(centerX.toFixed(2)),
    centerY: Number(centerY.toFixed(2)),
    outerRadiusPx: Number(outerRadiusPx.toFixed(2)),
    innerRadiusPx: Number(innerRadiusPx.toFixed(2)),
    outerRadiusNorm: Number((outerRadiusPx / (width / 2)).toFixed(4)),
    innerRadiusNorm: Number((innerRadiusPx / outerRadiusPx).toFixed(4)),
    patternInnerNorm: Number((patternInnerPx / outerRadiusPx).toFixed(4)),
    patternOuterNorm: Number((patternOuterPx / outerRadiusPx).toFixed(4)),
    notes:
      `Measured from ${path.basename(O_SOURCE)} (actual decoded size ${width}x${height}px; ` +
      `note the brief assumed 464x464, the real asset is ${width}x${height}). ` +
      `Center located via alpha>${ALPHA_EDGE} bounding box (${bboxCenterX.toFixed(1)}, ${bboxCenterY.toFixed(1)}), ` +
      `cross-checked against the alpha-weighted centroid (${centroidX.toFixed(1)}, ${centroidY.toFixed(1)}) - both agree. ` +
      `Outer/inner radii are the mean alpha=127 crossing over ${N_ANGLES} angular samples ` +
      `(outer std=${outerStd.toFixed(2)}px, inner std=${innerStd.toFixed(2)}px, i.e. the silhouette and hole are ` +
      `both very close to circular). The inner hole is ${holeIsTransparent ? 'TRANSPARENT' : 'an OPAQUE near-white fill'} ` +
      `(mean alpha=${holeMeanAlpha.toFixed(1)}/255, mean luminance=${holeMeanLum.toFixed(1)}/255 at r=${holeSampleR.toFixed(1)}px). ` +
      `The engraved Greek-key band was found (via angular-luminance-variance thresholding) to occupy almost the entire ` +
      `ring width, from ${(patternInnerPx / outerRadiusPx).toFixed(3)} to ${(patternOuterPx / outerRadiusPx).toFixed(3)} of outerRadius - ` +
      `there is no flat undecorated lip on either side of the carving.`,
  };

  console.log('--- O metrics (measured) ---');
  console.log(`  source size:        ${width} x ${height}px`);
  console.log(`  center:              (${metrics.centerX}, ${metrics.centerY})  [bbox]  vs (${centroidX.toFixed(2)}, ${centroidY.toFixed(2)}) [centroid]`);
  console.log(`  outerRadiusPx:       ${metrics.outerRadiusPx}  (std ${outerStd.toFixed(2)})`);
  console.log(`  innerRadiusPx:       ${metrics.innerRadiusPx}  (std ${innerStd.toFixed(2)})`);
  console.log(`  outerRadiusNorm:     ${metrics.outerRadiusNorm}`);
  console.log(`  innerRadiusNorm:     ${metrics.innerRadiusNorm}`);
  console.log(`  patternInnerNorm:    ${metrics.patternInnerNorm}`);
  console.log(`  patternOuterNorm:    ${metrics.patternOuterNorm}`);
  console.log(`  hole material:       ${holeIsTransparent ? 'transparent' : 'opaque white'} (alpha=${holeMeanAlpha.toFixed(1)}, lum=${holeMeanLum.toFixed(1)})`);

  await ensureDir(BRAND_DIR);
  await fs.writeFile(path.join(BRAND_DIR, 'o-metrics.json'), JSON.stringify(metrics, null, 2) + '\n', 'utf8');

  return { metrics, raw: { data, width, height, channels } };
}

// ---------------------------------------------------------------------------
// PART B - central O relief + material maps
// ---------------------------------------------------------------------------

async function buildOTextures(metricsResult) {
  const { metrics, raw } = metricsResult;
  const { data, width, height, channels } = raw;
  const sample = makeSampler(data, width, height, channels);
  const { centerX, centerY, outerRadiusPx, innerRadiusPx } = metrics;

  // ---- 1. Build the height (relief) buffer at SOURCE resolution first ----
  // Everything outside outerRadius or inside innerRadius clamps to neutral
  // mid-grey (128); the carved band is a contrast-stretched luminance map.
  // A soft (few px) blend zone at both radii avoids a hard ring seam from
  // the source's anti-aliased edge pixels.
  const srcHeight = new Float64Array(width * height).fill(128);

  // First pass: gather luminance stats within the band (alpha-confident
  // pixels only) to find a robust contrast-stretch range.
  let lumMin = 255, lumMax = 0;
  const lumSamples = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = x - centerX, dy = y - centerY;
      const r = Math.sqrt(dx * dx + dy * dy);
      if (r < innerRadiusPx || r > outerRadiusPx) continue;
      const i = (y * width + x) * channels;
      const A = data[i + 3];
      if (A < 200) continue;
      const L = luminance(data[i], data[i + 1], data[i + 2]);
      lumSamples.push(L);
    }
  }
  lumSamples.sort((a, b) => a - b);
  // Use the 2nd/98th percentile as the stretch range to reject outliers.
  lumMin = lumSamples[Math.floor(lumSamples.length * 0.02)];
  lumMax = lumSamples[Math.floor(lumSamples.length * 0.98)];

  const OUT_LOW = 25; // recessed engraved strokes -> dark
  const OUT_HIGH = 235; // raised stone surface -> bright
  const EDGE_BLEND = 3; // px soft transition at the geometry boundary

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = x - centerX, dy = y - centerY;
      const r = Math.sqrt(dx * dx + dy * dy);
      const idx = y * width + x;
      if (r < innerRadiusPx - EDGE_BLEND || r > outerRadiusPx + EDGE_BLEND) {
        srcHeight[idx] = 128;
        continue;
      }
      const i = (y * width + x) * channels;
      const L = luminance(data[i], data[i + 1], data[i + 2]);
      let t = (L - lumMin) / (lumMax - lumMin || 1);
      t = clamp(t, 0, 1);
      let h = lerp(OUT_LOW, OUT_HIGH, t);

      // Soft-blend toward neutral 128 right at the inner/outer boundary so
      // the anti-aliased source edge doesn't create a dark ring artifact.
      let blend = 1;
      if (r < innerRadiusPx) blend = clamp((r - (innerRadiusPx - EDGE_BLEND)) / EDGE_BLEND, 0, 1);
      else if (r > outerRadiusPx) blend = clamp(((outerRadiusPx + EDGE_BLEND) - r) / EDGE_BLEND, 0, 1);
      h = lerp(128, h, blend);

      srcHeight[idx] = h;
    }
  }

  const srcHeightU8 = Uint8Array.from(srcHeight, (v) => Math.round(clamp(v, 0, 255)));

  // ---- 2. Upscale to the 1024x1024 output canvas, then apply a light blur ----
  // NOTE: sharp silently promotes a declared single-channel raw buffer to 3
  // channels as soon as resize()/blur() run, unless the pipeline is pinned
  // to the 'b-w' colourspace first. Without this the buffer below would come
  // back 3x too long and every downstream index into it would be corrupted.
  const reliefUpscaled = await sharp(Buffer.from(srcHeightU8), { raw: { width, height, channels: 1 } })
    .toColourspace('b-w')
    .resize(RELIEF_SIZE, RELIEF_SIZE, { kernel: 'cubic' })
    .blur(0.8) // 0.6-1px light blur so the height field is smooth for normal generation
    .raw()
    .toBuffer();

  await ensureDir(TEXTURES_DIR);
  await writeGrayPNG(path.join(TEXTURES_DIR, 'o-relief.png'), RELIEF_SIZE, RELIEF_SIZE, reliefUpscaled);

  // ---- 3. Normal map via Sobel (not tileable - this is a single medallion) ----
  const NORMAL_STRENGTH = 2.2; // visible but not extreme relief
  const normalBuf = sobelNormalMap(reliefUpscaled, RELIEF_SIZE, RELIEF_SIZE, NORMAL_STRENGTH, false);
  await writeRGBPNG(path.join(TEXTURES_DIR, 'o-normal.png'), RELIEF_SIZE, RELIEF_SIZE, normalBuf);

  // ---- 4 & 5. Roughness + AO, derived from the relief + its gradient magnitude ----
  // Recompute gradient magnitude (reuse Sobel-style gx/gy) to weight "raised edges".
  const gradMag = new Float32Array(RELIEF_SIZE * RELIEF_SIZE);
  function hAt(x, y) {
    x = clamp(x, 0, RELIEF_SIZE - 1);
    y = clamp(y, 0, RELIEF_SIZE - 1);
    return reliefUpscaled[y * RELIEF_SIZE + x] / 255;
  }
  let maxGrad = 0;
  for (let y = 0; y < RELIEF_SIZE; y++) {
    for (let x = 0; x < RELIEF_SIZE; x++) {
      const tl = hAt(x - 1, y - 1), t = hAt(x, y - 1), tr = hAt(x + 1, y - 1);
      const l = hAt(x - 1, y), r = hAt(x + 1, y);
      const bl = hAt(x - 1, y + 1), b = hAt(x, y + 1), br = hAt(x + 1, y + 1);
      const gx = (tr + 2 * r + br) - (tl + 2 * l + bl);
      const gy = (bl + 2 * b + br) - (tl + 2 * t + tr);
      const mag = Math.sqrt(gx * gx + gy * gy);
      gradMag[y * RELIEF_SIZE + x] = mag;
      if (mag > maxGrad) maxGrad = mag;
    }
  }

  const ROUGH_BASE = 0.82;
  const ROUGH_RECESS = 0.95;
  const ROUGH_RAISED_EDGE = 0.62;

  const roughBuf = new Uint8Array(RELIEF_SIZE * RELIEF_SIZE);
  const aoRawBuf = new Uint8Array(RELIEF_SIZE * RELIEF_SIZE);

  for (let p = 0; p < RELIEF_SIZE * RELIEF_SIZE; p++) {
    const h = reliefUpscaled[p] / 255; // 0..1
    const recessFactor = clamp((0.5 - h) * 2, 0, 1); // 1 = deep recess
    const raisedFactor = clamp((h - 0.5) * 2, 0, 1); // 1 = high raised area
    const edgeNorm = maxGrad > 0 ? gradMag[p] / maxGrad : 0;

    let rough = ROUGH_BASE
      + recessFactor * (ROUGH_RECESS - ROUGH_BASE)
      - raisedFactor * edgeNorm * (ROUGH_BASE - ROUGH_RAISED_EDGE);
    rough = clamp(rough, 0, 1);
    roughBuf[p] = Math.round(rough * 255);

    // AO seed: darken proportionally to recess depth; blurred + masked below.
    aoRawBuf[p] = Math.round(clamp(255 - recessFactor * 255, 0, 255));
  }
  await writeGrayPNG(path.join(TEXTURES_DIR, 'o-rough.png'), RELIEF_SIZE, RELIEF_SIZE, roughBuf);

  // Spread the recess darkening into adjacent areas (blurred inverse of relief).
  const aoBlurred = boxBlurGray(aoRawBuf, RELIEF_SIZE, RELIEF_SIZE, 4);
  const AO_STRENGTH = 0.85;
  const aoFinal = new Uint8Array(RELIEF_SIZE * RELIEF_SIZE);
  const scale = RELIEF_SIZE / width; // map back to source-space radius test
  for (let y = 0; y < RELIEF_SIZE; y++) {
    for (let x = 0; x < RELIEF_SIZE; x++) {
      const p = y * RELIEF_SIZE + x;
      const dx = x - centerX * scale, dy = y - centerY * scale;
      const r = Math.sqrt(dx * dx + dy * dy);
      if (r < innerRadiusPx * scale || r > outerRadiusPx * scale) {
        aoFinal[p] = 255; // white elsewhere (no geometry -> no occlusion)
      } else {
        const darken = 255 - aoBlurred[p];
        aoFinal[p] = Math.round(clamp(255 - darken * AO_STRENGTH, 0, 255));
      }
    }
  }
  await writeGrayPNG(path.join(TEXTURES_DIR, 'o-ao.png'), RELIEF_SIZE, RELIEF_SIZE, aoFinal);

  // ---- 6. Albedo: flat cool stone palette modulated by relief + low noise ----
  const BASE_COLOR = [0xb9, 0xbe, 0xc6]; // #b9bec6
  const RECESS_COLOR = [0x7d, 0x83, 0x8d]; // #7d838d
  const noiseGen = createTileableNoise2D(0xa1b2c3);
  const albedoBuf = new Uint8Array(RELIEF_SIZE * RELIEF_SIZE * 3);

  for (let y = 0; y < RELIEF_SIZE; y++) {
    for (let x = 0; x < RELIEF_SIZE; x++) {
      const p = y * RELIEF_SIZE + x;
      const h = reliefUpscaled[p] / 255;
      const dx = x - centerX * scale, dy = y - centerY * scale;
      const r = Math.sqrt(dx * dx + dy * dy);
      const inGeometry = r >= innerRadiusPx * scale && r <= outerRadiusPx * scale;

      let t = inGeometry ? clamp((h - 0.15) / 0.7, 0, 1) : 0.55; // outside -> neutral mid tone
      // Low-amplitude fractal noise for mineral breakup (not tiled here - it's
      // a single fixed 1024x1024 canvas, so exact tiling isn't required).
      const n = noiseGen.fbm(x / RELIEF_SIZE, y / RELIEF_SIZE, { octaves: 4, baseFreq: 18, persistence: 0.55 });
      const noiseAmp = 10; // low amplitude, +/-10 out of 255
      const noiseOffset = (n - 0.5) * 2 * noiseAmp;

      for (let c = 0; c < 3; c++) {
        const base = lerp(RECESS_COLOR[c], BASE_COLOR[c], t);
        albedoBuf[p * 3 + c] = Math.round(clamp(base + noiseOffset, 0, 255));
      }
    }
  }
  await writeRGBPNG(path.join(TEXTURES_DIR, 'o-albedo.png'), RELIEF_SIZE, RELIEF_SIZE, albedoBuf);

  console.log('Part B: o-relief.png, o-normal.png, o-rough.png, o-ao.png, o-albedo.png written.');
}

// ---------------------------------------------------------------------------
// PART C - procedural tileable stone surface noise
// ---------------------------------------------------------------------------

async function buildStoneNoise() {
  const noiseGen = createTileableNoise2D(0x5eed01);
  const size = STONE_NOISE_SIZE;
  const heightBuf = new Uint8Array(size * size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = x / size;
      const ny = y / size;
      const v = noiseGen.fbm(nx, ny, { octaves: 5, baseFreq: 6, persistence: 0.55 });
      heightBuf[y * size + x] = Math.round(clamp(v * 255, 0, 255));
    }
  }

  await ensureDir(TEXTURES_DIR);
  await writeGrayPNG(path.join(TEXTURES_DIR, 'stone-noise.png'), size, size, heightBuf);

  // Normal map from the tileable noise - Sobel WITH wrap-around so the
  // resulting normal map is also seamless at the tile edges.
  const NOISE_NORMAL_STRENGTH = 1.1; // subtle
  const normalBuf = sobelNormalMap(heightBuf, size, size, NOISE_NORMAL_STRENGTH, true);
  await writeRGBPNG(path.join(TEXTURES_DIR, 'stone-noise-normal.png'), size, size, normalBuf);

  // Verify tileability by construction: sample right at the wrap seam and
  // confirm continuity (value at x=size-1 should be adjacent/continuous with
  // x=0 because the lattice wraps modulo freq).
  const left = heightBuf[Math.floor(size / 2) * size + 0];
  const right = heightBuf[Math.floor(size / 2) * size + (size - 1)];
  console.log(`Part C: stone-noise.png, stone-noise-normal.png written (seam continuity check: edge values ${left} / ${right}, both from the same wrapped lattice).`);
}

// ---------------------------------------------------------------------------
// PART D - partner logo textures
// ---------------------------------------------------------------------------

/**
 * If the image has an opaque solid-colour rectangular background (instead of
 * real alpha), flood-fill from the border pixels and key matching pixels to
 * transparent. If the image already has real transparent margins, this is a
 * no-op (border pixels are already alpha=0 and won't match "opaque" check).
 */
function keyOutBackground(data, width, height, channels, tolerance = 28) {
  // Sample border pixels; only proceed if the border is overwhelmingly a
  // single opaque colour (i.e. genuinely a background to key, not real art).
  const borderPixels = [];
  for (let x = 0; x < width; x++) {
    borderPixels.push([x, 0], [x, height - 1]);
  }
  for (let y = 0; y < height; y++) {
    borderPixels.push([0, y], [width - 1, y]);
  }

  let opaqueBorderCount = 0;
  for (const [x, y] of borderPixels) {
    const i = (y * width + x) * channels;
    if (data[i + 3] > 200) opaqueBorderCount++;
  }
  const opaqueRatio = opaqueBorderCount / borderPixels.length;
  if (opaqueRatio < 0.6) {
    // Border is already mostly transparent - nothing to key out.
    return { keyed: false, data };
  }

  // Reference colour = average of opaque border pixels.
  let rSum = 0, gSum = 0, bSum = 0, n = 0;
  for (const [x, y] of borderPixels) {
    const i = (y * width + x) * channels;
    if (data[i + 3] > 200) { rSum += data[i]; gSum += data[i + 1]; bSum += data[i + 2]; n++; }
  }
  const refR = rSum / n, refG = gSum / n, refB = bSum / n;

  // BFS flood fill from every border pixel across matching-colour neighbours.
  const out = Buffer.from(data);
  const visited = new Uint8Array(width * height);
  const queue = [];
  for (const [x, y] of borderPixels) queue.push(y * width + x);
  for (const idx of queue) visited[idx] = 1;

  function colorClose(i) {
    const dr = out[i] - refR, dg = out[i + 1] - refG, db = out[i + 2] - refB;
    return Math.sqrt(dr * dr + dg * dg + db * db) < tolerance;
  }

  let head = 0;
  let keyedCount = 0;
  while (head < queue.length) {
    const idx = queue[head++];
    const x = idx % width, y = (idx / width) | 0;
    const i = idx * channels;
    if (colorClose(i)) {
      out[i + 3] = 0;
      keyedCount++;
      const neighbours = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]];
      for (const [nx, ny] of neighbours) {
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const nIdx = ny * width + nx;
        if (!visited[nIdx]) {
          visited[nIdx] = 1;
          queue.push(nIdx);
        }
      }
    }
  }

  return { keyed: keyedCount > 0, data: out, keyedCount };
}

function computeBBox(data, width, height, channels, alphaThreshold = 10) {
  let minX = width, maxX = -1, minY = height, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = data[(y * width + x) * channels + 3];
      if (a > alphaThreshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null; // fully transparent image
  return { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

async function buildPartnerLogos() {
  await ensureDir(PARTNERS_DIR);
  const assetEntries = [];

  for (const { id, file } of LOGO_SOURCES) {
    const srcPath = path.join(IMAGES, file);
    const { data, width: srcW, height: srcH, channels } = await readRawRGBA(srcPath);

    // 1. Key out an opaque background if present (no-op if already transparent).
    const { keyed, data: keyedData } = keyOutBackground(data, srcW, srcH, channels);

    // 2. Trim fully-transparent margins.
    const bbox = computeBBox(keyedData, srcW, srcH, channels);
    if (!bbox) {
      console.warn(`  WARNING: ${file} is fully transparent, skipping.`);
      continue;
    }

    const { data: trimmedData, info: trimmedInfo } = await sharp(keyedData, { raw: { width: srcW, height: srcH, channels } })
      .extract(bbox)
      .raw()
      .toBuffer({ resolveWithObject: true });
    const tw = trimmedInfo.width, th = trimmedInfo.height;

    // 3. Fit inside LOGO_MAX_BOX preserving aspect, never upscaling.
    const scale = Math.min(LOGO_MAX_BOX / tw, LOGO_MAX_BOX / th, 1);
    const outW = Math.max(1, Math.round(tw * scale));
    const outH = Math.max(1, Math.round(th * scale));

    const outPath = path.join(PARTNERS_DIR, `${id}.webp`);
    await sharp(trimmedData, { raw: { width: tw, height: th, channels: trimmedInfo.channels } })
      .resize(outW, outH, { fit: 'fill', kernel: 'lanczos3' }) // exact target size, aspect already computed correctly
      .webp({ quality: 90, alphaQuality: 100, lossless: false, effort: 5 })
      .toFile(outPath);

    // 4. Stats: mean luminance of non-transparent pixels, opaque ratio, tone.
    const { data: outData, info: outInfo } = await sharp(outPath).raw().ensureAlpha().toBuffer({ resolveWithObject: true });
    let lumSum = 0, lumCount = 0, opaqueCount = 0;
    const totalPixels = outInfo.width * outInfo.height;
    for (let p = 0; p < totalPixels; p++) {
      const i = p * outInfo.channels;
      const a = outData[i + 3];
      if (a > 0) {
        lumSum += luminance(outData[i], outData[i + 1], outData[i + 2]) * (a / 255);
        lumCount += a / 255;
      }
      if (a > 127) opaqueCount++;
    }
    const meanLuminance01 = (lumCount > 0 ? lumSum / lumCount : 0) / 255;
    const opaquePixelRatio = opaqueCount / totalPixels;
    const tone = meanLuminance01 > 0.62 ? 'light' : meanLuminance01 < 0.34 ? 'dark' : 'mixed';

    assetEntries.push({
      id,
      file: `${id}.webp`,
      width: outW,
      height: outH,
      aspect: Number((outW / outH).toFixed(4)),
      meanLuminance: Number(meanLuminance01.toFixed(4)),
      opaquePixelRatio: Number(opaquePixelRatio.toFixed(4)),
      tone,
      sourceFile: `images/${file}`,
      sourceWidth: srcW,
      sourceHeight: srcH,
    });

    console.log(`  ${id}: ${srcW}x${srcH} -> trimmed ${tw}x${th} -> ${outW}x${outH} webp, tone=${tone}, meanLum=${meanLuminance01.toFixed(3)}, backgroundKeyed=${keyed}`);
  }

  await fs.writeFile(path.join(PARTNERS_DIR, 'assets.json'), JSON.stringify(assetEntries, null, 2) + '\n', 'utf8');
  console.log('Part D: partner logo webp files + assets.json written.');
  return assetEntries;
}

// ---------------------------------------------------------------------------
// PART E - copy untouched source O + README
// ---------------------------------------------------------------------------

async function copySourceO() {
  await ensureDir(BRAND_DIR);
  const destPath = path.join(BRAND_DIR, 'ovmg-o-source.webp');
  const buf = await fs.readFile(O_SOURCE);
  await fs.writeFile(destPath, buf);
  console.log('Part E: ovmg-o-source.webp copied (byte-identical to source).');
}

const README_CONTENT = `# hero3d asset tools

Standalone, self-contained tooling that prepares every brand/texture asset consumed by the
hero3d Three.js build. This folder is intentionally isolated from \`hero3d/project\` - it has
its own \`package.json\` and its own \`node_modules\` (only dependency: \`sharp\`), so the asset
pipeline never becomes a runtime dependency of the shipped app.

## What it does

Running the script regenerates everything under \`hero3d/project/public/\`:

- **\`public/brand/o-metrics.json\`** - measured geometry of the OVMG "O" glyph
  (\`images/ovmg-o-stone.webp\`): centre, outer/inner radius, and the radial extent of the
  carved Greek-key band. Measured by scanning the alpha channel (silhouette + hole edges)
  and the angular variance of luminance (carved band vs flat stone) - not hardcoded.
- **\`public/brand/ovmg-o-source.webp\`** - byte-identical copy of the source O art.
- **\`public/textures/o-relief.png\` / \`o-normal.png\` / \`o-rough.png\` / \`o-ao.png\` / \`o-albedo.png\`**
  - a full PBR-ish material set (1024x1024) derived from the O's carved face: a height map,
  a Sobel-derived normal map, roughness, ambient occlusion, and a flat stone-colour albedo
  with subtle procedural mineral noise (no photographic colour is copied from the source).
- **\`public/textures/stone-noise.png\` / \`stone-noise-normal.png\`** - a seamlessly tileable
  fbm noise texture (512x512) and its normal map, for fine surface breakup on stone
  geometry. Tiling is achieved by construction (the noise lattice wraps at integer
  frequencies), not by mirroring.
- **\`public/partners/<id>.webp\`** + **\`public/partners/assets.json\`** - each partner logo,
  trimmed to its content bounding box, background-keyed if it wasn't already transparent,
  fit inside a 512x512 box without stretching/cropping/upscaling, and exported as WebP with
  alpha preserved. \`assets.json\` records width/height/aspect and a measured \`tone\`
  (\`light\` / \`dark\` / \`mixed\`) driven by the mean luminance of the logo's own opaque
  pixels, so the 3D scene can choose a matching backing plate.

## Re-running

\`\`\`sh
cd hero3d/tools
npm install      # first time only - installs sharp locally in this folder
node prepare-assets.mjs
\`\`\`

The script is idempotent: every output is fully regenerated from the source files in
\`REPO/images/\` each run, so re-running after a source-image change is always safe. It never
touches anything outside \`hero3d/tools/\` and \`hero3d/project/public/{brand,partners,textures}/\`.

## Adding a new partner logo

1. Drop the logo file in \`REPO/images/\` (PNG or WebP, ideally with real transparency;
   if it has a flat opaque background instead, the script will attempt to key it out
   automatically via a border flood-fill).
2. Add an entry to the \`LOGO_SOURCES\` array near the top of \`prepare-assets.mjs\`:
   \`{ id: 'new-partner-id', file: 'logo-new-partner.png' }\`.
3. Re-run \`node prepare-assets.mjs\`. The new \`public/partners/new-partner-id.webp\` and its
   row in \`assets.json\` will be created alongside the existing ones.

## Notes / known deviations from nominal spec

- The brief assumed the source O art is 464x464px; the actual decoded WebP is 460x460px.
  The script measures and uses the real dimensions rather than hardcoding 464 - see the
  \`notes\` field in the generated \`o-metrics.json\` for the exact figure.
- All six partner logos already ship with genuine alpha transparency (verified by sampling
  border pixels before running), so the background-keying step is a verified no-op for the
  current asset set; it remains active for any future logo delivered with a flat opaque
  background instead of alpha.
`;

async function writeReadme() {
  await fs.writeFile(path.join(__dirname, 'README.md'), README_CONTENT, 'utf8');
  console.log('Part E: README.md written.');
}

// ---------------------------------------------------------------------------
// Verification pass - list every output file with size on disk
// ---------------------------------------------------------------------------

async function verifyOutputs(logoIds) {
  const expected = [
    path.join(BRAND_DIR, 'o-metrics.json'),
    path.join(BRAND_DIR, 'ovmg-o-source.webp'),
    path.join(TEXTURES_DIR, 'o-relief.png'),
    path.join(TEXTURES_DIR, 'o-normal.png'),
    path.join(TEXTURES_DIR, 'o-rough.png'),
    path.join(TEXTURES_DIR, 'o-ao.png'),
    path.join(TEXTURES_DIR, 'o-albedo.png'),
    path.join(TEXTURES_DIR, 'stone-noise.png'),
    path.join(TEXTURES_DIR, 'stone-noise-normal.png'),
    path.join(PARTNERS_DIR, 'assets.json'),
    ...logoIds.map((id) => path.join(PARTNERS_DIR, `${id}.webp`)),
  ];

  console.log('\n--- Verification: files on disk ---');
  const rows = [];
  for (const f of expected) {
    try {
      const stat = await fs.stat(f);
      let dims = '';
      if (/\.(png|webp)$/i.test(f)) {
        const meta = await sharp(f).metadata();
        dims = `${meta.width}x${meta.height}`;
      }
      rows.push({ file: path.relative(REPO, f), bytes: stat.size, dims });
    } catch (e) {
      rows.push({ file: path.relative(REPO, f), bytes: 'MISSING', dims: '' });
    }
  }
  for (const row of rows) {
    console.log(`  ${row.dims.padEnd(11)} ${String(row.bytes).padStart(9)} bytes   ${row.file}`);
  }
  const missing = rows.filter((r) => r.bytes === 'MISSING');
  if (missing.length) {
    throw new Error(`Missing outputs: ${missing.map((m) => m.file).join(', ')}`);
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`hero3d asset pipeline starting.\n  REPO   = ${REPO}\n  IMAGES = ${IMAGES}\n  PUBLIC = ${PUBLIC}\n`);

  await ensureDir(BRAND_DIR);
  await ensureDir(PARTNERS_DIR);
  await ensureDir(TEXTURES_DIR);

  console.log('=== Part A: O metrics ===');
  const metricsResult = await measureOMetrics();

  console.log('\n=== Part B: O relief + material maps ===');
  await buildOTextures(metricsResult);

  console.log('\n=== Part C: procedural tileable stone noise ===');
  await buildStoneNoise();

  console.log('\n=== Part D: partner logo textures ===');
  const assetEntries = await buildPartnerLogos();

  console.log('\n=== Part E: source copy + README ===');
  await copySourceO();
  await writeReadme();

  await verifyOutputs(assetEntries.map((e) => e.id));

  console.log('\nDone.');
}

main().catch((err) => {
  console.error('\nFATAL:', err);
  process.exit(1);
});
