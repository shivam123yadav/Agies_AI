import { useEffect, useMemo, useState } from 'react';
import {
  Plus,
  Pencil,
  Trash2,
  ShieldCheck,
  RefreshCw,
  Search,
} from 'lucide-react';

import { ActionBadge, StatusBadge, RiskBadge } from '@/components/Risk';
import { SectionCard } from '@/components/Cards';
import { Modal, ConfirmDialog } from '@/components/Modal';
import { EmptyState, LoadingState, ErrorState } from '@/components/States';
import { useToast } from '@/components/Toast';
import { cx } from '@/lib/risk';

import {
  createPolicy,
  deletePolicy,
  getPolicies,
  updatePolicy,
} from '@/lib/api';

import type { Policy, ActionType } from '@/types';
import type { BackendPolicy } from '@/lib/api';

const ranges = [
  {
    label: 'LOW RISK',
    min: 0,
    max: 39,
    action: 'ALLOW' as ActionType,
    tone: 'success',
  },
  {
    label: 'MEDIUM RISK',
    min: 40,
    max: 69,
    action: 'WARN' as ActionType,
    tone: 'warn',
  },
  {
    label: 'HIGH RISK',
    min: 70,
    max: 100,
    action: 'BLOCK' as ActionType,
    tone: 'danger',
  },
];

function toPolicy(p: BackendPolicy): Policy {
  return {
    id: p.policy_id,
    name: p.name,
    category: p.category,
    riskMin: p.risk_min,
    riskMax: p.risk_max,
    action: p.action,
    status: p.status,
    lastUpdated: new Date(p.last_updated).toLocaleDateString('en-CA'),
    description: p.description,
  };
}

function toBackend(p: Policy) {
  return {
    name: p.name,
    category: p.category,
    risk_min: p.riskMin,
    risk_max: p.riskMax,
    action: p.action,
    status: p.status,
    description: p.description,
  } as const;
}

