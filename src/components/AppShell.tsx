import { useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  ShieldCheck,
  LayoutDashboard,
  AlertOctagon,
  Users,
  ScanSearch,
  BarChart3,
  ScrollText,
  Puzzle,
  Settings,
  UserCircle,
  Bell,
  Search,
  Menu,
  X,
  LogOut,
  ChevronRight,
} from 'lucide-react';
import { cx, initials } from '@/lib/risk';
import { NotificationPanel } from '@/components/NotificationPanel';

const nav = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/incidents', label: 'Incidents', icon: AlertOctagon },
  { to: '/employees', label: 'Employees', icon: Users },
  { to: '/policies', label: 'Policies', icon: ShieldCheck },
  { to: '/detection-rules', label: 'Detection Rules', icon: ScanSearch },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/audit-log', label: 'Audit Log', icon: ScrollText },
  { to: '/extension', label: 'Extension', icon: Puzzle },
];

const bottomNav = [
  { to: '/settings', label: 'Settings', icon: Settings },
  { to: '/profile', label: 'Profile', icon: UserCircle },
];

const pageTitles: Record<string, { title: string; subtitle?: string }> = {
  '/dashboard': { title: 'Security Overview', subtitle: 'Monitor AI-related security activity across your organization.' },
  '/incidents': { title: 'Incident Management', subtitle: 'Investigate and manage AI-related security incidents.' },
  '/employees': { title: 'Employee Management', subtitle: 'Monitor AI safety posture across your workforce.' },
  '/policies': { title: 'Policy Management', subtitle: 'Define how AgiesAI Sentinel responds to risk.' },
  '/detection-rules': { title: 'Detection Rules', subtitle: 'Configure pattern and contextual detection engines.' },
  '/analytics': { title: 'Security Analytics', subtitle: 'Understand risk trends across AI usage.' },
  '/audit-log': { title: 'Audit Log', subtitle: 'Tamper-evident trail of security events.' },
  '/extension': { title: 'Extension Status', subtitle: 'Browser extension health and configuration.' },
  '/settings': { title: 'Settings', subtitle: 'Manage organization and security preferences.' },
  '/profile': { title: 'Profile', subtitle: 'Your administrator profile.' },
};

