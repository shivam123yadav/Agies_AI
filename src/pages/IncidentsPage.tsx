import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Search,
  SlidersHorizontal,
  ArrowUpDown,
  Inbox,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';
import { RiskBadge, ActionBadge, StatusBadge } from '@/components/Risk';
import { EmptyState } from '@/components/States';
import { cx } from '@/lib/risk';
import { getIncidents, type BackendIncident } from '@/lib/api';

type SortKey = 'timestamp' | 'riskScore' | 'id';

const categories = [
  'All',
  'API Key',
  'PII',
  'Financial',
  'Source Code',
  'Credentials',
  'Database Information',
  'Business Information',
  'Other',
];
const actions = ['All', 'ALLOW', 'WARN', 'BLOCK'];
const riskLevels = ['All', 'LOW', 'MEDIUM', 'HIGH'];
const statuses = ['All', 'Open', 'Acknowledged', 'Resolved'];

function categoryFromType(type?: string): string {
  switch (type) {
    case 'API_KEY':
      return 'API Key';
    case 'EMAIL':
    case 'CREDIT_CARD':
      return 'PII';
    case 'AWS_ACCESS_KEY':
    case 'PRIVATE_KEY':
    case 'PASSWORD_ASSIGNMENT':
      return 'Credentials';
    case 'DATABASE_URL':
      return 'Database Information';
    default:
      return 'Other';
  }
}

function toDisplayIncident(incident: BackendIncident) {
  const firstType = incident.finding_types?.[0];
  return {
    ...incident,
    id: incident.incident_id,
    category: categoryFromType(firstType),
    employeeName: incident.employee_name || 'Unassigned',
    platform: incident.platform || 'Unknown',
    status: incident.status ?? 'Open',
  };
}

