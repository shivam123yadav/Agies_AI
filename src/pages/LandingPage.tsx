import { Link } from 'react-router-dom';
import {
  ShieldCheck,
  ArrowRight,
  KeyRound,
  FileCode2,
  CreditCard,
  Users,
  Landmark,
  Database,
  ScanSearch,
  Gauge,
  ScrollText,
  CheckCircle2,
  AlertTriangle,
  Ban,
  Eye,
  EyeOff,
  Lock,
  Sparkles,
} from 'lucide-react';
import { RiskBadge } from '@/components/Risk';
import { DetectionPipeline } from '@/components/DetectionPipeline';

function PublicNav() {
  return (
    <header className="sticky top-0 z-40 border-b border-ink-800/60 bg-ink-950/70 backdrop-blur-md">
      <div className="max-w-7xl mx-auto flex items-center justify-between px-5 lg:px-8 h-16">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shadow-glow">
            <ShieldCheck className="w-5 h-5 text-ink-950" />
          </div>
          <div className="leading-tight">
            <p className="font-display font-bold text-ink-50 text-[15px]">AgiesAI</p>
            <p className="text-[10px] uppercase tracking-[0.18em] text-brand-300 -mt-0.5">Sentinel</p>
          </div>
        </div>
        <nav className="hidden md:flex items-center gap-7 text-sm text-ink-300">
          <a href="#problem" className="hover:text-ink-100 transition-colors">Problem</a>
          <a href="#solution" className="hover:text-ink-100 transition-colors">Solution</a>
          <a href="#how" className="hover:text-ink-100 transition-colors">How it works</a>
          <Link to="/demo" className="hover:text-ink-100 transition-colors">Demo</Link>
        </nav>
        <div className="flex items-center gap-2.5">
          <Link to="/login" className="btn-ghost text-sm">Sign in</Link>
          <Link to="/demo" className="btn-primary text-sm">Try Demo</Link>
        </div>
      </div>
    </header>
  );
}

