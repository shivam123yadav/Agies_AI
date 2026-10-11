import { useState } from 'react';
import {
  Puzzle,
  Chrome,
  ShieldCheck,
  ScanSearch,
  ScrollText,
  CheckCircle2,
  Activity,
  RefreshCw,
  Download,
} from 'lucide-react';
import { SystemStatus } from '@/components/SystemStatus';
import { SectionCard } from '@/components/Cards';
import { useToast } from '@/components/Toast';
import { cx } from '@/lib/risk';

const modules = [
  { label: 'Detection Engine', status: 'Operational' as const, icon: ScanSearch, detail: '11 rules active' },
  { label: 'Policy Engine', status: 'Operational' as const, icon: ShieldCheck, detail: '7 policies enforced' },
  { label: 'Audit Logging', status: 'Operational' as const, icon: ScrollText, detail: 'Chaining verified' },
];

const healthMetrics = [
  { label: 'CPU Usage', value: 24, unit: '%', tone: 'success' },
  { label: 'Memory', value: 41, unit: 'MB', tone: 'brand' },
  { label: 'Latency', value: 12, unit: 'ms', tone: 'success' },
  { label: 'Uptime', value: 99.9, unit: '%', tone: 'success' },
];

export function ExtensionPage() {
  const [refreshing, setRefreshing] = useState(false);
  const toast = useToast();

  const refresh = () => {
    setRefreshing(true);
    setTimeout(() => {
      setRefreshing(false);
      toast.push({
        type: 'success',
        title: 'Health check complete',
        message: 'All systems operational.',
      });
    }, 900);
  };

  return (
    <div className="space-y-5">
      {/* Extension header */}
      <div className="surface p-6 relative overflow-hidden">
        <div className="absolute -right-10 -top-10 w-40 h-40 rounded-full bg-brand-500/10 blur-3xl" />

        <div className="relative flex flex-col sm:flex-row items-start gap-5">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shadow-glow shrink-0">
            <Puzzle className="w-7 h-7 text-ink-950" />
          </div>

          <div className="flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-lg font-display font-bold text-ink-50">
                AgiesAI Sentinel Extension
              </h2>

              <span className="chip text-success bg-risk-lowSoft border-success/30">
                <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                ACTIVE
              </span>
            </div>

            <p className="mt-1.5 text-sm text-ink-400">
              Browser extension intercepting AI-tool submissions before they leave the browser.
            </p>
          </div>

          <div className="flex gap-2">
            <a
              href="/downloads/extension.zip"
              download
              className="btn-primary text-sm"
            >
              <Download className="w-4 h-4" />
              Download Extension
            </a>

            <button
              className="btn-secondary text-sm"
              onClick={refresh}
              disabled={refreshing}
            >
              <RefreshCw
                className={cx('w-4 h-4', refreshing && 'animate-spin')}
              />
              {refreshing ? 'Checking…' : 'Run Health Check'}
            </button>
          </div>
        </div>
      </div>

      {/* Config grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <ConfigCard icon={Chrome} label="Browser" value="Chrome" />
        <ConfigCard icon={Puzzle} label="Manifest" value="V3" />
        <ConfigCard icon={ShieldCheck} label="Protected Platform" value="ChatGPT" />
        <ConfigCard icon={Activity} label="Version" value="1.6.0" />
      </div>

      {/* Installation instructions */}
      <SectionCard
        title="Install the Extension"
        subtitle="Install the downloaded extension locally in Chrome"
      >
        <div className="space-y-2 text-sm text-ink-300">
          <p>1. Click "Download Extension".</p>
          <p>2. Extract the downloaded ZIP file.</p>
          <p>3. Open <span className="text-brand-400">chrome://extensions</span>.</p>
          <p>4. Enable <strong>Developer mode</strong>.</p>
          <p>5. Click <strong>Load unpacked</strong>.</p>
          <p>6. Select the extracted extension folder.</p>
        </div>
      </SectionCard>

      {/* System status */}
      <SystemStatus
        title="Extension Health"
        status="Operational"
        modules={modules}
      />

      {/* Health metrics */}
      <SectionCard
        title="System Health Metrics"
        subtitle="Extension telemetry"
      >
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {healthMetrics.map((m) => (
            <div
              key={m.label}
              className="rounded-lg border border-ink-700/50 bg-ink-850/40 p-4"
            >
              <p className="text-xs text-ink-400">{m.label}</p>

              <p className="mt-1.5 text-2xl font-display font-bold text-ink-50">
                {m.value}
                <span className="text-sm text-ink-400 ml-1">
                  {m.unit}
                </span>
              </p>

              <div className="mt-2 h-1.5 rounded-full bg-ink-800 overflow-hidden">
                <div
                  className={cx(
                    'h-full rounded-full',
                    m.tone === 'success' && 'bg-success',
                    m.tone === 'brand' && 'bg-brand-500',
                  )}
                  style={{
                    width: `${m.tone === 'success' ? m.value : m.value / 2}%`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* Capabilities */}
      <SectionCard
        title="Active Capabilities"
        subtitle="What the extension is currently protecting"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[
            'Input interception on ChatGPT',
            'Pattern-based detection (regex)',
            'Contextual risk analysis',
            'Real-time risk scoring',
            'Policy enforcement',
            'Metadata-only incident logging',
          ].map((cap) => (
            <div
              key={cap}
              className="flex items-center gap-2.5 rounded-lg border border-ink-700/50 bg-ink-850/40 px-3.5 py-3"
            >
              <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
              <span className="text-sm text-ink-200">{cap}</span>
            </div>
          ))}
        </div>
      </SectionCard>

      <p className="text-xs text-ink-500 text-center">
        Download and install the AgiesAI Sentinel browser extension to enable
        real prompt interception and protection.
      </p>
    </div>
  );
}

function ConfigCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="surface p-4">
      <div className="flex items-center gap-2 text-ink-400">
        <Icon className="w-4 h-4" />
        <span className="text-xs">{label}</span>
      </div>

      <p className="mt-2 text-lg font-display font-bold text-ink-50">
        {value}
      </p>
    </div>
  );
}