export function IncidentsPage() {
  const [incidents, setIncidents] = useState<BackendIncident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [action, setAction] = useState('All');
  const [risk, setRisk] = useState('All');
  const [status, setStatus] = useState('All');
  const [date, setDate] = useState('All');
  const [sortKey, setSortKey] = useState<SortKey>('timestamp');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const perPage = 8;

  const loadIncidents = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await getIncidents(500);
      setIncidents(response.incidents);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load incidents.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadIncidents();
  }, []);

  const filtered = useMemo(() => {
    let list = incidents.map(toDisplayIncident);

    if (query) {
      const q = query.toLowerCase();
      list = list.filter(
        (i) =>
          i.id.toLowerCase().includes(q) ||
          i.category.toLowerCase().includes(q) ||
          i.finding_types.join(' ').toLowerCase().includes(q) ||
          i.policy.toLowerCase().includes(q),
      );
    }

    if (category !== 'All') list = list.filter((i) => i.category === category);
    if (action !== 'All') list = list.filter((i) => i.action === action);
    if (risk !== 'All') list = list.filter((i) => i.risk_level === risk);
    if (status !== 'All') list = list.filter((i) => i.status === status);

    if (date !== 'All') {
      const days = date === 'Today' ? 1 : date === '7D' ? 7 : 30;
      const cutoff = Date.now() - days * 86400000;
      list = list.filter((i) => new Date(i.timestamp).getTime() >= cutoff);
    }

    list.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'timestamp') {
        cmp = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
      } else if (sortKey === 'riskScore') {
        cmp = a.risk_score - b.risk_score;
      } else {
        cmp = a.id.localeCompare(b.id);
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return list;
  }, [incidents, query, category, action, risk, status, date, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const current = Math.min(page, totalPages);
  const paged = filtered.slice((current - 1) * perPage, current * perPage);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const resetFilters = () => {
    setQuery('');
    setCategory('All');
    setAction('All');
    setRisk('All');
    setStatus('All');
    setDate('All');
    setPage(1);
  };

  const activeFilters = [category, action, risk, status, date].filter((f) => f !== 'All').length;

  return (
    <div className="space-y-5">
      <div className="surface p-4">
        <div className="flex flex-col lg:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-500" />
            <input
              className="input pl-10"
              placeholder="Search by incident ID, finding, policy…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Select label="Category" value={category} options={categories} onChange={(v) => { setCategory(v); setPage(1); }} />
            <Select label="Risk" value={risk} options={riskLevels} onChange={(v) => { setRisk(v); setPage(1); }} />
            <Select label="Action" value={action} options={actions} onChange={(v) => { setAction(v); setPage(1); }} />
            <Select label="Status" value={status} options={statuses} onChange={(v) => { setStatus(v); setPage(1); }} />
            <Select label="Date" value={date} options={['All', 'Today', '7D', '30D']} onChange={(v) => { setDate(v); setPage(1); }} />
            <button onClick={loadIncidents} className="btn-ghost text-xs" disabled={loading}>
              <RefreshCw className={cx('w-3.5 h-3.5', loading && 'animate-spin')} /> Refresh
            </button>
            {activeFilters > 0 && (
              <button onClick={resetFilters} className="btn-ghost text-xs">
                <SlidersHorizontal className="w-3.5 h-3.5" /> Clear ({activeFilters})
              </button>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="surface p-4 border border-danger/30 bg-risk-highSoft">
          <div className="flex items-center gap-2 text-danger text-sm">
            <AlertTriangle className="w-4 h-4" />
            <span>{error}</span>
          </div>
          <p className="text-xs text-ink-400 mt-1">Make sure the FastAPI backend and MongoDB are running.</p>
        </div>
      )}

      <div className="surface overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-sm text-ink-400">Loading incidents from MongoDB…</div>
        ) : paged.length === 0 ? (
          <EmptyState
            title="No security incidents found."
            message={incidents.length === 0 ? 'WARN and BLOCK detections will appear here automatically.' : 'Try adjusting your filters or search query.'}
            icon={Inbox}
            action={activeFilters > 0 ? <button className="btn-secondary text-sm" onClick={resetFilters}>Clear filters</button> : undefined}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-ink-850/50">
                <tr className="border-b border-ink-800/60">
                  <Th onClick={() => toggleSort('id')} active={sortKey === 'id'} dir={sortDir}>Incident ID</Th>
                  <Th onClick={() => toggleSort('timestamp')} active={sortKey === 'timestamp'} dir={sortDir}>Timestamp</Th>
                  <th className="table-header text-left px-4 py-3">Finding</th>
                  <Th onClick={() => toggleSort('riskScore')} active={sortKey === 'riskScore'} dir={sortDir}>Risk Score</Th>
                  <th className="table-header text-left px-4 py-3">Risk Level</th>
                  <th className="table-header text-left px-4 py-3">Action</th>
                  <th className="table-header text-left px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-800/60">
                {paged.map((inc) => (
                  <tr key={inc.id} className="hover:bg-ink-850/40 transition-colors group">
                    <td className="table-cell">
                      <Link to={`/incidents/${inc.id}`} className="font-mono text-brand-300 hover:text-brand-200 group-hover:underline">
                        {inc.id}
                      </Link>
                    </td>
                    <td className="table-cell text-ink-400 whitespace-nowrap">{formatTimestamp(inc.timestamp)}</td>
                    <td className="table-cell">
                      <span className="font-medium">{inc.finding_types.length ? inc.finding_types.join(', ') : inc.category}</span>
                    </td>
                    <td className="table-cell font-mono">{inc.risk_score}</td>
                    <td className="table-cell"><RiskBadge level={inc.risk_level} size="sm" /></td>
                    <td className="table-cell"><ActionBadge action={inc.action} /></td>
                    <td className="table-cell"><StatusBadge status={inc.status ?? 'Open'} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && paged.length > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-ink-800/60">
            <p className="text-xs text-ink-400">
              Showing {(current - 1) * perPage + 1}–{Math.min(current * perPage, filtered.length)} of {filtered.length}
            </p>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={current === 1} className="btn-ghost p-1.5 disabled:opacity-40" aria-label="Previous page">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs text-ink-300 px-2">{current} / {totalPages}</span>
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={current === totalPages} className="btn-ghost p-1.5 disabled:opacity-40" aria-label="Next page">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function formatTimestamp(timestamp: string) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;
  return date.toLocaleString();
}

function Th({ children, onClick, active, dir }: { children: React.ReactNode; onClick: () => void; active: boolean; dir: 'asc' | 'desc' }) {
  return (
    <th className="table-header text-left px-4 py-3">
      <button onClick={onClick} className="inline-flex items-center gap-1 hover:text-ink-200 transition-colors">
        {children}
        <ArrowUpDown className={cx('w-3 h-3', active && 'text-brand-400')} />
        {active && <span className="text-[10px] text-brand-400">{dir === 'asc' ? '↑' : '↓'}</span>}
      </button>
    </th>
  );
}

function Select({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <div className="relative">
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className="appearance-none bg-ink-850 border border-ink-700 rounded-lg pl-3 pr-8 py-2.5 text-sm text-ink-100 focus:outline-none focus:border-brand-500/60 cursor-pointer">
        {options.map((o) => <option key={o} value={o} className="bg-ink-900">{label}: {o}</option>)}
      </select>
      <ChevronRight className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-500 rotate-90 pointer-events-none" />
    </div>
  );
}
