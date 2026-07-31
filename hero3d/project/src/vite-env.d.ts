/// <reference types="vite/client" />

/**
 * Injected at build time so the runtime knows how to resolve public assets:
 *  ''         -> resolve against the document base URL (dev server, standalone page)
 *  '@module'  -> resolve against import.meta.url (embed bundle loaded from /hero3d/)
 */
declare const __HERO_ASSET_BASE__: string;
