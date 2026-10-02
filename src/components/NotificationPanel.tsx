import { useState } from 'react';
import { Bell, CheckCircle2, AlertTriangle, Info, ShieldCheck, X } from 'lucide-react';
import { notifications as seed } from '@/mock/notifications';
import { cx } from '@/lib/risk';

export function NotificationPanel({ onClose }: { onClose?: () => void }) {
  const [items, setItems] = useState(seed);
  const unread = items.filter((n) => !n.read).length;

  const markAll = () => setItems((prev) => prev.map((n) => ({ ...n, read: true })));
  const toggle = (id: string) =>
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: !n.read } : n)));

  const iconFor = (type: string) => {
    if (type === 'danger') return AlertTriangle;
    if (type === 'warn') return AlertTriangle;
    if (type === 'success') return CheckCircle2;
    return Info;
  };
  const toneFor = (type: string) => {
    if (type === 'danger') return 'text-danger bg-danger/10';
    if (type === 'warn') return 'text-warn bg-warn/10';
    if (type === 'success') return 'text-success bg-success/10';
    return 'text-info bg-info/10';
  };

  return (
    <div className="surface w-80 max-w-[calc(100vw-2rem)] p-0 overflow-hidden animate-scale-in shadow-card-hover">
      <div className="flex items-center justify-between px-4 py-3 border-b border-ink-700/60">
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-brand-400" />
          <h3 className="text-sm font-semibold text-ink-100">Notifications</h3>
          {unread > 0 && (
            <span className="text-[10px] font-bold bg-brand-500 text-ink-950 rounded-full px-1.5 py-0.5">
              {unread}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button className="text-xs text-brand-300 hover:text-brand-200 px-2 py-1" onClick={markAll}>
            Mark all read
          </button>
          {onClose && (
            <button onClick={onClose} className="text-ink-400 hover:text-ink-100" aria-label="Close">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
      <div className="max-h-96 overflow-y-auto">
        {items.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-ink-400">No notifications</p>
        ) : (
          items.map((n) => {
            const Icon = iconFor(n.type);
            return (
              <button
                key={n.id}
                onClick={() => toggle(n.id)}
                className={cx(
                  'w-full text-left flex gap-3 px-4 py-3 border-b border-ink-800/60 hover:bg-ink-800/40 transition-colors',
                  !n.read && 'bg-brand-500/5',
                )}
              >
                <div className={cx('w-8 h-8 rounded-lg flex items-center justify-center shrink-0', toneFor(n.type))}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-ink-100">{n.title}</p>
                  <p className="text-xs text-ink-400 mt-0.5 line-clamp-2">{n.description}</p>
                  <p className="text-[11px] text-ink-500 mt-1">{n.time}</p>
                </div>
                {!n.read && <span className="w-2 h-2 rounded-full bg-brand-400 shrink-0 mt-1.5" />}
              </button>
            );
          })
        )}
      </div>
      <div className="px-4 py-2.5 border-t border-ink-700/60 flex items-center gap-2 text-[11px] text-ink-500">
        <ShieldCheck className="w-3.5 h-3.5" />
        Demo notifications — no real alerts are sent.
      </div>
    </div>
  );
}
