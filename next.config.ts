import type { NextConfig } from 'next';

const config: NextConfig = {
  /**
   * Static export, for two reasons that point the same way.
   *
   * Capacitor bundles static files into the APK — there is no Node server inside an Android
   * app. And the web build has nothing to render on the server anyway: this is a local-first
   * app, so every read comes from the on-device database and anything server-rendered would
   * be replaced the moment the client hydrates.
   *
   * One build output therefore serves both Vercel and the APK.
   */
  output: 'export',

  // Static hosting serves `/add/index.html` rather than `/add`, and Capacitor's
  // file:// origin needs the same.
  trailingSlash: true,

  images: {
    // No image optimization server exists in a static export.
    unoptimized: true,
  },

  typedRoutes: true,

  // Next.js writes AGENTS.md and CLAUDE.md into the repo root on every build. Nothing here
  // asked for them and they are not maintained, so they would be stale documentation
  // committed by accident.
  agentRules: false,
};

export default config;
