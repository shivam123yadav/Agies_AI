import { Type, ScanSearch, Gauge, ShieldCheck, ArrowRight } from 'lucide-react';
import { cx } from '@/lib/risk';

const steps = [
  { label: 'INPUT', icon: Type, tone: 'neutral' },
  { label: 'LOCAL PATTERN DETECTION', icon: ScanSearch, tone: 'local' },
  { label: 'CONTEXTUAL ANALYSIS', icon: ScanSearch, tone: 'context' },
  { label: 'RISK SCORE', icon: Gauge, tone: 'neutral' },
  { label: 'POLICY ENGINE', icon: ShieldCheck, tone: 'neutral' },
  { label: 'ACTION', icon: ArrowRight, tone: 'neutral' },
];

export function DetectionPipeline({ compact = false }: { compact?: boolean }) {
  return (
    <div className={cx('flex items-center gap-2', compact ? 'flex-wrap' : 'flex-col sm:flex-row')}>
      {steps.map((s, i) => (
        <div key={s.label} className="flex items-center gap-2">
          <div
            className={cx(
              'flex items-center gap-2 rounded-lg border px-3 py-2',
              compact ? 'text-xs' : 'text-sm',
              s.tone === 'local'
                ? 'border-brand-500/30 bg-brand-500/5 text-brand-300'
                : s.tone === 'context'
                  ? 'border-purple-500/30 bg-purple-500/5 text-purple-300'
                  : 'border-ink-700 bg-ink-800/60 text-ink-200',
            )}
          >
            <s.icon className={compact ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
            <span className="font-medium">{s.label}</span>
          </div>
          {i < steps.length - 1 && (
            <ArrowRight className={cx('text-ink-500', compact ? 'w-3 h-3' : 'w-4 h-4 rotate-90 sm:rotate-0')} />
          )}
        </div>
      ))}
    </div>
  );
}
