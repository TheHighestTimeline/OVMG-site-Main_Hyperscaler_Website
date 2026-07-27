/** GLB export for the four assets, generated from the same source builders. */
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { createBaseWorld } from '../assets/createBaseWorld';
import { createMarket } from '../assets/createMarket';
import { createCommunityCenter } from '../assets/createCommunityCenter';
import { createStreetLamp } from '../assets/createStreetLamp';

const builders: Record<string, () => THREE.Group> = {
  'base-world': createBaseWorld,
  'market': createMarket,
  'community-center': createCommunityCenter,
  'street-lamp': createStreetLamp,
};

export async function exportAsset(name: keyof typeof builders): Promise<ArrayBuffer> {
  const group = builders[name]();
  const exporter = new GLTFExporter();
  return new Promise((resolve, reject) => {
    exporter.parse(
      group,
      (result) => resolve(result as ArrayBuffer),
      (err) => reject(err),
      { binary: true },
    );
  });
}

/** Export all four; when download=true trigger browser downloads, else return buffers. */
export async function exportAllAssets(download = false): Promise<Record<string, ArrayBuffer>> {
  const out: Record<string, ArrayBuffer> = {};
  for (const name of Object.keys(builders)) {
    const buf = await exportAsset(name as keyof typeof builders);
    out[name] = buf;
    if (download) {
      const blob = new Blob([buf], { type: 'model/gltf-binary' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${name}.glb`;
      a.click();
    }
  }
  return out;
}
