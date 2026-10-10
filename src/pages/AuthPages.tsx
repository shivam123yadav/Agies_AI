import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ShieldCheck, ArrowRight, Mail, Lock, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/context/AuthContext';

function AuthShell({ children }: { children: React.ReactNode }) {
return (
<div className="min-h-screen flex">
{/* Left brand panel */}
<div className="hidden lg:flex w-1/2 relative overflow-hidden bg-ink-900 border-r border-ink-800/60">
<div className="absolute inset-0 grid-bg opacity-20" />
<div className="absolute top-0 left-0 w-[40rem] h-[40rem] bg-brand-500/10 rounded-full blur-[120px]" />
<div className="relative flex flex-col justify-between p-12 w-full">
<Link to="/" className="flex items-center gap-2.5">
<div className="w-9 h-9 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shadow-glow">
<ShieldCheck className="w-5 h-5 text-ink-950" />
</div>
<div className="leading-tight">
<p className="font-display font-bold text-ink-50 text-[15px]">AgiesAI</p>
<p className="text-[10px] uppercase tracking-[0.18em] text-brand-300 -mt-0.5">Sentinel</p>
</div>
</Link>
<div>
<h2 className="font-display text-3xl font-bold text-ink-50 text-balance leading-tight">
Protect What Employees Send to AI.
</h2>
<p className="mt-4 text-ink-300 max-w-md leading-relaxed">
Detect sensitive information before it leaves the browser. Enable safer AI adoption
without unnecessary restrictions.
</p>
<div className="mt-8 flex items-center gap-4 text-xs text-ink-400">
<span className="flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5 text-brand-400" /> Metadata-only retention</span>
<span className="flex items-center gap-1.5"><Lock className="w-3.5 h-3.5 text-brand-400" /> Privacy by design</span>
</div>
</div>
<p className="text-xs text-ink-500">AI Security. Data Protection.</p>
</div>
</div>

  {/* Right form panel */}
  <div className="flex-1 flex items-center justify-center p-6">
    <div className="w-full max-w-sm">{children}</div>
  </div>
</div>

);
}

export function LoginPage() {
const [email, setEmail] = useState('');
const [password, setPassword] = useState('');
const [show, setShow] = useState(false);
const [loading, setLoading] = useState(false);
const [error, setError] = useState<string | null>(null);
const navigate = useNavigate();
const toast = useToast();
const { login, isAuthenticated, isLoading } = useAuth();

useEffect(() => {
  if (!isLoading && isAuthenticated) {
    navigate('/dashboard', { replace: true });
  }
}, [isAuthenticated, isLoading, navigate]);

const submit = async (e: React.FormEvent) => {
  e.preventDefault();
  setLoading(true);
  setError(null);
  try {
    await login({ email, password });
    toast.push({ type: 'success', title: 'Signed in', message: 'Welcome back, Admin.' });
    navigate('/dashboard');
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid administrator credentials.';
    setError(message);
    toast.push({ type: 'error', title: 'Sign in failed', message });
  } finally {
    setLoading(false);
  }
};

return (
<AuthShell>
<div className="lg:hidden flex items-center gap-2.5 mb-8">
<div className="w-9 h-9 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center">
<ShieldCheck className="w-5 h-5 text-ink-950" />
</div>
<span className="font-display font-bold text-ink-50">AgiesAI Sentinel</span>
</div>
<h1 className="font-display text-2xl font-bold text-ink-50">Sign in</h1>
<p className="mt-2 text-sm text-ink-400">Access the security console. Enter your administrator credentials.</p>

  {error && (
    <div className="mt-4 p-3 text-sm text-danger bg-danger/10 border border-danger/20 rounded-lg flex items-center gap-2">
      <AlertCircle className="w-4 h-4 shrink-0" />
      <span>{error}</span>
    </div>
  )}

  <form onSubmit={submit} className="mt-6 space-y-4">
    <div>
      <label className="label" htmlFor="email">Email</label>
      <div className="relative">
        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-500" />
        <input
          id="email"
          type="email"
          className="input pl-10"
          placeholder="admin@domain.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>
    </div>
    <div>
      <label className="label" htmlFor="password">Password</label>
      <div className="relative">
        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-500" />
        <input
          id="password"
          type={show ? 'text' : 'password'}
          className="input pl-10 pr-10"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-500 hover:text-ink-300"
          aria-label={show ? 'Hide password' : 'Show password'}
        >
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </div>
    <div className="flex items-center justify-between text-sm">
      <label className="flex items-center gap-2 text-ink-300">
        <input type="checkbox" className="rounded border-ink-600 bg-ink-850 text-brand-500 focus:ring-brand-500/30" defaultChecked />
        Remember me
      </label>
      <a href="#" className="text-brand-300 hover:text-brand-200">Forgot password?</a>
    </div>
    <button type="submit" className="btn-primary w-full py-3" disabled={loading}>
      {loading ? 'Signing in…' : 'Sign in'}
      {!loading && <ArrowRight className="w-4 h-4" />}
    </button>
  </form>

  <p className="mt-6 text-sm text-ink-400 text-center">
    No account?{' '}
    <Link to="/register" className="text-brand-300 hover:text-brand-200 font-medium">
      Create organization
    </Link>
  </p>
</AuthShell>

);
}