function Logo() {
  return (
    <Link to="/dashboard" className="flex items-center gap-2.5 px-1">
      <div className="relative w-9 h-9 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shadow-glow">
        <ShieldCheck className="w-5 h-5 text-ink-950" />
      </div>
      <div className="leading-tight">
        <p className="font-display font-bold text-ink-50 text-[15px]">AgiesAI</p>
        <p className="text-[10px] uppercase tracking-[0.18em] text-brand-300 -mt-0.5">Sentinel</p>
      </div>
    </Link>
  );
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-5">
        <Logo />
      </div>
      <nav className="flex-1 px-3 space-y-1 overflow-y-auto">
        <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-500">Security</p>
        {nav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={({ isActive }) => cx('nav-link', isActive && 'nav-link-active')}
          >
            <item.icon className="w-[18px] h-[18px]" />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="px-3 pb-3 space-y-1 border-t border-ink-800/60 pt-3">
        {bottomNav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={({ isActive }) => cx('nav-link', isActive && 'nav-link-active')}
          >
            <item.icon className="w-[18px] h-[18px]" />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </div>
    </div>
  );
}

function Breadcrumbs() {
  const { pathname } = useLocation();
  const parts = pathname.split('/').filter(Boolean);
  return (
    <nav className="hidden md:flex items-center gap-1.5 text-xs text-ink-400">
      <Link to="/dashboard" className="hover:text-ink-200">
        Console
      </Link>
      {parts.map((p, i) => (
        <span key={i} className="flex items-center gap-1.5">
          <ChevronRight className="w-3 h-3" />
          <span className={i === parts.length - 1 ? 'text-ink-200 capitalize' : 'capitalize'}>{p}</span>
        </span>
      ))}
    </nav>
  );
}

export function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const { pathname } = useLocation();
  const meta = pageTitles[pathname] ?? { title: 'Console' };

  return (
    <div className="min-h-screen flex">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-60 shrink-0 border-r border-ink-800/80 bg-ink-900/60 backdrop-blur-sm flex-col sticky top-0 h-screen">
        <SidebarContent />
      </aside>

      {/* Mobile sidebar */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-ink-950/80 backdrop-blur-sm animate-fade-in-fast" onClick={() => setMobileOpen(false)} />
          <aside className="relative w-64 bg-ink-900 border-r border-ink-800 animate-slide-in-right">
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute top-4 right-3 text-ink-400 hover:text-ink-100"
              aria-label="Close menu"
            >
              <X className="w-5 h-5" />
            </button>
            <SidebarContent onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      {/* Main */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Topbar */}
        <header className="sticky top-0 z-40 border-b border-ink-800/80 bg-ink-950/80 backdrop-blur-md">
          <div className="flex items-center gap-3 px-4 lg:px-6 h-16">
            <button
              className="lg:hidden text-ink-300 hover:text-ink-100"
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h1 className="text-base lg:text-lg font-semibold text-ink-50 truncate">{meta.title}</h1>
              </div>
              {meta.subtitle && (
                <p className="hidden sm:block text-xs text-ink-400 truncate">{meta.subtitle}</p>
              )}
            </div>

            {/* Search */}
            <div className="hidden md:flex relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-500" />
              <input
                className="w-56 lg:w-72 bg-ink-850 border border-ink-700 rounded-lg pl-9 pr-3 py-2 text-sm text-ink-100 placeholder:text-ink-500 focus:outline-none focus:border-brand-500/60 focus:ring-2 focus:ring-brand-500/15"
                placeholder="Search incidents, employees…"
              />
            </div>

            {/* Notifications */}
            <div className="relative">
              <button
                onClick={() => setNotifOpen((v) => !v)}
                className="relative w-9 h-9 rounded-lg flex items-center justify-center text-ink-300 hover:text-ink-100 hover:bg-ink-800/60 transition-colors"
                aria-label="Notifications"
              >
                <Bell className="w-[18px] h-[18px]" />
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-danger ring-2 ring-ink-950" />
              </button>
              {notifOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setNotifOpen(false)} />
                  <div className="absolute right-0 mt-2 z-50">
                    <NotificationPanel onClose={() => setNotifOpen(false)} />
                  </div>
                </>
              )}
            </div>

            {/* Profile */}
            <Link
              to="/profile"
              className="flex items-center gap-2.5 rounded-lg pl-1.5 pr-3 py-1.5 hover:bg-ink-800/60 transition-colors"
            >
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center text-ink-950 text-xs font-bold">
                {initials('Admin User')}
              </div>
              <div className="hidden sm:block leading-tight">
                <p className="text-xs font-medium text-ink-100">Admin User</p>
                <p className="text-[11px] text-ink-400">Security Admin</p>
              </div>
            </Link>

            <Link
              to="/login"
              className="hidden sm:flex w-9 h-9 rounded-lg items-center justify-center text-ink-400 hover:text-ink-100 hover:bg-ink-800/60 transition-colors"
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut className="w-[18px] h-[18px]" />
            </Link>
          </div>
          <div className="px-4 lg:px-6 pb-2">
            <Breadcrumbs />
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 p-4 lg:p-6 max-w-[1600px] w-full mx-auto">
          <Outlet />
        </main>

        {/* Mobile bottom nav */}
        <nav className="lg:hidden sticky bottom-0 z-30 border-t border-ink-800 bg-ink-950/90 backdrop-blur-md">
          <div className="flex items-center justify-around px-2 py-1.5 overflow-x-auto">
            {nav.slice(0, 5).map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cx(
                    'flex flex-col items-center gap-0.5 px-2.5 py-1.5 rounded-lg text-[10px] font-medium transition-colors',
                    isActive ? 'text-brand-300' : 'text-ink-400',
                  )
                }
              >
                <item.icon className="w-5 h-5" />
                {item.label}
              </NavLink>
            ))}
            <NavLink
              to="/settings"
              className={({ isActive }) =>
                cx(
                  'flex flex-col items-center gap-0.5 px-2.5 py-1.5 rounded-lg text-[10px] font-medium transition-colors',
                  isActive ? 'text-brand-300' : 'text-ink-400',
                )
              }
            >
              <Settings className="w-5 h-5" />
              More
            </NavLink>
          </div>
        </nav>
      </div>
    </div>
  );
}
