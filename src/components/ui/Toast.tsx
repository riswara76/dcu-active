import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { Toast as RToast } from 'radix-ui';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';

type Tone = 'success' | 'info' | 'error';
interface ToastItem { id: number; title: string; description?: string; tone: Tone }

const ToastContext = createContext<(t: Omit<ToastItem, 'id'>) => void>(() => {});

const ICON: Record<Tone, ReactNode> = {
  success: <CheckCircle2 className="size-5 text-success" />,
  info: <Info className="size-5 text-ink" />,
  error: <AlertTriangle className="size-5 text-danger" />,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const show = useCallback((t: Omit<ToastItem, 'id'>) => {
    setItems((prev) => [...prev.slice(-2), { ...t, id: Date.now() + Math.random() }]);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      <RToast.Provider swipeDirection="down" duration={5000}>
        {children}
        {items.map((t) => (
          <RToast.Root
            key={t.id}
            type={t.tone === 'error' ? 'foreground' : 'background'}
            onOpenChange={(open) => { if (!open) setItems((prev) => prev.filter((x) => x.id !== t.id)); }}
            className="flex items-start gap-3 rounded-xl border border-line bg-white p-4 shadow-lg"
          >
            <span aria-hidden="true" className="mt-0.5">{ICON[t.tone]}</span>
            <div className="min-w-0 flex-1">
              <RToast.Title className="font-semibold text-ink">{t.title}</RToast.Title>
              {t.description && <RToast.Description className="text-sm text-muted">{t.description}</RToast.Description>}
            </div>
            <RToast.Close aria-label="Dismiss" className="-m-1 rounded p-1 text-muted hover:bg-surface">
              <X className="size-4" aria-hidden="true" />
            </RToast.Close>
          </RToast.Root>
        ))}
        <RToast.Viewport className="fixed inset-x-0 bottom-20 z-[60] mx-auto flex w-full max-w-md flex-col gap-2 px-4 outline-none md:bottom-6" />
      </RToast.Provider>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