export function RegisterPage() {
const [org, setOrg] = useState('');
const [name, setName] = useState('');
const [email, setEmail] = useState('');
const [password, setPassword] = useState('');
const toast = useToast();

const submit = (e: React.FormEvent) => {
e.preventDefault();
// Organization provisioning is handled by the backend administrator.
// Self-service registration is not available in this build.
toast.push({
  type: 'error',
  title: 'Registration unavailable',
  message: 'Contact your administrator to provision an account.',
});
};

return (
<AuthShell>
<div className="lg:hidden flex items-center gap-2.5 mb-8">
<div className="w-9 h-9 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center">
<ShieldCheck className="w-5 h-5 text-ink-950" />
</div>
<span className="font-display font-bold text-ink-50">AgiesAI Sentinel</span>
</div>
<h1 className="font-display text-2xl font-bold text-ink-50">Create organization</h1>
<p className="mt-2 text-sm text-ink-400">Set up a workspace to protect AI usage across your team.</p>

  <form onSubmit={submit} className="mt-6 space-y-4">
    <div>
      <label className="label" htmlFor="org">Organization name</label>
      <input id="org" className="input" placeholder="Northwind Inc." value={org} onChange={(e) => setOrg(e.target.value)} required />
    </div>
    <div>
      <label className="label" htmlFor="name">Full name</label>
      <input id="name" className="input" placeholder="Admin User" value={name} onChange={(e) => setName(e.target.value)} required />
    </div>
    <div>
      <label className="label" htmlFor="email">Work email</label>
      <div className="relative">
        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-500" />
        <input id="email" type="email" className="input pl-10" placeholder="admin@company.co" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </div>
    </div>
    <div>
      <label className="label" htmlFor="pw">Password</label>
      <div className="relative">
        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-500" />
        <input id="pw" type="password" className="input pl-10" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </div>
    </div>
    <label className="flex items-start gap-2 text-sm text-ink-300">
      <input type="checkbox" className="mt-1 rounded border-ink-600 bg-ink-850 text-brand-500 focus:ring-brand-500/30" required />
      <span>I agree to the terms and the privacy-first data handling policy.</span>
    </label>
    <button type="submit" className="btn-primary w-full py-3">
      Create organization
      <ArrowRight className="w-4 h-4" />
    </button>
  </form>

  <p className="mt-6 text-sm text-ink-400 text-center">
    Already have an account?{' '}
    <Link to="/login" className="text-brand-300 hover:text-brand-200 font-medium">
      Sign in
    </Link>
  </p>
</AuthShell>

);
}