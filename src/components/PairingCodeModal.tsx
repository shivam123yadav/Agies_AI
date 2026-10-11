import { useEffect, useState } from 'react';
import { KeyRound, Copy, Check, Clock, AlertTriangle, RefreshCw, Shield, Sparkles } from 'lucide-react';
import { Modal } from '@/components/Modal';
import { useToast } from '@/components/Toast';
import { generatePairingCode } from '@/lib/api';
import type { PairingCodeResponse } from '@/lib/api';
import { cx } from '@/lib/risk';

interface PairingTargetEmployee {
  employee_id: string;
  name: string;
}

interface PairingCodeModalProps {
  open: boolean;
  onClose: () => void;
  employee: PairingTargetEmployee | null;
}

export function PairingCodeModal({ open, onClose, employee }: PairingCodeModalProps) {
  const [codeData, setCodeData] = useState<PairingCodeResponse | null>(null);
  const [expiresAtMs, setExpiresAtMs] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState<number>(0);
  const toast = useToast();

  const handleClose = () => {
    if (loading) return;
    onClose();
  };

  // Reset all temporary state whenever the modal closes
  useEffect(() => {
    if (!open) {
      setCodeData(null);
      setExpiresAtMs(null);
      setLoading(false);
      setError(null);
      setCopied(false);
      setRemainingSeconds(0);
    }
  }, [open]);

  // Accurate countdown timer based on expiry timestamp
  useEffect(() => {
    if (!expiresAtMs) return;

    const updateTimer = () => {
      const secondsLeft = Math.max(0, Math.ceil((expiresAtMs - Date.now()) / 1000));
      setRemainingSeconds(secondsLeft);
    };

    updateTimer();
    const timer = setInterval(updateTimer, 1000);
    return () => clearInterval(timer);
  }, [expiresAtMs]);

  const handleGenerate = async () => {
    if (!employee?.employee_id || loading) return;

    setLoading(true);
    setError(null);
    setCopied(false);

    try {
      const response = await generatePairingCode(employee.employee_id);
      setCodeData(response);

      const targetMs = response.expires_at
        ? new Date(response.expires_at).getTime()
        : Date.now() + (response.expires_in_seconds || 600) * 1000;
      setExpiresAtMs(targetMs);
      setRemainingSeconds(response.expires_in_seconds || 600);

      toast.push({
        type: 'success',
        title: 'Pairing code generated',
        message: `Valid for 10 minutes for ${employee.name}. Single-use only.`,
      });
    } catch (err) {
      let message = 'Failed to generate pairing code.';
      if (err instanceof Error) {
        if (err.message.includes('Admin authentication required') || err.message.includes('401')) {
          message = 'Administrator session expired. Please sign in again to generate codes.';
        } else if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
          message = 'Network error connecting to backend server. Please check your connection.';
        } else {
          message = err.message;
        }
      }
      setError(message);
      toast.push({
        type: 'error',
        title: 'Generation failed',
        message,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!codeData?.code) return;

    try {
      let copiedSuccess = false;

      if (navigator?.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(codeData.code);
          copiedSuccess = true;
        } catch {
          // Fall back to execCommand if writeText fails
        }
      }

      if (!copiedSuccess) {
        const textArea = document.createElement('textarea');
        textArea.value = codeData.code;
        textArea.style.position = 'fixed';
        textArea.style.left = '-9999px';
        textArea.setAttribute('readonly', '');
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        copiedSuccess = document.execCommand('copy');
        document.body.removeChild(textArea);
      }

      if (copiedSuccess) {
        setCopied(true);
        toast.push({
          type: 'success',
          title: 'Pairing code copied',
          message: 'Paste it into the AgiesAI Sentinel extension popup.',
        });
        setTimeout(() => setCopied(false), 2500);
      } else {
        throw new Error('Clipboard copy unsupported');
      }
    } catch {
      toast.push({
        type: 'error',
        title: 'Copy failed',
        message: 'Please manually highlight and copy the code above.',
      });
    }
  };

  const formatCountdown = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const isExpired = Boolean(codeData && remainingSeconds === 0);

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Browser Extension Pairing"
      size="md"
    >
      <div className="space-y-4">
        {/* Target employee identity banner */}
        {employee && (
          <div className="surface p-3.5 flex items-center justify-between gap-3 border border-ink-800/80 bg-ink-900/60 rounded-xl">
            <div className="min-w-0">
              <p className="text-xs text-ink-400 font-medium">Employee Identity</p>
              <p className="text-sm font-semibold text-ink-100 truncate">{employee.name}</p>
            </div>
            <span className="font-mono text-xs px-2.5 py-1 rounded-md bg-ink-800 text-brand-300 border border-brand-500/20 shrink-0">
              {employee.employee_id}
            </span>
          </div>
        )}

        {/* Error message display */}
        {error && (
          <div className="p-3 rounded-lg border border-danger/40 bg-risk-highSoft flex items-start gap-2.5 text-danger text-sm">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-xs">Error generating pairing code</p>
              <p className="text-xs text-danger/90 mt-0.5">{error}</p>
            </div>
          </div>
        )}

        {/* State 1: Idle (no code generated yet) */}
        {!codeData && (
          <div className="space-y-4 py-1">
            <div className="rounded-xl border border-ink-800/80 bg-ink-850/40 p-4 space-y-2 text-sm text-ink-300">
              <div className="flex items-center gap-2 text-brand-300 font-medium text-xs">
                <Shield className="w-4 h-4 text-brand-400" />
                <span>Secure Extension Handshake</span>
              </div>
              <p className="text-xs text-ink-400 leading-relaxed">
                Generate a temporary one-time pairing code to authenticate this employee&apos;s browser extension. Codes expire after 10 minutes and can only be redeemed once.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                className="btn-secondary text-sm"
                onClick={handleClose}
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary text-sm inline-flex items-center gap-2"
                onClick={() => void handleGenerate()}
                disabled={loading}
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Generating…
                  </>
                ) : (
                  <>
                    <KeyRound className="w-4 h-4" />
                    Generate Pairing Code
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* State 2: Active or Expired Code */}
        {codeData && (
          <div className="space-y-4">
            {/* Code presentation container */}
            <div
              className={cx(
                'rounded-xl border p-5 flex flex-col items-center justify-center text-center transition-all',
                isExpired
                  ? 'border-ink-800 bg-ink-900/60 opacity-70'
                  : 'border-brand-500/40 bg-gradient-to-b from-brand-950/20 to-ink-900 shadow-glow'
              )}
            >
              <p className="text-xs font-medium uppercase tracking-wider text-ink-400 mb-2">
                One-Time Pairing Code
              </p>

              <div className="flex items-center gap-3 my-1">
                <span className="font-mono text-3xl font-bold tracking-widest text-brand-300 select-all">
                  {codeData.code}
                </span>

                <button
                  type="button"
                  onClick={() => void handleCopy()}
                  disabled={Boolean(isExpired) || loading}
                  className={cx(
                    'p-2 rounded-lg border transition-all text-sm flex items-center gap-1.5',
                    copied
                      ? 'border-success/40 bg-success/20 text-success'
                      : 'border-ink-700 bg-ink-800 hover:bg-ink-750 text-ink-100 hover:border-brand-500/40',
                    isExpired && 'cursor-not-allowed opacity-50'
                  )}
                  title="Copy pairing code"
                  aria-label="Copy pairing code"
                >
                  {copied ? (
                    <>
                      <Check className="w-4 h-4 text-success" />
                      <span className="text-xs font-semibold">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      <span className="text-xs font-medium">Copy</span>
                    </>
                  )}
                </button>
              </div>

              {/* Countdown / Expiration status */}
              <div className="mt-3 flex items-center gap-1.5 text-xs">
                <Clock className={cx('w-3.5 h-3.5', isExpired ? 'text-danger' : 'text-brand-400')} />
                {isExpired ? (
                  <span className="text-danger font-semibold">
                    Code has expired (single-use code is no longer valid)
                  </span>
                ) : (
                  <span className="text-ink-400">
                    Single-use code expires in{' '}
                    <span className="font-mono font-semibold text-brand-300">
                      {formatCountdown(remainingSeconds)}
                    </span>
                  </span>
                )}
              </div>
            </div>

            {/* Instruction callout */}
            <div className="rounded-lg border border-ink-800 bg-ink-850/60 p-3.5 text-xs text-ink-300 space-y-2">
              <div className="flex items-center gap-1.5 text-ink-100 font-semibold">
                <Sparkles className="w-3.5 h-3.5 text-brand-400" />
                <span>How to pair in the extension:</span>
              </div>
              <ol className="list-decimal list-inside space-y-1 text-ink-400">
                <li>Click the AgiesAI Sentinel icon in the browser toolbar to open the popup.</li>
                <li>Paste this pairing code into the <strong className="text-ink-200">PAIR EXTENSION</strong> field.</li>
                <li>Click <strong className="text-ink-200">Pair Extension</strong> to complete authorization.</li>
              </ol>
              <p className="text-[11px] text-ink-500 pt-1 border-t border-ink-800/80">
                Note: Single-use code. Generating a replacement code immediately invalidates any previous unused code for this employee.
              </p>
            </div>

            {/* Modal actions */}
            <div className="flex items-center justify-between gap-2 pt-2">
              <button
                type="button"
                className="btn-ghost text-xs text-ink-400 hover:text-ink-200 inline-flex items-center gap-1.5"
                onClick={() => void handleGenerate()}
                disabled={loading}
              >
                <RefreshCw className={cx('w-3.5 h-3.5', loading && 'animate-spin')} />
                {loading ? 'Generating…' : 'Generate Replacement Code'}
              </button>

              <button
                type="button"
                className="btn-secondary text-sm"
                onClick={handleClose}
                disabled={loading}
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
