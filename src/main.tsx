import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './style.css';

/** In a build the stylesheet loads without blocking the splash (see vite.config.ts); wait for it before rendering. */
function stylesReady() {
  const link = document.querySelector<HTMLLinkElement>('link[rel="stylesheet"]');
  if (!link || link.media !== 'print') return Promise.resolve();
  return new Promise<void>((done) => {
    link.addEventListener('load', () => done(), { once: true });
    link.addEventListener('error', () => done(), { once: true });
  });
}

void stylesReady().then(() =>
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  ),
);
