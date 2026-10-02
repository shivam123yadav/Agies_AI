import { ShieldCheck, Eye, EyeOff, Lock } from 'lucide-react';

export function PrivacyNotice({ variant = 'card' }: { variant?: 'card' | 'inline' }) {
  if (variant === 'inline') {
    return (
      <div className="flex items-center gap-2 text-xs text-ink-400">
        <Lock className="w-3.5 h-3.5 text-brand-400" />
        <span>Sensitive content withheld — only metadata is retained.</span>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-brand-500/20 bg-brand-500/5 p-4">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-brand-500/10 flex items-center justify-center shrink-0">
          <ShieldCheck className="w-5 h-5 text-brand-400" />
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-300">
            Sensitive Content Withheld
          </p>
          <p className="mt-1 text-sm text-ink-300">
            Raw sensitive content is not displayed in incident records. Only incident metadata is retained.
          </p>
          <div className="mt-3 flex flex-wrap gap-4 text-xs text-ink-400">
            <span className="flex items-center gap-1.5">
              <EyeOff className="w-3.5 h-3.5" /> No raw credentials stored
            </span>
            <span className="flex items-center gap-1.5">
              <EyeOff className="w-3.5 h-3.5" /> No complete PII retained
            </span>
            <span className="flex items-center gap-1.5">
              <Eye className="w-3.5 h-3.5" /> Metadata-only audit trail
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
