import React from 'react';
import { LogOut, Info, ShieldCheck, FileText, LifeBuoy, ChevronRight, Check, Sun, Moon } from 'lucide-react';
import { usePrefs, type Lang, type Appearance } from './prefs';
import { Avatar, Card } from './ui';
import { loadDoctorProfile, saveDoctorProfile, loadLanguage, saveLanguage, LANGUAGES, type DoctorProfile } from '../utils/settings';
import { BRAND } from '../../brand';

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
  const { t, lang, setLang, appearance, setAppearance } = usePrefs();
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
    { key: 'privacy', label: t('settings.privacyPolicy'), icon: ShieldCheck, tint: 'text-[#16A34A]', href: '/privacy.html' },
    { key: 'terms', label: t('settings.termsOfService'), icon: FileText, tint: 'text-[#5B5CEB]', href: '/terms.html' },
    { key: 'support', label: t('settings.support'), icon: LifeBuoy, tint: 'text-[#D97706]', href: 'mailto:apps@nextdot.co.in' }
  ];

  return (
    <div className="p-5 pb-8">
      <h1 className="text-[28px] font-bold tracking-tight text-slate-900 mb-4">{t('settings.title')}</h1>

      {/* Who is signed in — the question this screen answers first. */}
      <Card className="p-4 mb-4">
        <div className="flex items-center gap-3.5">
          <Avatar name={doctorName} size={52} />
          <div className="min-w-0">
            <div className="font-bold text-slate-900 text-[17px] truncate">{profile.name || doctorName || 'Doctor'}</div>
            <div className="text-[13px] text-slate-400 truncate">{profile.qualification || t('settings.qualificationNotSet')}</div>
          </div>
        </div>
      </Card>

      <Section title={t('settings.account')}>
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
            <LogOut size={17} /> {t('settings.signOut')}
          </button>
        </Card>
      </Section>

      <Section title={t('settings.doctorProfile')}>
        <Card className="p-4">
          <Field label={t('settings.doctorName')} value={profile.name} placeholder="Dr. Full Name" onChange={(v) => set('name', v)} />
          <Field label={t('settings.qualification')} value={profile.qualification} placeholder="MBBS, MD" onChange={(v) => set('qualification', v)} />
          <Field label={t('settings.registrationNumber')} value={profile.regNo} placeholder="Medical council reg. no." onChange={(v) => set('regNo', v)} />
          <Field label={t('settings.clinicName')} value={profile.clinicName} placeholder="Clinic / hospital name" onChange={(v) => set('clinicName', v)} />
          <button
            onClick={save}
            className="w-full mt-1 inline-flex items-center justify-center gap-2 py-3 rounded-xl bg-[#5B5CEB] text-white font-semibold text-[14px] active:bg-[#4A4BD4] transition-colors"
          >
            {saved ? (
              <>
                <Check size={17} /> {t('settings.saved')}
              </>
            ) : (
              t('settings.saveProfile')
            )}
          </button>
          <p className="text-[11.5px] text-slate-400 mt-2.5 leading-snug">
            {t('settings.printsOn')}
          </p>
        </Card>
      </Section>

      <Section title={t('settings.preferences')}>
        <Card className="p-4">
          {/* App interface language. Separate from the transcription language
              below: a doctor may read the app in Hindi and still dictate in
              English, or the other way round. */}
          <div className="flex items-baseline justify-between mb-2">
            <span className="text-[13px] font-medium text-slate-500">{t('settings.appLanguage')}</span>
            <span className="text-[12px] text-slate-400">{t('settings.appLanguageHint')}</span>
          </div>
          <div className="grid grid-cols-2 gap-2.5 mb-5">
            {([
              { key: 'en' as Lang, label: 'English' },
              { key: 'hi' as Lang, label: 'हिन्दी' }
            ]).map((o) => (
              <button
                key={o.key}
                onClick={() => setLang(o.key)}
                className={`flex items-center gap-2.5 px-3.5 py-3 rounded-xl border transition-colors ${
                  lang === o.key ? 'border-[#5B5CEB] bg-[#EEEFFE]' : 'border-[#E8ECF2] bg-white'
                }`}
              >
                <span
                  className={`w-[18px] h-[18px] rounded-full border-2 flex items-center justify-center ${
                    lang === o.key ? 'border-[#5B5CEB]' : 'border-slate-300'
                  }`}
                >
                  {lang === o.key && <span className="w-2 h-2 rounded-full bg-[#5B5CEB]" />}
                </span>
                <span className={`text-[14.5px] font-medium ${lang === o.key ? 'text-[#4A4BD4]' : 'text-slate-600'}`}>
                  {o.label}
                </span>
              </button>
            ))}
          </div>

          <div className="flex items-baseline justify-between mb-2">
            <span className="text-[13px] font-medium text-slate-500">
              {t('settings.defaultTranscriptionLanguage')}
            </span>
            <span className="text-[12.5px] font-semibold text-[#5B5CEB]">{language}</span>
          </div>
          <div className="flex flex-wrap gap-2 mb-5">
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

          <div className="text-[13px] font-medium text-slate-500 mb-2">{t('settings.appearance')}</div>
          <div className="grid grid-cols-2 gap-2.5">
            {([
              { key: 'light' as Appearance, label: t('settings.light'), Icon: Sun },
              { key: 'dark' as Appearance, label: t('settings.dark'), Icon: Moon }
            ]).map(({ key, label, Icon }) => (
              <button
                key={key}
                onClick={() => setAppearance(key)}
                className={`flex flex-col items-center gap-1.5 py-3.5 rounded-xl border transition-colors ${
                  appearance === key ? 'border-[#5B5CEB] bg-[#EEEFFE]' : 'border-[#E8ECF2] bg-white'
                }`}
              >
                <Icon size={19} className={appearance === key ? 'text-[#5B5CEB]' : 'text-slate-400'} />
                <span className={`text-[13.5px] font-medium ${appearance === key ? 'text-[#4A4BD4]' : 'text-slate-500'}`}>
                  {label}
                </span>
              </button>
            ))}
          </div>
        </Card>
      </Section>

      {(onNavigate || canViewAdmin) && (
        <Section title={t('settings.more')}>
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

      <Section title={t('settings.about')}>
        <Card className="overflow-hidden">
          <div className="flex items-center gap-3 p-4">
            <span className="w-8 h-8 rounded-lg bg-[#EEEFFE] text-[#5B5CEB] flex items-center justify-center flex-shrink-0">
              <Info size={17} />
            </span>
            <span className="flex-1 font-semibold text-slate-900 text-[14.5px]">{t('settings.appVersion')}</span>
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

      <p className="text-center text-[11.5px] text-slate-400 pb-2">{BRAND.scribe} · v{appVersion}</p>
    </div>
  );
}
