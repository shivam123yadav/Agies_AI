import { useEffect, useMemo, useState } from 'react';
import {
  Search,
  ScanSearch,
  Eye,
  ShieldCheck,
  Lock,
  RefreshCw,
  Plus,
  Pencil,
  X,
} from 'lucide-react';

import {
  DetectionTypeBadge,
  SeverityBadge,
  StatusBadge,
} from '@/components/Risk';

import {
  EmptyState,
  LoadingState,
  ErrorState,
} from '@/components/States';

import { useToast } from '@/components/Toast';
import { cx } from '@/lib/risk';

import {
  getDetectionRules,
  updateDetectionRuleStatus,
  createDetectionRule,
  updateDetectionRule,
  type BackendDetectionRule,
  type DetectionRuleInput,
} from '@/lib/api';

type RuleFormData = {
  name: string;
  category: string;
  detection_type: 'LOCAL' | 'CONTEXTUAL';
  severity: 'High' | 'Medium' | 'Low';
  pattern: string;
  description: string;
  status: 'Active' | 'Disabled';
  protected: boolean;
};

const emptyForm: RuleFormData = {
  name: '',
  category: '',
  detection_type: 'LOCAL',
  severity: 'Medium',
  pattern: '',
  description: '',
  status: 'Active',
  protected: false,
};

