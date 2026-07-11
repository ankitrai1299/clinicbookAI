import React from 'react';
import { useEffect, useState } from 'react';
import {
  Save,
  Sparkles,
  Mic,
  Globe,
  FileText,
  DatabaseBackup,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Loader2,
} from 'lucide-react';
import { AdminSettings, SUPPORTED_LANGUAGES } from '../../../contracts';
import { getSettings, updateSettings, triggerBackup } from '../../../services/api';
import { useAuth } from '../../../context/Auth';
import { Page, SectionHeader, Card, inputClass, LoadingState, ErrorState, formatDate } from '../ui';

export default function SettingsSection() {
  const { token, hasPermission } = useAuth();
  const canManage = hasPermission('settings.manage');
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [backingUp, setBackingUp] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setLoading(true);
    getSettings(token)
      .then((s) => !cancelled && setSettings(s))
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [token]);

  const update = <K extends keyof AdminSettings>(key: K, value: AdminSettings[K]) =>
    setSettings((s) => (s ? { ...s, [key]: value } : s));

  const handleSave = async () => {
    if (!token || !settings) return;
    setSaving(true);
    setError(null);
    try {
      const next = await updateSettings(token, settings);
      setSettings(next);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleBackup = async () => {
    if (!token) return;
    setBackingUp(true);
    try {
      const { lastBackupAt } = await triggerBackup(token);
      setSettings((s) => (s ? { ...s, backup: { ...s.backup, lastBackupAt } } : s));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Backup failed');
    } finally {
      setBackingUp(false);
    }
  };

  if (loading) return <LoadingState />;
  if (error && !settings) return <Page><ErrorState message={error} /></Page>;
  if (!settings) return null;

  return (
    <Page>
      <SectionHeader
        title="Settings"
        description="Configure AI providers, languages, reports, backups and security."
        action={
          canManage && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-5 py-2.5 rounded-xl font-semibold shadow-sm hover:shadow-md transition-all flex items-center gap-2"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              {saved ? 'Saved!' : 'Save Settings'}
            </button>
          )
        }
      />

      {error && <div className="mb-4"><ErrorState message={error} /></div>}
      {!canManage && (
        <div className="mb-4 p-3 rounded-xl bg-amber-50 border border-amber-100 text-amber-700 text-sm font-medium">
          You have read-only access to settings.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* AI / STT Providers */}
        <SettingsCard icon={Sparkles} title="AI Provider" tone="purple">
          <SelectRow
            label="Report Generation Provider"
            value={settings.aiProvider}
            options={[{ v: 'sarvam', l: 'Sarvam' }, { v: 'openai', l: 'OpenAI' }]}
            disabled={!canManage}
            onChange={(v) => update('aiProvider', v as AdminSettings['aiProvider'])}
          />
        </SettingsCard>

        <SettingsCard icon={Mic} title="STT Provider" tone="rose">
          <SelectRow
            label="Speech-to-Text Provider"
            value={settings.sttProvider}
            options={[{ v: 'sarvam', l: 'Sarvam' }, { v: 'whisper', l: 'Whisper' }]}
            disabled={!canManage}
            onChange={(v) => update('sttProvider', v as AdminSettings['sttProvider'])}
          />
        </SettingsCard>

        {/* Sarvam */}
        <SettingsCard icon={Sparkles} title="Sarvam Settings" tone="blue" badge={<ConfiguredBadge ok={settings.sarvam.apiConfigured} />}>
          <TextRow
            label="Model"
            value={settings.sarvam.model}
            disabled={!canManage}
            onChange={(v) => update('sarvam', { ...settings.sarvam, model: v })}
          />
        </SettingsCard>

        {/* OpenAI (future) */}
        <SettingsCard icon={Sparkles} title="OpenAI Settings" tone="emerald" badge={<ConfiguredBadge ok={settings.openai.apiConfigured} />}>
          <TextRow label="Model" value={settings.openai.model} disabled onChange={() => {}} />
          <p className="text-xs text-slate-400 mt-2">Coming soon — future-ready configuration.</p>
        </SettingsCard>

        {/* Whisper */}
        <SettingsCard icon={Mic} title="Whisper Settings" tone="indigo" badge={<ConfiguredBadge ok={settings.whisper.apiConfigured} />}>
          <TextRow
            label="Model"
            value={settings.whisper.model}
            disabled={!canManage}
            onChange={(v) => update('whisper', { ...settings.whisper, model: v })}
          />
        </SettingsCard>

        {/* Language */}
        <SettingsCard icon={Globe} title="Language Settings" tone="sky">
          <SelectRow
            label="Default Language"
            value={settings.defaultLanguage}
            options={SUPPORTED_LANGUAGES.map((l) => ({ v: l.code, l: l.name }))}
            disabled={!canManage}
            onChange={(v) => update('defaultLanguage', v)}
          />
        </SettingsCard>

        {/* Report settings */}
        <SettingsCard icon={FileText} title="Report Settings" tone="teal">
          <ToggleRow
            label="Auto-save reports"
            checked={settings.reportSettings.autoSave}
            disabled={!canManage}
            onChange={(v) => update('reportSettings', { ...settings.reportSettings, autoSave: v })}
          />
          <ToggleRow
            label="Include signature"
            checked={settings.reportSettings.includeSignature}
            disabled={!canManage}
            onChange={(v) => update('reportSettings', { ...settings.reportSettings, includeSignature: v })}
          />
          <TextRow
            label="Letterhead"
            value={settings.reportSettings.letterhead}
            disabled={!canManage}
            onChange={(v) => update('reportSettings', { ...settings.reportSettings, letterhead: v })}
          />
        </SettingsCard>

        {/* Backup */}
        <SettingsCard icon={DatabaseBackup} title="Backup" tone="amber">
          <ToggleRow
            label="Automatic backups"
            checked={settings.backup.autoBackup}
            disabled={!canManage}
            onChange={(v) => update('backup', { ...settings.backup, autoBackup: v })}
          />
          <SelectRow
            label="Frequency"
            value={settings.backup.frequency}
            options={[{ v: 'daily', l: 'Daily' }, { v: 'weekly', l: 'Weekly' }, { v: 'monthly', l: 'Monthly' }]}
            disabled={!canManage}
            onChange={(v) => update('backup', { ...settings.backup, frequency: v as AdminSettings['backup']['frequency'] })}
          />
          <div className="text-sm text-slate-500 pt-1">
            Last backup: <span className="font-medium text-slate-700">{formatDate(settings.backup.lastBackupAt)}</span>
          </div>
          {canManage && (
            <button
              onClick={handleBackup}
              disabled={backingUp}
              className="mt-2 inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-60"
            >
              {backingUp ? <Loader2 size={15} className="animate-spin" /> : <DatabaseBackup size={15} />}
              Backup now
            </button>
          )}
        </SettingsCard>

        {/* Security */}
        <SettingsCard icon={ShieldCheck} title="Security" tone="slate">
          <NumberRow
            label="Session timeout (minutes)"
            value={settings.security.sessionTimeoutMin}
            disabled={!canManage}
            onChange={(v) => update('security', { ...settings.security, sessionTimeoutMin: v })}
          />
          <ToggleRow
            label="Enforce two-factor authentication"
            checked={settings.security.enforce2fa}
            disabled={!canManage}
            onChange={(v) => update('security', { ...settings.security, enforce2fa: v })}
          />
        </SettingsCard>
      </div>
    </Page>
  );
}

const TONES: Record<string, string> = {
  purple: 'bg-purple-50 text-purple-600',
  rose: 'bg-rose-50 text-rose-600',
  blue: 'bg-blue-50 text-blue-600',
  emerald: 'bg-emerald-50 text-emerald-600',
  indigo: 'bg-indigo-50 text-indigo-600',
  sky: 'bg-sky-50 text-sky-600',
  teal: 'bg-teal-50 text-teal-600',
  amber: 'bg-amber-50 text-amber-600',
  slate: 'bg-slate-100 text-slate-600',
};

function SettingsCard({
  icon: Icon,
  title,
  tone,
  badge,
  children,
}: {
  icon: typeof Save;
  title: string;
  tone: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${TONES[tone]}`}>
            <Icon size={17} />
          </div>
          <h3 className="font-semibold text-slate-800">{title}</h3>
        </div>
        {badge}
      </div>
      <div className="space-y-3">{children}</div>
    </Card>
  );
}

function ConfiguredBadge({ ok }: { ok: boolean }) {
  return ok ? (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-md">
      <CheckCircle2 size={13} /> Configured
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md">
      <XCircle size={13} /> Not configured
    </span>
  );
}

function SelectRow({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  options: { v: string; l: string }[];
  disabled?: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-slate-700 mb-1.5">{label}</span>
      <select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} className={`${inputClass} disabled:bg-slate-50 disabled:text-slate-400`}>
        {options.map((o) => (
          <option key={o.v} value={o.v}>
            {o.l}
          </option>
        ))}
      </select>
    </label>
  );
}

function TextRow({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  disabled?: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-slate-700 mb-1.5">{label}</span>
      <input value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} className={`${inputClass} disabled:bg-slate-50 disabled:text-slate-400`} />
    </label>
  );
}

function NumberRow({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  disabled?: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-slate-700 mb-1.5">{label}</span>
      <input
        type="number"
        min={1}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className={`${inputClass} disabled:bg-slate-50 disabled:text-slate-400`}
      />
    </label>
  );
}

function ToggleRow({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 disabled:opacity-50 ${checked ? 'bg-blue-600' : 'bg-slate-300'}`}
      >
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : ''}`} />
      </button>
    </div>
  );
}
