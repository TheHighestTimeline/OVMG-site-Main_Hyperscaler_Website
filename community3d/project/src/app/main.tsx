/**
 * main.tsx — React entry. Routes to the AssetViewer when the URL asks for it
 * (path ends with /asset-viewer, or ?viewer is present); otherwise renders the
 * pinned scroll experience.
 */
import type { ComponentType } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import * as ViewerModule from '../viewer/AssetViewer';
import '../styles/app.css';

// Tolerate either a named or default export from the viewer module.
const AssetViewer: ComponentType =
  (ViewerModule as { AssetViewer?: ComponentType; default?: ComponentType }).AssetViewer ??
  (ViewerModule as { default?: ComponentType }).default ??
  (() => null);

const wantsViewer =
  window.location.pathname.endsWith('/asset-viewer') ||
  new URLSearchParams(window.location.search).has('viewer');

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('City3D: #root element not found');

ReactDOM.createRoot(rootEl).render(wantsViewer ? <AssetViewer /> : <App />);
