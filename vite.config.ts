import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * Security headers (SECURITY-DESIGN §8.1). The Supabase origin is environment-specific, so the
 * Content-Security-Policy is generated per build and written to dist/_headers (static-host format used by
 * Cloudflare Pages / Netlify). The same headers are applied by `vite preview` so the CSP is exercised locally.
 */
function securityHeaders(supabaseUrl: string): Record<string, string> {
  const api = new URL(supabaseUrl);
  const ws = `${api.protocol === 'https:' ? 'wss' : 'ws'}://${api.host}`;
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    // 'unsafe-inline' for STYLES only: Radix's scroll-lock injects a computed <style> element (see PHASE-3-REPORT DV-11).
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self' ${api.origin} ${ws}`,
    "manifest-src 'self'",
    "worker-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    ...(api.protocol === 'https:' ? ['upgrade-insecure-requests'] : []),
  ].join('; ');
  return {
    'Content-Security-Policy': csp,
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
    ...(api.protocol === 'https:' ? { 'Strict-Transport-Security': 'max-age=31536000; includeSubDomains' } : {}),
  };
}

function hostConfigFiles(headers: Record<string, string>): Plugin {
  return {
    name: 'dcu-host-config',
    apply: 'build',
    generateBundle() {
      const lines = [
        '/*', ...Object.entries(headers).map(([k, v]) => `  ${k}: ${v}`),
        '', '/assets/*', '  Cache-Control: public, max-age=31536000, immutable', // content-hashed file names
        '', '/sw.js', '  Cache-Control: no-cache',                               // always check for app updates
      ];
      this.emitFile({ type: 'asset', fileName: '_headers', source: `${lines.join('\n')}\n` });
      // SPA fallback is handled by the host (Cloudflare assets not_found_handling = "single-page-application").
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const supabaseUrl = env.VITE_SUPABASE_URL || 'http://127.0.0.1:54321';
  const headers = securityHeaders(supabaseUrl);

  return {
    plugins: [
      react(),
      tailwindcss(),
      hostConfigFiles(headers),
      VitePWA({
        registerType: 'prompt',
        injectRegister: false, // registered from app code (no inline script → strict script-src)
        includeAssets: ['favicon.ico', 'favicon.svg', 'apple-touch-icon-180x180.png'],
        manifest: {
          name: 'DCU Active',
          short_name: 'DCU Active',
          description: 'Book DCU sports and recreational facilities.',
          lang: 'en',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          theme_color: '#C8102E',
          background_color: '#FFFFFF',
          icons: [
            { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
            { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
            { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
            { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          // Static build assets only. API, Auth and Realtime traffic is never cached (TR-PWA-03):
          // no runtimeCaching routes are registered, so those requests always go to the network.
          globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/auth\/confirm/, /^\/reset-password/],
          cleanupOutdatedCaches: true,
        },
      }),
    ],
    server: { port: 5173, strictPort: true },
    // host.docker.internal: lets the OWASP ZAP container scan the local preview (Phase 4 security testing).
    preview: { port: 4173, strictPort: true, headers, allowedHosts: ['host.docker.internal'] },
    build: { target: 'es2022', sourcemap: false },
  };
});
