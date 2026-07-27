import * as THREE from 'three';
export function worldBox(obj: THREE.Object3D): THREE.Box3 {
  obj.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(obj);
}
export function boxSize(b: THREE.Box3): THREE.Vector3 { return b.getSize(new THREE.Vector3()); }
export function boxCenter(b: THREE.Box3): THREE.Vector3 { return b.getCenter(new THREE.Vector3()); }
