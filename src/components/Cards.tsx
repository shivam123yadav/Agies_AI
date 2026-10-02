import { cx } from '@/lib/risk';

export function StatCard({
  label,
  value,
  icon: Icon,
  accent = 'brand',
  sub,
}: {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  accent?: 'brand' | 'success' | 'warn' | 'danger' | 'info';
  sub?: string;
}) {
  const accents: Record<string, string> = {
    brand: 'text-brand-300 bg-brand-500/10',
    success: 'text-success bg-success/10',
    warn: 'text-warn bg-warn/10',
    danger: 'text-danger bg-danger/10',
    info: 'text-info bg-info/10',
  };
  return (
    <div className="surface p-5 hover:border-ink-600 transition-colors duration-200 animate-fade-in">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-ink-400 uppercase tracking-wider">{label}</p>
          <p className="mt-2 text-3xl font-display font-bold text-ink-50">{value}</p>
          {sub && <p className="mt-1 text-xs text-ink-400">{sub}</p>}
        </div>
        <div className={cx('w-10 h-10 rounded-lg flex items-center justify-center', accents[accent])}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </div>
  );
}

export function ChartCard({
  title,
  subtitle,
  children,
  actions,
  className,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cx('surface p-5 animate-fade-in', className)}>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h3 className="text-sm font-semibold text-ink-100">{title}</h3>
          {subtitle && <p className="text-xs text-ink-400 mt-0.5">{subtitle}</p>}
        </div>
        {actions}
      </div>
      {children}
    </div>
  );
}

export function SectionCard({
  title,
  subtitle,
  children,
  className,
  actions,
}: {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className={cx('surface p-5', className)}>
      {(title || actions) && (
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            {title && <h3 className="text-sm font-semibold text-ink-100">{title}</h3>}
            {subtitle && <p className="text-xs text-ink-400 mt-0.5">{subtitle}</p>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </div>
  );
}
