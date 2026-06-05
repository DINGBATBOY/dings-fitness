import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // Relative asset paths so the Capacitor iOS WebView (which serves from
  // capacitor://localhost) can resolve them. Without this, built assets
  // reference /assets/index-XXX.js and the WebView never finds them →
  // white screen on app launch. Firebase Hosting handles absolute paths
  // fine, which is why this never surfaced on web.
  base: './',
  server: {
    port: 3000,
    host: '0.0.0.0',
  },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
