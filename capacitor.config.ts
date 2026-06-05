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
    // The web app already paints its own near-black background. Match it
    // so there's no white flash between splash → web load.
    backgroundColor: '#0d0a08',
  },
  plugins: {
    SplashScreen: {
      // Auto-hide after 2 seconds. The React app has its own SplashScreen.tsx
      // that animates in beneath/after this — the native one is purely a
      // bridge while the WebView boots. Set launchAutoHide: false ONLY if
      // your JS calls SplashScreen.hide() via @capacitor/splash-screen.
      launchAutoHide: true,
      launchShowDuration: 2000,
      backgroundColor: '#0d0a08',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
    },
    StatusBar: {
      // Dusk Trail palette — light icons on the dark surface.
      style: 'DARK',
      backgroundColor: '#0d0a08',
      overlaysWebView: false,
    },
  },
};

export default config;