function HeroViz() {
  const steps = [
    { label: 'Employee', sub: 'submits prompt', icon: Users, tone: 'neutral' },
    { label: 'AI Tool', sub: 'ChatGPT · Gemini · Claude', icon: Sparkles, tone: 'neutral' },
    { label: 'Sentinel Layer', sub: 'intercepts before send', icon: ShieldCheck, tone: 'brand' },
    { label: 'Risk Analysis', sub: 'pattern + context', icon: Gauge, tone: 'neutral' },
  ];
  const outcomes = [
    { label: 'ALLOW', icon: CheckCircle2, tone: 'success' },
    { label: 'WARN', icon: AlertTriangle, tone: 'warn' },
    { label: 'BLOCK', icon: Ban, tone: 'danger' },
  ];

  return (
    <div className="relative surface p-6 lg:p-8 animate-slide-up">
      <div className="absolute inset-0 grid-bg opacity-30 rounded-xl" />
      <div className="relative">
        <div className="flex flex-col lg:flex-row items-stretch gap-3">
          {steps.map((s, i) => (
            <div key={s.label} className="flex items-center gap-3 flex-1">
              <div
                className={`flex-1 rounded-xl border p-4 text-center ${
                  s.tone === 'brand'
                    ? 'border-brand-500/40 bg-brand-500/10 shadow-glow'
                    : 'border-ink-700 bg-ink-850/60'
                }`}
              >
                <s.icon className={`w-7 h-7 mx-auto ${s.tone === 'brand' ? 'text-brand-300' : 'text-ink-300'}`} />
                <p className="mt-2 text-sm font-semibold text-ink-100">{s.label}</p>
                <p className="text-[11px] text-ink-400 mt-0.5">{s.sub}</p>
              </div>
              {i < steps.length - 1 && (
                <ArrowRight className="w-5 h-5 text-ink-500 shrink-0 rotate-90 lg:rotate-0" />
              )}
            </div>
          ))}
        </div>

        <div className="my-5 flex items-center justify-center">
          <div className="h-px flex-1 bg-gradient-to-r from-transparent to-ink-700" />
          <span className="px-3 text-[11px] uppercase tracking-wider text-ink-500">Decision</span>
          <div className="h-px flex-1 bg-gradient-to-l from-transparent to-ink-700" />
        </div>

        <div className="grid grid-cols-3 gap-3">
          {outcomes.map((o) => (
            <div
              key={o.label}
              className={`rounded-xl border p-4 text-center ${
                o.tone === 'success'
                  ? 'border-success/30 bg-risk-lowSoft'
                  : o.tone === 'warn'
                    ? 'border-warn/30 bg-risk-mediumSoft'
                    : 'border-danger/30 bg-risk-highSoft'
              }`}
            >
              <o.icon
                className={`w-7 h-7 mx-auto ${
                  o.tone === 'success' ? 'text-success' : o.tone === 'warn' ? 'text-warn' : 'text-danger'
                }`}
              />
              <p
                className={`mt-2 text-sm font-bold ${
                  o.tone === 'success' ? 'text-success' : o.tone === 'warn' ? 'text-warn' : 'text-danger'
                }`}
              >
                {o.label}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const dataTypes = [
  { label: 'API Keys', icon: KeyRound, desc: 'Tokens and access keys pasted into prompts.' },
  { label: 'Credentials', icon: Lock, desc: 'Usernames, passwords, and connection strings.' },
  { label: 'Source Code', icon: FileCode2, desc: 'Proprietary modules and internal logic.' },
  { label: 'Customer PII', icon: Users, desc: 'Names, emails, and personal identifiers.' },
  { label: 'Financial Data', icon: CreditCard, desc: 'Forecasts, revenue, and card numbers.' },
  { label: 'Internal Information', icon: Landmark, desc: 'Strategy, roadmaps, and confidential docs.' },
];

function SolutionFlow() {
  const steps = [
    { label: 'INPUT', icon: Eye },
    { label: 'DETECT', icon: ScanSearch },
    { label: 'ANALYZE', icon: Gauge },
    { label: 'DECIDE', icon: ShieldCheck },
    { label: 'PROTECT', icon: ShieldCheck },
  ];
  return (
    <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
      {steps.map((s, i) => (
        <div key={s.label} className="flex items-center gap-3">
          <div className="flex flex-col items-center gap-2">
            <div className="w-16 h-16 rounded-2xl border border-brand-500/30 bg-brand-500/5 flex items-center justify-center">
              <s.icon className="w-7 h-7 text-brand-300" />
            </div>
            <span className="text-xs font-semibold text-ink-200 tracking-wider">{s.label}</span>
          </div>
          {i < steps.length - 1 && <ArrowRight className="w-5 h-5 text-brand-500/50 rotate-90 sm:rotate-0" />}
        </div>
      ))}
    </div>
  );
}

function HowItWorks() {
  const stages = [
    { num: '01', title: 'CAPTURE', desc: 'Detect content before it is submitted to any AI tool.', icon: ScanSearch },
    { num: '02', title: 'ANALYZE', desc: 'Identify sensitive patterns and contextual risk signals.', icon: Gauge },
    { num: '03', title: 'DECIDE', desc: 'Apply risk scoring and organizational policy in real time.', icon: ShieldCheck },
    { num: '04', title: 'REPORT', desc: 'Record incident metadata for security visibility.', icon: ScrollText },
  ];
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {stages.map((s) => (
        <div key={s.num} className="surface p-6 hover:border-brand-500/30 transition-colors group">
          <div className="flex items-center justify-between mb-4">
            <span className="font-mono text-2xl font-bold text-brand-500/30 group-hover:text-brand-500/50 transition-colors">
              {s.num}
            </span>
            <div className="w-10 h-10 rounded-lg bg-ink-800 border border-ink-700 flex items-center justify-center">
              <s.icon className="w-5 h-5 text-brand-300" />
            </div>
          </div>
          <h3 className="text-sm font-semibold text-ink-50 tracking-wide">{s.title}</h3>
          <p className="mt-1.5 text-sm text-ink-400 leading-relaxed">{s.desc}</p>
        </div>
      ))}
    </div>
  );
}

export function LandingPage() {
  return (
    <div className="min-h-screen">
      <PublicNav />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 grid-bg opacity-20" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[60rem] h-[40rem] bg-brand-500/10 rounded-full blur-[120px]" />
        <div className="relative max-w-7xl mx-auto px-5 lg:px-8 pt-16 lg:pt-24 pb-16">
          <div className="grid lg:grid-cols-2 gap-10 lg:gap-14 items-center">
            <div className="animate-slide-up">
              <div className="inline-flex items-center gap-2 rounded-full border border-brand-500/30 bg-brand-500/5 px-3 py-1.5 text-xs font-medium text-brand-300">
                <ShieldCheck className="w-3.5 h-3.5" />
                AI Security · Data Protection
              </div>
              <h1 className="mt-5 font-display text-4xl sm:text-5xl lg:text-[3.5rem] font-extrabold leading-[1.05] text-ink-50 text-balance">
                Protect What Employees Send to AI.
              </h1>
              <p className="mt-5 text-lg text-ink-300 leading-relaxed max-w-xl">
                AgiesAI Sentinel helps organizations detect sensitive information before it leaves the
                browser, enabling safer AI adoption without unnecessary restrictions.
              </p>
              <div className="mt-8 flex flex-col sm:flex-row gap-3">
                <Link to="/demo" className="btn-primary text-sm px-5 py-3">
                  Try Interactive Demo
                  <ArrowRight className="w-4 h-4" />
                </Link>
                <Link to="/dashboard" className="btn-secondary text-sm px-5 py-3">
                  Explore Security Platform
                </Link>
              </div>
              <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-ink-400">
                <span className="flex items-center gap-1.5"><EyeOff className="w-3.5 h-3.5 text-brand-400" /> Metadata-only retention</span>
                <span className="flex items-center gap-1.5"><Lock className="w-3.5 h-3.5 text-brand-400" /> Privacy by design</span>
                <span className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-brand-400" /> Enterprise ready</span>
              </div>
            </div>
            <div className="animate-fade-in">
              <HeroViz />
            </div>
          </div>
        </div>
      </section>

      {/* Problem */}
      <section id="problem" className="max-w-7xl mx-auto px-5 lg:px-8 py-16 lg:py-20">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-300">The Problem</p>
          <h2 className="mt-3 font-display text-3xl lg:text-4xl font-bold text-ink-50 text-balance">
            AI Adoption Created a New Security Blind Spot.
          </h2>
          <p className="mt-4 text-ink-300 leading-relaxed">
            Employees use public AI tools for coding, writing, research, analysis, and documentation.
            But sensitive information can accidentally leave organizational control.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {dataTypes.map((d, i) => (
            <div
              key={d.label}
              className="surface p-5 hover:border-warn/30 hover:bg-risk-mediumSoft/20 transition-all duration-300 animate-fade-in"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-risk-mediumSoft border border-warn/20 flex items-center justify-center">
                  <d.icon className="w-5 h-5 text-warn" />
                </div>
                <h3 className="text-sm font-semibold text-ink-100">{d.label}</h3>
              </div>
              <p className="mt-3 text-sm text-ink-400 leading-relaxed">{d.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Solution */}
      <section id="solution" className="relative py-16 lg:py-20 border-y border-ink-800/60 bg-ink-900/40">
        <div className="max-w-7xl mx-auto px-5 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <p className="text-xs font-semibold uppercase tracking-wider text-brand-300">The Solution</p>
            <h2 className="mt-3 font-display text-3xl lg:text-4xl font-bold text-ink-50 text-balance">
              Protect Data Before It Leaves.
            </h2>
            <p className="mt-4 text-ink-300 leading-relaxed">
              AgiesAI Sentinel evaluates AI-tool input before submission and determines whether the
              content should be allowed, warned, or blocked.
            </p>
          </div>
          <div className="surface p-8 lg:p-12">
            <SolutionFlow />
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="max-w-7xl mx-auto px-5 lg:px-8 py-16 lg:py-20">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-300">How AgiesAI Works</p>
          <h2 className="mt-3 font-display text-3xl lg:text-4xl font-bold text-ink-50">Four Stages of Protection</h2>
        </div>
        <HowItWorks />
        <div className="mt-10 surface p-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-400 mb-4">Detection Pipeline</p>
          <DetectionPipeline />
        </div>
      </section>

      {/* CTA */}
      <section className="relative overflow-hidden py-16 lg:py-20">
        <div className="absolute inset-0 bg-gradient-to-br from-brand-500/10 via-transparent to-accent-500/5" />
        <div className="relative max-w-3xl mx-auto px-5 text-center">
          <h2 className="font-display text-3xl lg:text-4xl font-bold text-ink-50 text-balance">
            See Sentinel in Action.
          </h2>
          <p className="mt-4 text-ink-300">
            Try the interactive demo — switch between safe, warning, and blocked scenarios to experience
            how AgiesAI Sentinel protects data before it leaves the browser.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
            <Link to="/demo" className="btn-primary px-5 py-3">
              Try Interactive Demo
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link to="/register" className="btn-secondary px-5 py-3">
              Create Organization
            </Link>
          </div>
          <div className="mt-8 flex items-center justify-center gap-3">
            <RiskBadge level="LOW" />
            <RiskBadge level="MEDIUM" />
            <RiskBadge level="HIGH" />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-ink-800/60 py-10">
        <div className="max-w-7xl mx-auto px-5 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center">
              <ShieldCheck className="w-4 h-4 text-ink-950" />
            </div>
            <span className="text-sm text-ink-300">AgiesAI Sentinel — AI Security. Data Protection.</span>
          </div>
          <div className="flex items-center gap-5 text-xs text-ink-400">
            <Link to="/demo" className="hover:text-ink-200">Demo</Link>
            <Link to="/login" className="hover:text-ink-200">Sign in</Link>
            <Link to="/dashboard" className="hover:text-ink-200">Dashboard</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
