import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ShieldCheck,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  Ban,
  ScanSearch,
  Gauge,
  Type,
  Sparkles,
  Eye,
  X,
} from 'lucide-react';
import { RiskScore, RiskBadge, ActionBadge } from '@/components/Risk';
import { DetectionPipeline } from '@/components/DetectionPipeline';
import { PrivacyNotice } from '@/components/PrivacyNotice';
import { useToast } from '@/components/Toast';
import { cx } from '@/lib/risk';

type Scenario = 'safe' | 'warning' | 'blocked';

interface ScenarioDef {
  id: Scenario;
  label: string;
  input: string;
}

const scenarios: Record<Scenario, ScenarioDef> = {
  safe: {
    id: 'safe',
    label: 'Safe',
    input: 'Help me create a professional meeting agenda.',
  },
  warning: {
    id: 'warning',
    label: 'Warning',
    input: 'Please send this internal financial information to an external AI assistant.',
  },
  blocked: {
    id: 'blocked',
    label: 'Blocked',
    input:
      'Send this production API key to the external AI assistant for deployment: sk-live123456789012345678',
  },
};

interface ApiResponse {
  success: boolean;

  detection: {
    detected: boolean;
    finding_count: number;
    findings: {
      type: string;
      count: number;
      masked_examples: string[];
    }[];
  };

  context: {
    context_level: 'LOW' | 'MEDIUM' | 'HIGH';
    score_modifier: number;
    signals: {
      signal: string;
      category: string;
      impact: number;
    }[];
  };

  risk: {
    score: number;
    level: 'LOW' | 'MEDIUM' | 'HIGH';
    context_modifier: number;
    reasons: {
      type: string;
      weight: number;
      count: number;
      contribution: number;
    }[];
  };

  policy: {
    decision: 'ALLOW' | 'WARN' | 'BLOCK';
    policy: string;
    message: string;
  };

  incident_id?: string | number;
}

type Phase = 'idle' | 'scanning' | 'result';

const pipelineStages = [
  { label: 'INPUT', icon: Type, tone: 'neutral' },
  { label: 'PATTERN DETECTION', icon: ScanSearch, tone: 'local' },
  { label: 'CONTEXTUAL ANALYSIS', icon: Eye, tone: 'context' },
  { label: 'RISK SCORE', icon: Gauge, tone: 'neutral' },
  { label: 'POLICY ENGINE', icon: ShieldCheck, tone: 'neutral' },
  { label: 'ACTION', icon: ShieldCheck, tone: 'neutral' },
];

function TopBar() {
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-40 border-b border-ink-800/60 bg-ink-950/70 backdrop-blur-md">
      <div className="max-w-6xl mx-auto flex items-center justify-between px-5 h-16">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shadow-glow">
            <ShieldCheck className="w-5 h-5 text-ink-950" />
          </div>

          <div className="leading-tight">
            <p className="font-display font-bold text-ink-50 text-[15px]">
              AgiesAI Sentinel
            </p>

            <p className="text-[10px] uppercase tracking-[0.18em] text-brand-300 -mt-0.5">
              Interactive Demo
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => navigate('/')}
            className="btn-ghost text-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            Home
          </button>

          <button
            onClick={() => navigate('/dashboard')}
            className="btn-primary text-sm"
          >
            Dashboard
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
}

