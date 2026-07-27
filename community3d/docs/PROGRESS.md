# Progress
1. Scaffold + layout config + materials + 4 asset builders + scene/lift API — done, tsc clean.
2. GLB export + 34-check spatial validation — all pass (roof AABB fix documented).
3. Visual QA round 1 (fresh verifier): camera viewed building backs; lantern head unreadable; pool lifted with lamp; awning fragment; crosswalk overshoot; dark isolated/mobile shots; washed road; thin slab; sign illegibility; frame clipping of lifted assets. ALL fixed.
4. Test suite: 22/22 passing (load, assets, lifts, features, spatial, GLBs, isolation, resize, mobile, console).
5. Integrated into platform.html community section (3D replaces 2D layers when WebGL available; 2D image stack remains as automatic fallback; scroll pin JS drives setLift; text steps unchanged).
6. Visual QA round 2 on final desktop+mobile+integrated screenshots — see QA_CHECKLIST.

## Ultracode full-spec round (React/R3F/GSAP layer)
7. Workflow fan-out (3 parallel agents): R3F app (Canvas frameloop=demand, GSAP ScrollTrigger scrub, DOM labels, activeFeature events, reduced-motion), dev asset viewer (/asset-viewer + ?viewer: grid/bbox/pivot/wireframe toggles, GLB export, transparent PNG capture), tests/lint (eslint flat config, 54 unit checks via tsx, extended 45-check Playwright suite incl. 5-viewport matrix + real-scroll stage tests + label visibility).
8. QA round 4 (fresh verifier, 2 passes): fixed label cross-fade (0.22s), light pools fade as lamps rise + bulb/point-light surge in the street-light stage, lamp positions recomputed from MEASURED screen projections (safe slots 47/51/67/70% screen-x; CC entrance zone clear), amber pools, ironwork manhole/drain (blue-puddle artifact), CC sign flush, awning trimmed, mobile framing +15%. Final verdict: production-ready YES, no criticals.
