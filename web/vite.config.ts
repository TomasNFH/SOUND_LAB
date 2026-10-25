import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In Docker the api is reachable as "api"; locally it runs on localhost.
const apiTarget = process.env.API_URL ?? 'http://localhost:3001';

export default defineConfig({
  // The GitHub Pages build is served from /<repo>/ and sets BASE_PATH.
  base: process.env.BASE_PATH ?? '/',
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: { '/api': apiTarget },
  },
});
