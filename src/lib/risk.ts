import type { ActionType, RiskLevel } from '@/types';

export const riskLevelFromScore = (score: number): RiskLevel => {
  if (score >= 70) return 'HIGH';
  if (score >= 40) return 'MEDIUM';
  return 'LOW';
};

export const actionFromLevel = (level: RiskLevel): ActionType => {
  if (level === 'HIGH') return 'BLOCK';
  if (level === 'MEDIUM') return 'WARN';
  return 'ALLOW';
};

export const riskColor = (level: RiskLevel): string => {
  if (level === 'HIGH') return 'text-danger';
  if (level === 'MEDIUM') return 'text-warn';
  return 'text-success';
};

export const riskBg = (level: RiskLevel): string => {
  if (level === 'HIGH') return 'bg-risk-highSoft border-danger/30';
  if (level === 'MEDIUM') return 'bg-risk-mediumSoft border-warn/30';
  return 'bg-risk-lowSoft border-success/30';
};

export const riskStroke = (level: RiskLevel): string => {
  if (level === 'HIGH') return '#ef4444';
  if (level === 'MEDIUM') return '#f59e0b';
  return '#10b981';
};

export const actionColor = (action: ActionType): string => {
  if (action === 'BLOCK') return 'text-danger bg-risk-highSoft border-danger/30';
  if (action === 'WARN') return 'text-warn bg-risk-mediumSoft border-warn/30';
  return 'text-success bg-risk-lowSoft border-success/30';
};

export const actionVerb = (action: ActionType): string => {
  if (action === 'BLOCK') return 'BLOCKED';
  if (action === 'WARN') return 'WARNED';
  return 'ALLOWED';
};

export const initials = (name: string): string =>
  name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

export const cx = (...classes: (string | false | null | undefined)[]): string =>
  classes.filter(Boolean).join(' ');
