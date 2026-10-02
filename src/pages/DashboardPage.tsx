import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertOctagon,
  Ban,
  AlertTriangle,
  Users,
  Puzzle,
  ShieldCheck,
  ChevronRight,
  RefreshCw,
} from 'lucide-react';

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Legend,
  Cell,
} from 'recharts';

import { StatCard, ChartCard } from '@/components/Cards';
import { RiskBadge, ActionBadge } from '@/components/Risk';
import { SystemStatus } from '@/components/SystemStatus';
import { PrivacyNotice } from '@/components/PrivacyNotice';

import {
  getIncidents,
  getEmployees,
  getOrganizationAnalytics,
  type BackendIncident,
  type OrganizationAnalytics,
} from '@/lib/api';

const ranges = ['7D', '30D', '90D'] as const;

function categoryName(type?: string) {
  switch (type) {
    case 'API_KEY':
      return 'API Keys';

    case 'EMAIL':
    case 'CREDIT_CARD':
      return 'PII';

    case 'AWS_ACCESS_KEY':
    case 'PRIVATE_KEY':
    case 'PASSWORD_ASSIGNMENT':
      return 'Credentials';

    case 'DATABASE_URL':
      return 'Database Information';

    case 'SOURCE_CODE':
      return 'Source Code';

    case 'FINANCIAL':
      return 'Financial';

    default:
      return type || 'Other';
  }
}

function formatTime(timestamp: string) {
  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return timestamp;
  }

  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDay(date: string) {
  const d = new Date(`${date}T00:00:00`);

  if (Number.isNaN(d.getTime())) {
    return date;
  }

  return d.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
  });
}