export function PoliciesPage() {
  const [items, setItems] = useState<Policy[]>([]);
  const [query, setQuery] = useState('');
  const [actionFilter, setActionFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  const [editing, setEditing] = useState<Policy | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const toast = useToast();

  const load = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await getPolicies();
      setItems(response.policies.map(toPolicy));
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to load policies',
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();

    return items.filter((p) => {
      if (
        q &&
        !`${p.name} ${p.category} ${p.description} ${p.action}`
          .toLowerCase()
          .includes(q)
      ) {
        return false;
      }

      if (actionFilter !== 'All' && p.action !== actionFilter) {
        return false;
      }

      if (statusFilter !== 'All' && p.status !== statusFilter) {
        return false;
      }

      return true;
    });
  }, [items, query, actionFilter, statusFilter]);

  const save = async (p: Policy) => {
    try {
      setSaving(p.id || 'new');

      const response = p.id
        ? await updatePolicy(p.id, toBackend(p))
        : await createPolicy(toBackend(p));

      const saved = toPolicy(response.policy);

      setItems((prev) => {
        const exists = prev.some((x) => x.id === saved.id);

        if (exists) {
          return prev.map((x) =>
            x.id === saved.id ? saved : x,
          );
        }

        return [...prev, saved];
      });

      setEditing(null);
      setCreating(false);

      toast.push({
        type: 'success',
        title: 'Policy saved',
        message: `${saved.name} is now stored in the backend.`,
      });
    } catch (err) {
      toast.push({
        type: 'error',
        title: 'Policy save failed',
        message:
          err instanceof Error
            ? err.message
            : 'Unable to save policy.',
      });
    } finally {
      setSaving(null);
    }
  };

  const toggleStatus = async (policy: Policy) => {
    const nextStatus =
      policy.status === 'Active'
        ? 'Disabled'
        : 'Active';

    try {
      setSaving(policy.id);

      const response = await updatePolicy(
        policy.id,
        toBackend({
          ...policy,
          status: nextStatus,
        }),
      );

      const updated = toPolicy(response.policy);

      setItems((prev) =>
        prev.map((p) =>
          p.id === updated.id ? updated : p,
        ),
      );

      toast.push({
        type: 'info',
        title:
          nextStatus === 'Active'
            ? 'Policy enabled'
            : 'Policy disabled',
        message: policy.name,
      });
    } catch (err) {
      toast.push({
        type: 'error',
        title: 'Policy update failed',
        message:
          err instanceof Error
            ? err.message
            : 'Unable to update policy.',
      });
    } finally {
      setSaving(null);
    }
  };

  const remove = async (id: string) => {
    try {
      setSaving(id);

      await deletePolicy(id);

      setItems((prev) =>
        prev.filter((p) => p.id !== id),
      );

      toast.push({
        type: 'info',
        title: 'Policy deleted',
        message: 'The policy was removed from the backend.',
      });
    } catch (err) {
      toast.push({
        type: 'error',
        title: 'Policy deletion failed',
        message:
          err instanceof Error
            ? err.message
            : 'Unable to delete policy.',
      });
    } finally {
      setSaving(null);
      setDeleteId(null);
    }
  };

  const activeCount = items.filter(
    (p) => p.status === 'Active',
  ).length;

  const blockedCount = items.filter(
    (p) => p.action === 'BLOCK',
  ).length;

  const warningCount = items.filter(
    (p) => p.action === 'WARN',
  ).length;

  const allowCount = items.filter(
    (p) => p.action === 'ALLOW',
  ).length;

  if (loading) {
    return <LoadingState message="Loading policies…" />;
  }

  if (error) {
    return (
      <ErrorState
        title="Policies unavailable"
        message={error}
        onRetry={load}
      />
    );
  }

  return (
    <div className="space-y-5">

      {/* Risk Policy Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

        <div className="surface p-5 border-l-4 border-l-success">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-success" />
            <h3 className="text-sm font-semibold text-ink-100">
              Active Policies
            </h3>
          </div>

          <p className="mt-2 text-2xl font-display font-bold text-ink-50">
            {activeCount}
            <span className="text-sm text-ink-500">
              {' '}/ {items.length}
            </span>
          </p>

          <p className="text-xs text-ink-400">
            Currently enforced by backend
          </p>
        </div>

        <div className="surface p-5 border-l-4 border-l-danger">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-danger" />
            <h3 className="text-sm font-semibold text-ink-100">
              Blocking Policies
            </h3>
          </div>

          <p className="mt-2 text-2xl font-display font-bold text-ink-50">
            {blockedCount}
          </p>

          <p className="text-xs text-ink-400">
            Policies capable of blocking
          </p>
        </div>

        <div className="surface p-5 border-l-4 border-l-warn">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-warn" />
            <h3 className="text-sm font-semibold text-ink-100">
              Warning Policies
            </h3>
          </div>

          <p className="mt-2 text-2xl font-display font-bold text-ink-50">
            {warningCount}
          </p>

          <p className="text-xs text-ink-400">
            Policies that generate warnings
          </p>
        </div>

        <div className="surface p-5 border-l-4 border-l-brand-500">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-brand-300" />
            <h3 className="text-sm font-semibold text-ink-100">
              Allow Policies
            </h3>
          </div>

          <p className="mt-2 text-2xl font-display font-bold text-ink-50">
            {allowCount}
          </p>

          <p className="text-xs text-ink-400">
            Policies allowing low-risk activity
          </p>
        </div>

      </div>

      {/* Risk Model */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {ranges.map((r) => (
          <div
            key={r.label}
            className={cx(
              'surface p-5 border-l-4',
              r.tone === 'success' && 'border-l-success',
              r.tone === 'warn' && 'border-l-warn',
              r.tone === 'danger' && 'border-l-danger',
            )}
          >
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">
              {r.label}
            </p>

            <p className="mt-1 text-2xl font-display font-bold text-ink-50">
              {r.min}–{r.max}
            </p>

            <div className="mt-2">
              <ActionBadge action={r.action} />
            </div>
          </div>
        ))}
      </div>

      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-brand-400" />

          <h2 className="text-base font-semibold text-ink-50">
            Security Policies
          </h2>

          <span className="text-xs text-ink-400">
            ({filtered.length}
            {filtered.length !== items.length
              ? ` / ${items.length}`
              : ''})
          </span>
        </div>

        <div className="flex gap-2">
          <button
            className="btn-secondary text-sm inline-flex items-center gap-2"
            onClick={() => void load()}
            disabled={loading}
          >
            <RefreshCw
              className={cx(
                'w-4 h-4',
                loading && 'animate-spin',
              )}
            />
            Refresh
          </button>

          <button
            className="btn-primary text-sm inline-flex items-center gap-2"
            onClick={() => setCreating(true)}
          >
            <Plus className="w-4 h-4" />
            New Policy
          </button>
        </div>
      </div>

      {/* Search / Filters */}
      <div className="surface p-4">
        <div className="flex flex-col lg:flex-row gap-3">

          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-500" />

            <input
              className="input pl-10"
              placeholder="Search policies…"
              value={query}
              onChange={(e) =>
                setQuery(e.target.value)
              }
            />
          </div>

          <div className="flex gap-2">

            <select
              aria-label="Action"
              value={actionFilter}
              onChange={(e) =>
                setActionFilter(e.target.value)
              }
              className="appearance-none bg-ink-850 border border-ink-700 rounded-lg px-3 pr-8 py-2.5 text-sm text-ink-100 focus:outline-none focus:border-brand-500/60 cursor-pointer"
            >
              <option value="All">
                All Actions
              </option>
              <option value="ALLOW">
                ALLOW
              </option>
              <option value="WARN">
                WARN
              </option>
              <option value="BLOCK">
                BLOCK
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
              <option value="Draft">
                Draft
              </option>
              <option value="Disabled">
                Disabled
              </option>
            </select>

          </div>
        </div>
      </div>

      {/* Policy Cards */}
      {filtered.length === 0 ? (
        <SectionCard>
          <EmptyState
            title="No policies found."
            message="Try adjusting your search or filters."
            icon={ShieldCheck}
          />
        </SectionCard>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

          {filtered.map((p) => (
            <div
              key={p.id}
              className="surface p-5 hover:border-brand-500/30 transition-colors group"
            >

              {/* Policy heading */}
              <div className="flex items-start justify-between gap-3">

                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-ink-100 truncate">
                    {p.name}
                  </h3>

                  <p className="text-xs text-ink-400 mt-0.5">
                    {p.category}
                  </p>
                </div>

                <StatusBadge status={p.status} />

              </div>

              {/* Description */}
              <p className="mt-3 text-xs text-ink-400 leading-relaxed line-clamp-2">
                {p.description}
              </p>

              {/* Risk */}
              <div className="mt-4 flex items-center justify-between">

                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-ink-300">
                    Risk {p.riskMin}–{p.riskMax}
                  </span>

                  <RiskBadge
                    level={
                      p.riskMax >= 70
                        ? 'HIGH'
                        : p.riskMax >= 40
                          ? 'MEDIUM'
                          : 'LOW'
                    }
                    size="sm"
                  />

                  <ActionBadge action={p.action} />
                </div>

              </div>

              {/* Footer */}
              <div className="mt-4 pt-3 border-t border-ink-800/60 flex items-center justify-between">

                <span className="text-[11px] text-ink-500">
                  Updated {p.lastUpdated}
                </span>

                <span className="text-[11px] font-mono text-ink-600">
                  {p.id}
                </span>

              </div>

              {/* Controls */}
              <div className="mt-3 pt-3 border-t border-ink-800/60 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">

                <button
                  className="btn-ghost text-xs inline-flex items-center gap-1.5"
                  onClick={() => setEditing(p)}
                >
                  <Pencil className="w-3.5 h-3.5" />
                  Edit
                </button>

                <button
                  className="btn-ghost text-xs"
                  onClick={() => void toggleStatus(p)}
                  disabled={saving === p.id}
                >
                  {saving === p.id
                    ? 'Saving…'
                    : p.status === 'Active'
                      ? 'Disable'
                      : 'Enable'}
                </button>

                <button
                  className="btn-ghost text-xs text-danger hover:text-danger inline-flex items-center gap-1.5"
                  onClick={() => setDeleteId(p.id)}
                  disabled={saving === p.id}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete
                </button>

              </div>

            </div>
          ))}

        </div>
      )}

      {/* Protected / Backend notice */}
      <div className="surface p-4 flex gap-3 items-start">
        <ShieldCheck className="w-4 h-4 text-brand-400 mt-0.5" />

        <div>
          <p className="text-xs font-semibold text-ink-200">
            Backend-enforced policy controls
          </p>

          <p className="text-xs text-ink-400 mt-1">
            Policy changes are persisted through the FastAPI backend
            and influence subsequent detection decisions.
          </p>
        </div>
      </div>

      {/* Create / Edit */}
      {(editing || creating) && (
        <PolicyModal
          policy={editing}
          saving={!!saving}
          onClose={() => {
            setEditing(null);
            setCreating(false);
          }}
          onSave={save}
        />
      )}

      {/* Delete */}
      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => {
          if (deleteId) {
            void remove(deleteId);
          }
        }}
        title="Delete policy?"
        message="This policy will be removed from the backend and will no longer influence new detections."
        confirmLabel="Delete"
        danger
      />

    </div>
  );
}