export function DetectionRulesPage() {
  const [rules, setRules] = useState<BackendDetectionRule[]>([]);
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  // Add/Edit modal state
  const [showModal, setShowModal] = useState(false);
  const [editingRule, setEditingRule] =
    useState<BackendDetectionRule | null>(null);

  const [form, setForm] = useState<RuleFormData>(emptyForm);

  const toast = useToast();

  const load = async () => {
    try {
      setLoading(true);
      setError(null);

      const data = await getDetectionRules();
      setRules(data.rules);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to load detection rules',
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(
    () =>
      rules.filter((r) => {
        const q = query.toLowerCase().trim();

        if (
          q &&
          !`${r.name} ${r.description} ${r.category}`
            .toLowerCase()
            .includes(q)
        ) {
          return false;
        }

        if (
          typeFilter !== 'All' &&
          r.detection_type !== typeFilter
        ) {
          return false;
        }

        if (
          statusFilter !== 'All' &&
          r.status !== statusFilter
        ) {
          return false;
        }

        return true;
      }),
    [rules, query, typeFilter, statusFilter],
  );

  const toggle = async (rule: BackendDetectionRule) => {
    const next =
      rule.status === 'Active' ? 'Disabled' : 'Active';

    if (rule.protected && next === 'Disabled') {
      toast.push({
        type: 'info',
        title: 'Protected rule',
        message: `${rule.name} cannot be disabled.`,
      });

      return;
    }

    try {
      setSaving(rule.rule_id);

      const result = await updateDetectionRuleStatus(
        rule.rule_id,
        next,
      );

      setRules((prev) =>
        prev.map((r) =>
          r.rule_id === rule.rule_id ? result.rule : r,
        ),
      );

      toast.push({
        type: 'info',
        title: `Rule ${
          next === 'Active' ? 'enabled' : 'disabled'
        }`,
        message: rule.name,
      });
    } catch (err) {
      toast.push({
        type: 'error',
        title: 'Rule update failed',
        message:
          err instanceof Error
            ? err.message
            : 'Unable to update rule',
      });
    } finally {
      setSaving(null);
    }
  };

  const openAddModal = () => {
    setEditingRule(null);
    setForm(emptyForm);
    setShowModal(true);
  };

  const openEditModal = (rule: BackendDetectionRule) => {
    setEditingRule(rule);

    setForm({
      name: rule.name,
      category: rule.category,
      detection_type: rule.detection_type,
      severity: rule.severity,
      pattern: rule.pattern || '',
      description: rule.description,
      status: rule.status,
      protected: !!rule.protected,
    });

    setShowModal(true);
  };

  const closeModal = () => {
    if (saving === 'form') return;

    setShowModal(false);
    setEditingRule(null);
    setForm(emptyForm);
  };

  const updateField = <K extends keyof RuleFormData>(
    field: K,
    value: RuleFormData[K],
  ) => {
    setForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const saveRule = async () => {
    if (!form.name.trim()) {
      toast.push({
        type: 'info',
        title: 'Rule name required',
        message: 'Please enter a rule name.',
      });
      return;
    }

    if (!form.category.trim()) {
      toast.push({
        type: 'info',
        title: 'Category required',
        message: 'Please enter a category.',
      });
      return;
    }

    if (!form.description.trim()) {
      toast.push({
        type: 'info',
        title: 'Description required',
        message: 'Please enter a description.',
      });
      return;
    }

    if (
      form.detection_type === 'LOCAL' &&
      !form.pattern.trim()
    ) {
      toast.push({
        type: 'info',
        title: 'Pattern required',
        message:
          'Local / Regex rules require a detection pattern.',
      });
      return;
    }

    // Protected rules must remain protected
    if (
      editingRule?.protected &&
      !form.protected
    ) {
      toast.push({
        type: 'info',
        title: 'Protected rule',
        message:
          'Protected security rules cannot be made unprotected.',
      });
      return;
    }

    // Protected rules cannot be disabled
    if (
      editingRule?.protected &&
      form.status === 'Disabled'
    ) {
      toast.push({
        type: 'info',
        title: 'Protected rule',
        message:
          'Protected security rules cannot be disabled.',
      });
      return;
    }

    try {
      setSaving('form');

      const payload: DetectionRuleInput = {
        name: form.name.trim(),
        category: form.category.trim(),
        detection_type: form.detection_type,
        severity: form.severity,
        pattern: form.pattern.trim(),
        description: form.description.trim(),
        status: form.status,
        protected: form.protected,
      };

      if (editingRule) {
        const result = await updateDetectionRule(
          editingRule.rule_id,
          payload,
        );

        setRules((prev) =>
          prev.map((rule) =>
            rule.rule_id === editingRule.rule_id
              ? result.rule
              : rule,
          ),
        );

        toast.push({
          type: 'success',
          title: 'Rule updated',
          message: `${form.name} has been updated successfully.`,
        });
      } else {
        const result = await createDetectionRule(payload);

        setRules((prev) => [
          result.rule,
          ...prev,
        ]);

        toast.push({
          type: 'success',
          title: 'Rule created',
          message: `${form.name} has been added successfully.`,
        });
      }

      closeModal();
    } catch (err) {
      toast.push({
        type: 'error',
        title: editingRule
          ? 'Rule update failed'
          : 'Rule creation failed',
        message:
          err instanceof Error
            ? err.message
            : 'Unable to save detection rule',
      });
    } finally {
      setSaving(null);
    }
  };

  const localCount = rules.filter(
    (r) => r.detection_type === 'LOCAL',
  ).length;

  const contextualCount = rules.filter(
    (r) => r.detection_type === 'CONTEXTUAL',
  ).length;

  const activeCount = rules.filter(
    (r) => r.status === 'Active',
  ).length;

  const protectedCount = rules.filter(
    (r) => r.protected,
  ).length;

  if (loading) {
    return (
      <LoadingState message="Loading detection rules…" />
    );
  }

  if (error) {
    return (
      <ErrorState
        title="Detection rules unavailable"
        message={error}
        onRetry={load}
      />
    );
  }

  return (
    <div className="space-y-5">
      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="surface p-5 border-l-4 border-l-brand-500">
          <div className="flex items-center gap-2">
            <ScanSearch className="w-5 h-5 text-brand-300" />
            <h3 className="text-sm font-semibold text-ink-100">
              Local Pattern Engine
            </h3>
          </div>

          <p className="mt-2 text-2xl font-display font-bold text-ink-50">
            {localCount}
          </p>

          <p className="text-xs text-ink-400">
            Regex rules evaluated before submission
          </p>
        </div>

        <div className="surface p-5 border-l-4 border-l-purple-500">
          <div className="flex items-center gap-2">
            <Eye className="w-5 h-5 text-purple-300" />
            <h3 className="text-sm font-semibold text-ink-100">
              Contextual Engine
            </h3>
          </div>

          <p className="mt-2 text-2xl font-display font-bold text-ink-50">
            {contextualCount}
          </p>

          <p className="text-xs text-ink-400">
            Context signals affecting risk
          </p>
        </div>

        <div className="surface p-5 border-l-4 border-l-success">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-success" />
            <h3 className="text-sm font-semibold text-ink-100">
              Active Rules
            </h3>
          </div>

          <p className="mt-2 text-2xl font-display font-bold text-ink-50">
            {activeCount}
            <span className="text-sm text-ink-500">
              {' '}
              / {rules.length}
            </span>
          </p>

          <p className="text-xs text-ink-400">
            Currently enforced by the backend
          </p>
        </div>

        <div className="surface p-5 border-l-4 border-l-danger">
          <div className="flex items-center gap-2">
            <Lock className="w-5 h-5 text-danger" />
            <h3 className="text-sm font-semibold text-ink-100">
              Protected Guardrails
            </h3>
          </div>

          <p className="mt-2 text-2xl font-display font-bold text-ink-50">
            {protectedCount}
          </p>

          <p className="text-xs text-ink-400">
            Cannot be disabled by configuration
          </p>
        </div>
      </div>

      {/* Search + filters + New Rule */}
      <div className="surface p-4">
        <div className="flex flex-col lg:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-500" />

            <input
              className="input pl-10"
              placeholder="Search rules…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <select
              aria-label="Type"
              value={typeFilter}
              onChange={(e) =>
                setTypeFilter(e.target.value)
              }
              className="appearance-none bg-ink-850 border border-ink-700 rounded-lg px-3 pr-8 py-2.5 text-sm text-ink-100 focus:outline-none focus:border-brand-500/60 cursor-pointer"
            >
              <option value="All">All Types</option>
              <option value="LOCAL">
                Local / Regex
              </option>
              <option value="CONTEXTUAL">
                Contextual / AI
              </option>
            </select>

            <select
              aria-label="Status"
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value)
              }
              className="appearance-none bg-ink-850 border border-ink-700 rounded-lg px-3 pr-8 py-2.5 text-sm text-ink-100 focus:outline-none focus:border-brand-500/60 cursor-pointer"
            >
              <option value="All">
                All Statuses
              </option>
              <option value="Active">
                Active
              </option>
              <option value="Disabled">
                Disabled
              </option>
            </select>

            <button
              onClick={() => void load()}
              className="btn-secondary inline-flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>

            <button
              onClick={openAddModal}
              className="btn-primary inline-flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              New Rule
            </button>
          </div>
        </div>
      </div>

      {/* Rules table */}
      <div className="surface overflow-hidden">
        {filtered.length === 0 ? (
          <EmptyState
            title="No detection rules found."
            message="Try adjusting your filters."
            icon={ScanSearch}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-ink-850/50">
                <tr className="border-b border-ink-800/60">
                  <th className="table-header text-left px-4 py-3">
                    Rule
                  </th>

                  <th className="table-header text-left px-4 py-3">
                    Category
                  </th>

                  <th className="table-header text-left px-4 py-3">
                    Detection Type
                  </th>

                  <th className="table-header text-left px-4 py-3">
                    Severity
                  </th>

                  <th className="table-header text-left px-4 py-3">
                    Status
                  </th>

                  <th className="table-header text-right px-4 py-3">
                    Control
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-ink-800/60">
                {filtered.map((r) => (
                  <tr
                    key={r.rule_id}
                    className="hover:bg-ink-850/40 transition-colors"
                  >
                    <td className="table-cell">
                      <div className="flex items-center gap-2">
                        <p className="font-mono text-sm text-ink-100">
                          {r.name}
                        </p>

                        {r.protected && (
                          <Lock
                            className="w-3.5 h-3.5 text-danger"
                            aria-label="Protected rule"
                          />
                        )}
                      </div>

                      <p className="text-xs text-ink-400 mt-0.5">
                        {r.description}
                      </p>

                      {r.pattern && (
                        <p className="text-[11px] font-mono text-ink-500 mt-1 max-w-xl truncate">
                          {r.pattern}
                        </p>
                      )}
                    </td>

                    <td className="table-cell">
                      {r.category}
                    </td>

                    <td className="table-cell">
                      <DetectionTypeBadge
                        type={r.detection_type}
                      />
                    </td>

                    <td className="table-cell">
                      <SeverityBadge
                        severity={r.severity}
                      />
                    </td>

                    <td className="table-cell">
                      <StatusBadge status={r.status} />
                    </td>

                    <td className="table-cell">
                      <div className="flex items-center justify-end gap-3">
                        {/* Edit */}
                        <button
                          onClick={() =>
                            openEditModal(r)
                          }
                          className="inline-flex items-center gap-1.5 text-xs text-brand-300 hover:text-brand-200 transition-colors"
                          title="Edit rule"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          Edit
                        </button>

                        {/* Enable / Disable */}
                        <button
                          disabled={
                            saving === r.rule_id ||
                            !!r.protected
                          }
                          onClick={() =>
                            void toggle(r)
                          }
                          className={cx(
                            'relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-60',
                            r.status === 'Active'
                              ? 'bg-brand-500'
                              : 'bg-ink-700',
                          )}
                          aria-label={`Toggle ${r.name}`}
                          title={
                            r.protected
                              ? 'Protected security rule'
                              : undefined
                          }
                        >
                          <span
                            className={cx(
                              'inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform',
                              r.status === 'Active'
                                ? 'translate-x-4'
                                : 'translate-x-1',
                            )}
                          />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Security note */}
      <div className="surface p-4 flex gap-3 items-start">
        <Lock className="w-4 h-4 text-danger mt-0.5" />

        <p className="text-xs text-ink-400">
          Protected rules are non-negotiable security guardrails.
          Configuration can tune non-critical detection signals,
          but cannot disable controls that protect credentials,
          payment data, or confidential information sent to
          external AI.
        </p>
      </div>

      {/* Add / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-ink-700 bg-ink-900 shadow-2xl max-h-[90vh] overflow-y-auto">
            {/* Modal header */}
            <div className="flex items-center justify-between p-5 border-b border-ink-800">
              <div>
                <h2 className="text-lg font-display font-bold text-ink-50">
                  {editingRule
                    ? 'Edit Detection Rule'
                    : 'Create Detection Rule'}
                </h2>

                <p className="text-xs text-ink-400 mt-1">
                  {editingRule
                    ? `Editing ${editingRule.rule_id}`
                    : 'Add a new security detection rule'}
                </p>
              </div>

              <button
                onClick={closeModal}
                className="text-ink-400 hover:text-ink-100 transition-colors"
                disabled={saving === 'form'}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal body */}
            <div className="p-5 space-y-4">
              {/* Name */}
              <div>
                <label className="block text-xs font-medium text-ink-300 mb-1.5">
                  Rule Name
                </label>

                <input
                  className="input w-full"
                  placeholder="e.g. API Key Detection"
                  value={form.name}
                  onChange={(e) =>
                    updateField(
                      'name',
                      e.target.value,
                    )
                  }
                />
              </div>

              {/* Category */}
              <div>
                <label className="block text-xs font-medium text-ink-300 mb-1.5">
                  Category
                </label>

                <input
                  className="input w-full"
                  placeholder="e.g. Credentials"
                  value={form.category}
                  onChange={(e) =>
                    updateField(
                      'category',
                      e.target.value,
                    )
                  }
                />
              </div>

              {/* Detection Type + Severity */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-ink-300 mb-1.5">
                    Detection Type
                  </label>

                  <select
                    className="input w-full"
                    value={form.detection_type}
                    onChange={(e) =>
                      updateField(
                        'detection_type',
                        e.target.value as
                          | 'LOCAL'
                          | 'CONTEXTUAL',
                      )
                    }
                  >
                    <option value="LOCAL">
                      Local / Regex
                    </option>

                    <option value="CONTEXTUAL">
                      Contextual / AI
                    </option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-ink-300 mb-1.5">
                    Severity
                  </label>

                  <select
                    className="input w-full"
                    value={form.severity}
                    onChange={(e) =>
                      updateField(
                        'severity',
                        e.target.value as
                          | 'High'
                          | 'Medium'
                          | 'Low',
                      )
                    }
                  >
                    <option value="High">
                      High
                    </option>

                    <option value="Medium">
                      Medium
                    </option>

                    <option value="Low">
                      Low
                    </option>
                  </select>
                </div>
              </div>

              {/* Pattern */}
              <div>
                <label className="block text-xs font-medium text-ink-300 mb-1.5">
                  Detection Pattern
                </label>

                <textarea
                  className="input w-full min-h-[90px] font-mono text-sm"
                  placeholder="Enter regex pattern..."
                  value={form.pattern}
                  onChange={(e) =>
                    updateField(
                      'pattern',
                      e.target.value,
                    )
                  }
                />

                {form.detection_type ===
                  'CONTEXTUAL' && (
                  <p className="text-[11px] text-ink-500 mt-1">
                    Contextual rules may use a descriptive
                    signal instead of a regex pattern.
                  </p>
                )}
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-medium text-ink-300 mb-1.5">
                  Description
                </label>

                <textarea
                  className="input w-full min-h-[90px]"
                  placeholder="Describe what this rule detects..."
                  value={form.description}
                  onChange={(e) =>
                    updateField(
                      'description',
                      e.target.value,
                    )
                  }
                />
              </div>

              {/* Status */}
              <div>
                <label className="block text-xs font-medium text-ink-300 mb-1.5">
                  Status
                </label>

                <select
                  className="input w-full"
                  value={form.status}
                  disabled={!!editingRule?.protected}
                  onChange={(e) =>
                    updateField(
                      'status',
                      e.target.value as
                        | 'Active'
                        | 'Disabled',
                    )
                  }
                >
                  <option value="Active">
                    Active
                  </option>

                  <option value="Disabled">
                    Disabled
                  </option>
                </select>
              </div>

              {/* Protected */}
              <div className="flex items-start gap-3 rounded-lg border border-ink-700/50 bg-ink-850/40 p-3">
                <input
                  type="checkbox"
                  checked={form.protected}
                  disabled={!!editingRule?.protected}
                  onChange={(e) =>
                    updateField(
                      'protected',
                      e.target.checked,
                    )
                  }
                  className="mt-0.5"
                />

                <div>
                  <p className="text-sm text-ink-200">
                    Protected Security Rule
                  </p>

                  <p className="text-xs text-ink-500 mt-0.5">
                    Protected rules cannot be disabled or
                    made unprotected.
                  </p>
                </div>
              </div>
            </div>

            {/* Modal footer */}
            <div className="flex justify-end gap-3 p-5 border-t border-ink-800">
              <button
                onClick={closeModal}
                disabled={saving === 'form'}
                className="btn-secondary"
              >
                Cancel
              </button>

              <button
                onClick={() => void saveRule()}
                disabled={saving === 'form'}
                className="btn-primary inline-flex items-center gap-2"
              >
                {saving === 'form' && (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                )}

                {editingRule
                  ? 'Save Changes'
                  : 'Create Rule'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}