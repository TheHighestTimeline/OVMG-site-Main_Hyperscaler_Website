/**
 * heroMaterials.ts — the shared material library.
 *
 * Everything that can be shared is shared. Per-instance variation is expressed
 * through transforms and a small number of cloned materials where a per-partner
 * value genuinely differs (backing opacity, depth dimming, the logo map).
 * Nothing here is created inside a render loop.
 */

import * as THREE from 'three';
import { PALETTE, type RingConfig } from '../../hero/heroConfig';

export interface MedallionMaterialSet {
  /** Group 0 of the extruded plaque: the smoked-glass face. */
  plate: THREE.MeshPhysicalMaterial;
  /** Frosted variant for marks drawn in dark ink. */
  plateLight: THREE.MeshPhysicalMaterial;
  /** Group 1: the bevelled machined edge. */
  edge: THREE.MeshStandardMaterial;
  dispose(): void;
}

/**
 * Carrier materials.
 *
 * The plates are OPAQUE on purpose. A semi-transparent carrier looked like
 * smoked glass in isolation, but in motion it produced double exposure: a mark
 * crossing in front of another showed the one behind straight through it, and
 * because transparent objects are sorted by object centre rather than depth
 * tested, orbit filaments drew across the logos. Opaque plates write depth, so
 * every crossing resolves to an unambiguous front and back and the rings are
 * occluded correctly. The glass read now comes from clearcoat and the
 * environment map rather than from see-through alpha.
 *
 * They are also deliberately quieter than they want to be: the central mark is
 * the brand, and a carrier that out-shines it inverts the hierarchy.
 */
export function createMedallionMaterials(): MedallionMaterialSet {
  // Smoked glass: dark and reflective, never a flat black puck.
  const plate = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#0a1220'),
    roughness: 0.17,
    metalness: 0.24,
    clearcoat: 1,
    clearcoatRoughness: 0.12,
    transparent: false,
    depthWrite: true,
    envMapIntensity: 1.6,
    side: THREE.DoubleSide,
  });

  // Frosted glass, for dark-ink marks that cannot resolve on a smoked plate.
  const plateLight = new THREE.MeshPhysicalMaterial({
    // Held just under the bloom threshold: a frosted plate that blooms turns
    // into a glowing lozenge and takes the eye off the mark.
    color: new THREE.Color('#a7b3c3'),
    roughness: 0.42,
    metalness: 0.08,
    clearcoat: 0.85,
    clearcoatRoughness: 0.22,
    transparent: false,
    depthWrite: true,
    envMapIntensity: 0.5,
    side: THREE.DoubleSide,
  });

  const edge = new THREE.MeshStandardMaterial({
    color: new THREE.Color(PALETTE.silver).multiplyScalar(0.5),
    roughness: 0.3,
    metalness: 0.94,
    envMapIntensity: 1.15,
  });

  return {
    plate,
    plateLight,
    edge,
    dispose() {
      plate.dispose();
      plateLight.dispose();
      edge.dispose();
    },
  };
}

export interface LogoHaloMaterial extends THREE.ShaderMaterial {
  setMap(map: THREE.Texture | null): void;
  setStrength(strength: number): void;
}

/**
 * A halo that follows the artwork's own outline.
 *
 * Marks drawn in dark ink — Energy Storage Solutions' dark green and black
 * type, for one — vanish against a dark field, and partner
 * trademarks may never be recoloured. The obvious fix is a plate behind them,
 * but a plate is exactly the "bubble" this design is trying to avoid, and a
 * soft radial glow is just a blurrier bubble: it still reads as an oval.
 *
 * So this dilates the logo's own alpha channel instead — twelve taps on two
 * rings, keeping the maximum — and emits a flat light colour through it. The
 * result hugs the letterforms like a text stroke. There is no disc, no oval
 * and no edge anywhere: where the artwork has no ink, there is nothing.
 */
