import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Users, Puzzle, ShieldCheck, ShieldAlert, RefreshCw, KeyRound, UserPlus, Mail, Building2, Briefcase, User, AlertCircle } from 'lucide-react';
import { RiskBadge } from '@/components/Risk';
import { EmptyState } from '@/components/States';
import { useToast } from '@/components/Toast';
import { Modal } from '@/components/Modal';
import { PairingCodeModal } from '@/components/PairingCodeModal';
import { cx, initials } from '@/lib/risk';
import { getEmployees, createEmployee } from '@/lib/api';
import type { BackendEmployee } from '@/lib/api';

const riskLevels = ['All', 'LOW', 'MEDIUM', 'HIGH'];
const extStatus = ['All', 'Active', 'Inactive'];

export function EmployeesPage() {
  const [employees, setEmployees] = useState<BackendEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [pairingEmployee, setPairingEmployee] = useState<{ employee_id: string; name: string } | null>(null);
  const [query, setQuery] = useState('');
  const [dept, setDept] = useState('All');
  const [risk, setRisk] = useState('All');
  const [ext, setExt] = useState('All');

  // Add Employee modal state
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [department, setDepartment] = useState('');
  const [role, setRole] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const toast = useToast();

  const load = async () => {
    setLoading(true);
    try {
      const response = await getEmployees();
      setEmployees(response.employees);
    } catch (error) {
      toast.push({ type: 'error', title: 'Unable to load employees', message: error instanceof Error ? error.message : 'Backend unavailable.' });
    } finally {
      setLoading(false);
    }
  };

  const validate = () => {
    const errors: Record<string, string> = {};
    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    const trimmedDept = department.trim();
    const trimmedRole = role.trim();

    if (!trimmedName) {
      errors.name = 'Full name is required';
    } else if (trimmedName.length > 120) {
      errors.name = 'Name must be 120 characters or fewer';
    }

    if (!trimmedEmail) {
      errors.email = 'Email address is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      errors.email = 'Please enter a valid email address';
    } else if (trimmedEmail.length > 160) {
      errors.email = 'Email must be 160 characters or fewer';
    }

    if (!trimmedDept) {
      errors.department = 'Department is required';
    } else if (trimmedDept.length > 100) {
      errors.department = 'Department must be 100 characters or fewer';
    }

    if (!trimmedRole) {
      errors.role = 'Role / title is required';
    } else if (trimmedRole.length > 100) {
      errors.role = 'Role must be 100 characters or fewer';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const resetForm = () => {
    setName('');
    setEmail('');
    setDepartment('');
    setRole('');
    setFieldErrors({});
    setFormError(null);
  };

  const handleCreateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setFormError(null);

    if (!validate()) return;

    setSubmitting(true);
    try {
      const res = await createEmployee({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        department: department.trim(),
        role: role.trim(),
      });

      toast.push({
        type: 'success',
        title: 'Employee created',
        message: `${res.employee.name} has been added to the directory.`,
      });

      resetForm();
      setAddModalOpen(false);

      // Refresh employee list
      await load();

      // Proceed immediately to extension pairing for new employee
      setPairingEmployee({
        employee_id: res.employee.employee_id,
        name: res.employee.name,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create employee.';
      setFormError(message);
      toast.push({
        type: 'error',
        title: 'Creation failed',
        message,
      });
    } finally {
      setSubmitting(false);
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
        <div className="flex items-center gap-2">
          <button className="btn-secondary text-sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={cx('w-4 h-4', loading && 'animate-spin')} /> Refresh
          </button>
          <button
            type="button"
            className="btn-primary text-sm inline-flex items-center gap-2"
            onClick={() => {
              resetForm();
              setAddModalOpen(true);
            }}
          >
            <UserPlus className="w-4 h-4" /> Add Employee
          </button>
        </div>
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
                  <th className="table-header text-right px-4 py-3">Action</th>
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
                    <td className="table-cell text-right whitespace-nowrap">
                      <button
                        type="button"
                        className="btn-secondary text-xs py-1 px-2.5 inline-flex items-center gap-1.5 hover:text-brand-300 hover:border-brand-500/40"
                        title={`Generate pairing code for ${e.name}`}
                        onClick={() => setPairingEmployee({ employee_id: e.employee_id, name: e.name })}
                      >
                        <KeyRound className="w-3.5 h-3.5 text-brand-400" />
                        <span>Pair</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <PairingCodeModal
        open={Boolean(pairingEmployee)}
        onClose={() => setPairingEmployee(null)}
        employee={pairingEmployee}
      />

      <Modal
        open={addModalOpen}
        onClose={() => {
          if (!submitting) {
            setAddModalOpen(false);
            resetForm();
          }
        }}
        title="Add Employee"
        size="md"
      >
        <form onSubmit={handleCreateEmployee} className="space-y-4">
          {formError && (
            <div className="p-3 rounded-lg border border-danger/40 bg-risk-highSoft flex items-start gap-2.5 text-danger text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="font-semibold">Creation Error</p>
                <p className="mt-0.5 leading-relaxed">{formError}</p>
              </div>
            </div>
          )}

          <div>
            <label className="label" htmlFor="new-emp-name">Full Name *</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-500" />
              <input
                id="new-emp-name"
                type="text"
                className={cx('input pl-10', fieldErrors.name && 'border-danger focus:border-danger')}
                placeholder="e.g. Maya Lin"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (fieldErrors.name) setFieldErrors((prev) => ({ ...prev, name: '' }));
                }}
                disabled={submitting}
                maxLength={120}
                required
              />
            </div>
            {fieldErrors.name && <p className="text-xs text-danger mt-1">{fieldErrors.name}</p>}
          </div>

          <div>
            <label className="label" htmlFor="new-emp-email">Work Email *</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-500" />
              <input
                id="new-emp-email"
                type="email"
                className={cx('input pl-10', fieldErrors.email && 'border-danger focus:border-danger')}
                placeholder="e.g. maya.lin@northwind.co"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (fieldErrors.email) setFieldErrors((prev) => ({ ...prev, email: '' }));
                }}
                disabled={submitting}
                maxLength={160}
                required
              />
            </div>
            {fieldErrors.email && <p className="text-xs text-danger mt-1">{fieldErrors.email}</p>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="new-emp-dept">Department *</label>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-500" />
                <input
                  id="new-emp-dept"
                  type="text"
                  list="dept-options"
                  className={cx('input pl-10', fieldErrors.department && 'border-danger focus:border-danger')}
                  placeholder="e.g. Security"
                  value={department}
                  onChange={(e) => {
                    setDepartment(e.target.value);
                    if (fieldErrors.department) setFieldErrors((prev) => ({ ...prev, department: '' }));
                  }}
                  disabled={submitting}
                  maxLength={100}
                  required
                />
                <datalist id="dept-options">
                  {departments.map((d) => (
                    <option key={d} value={d} />
                  ))}
                </datalist>
              </div>
              {fieldErrors.department && <p className="text-xs text-danger mt-1">{fieldErrors.department}</p>}
            </div>

            <div>
              <label className="label" htmlFor="new-emp-role">Role / Title *</label>
              <div className="relative">
                <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-500" />
                <input
                  id="new-emp-role"
                  type="text"
                  className={cx('input pl-10', fieldErrors.role && 'border-danger focus:border-danger')}
                  placeholder="e.g. Staff Architect"
                  value={role}
                  onChange={(e) => {
                    setRole(e.target.value);
                    if (fieldErrors.role) setFieldErrors((prev) => ({ ...prev, role: '' }));
                  }}
                  disabled={submitting}
                  maxLength={100}
                  required
                />
              </div>
              {fieldErrors.role && <p className="text-xs text-danger mt-1">{fieldErrors.role}</p>}
            </div>
          </div>

          <div className="rounded-lg border border-ink-800 bg-ink-850/60 p-3 text-xs text-ink-400">
            <p className="leading-relaxed">
              Upon saving, you can generate a one-time pairing code to connect this employee&apos;s Chrome extension.
            </p>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              className="btn-secondary text-sm"
              onClick={() => {
                setAddModalOpen(false);
                resetForm();
              }}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary text-sm inline-flex items-center gap-2"
              disabled={submitting}
            >
              {submitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Saving Employee…</span>
                </>
              ) : (
                <>
                  <UserPlus className="w-4 h-4" />
                  <span>Save & Pair Extension</span>
                </>
              )}
            </button>
          </div>
        </form>
      </Modal>
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
