import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Users, Puzzle, ShieldCheck, ShieldAlert, RefreshCw } from 'lucide-react';
import { RiskBadge } from '@/components/Risk';
import { EmptyState } from '@/components/States';
import { useToast } from '@/components/Toast';
import { cx, initials } from '@/lib/risk';
import { getEmployees } from '@/lib/api';
import type { BackendEmployee } from '@/lib/api';

const riskLevels = ['All', 'LOW', 'MEDIUM', 'HIGH'];
const extStatus = ['All', 'Active', 'Inactive'];

export function EmployeesPage() {
  const [employees, setEmployees] = useState<BackendEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [dept, setDept] = useState('All');
  const [risk, setRisk] = useState('All');
  const [ext, setExt] = useState('All');
  const toast = useToast();

  const load = async () => {
    setLoading(true);
    try {
      const response = await getEmployees();
      setEmployees(response.employees);
    } catch (error) {
      toast.push({ type: 'danger', title: 'Unable to load employees', message: error instanceof Error ? error.message : 'Backend unavailable.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const departments = useMemo(() => Array.from(new Set(employees.map((e) => e.department))).sort(), [employees]);

  const filtered = useMemo(() => {
    let list = [...employees];
    if (query) {
      const q = query.toLowerCase();
      list = list.filter((e) => e.name.toLowerCase().includes(q) || e.email.toLowerCase().includes(q));
    }
    if (dept !== 'All') list = list.filter((e) => e.department === dept);
    if (risk !== 'All') list = list.filter((e) => e.risk_level === risk);
    if (ext !== 'All') list = list.filter((e) => (ext === 'Active' ? e.extension_active : !e.extension_active));
    return list;
  }, [employees, query, dept, risk, ext]);

  const active = employees.filter((e) => e.extension_active).length;
  const highRisk = employees.filter((e) => e.risk_level === 'HIGH').length;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryChip label="Total Employees" value={employees.length} icon={Users} tone="brand" />
        <SummaryChip label="Extension Active" value={active} icon={ShieldCheck} tone="success" />
        <SummaryChip label="High-Risk Users" value={highRisk} icon={ShieldAlert} tone="danger" />
        <SummaryChip label="Departments" value={departments.length} icon={Puzzle} tone="info" />
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-ink-50">Employee Directory</h2>
          <p className="text-xs text-ink-400 mt-0.5">Identity and security activity from the Sentinel backend.</p>
        </div>
        <button className="btn-secondary text-sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={cx('w-4 h-4', loading && 'animate-spin')} /> Refresh
        </button>
      </div>

      <div className="surface p-4">
        <div className="flex flex-col lg:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-500" />
            <input className="input pl-10" placeholder="Search by name or email…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <div className="flex flex-wrap gap-2">
            <FilterSelect label="Department" value={dept} options={['All', ...departments]} onChange={setDept} />
            <FilterSelect label="Risk" value={risk} options={riskLevels} onChange={setRisk} />
            <FilterSelect label="Extension" value={ext} options={extStatus} onChange={setExt} />
          </div>
        </div>
      </div>

      <div className="surface overflow-hidden">
        {loading ? (
          <p className="text-sm text-ink-400 p-8 text-center">Loading employees from FastAPI…</p>
        ) : filtered.length === 0 ? (
          <EmptyState title="No employees match your filters." message="Try adjusting your search or filters." icon={Users} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-ink-850/50">
                <tr className="border-b border-ink-800/60">
                  <th className="table-header text-left px-4 py-3">Employee</th>
                  <th className="table-header text-left px-4 py-3">Department</th>
                  <th className="table-header text-left px-4 py-3">Incidents</th>
                  <th className="table-header text-left px-4 py-3">Risk Score</th>
                  <th className="table-header text-left px-4 py-3">Warnings</th>
                  <th className="table-header text-left px-4 py-3">Blocked</th>
                  <th className="table-header text-left px-4 py-3">Risk Level</th>
                  <th className="table-header text-left px-4 py-3">Extension</th>
                  <th className="table-header text-left px-4 py-3">Last Active</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-800/60">
                {filtered.map((e) => (
                  <tr key={e.employee_id} className="hover:bg-ink-850/40 transition-colors">
                    <td className="table-cell">
                      <Link to={`/employees/${e.employee_id}`} className="flex items-center gap-3 hover:text-brand-300">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-ink-950 shrink-0 bg-brand-300">
                          {initials(e.name)}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-ink-100 truncate">{e.name}</p>
                          <p className="text-xs text-ink-400 truncate">{e.role}</p>
                        </div>
                      </Link>
                    </td>
                    <td className="table-cell">{e.department}</td>
                    <td className="table-cell font-mono">{e.incidents}</td>
                    <td className="table-cell"><span className="font-mono font-semibold">{e.risk_score}</span><span className="text-xs text-ink-500 ml-1">avg</span></td>
                    <td className="table-cell font-mono text-warn">{e.warnings}</td>
                    <td className="table-cell font-mono text-danger">{e.blocked}</td>
                    <td className="table-cell"><RiskBadge level={e.risk_level} size="sm" /></td>
                    <td className="table-cell">
                      <span className={cx('flex items-center gap-1.5 text-xs', e.extension_active ? 'text-success' : 'text-ink-500')}>
                        <span className={cx('w-1.5 h-1.5 rounded-full', e.extension_active ? 'bg-success' : 'bg-ink-600')} />
                        {e.extension_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="table-cell text-ink-400 whitespace-nowrap">
                      {e.last_active ? new Date(e.last_active).toLocaleString() : 'Never'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryChip({ label, value, icon: Icon, tone }: { label: string; value: number; icon: React.ComponentType<{ className?: string }>; tone: string }) {
  const tones: Record<string, string> = { brand: 'text-brand-300 bg-brand-500/10', success: 'text-success bg-success/10', danger: 'text-danger bg-danger/10', info: 'text-info bg-info/10' };
  return <div className="surface p-4 flex items-center gap-3"><div className={cx('w-10 h-10 rounded-lg flex items-center justify-center', tones[tone])}><Icon className="w-5 h-5" /></div><div><p className="text-2xl font-display font-bold text-ink-50">{value}</p><p className="text-xs text-ink-400">{label}</p></div></div>;
}

function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className="appearance-none bg-ink-850 border border-ink-700 rounded-lg px-3 py-2.5 text-sm text-ink-100 focus:outline-none focus:border-brand-500/60 cursor-pointer">
    {options.map((o) => <option key={o} value={o} className="bg-ink-900">{label}: {o}</option>)}
  </select>;
}