export function createLogoHaloMaterial(): LogoHaloMaterial {
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    uniforms: {
      uMap: { value: null as THREE.Texture | null },
      uColor: { value: new THREE.Color('#e2ecfa') },
      uStrength: { value: 0 },
      uSpread: { value: 0.016 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      precision mediump float;
      uniform sampler2D uMap;
      uniform vec3 uColor;
      uniform float uStrength;
      uniform float uSpread;
      varying vec2 vUv;

      const vec2 DIRS[6] = vec2[6](
        vec2(1.0, 0.0), vec2(0.5, 0.866), vec2(-0.5, 0.866),
        vec2(-1.0, 0.0), vec2(-0.5, -0.866), vec2(0.5, -0.866)
      );

      void main() {
        if (uStrength <= 0.001) discard;
        float alpha = texture2D(uMap, vUv).a;
        // Dilate on two rings so the outline is even around every letterform.
        for (int i = 0; i < 6; i += 1) {
          alpha = max(alpha, texture2D(uMap, vUv + DIRS[i] * uSpread).a);
          alpha = max(alpha, texture2D(uMap, vUv + DIRS[i] * uSpread * 2.0).a);
        }
        float a = alpha * uStrength;
        if (a <= 0.004) discard;
        gl_FragColor = vec4(uColor, a);
      }
    `,
  }) as LogoHaloMaterial;

  material.setMap = (map) => {
    material.uniforms.uMap.value = map;
    material.needsUpdate = true;
  };
  material.setStrength = (strength) => {
    material.uniforms.uStrength.value = strength;
  };

  return material;
}

/**
 * Logo material. alphaTest keeps the logo writing depth, which is what makes
 * occlusion against the central O correct without any manual sorting.
 */
export function createLogoMaterial(map: THREE.Texture | null, emissiveIntensity: number): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    map: map ?? undefined,
    transparent: true,
    alphaTest: 0.14,
    depthWrite: true,
    roughness: 0.44,
    metalness: 0,
    side: THREE.FrontSide,
    envMapIntensity: 0.6,
    emissive: new THREE.Color('#dce8ff'),
    emissiveMap: map ?? undefined,
    emissiveIntensity,
    toneMapped: true,
  });
  material.needsUpdate = true;
  return material;
}

/**
 * Orbital ring material: a thin light-catching path. Metallic rather than
 * emissive so it reads as a machined filament picking up the key light, with
 * only a whisper of self-illumination so the far side stays legible.
 */
export interface RingMaterial extends THREE.MeshStandardMaterial {
  /** Updated per frame so the far half of each orbit recedes. */
  depthUniforms: { uNear: { value: number }; uFar: { value: number }; uBackAlpha: { value: number } };
}

export function createRingMaterial(ring: RingConfig): RingMaterial {
  const color = new THREE.Color(ring.color);
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.26,
    metalness: 0.95,
    transparent: true,
    opacity: ring.opacity,
    emissive: color.clone().multiplyScalar(0.5),
    emissiveIntensity: 0.14 + ring.emphasis * 0.18,
    envMapIntensity: 1.6,
    // Writing depth is what stops a filament drawing across a medallion that
    // happens to sort behind the system centre.
    depthWrite: true,
    side: THREE.FrontSide,
  }) as RingMaterial;

  // The half of an orbit travelling away from the camera must read fainter
  // than the half coming toward it. Without this every ring is a uniform
  // hairline and the set collapses into flat wireframe ellipses.
  const depthUniforms = {
    uNear: { value: 6 },
    uFar: { value: 16 },
    uBackAlpha: { value: 0.22 + ring.emphasis * 0.12 },
  };
  material.depthUniforms = depthUniforms;

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uNear = depthUniforms.uNear;
    shader.uniforms.uFar = depthUniforms.uFar;
    shader.uniforms.uBackAlpha = depthUniforms.uBackAlpha;

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vRingViewZ;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvRingViewZ = -mvPosition.z;');

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying float vRingViewZ;\nuniform float uNear;\nuniform float uFar;\nuniform float uBackAlpha;',
      )
      .replace(
        '#include <dithering_fragment>',
        '#include <dithering_fragment>\n  float ringDepth = smoothstep(uFar, uNear, vRingViewZ);\n  gl_FragColor.a *= mix(uBackAlpha, 1.0, ringDepth);',
      );
  };
  material.customProgramCacheKey = () => `ring-depth-${ring.id}`;

  return material;
}

/** Applies one environment map to every material that benefits from it. */
export function applyEnvironment(materials: THREE.Material[], envMap: THREE.Texture): void {
  for (const material of materials) {
    if (material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshPhysicalMaterial) {
      material.envMap = envMap;
      material.needsUpdate = true;
    }
  }
}
