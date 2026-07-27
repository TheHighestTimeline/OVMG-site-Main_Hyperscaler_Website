/** Development asset viewer — previews individual procedural assets (or the
 *  assembled scene) on a neutral dark canvas with debug toggles.
 *  Route: /asset-viewer or ?viewer. Asset preselect: ?asset=market etc. */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useThree } from '@react-three/fiber';
import { CAMERA, LIGHTING } from '../scene/sceneLayout';
import { exportAllAssets } from '../three/export/exportAssets';
import {
  ASSET_NAMES,
  VIEWER_BUILDERS,
  isViewerAssetName,
  type ViewerAssetName,
} from './viewerAssets';
import './viewer.css';

const PREVIEW_BG = '#1a1e26';
const ACCENT = '#4fd8ff';

/** Isometric view direction taken from the production CAMERA config. */
const VIEW_DIR = new THREE.Vector3(
  CAMERA.desktop.position.x - CAMERA.desktop.target.x,
  CAMERA.desktop.position.y - CAMERA.desktop.target.y,
  CAMERA.desktop.position.z - CAMERA.desktop.target.z,
).normalize();

interface GlRefs {
  gl: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.Camera;
}

/** Positions the default camera along the production view direction, framed to the box. */
function AutoFrame({ box }: { box: THREE.Box3 }) {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  useLayoutEffect(() => {
    if (!(camera instanceof THREE.PerspectiveCamera)) return;
    const center = box.getCenter(new THREE.Vector3());
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const radius = Math.max(sphere.radius, 0.5);
    const vFov = THREE.MathUtils.degToRad(camera.fov / 2);
    const hFov = Math.atan(Math.tan(vFov) * camera.aspect);
    const dist = (radius * 1.18) / Math.tan(Math.min(vFov, hFov));
    camera.position.copy(center).addScaledVector(VIEW_DIR, dist);
    camera.near = Math.max(dist / 100, 0.01);
    camera.far = dist * 20;
    camera.lookAt(center);
    camera.updateProjectionMatrix();
  }, [box, camera, size.width, size.height]);
  return null;
}

/** Exposes renderer internals to the toolbar for PNG capture. */
function CaptureBridge({ apiRef }: { apiRef: React.MutableRefObject<GlRefs | null> }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    apiRef.current = { gl, scene, camera };
    return () => {
      apiRef.current = null;
    };
  }, [apiRef, gl, scene, camera]);
  return null;
}

/** Toggles wireframe on every material under the group; restores on cleanup. */
function useWireframe(group: THREE.Group, on: boolean) {
  useEffect(() => {
    if (!on) return;
    const mats = new Set<THREE.Material>();
    group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        const m = mesh.material;
        (Array.isArray(m) ? m : [m]).forEach((x) => mats.add(x));
      }
    });
    mats.forEach((m) => {
      if ('wireframe' in m) (m as THREE.MeshStandardMaterial).wireframe = true;
    });
    return () => {
      mats.forEach((m) => {
        if ('wireframe' in m) (m as THREE.MeshStandardMaterial).wireframe = false;
      });
    };
  }, [group, on]);
}

function readInitialAsset(): ViewerAssetName {
  const v = new URLSearchParams(window.location.search).get('asset');
  return isViewerAssetName(v) ? v : 'assembled';
}

function syncAssetParam(asset: ViewerAssetName) {
  const url = new URL(window.location.href);
  url.searchParams.set('asset', asset);
  window.history.replaceState(null, '', url.toString());
}

function AssetStage({
  group,
  box,
  showGrid,
  showBox,
  showPivot,
}: {
  group: THREE.Group;
  box: THREE.Box3;
  showGrid: boolean;
  showBox: boolean;
  showPivot: boolean;
}) {
  const boxHelper = useMemo(() => new THREE.Box3Helper(box, new THREE.Color(ACCENT)), [box]);
  const gridSize = useMemo(() => {
    const s = box.getSize(new THREE.Vector3());
    return Math.ceil(Math.max(s.x, s.z, 4) * 1.6);
  }, [box]);
  return (
    <>
      <primitive object={group} />
      {showGrid && (
        <gridHelper args={[gridSize, gridSize * 2, 0x4fd8ff, 0x2a3348]} position={[0, -0.002, 0]} />
      )}
      {showBox && <primitive object={boxHelper} />}
      {showPivot && <axesHelper args={[0.6]} />}
    </>
  );
}

