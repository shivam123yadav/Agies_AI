import { ShieldCheck, ScanSearch, Puzzle, ScrollText } from 'lucide-react';
import { cx } from '@/lib/risk';

export interface SystemModule {
  label: string;
  status: 'Operational' | 'Degraded' | 'Down';
  icon: React.ComponentType<{ className?: string }>;
}

export const defaultModules: SystemModule[] = [
  { label: 'Detection Engine', status: 'Operational', icon: ScanSearch },
  { label: 'Policy Engine', status: 'Operational', icon: ShieldCheck },
  { label: 'Extension', status: 'Operational', icon: Puzzle },
  { label: 'Audit Logging', status: 'Operational', icon: ScrollText },
];

export function SystemStatus({
  title = 'Organization Security',
  status = 'Protected',
  modules = defaultModules,
}: {
  title?: string;
  status?: string;
  modules?: SystemModule[];
}) {
  const allOk = modules.every((m) => m.status === 'Operational');
  const statusTone = allOk ? 'text-success' : 'text-warn';
  const dotTone = allOk ? 'bg-success animate-pulse-ring' : 'bg-warn';

  return (
    <div className="surface p-5 relative overflow-hidden animate-fade-in">
      <div className="absolute -right-8 -top-8 w-32 h-32 rounded-full bg-brand-500/5 blur-2xl" />
      <div className="relative">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">{title}</p>
            <div className="mt-1.5 flex items-center gap-2.5">
              <span className={cx('w-2.5 h-2.5 rounded-full', dotTone)} />
              <span className={cx('text-xl font-display font-bold', statusTone)}>{status}</span>
            </div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-brand-500/10 flex items-center justify-center">
            <ShieldCheck className="w-6 h-6 text-brand-400" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          {modules.map((m) => (
            <div
              key={m.label}
              className="flex items-center gap-2.5 rounded-lg border border-ink-700/50 bg-ink-850/60 px-3 py-2.5"
            >
              <m.icon className="w-4 h-4 text-ink-300" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-ink-200 truncate">{m.label}</p>
                <p className="text-[11px] text-success flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-success" />
                  {m.status}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
