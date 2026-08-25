import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Android shell.
 *
 * `webDir` points at Next.js's static export. Run `npm run build` before `npx cap sync` —
 * there is no server in the APK, so whatever is in `out/` at sync time is the whole app.
 *
 * iOS is deliberately absent: installing on an iPhone needs a paid Apple Developer account
 * even for private distribution, and this is an app for two people with Android phones.
 */
const config: CapacitorConfig = {
  appId: 'id.cashflow.app',
  appName: 'Kas',
  webDir: 'out',

  android: {
    // The web layer draws its own background; letting it be transparent causes a white
    // flash against the dark theme on launch.
    backgroundColor: '#f5f7f0',
  },

  plugins: {
    App: {
      // Matches `emailRedirectTo` in the sign-in screen. This scheme must also be listed in
      // the Supabase dashboard under Authentication → URL Configuration → Redirect URLs,
      // or the magic link will refuse to come back here.
      appUrlOpen: { scheme: 'id.cashflow.app' },
    },
  },
};

export default config;
