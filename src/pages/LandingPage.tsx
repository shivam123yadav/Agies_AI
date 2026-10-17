import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Ban,
  Briefcase,
  Check,
  CheckCircle2,
  ChevronDown,
  Code2,
  Download,
  EyeOff,
  Fingerprint,
  Github,
  KeyRound,
  Layers,
  Linkedin,
  Lock,
  Mail,
  Menu,
  Play,
  Plug,
  Radar,
  ScrollText,
  ShieldCheck,
  SlidersHorizontal,
  TrendingUp,
  Users,
  X,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  CONFIG — edit these two values                                     */
/* ------------------------------------------------------------------ */
// Self-service signup is disabled in the product, so the "Request a pilot"
// button opens a mail to this address. Leave '' to hide the button.
const CONTACT_EMAIL = '';
const PRODUCT = 'AgiesAI Sentinel';

// Developer section. Replace the placeholders; leave a link '' to hide it.
const DEVELOPER = {
  name: 'Shivam Yadav',
  role: 'Full-Stack Developer · Creator of AgiesAI Sentinel',
  // Put your photo at project/public/developer.jpg (square crop works best).
  // If the file is missing, the initials avatar is shown instead.
  photo: '/developer.jpg',
  bio: "I'm a computer science student and full-stack developer passionate about building practical applications that combine AI, modern web technologies, and cybersecurity. I created AgiesAI Sentinel to explore how AI-powered security tools can help protect users from online threats while keeping privacy and user control at the center. I enjoy turning ideas into real-world products and continuously learning through hands-on projects.",
  skills: ['React', 'TypeScript', 'FastAPI', 'Python', 'MongoDB', 'Tailwind CSS', 'Chrome Extensions', 'AI Integration', 'Cybersecurity'],
  github: '',
  linkedin: '',
  email: '',
};

const DEV_LINKS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: DEVELOPER.github, label: 'GitHub', icon: Github },
  { href: DEVELOPER.linkedin, label: 'LinkedIn', icon: Linkedin },
  { href: DEVELOPER.email ? `mailto:${DEVELOPER.email}` : '', label: 'Email', icon: Mail },
].filter((l) => l.href);

const DEV_INITIALS = DEVELOPER.name
  .split(' ')
  .filter(Boolean)
  .map((w) => w[0])
  .slice(0, 2)
  .join('')
  .toUpperCase();

const display = { fontFamily: "'Plus Jakarta Sans', Inter, system-ui, sans-serif" } as const;
const mono = { fontFamily: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace" } as const;

/* ------------------------------------------------------------------ */
/*  Tiny client-side preview of the detection engine                   */
/*  (runs in the browser only; nothing is sent anywhere)               */
/* ------------------------------------------------------------------ */
type Action = 'ALLOW' | 'WARN' | 'BLOCK';

const ACTION_META: Record<Action, { color: string; bg: string; text: string }> = {
  ALLOW: { color: '#10b981', bg: 'rgba(16,185,129,0.12)', text: 'Safe to send' },
  WARN: { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', text: 'Review before sending' },
  BLOCK: { color: '#ef4444', bg: 'rgba(239,68,68,0.12)', text: 'Submission stopped' },
};

function luhn(digits: string): boolean {
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = Number(digits[i]);
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

interface PatternRule {
  id: string;
  label: string;
  re: RegExp;
  weight: number;
  check?: (m: string) => boolean;
}

const PATTERNS: PatternRule[] = [
  { id: 'PRIVATE_KEY', label: 'Private key', re: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, weight: 80 },
  { id: 'AWS_KEY', label: 'AWS access key', re: /\bAKIA[0-9A-Z]{16}\b/, weight: 75 },
  { id: 'API_KEY', label: 'API key', re: /\b(?:sk|pk)-[A-Za-z0-9_-]{16,}/, weight: 70 },
  { id: 'DATABASE_URL', label: 'Database URL', re: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/[^\s]+/i, weight: 70 },
  {
    id: 'CREDIT_CARD',
    label: 'Credit card',
    re: /\b(?:\d[ -]?){13,16}\b/,
    weight: 65,
    check: (m) => {
      const d = m.replace(/\D/g, '');
      return d.length >= 13 && d.length <= 16 && luhn(d);
    },
  },
  { id: 'PASSWORD', label: 'Password assignment', re: /\b(?:password|passwd|pwd)\s*[:=]\s*\S+/i, weight: 60 },
  { id: 'EMAIL', label: 'Email address', re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/, weight: 15 },
  { id: 'PHONE', label: 'Phone number', re: /\b(?:\+\d{1,3}[\s-]?)?\d{10}\b/, weight: 12 },
];

const CONTEXTS: { id: string; label: string; re: RegExp }[] = [
  { id: 'PROD', label: 'Production environment', re: /\b(?:prod|production)\b/i },
  { id: 'DEPLOY', label: 'Deployment context', re: /\bdeploy(?:ment|ing)?\b/i },
  { id: 'CONF', label: 'Confidential information', re: /\b(?:confidential|internal only)\b/i },
  { id: 'SALARY', label: 'Compensation data', re: /\bsalar(?:y|ies)\b/i },
  { id: 'FORECAST', label: 'Financial forecast', re: /\b(?:forecast|revenue)\b/i },
];

function mask(s: string): string {
  const head = s.slice(0, Math.min(6, Math.max(2, Math.floor(s.length / 4))));
  return `${head}${'•'.repeat(10)}`;
}

interface Analysis {
  score: number;
  action: Action;
  findings: { label: string; masked: string }[];
  contexts: string[];
}

function analyze(text: string): Analysis {
  const findings: Analysis['findings'] = [];
  let score = 0;
  for (const rule of PATTERNS) {
    const m = text.match(rule.re);
    if (m && (!rule.check || rule.check(m[0]))) {
      findings.push({ label: rule.label, masked: mask(m[0]) });
      score += rule.weight;
    }
  }
  const contexts: string[] = [];
  for (const c of CONTEXTS) {
    if (c.re.test(text)) contexts.push(c.label);
  }
  score += Math.min(24, contexts.length * 8);
  score = Math.min(100, score);
  const action: Action = score >= 70 ? 'BLOCK' : score >= 40 ? 'WARN' : 'ALLOW';
  return { score, action, findings, contexts };
}

const PRESETS: { key: Action; label: string; text: string }[] = [
  {
    key: 'ALLOW',
    label: 'Safe',
    text: 'Summarize the key differences between REST and GraphQL for our onboarding docs.',
  },
  {
    key: 'WARN',
    label: 'Warning',
    text: 'Confidential salary sheet for the Q3 forecast. Email priya@acme.com or call 9876543210 with questions.',
  },
  {
    key: 'BLOCK',
    label: 'Blocked',
    text: 'Deploy this to prod: DATABASE_URL=postgres://admin:S3cret@db.internal:5432/main and key sk-live-4f9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c',
  },
];

/* ------------------------------------------------------------------ */
/*  Small building blocks                                              */
/* ------------------------------------------------------------------ */
function Reveal({ children, delay = 0, className = '' }: { children: ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.01, rootMargin: '100px 0px' },
    );
    io.observe(el);
    const timer = setTimeout(() => setShown(true), 800);
    return () => {
      io.disconnect();
      clearTimeout(timer);
    };
  }, []);
  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={`sl-reveal ${shown ? 'sl-in' : ''} ${className}`}
    >
      {children}
    </div>
  );
}

