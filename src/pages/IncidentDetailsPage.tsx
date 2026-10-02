import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  X,
  ScanSearch,
  Eye,
  Gauge,
  ShieldCheck,
  Ban,
  AlertTriangle,
  CheckCircle,
  Clock,
  Fingerprint,
  RefreshCw,
} from 'lucide-react';
import { RiskScore, RiskBadge, ActionBadge, StatusBadge } from '@/components/Risk';
import { PrivacyNotice } from '@/components/PrivacyNotice';
import { DetectionPipeline } from '@/components/DetectionPipeline';
import { useToast } from '@/components/Toast';
import { cx } from '@/lib/risk';
import { getIncident, updateIncidentStatus, type BackendIncident } from '@/lib/api';

function categoryFromType(type?: string): string {
  switch (type) {
    case 'API_KEY': return 'API Key';
    case 'EMAIL':
    case 'CREDIT_CARD': return 'PII';
    case 'AWS_ACCESS_KEY':
    case 'PRIVATE_KEY':
    case 'PASSWORD_ASSIGNMENT': return 'Credentials';
    case 'DATABASE_URL': return 'Database Information';
    default: return 'Other';
  }
}

function formatTimestamp(timestamp: string) {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? timestamp : date.toLocaleString();
}

export function IncidentDetailsPage() {
  const { id } = useParams();
  const toast = useToast();
  const [incident, setIncident] = useState<BackendIncident | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const loadIncident = async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const response = await getIncident(id);
      setIncident(response.incident);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load incident.');
      setIncident(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadIncident();
  }, [id]);

  const changeStatus = async (status: 'Acknowledged' | 'Resolved') => {
    if (!id) return;
    setUpdatingStatus(true);
    try {
      const response = await updateIncidentStatus(id, status);
      setIncident(response.incident);
      toast.push({ type: 'success', title: 'Incident updated', message: `${id} marked as ${status}.` });
    } catch (err) {
      toast.push({ type: 'error', title: 'Update failed', message: err instanceof Error ? err.message : 'Unable to update incident.' });
    } finally {
      setUpdatingStatus(false);
    }
  };

  if (loading) {
    return <div className="surface p-10 text-center text-sm text-ink-400">Loading incident from MongoDB…</div>;
  }

  if (error || !incident) {
    return (
      <div className="surface p-10 text-center">
        <AlertTriangle className="w-8 h-8 text-danger mx-auto mb-3" />
        <p className="text-ink-300">{error || 'Incident not found.'}</p>
        <div className="flex justify-center gap-2 mt-4">
          <button className="btn-secondary" onClick={loadIncident}><RefreshCw className="w-4 h-4" /> Retry</button>
          <Link to="/incidents" className="btn-secondary"><ArrowLeft className="w-4 h-4" /> Back to incidents</Link>
        </div>
      </div>
    );
  }

  const status = incident.status ?? 'Open';
  const findingLabel = incident.finding_types.length ? incident.finding_types.join(', ') : 'No static pattern';
  const detectionMethod = incident.detected
    ? incident.context_signals.length > 0 ? 'Pattern + Contextual Analysis' : 'Pattern Detection'
    : incident.context_signals.length > 0 ? 'Contextual Analysis' : 'Policy Analysis';

  const reasonSteps = [
    {
      label: 'Pattern Detection',
      detail: incident.detected ? `${incident.finding_count} sensitive finding(s) detected` : 'No sensitive pattern matched',
      passed: incident.detected,
    },
    {
      label: 'Contextual Analysis',
      detail: incident.context_signals.length
        ? incident.context_signals.map((s) => `${s.signal} (${s.impact > 0 ? '+' : ''}${s.impact})`).join(', ')
        : 'No sensitive context identified',
      passed: incident.context_signals.length > 0,
    },
    {
      label: 'Risk Engine',
      detail: `Risk score ${incident.risk_score} / 100`,
      passed: true,
    },
    {
      label: 'Policy Engine',
      detail: `${incident.policy} → ${incident.action}`,
      passed: true,
    },
  ];

  const rows = [
    { label: 'Incident ID', value: incident.incident_id, icon: Fingerprint, mono: true },
    { label: 'Timestamp', value: formatTimestamp(incident.timestamp), icon: Clock },
    { label: 'Source Employee', value: 'Not captured by security gateway', icon: Fingerprint },
    { label: 'AI Platform', value: 'Not captured by security gateway', icon: Fingerprint },
    { label: 'Risk Score', value: `${incident.risk_score} / 100`, icon: Gauge },
    { label: 'Risk Level', value: incident.risk_level, icon: Gauge, badge: true },
    { label: 'Category', value: categoryFromType(incident.finding_types[0]), icon: ScanSearch },
    { label: 'Detection Method', value: detectionMethod, icon: Eye },
    { label: 'Matched Rule', value: incident.finding_types.length ? `${incident.finding_types[0]}_PATTERN` : '—', icon: Fingerprint, mono: true },
    { label: 'Policy', value: incident.policy, icon: ShieldCheck },
    { label: 'Final Action', value: incident.action, icon: Ban, action: true },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <Link to="/incidents" className="btn-ghost text-sm"><ArrowLeft className="w-4 h-4" /> Incidents</Link>
        <div className="flex items-center gap-2">
          <StatusBadge status={status} />
          <ActionBadge action={incident.action} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="space-y-5">
          <div className="surface p-6 text-center">
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-400 mb-4">Risk Assessment</p>
            <div className="flex justify-center"><RiskScore score={incident.risk_score} level={incident.risk_level} size="lg" /></div>
            <div className="mt-4 flex items-center justify-center gap-2"><RiskBadge level={incident.risk_level} /><ActionBadge action={incident.action} /></div>
            <p className="mt-3 text-xs text-ink-400">Context: <span className="text-ink-200 font-medium">{incident.context_level}</span></p>
          </div>

          <div className="surface p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-400 mb-3">Incident Metadata</p>
            <dl className="space-y-2.5">
              {rows.map((r) => (
                <div key={r.label} className="flex items-center justify-between gap-3 text-sm">
                  <dt className="flex items-center gap-2 text-ink-400"><r.icon className="w-3.5 h-3.5" />{r.label}</dt>
                  <dd className="text-right">
                    {r.badge ? <RiskBadge level={incident.risk_level} size="sm" /> : r.action ? <ActionBadge action={incident.action} /> : <span className={cx('text-ink-200', r.mono && 'font-mono text-sm')}>{r.value}</span>}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </div>

        <div className="lg:col-span-2 space-y-5">
          <div className="surface p-6">
            <div className="flex items-center gap-2 mb-4">
              {incident.action === 'BLOCK' ? <Ban className="w-5 h-5 text-danger" /> : incident.action === 'WARN' ? <AlertTriangle className="w-5 h-5 text-warn" /> : <CheckCircle className="w-5 h-5 text-success" />}
              <h3 className="text-sm font-semibold text-ink-100">{incident.action === 'BLOCK' ? 'Why was this blocked?' : 'Decision Breakdown'}</h3>
            </div>
            <div className="space-y-3">
              {reasonSteps.map((s) => (
                <div key={s.label} className="flex items-start gap-3 rounded-lg border border-ink-700/50 bg-ink-850/40 p-3.5">
                  {s.passed ? <CheckCircle2 className="w-5 h-5 text-success shrink-0 mt-0.5" /> : <X className="w-5 h-5 text-ink-500 shrink-0 mt-0.5" />}
                  <div className="flex-1"><p className="text-sm font-semibold text-ink-100">{s.label}</p><p className="text-xs text-ink-400 mt-0.5">{s.detail}</p></div>
                </div>
              ))}
            </div>
          </div>

          <div className="surface p-6">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">Captured Input</p>
              <span className="chip text-brand-300 bg-brand-500/10 border-brand-500/30"><Eye className="w-3 h-3" /> Not stored</span>
            </div>
            <div className="rounded-lg border border-ink-700/50 bg-ink-950/60 p-4">
              <p className="text-sm text-ink-300">The original submission was intentionally not stored.</p>
              <p className="text-xs text-ink-500 mt-1">Only security metadata, risk factors, and policy results are retained for this incident.</p>
            </div>
            <div className="mt-3"><PrivacyNotice variant="inline" /></div>
          </div>

          {incident.risk_reasons && incident.risk_reasons.length > 0 && (
            <div className="surface p-6">
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-400 mb-4">Risk Contributions</p>
              <div className="space-y-2">
                {incident.risk_reasons.map((reason, index) => (
                  <div key={`${reason.type}-${index}`} className="flex items-center justify-between">
                    <span className="text-xs text-ink-400">{reason.type} × {reason.count}</span>
                    <span className="text-xs font-mono text-ink-200">+{reason.contribution}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between pt-2 mt-2 border-t border-ink-800">
                  <span className="text-xs text-ink-400">Context modifier</span>
                  <span className={cx('text-xs font-mono', incident.context_modifier > 0 ? 'text-danger' : incident.context_modifier < 0 ? 'text-success' : 'text-ink-300')}>{incident.context_modifier > 0 ? '+' : ''}{incident.context_modifier}</span>
                </div>
              </div>
            </div>
          )}

          <div className="surface p-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-400 mb-4">Context Signals</p>
            {incident.context_signals.length === 0 ? <p className="text-xs text-ink-500">No contextual signals were recorded.</p> : <div className="flex flex-wrap gap-2">{incident.context_signals.map((s, i) => <span key={`${s.signal}-${i}`} className="chip text-ink-300 bg-ink-850 border-ink-700 font-mono">{s.signal} {s.impact > 0 ? '+' : ''}{s.impact}</span>)}</div>}
          </div>

          <div className="surface p-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-400 mb-4">Detection Pipeline</p>
            <DetectionPipeline />
          </div>

          <div className="surface p-5 flex flex-wrap gap-2.5">
            {status === 'Open' && <button className="btn-primary text-sm" disabled={updatingStatus} onClick={() => changeStatus('Acknowledged')}>{updatingStatus ? 'Updating…' : 'Acknowledge Incident'}</button>}
            {status === 'Acknowledged' && <button className="btn-primary text-sm" disabled={updatingStatus} onClick={() => changeStatus('Resolved')}>{updatingStatus ? 'Updating…' : 'Mark Resolved'}</button>}
            <button className="btn-ghost text-sm" onClick={() => toast.push({ type: 'info', title: 'Original input protected', message: 'Sentinel does not retain the submitted sensitive text.' })}>Privacy Details</button>
          </div>
        </div>
      </div>
    </div>
  );
}
