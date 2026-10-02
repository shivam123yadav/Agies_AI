import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Mail, Building2, Briefcase, Clock, ShieldCheck, ShieldAlert, AlertOctagon, Ban, Puzzle, RefreshCw } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar } from 'recharts';
import { getEmployee } from '@/lib/api';
import type { BackendEmployee, BackendIncident } from '@/lib/api';
import { RiskBadge, ActionBadge, StatusBadge } from '@/components/Risk';
import { PrivacyNotice } from '@/components/PrivacyNotice';
import { SectionCard, ChartCard } from '@/components/Cards';
import { useToast } from '@/components/Toast';
import { cx, initials } from '@/lib/risk';

export function EmployeeDetailsPage() {
  const { id } = useParams();
  const [employee, setEmployee] = useState<(BackendEmployee & { stats: any; incidents_detail: BackendIncident[] }) | null>(null);
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  const load = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const response = await getEmployee(id);
      setEmployee(response.employee);
    } catch (error) {
      setEmployee(null);
      toast.push({ type: 'error', title: 'Unable to load employee', message: error instanceof Error ? error.message : 'Backend unavailable.' });
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, [id]);

  if (loading) return <div className="surface p-10 text-center text-sm text-ink-400">Loading employee from FastAPI…</div>;
  if (!employee) return <div className="surface p-10 text-center"><p className="text-ink-300">Employee not found.</p><Link to="/employees" className="btn-secondary mt-4 inline-flex"><ArrowLeft className="w-4 h-4" /> Back to employees</Link></div>;

  const stats = employee.stats;
  const trendData = (stats.risk_trend || []).map((v: any, i: number) => ({ day: new Date(v.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) || `D${i + 1}`, risk: v.risk_score }));
  const categoryData = Object.entries(stats.category_breakdown || {}).map(([category, count]) => ({ category, count }));
  const trendColor = employee.risk_level === 'HIGH' ? '#ef4444' : employee.risk_level === 'MEDIUM' ? '#f59e0b' : '#10b981';

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <Link to="/employees" className="btn-ghost text-sm"><ArrowLeft className="w-4 h-4" /> Employees</Link>
        <button className="btn-secondary text-sm" onClick={() => void load()} disabled={loading}><RefreshCw className={cx('w-4 h-4', loading && 'animate-spin')} /> Refresh</button>
      </div>

      <div className="surface p-6">
        <div className="flex flex-col sm:flex-row items-start gap-5">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-xl font-bold text-ink-950 shrink-0 bg-brand-300">{initials(employee.name)}</div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap"><h2 className="text-xl font-display font-bold text-ink-50">{employee.name}</h2><RiskBadge level={employee.risk_level} /></div>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-ink-400">
              <span className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" /> {employee.email}</span>
              <span className="flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5" /> {employee.department}</span>
              <span className="flex items-center gap-1.5"><Briefcase className="w-3.5 h-3.5" /> {employee.role}</span>
              <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> {employee.last_active ? new Date(employee.last_active).toLocaleString() : 'Never active'}</span>
            </div>
          </div>
          <div className={cx('flex items-center gap-2 rounded-lg border px-3 py-2', employee.extension_active ? 'border-success/30 bg-risk-lowSoft' : 'border-ink-700 bg-ink-850')}>
            <Puzzle className={cx('w-4 h-4', employee.extension_active ? 'text-success' : 'text-ink-500')} />
            <span className={cx('text-xs font-medium', employee.extension_active ? 'text-success' : 'text-ink-400')}>{employee.extension_active ? 'Extension Active' : 'Extension Inactive'}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryStat label="Total Incidents" value={stats.incidents} icon={AlertOctagon} tone="brand" />
        <SummaryStat label="Warnings" value={stats.warnings} icon={ShieldAlert} tone="warn" />
        <SummaryStat label="Blocked" value={stats.blocked} icon={Ban} tone="danger" />
        <SummaryStat label="Risk Score" value={`${stats.risk_score}/100`} icon={ShieldCheck} tone={stats.risk_level === 'HIGH' ? 'danger' : stats.risk_level === 'MEDIUM' ? 'warn' : 'success'} />
        <SummaryStat label="High-Risk Events" value={stats.high_risk_events} icon={AlertOctagon} tone="danger" />
        <SummaryStat label="Block Rate" value={`${stats.block_rate}%`} icon={Ban} tone="danger" />
        <SummaryStat label="Top Violation" value={stats.top_violation} icon={ShieldAlert} tone="warn" />
        <SummaryStat label="Current Risk" value={stats.risk_level} icon={ShieldCheck} tone={stats.risk_level === 'HIGH' ? 'danger' : stats.risk_level === 'MEDIUM' ? 'warn' : 'success'} />
      </div>

      <SectionCard title="Security Risk Profile" subtitle="Derived from this employee's incident history">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <ProfileMetric label="Average Risk Score" value={`${stats.risk_score}/100`} detail="Average across recorded incidents" />
          <ProfileMetric label="High-Risk Activity" value={`${stats.high_risk_events} events`} detail="Incidents scoring 70 or above" />
          <ProfileMetric label="Top Violation" value={stats.top_violation} detail="Most frequently detected finding" />
        </div>
        <div className="mt-5">
          <div className="flex items-center justify-between text-xs mb-2"><span className="text-ink-400">Average risk exposure</span><span className="font-mono text-ink-200">{stats.risk_score}/100</span></div>
          <div className="h-2 rounded-full bg-ink-800 overflow-hidden"><div className={cx('h-full rounded-full transition-all', stats.risk_level === 'HIGH' ? 'bg-danger' : stats.risk_level === 'MEDIUM' ? 'bg-warn' : 'bg-success')} style={{ width: `${Math.min(100, Math.max(0, stats.risk_score))}%` }} /></div>
        </div>
      </SectionCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ChartCard title="Risk Trend" subtitle="Risk score over recent activity">
          {trendData.length === 0 ? <p className="text-sm text-ink-500 p-6">No risk activity yet.</p> : <ResponsiveContainer width="100%" height={220}><AreaChart data={trendData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}><defs><linearGradient id="empRiskLive" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={trendColor} stopOpacity={0.4} /><stop offset="100%" stopColor={trendColor} stopOpacity={0} /></linearGradient></defs><CartesianGrid strokeDasharray="3 3" stroke="#1a2440" vertical={false} /><XAxis dataKey="day" stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} /><YAxis domain={[0, 100]} stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} /><Tooltip contentStyle={{ background: '#0b1120', border: '1px solid #233150', borderRadius: 8, fontSize: 12 }} /><Area type="monotone" dataKey="risk" stroke={trendColor} strokeWidth={2} fill="url(#empRiskLive)" /></AreaChart></ResponsiveContainer>}
        </ChartCard>
        <ChartCard title="Incident Categories" subtitle="Breakdown by detected type">
          {categoryData.length === 0 ? <p className="text-sm text-ink-500 p-6">No incidents recorded yet.</p> : <ResponsiveContainer width="100%" height={220}><BarChart data={categoryData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" stroke="#1a2440" vertical={false} /><XAxis dataKey="category" stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} /><YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} /><Tooltip contentStyle={{ background: '#0b1120', border: '1px solid #233150', borderRadius: 8, fontSize: 12 }} /><Bar dataKey="count" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer>}
        </ChartCard>
      </div>

      <SectionCard title="Recent Incidents" subtitle="Metadata only — raw prompts are never stored">
        {employee.incidents_detail.length === 0 ? <p className="text-sm text-ink-400 py-6 text-center">No incidents recorded for this employee.</p> : <div className="overflow-x-auto -mx-5"><table className="w-full"><thead className="bg-ink-850/50"><tr className="border-b border-ink-800/60"><th className="table-header text-left px-5 py-3">Incident</th><th className="table-header text-left px-4 py-3">Risk</th><th className="table-header text-left px-4 py-3">Action</th><th className="table-header text-left px-4 py-3">Status</th><th className="table-header text-left px-4 py-3">Time</th></tr></thead><tbody className="divide-y divide-ink-800/60">{employee.incidents_detail.map((inc) => <tr key={inc.incident_id} className="hover:bg-ink-850/40"><td className="table-cell px-5"><Link to={`/incidents/${inc.incident_id}`} className="font-mono text-brand-300 hover:text-brand-200">{inc.incident_id}</Link></td><td className="table-cell"><span className="font-mono mr-2">{inc.risk_score}</span><RiskBadge level={inc.risk_level} size="sm" /></td><td className="table-cell"><ActionBadge action={inc.action} /></td><td className="table-cell"><StatusBadge status={inc.status || 'Open'} /></td><td className="table-cell text-ink-400">{new Date(inc.timestamp).toLocaleString()}</td></tr>)}</tbody></table></div>}
      </SectionCard>
      <PrivacyNotice />
    </div>
  );
}

function ProfileMetric({ label, value, detail }: { label: string; value: string | number; detail: string }) {
  return <div className="rounded-xl border border-ink-800/70 bg-ink-850/40 p-4"><p className="text-xs text-ink-500">{label}</p><p className="mt-1 text-lg font-semibold text-ink-100 truncate">{value}</p><p className="mt-1 text-xs text-ink-500">{detail}</p></div>;
}

function SummaryStat({ label, value, icon: Icon, tone }: { label: string; value: string | number; icon: React.ComponentType<{ className?: string }>; tone: string }) {
  const tones: Record<string, string> = { brand: 'text-brand-300 bg-brand-500/10', success: 'text-success bg-success/10', warn: 'text-warn bg-warn/10', danger: 'text-danger bg-danger/10' };
  return <div className="surface p-4 flex items-center gap-3"><div className={cx('w-10 h-10 rounded-lg flex items-center justify-center', tones[tone])}><Icon className="w-5 h-5" /></div><div><p className="text-2xl font-display font-bold text-ink-50">{value}</p><p className="text-xs text-ink-400">{label}</p></div></div>;
}
