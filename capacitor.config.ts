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
    // Match the warm-dark web shell so native launch does not flash cream
    // before React paints the app/auth screens.
    backgroundColor: '#161210',
  },
  plugins: {
    SplashScreen: {
      // Auto-hide after 2 seconds. React mounts its own splash beneath
      // and takes over after the native splash fades.
      launchAutoHide: true,
      launchShowDuration: 2000,
      backgroundColor: '#161210',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
    },
    StatusBar: {
      // Dark shell with light status bar content.
      style: 'LIGHT',
      backgroundColor: '#161210',
      overlaysWebView: false,
    },
  },
};

export default config;