export function DashboardPage() {
  const [range, setRange] =
    useState<(typeof ranges)[number]>('7D');

  const [analytics, setAnalytics] =
    useState<OrganizationAnalytics | null>(null);

  const [incidents, setIncidents] =
    useState<BackendIncident[]>([]);

  const [employeeCount, setEmployeeCount] =
    useState(0);

  const [loading, setLoading] = useState(true);

  const [error, setError] =
    useState<string | null>(null);

  const loadDashboard = async () => {
    setLoading(true);
    setError(null);

    try {
      const [analyticsResponse, incidentsResponse, employeesResponse] =
        await Promise.all([
          getOrganizationAnalytics(
            range === '7D'
              ? 7
              : range === '30D'
                ? 30
                : 90
          ),
          getIncidents(5),
          getEmployees(),
        ]);

      setAnalytics(analyticsResponse);
      setIncidents(incidentsResponse.incidents);
      setEmployeeCount(employeesResponse.count);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to load dashboard data.'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, [range]);

  const overview = analytics?.overview;

  /*
   * ACTION DISTRIBUTION
   *
   * Backend may return:
   *   ALLOW / WARN / BLOCK
   *
   * or:
   *   Allowed / Warned / Blocked
   *
   * We normalize both formats here.
   */
  const actionDistribution = useMemo(() => {
    if (!analytics) return [];

    const distribution = {
      Allowed: 0,
      Warned: 0,
      Blocked: 0,
    };

    analytics.action_distribution.forEach((item) => {
      const action = String(item.name).trim().toUpperCase();

      if (
        action === 'ALLOW' ||
        action === 'ALLOWED'
      ) {
        distribution.Allowed += item.value;
      } else if (
        action === 'WARN' ||
        action === 'WARNED' ||
        action === 'WARNING' ||
        action === 'WARNINGS'
      ) {
        distribution.Warned += item.value;
      } else if (
        action === 'BLOCK' ||
        action === 'BLOCKED'
      ) {
        distribution.Blocked += item.value;
      }
    });

    return [
      {
        name: 'Blocked',
        value: distribution.Blocked,
        color: '#ef4444',
      },
      {
        name: 'Warned',
        value: distribution.Warned,
        color: '#f59e0b',
      },
      {
        name: 'Allowed',
        value: distribution.Allowed,
        color: '#10b981',
      },
    ].filter((item) => item.value > 0);
  }, [analytics]);

  const categoryData = useMemo(() => {
    if (!analytics) return [];

    return analytics.categories
      .map((item) => ({
        category: categoryName(item.category),
        count: item.count,
      }))
      .slice(0, 8);
  }, [analytics]);

  const trendData = useMemo(() => {
    if (!analytics) return [];

    return analytics.trend.map((item) => ({
      day: formatDay(item.date),

      // Backend provides average risk.
      // Display it as risk activity.
      risk: item.average_risk,

      incidents: item.incidents,
      blocked: item.blocked,
      warnings: item.warnings,
    }));
  }, [analytics]);

  const recent = incidents.slice(0, 5);

  return (
    <div className="space-y-6">

      {/* Error */}
      {error && (
        <div className="surface p-4 border border-danger/30 bg-risk-highSoft">
          <div className="flex items-center gap-2 text-danger text-sm">
            <AlertTriangle className="w-4 h-4" />
            <span>{error}</span>
          </div>

          <p className="text-xs text-ink-400 mt-1">
            Make sure the FastAPI backend and MongoDB are running.
          </p>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">

        <StatCard
          label="Total Incidents"
          value={loading ? '—' : overview?.total_incidents ?? 0}
          icon={AlertOctagon}
          accent="brand"
          sub={`Last ${
            range === '7D'
              ? '7'
              : range === '30D'
                ? '30'
                : '90'
          } days`}
        />

        <StatCard
          label="High-Risk Blocked"
          value={loading ? '—' : overview?.blocked ?? 0}
          icon={Ban}
          accent="danger"
          sub="Auto-blocked"
        />

        <StatCard
          label="Warnings"
          value={loading ? '—' : overview?.warnings ?? 0}
          icon={AlertTriangle}
          accent="warn"
          sub="Employee warned"
        />

        <StatCard
          label="Employees Monitored"
          value={loading ? '—' : employeeCount}
          icon={Users}
          accent="info"
          sub="Active employees"
        />

        <StatCard
          label="Platforms Covered"
          value={loading ? '—' : analytics?.platforms.length ?? 0}
          icon={Puzzle}
          accent="success"
          sub="Protected platforms"
        />

      </div>

      {/* Security posture + action distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        <div className="lg:col-span-2">
          <SystemStatus />
        </div>

        <ChartCard
          title="Action Distribution"
          subtitle="Allowed vs Warned vs Blocked"
        >
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>

              <Pie
                data={actionDistribution}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={45}
                outerRadius={70}
                paddingAngle={3}
              >
                {actionDistribution.map((entry, index) => (
                  <Cell
                    key={`${entry.name}-${index}`}
                    fill={entry.color}
                    stroke={entry.color}
                  />
                ))}
              </Pie>

              <Tooltip
                contentStyle={{
                  background: '#0b1120',
                  border: '1px solid #233150',
                  borderRadius: 8,
                  fontSize: 12,
                }}
                labelStyle={{
                  color: '#94a3b8',
                }}
                formatter={(value, name) => [
                  value,
                  name,
                ]}
              />

              <Legend
                iconType="circle"
                wrapperStyle={{
                  fontSize: 11,
                  color: '#94a3b8',
                }}
              />

            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

      </div>

      {/* Risk activity + categories */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        <ChartCard
          title="Risk Activity"
          subtitle="Security activity over time"
          className="lg:col-span-2"
          actions={
            <div className="inline-flex rounded-lg border border-ink-700 bg-ink-850 p-0.5">

              {ranges.map((r) => (
                <button
                  key={r}
                  onClick={() => setRange(r)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                    range === r
                      ? 'bg-ink-800 text-ink-50'
                      : 'text-ink-400 hover:text-ink-200'
                  }`}
                >
                  {r}
                </button>
              ))}

            </div>
          }
        >
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart
              data={trendData}
              margin={{
                top: 5,
                right: 10,
                left: -20,
                bottom: 0,
              }}
            >

              <defs>
                <linearGradient
                  id="dsh-risk"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop
                    offset="0%"
                    stopColor="#06b6d4"
                    stopOpacity={0.4}
                  />

                  <stop
                    offset="100%"
                    stopColor="#06b6d4"
                    stopOpacity={0}
                  />
                </linearGradient>
              </defs>

              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#1a2440"
                vertical={false}
              />

              <XAxis
                dataKey="day"
                stroke="#64748b"
                fontSize={11}
                tickLine={false}
                axisLine={false}
              />

              <YAxis
                stroke="#64748b"
                fontSize={11}
                tickLine={false}
                axisLine={false}
              />

              <Tooltip
                contentStyle={{
                  background: '#0b1120',
                  border: '1px solid #233150',
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />

              <Area
                type="monotone"
                dataKey="risk"
                name="Average Risk"
                stroke="#06b6d4"
                strokeWidth={2}
                fill="url(#dsh-risk)"
              />

            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Incident Categories"
          subtitle="By detection type"
        >
          <ResponsiveContainer width="100%" height={240}>
            <BarChart
              data={categoryData}
              layout="vertical"
              margin={{
                top: 0,
                right: 10,
                left: 20,
                bottom: 0,
              }}
            >

              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#1a2440"
                horizontal={false}
              />

              <XAxis
                type="number"
                stroke="#64748b"
                fontSize={11}
                tickLine={false}
                axisLine={false}
              />

              <YAxis
                type="category"
                dataKey="category"
                stroke="#64748b"
                fontSize={10}
                tickLine={false}
                axisLine={false}
                width={100}
              />

              <Tooltip
                contentStyle={{
                  background: '#0b1120',
                  border: '1px solid #233150',
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />

              <Bar
                dataKey="count"
                radius={[0, 4, 4, 0]}
                fill="#06b6d4"
              />

            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

      </div>

      {/* Recent incidents */}
      <div className="surface overflow-hidden">

        <div className="flex items-center justify-between px-5 py-4 border-b border-ink-800/60">

          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-brand-400" />

            <h3 className="text-sm font-semibold text-ink-100">
              Recent Incidents
            </h3>
          </div>

          <div className="flex items-center gap-3">

            <button
              onClick={loadDashboard}
              disabled={loading}
              className="btn-ghost p-1.5"
              title="Refresh dashboard"
            >
              <RefreshCw
                className={`w-4 h-4 ${
                  loading ? 'animate-spin' : ''
                }`}
              />
            </button>

            <Link
              to="/incidents"
              className="text-xs text-brand-300 hover:text-brand-200 flex items-center gap-1"
            >
              View all
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>

          </div>

        </div>

        <div className="overflow-x-auto">

          <table className="w-full">

            <thead className="bg-ink-850/50">
              <tr className="border-b border-ink-800/60">

                <th className="table-header text-left px-4 py-3">
                  Incident
                </th>

                <th className="table-header text-left px-4 py-3">
                  Employee
                </th>

                <th className="table-header text-left px-4 py-3">
                  Category
                </th>

                <th className="table-header text-left px-4 py-3">
                  Risk
                </th>

                <th className="table-header text-left px-4 py-3">
                  Action
                </th>

                <th className="table-header text-left px-4 py-3">
                  Time
                </th>

              </tr>
            </thead>

            <tbody className="divide-y divide-ink-800/60">

              {loading ? (

                <tr>
                  <td
                    colSpan={6}
                    className="table-cell text-center text-ink-400 py-8"
                  >
                    Loading incidents...
                  </td>
                </tr>

              ) : recent.length === 0 ? (

                <tr>
                  <td
                    colSpan={6}
                    className="table-cell text-center text-ink-400 py-8"
                  >
                    No incidents recorded yet.
                  </td>
                </tr>

              ) : (

                recent.map((inc) => (

                  <tr
                    key={inc.incident_id}
                    className="hover:bg-ink-850/40 transition-colors"
                  >

                    <td className="table-cell">
                      <Link
                        to={`/incidents/${inc.incident_id}`}
                        className="font-mono text-brand-300 hover:text-brand-200"
                      >
                        {inc.incident_id}
                      </Link>
                    </td>

                    <td className="table-cell">
                      {inc.employee_name || 'Unassigned'}
                    </td>

                    <td className="table-cell">
                      {categoryName(
                        inc.finding_types?.[0]
                      )}
                    </td>

                    <td className="table-cell">

                      <div className="flex items-center gap-2">

                        <span className="font-mono text-ink-200">
                          {inc.risk_score}
                        </span>

                        <RiskBadge
                          level={inc.risk_level}
                          size="sm"
                        />

                      </div>

                    </td>

                    <td className="table-cell">
                      <ActionBadge action={inc.action} />
                    </td>

                    <td className="table-cell text-ink-400">
                      {formatTime(inc.timestamp)}
                    </td>

                  </tr>

                ))

              )}

            </tbody>

          </table>

        </div>

      </div>

      <PrivacyNotice />

    </div>
  );
}