function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <div
      className="inline-flex items-center gap-2 rounded-full border border-brand-500/25 bg-brand-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-300"
      style={mono}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-brand-400 sl-pulse" />
      {children}
    </div>
  );
}

function SectionHead({ eyebrow, title, sub }: { eyebrow: string; title: ReactNode; sub?: string }) {
  return (
    <div className="mx-auto max-w-3xl text-center">
      <Reveal>
        <Eyebrow>{eyebrow}</Eyebrow>
        <h2
          className="mt-5 text-3xl font-extrabold leading-tight tracking-tight text-ink-50 sm:text-4xl lg:text-5xl"
          style={display}
        >
          {title}
        </h2>
        {sub && <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-ink-300 sm:text-lg">{sub}</p>}
      </Reveal>
    </div>
  );
}

function Logo({ size = 36 }: { size?: number }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 shadow-[0_0_0_1px_rgba(6,182,212,0.25),0_8px_30px_-8px_rgba(6,182,212,0.45)]"
      style={{ width: size, height: size }}
    >
      <ShieldCheck className="text-white" style={{ width: size * 0.55, height: size * 0.55 }} />
    </span>
  );
}

function DeveloperAvatar() {
  const [failed, setFailed] = useState(false);
  const glow = 'shadow-[0_0_0_1px_rgba(6,182,212,0.25),0_12px_50px_-8px_rgba(6,182,212,0.6)] ring-4 ring-ink-900';
  if (DEVELOPER.photo && !failed) {
    return (
      <img
        src={DEVELOPER.photo}
        alt={DEVELOPER.name}
        onError={() => setFailed(true)}
        className={`relative h-36 w-36 rounded-full border-2 border-brand-500/60 object-cover ${glow}`}
      />
    );
  }
  return (
    <div className={`relative flex h-36 w-36 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-brand-700 ${glow}`}>
      <span className="text-5xl font-extrabold text-ink-950" style={display}>
        {DEV_INITIALS}
      </span>
    </div>
  );
}

function Gauge({ score, action }: { score: number; action: Action }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const color = ACTION_META[action].color;
  return (
    <div className="relative h-[132px] w-[132px] shrink-0">
      <svg viewBox="0 0 132 132" className="h-full w-full -rotate-90">
        <circle cx="66" cy="66" r={r} fill="none" stroke="#1a2440" strokeWidth="10" />
        <circle
          cx="66"
          cy="66"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - score / 100)}
          style={{ transition: 'stroke-dashoffset .6s cubic-bezier(.4,0,.2,1), stroke .3s', filter: `drop-shadow(0 0 8px ${color}88)` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold text-ink-50" style={mono}>
          {score}
        </span>
        <span className="text-[10px] uppercase tracking-widest text-ink-400" style={mono}>
          risk
        </span>
      </div>
    </div>
  );
}

