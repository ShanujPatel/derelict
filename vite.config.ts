import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative base so the build works at https://<user>.github.io/<repo>/
  base: './',
  build: {
    chunkSizeWarningLimit: 1600, // Phaser is ~1.2 MB on its own
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
