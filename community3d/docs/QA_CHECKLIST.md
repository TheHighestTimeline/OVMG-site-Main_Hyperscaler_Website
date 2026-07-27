# QA Checklist (all verified in tests/run_tests.py + validateExportedAssets.ts)
[x] app loads, canvas renders, zero console errors (desktop + mobile)
[x] 4 separate asset systems in scene; base world contains no buildings/lamps
[x] ground contact within tolerance; pivots bottom-center; entrances face road
[x] building shells clear of road; lamps on sidewalks only; no building overlap; inside plot
[x] markings raised (no z-fighting); buildings over their pads
[x] lifts reach configured heights and return to 0; base stationary throughout
[x] activeFeature fires overview/market/community-center/street-lights at configured ranges
[x] GLBs export, load, and match source dimensions
[x] isolated asset views render; resize + mobile viewport survive
[x] screenshots reviewed by fresh-context verifier (2 rounds; round-1 findings fixed: camera side, lantern head, floating pool, awning fragment, crosswalk overshoot, sign legibility, road contrast, slab edge, lift shadows, isolated exposure, deterministic windows, frame clipping)
[x] React app: 45/45 browser checks, 54 unit checks, eslint clean, dual production builds clean
[x] QA round 4 verifier sign-off on final desktop+mobile+viewer screenshots (all 4 criticals resolved, none introduced)
