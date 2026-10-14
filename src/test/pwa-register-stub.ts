// Test stand-in for "virtual:pwa-register/react" (provided by vite-plugin-pwa only in dev/build).
export function useRegisterSW() {
  const noop = () => {};
  return { needRefresh: [false, noop] as const, offlineReady: [false, noop] as const, updateServiceWorker: async () => {} };
}
