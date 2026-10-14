import { useSyncExternalStore } from 'react';

// Tiny shared UI flag: is a booking review open? The PWA update prompt waits while it is (TR-PWA-05).
let reviewOpen = false;
const listeners = new Set<() => void>();

export function setReviewOpen(value: boolean) {
  reviewOpen = value;
  listeners.forEach((l) => l());
}

export function useReviewOpen(): boolean {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    () => reviewOpen,
    () => false,
  );
}
