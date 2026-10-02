import { useState } from 'react';
import {
  Building2,
  ShieldCheck,
  Bell,
  Lock,
  Palette,
  Check,
} from 'lucide-react';
import { SectionCard } from '@/components/Cards';
import { useToast } from '@/components/Toast';
import { cx } from '@/lib/risk';

const sections = [
  { id: 'organization', label: 'Organization', icon: Building2 },
  { id: 'security', label: 'Security', icon: ShieldCheck },
  { id: 'policies', label: 'Policies', icon: ShieldCheck },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'privacy', label: 'Privacy', icon: Lock },
  { id: 'appearance', label: 'Appearance', icon: Palette },
] as const;

type SectionId = (typeof sections)[number]['id'];

export function SettingsPage() {
  const [active, setActive] = useState<SectionId>('organization');
  const toast = useToast();

  const save = () => toast.push({ type: 'success', title: 'Settings saved', message: 'Your preferences have been updated.' });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
      {/* Settings nav */}
      <div className="lg:col-span-1">
        <div className="surface p-3 lg:sticky lg:top-20">
          <div className="flex lg:flex-col gap-1 overflow-x-auto">
            {sections.map((s) => (
              <button
                key={s.id}
                onClick={() => setActive(s.id)}
                className={cx(
                  'flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors whitespace-nowrap',
                  active === s.id ? 'bg-brand-500/10 text-brand-300 border border-brand-500/20' : 'text-ink-300 hover:text-ink-100 hover:bg-ink-800/60',
                )}
              >
                <s.icon className="w-4 h-4" />
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Settings content */}
      <div className="lg:col-span-3">
        <SectionCard title={sections.find((s) => s.id === active)?.label ?? 'Settings'}>
          {active === 'organization' && <OrganizationSettings onSave={save} />}
          {active === 'security' && <SecuritySettings onSave={save} />}
          {active === 'policies' && <PolicySettings onSave={save} />}
          {active === 'notifications' && <NotificationSettings onSave={save} />}
          {active === 'privacy' && <PrivacySettings onSave={save} />}
          {active === 'appearance' && <AppearanceSettings onSave={save} />}
        </SectionCard>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
    </div>
  );
}

function Toggle({ checked, onChange, label, desc }: { checked: boolean; onChange: (v: boolean) => void; label: string; desc?: string }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-ink-800/60 last:border-0">
      <div>
        <p className="text-sm font-medium text-ink-100">{label}</p>
        {desc && <p className="text-xs text-ink-400 mt-0.5">{desc}</p>}
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={cx('relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0', checked ? 'bg-brand-500' : 'bg-ink-700')}
        aria-label={label}
      >
        <span className={cx('inline-block h-4.5 w-4.5 transform rounded-full bg-white transition-transform', checked ? 'translate-x-5' : 'translate-x-1')} style={{ height: 18, width: 18 }} />
      </button>
    </div>
  );
}

function SaveBar({ onSave }: { onSave: () => void }) {
  return (
    <div className="mt-5 flex justify-end">
      <button className="btn-primary text-sm" onClick={onSave}>
        <Check className="w-4 h-4" /> Save Changes
      </button>
    </div>
  );
}

function OrganizationSettings({ onSave }: { onSave: () => void }) {
  const [name, setName] = useState('Northwind Inc.');
  const [domain, setDomain] = useState('northwind.co');
  const [seats, setSeats] = useState('42');
  return (
    <div className="space-y-4">
      <Field label="Organization Name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label="Domain"><input className="input" value={domain} onChange={(e) => setDomain(e.target.value)} /></Field>
      <Field label="Licensed Seats"><input className="input" value={seats} onChange={(e) => setSeats(e.target.value)} /></Field>
      <SaveBar onSave={onSave} />
    </div>
  );
}

function SecuritySettings({ onSave }: { onSave: () => void }) {
  const [enforce, setEnforce] = useState(true);
  const [autoBlock, setAutoBlock] = useState(true);
  const [audit, setAudit] = useState(true);
  return (
    <div>
      <Toggle checked={enforce} onChange={setEnforce} label="Enforce extension on all employees" desc="Require the Sentinel extension for AI-tool access." />
      <Toggle checked={autoBlock} onChange={setAutoBlock} label="Auto-block high-risk submissions" desc="Block submissions scoring 70+ without user override." />
      <Toggle checked={audit} onChange={setAudit} label="Tamper-evident audit logging" desc="Chain all security events by hash." />
      <SaveBar onSave={onSave} />
    </div>
  );
}

function PolicySettings({ onSave }: { onSave: () => void }) {
  const [allowOverride, setAllowOverride] = useState(true);
  const [warnEscalate, setWarnEscalate] = useState(false);
  return (
    <div>
      <Toggle checked={allowOverride} onChange={setAllowOverride} label="Allow warn-level override" desc="Employees can continue past warnings." />
      <Toggle checked={warnEscalate} onChange={setWarnEscalate} label="Escalate repeated warnings to block" desc="After 3 warnings, auto-block the same category." />
      <SaveBar onSave={onSave} />
    </div>
  );
}

function NotificationSettings({ onSave }: { onSave: () => void }) {
  const [highRisk, setHighRisk] = useState(true);
  const [medium, setMedium] = useState(true);
  const [policy, setPolicy] = useState(false);
  const [extension, setExtension] = useState(true);
  return (
    <div>
      <Toggle checked={highRisk} onChange={setHighRisk} label="High-risk incident alerts" desc="Notify when a submission is blocked." />
      <Toggle checked={medium} onChange={setMedium} label="Medium-risk warnings" desc="Notify on warn-level detections." />
      <Toggle checked={policy} onChange={setPolicy} label="Policy change notifications" desc="Notify when policies are updated." />
      <Toggle checked={extension} onChange={setExtension} label="Extension status changes" desc="Notify when extension goes offline." />
      <SaveBar onSave={onSave} />
    </div>
  );
}

function PrivacySettings({ onSave }: { onSave: () => void }) {
  const [metadataOnly, setMetadataOnly] = useState(true);
  const [mask, setMask] = useState(true);
  const [retain, setRetain] = useState(true);
  return (
    <div>
      <Toggle checked={metadataOnly} onChange={setMetadataOnly} label="Metadata-only retention" desc="Never store raw sensitive content." />
      <Toggle checked={mask} onChange={setMask} label="Mask sensitive examples" desc="Display masked versions in incident records." />
      <Toggle checked={retain} onChange={setRetain} label="Retain incident metadata for 90 days" desc="Auto-purge metadata after retention window." />
      <SaveBar onSave={onSave} />
    </div>
  );
}

function AppearanceSettings({ onSave }: { onSave: () => void }) {
  const [density, setDensity] = useState('comfortable');
  const [accent, setAccent] = useState('cyan');
  return (
    <div className="space-y-4">
      <Field label="Density">
        <select className="input" value={density} onChange={(e) => setDensity(e.target.value)}>
          <option value="comfortable">Comfortable</option>
          <option value="compact">Compact</option>
        </select>
      </Field>
      <Field label="Accent Color">
        <select className="input" value={accent} onChange={(e) => setAccent(e.target.value)}>
          <option value="cyan">Cyan</option>
          <option value="teal">Teal</option>
          <option value="emerald">Emerald</option>
        </select>
      </Field>
      <SaveBar onSave={onSave} />
    </div>
  );
}