export function AssetViewer() {
  const [asset, setAsset] = useState<ViewerAssetName>(readInitialAsset);
  const [showGrid, setShowGrid] = useState(true);
  const [showBox, setShowBox] = useState(false);
  const [showPivot, setShowPivot] = useState(true);
  const [wireframe, setWireframe] = useState(false);
  const [exporting, setExporting] = useState(false);
  const glRefs = useRef<GlRefs | null>(null);

  useEffect(() => syncAssetParam(asset), [asset]);

  const group = useMemo(() => VIEWER_BUILDERS[asset](), [asset]);
  const box = useMemo(() => new THREE.Box3().setFromObject(group), [group]);
  useWireframe(group, wireframe);

  const dims = useMemo(() => {
    const s = box.getSize(new THREE.Vector3());
    return `w ${s.x.toFixed(2)}  h ${s.y.toFixed(2)}  d ${s.z.toFixed(2)}`;
  }, [box]);

  const handleExport = async () => {
    setExporting(true);
    try {
      await exportAllAssets(true);
    } finally {
      setExporting(false);
    }
  };

  const handleCapture = () => {
    const api = glRefs.current;
    if (!api) return;
    const { gl, scene, camera } = api;
    const prevColor = new THREE.Color();
    gl.getClearColor(prevColor);
    const prevAlpha = gl.getClearAlpha();
    gl.setClearColor(0x000000, 0); // alpha clear → transparent background
    gl.render(scene, camera);
    const dataUrl = gl.domElement.toDataURL('image/png');
    gl.setClearColor(prevColor, prevAlpha);
    gl.render(scene, camera);
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `${asset}.png`;
    a.click();
  };

  return (
    <div className="av-root">
      <div className="av-canvas-wrap">
        <Canvas
          gl={{ alpha: true, antialias: true }}
          camera={{ fov: 32 }}
          dpr={[1, 2]}
          onCreated={({ gl }) => gl.setClearColor(new THREE.Color(PREVIEW_BG), 1)}
        >
          <hemisphereLight
            args={[
              LIGHTING.hemisphere.sky,
              LIGHTING.hemisphere.ground,
              LIGHTING.hemisphere.intensity,
            ]}
          />
          <directionalLight
            color={LIGHTING.key.color}
            intensity={LIGHTING.key.intensity}
            position={[LIGHTING.key.position.x, LIGHTING.key.position.y, LIGHTING.key.position.z]}
          />
          <directionalLight
            color={LIGHTING.rim.color}
            intensity={LIGHTING.rim.intensity}
            position={[LIGHTING.rim.position.x, LIGHTING.rim.position.y, LIGHTING.rim.position.z]}
          />
          {/* Extra neutral fill so previews read fully on the dev background */}
          <ambientLight color={0x8fa3c8} intensity={0.55} />
          <AssetStage
            group={group}
            box={box}
            showGrid={showGrid}
            showBox={showBox}
            showPivot={showPivot}
          />
          <AutoFrame box={box} />
          <CaptureBridge apiRef={glRefs} />
        </Canvas>
      </div>

      <div className="av-toolbar">
        <div className="av-title">city3d / asset viewer</div>

        <div className="av-label">asset</div>
        <div className="av-row">
          {ASSET_NAMES.map((name) => (
            <button
              key={name}
              className={`av-btn${asset === name ? ' av-on' : ''}`}
              onClick={() => setAsset(name)}
            >
              {name}
            </button>
          ))}
        </div>

        <div className="av-label">debug</div>
        <div className="av-row">
          <button
            className={`av-btn${showGrid ? ' av-on' : ''}`}
            onClick={() => setShowGrid((v) => !v)}
          >
            grid
          </button>
          <button
            className={`av-btn${showBox ? ' av-on' : ''}`}
            onClick={() => setShowBox((v) => !v)}
          >
            bbox
          </button>
          <button
            className={`av-btn${showPivot ? ' av-on' : ''}`}
            onClick={() => setShowPivot((v) => !v)}
          >
            pivot
          </button>
          <button
            className={`av-btn${wireframe ? ' av-on' : ''}`}
            onClick={() => setWireframe((v) => !v)}
          >
            wireframe
          </button>
        </div>

        <div className="av-label">actions</div>
        <div className="av-row">
          <button className="av-btn" onClick={handleExport} disabled={exporting}>
            {exporting ? 'exporting…' : 'Export GLBs'}
          </button>
          <button className="av-btn" onClick={handleCapture}>
            Capture PNG
          </button>
        </div>

        <div className="av-meta">{dims}</div>
      </div>
    </div>
  );
}
