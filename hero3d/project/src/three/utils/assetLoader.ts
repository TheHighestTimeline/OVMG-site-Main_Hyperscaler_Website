/**
 * assetLoader.ts — asset URL resolution plus a texture loader that degrades
 * gracefully. A missing partner logo must never take the hero down: the entry
 * is reported (loudly in dev, quietly in production) and the medallion falls
 * back to a neutral plate.
 */

import * as THREE from 'three';

const ASSET_BASE_MODE: string = typeof __HERO_ASSET_BASE__ !== 'undefined' ? __HERO_ASSET_BASE__ : '';

/** Resolves a public-folder path for whichever build is running. */
export function assetUrl(path: string): string {
  const clean = path.replace(/^\/+/, '');
  if (ASSET_BASE_MODE === '@module') {
    return new URL(clean, import.meta.url).href;
  }
  return ASSET_BASE_MODE + clean;
}

export interface AssetIssue {
  path: string;
  kind: 'texture';
  message: string;
}

const issues: AssetIssue[] = [];

export function reportAssetIssue(issue: AssetIssue): void {
  issues.push(issue);
  if (import.meta.env.DEV) {
    console.error(`[ovmg-hero] missing asset: ${issue.path} — ${issue.message}`);
  } else {
    console.warn(`[ovmg-hero] asset unavailable: ${issue.path}`);
  }
}

export function getAssetIssues(): AssetIssue[] {
  return issues.slice();
}

const textureCache = new Map<string, THREE.Texture>();
const loader = new THREE.TextureLoader();

export interface TextureOptions {
  colorSpace?: THREE.ColorSpace;
  anisotropy?: number;
  wrap?: THREE.Wrapping;
  flipY?: boolean;
  /** Set false for data maps (normal / roughness / ao / displacement). */
  srgb?: boolean;
}

/**
 * Loads a texture, resolving to `null` rather than rejecting when the file is
 * absent, so a broken manifest entry degrades to a blank medallion.
 */
export function loadTexture(path: string, options: TextureOptions = {}): Promise<THREE.Texture | null> {
  const url = assetUrl(path);
  const cached = textureCache.get(url);
  if (cached) return Promise.resolve(cached);

  return new Promise((resolve) => {
    loader.load(
      url,
      (texture) => {
        texture.colorSpace = options.srgb === false ? THREE.NoColorSpace : (options.colorSpace ?? THREE.SRGBColorSpace);
        texture.anisotropy = options.anisotropy ?? 4;
        texture.wrapS = options.wrap ?? THREE.ClampToEdgeWrapping;
        texture.wrapT = options.wrap ?? THREE.ClampToEdgeWrapping;
        if (options.flipY !== undefined) texture.flipY = options.flipY;
        texture.generateMipmaps = true;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.needsUpdate = true;
        textureCache.set(url, texture);
        resolve(texture);
      },
      undefined,
      () => {
        reportAssetIssue({ path, kind: 'texture', message: 'failed to load' });
        resolve(null);
      },
    );
  });
}

/** Loads a JSON side-car, resolving to `null` on any failure. */
export async function loadJson<T>(path: string): Promise<T | null> {
  try {
    const response = await fetch(assetUrl(path));
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return (await response.json()) as T;
  } catch (error) {
    reportAssetIssue({ path, kind: 'texture', message: String(error) });
    return null;
  }
}

/** Disposes everything the loader has cached. Called on hero unmount. */
export function disposeTextureCache(): void {
  for (const texture of textureCache.values()) texture.dispose();
  textureCache.clear();
  issues.length = 0;
}
