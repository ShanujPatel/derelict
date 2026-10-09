import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

const ROOT = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

/**
 * Writes sw.js after the build with the exact list of files to cache, so the
 * game installs as an app and runs offline. The cache name changes with every
 * build, so a new version replaces the old one cleanly.
 */
function serviceWorker(): Plugin {
  return {
    name: 'derelict-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const files = Object.keys(bundle).filter((f) => !f.endsWith('.map') && !f.endsWith('.html'));
      const extra = [
        './',
        'index.html',
        'map.html',
        'favicon.svg',
        'manifest.webmanifest',
        'icon-192.png',
        'icon-512.png',
        'icon-maskable.png',
        'apple-touch-icon.png',
      ];
      const precache = [...new Set([...extra, ...files])];
      const hash = files
        .sort()
        .join('|')
        .split('')
        .reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 0);
      const source = readFileSync(resolve(ROOT, 'src/sw-template.js'), 'utf8')
        .replace('__CACHE__', `derelict-${pkg.version}-${(hash >>> 0).toString(36)}`)
        .replace('__PRECACHE__', JSON.stringify(precache));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

export default defineConfig({
  // Relative base so the build works at https://<user>.github.io/<repo>/
  base: './',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  resolve: {
    // Phaser's arcade-physics build leaves out Matter.js, which the game doesn't use: about 10% smaller.
    // (Unit tests never load Phaser, so they skip it.)
    alias: process.env.VITEST ? [] : [{ find: /^phaser$/, replacement: 'phaser/dist/phaser-arcade-physics.min.js' }],
  },
  build: {
    chunkSizeWarningLimit: 1200, // Phaser is ~1.1 MB on its own
    rollupOptions: {
      input: {
        main: resolve(ROOT, 'index.html'),
        map: resolve(ROOT, 'map.html'),
      },
      output: {
        // Phaser in its own file: it rarely changes, so browsers keep it cached across game updates.
        manualChunks: (id) => (id.includes('node_modules/phaser') ? 'phaser' : id.includes('/src/core/') ? 'core' : undefined),
      },
    },
  },
  plugins: [serviceWorker()],
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
