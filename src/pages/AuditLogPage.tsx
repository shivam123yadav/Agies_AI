import { useState } from 'react';
import { Search, ScrollText, Link2, Shield } from 'lucide-react';
import { auditLogs } from '@/mock/auditLogs';
import { RiskBadge } from '@/components/Risk';
import { EmptyState } from '@/components/States';
import { cx } from '@/lib/risk';

export function AuditLogPage() {
  const [query, setQuery] = useState('');
  const [riskFilter, setRiskFilter] = useState('All');

  const filtered = auditLogs.filter((l) => {
    if (query) {
      const q = query.toLowerCase();
      if (!l.event.toLowerCase().includes(q) && !l.actor.toLowerCase().includes(q) && !l.hash.includes(q)) return false;
    }
    if (riskFilter !== 'All' && l.risk !== riskFilter) return false;
    return true;
  });

  return (
    <div className="space-y-5">
      {/* Banner */}
      <div className="surface p-5 border-l-4 border-l-brand-500">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-brand-500/10 flex items-center justify-center">
            <Shield className="w-5 h-5 text-brand-300" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-ink-50">Tamper-Evident Audit Trail</h2>
            <p className="text-xs text-ink-400 mt-0.5">
              Each record is chained by hash to the previous record. Demo audit data — not a blockchain.
            </p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="surface p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-500" />
            <input className="input pl-10" placeholder="Search events, actors, hashes…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <select aria-label="Risk" value={riskFilter} onChange={(e) => setRiskFilter(e.target.value)} className="appearance-none bg-ink-850 border border-ink-700 rounded-lg px-3 pr-8 py-2.5 text-sm text-ink-100 focus:outline-none focus:border-brand-500/60 cursor-pointer">
            <option value="All">All Risks</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
            <option value="—">None</option>
          </select>
        </div>
      </div>

      {/* Chain visualization */}
      <div className="surface p-5">
        <div className="flex items-center gap-2 mb-4">
          <Link2 className="w-4 h-4 text-brand-400" />
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">Hash Chain</p>
        </div>
        <div className="flex items-center gap-1 overflow-x-auto pb-2">
          {filtered.slice(0, 8).map((l, i) => (
            <div key={l.id} className="flex items-center gap-1 shrink-0">
              <div className="flex flex-col items-center gap-1">
                <div className={cx('w-3 h-3 rounded-full', l.risk === 'HIGH' ? 'bg-danger' : l.risk === 'MEDIUM' ? 'bg-warn' : l.risk === 'LOW' ? 'bg-success' : 'bg-ink-600')} />
                <span className="text-[9px] font-mono text-ink-500">{l.hash.slice(0, 4)}</span>
              </div>
              {i < filtered.slice(0, 8).length - 1 && <div className="w-6 h-px bg-ink-700" />}
            </div>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="surface overflow-hidden">
        {filtered.length === 0 ? (
          <EmptyState title="No audit events found." message="Try adjusting your search." icon={ScrollText} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-ink-850/50">
                <tr className="border-b border-ink-800/60">
                  <th className="table-header text-left px-4 py-3">Timestamp</th>
                  <th className="table-header text-left px-4 py-3">Event</th>
                  <th className="table-header text-left px-4 py-3">Actor</th>
                  <th className="table-header text-left px-4 py-3">Action</th>
                  <th className="table-header text-left px-4 py-3">Risk</th>
                  <th className="table-header text-left px-4 py-3">Hash</th>
                  <th className="table-header text-left px-4 py-3">Previous Hash</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-800/60">
                {filtered.map((l) => (
                  <tr key={l.id} className="hover:bg-ink-850/40 transition-colors">
                    <td className="table-cell text-ink-400 whitespace-nowrap">{l.timestamp}</td>
                    <td className="table-cell font-medium text-ink-100">{l.event}</td>
                    <td className="table-cell text-ink-300">{l.actor}</td>
                    <td className="table-cell">
                      <span className="chip text-ink-200 bg-ink-800 border-ink-600">{l.action}</span>
                    </td>
                    <td className="table-cell">
                      {l.risk === '—' ? (
                        <span className="text-ink-500 text-xs">—</span>
                      ) : (
                        <RiskBadge level={l.risk as 'LOW' | 'MEDIUM' | 'HIGH'} size="sm" />
                      )}
                    </td>
                    <td className="table-cell font-mono text-xs text-brand-300">{l.hash}</td>
                    <td className="table-cell font-mono text-xs text-ink-500">{l.previousHash}</td>
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