export function DemoPage() {
  const [scenario, setScenario] = useState<Scenario>('safe');
  const [phase, setPhase] = useState<Phase>('idle');
  const [activeStage, setActiveStage] = useState(-1);

  const [apiResult, setApiResult] = useState<ApiResponse | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const timers = useRef<number[]>([]);

  const navigate = useNavigate();
  const toast = useToast();

  const clearTimers = () => {
    timers.current.forEach((timer) => clearTimeout(timer));
    timers.current = [];
  };

  /*
   * Real AgiesAI backend call
   */
  const analyzeWithBackend = async (
    text: string,
  ): Promise<ApiResponse | null> => {
    setIsAnalyzing(true);
    setApiError(null);

    try {
      const response = await fetch(
        'http://127.0.0.1:8000/api/detect',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            text,
          }),
        },
      );

      if (!response.ok) {
        throw new Error(
          `Backend returned HTTP ${response.status}`,
        );
      }

      const data: ApiResponse = await response.json();

      setApiResult(data);

      return data;
    } catch (error) {
      console.error('AgiesAI backend error:', error);

      setApiError(
        'Unable to connect to the AgiesAI security engine. Make sure the FastAPI server is running on port 8000.',
      );

      return null;
    } finally {
      setIsAnalyzing(false);
    }
  };

  /*
   * Run visual pipeline + real backend analysis
   */
  const runScan = async (selectedScenario: Scenario) => {
    clearTimers();

    setScenario(selectedScenario);
    setPhase('scanning');
    setActiveStage(-1);
    setApiResult(null);
    setApiError(null);

    pipelineStages.forEach((_, index) => {
      const timer = window.setTimeout(() => {
        setActiveStage(index);
      }, 350 + index * 380);

      timers.current.push(timer);
    });

    const result = await analyzeWithBackend(
      scenarios[selectedScenario].input,
    );

    if (!result) {
      setPhase('result');
      return;
    }

    const timer = window.setTimeout(
      () => setPhase('result'),
      350 + pipelineStages.length * 380 + 300,
    );

    timers.current.push(timer);
  };

  useEffect(() => {
    runScan('safe');

    return () => {
      clearTimers();
    };
  }, []);

  const def = scenarios[scenario];

  /*
   * Backend-driven values
   */
  const displayAction =
    apiResult?.policy.decision ?? null;

  const displayLevel =
    apiResult?.risk.level ?? null;

  const displayScore =
    apiResult?.risk.score ?? null;

  const detectionTypes =
    apiResult && apiResult.detection.findings.length > 0
      ? apiResult.detection.findings
          .map((finding) => finding.type)
          .join(', ')
      : 'No sensitive information detected';

  const matchedRule =
    apiResult?.risk.reasons?.[0]?.type
      ? `${apiResult.risk.reasons[0].type}_PATTERN`
      : '—';

  const contextSignals =
    apiResult && apiResult.context.signals.length > 0
      ? apiResult.context.signals
          .map((signal) => {
            const impact =
              signal.impact > 0
                ? `+${signal.impact}`
                : signal.impact;

            return `${signal.signal} (${impact})`;
          })
          .join(', ')
      : 'No sensitive context identified';

  const tone =
    displayAction === 'BLOCK'
      ? 'danger'
      : displayAction === 'WARN'
        ? 'warn'
        : 'success';

  const maskedInput =
    apiResult?.detection.findings?.[0]?.masked_examples?.[0]
      ? def.input.replace(
          /sk-[A-Za-z0-9_-]+/g,
          apiResult.detection.findings[0].masked_examples[0],
        )
      : def.input;

  return (
    <div className="min-h-screen">
      <TopBar />

      <div className="max-w-6xl mx-auto px-5 py-8">
        <div className="text-center max-w-2xl mx-auto mb-8">
          <h1 className="font-display text-3xl lg:text-4xl font-bold text-ink-50">
            Interactive Protection Demo
          </h1>

          <p className="mt-3 text-ink-300">
            Simulate an AI chat submission. AgiesAI Sentinel captures,
            detects, analyzes, and decides before sensitive content
            leaves the browser.
          </p>
        </div>

        {/* Scenario selector */}
        <div className="flex justify-center mb-8">
          <div className="inline-flex rounded-xl border border-ink-700 bg-ink-850 p-1">
            {(Object.keys(scenarios) as Scenario[]).map((s) => {
              const sc = scenarios[s];

              const active = scenario === s;

              const dot =
                s === 'blocked'
                  ? 'bg-danger'
                  : s === 'warning'
                    ? 'bg-warn'
                    : 'bg-success';

              return (
                <button
                  key={s}
                  onClick={() => runScan(s)}
                  disabled={isAnalyzing}
                  className={cx(
                    'flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all',
                    active
                      ? 'bg-ink-800 text-ink-50 shadow-card'
                      : 'text-ink-400 hover:text-ink-200',
                    isAnalyzing &&
                      'cursor-wait opacity-80',
                  )}
                >
                  <span
                    className={cx(
                      'w-2 h-2 rounded-full',
                      dot,
                    )}
                  />

                  {sc.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid lg:grid-cols-5 gap-5">
          {/* Chat panel */}
          <div className="lg:col-span-3">
            <div className="surface overflow-hidden">
              {/* Chat header */}
              <div className="flex items-center gap-3 px-5 py-3.5 border-b border-ink-800/60 bg-ink-850/50">
                <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-brand-500/30 to-brand-700/30 border border-brand-500/30 flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-brand-300" />
                </div>

                <div>
                  <p className="text-sm font-semibold text-ink-100">
                    AI Assistant
                  </p>

                  <p className="text-[11px] text-ink-400 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-success" />
                    Protected by Sentinel
                  </p>
                </div>
              </div>

              {/* Chat body */}
              <div className="p-5 min-h-[260px]">
                <div className="flex justify-end">
                  <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-brand-500/10 border border-brand-500/20 px-4 py-3">
                    <p className="text-sm text-ink-100 whitespace-pre-line font-mono leading-relaxed">
                      {maskedInput}
                    </p>
                  </div>
                </div>

                {phase === 'scanning' && (
                  <div className="mt-4 flex items-center gap-2 text-sm text-ink-400 animate-fade-in">
                    <ScanSearch className="w-5 h-5 text-brand-400 animate-spin-slow" />

                    {isAnalyzing
                      ? 'Analyzing with AgiesAI Sentinel…'
                      : 'Scanning submission before send…'}
                  </div>
                )}

                {apiError && (
                  <div className="mt-4 rounded-xl border border-danger/30 bg-risk-highSoft px-4 py-3">
                    <div className="flex items-start gap-2.5">
                      <AlertTriangle className="w-5 h-5 text-danger shrink-0" />

                      <div>
                        <p className="text-sm font-semibold text-danger">
                          Security engine unavailable
                        </p>

                        <p className="mt-1 text-xs text-ink-300">
                          {apiError}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {phase === 'result' &&
                  apiResult &&
                  displayAction && (
                    <div className="mt-4 animate-slide-up">
                      <div
                        className={cx(
                          'rounded-2xl rounded-bl-sm border px-4 py-3',
                          tone === 'danger'
                            ? 'bg-risk-highSoft border-danger/30'
                            : tone === 'warn'
                              ? 'bg-risk-mediumSoft border-warn/30'
                              : 'bg-risk-lowSoft border-success/30',
                        )}
                      >
                        <div className="flex items-center gap-2.5">
                          {tone === 'danger' ? (
                            <Ban className="w-5 h-5 text-danger" />
                          ) : tone === 'warn' ? (
                            <AlertTriangle className="w-5 h-5 text-warn" />
                          ) : (
                            <CheckCircle2 className="w-5 h-5 text-success" />
                          )}

                          <p
                            className={cx(
                              'text-sm font-semibold',
                              tone === 'danger'
                                ? 'text-danger'
                                : tone === 'warn'
                                  ? 'text-warn'
                                  : 'text-success',
                            )}
                          >
                            {displayAction === 'BLOCK'
                              ? 'HIGH RISK — BLOCKED'
                              : displayAction === 'WARN'
                                ? 'WARNING'
                                : 'SAFE'}
                          </p>
                        </div>

                        <p className="mt-1.5 text-sm text-ink-300">
                          {apiResult.policy.message}
                        </p>
                      </div>
                    </div>
                  )}
              </div>

              {/* Input bar */}
              <div className="border-t border-ink-800/60 p-3 flex items-center gap-2">
                <div className="flex-1 bg-ink-850 border border-ink-700 rounded-lg px-3.5 py-2.5 text-sm text-ink-500 truncate">
                  {maskedInput}
                </div>

                <button
                  className={cx(
                    'btn px-4 py-2.5 text-sm',
                    displayAction === 'BLOCK'
                      ? 'bg-ink-800 text-ink-500 cursor-not-allowed'
                      : 'btn-primary',
                  )}
                  disabled={
                    displayAction === 'BLOCK' ||
                    phase !== 'result' ||
                    !apiResult
                  }
                  onClick={() =>
                    toast.push({
                      type: 'success',
                      title: 'Submission sent',
                      message:
                        'Allowed by Sentinel policy.',
                    })
                  }
                >
                  Send
                </button>
              </div>
            </div>
          </div>

          {/* Analysis panel */}
          <div className="lg:col-span-2 space-y-4">
            {/* Pipeline */}
            <div className="surface p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-400 mb-3">
                Detection Pipeline
              </p>

              <div className="space-y-2">
                {pipelineStages.map((stage, i) => {
                  const reached =
                    phase === 'result' ||
                    (phase === 'scanning' &&
                      activeStage >= i);

                  const isCurrent =
                    phase === 'scanning' &&
                    activeStage === i;

                  return (
                    <div
                      key={stage.label}
                      className={cx(
                        'flex items-center gap-2.5 rounded-lg border px-3 py-2.5 transition-all duration-300',
                        reached
                          ? stage.tone === 'local'
                            ? 'border-brand-500/30 bg-brand-500/5'
                            : stage.tone === 'context'
                              ? 'border-ink-600 bg-ink-850/60'
                              : 'border-ink-700 bg-ink-850/60'
                          : 'border-ink-800 bg-ink-900/40 opacity-50',
                        isCurrent &&
                          'ring-2 ring-brand-400/40',
                      )}
                    >
                      <stage.icon
                        className={cx(
                          'w-4 h-4',
                          reached
                            ? stage.tone === 'local'
                              ? 'text-brand-300'
                              : stage.tone === 'context'
                                ? 'text-ink-200'
                                : 'text-ink-200'
                            : 'text-ink-500',
                          isCurrent && 'animate-pulse',
                        )}
                      />

                      <span
                        className={cx(
                          'text-xs font-medium',
                          reached
                            ? 'text-ink-200'
                            : 'text-ink-500',
                        )}
                      >
                        {stage.label}
                      </span>

                      {reached && phase === 'result' && (
                        <CheckCircle2
                          className={cx(
                            'w-4 h-4 ml-auto',
                            stage.tone === 'local'
                              ? 'text-brand-400'
                              : 'text-success',
                          )}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Result */}
            {phase === 'result' &&
              apiResult &&
              displayScore !== null &&
              displayLevel &&
              displayAction && (
                <div className="surface p-5 animate-scale-in">
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">
                      Risk Analysis
                    </p>

                    <ActionBadge action={displayAction} />
                  </div>

                  <div className="flex items-center gap-4">
                    <RiskScore
                      score={displayScore}
                      level={displayLevel}
                      size="lg"
                    />

                    <div className="flex-1 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-ink-400">
                          Risk Level
                        </span>

                        <RiskBadge level={displayLevel} />
                      </div>

                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs text-ink-400">
                          Detection
                        </span>

                        <span className="text-xs font-medium text-ink-200 text-right">
                          {detectionTypes}
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs text-ink-400">
                          Matched Rule
                        </span>

                        <span className="text-xs font-mono text-brand-300">
                          {matchedRule}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Score breakdown */}
                  <div className="mt-5 pt-4 border-t border-ink-800/60">
                    <p className="text-xs font-semibold uppercase tracking-wider text-ink-400 mb-3">
                      Risk Breakdown
                    </p>

                    <div className="space-y-2">
                      {apiResult.risk.reasons.map(
                        (reason, index) => (
                          <div
                            key={`${reason.type}-${index}`}
                            className="flex items-center justify-between"
                          >
                            <span className="text-xs text-ink-400">
                              {reason.type}
                            </span>

                            <span className="text-xs font-mono text-ink-200">
                              +{reason.contribution}
                            </span>
                          </div>
                        ),
                      )}

                      <div className="flex items-center justify-between">
                        <span className="text-xs text-ink-400">
                          Context modifier
                        </span>

                        <span
                          className={cx(
                            'text-xs font-mono',
                            apiResult.risk.context_modifier > 0
                              ? 'text-danger'
                              : apiResult.risk.context_modifier < 0
                                ? 'text-success'
                                : 'text-ink-300',
                          )}
                        >
                          {apiResult.risk.context_modifier > 0
                            ? '+'
                            : ''}
                          {apiResult.risk.context_modifier}
                        </span>
                      </div>

                      <div className="pt-2 mt-2 border-t border-ink-800 flex items-center justify-between">
                        <span className="text-xs font-semibold text-ink-200">
                          Final Risk
                        </span>

                        <span className="text-sm font-bold font-mono text-ink-50">
                          {apiResult.risk.score}/100
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Decision breakdown */}
                  <div className="mt-5 pt-4 border-t border-ink-800/60">
                    <p className="text-xs font-semibold uppercase tracking-wider text-ink-400 mb-3">
                      {displayAction === 'BLOCK'
                        ? 'Why was this blocked?'
                        : 'Decision Breakdown'}
                    </p>

                    <div className="space-y-3">
                      {/* Pattern */}
                      <div className="flex items-start gap-2.5">
                        {apiResult.detection.detected ? (
                          <CheckCircle2 className="w-4 h-4 text-success mt-0.5 shrink-0" />
                        ) : (
                          <X className="w-4 h-4 text-ink-500 mt-0.5 shrink-0" />
                        )}

                        <div>
                          <p className="text-xs font-medium text-ink-200">
                            Pattern Detection
                          </p>

                          <p className="text-[11px] text-ink-400">
                            {apiResult.detection.detected
                              ? `${apiResult.detection.finding_count} sensitive finding(s) detected`
                              : 'No sensitive pattern matched'}
                          </p>
                        </div>
                      </div>

                      {/* Context */}
                      <div className="flex items-start gap-2.5">
                        {apiResult.context.context_level ===
                        'HIGH' ? (
                          <AlertTriangle className="w-4 h-4 text-danger mt-0.5 shrink-0" />
                        ) : apiResult.context
                            .score_modifier > 0 ? (
                          <AlertTriangle className="w-4 h-4 text-warn mt-0.5 shrink-0" />
                        ) : (
                          <CheckCircle2 className="w-4 h-4 text-success mt-0.5 shrink-0" />
                        )}

                        <div>
                          <p className="text-xs font-medium text-ink-200">
                            Contextual Analysis
                          </p>

                          <p className="text-[11px] text-ink-400">
                            {contextSignals}
                          </p>
                        </div>
                      </div>

                      {/* Risk */}
                      <div className="flex items-start gap-2.5">
                        <CheckCircle2 className="w-4 h-4 text-success mt-0.5 shrink-0" />

                        <div>
                          <p className="text-xs font-medium text-ink-200">
                            Risk Engine
                          </p>

                          <p className="text-[11px] text-ink-400">
                            {apiResult.risk.score}/100 ·{' '}
                            {apiResult.risk.level}
                          </p>
                        </div>
                      </div>

                      {/* Policy */}
                      <div className="flex items-start gap-2.5">
                        <CheckCircle2 className="w-4 h-4 text-success mt-0.5 shrink-0" />

                        <div>
                          <p className="text-xs font-medium text-ink-200">
                            Policy Engine
                          </p>

                          <p className="text-[11px] text-ink-400">
                            {apiResult.policy.policy}
                            {' → '}
                            {apiResult.policy.decision}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Context signals */}
                  {apiResult.context.signals.length > 0 && (
                    <div className="mt-5 pt-4 border-t border-ink-800/60">
                      <p className="text-xs font-semibold uppercase tracking-wider text-ink-400 mb-3">
                        Context Signals
                      </p>

                      <div className="flex flex-wrap gap-2">
                        {apiResult.context.signals.map(
                          (signal, index) => (
                            <span
                              key={`${signal.signal}-${index}`}
                              className={cx(
                                'inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-mono',
                                signal.impact > 0
                                  ? 'border-danger/20 bg-risk-highSoft text-ink-300'
                                  : 'border-success/20 bg-risk-lowSoft text-ink-300',
                              )}
                            >
                              {signal.signal}

                              <span>
                                {signal.impact > 0
                                  ? '+'
                                  : ''}
                                {signal.impact}
                              </span>
                            </span>
                          ),
                        )}
                      </div>
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="mt-5 flex gap-2.5">
                    {displayAction === 'WARN' && (
                      <>
                        <button
                          className="btn-secondary flex-1 text-sm"
                          onClick={() => {
                            setPhase('idle');

                            toast.push({
                              type: 'info',
                              title: 'Submission cancelled',
                            });
                          }}
                        >
                          Cancel
                        </button>

                        <button
                          className="btn-primary flex-1 text-sm"
                          onClick={() =>
                            toast.push({
                              type: 'warn',
                              title: 'Submitted anyway',
                              message:
                                'Warning acknowledged by user.',
                            })
                          }
                        >
                          Continue Anyway
                        </button>
                      </>
                    )}

                    {displayAction === 'BLOCK' && (
                      <>
                        <button
                          className="btn-secondary flex-1 text-sm"
                          onClick={() =>
                            toast.push({
                              type: 'info',
                              title: 'Acknowledged',
                              message:
                                'Block acknowledged.',
                            })
                          }
                        >
                          Acknowledge
                        </button>

                        <button
                          className="btn-primary flex-1 text-sm"
                          onClick={() =>
                            navigate(`/incidents/${apiResult?.incident_id}`)
                          }
                        >
                          View Incident
                        </button>
                      </>
                    )}

                    {displayAction === 'ALLOW' && (
                      <button
                        className="btn-primary w-full text-sm"
                        onClick={() =>
                          toast.push({
                            type: 'success',
                            title: 'Submission sent',
                            message:
                              'Allowed by Sentinel policy.',
                          })
                        }
                      >
                        Submit
                      </button>
                    )}
                  </div>
                </div>
              )}

            <PrivacyNotice />
          </div>
        </div>

        {/* Static pipeline reference */}
        <div className="mt-8 surface p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-400 mb-4">
            Pipeline Reference
          </p>

          <DetectionPipeline />
        </div>
      </div>
    </div>
  );
}