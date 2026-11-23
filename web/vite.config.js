import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [svelte()],
  resolve: {
    alias: { $shared: fileURLToPath(new URL('../shared', import.meta.url)) },
  },
  server: {
    port: 5174,
    fs: { allow: ['..'] },
    proxy: { '/api': { target: 'http://localhost:3000', changeOrigin: true } },
  },
  build: { outDir: 'dist', emptyOutDir: true },
});