function ActionPill({ action, big = false }: { action: Action; big?: boolean }) {
  const m = ACTION_META[action];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md font-bold tracking-wider ${big ? 'px-3 py-1.5 text-sm' : 'px-2 py-0.5 text-[11px]'}`}
      style={{ ...mono, color: m.color, background: m.bg, border: `1px solid ${m.color}55` }}
    >
      {action === 'ALLOW' ? <CheckCircle2 className="h-3.5 w-3.5" /> : action === 'WARN' ? <AlertTriangle className="h-3.5 w-3.5" /> : <Ban className="h-3.5 w-3.5" />}
      {action}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Hero scanner                                                       */
/* ------------------------------------------------------------------ */
function Scanner() {
  const [text, setText] = useState(PRESETS[2].text);
  const result = useMemo(() => analyze(text), [text]);
  const meta = ACTION_META[result.action];

  return (
    <div className="relative">
      <div
        className="absolute -inset-px rounded-2xl opacity-70 blur-xl"
        style={{ background: `radial-gradient(60% 60% at 70% 20%, ${meta.color}33, transparent)`, transition: 'background .4s' }}
      />
      <div className="relative overflow-hidden rounded-2xl border border-ink-700 bg-ink-900/90 shadow-2xl backdrop-blur">
        <div className="flex items-center justify-between border-b border-ink-800 px-4 py-3">
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-red-500/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-500/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/70" />
          </div>
          <span className="text-[11px] uppercase tracking-widest text-ink-400" style={mono}>
            sentinel · live preview
          </span>
          <span className="w-10" />
        </div>

        <div className="p-4 sm:p-5">
          <div className="mb-3 flex flex-wrap gap-2">
            {PRESETS.map((p) => {
              const active = text === p.text;
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setText(p.text)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                    active ? 'border-brand-500/60 bg-brand-500/15 text-brand-300' : 'border-ink-700 bg-ink-850 text-ink-300 hover:border-ink-500 hover:text-ink-50'
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
            <span className="ml-auto self-center text-[11px] text-ink-500" style={mono}>
              type your own ↓
            </span>
          </div>

          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            spellCheck={false}
            rows={4}
            aria-label="Prompt to scan"
            className="w-full resize-none rounded-xl border border-ink-700 bg-ink-950 p-3.5 text-[13px] leading-relaxed text-ink-100 outline-none transition placeholder:text-ink-500 focus:border-brand-500/60 focus:ring-2 focus:ring-brand-500/20"
            style={mono}
            placeholder="Paste anything an employee might send to an AI tool…"
          />

          <div className="mt-4 flex items-center gap-5 rounded-xl border border-ink-800 bg-ink-950/60 p-4">
            <Gauge score={result.score} action={result.action} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <ActionPill action={result.action} big />
                <span className="text-sm text-ink-300">{meta.text}</span>
              </div>
              <div className="mt-3 space-y-1.5">
                {result.findings.length === 0 && result.contexts.length === 0 && (
                  <p className="text-sm text-ink-400">No sensitive patterns or risky context found.</p>
                )}
                {result.findings.slice(0, 3).map((f) => (
                  <div key={f.label} className="flex items-center justify-between gap-3 rounded-md bg-ink-850 px-2.5 py-1.5 text-xs">
                    <span className="text-ink-100">{f.label}</span>
                    <span className="truncate text-ink-400" style={mono}>
                      {f.masked}
                    </span>
                  </div>
                ))}
                {result.contexts.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    {result.contexts.map((c) => (
                      <span key={c} className="rounded-full border border-brand-500/25 bg-brand-500/10 px-2 py-0.5 text-[10px] text-brand-300">
                        {c}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between gap-3 text-[11px] text-ink-500">
            <span className="inline-flex items-center gap-1.5">
              <Lock className="h-3 w-3" /> Runs in your browser. Nothing is uploaded.
            </span>
            <Link to="/demo" className="inline-flex items-center gap-1 font-semibold text-brand-300 hover:text-brand-400">
              Full pipeline demo <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Outcome showcase (what the employee actually sees)                 */
/* ------------------------------------------------------------------ */
function Outcomes() {
  const [tab, setTab] = useState<Action>('BLOCK');
  const tabs: { key: Action; title: string; desc: string; range: string }[] = [
    { key: 'ALLOW', title: 'Allow', desc: 'Low-risk prompts flow through untouched. No friction for everyday work.', range: 'Risk 0 – 39' },
    { key: 'WARN', title: 'Warn', desc: 'The employee sees what was found and decides. The choice is audited, never the prompt.', range: 'Risk 40 – 69' },
    { key: 'BLOCK', title: 'Block', desc: 'Critical data is stopped inside the browser, before it reaches the AI provider.', range: 'Risk 70 – 100' },
  ];
  const cur = tabs.find((t) => t.key === tab)!;
  const color = ACTION_META[tab].color;

  return (
    <div className="mt-14 grid items-center gap-10 lg:grid-cols-[0.9fr_1.1fr]">
      <Reveal>
        <div className="space-y-3">
          {tabs.map((t) => {
            const active = t.key === tab;
            const c = ACTION_META[t.key].color;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`group w-full rounded-xl border p-4 text-left transition ${
                  active ? 'bg-ink-900' : 'border-ink-800 bg-ink-900/40 hover:border-ink-700'
                }`}
                style={active ? { borderColor: `${c}66`, boxShadow: `0 0 0 1px ${c}22, 0 10px 40px -12px ${c}55` } : undefined}
              >
                <div className="flex items-center justify-between">
                  <ActionPill action={t.key} />
                  <span className="text-[11px] text-ink-400" style={mono}>
                    {t.range}
                  </span>
                </div>
                <p className="mt-2.5 text-sm leading-relaxed text-ink-300">{t.desc}</p>
              </button>
            );
          })}
        </div>
      </Reveal>

      <Reveal delay={120}>
        <div className="overflow-hidden rounded-2xl border border-ink-700 bg-ink-900 shadow-2xl">
          <div className="flex items-center gap-3 border-b border-ink-800 bg-ink-950/70 px-4 py-2.5">
            <div className="flex gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-ink-700" />
              <span className="h-2.5 w-2.5 rounded-full bg-ink-700" />
              <span className="h-2.5 w-2.5 rounded-full bg-ink-700" />
            </div>
            <div className="flex-1 truncate rounded-md bg-ink-850 px-3 py-1 text-[11px] text-ink-400" style={mono}>
              https://your-ai-tool.com/chat
            </div>
            <ShieldCheck className="h-4 w-4 text-brand-400" />
          </div>

          <div className="relative min-h-[340px] p-5">
            <div className="ml-auto max-w-[85%] rounded-2xl rounded-tr-sm bg-ink-800 px-4 py-3 text-[13px] leading-relaxed text-ink-100">
              {tab === 'ALLOW' && 'Draft a polite follow-up email for next week’s product review.'}
              {tab === 'WARN' && 'Here is the confidential salary sheet, email priya@acme.com for details…'}
              {tab === 'BLOCK' && (
                <span style={mono}>
                  DATABASE_URL=postgres://admin:<span className="rounded bg-red-500/20 px-1 text-red-300">••••••••</span>@db.internal
                </span>
              )}
            </div>

            {tab === 'ALLOW' && (
              <div className="sl-pop mt-5 flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4" key="a">
                <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                <div>
                  <p className="text-sm font-semibold text-emerald-300">Sentinel · Allowed</p>
                  <p className="text-xs text-ink-300">No sensitive data detected. Prompt sent.</p>
                </div>
              </div>
            )}

            {tab === 'WARN' && (
              <div className="sl-pop mt-5 rounded-xl border border-amber-500/40 bg-ink-950 p-4 shadow-[0_10px_40px_-12px_rgba(245,158,11,0.45)]" key="w">
                <div className="flex items-center gap-2 text-amber-300">
                  <AlertTriangle className="h-5 w-5" />
                  <p className="text-sm font-bold" style={display}>
                    Review before sending
                  </p>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-ink-300">
                  This prompt contains an email address and confidential context. Your organization asks you to double-check.
                </p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-300">Email address</span>
                  <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-300">Confidential information</span>
                </div>
                <div className="mt-4 flex gap-2">
                  <span className="rounded-lg border border-ink-700 px-3 py-1.5 text-xs font-semibold text-ink-100">Cancel</span>
                  <span className="rounded-lg bg-amber-500/20 px-3 py-1.5 text-xs font-semibold text-amber-300">Continue anyway</span>
                </div>
              </div>
            )}

            {tab === 'BLOCK' && (
              <div className="sl-pop mt-5 rounded-xl border border-red-500/50 bg-ink-950 p-4 shadow-[0_10px_40px_-12px_rgba(239,68,68,0.55)]" key="b">
                <div className="flex items-center gap-2 text-red-300">
                  <Ban className="h-5 w-5" />
                  <p className="text-sm font-bold" style={display}>
                    Blocked: critical data detected
                  </p>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-ink-300">
                  Sentinel stopped this prompt before it left your browser. Remove the credentials and try again.
                </p>
                <div className="mt-3 space-y-1.5">
                  <div className="flex items-center justify-between rounded-md bg-red-500/10 px-2.5 py-1.5 text-xs">
                    <span className="text-red-200">Database URL</span>
                    <span className="text-red-300/80" style={mono}>
                      postgr••••••••••
                    </span>
                  </div>
                </div>
              </div>
            )}

            <div className="absolute bottom-3 right-4 text-[10px] uppercase tracking-widest" style={{ ...mono, color }}>
              ● {cur.title}
            </div>
          </div>
        </div>
      </Reveal>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Data                                                               */
/* ------------------------------------------------------------------ */
const LEAKS = [
  { icon: KeyRound, title: 'API keys & tokens', body: 'Live keys pasted while debugging an integration.' },
  { icon: Lock, title: 'Credentials', body: 'Passwords, private keys and database connection strings.' },
  { icon: Code2, title: 'Source code', body: 'Proprietary logic shared for a “quick refactor”.' },
  { icon: Users, title: 'Customer PII', body: 'Names, emails, phone numbers and card details.' },
  { icon: TrendingUp, title: 'Financial data', body: 'Forecasts, revenue and compensation sheets.' },
  { icon: Briefcase, title: 'Internal information', body: 'Roadmaps, contracts and confidential documents.' },
];

const STAGES = [
  { n: '01', t: 'Input', d: 'Prompt is captured in the page before submit.' },
  { n: '02', t: 'Pattern', d: 'Regex rules find keys, cards, emails, URLs.' },
  { n: '03', t: 'Context', d: 'Signals like prod, deploy, salary raise risk.' },
  { n: '04', t: 'Risk', d: 'A 0–100 exposure score is computed.' },
  { n: '05', t: 'Policy', d: 'Your active policies map score to action.' },
  { n: '06', t: 'Action', d: 'Allow, warn or block, in the browser.' },
];

const PLATFORMS = ['ChatGPT', 'Google Gemini', 'Anthropic Claude', 'Perplexity'];

const FAQ = [
  {
    q: 'Does Sentinel store what my employees type?',
    a: 'No. Raw prompt text is never transmitted to or stored on the server. Only finding counts, context categories, risk scores and masked previews are retained for auditing.',
  },
  {
    q: 'Which AI tools are covered?',
    a: 'ChatGPT, Google Gemini, Anthropic Claude and Perplexity, each with a dedicated page adapter in the Chrome extension.',
  },
  {
    q: 'What happens if the detection service is unreachable?',
    a: 'Sentinel fails closed. If the engine can’t be reached, or a gap exists in your policy ranges, the submission stays blocked rather than slipping through.',
  },
  {
    q: 'Can employees override a warning?',
    a: 'When a policy says WARN, the employee can continue or cancel. Either choice is recorded as an audit event, again without keeping the prompt.',
  },
  {
    q: 'How is the extension tied to a person?',
    a: 'An admin generates a single-use 8-character pairing code that expires in 10 minutes. Redeeming it binds the extension to that employee, and access can be revoked instantly from the console.',
  },
  {
    q: 'Which browsers are supported?',
    a: 'The extension is built for Chrome on Manifest V3.',
  },
  {
    q: 'How do I get an account?',
    a: 'Accounts are provisioned by an administrator rather than self-service. Try the live demo first, or request a pilot to get started.',
  },
];

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */
export default function LandingPage() {
  const [menu, setMenu] = useState(false);

  const go = (id: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    setMenu(false);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const nav = [
    { id: 'problem', label: 'Problem' },
    { id: 'how', label: 'How it works' },
    { id: 'outcomes', label: 'Protection' },
    { id: 'privacy', label: 'Privacy' },
    { id: 'console', label: 'Console' },
    { id: 'faq', label: 'FAQ' },
    { id: 'developer', label: 'Developer' },
  ];

  const pilotHref = CONTACT_EMAIL
    ? `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(`${PRODUCT} pilot request`)}`
    : '';

  return (
    <div className="relative min-h-screen overflow-x-clip bg-ink-950 text-ink-300 antialiased" style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
      <style>{`
        .sl-reveal{opacity:0;transform:translateY(18px);transition:opacity .7s ease,transform .7s cubic-bezier(.2,.7,.2,1)}
        .sl-in{opacity:1;transform:none}
        .sl-grid{background-image:linear-gradient(rgba(148,163,184,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(148,163,184,.06) 1px,transparent 1px);background-size:44px 44px;-webkit-mask-image:radial-gradient(70% 60% at 50% 0%,#000 30%,transparent 100%);mask-image:radial-gradient(70% 60% at 50% 0%,#000 30%,transparent 100%)}
        @keyframes sl-pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.4;transform:scale(1.6)}}
        .sl-pulse{animation:sl-pulse 2s ease-in-out infinite}
        @keyframes sl-pop{from{opacity:0;transform:translateY(10px) scale(.97)}to{opacity:1;transform:none}}
        .sl-pop{animation:sl-pop .35s cubic-bezier(.2,.8,.2,1)}
        @keyframes sl-stage{0%,16%{border-color:rgba(6,182,212,.7);background:rgba(6,182,212,.12);box-shadow:0 0 30px -6px rgba(6,182,212,.55)}22%,100%{border-color:#1a2440;background:rgba(11,17,32,.7);box-shadow:none}}
        .sl-stage{animation:sl-stage 7.2s linear infinite}
        @keyframes sl-scan{0%{transform:translateY(-10%);opacity:0}10%{opacity:1}90%{opacity:1}100%{transform:translateY(110%);opacity:0}}
        .sl-scan{animation:sl-scan 3.4s ease-in-out infinite}
        @keyframes sl-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
        .sl-float{animation:sl-float 6s ease-in-out infinite}
        @keyframes sl-bar{from{transform:scaleY(.15)}to{transform:scaleY(1)}}
        .sl-bar{transform-origin:bottom;animation:sl-bar 1.1s cubic-bezier(.2,.8,.2,1) both}
        @keyframes sl-timer{from{width:100%}to{width:0}}
        .sl-timer{animation:sl-timer 60s linear infinite}
        details > summary{list-style:none}
        details > summary::-webkit-details-marker{display:none}
        details[open] .sl-chev{transform:rotate(180deg)}
        @media (prefers-reduced-motion:reduce){
          .sl-reveal{opacity:1;transform:none;transition:none}
          .sl-pulse,.sl-stage,.sl-scan,.sl-float,.sl-bar,.sl-timer,.sl-pop{animation:none!important}
        }
      `}</style>

      {/* ambient background */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[900px]">
        <div className="sl-grid absolute inset-0" />
        <div className="absolute left-1/2 top-[-220px] h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-brand-500/20 blur-[120px]" />
        <div className="absolute right-[-120px] top-[260px] h-[320px] w-[320px] rounded-full bg-violet-500/10 blur-[110px]" />
      </div>

      {/* NAV */}
      <header className="sticky top-0 z-50 border-b border-ink-800/80 bg-ink-950/75 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5">
            <Logo />
            <span className="text-lg font-extrabold tracking-tight text-ink-50" style={display}>
              AgiesAI <span className="text-brand-400">Sentinel</span>
            </span>
          </Link>

          <nav className="hidden items-center gap-1 lg:flex">
            {nav.map((n) => (
              <a
                key={n.id}
                href={`#${n.id}`}
                onClick={go(n.id)}
                className="rounded-lg px-3 py-2 text-sm font-medium text-ink-300 transition hover:bg-ink-800 hover:text-ink-50"
              >
                {n.label}
              </a>
            ))}
          </nav>

          <div className="hidden items-center gap-2 lg:flex">
            <Link to="/login" className="rounded-lg px-3.5 py-2 text-sm font-semibold text-ink-100 transition hover:bg-ink-800">
              Admin sign in
            </Link>
            <Link
              to="/demo"
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-500 px-4 py-2 text-sm font-bold text-ink-950 shadow-[0_0_0_1px_rgba(6,182,212,0.25),0_8px_30px_-8px_rgba(6,182,212,0.55)] transition hover:bg-brand-400"
            >
              <Play className="h-3.5 w-3.5" /> Try live demo
            </Link>
          </div>

          <button
            type="button"
            aria-label="Toggle menu"
            onClick={() => setMenu((m) => !m)}
            className="rounded-lg p-2 text-ink-100 hover:bg-ink-800 lg:hidden"
          >
            {menu ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {menu && (
          <div className="border-t border-ink-800 bg-ink-950/95 px-5 pb-5 pt-3 lg:hidden">
            <div className="flex flex-col">
              {nav.map((n) => (
                <a key={n.id} href={`#${n.id}`} onClick={go(n.id)} className="rounded-lg px-3 py-2.5 text-sm font-medium text-ink-100 hover:bg-ink-800">
                  {n.label}
                </a>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Link to="/login" className="rounded-lg border border-ink-700 px-4 py-2.5 text-center text-sm font-semibold text-ink-100">
                Sign in
              </Link>
              <Link to="/demo" className="rounded-lg bg-brand-500 px-4 py-2.5 text-center text-sm font-bold text-ink-950">
                Live demo
              </Link>
            </div>
          </div>
        )}
      </header>

      {/* HERO */}
      <section className="relative mx-auto grid max-w-7xl items-center gap-12 px-5 pb-16 pt-14 sm:px-6 sm:pt-20 lg:grid-cols-[1.02fr_1fr] lg:gap-10 lg:pb-24 lg:pt-24">
        <div>
          <Reveal>
            <Eyebrow>AI Security · Data Protection</Eyebrow>
            <h1
              className="mt-6 text-4xl font-extrabold leading-[1.05] tracking-tight text-ink-50 sm:text-5xl lg:text-6xl xl:text-[4.25rem]"
              style={display}
            >
              Protect what employees{' '}
              <span className="bg-gradient-to-r from-brand-300 via-brand-400 to-brand-500 bg-clip-text text-transparent">send to AI.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-300">
              Sentinel detects sensitive information inside the browser, before a prompt ever leaves, so your teams can adopt ChatGPT, Gemini, Claude and Perplexity safely, without blanket bans.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                to="/demo"
                className="group inline-flex items-center gap-2 rounded-xl bg-brand-500 px-6 py-3.5 text-sm font-bold text-ink-950 shadow-[0_0_0_1px_rgba(6,182,212,0.25),0_12px_40px_-10px_rgba(6,182,212,0.65)] transition hover:bg-brand-400"
              >
                Try the live demo
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
              </Link>
              <Link
                to="/login"
                className="inline-flex items-center gap-2 rounded-xl border border-ink-700 bg-ink-900/60 px-6 py-3.5 text-sm font-semibold text-ink-50 transition hover:border-ink-500 hover:bg-ink-800"
              >
                Admin sign in
              </Link>
            </div>

            <div className="mt-8 flex flex-wrap gap-x-5 gap-y-2.5 text-sm text-ink-300">
              {['Metadata-only retention', 'Privacy by design', 'Fails closed'].map((t) => (
                <span key={t} className="inline-flex items-center gap-2">
                  <Check className="h-4 w-4 text-brand-400" /> {t}
                </span>
              ))}
            </div>
          </Reveal>
        </div>

        <Reveal delay={150}>
          <div className="sl-float">
            <Scanner />
          </div>
        </Reveal>
      </section>

      {/* PLATFORMS + NUMBERS */}
      <section className="relative border-y border-ink-800/80 bg-ink-900/40">
        <div className="mx-auto max-w-7xl px-5 py-10 sm:px-6">
          <p className="text-center text-[11px] uppercase tracking-[0.2em] text-ink-400" style={mono}>
            Guarding the AI tools your team already uses
          </p>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {PLATFORMS.map((p) => (
              <div key={p} className="flex items-center justify-center gap-2.5 rounded-xl border border-ink-800 bg-ink-900/70 px-4 py-4">
                <ShieldCheck className="h-4 w-4 text-brand-400" />
                <span className="text-sm font-bold text-ink-100" style={display}>
                  {p}
                </span>
              </div>
            ))}
          </div>

          <dl className="mt-10 grid grid-cols-2 gap-6 text-center sm:grid-cols-4">
            {[
              ['4', 'AI platforms protected'],
              ['11', 'built-in detection rules'],
              ['3', 'enforcement actions'],
              ['0', 'bytes of prompt text stored'],
            ].map(([v, l]) => (
              <div key={l}>
                <dt className="text-4xl font-extrabold text-ink-50" style={display}>
                  <span className="bg-gradient-to-b from-ink-50 to-brand-300 bg-clip-text text-transparent">{v}</span>
                </dt>
                <dd className="mt-1 text-xs uppercase tracking-wider text-ink-400" style={mono}>
                  {l}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* PROBLEM */}
      <section id="problem" className="mx-auto max-w-7xl scroll-mt-20 px-5 py-20 sm:px-6 lg:py-28">
        <SectionHead
          eyebrow="The blind spot"
          title={
            <>
              AI adoption created a <span className="text-red-400">new security blind spot.</span>
            </>
          }
          sub="Employees use public AI tools for coding, writing, research and analysis. Sensitive information can quietly leave your control in a single paste."
        />
        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {LEAKS.map((l, i) => (
            <Reveal key={l.title} delay={i * 60}>
              <div className="group h-full rounded-2xl border border-ink-800 bg-ink-900/60 p-6 transition hover:-translate-y-1 hover:border-red-500/40 hover:bg-ink-900">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-red-500/10 text-red-400 ring-1 ring-red-500/25 transition group-hover:bg-red-500/15">
                  <l.icon className="h-5 w-5" />
                </span>
                <h3 className="mt-4 text-lg font-bold text-ink-50" style={display}>
                  {l.title}
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-300">{l.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how" className="relative scroll-mt-20 border-y border-ink-800/80 bg-ink-900/30 py-20 lg:py-28">
        <div className="mx-auto max-w-7xl px-5 sm:px-6">
          <SectionHead
            eyebrow="Detection pipeline"
            title={
              <>
                Six stages. <span className="text-brand-400">One decision.</span>
              </>
            }
            sub="Every prompt runs through the same deterministic pipeline in milliseconds, then the policy you define decides what happens next."
          />

          <div className="relative mt-14 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            {STAGES.map((s, i) => (
              <div
                key={s.n}
                className="sl-stage relative overflow-hidden rounded-2xl border border-ink-750 p-5"
                style={{ animationDelay: `${i * 1.2}s` }}
              >
                <span className="text-[11px] font-semibold text-brand-300" style={mono}>
                  {s.n}
                </span>
                <h3 className="mt-2 text-lg font-bold text-ink-50" style={display}>
                  {s.t}
                </h3>
                <p className="mt-1.5 text-xs leading-relaxed text-ink-300">{s.d}</p>
              </div>
            ))}
          </div>

          {/* dual engine */}
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <Reveal>
              <div className="h-full rounded-2xl border border-ink-800 bg-ink-900/70 p-6">
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500/10 text-brand-300 ring-1 ring-brand-500/25">
                    <Fingerprint className="h-5 w-5" />
                  </span>
                  <div>
                    <h3 className="font-bold text-ink-50" style={display}>
                      Pattern detection
                    </h3>
                    <span className="rounded bg-ink-800 px-1.5 py-0.5 text-[10px] text-ink-300" style={mono}>
                      LOCAL / REGEX
                    </span>
                  </div>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-ink-300">
                  Deterministic rules for API keys, AWS keys, private keys, database URLs, Luhn-validated credit cards, emails and phone numbers.
                </p>
                <pre className="mt-4 overflow-x-auto rounded-xl bg-ink-950 p-4 text-[12px] leading-relaxed text-ink-300" style={mono}>
{`sk-live-••••••••••   → API_KEY
AKIA••••••••••••••••  → AWS_KEY
postgres://••••••••   → DATABASE_URL`}
                </pre>
              </div>
            </Reveal>
            <Reveal delay={100}>
              <div className="h-full rounded-2xl border border-ink-800 bg-ink-900/70 p-6">
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/10 text-violet-300 ring-1 ring-violet-500/25">
                    <Radar className="h-5 w-5" />
                  </span>
                  <div>
                    <h3 className="font-bold text-ink-50" style={display}>
                      Contextual analysis
                    </h3>
                    <span className="rounded bg-ink-800 px-1.5 py-0.5 text-[10px] text-ink-300" style={mono}>
                      CONTEXTUAL
                    </span>
                  </div>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-ink-300">
                  Understands the situation around the data. Words like prod, deploy, confidential or salary lift the risk score even when no pattern matches.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {['production', 'deploy', 'confidential', 'salary', 'forecast'].map((w) => (
                    <span key={w} className="rounded-full border border-violet-500/25 bg-violet-500/10 px-3 py-1 text-xs text-violet-200" style={mono}>
                      {w}
                    </span>
                  ))}
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* OUTCOMES */}
      <section id="outcomes" className="mx-auto max-w-7xl scroll-mt-20 px-5 py-20 sm:px-6 lg:py-28">
        <SectionHead
          eyebrow="In the browser"
          title={
            <>
              Allow. Warn. <span className="text-red-400">Block.</span>
            </>
          }
          sub="Policies map a risk score to an action. Pick a tab to see exactly what your employee sees."
        />
        <Outcomes />
      </section>

      {/* PRIVACY */}
      <section id="privacy" className="relative scroll-mt-20 border-y border-ink-800/80 bg-ink-900/30 py-20 lg:py-28">
        <div className="mx-auto max-w-7xl px-5 sm:px-6">
          <SectionHead
            eyebrow="Privacy by design"
            title={
              <>
                A security tool that <span className="text-brand-400">never reads your prompts.</span>
              </>
            }
            sub="Most objections to monitoring are about the monitor itself. Sentinel is built so there is no raw prompt text to leak, subpoena or breach."
          />
          <div className="mt-14 grid gap-4 lg:grid-cols-2">
            <Reveal>
              <div className="h-full rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.04] p-7">
                <div className="flex items-center gap-2.5 text-emerald-300">
                  <Layers className="h-5 w-5" />
                  <h3 className="text-lg font-bold" style={display}>
                    What Sentinel keeps
                  </h3>
                </div>
                <ul className="mt-5 space-y-3 text-sm text-ink-100">
                  {['Number of findings per prompt', 'Context categories (e.g. production, confidential)', 'Risk score and policy decision', 'Masked previews like sk-live••••••••', 'Whether a warning was continued or cancelled'].map((t) => (
                    <li key={t} className="flex items-start gap-3">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" /> {t}
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
            <Reveal delay={100}>
              <div className="h-full rounded-2xl border border-red-500/25 bg-red-500/[0.04] p-7">
                <div className="flex items-center gap-2.5 text-red-300">
                  <EyeOff className="h-5 w-5" />
                  <h3 className="text-lg font-bold" style={display}>
                    What Sentinel never stores
                  </h3>
                </div>
                <ul className="mt-5 space-y-3 text-sm text-ink-100">
                  {['The raw prompt text', 'Full API keys, passwords or card numbers', 'Files, conversations or AI responses', 'Anything that could reconstruct what was typed'].map((t) => (
                    <li key={t} className="flex items-start gap-3">
                      <X className="mt-0.5 h-4 w-4 shrink-0 text-red-400" /> {t}
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* CONSOLE */}
      <section id="console" className="mx-auto max-w-7xl scroll-mt-20 px-5 py-20 sm:px-6 lg:py-28">
        <SectionHead
          eyebrow="Admin console"
          title={
            <>
              Full visibility. <span className="text-brand-400">Zero prompt exposure.</span>
            </>
          }
          sub="A dedicated console for security teams to watch trends, triage incidents and tune policy."
        />

        <div className="mt-14 grid gap-4 lg:grid-cols-3">
          {/* dashboard mock */}
          <Reveal className="lg:col-span-2">
            <div className="h-full overflow-hidden rounded-2xl border border-ink-700 bg-ink-900 shadow-2xl">
              <div className="flex items-center justify-between border-b border-ink-800 px-5 py-3">
                <span className="text-sm font-bold text-ink-50" style={display}>
                  Security overview
                </span>
                <span className="text-[10px] uppercase tracking-widest text-ink-500" style={mono}>
                  illustrative preview
                </span>
              </div>
              <div className="p-5">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[
                    ['Incidents', '#06b6d4'],
                    ['Blocked', '#ef4444'],
                    ['Warnings', '#f59e0b'],
                    ['Monitored', '#10b981'],
                  ].map(([l, c]) => (
                    <div key={l} className="rounded-xl border border-ink-800 bg-ink-950/60 p-3.5">
                      <p className="text-[10px] uppercase tracking-wider text-ink-400" style={mono}>
                        {l}
                      </p>
                      <div className="mt-2.5 h-1.5 w-full rounded-full bg-ink-800">
                        <div className="h-full rounded-full" style={{ width: `${40 + (l.length * 7) % 50}%`, background: c, boxShadow: `0 0 10px ${c}88` }} />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="relative mt-4 flex h-44 items-end gap-1.5 overflow-hidden rounded-xl border border-ink-800 bg-ink-950/60 p-4">
                  {[32, 46, 38, 62, 48, 70, 55, 82, 64, 90, 58, 74, 52, 66, 44, 78, 60, 86, 50, 72].map((h, i) => (
                    <div
                      key={i}
                      className="sl-bar flex-1 rounded-t bg-gradient-to-t from-brand-700 to-brand-400"
                      style={{ height: `${h}%`, animationDelay: `${i * 40}ms`, opacity: 0.85 }}
                    />
                  ))}
                  <div className="sl-scan pointer-events-none absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-transparent via-brand-400/20 to-transparent" />
                </div>
              </div>
            </div>
          </Reveal>

          {/* pairing mock */}
          <Reveal delay={100}>
            <div className="h-full rounded-2xl border border-ink-700 bg-ink-900 p-6 shadow-2xl">
              <div className="flex items-center gap-2.5 text-brand-300">
                <Plug className="h-5 w-5" />
                <h3 className="font-bold text-ink-50" style={display}>
                  Pair an extension
                </h3>
              </div>
              <p className="mt-2 text-sm text-ink-300">Single-use code, expires in 10 minutes.</p>
              <div className="mt-5 rounded-xl border border-brand-500/30 bg-brand-500/10 py-5 text-center">
                <span className="text-3xl font-bold tracking-[0.25em] text-brand-300" style={mono}>
                  K7QM-4XD9
                </span>
              </div>
              <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-ink-800">
                <div className="sl-timer h-full rounded-full bg-brand-400" />
              </div>
              <p className="mt-2 text-[11px] text-ink-500" style={mono}>
                example code · countdown illustrative
              </p>
            </div>
          </Reveal>

          {[
            { i: Activity, t: 'Incident queue', d: 'Search, filter and move incidents from Open to Acknowledged to Resolved, with a forensic drill-down of masked findings.' },
            { i: Users, t: 'Employee risk profiles', d: 'See violation counts, block rates and top categories per person, and revoke an extension in one click.' },
            { i: SlidersHorizontal, t: 'Policies & rules', d: 'Create policies with overlap protection, toggle built-in rules or author your own regex and context patterns.' },
          ].map((f, k) => (
            <Reveal key={f.t} delay={k * 80}>
              <div className="h-full rounded-2xl border border-ink-800 bg-ink-900/60 p-6 transition hover:border-brand-500/40">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500/10 text-brand-300 ring-1 ring-brand-500/25">
                  <f.i className="h-5 w-5" />
                </span>
                <h3 className="mt-4 font-bold text-ink-50" style={display}>
                  {f.t}
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-300">{f.d}</p>
              </div>
            </Reveal>
          ))}

          <Reveal className="lg:col-span-3">
            <div className="flex flex-col gap-4 rounded-2xl border border-ink-800 bg-ink-900/60 p-6 sm:flex-row sm:items-center">
              <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-500/10 text-brand-300 ring-1 ring-brand-500/25">
                <ScrollText className="h-6 w-6" />
              </span>
              <div>
                <h3 className="font-bold text-ink-50" style={display}>
                  Tamper-evident audit trail
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-ink-300">
                  Security events are chained with hashes so any alteration of history is detectable, which is the evidence trail compliance teams ask for.
                </p>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* DEPLOY */}
      <section className="relative border-y border-ink-800/80 bg-ink-900/30 py-20 lg:py-28">
        <div className="mx-auto max-w-7xl px-5 sm:px-6">
          <SectionHead
            eyebrow="Rollout"
            title={
              <>
                Protected in <span className="text-brand-400">three steps.</span>
              </>
            }
          />
          <div className="mt-14 grid gap-4 md:grid-cols-3">
            {[
              { i: Download, t: 'Download', d: 'Grab the extension package from the console and load it in Chrome.' },
              { i: Fingerprint, t: 'Pair', d: 'Generate a single-use code for an employee and enter it in the extension popup.' },
              { i: ShieldCheck, t: 'Protect', d: 'Prompts to ChatGPT, Gemini, Claude and Perplexity are now checked before sending.' },
            ].map((s, i) => (
              <Reveal key={s.t} delay={i * 100}>
                <div className="relative h-full rounded-2xl border border-ink-800 bg-ink-900/70 p-6">
                  <span className="absolute right-5 top-4 text-5xl font-extrabold text-ink-800" style={display}>
                    {i + 1}
                  </span>
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-brand-500/10 text-brand-300 ring-1 ring-brand-500/25">
                    <s.i className="h-5 w-5" />
                  </span>
                  <h3 className="mt-4 text-lg font-bold text-ink-50" style={display}>
                    {s.t}
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-300">{s.d}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="mx-auto max-w-3xl scroll-mt-20 px-5 py-20 sm:px-6 lg:py-28">
        <SectionHead eyebrow="FAQ" title="Questions security teams ask first" />
        <div className="mt-12 space-y-3">
          {FAQ.map((f, i) => (
            <Reveal key={f.q} delay={i * 40}>
              <details className="group rounded-xl border border-ink-800 bg-ink-900/60 px-5 py-4 transition open:border-brand-500/40 open:bg-ink-900">
                <summary className="flex cursor-pointer items-center justify-between gap-4 text-left text-sm font-semibold text-ink-50 sm:text-base">
                  {f.q}
                  <ChevronDown className="sl-chev h-4 w-4 shrink-0 text-ink-400 transition-transform" />
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-ink-300">{f.a}</p>
              </details>
            </Reveal>
          ))}
        </div>
      </section>

      {/* DEVELOPER */}
      <section id="developer" className="mx-auto max-w-5xl scroll-mt-20 px-5 pb-20 sm:px-6 lg:pb-28">
        <SectionHead
          eyebrow="Built by"
          title={
            <>
              Meet the <span className="text-brand-400">developer.</span>
            </>
          }
        />
        <Reveal className="mt-12">
          <div className="grid overflow-hidden rounded-3xl border border-ink-700 bg-ink-900/70 shadow-2xl md:grid-cols-[260px_1fr]">
            <div className="relative flex flex-col items-center justify-center gap-4 border-b border-ink-800 bg-gradient-to-br from-brand-700/30 via-ink-900 to-ink-950 p-8 md:border-b-0 md:border-r">
              <div className="sl-grid absolute inset-0 opacity-50" />
              <DeveloperAvatar />
              <span className="relative inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold text-emerald-300" style={mono}>
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 sl-pulse" /> shipping
              </span>
            </div>

            <div className="p-7 sm:p-9">
              <div className="rounded-xl border border-ink-800 bg-ink-950/70 p-4 text-[13px] leading-relaxed" style={mono}>
                <p className="text-ink-500">
                  <span className="text-brand-400">$</span> whoami
                </p>
                <p className="mt-1 text-xl font-bold text-ink-50" style={display}>
                  {DEVELOPER.name}
                </p>
                <p className="mt-0.5 text-brand-300">{DEVELOPER.role}</p>
              </div>

              <p className="mt-5 text-base leading-relaxed text-ink-300">{DEVELOPER.bio}</p>

              <div className="mt-5 flex flex-wrap gap-2">
                {DEVELOPER.skills.map((s) => (
                  <span key={s} className="rounded-full border border-brand-500/25 bg-brand-500/10 px-3 py-1 text-xs text-brand-300" style={mono}>
                    {s}
                  </span>
                ))}
              </div>

              {DEV_LINKS.length > 0 && (
                <div className="mt-6 flex flex-wrap gap-3">
                  {DEV_LINKS.map((l) => (
                    <a
                      key={l.label}
                      href={l.href}
                      target={l.href.startsWith('mailto:') ? undefined : '_blank'}
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 rounded-lg border border-ink-700 bg-ink-850 px-4 py-2 text-sm font-semibold text-ink-100 transition hover:border-brand-500/50 hover:text-brand-300"
                    >
                      <l.icon className="h-4 w-4" /> {l.label}
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Reveal>
      </section>

      {/* FINAL CTA */}
      <section className="mx-auto max-w-7xl px-5 pb-20 sm:px-6 lg:pb-28">
        <Reveal>
          <div className="relative overflow-hidden rounded-3xl border border-brand-500/30 bg-gradient-to-br from-ink-900 via-ink-900 to-ink-850 px-6 py-14 text-center sm:px-12 sm:py-20">
            <div className="sl-grid absolute inset-0 opacity-60" />
            <div className="absolute left-1/2 top-0 h-60 w-[520px] -translate-x-1/2 rounded-full bg-brand-500/25 blur-[100px]" />
            <div className="relative">
              <h2 className="text-3xl font-extrabold tracking-tight text-ink-50 sm:text-5xl" style={display}>
                Make AI safe to use,
                <br />
                <span className="bg-gradient-to-r from-brand-300 to-brand-500 bg-clip-text text-transparent">before the next paste.</span>
              </h2>
              <p className="mx-auto mt-5 max-w-xl text-base text-ink-300 sm:text-lg">
                See the engine catch a leaked key in seconds, no account needed.
              </p>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <Link
                  to="/demo"
                  className="group inline-flex items-center gap-2 rounded-xl bg-brand-500 px-7 py-3.5 text-sm font-bold text-ink-950 shadow-[0_0_0_1px_rgba(6,182,212,0.25),0_12px_40px_-10px_rgba(6,182,212,0.65)] transition hover:bg-brand-400"
                >
                  Try the live demo <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                </Link>
                {pilotHref && (
                  <a
                    href={pilotHref}
                    className="inline-flex items-center gap-2 rounded-xl border border-ink-600 bg-ink-900/70 px-7 py-3.5 text-sm font-semibold text-ink-50 transition hover:border-brand-500/50"
                  >
                    Request a pilot
                  </a>
                )}
                <Link to="/login" className="inline-flex items-center gap-2 rounded-xl px-5 py-3.5 text-sm font-semibold text-ink-100 hover:text-brand-300">
                  Admin sign in
                </Link>
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-ink-800/80 bg-ink-950">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-5 py-8 sm:flex-row sm:px-6">
          <div className="flex items-center gap-2.5">
            <Logo size={28} />
            <span className="text-sm font-bold text-ink-100" style={display}>
              {PRODUCT}
            </span>
          </div>
          <div className="flex items-center gap-5 text-sm text-ink-400">
            <Link to="/demo" className="hover:text-ink-50">
              Live demo
            </Link>
            <Link to="/login" className="hover:text-ink-50">
              Sign in
            </Link>
            <a href="#faq" onClick={go('faq')} className="hover:text-ink-50">
              FAQ
            </a>
            <a href="#developer" onClick={go('developer')} className="hover:text-ink-50">
              Developer
            </a>
          </div>
          <p className="text-xs text-ink-500">© {new Date().getFullYear()} {PRODUCT}. Metadata-only. Privacy by design.</p>
        </div>
      </footer>
    </div>
  );
}

export { LandingPage };