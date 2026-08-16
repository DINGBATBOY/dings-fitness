import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Emits `version.json` into the build output with the git commit this bundle
 * was built from. Firebase Hosting serves it at /version.json, which lets the
 * weekly ops agent compare what's DEPLOYED against what's in the repo and
 * catch a stale web app (the failure mode where iOS ships but hosting never
 * gets re-deployed).
 */
const buildStamp = (): Plugin => ({
  name: 'ding-build-stamp',
  apply: 'build',
  generateBundle() {
    let commit = 'unknown';
    try {
      commit = execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim();
    } catch {
      // Not a git checkout (e.g. some CI contexts) — stamp stays 'unknown'.
    }
    this.emitFile({
      type: 'asset',
      fileName: 'version.json',
      source: JSON.stringify(
        { commit, shortCommit: commit.slice(0, 7), builtAt: new Date().toISOString() },
        null,
        2,
      ),
    });
  },
});

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
  plugins: [react(), tailwindcss(), buildStamp()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
