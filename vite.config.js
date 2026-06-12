import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  publicDir: 'assets',
  build: { target: 'es2022', chunkSizeWarningLimit: 1200 },
  server: { host: true },
});
