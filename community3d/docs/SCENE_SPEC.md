# Scene Specification
Right-handed Three.js coords, 1 unit ≈ 1 m, base top = Y0, fronts face -Z (road side).
Camera: orthographic isometric from the ROAD side (X 11.5, Y 9.0, Z -10.5 → target 0/1.7/0) so building fronts + street face the viewer (matches reference; documented deviation from the draft camera which viewed building backs).
Plot 14×9, slab 1.0 thick (raised from 0.65 after visual QA — thin edge read as a flat band).
Road: Z -2.05→0.75, asphalt with double center line, manhole, drain. Sidewalks N (0.75→1.70) / S (-2.95→-2.05), curbs, crosswalk centered X -4.9 (pulled in from -5.6 which overshot the plot).
Market at (-4.55, 0, 2.72) on its pad; Community Center at (1.65, 0, 2.83) on its pad; 4 shared-geometry lamps on sidewalks (see sceneLayout.ts — single source of truth).
Stages: overview 0-0.20 / market 0.20-0.45 (lift 2.25) / community-center 0.45-0.70 (lift 2.75) / street-lights 0.70-0.95 (lift 1.5, stagger 0.06) / settle 0.95-1. Lift = top-level group Y only; base world never moves.
Night lighting: hemisphere 0x39496e/0x11141c, key directional from camera side, cyan rim, warm emissive windows (seeded deterministic lit pattern), 4 lamp point lights desktop / 2 mobile + static ground pools + emissive bulbs. ACES tone mapping, exposure 1.2, alpha canvas over page background.
