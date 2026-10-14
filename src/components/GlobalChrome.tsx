import { useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { RefreshCw, Share, WifiOff, X } from 'lucide-react';
import { useOnlineStatus } from '../lib/online';
import { useReviewOpen } from '../lib/ui-state';
import { Button } from './ui/Button';

/** S22 — offline banner (TR-PWA-04). */
export function OfflineBanner() {
  const online = useOnlineStatus();
  if (online) return null;
  return (
    <div role="status" className="sticky top-0 z-30 flex items-center gap-2 bg-header px-4 py-2 text-sm text-white">
      <WifiOff className="size-4 shrink-0" aria-hidden="true" />
      <span>You&apos;re offline. Booking, cancelling and check-in are paused until you&apos;re back online.</span>
    </div>
  );
}

/** S25 — "new version available" prompt. Deferred while a booking review is open (TR-PWA-05). */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({ immediate: true });
  const reviewOpen = useReviewOpen();
  if (!needRefresh || reviewOpen) return null;
  return (
    <div role="status" className="fixed inset-x-4 bottom-20 z-50 mx-auto flex max-w-md items-center gap-3 rounded-xl border border-line bg-white p-4 shadow-lg md:bottom-6">
      <RefreshCw className="size-5 shrink-0 text-primary" aria-hidden="true" />
      <p className="flex-1 text-sm text-ink">A new version of DCU Active is available.</p>
      <Button size="sm" onClick={() => void updateServiceWorker(true)}>Reload</Button>
      <button type="button" aria-label="Dismiss" className="rounded p-1 text-muted hover:bg-surface" onClick={() => setNeedRefresh(false)}>
        <X className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}

function readFlag(key: string): boolean {
  try { return localStorage.getItem(key) === '1'; } catch { return false; }
}
function writeFlag(key: string) {
  try { localStorage.setItem(key, '1'); } catch { /* storage unavailable: hint shows again next time */ }
}

/** One-time "Add to Home Screen" hint on iPhone Safari (TR-PWA-06). */
export function IosInstallHint() {
  const isIos = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone;
  const [dismissed, setDismissed] = useState(() => readFlag('dcu.iosHintDismissed'));
  if (!isIos || standalone || dismissed) return null;
  return (
    <div className="mb-4 flex items-start gap-3 rounded-xl border border-line bg-surface p-4 text-sm">
      <Share className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
      <p className="flex-1 text-ink">
        Add DCU Active to your Home Screen: tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>.
      </p>
      <button type="button" aria-label="Dismiss" className="rounded p-1 text-muted hover:bg-white"
        onClick={() => { writeFlag('dcu.iosHintDismissed'); setDismissed(true); }}>
        <X className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
