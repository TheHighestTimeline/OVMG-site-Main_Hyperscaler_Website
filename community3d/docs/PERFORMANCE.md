# Performance
Budgets: ≤120 draw calls assembled, ≤4 real point lights desktop / 2 mobile, DPR clamp 2 / 1.75, textures = small procedural canvases (≤512px), no runtime model fetches, shadows OFF (AO blobs + pools instead).
Render loop is dirty-flag driven (renders only when progress/resize changes) and IntersectionObserver-gated (no rendering offscreen). prefers-reduced-motion → single static render. Geometry shared across lamp instances; materials shared via MaterialLibrary. Bundle ~500KB minified (~130KB gzip via host compression), zero network requests after load.
