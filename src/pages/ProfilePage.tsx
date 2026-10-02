import { useState } from 'react';
import { Mail, Building2, Briefcase, ShieldCheck, Check, Camera } from 'lucide-react';
import { SectionCard } from '@/components/Cards';
import { useToast } from '@/components/Toast';
import { initials } from '@/lib/risk';

export function ProfilePage() {
  const [name, setName] = useState('Admin User');
  const [email, setEmail] = useState('admin@northwind.co');
  const [role, setRole] = useState('Security Admin');
  const [org, setOrg] = useState('Northwind Inc.');
  const [editing, setEditing] = useState(false);
  const toast = useToast();

  const save = () => {
    setEditing(false);
    toast.push({ type: 'success', title: 'Profile updated', message: 'Your changes have been saved.' });
  };

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      {/* Profile header */}
      <div className="surface p-6">
        <div className="flex flex-col sm:flex-row items-start gap-5">
          <div className="relative">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center text-2xl font-bold text-ink-950">
              {initials(name)}
            </div>
            <button className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-ink-800 border border-ink-600 flex items-center justify-center text-ink-300 hover:text-ink-100" aria-label="Change avatar">
              <Camera className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-display font-bold text-ink-50">{name}</h2>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-ink-400">
              <span className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" /> {email}</span>
              <span className="flex items-center gap-1.5"><Briefcase className="w-3.5 h-3.5" /> {role}</span>
              <span className="flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5" /> {org}</span>
            </div>
          </div>
          {!editing && (
            <button className="btn-secondary text-sm" onClick={() => setEditing(true)}>
              Edit Profile
            </button>
          )}
        </div>
      </div>

      {/* Edit form */}
      <SectionCard title="Profile Details" subtitle="Changes are saved locally (demo only)">
        <div className="space-y-4">
          <div>
            <label className="label">Full Name</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} disabled={!editing} />
          </div>
          <div>
            <label className="label">Email</label>
            <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} disabled={!editing} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Role</label>
              <input className="input" value={role} onChange={(e) => setRole(e.target.value)} disabled={!editing} />
            </div>
            <div>
              <label className="label">Organization</label>
              <input className="input" value={org} onChange={(e) => setOrg(e.target.value)} disabled={!editing} />
            </div>
          </div>
          {editing && (
            <div className="flex justify-end gap-2 pt-2">
              <button className="btn-secondary text-sm" onClick={() => setEditing(false)}>Cancel</button>
              <button className="btn-primary text-sm" onClick={save}>
                <Check className="w-4 h-4" /> Save
              </button>
            </div>
          )}
        </div>
      </SectionCard>

      {/* Security summary */}
      <SectionCard title="Security Summary">
        <div className="flex items-center gap-3 rounded-lg border border-success/30 bg-risk-lowSoft p-4">
          <ShieldCheck className="w-5 h-5 text-success" />
          <div>
            <p className="text-sm font-medium text-ink-100">Account secured</p>
            <p className="text-xs text-ink-400">Your account has admin access to the Sentinel console.</p>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
