import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor configuration for Ding! Fitness.
 *
 * - `appId` is the bundle identifier — PERMANENT on Apple's side after the
 *   first App Store submission. Don't change this.
 * - `webDir` matches Vite's build output. Run `npm run build` before
 *   `npx cap sync` so the latest web bundle is what ships in the native app.
 * - The dark splash matches the Dusk Trail palette (#0d0a08) so the
 *   transition into the app is seamless.
 */
const config: CapacitorConfig = {
  appId: 'com.dings.fitness',
  appName: 'Ding! Fitness',
  webDir: 'dist',
  // Disable Capacitor's dev-server bridge in production. For local iOS-on-
  // device dev you can temporarily override this to your machine's LAN IP.
  server: {
    androidScheme: 'https',
    iosScheme: 'capacitor',
  },
  ios: {
    contentInset: 'always',
    // Mati-Watsā cream — matches the web app's body background so there's
    // no flash between splash → web load. Was #0d0a08 (Dusk Trail dark).
    backgroundColor: '#f5ede1',
  },
  plugins: {
    SplashScreen: {
      // Auto-hide after 2 seconds. React mounts its own splash beneath
      // and takes over after the native splash fades.
      launchAutoHide: true,
      launchShowDuration: 2000,
      backgroundColor: '#f5ede1',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
    },
    StatusBar: {
      // Cream/parchment chrome. style:'DARK' = DARK CONTENT (dark icons +
      // text in the status bar), which is what we want on a light bg.
      style: 'DARK',
      backgroundColor: '#f5ede1',
      overlaysWebView: false,
    },
  },
};

export default config;
