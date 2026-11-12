import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

/**
 * Lets the page paint index.html's inline loading splash without waiting for the stylesheet. main.tsx holds the
 * first render until the stylesheet has loaded, so the app itself never shows unstyled.
 */
const nonBlockingCss = (): Plugin => ({
  name: 'non-blocking-css',
  apply: 'build',
  transformIndexHtml: {
    order: 'post',
    handler: (html) => html.replace(/<link rel="stylesheet"([^>]*)>/g, '<link rel="stylesheet"$1 media="print" onload="this.media=\'all\'">'),
  },
});

/**
 * A link straight into a round (a region, /daily, a challenge) skips the menu, so it needs the lazily loaded
 * play screen at once: start that download alongside the main script instead of after it.
 */
const preloadPlayOnDeepLinks = (): Plugin => ({
  name: 'preload-play-on-deep-links',
  apply: 'build',
  transformIndexHtml: {
    order: 'post',
    handler: (html, ctx) => {
      const play = Object.values(ctx.bundle ?? {}).find((c) => c.type === 'chunk' && c.isDynamicEntry && c.name === 'Play');
      if (!play) return html;
      const script = `<script>if (location.pathname !== '/') { const l = document.createElement('link'); l.rel = 'modulepreload'; l.crossOrigin = ''; l.href = '/${play.fileName}'; document.head.append(l); }</script>`;
      return html.replace('</head>', `  ${script}\n  </head>`);
    },
  },
});

export default defineConfig({
  plugins: [react(), nonBlockingCss(), preloadPlayOnDeepLinks()],
});