function PolicyModal({
  policy,
  saving,
  onClose,
  onSave,
}: {
  policy: Policy | null;
  saving: boolean;
  onClose: () => void;
  onSave: (p: Policy) => void;
}) {
  const [name, setName] = useState(
    policy?.name ?? '',
  );

  const [category, setCategory] = useState(
    policy?.category ?? 'General',
  );

  const [riskMin, setRiskMin] = useState(
    policy?.riskMin ?? 0,
  );

  const [riskMax, setRiskMax] = useState(
    policy?.riskMax ?? 39,
  );

  const [action, setAction] = useState<ActionType>(
    policy?.action ?? 'ALLOW',
  );

  const [status, setStatus] =
    useState<Policy['status']>(
      policy?.status ?? 'Active',
    );

  const [description, setDescription] =
    useState(policy?.description ?? '');

  const riskError =
    riskMin < 0 ||
    riskMin > 100 ||
    riskMax < 0 ||
    riskMax > 100 ||
    riskMin > riskMax;

  const submit = () => {
    if (!name.trim() || riskError) {
      return;
    }

    onSave({
      id: policy?.id ?? '',
      name: name.trim(),
      category: category.trim() || 'General',
      riskMin,
      riskMax,
      action,
      status,
      lastUpdated: policy?.lastUpdated ?? '',
      description: description.trim(),
    });
  };

  const previewLevel =
    riskMax >= 70
      ? 'HIGH'
      : riskMax >= 40
        ? 'MEDIUM'
        : 'LOW';

  return (
    <Modal
      open
      onClose={onClose}
      title={
        policy
          ? 'Edit Policy'
          : 'New Policy'
      }
      size="md"
      footer={
        <>
          <button
            className="btn-secondary"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </button>

          <button
            className="btn-primary"
            onClick={submit}
            disabled={
              !name.trim() ||
              riskError ||
              saving
            }
          >
            {saving
              ? 'Saving…'
              : 'Save Policy'}
          </button>
        </>
      }
    >
      <div className="space-y-4">

        {/* Name */}
        <div>
          <label className="label">
            Policy Name
          </label>

          <input
            className="input"
            value={name}
            onChange={(e) =>
              setName(e.target.value)
            }
            placeholder="e.g. Block High-Risk Credentials"
          />
        </div>

        {/* Category + Action */}
        <div className="grid grid-cols-2 gap-3">

          <div>
            <label className="label">
              Category
            </label>

            <input
              className="input"
              value={category}
              onChange={(e) =>
                setCategory(e.target.value)
              }
              placeholder="Credentials"
            />
          </div>

          <div>
            <label className="label">
              Action
            </label>

            <select
              className="input"
              value={action}
              onChange={(e) =>
                setAction(
                  e.target.value as ActionType,
                )
              }
            >
              <option value="ALLOW">
                ALLOW
              </option>

              <option value="WARN">
                WARN
              </option>

              <option value="BLOCK">
                BLOCK
              </option>
            </select>
          </div>

        </div>

        {/* Risk */}
        <div>
          <div className="grid grid-cols-2 gap-3">

            <div>
              <label className="label">
                Risk Min
              </label>

              <input
                type="number"
                min={0}
                max={100}
                className="input"
                value={riskMin}
                onChange={(e) =>
                  setRiskMin(
                    Number(e.target.value),
                  )
                }
              />
            </div>

            <div>
              <label className="label">
                Risk Max
              </label>

              <input
                type="number"
                min={0}
                max={100}
                className="input"
                value={riskMax}
                onChange={(e) =>
                  setRiskMax(
                    Number(e.target.value),
                  )
                }
              />
            </div>

          </div>

          {riskError && (
            <p className="text-xs text-danger mt-2">
              Risk values must be between 0 and
              100, and Risk Min cannot exceed
              Risk Max.
            </p>
          )}
        </div>

        {/* Status */}
        <div>
          <label className="label">
            Status
          </label>

          <select
            className="input"
            value={status}
            onChange={(e) =>
              setStatus(
                e.target.value as Policy['status'],
              )
            }
          >
            <option value="Active">
              Active
            </option>

            <option value="Draft">
              Draft
            </option>

            <option value="Disabled">
              Disabled
            </option>
          </select>
        </div>

        {/* Description */}
        <div>
          <label className="label">
            Description
          </label>

          <textarea
            className="input min-h-[90px]"
            value={description}
            onChange={(e) =>
              setDescription(e.target.value)
            }
            placeholder="Describe what this policy does…"
          />
        </div>

        {/* Preview */}
        <div className="surface p-3">
          <div className="flex items-center justify-between">

            <span className="text-xs text-ink-400">
              Policy Preview
            </span>

            <div className="flex items-center gap-2">
              <RiskBadge
                level={previewLevel}
                size="sm"
              />

              <ActionBadge action={action} />
            </div>

          </div>

          <p className="text-xs text-ink-500 mt-2">
            Risk range: {riskMin}–{riskMax}
          </p>
        </div>

      </div>
    </Modal>
  );
}