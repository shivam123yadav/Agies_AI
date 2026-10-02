import { useEffect, useState, useRef } from 'react';
import type { RiskLevel, ActionType } from '@/types';
import { cx } from '@/lib/risk';

export function RiskBadge({ level, size = 'md' }: { level: RiskLevel; size?: 'sm' | 'md' }) {
  const styles: Record<RiskLevel, string> = {
    LOW: 'text-success bg-risk-lowSoft border-success/30',
    MEDIUM: 'text-warn bg-risk-mediumSoft border-warn/30',
    HIGH: 'text-danger bg-risk-highSoft border-danger/30',
  };
  const dot: Record<RiskLevel, string> = {
    LOW: 'bg-success',
    MEDIUM: 'bg-warn',
    HIGH: 'bg-danger',
  };
  return (
    <span
      className={cx(
        'chip',
        styles[level],
        size === 'sm' && 'px-2 py-0.5 text-[11px]',
      )}
    >
      <span className={cx('w-1.5 h-1.5 rounded-full', dot[level])} />
      {level}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    Active: 'text-success bg-risk-lowSoft border-success/30',
    Operational: 'text-success bg-risk-lowSoft border-success/30',
    Resolved: 'text-success bg-risk-lowSoft border-success/30',
    Acknowledged: 'text-info bg-brand-500/10 border-brand-500/30',
    Open: 'text-warn bg-risk-mediumSoft border-warn/30',
    Draft: 'text-ink-300 bg-ink-800 border-ink-600',
    Disabled: 'text-ink-400 bg-ink-800 border-ink-600',
  };
  const cls = map[status] ?? 'text-ink-300 bg-ink-800 border-ink-600';
  return <span className={cx('chip', cls)}>{status}</span>;
}

export function ActionBadge({ action }: { action: ActionType }) {
  const map: Record<ActionType, string> = {
    ALLOW: 'text-success bg-risk-lowSoft border-success/30',
    WARN: 'text-warn bg-risk-mediumSoft border-warn/30',
    BLOCK: 'text-danger bg-risk-highSoft border-danger/30',
  };
  return <span className={cx('chip', map[action])}>{action}</span>;
}

export function DetectionTypeBadge({ type }: { type: 'LOCAL' | 'CONTEXTUAL' }) {
  const isLocal = type === 'LOCAL';
  return (
    <span
      className={cx(
        'chip',
        isLocal
          ? 'text-brand-300 bg-brand-500/10 border-brand-500/30'
          : 'text-purple-300 bg-purple-500/10 border-purple-500/30',
      )}
    >
      {isLocal ? 'LOCAL / REGEX' : 'CONTEXTUAL / AI'}
    </span>
  );
}

export function SeverityBadge({ severity }: { severity: 'High' | 'Medium' | 'Low' }) {
  const map = {
    High: 'text-danger bg-risk-highSoft border-danger/30',
    Medium: 'text-warn bg-risk-mediumSoft border-warn/30',
    Low: 'text-success bg-risk-lowSoft border-success/30',
  };
  return <span className={cx('chip', map[severity])}>{severity}</span>;
}

export function RiskScore({
  score,
  level,
  size = 'md',
  animate = true,
}: {
  score: number;
  level: RiskLevel;
  size?: 'sm' | 'md' | 'lg';
  animate?: boolean;
}) {
  const [display, setDisplay] = useState(animate ? 0 : score);
  const raf = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!animate) {
      setDisplay(score);
      return;
    }
    const start = performance.now();
    const dur = 900;
    const tick = (now: number) => {
      const p = Math.min((now - start) / dur, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(eased * score));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current!);
  }, [score, animate]);

  const color = level === 'HIGH' ? '#ef4444' : level === 'MEDIUM' ? '#f59e0b' : '#10b981';
  const dims =
    size === 'lg' ? 'w-24 h-24 text-2xl' : size === 'sm' ? 'w-14 h-14 text-base' : 'w-16 h-16 text-lg';
  const stroke = size === 'lg' ? 8 : 6;
  const radius = size === 'lg' ? 88 : size === 'sm' ? 52 : 60;
  const circ = 2 * Math.PI * radius;

  return (
    <div className={cx('relative flex items-center justify-center', dims)}>
      <svg className="absolute inset-0 -rotate-90" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r={radius} fill="none" stroke="rgba(148,163,184,0.15)" strokeWidth={stroke} />
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ - (display / 100) * circ}
          style={{ transition: 'stroke-dashoffset 0.1s linear' }}
        />
      </svg>
      <div className="relative text-center">
        <div className="font-mono font-bold" style={{ color }}>
          {display}
        </div>
        <div className="text-[11px] text-ink-400 -mt-0.5">/ 100</div>
      </div>
    </div>
  );
}
