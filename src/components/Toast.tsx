import { createContext, useCallback, useContext, useState } from 'react';
import { CheckCircle2, AlertTriangle, Info, XCircle, X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info' | 'warn';
interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
}

interface ToastCtx {
  push: (t: Omit<Toast, 'id'>) => void;
}

const Ctx = createContext<ToastCtx>({ push: () => {} });

export function useToast() {
  return useContext(Ctx);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((t: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { ...t, id }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((x) => x.id !== id));
    }, 4000);
  }, []);

  const dismiss = (id: string) => setToasts((prev) => prev.filter((x) => x.id !== id));

  const icons: Record<ToastType, React.ComponentType<{ className?: string }>> = {
    success: CheckCircle2,
    error: XCircle,
    info: Info,
    warn: AlertTriangle,
  };
  const tones: Record<ToastType, string> = {
    success: 'text-success',
    error: 'text-danger',
    info: 'text-info',
    warn: 'text-warn',
  };

  return (
    <Ctx.Provider value={{ push }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 w-80 max-w-[calc(100vw-2rem)]">
        {toasts.map((t) => {
          const Icon = icons[t.type];
          return (
            <div
              key={t.id}
              className="surface p-4 pr-3 flex items-start gap-3 animate-slide-in-right shadow-card-hover"
            >
              <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${tones[t.type]}`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-ink-100">{t.title}</p>
                {t.message && <p className="text-xs text-ink-400 mt-0.5">{t.message}</p>}
              </div>
              <button onClick={() => dismiss(t.id)} className="text-ink-400 hover:text-ink-100" aria-label="Dismiss">
                <X className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>
    </Ctx.Provider>
  );
}
