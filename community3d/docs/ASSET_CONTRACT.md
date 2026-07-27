# Asset Contract
Every asset: THREE.Group, local origin at bottom-center of ground footprint, local Y0 = contact surface, no baked scene placement, shared MaterialLibrary (materials.ts), predictable object names (BaseWorld/Market/CommunityCenter/StreetLamp hierarchies per spec).
Footprints: market 2.5×1.9×~2.25; community center 4.0×2.75×~3.35 (+entrance/steps toward -Z); lamp ~0.55×0.55×3.1 (head faces -Z; ground pools live in the SCENE, not the asset, so lifts never carry them).
Deliverables per asset: builder module (src/assets/create*.ts) + GLB exported from the same source (public/models/*.glb) with dimension/pivot parity enforced by validateExportedAssets.ts.
Placement comes ONLY from src/sceneLayout.ts.
