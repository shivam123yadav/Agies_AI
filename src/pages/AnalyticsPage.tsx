import { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from 'recharts';
import { AlertTriangle, Ban, RefreshCw, ShieldCheck, Users, Activity } from 'lucide-react';
import { ChartCard, StatCard } from '@/components/Cards';
import { EmptyState } from '@/components/States';
import { useToast } from '@/components/Toast';
import { cx } from '@/lib/risk';
import { getOrganizationAnalytics, type OrganizationAnalytics } from '@/lib/api';

const ranges = [7, 30, 90] as const;
const palette = ['#ef4444', '#f59e0b', '#10b981', '#06b6d4', '#8b5cf6', '#ec4899'];

export function AnalyticsPage() {
  const [range, setRange] = useState<(typeof ranges)[number]>(30);
  const [data, setData] = useState<OrganizationAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  const load = async (days = range) => {
    setLoading(true);
    try {
      setData(await getOrganizationAnalytics(days));
    } catch (error) {
      toast.push({ type: 'error', title: 'Unable to load analytics', message: error instanceof Error ? error.message : 'Backend unavailable.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(30); }, []);

  const trend = useMemo(() => (data?.trend || []).map((item) => ({
    ...item,
    day: new Date(`${item.date}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
  })), [data]);

  const categories = data?.categories || [];
  const platforms = data?.platforms || [];
  const departments = data?.departments || [];
  const employees = data?.employees || [];
  const riskDistribution = data?.risk_distribution || [];
  const actions = data?.action_distribution || [];
  const detectionMethods = data?.detection_methods || [];

  const tooltipStyle = { background: '#0b1120', border: '1px solid #233150', borderRadius: 8, fontSize: 12 };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-base font-semibold text-ink-50">Organization Risk Analytics</h2>
          <p className="text-xs text-ink-400 mt-0.5">Live security telemetry derived from recorded incident metadata.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-ink-700 bg-ink-850 p-0.5">
            {ranges.map((days) => (
              <button key={days} onClick={() => { setRange(days); void load(days); }} className={cx('px-3 py-1.5 text-xs font-medium rounded-md transition-colors', range === days ? 'bg-ink-800 text-ink-50' : 'text-ink-400 hover:text-ink-200')}>
                {days}D
              </button>
            ))}
          </div>
          <button className="btn-secondary text-sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={cx('w-4 h-4', loading && 'animate-spin')} /> Refresh
          </button>
        </div>
      </div>

      {loading && !data ? (
        <div className="surface p-12 text-center text-sm text-ink-400">Loading organization analytics from FastAPI…</div>
      ) : !data ? (
        <EmptyState title="No analytics available" message="Create or record incidents to populate organization risk analytics." icon={Activity} />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Recorded Incidents" value={data.overview.total_incidents} icon={Activity} accent="brand" sub={`${data.overview.employees_impacted} employees impacted`} />
            <StatCard label="Blocked" value={data.overview.blocked} icon={Ban} accent="danger" sub={`${data.overview.block_rate}% block rate`} />
            <StatCard label="High-Risk Events" value={data.overview.high_risk} icon={AlertTriangle} accent="warn" sub={`Avg risk ${data.overview.average_risk}/100`} />
            <StatCard label="Employees Impacted" value={data.overview.employees_impacted} icon={Users} accent="info" sub={`${data.overview.departments_impacted} departments`} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartCard title="Incident & Risk Trend" subtitle={`Daily activity over the last ${range} days`}>
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={trend} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="orgRisk" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#f59e0b" stopOpacity={0.35} /><stop offset="100%" stopColor="#f59e0b" stopOpacity={0} /></linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1a2440" vertical={false} />
                  <XAxis dataKey="day" stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} minTickGap={24} />
                  <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: '#94a3b8' }} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
                  <Area type="monotone" dataKey="incidents" name="Incidents" stroke="#06b6d4" fill="none" strokeWidth={2} />
                  <Area type="monotone" dataKey="average_risk" name="Avg Risk" stroke="#f59e0b" fill="url(#orgRisk)" strokeWidth={2} />
                  <Area type="monotone" dataKey="blocked" name="Blocked" stroke="#ef4444" fill="none" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Risk Distribution" subtitle="Recorded incidents by risk level">
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={riskDistribution} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={48} outerRadius={82} paddingAngle={3}>
                    {riskDistribution.map((entry, index) => <Cell key={entry.name} fill={palette[index % palette.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <ChartCard title="Security Actions" subtitle="Recorded enforcement outcomes">
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={actions} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={42} outerRadius={72} paddingAngle={3}>
                    {actions.map((entry, index) => <Cell key={entry.name} fill={index === 0 ? '#ef4444' : '#f59e0b'} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} /><Legend iconType="circle" wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>
            <ChartCard title="Detection Signals" subtitle="Pattern findings vs contextual signals">
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={detectionMethods} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={42} outerRadius={72} paddingAngle={3}>
                    {detectionMethods.map((entry, index) => <Cell key={entry.name} fill={index === 0 ? '#06b6d4' : '#8b5cf6'} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} /><Legend iconType="circle" wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>
            <ChartCard title="AI Platform Usage" subtitle="Recorded incidents by platform">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={platforms} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1a2440" vertical={false} />
                  <XAxis dataKey="platform" stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} angle={-15} textAnchor="end" height={45} />
                  <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} /><Bar dataKey="incidents" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartCard title="Top Incident Categories" subtitle="Most frequently detected sensitive-data types">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={categories.slice(0, 8)} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1a2440" vertical={false} />
                  <XAxis dataKey="category" stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} angle={-20} textAnchor="end" height={55} />
                  <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} /><Bar dataKey="count" fill="#06b6d4" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Department Risk" subtitle="Compare incident exposure across departments">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead><tr className="border-b border-ink-800/60"><th className="table-header text-left py-3">Department</th><th className="table-header text-right py-3">Incidents</th><th className="table-header text-right py-3">Avg Risk</th><th className="table-header text-right py-3">Blocked</th></tr></thead>
                  <tbody className="divide-y divide-ink-800/60">
                    {departments.map((d) => <tr key={d.department} className="hover:bg-ink-850/40"><td className="table-cell font-medium">{d.department}</td><td className="table-cell text-right font-mono">{d.incidents}</td><td className="table-cell text-right font-mono font-semibold">{d.average_risk}</td><td className="table-cell text-right font-mono text-danger">{d.blocked}</td></tr>)}
                    {!departments.length && <tr><td colSpan={4} className="text-center text-sm text-ink-500 py-8">No department incidents recorded.</td></tr>}
                  </tbody>
                </table>
              </div>
            </ChartCard>
          </div>

          <ChartCard title="Employee Risk Leaderboard" subtitle="Highest average risk exposure first">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead><tr className="border-b border-ink-800/60"><th className="table-header text-left py-3">Employee</th><th className="table-header text-left py-3">Department</th><th className="table-header text-right py-3">Incidents</th><th className="table-header text-right py-3">Avg Risk</th><th className="table-header text-right py-3">High Risk</th><th className="table-header text-right py-3">Block Rate</th><th className="table-header text-left py-3">Top Violation</th></tr></thead>
                <tbody className="divide-y divide-ink-800/60">
                  {employees.map((e) => <tr key={e.employee_id} className="hover:bg-ink-850/40"><td className="table-cell font-medium text-ink-100">{e.employee_name}</td><td className="table-cell text-ink-400">{e.department}</td><td className="table-cell text-right font-mono">{e.incidents}</td><td className="table-cell text-right font-mono font-semibold">{e.average_risk}</td><td className="table-cell text-right font-mono text-danger">{e.high_risk_events}</td><td className="table-cell text-right font-mono">{e.block_rate}%</td><td className="table-cell text-ink-300">{e.top_violation}</td></tr>)}
                  {!employees.length && <tr><td colSpan={7} className="text-center text-sm text-ink-500 py-8">No employee incidents recorded in this range.</td></tr>}
                </tbody>
              </table>
            </div>
          </ChartCard>

          <div className="surface p-4 flex items-start gap-3 border-brand-500/20">
            <ShieldCheck className="w-5 h-5 text-brand-300 mt-0.5 shrink-0" />
            <div><p className="text-sm font-medium text-ink-100">Privacy-first analytics</p><p className="text-xs text-ink-400 mt-1">Organization analytics are calculated from incident metadata only. Sentinel does not need to retain raw sensitive prompts to produce these security metrics.</p></div>
          </div>
        </>
      )}
    </div>
  );
}
