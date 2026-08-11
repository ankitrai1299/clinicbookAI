import React from 'react';
import { LogOut, Info, ShieldCheck, FileText, LifeBuoy, ChevronRight, Check } from 'lucide-react';
import { Avatar, Card } from './ui';
import { loadDoctorProfile, saveDoctorProfile, loadLanguage, saveLanguage, LANGUAGES, type DoctorProfile } from '../utils/settings';

// Settings, as its own tab.
//
// The doctor profile here is what PRINTS on a prescription — name, qualification,
// registration number, clinic. It is stored per device (the same store the web
// Settings page uses), so editing it in either place changes the same letterhead.

interface MobileSettingsProps {
  doctorName?: string;
  email?: string;
  roleLabel?: string;
  appVersion?: string;
  onLogout: () => void;
  /** Screens that don't earn a tab of their own. */
  onNavigate?: (view: string) => void;
  canViewAdmin?: boolean;
}

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="mb-4">
    <p className="text-[11.5px] font-bold uppercase tracking-[0.06em] text-slate-400 mb-2 px-1">{title}</p>
    {children}
  </div>
);

const Field = ({
  label,
  value,
  placeholder,
  onChange
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (v: string) => void;
}) => (
  <label className="block mb-3.5 last:mb-0">
    <span className="block text-[12.5px] font-medium text-slate-500 mb-1.5">{label}</span>
    <input
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-3.5 py-3 bg-white border border-[#E8ECF2] rounded-xl text-[14.5px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#5B5CEB]/15 focus:border-[#5B5CEB]"
    />
  </label>
);

export default function MobileSettings({
  doctorName,
  email,
  roleLabel,
  appVersion = '1.0.0',
  onLogout,
  onNavigate,
  canViewAdmin
}: MobileSettingsProps) {
  const [profile, setProfile] = React.useState<DoctorProfile>(() => {
    const p = loadDoctorProfile();
    return p.name ? p : { ...p, name: doctorName || '' };
  });
  const [language, setLanguage] = React.useState<string>(() => loadLanguage());
  const [saved, setSaved] = React.useState(false);

  const set = (k: keyof DoctorProfile, v: string) => {
    setProfile((prev) => ({ ...prev, [k]: v }));
    setSaved(false);
  };

  const save = () => {
    saveDoctorProfile(profile);
    setSaved(true);
    // Long enough to read, short enough not to linger as a stale "saved".
    setTimeout(() => setSaved(false), 2500);
  };

  const chooseLanguage = (l: string) => {
    setLanguage(l);
    saveLanguage(l);
  };

  const about = [
    { key: 'privacy', label: 'Privacy Policy', icon: ShieldCheck, tint: 'text-[#16A34A]', href: '/privacy.html' },
    { key: 'terms', label: 'Terms of Service', icon: FileText, tint: 'text-[#5B5CEB]', href: '/terms.html' },
    { key: 'support', label: 'Support', icon: LifeBuoy, tint: 'text-[#D97706]', href: 'mailto:apps@nextdot.co.in' }
  ];

  return (
    <div className="p-5 pb-8">
      <h1 className="text-[28px] font-bold tracking-tight text-slate-900 mb-4">Settings</h1>

      {/* Who is signed in — the question this screen answers first. */}
      <Card className="p-4 mb-4">
        <div className="flex items-center gap-3.5">
          <Avatar name={doctorName} size={52} />
          <div className="min-w-0">
            <div className="font-bold text-slate-900 text-[17px] truncate">{profile.name || doctorName || 'Doctor'}</div>
            <div className="text-[13px] text-slate-400 truncate">{profile.qualification || 'Qualification not set'}</div>
          </div>
        </div>
      </Card>

      <Section title="Account">
        <Card className="p-4">
          <div className="flex items-center gap-3.5">
            <Avatar name={doctorName} size={44} />
            <div className="flex-1 min-w-0">
              <div className="font-bold text-slate-900 text-[15px] truncate">{doctorName || 'Doctor'}</div>
              {email && <div className="text-[12.5px] text-slate-400 truncate">{email}</div>}
            </div>
            {roleLabel && (
              <span className="flex-shrink-0 text-[11.5px] font-semibold px-2.5 py-1 rounded-lg bg-[#EEEFFE] text-[#4A4BD4]">
                {roleLabel}
              </span>
            )}
          </div>
          <button
            onClick={onLogout}
            className="w-full mt-3.5 inline-flex items-center justify-center gap-2 py-3 rounded-xl bg-[#FEF2F2] text-[#DC2626] font-semibold text-[14px] active:bg-rose-100 transition-colors"
          >
            <LogOut size={17} /> Sign out
          </button>
        </Card>
      </Section>

      <Section title="Doctor profile">
        <Card className="p-4">
          <Field label="Doctor name" value={profile.name} placeholder="Dr. Full Name" onChange={(v) => set('name', v)} />
          <Field label="Qualification" value={profile.qualification} placeholder="MBBS, MD" onChange={(v) => set('qualification', v)} />
          <Field label="Registration number" value={profile.regNo} placeholder="Medical council reg. no." onChange={(v) => set('regNo', v)} />
          <Field label="Clinic name" value={profile.clinicName} placeholder="Clinic / hospital name" onChange={(v) => set('clinicName', v)} />
          <button
            onClick={save}
            className="w-full mt-1 inline-flex items-center justify-center gap-2 py-3 rounded-xl bg-[#5B5CEB] text-white font-semibold text-[14px] active:bg-[#4A4BD4] transition-colors"
          >
            {saved ? (
              <>
                <Check size={17} /> Saved
              </>
            ) : (
              'Save profile'
            )}
          </button>
          <p className="text-[11.5px] text-slate-400 mt-2.5 leading-snug">
            This is what prints on your prescriptions and reports.
          </p>
        </Card>
      </Section>

      <Section title="Preferences">
        <Card className="p-4">
          <div className="flex items-baseline justify-between mb-2">
            <span className="text-[13px] font-medium text-slate-500">Default transcription language</span>
            <span className="text-[12.5px] font-semibold text-[#5B5CEB]">{language}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {LANGUAGES.map((l) => (
              <button
                key={l}
                onClick={() => chooseLanguage(l)}
                className={`px-3.5 py-2 rounded-full text-[13px] font-medium transition-colors ${
                  language === l ? 'bg-[#5B5CEB] text-white' : 'bg-white text-slate-600 border border-[#E8ECF2]'
                }`}
              >
                {l}
              </button>
            ))}
          </div>
          <p className="text-[11.5px] text-slate-400 mt-3 leading-snug">
            Auto Detect works for most consultations; pick a language when the recording is hard to hear.
          </p>
        </Card>
      </Section>

      {(onNavigate || canViewAdmin) && (
        <Section title="More">
          <Card className="overflow-hidden">
            {[
              { key: 'prescriptions', label: 'Prescriptions' },
              { key: 'transcripts', label: 'Transcripts' },
              { key: 'reports', label: 'Clinical reports' },
              ...(canViewAdmin ? [{ key: 'admin', label: 'Admin console' }] : [])
            ].map((r, i) => (
              <button
                key={r.key}
                onClick={() => onNavigate?.(r.key)}
                className={`w-full flex items-center gap-3 p-4 text-left active:bg-slate-50 transition-colors ${
                  i ? 'border-t border-slate-100' : ''
                }`}
              >
                <span className="flex-1 font-semibold text-slate-900 text-[14.5px]">{r.label}</span>
                <ChevronRight size={18} className="text-slate-300" />
              </button>
            ))}
          </Card>
        </Section>
      )}

      <Section title="About">
        <Card className="overflow-hidden">
          <div className="flex items-center gap-3 p-4">
            <span className="w-8 h-8 rounded-lg bg-[#EEEFFE] text-[#5B5CEB] flex items-center justify-center flex-shrink-0">
              <Info size={17} />
            </span>
            <span className="flex-1 font-semibold text-slate-900 text-[14.5px]">App version</span>
            <span className="text-[13px] text-slate-400">{appVersion}</span>
          </div>
          {about.map(({ key, label, icon: Icon, tint, href }) => (
            <a
              key={key}
              href={href}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-3 p-4 border-t border-slate-100 active:bg-slate-50 transition-colors"
            >
              <span className={`w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0 ${tint}`}>
                <Icon size={17} />
              </span>
              <span className="flex-1 font-semibold text-slate-900 text-[14.5px]">{label}</span>
              <ChevronRight size={18} className="text-slate-300" />
            </a>
          ))}
        </Card>
      </Section>

      <p className="text-center text-[11.5px] text-slate-400 pb-2">MediScribe · v{appVersion}</p>
    </div>
  );
}
