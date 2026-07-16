import { useState } from 'react';
import { motion } from 'motion/react';
import { User, Stethoscope, Globe, LogOut, Check, Building2, BadgeCheck } from 'lucide-react';
import { loadDoctorProfile, saveDoctorProfile, loadLanguage, saveLanguage, LANGUAGES, type DoctorProfile } from '../utils/settings';

interface SettingsViewProps {
  // Falls back into the profile's name field when the doctor hasn't set one yet.
  doctorName?: string;
  onLogout: () => void;
}

// Doctor-facing settings: edit the letterhead profile that prints on reports,
// pick the default transcription language, and sign out. Persists per-device.
export default function SettingsView({ doctorName, onLogout }: SettingsViewProps) {
  const [profile, setProfile] = useState<DoctorProfile>(() => {
    const p = loadDoctorProfile();
    return p.name ? p : { ...p, name: doctorName || '' };
  });
  const [language, setLanguage] = useState<string>(() => loadLanguage());
  const [savedProfile, setSavedProfile] = useState(false);

  const set = (k: keyof DoctorProfile, v: string) => {
    setProfile((prev) => ({ ...prev, [k]: v }));
    setSavedProfile(false);
  };

  const saveProfile = () => {
    saveDoctorProfile(profile);
    setSavedProfile(true);
    setTimeout(() => setSavedProfile(false), 2500);
  };

  const changeLanguage = (v: string) => {
    setLanguage(v);
    saveLanguage(v);
  };

  const input =
    'w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all';
  const label = 'block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-6 sm:p-8 max-w-2xl mx-auto"
    >
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
        <p className="text-slate-500">Your profile, preferences and account.</p>
      </div>

      {/* Doctor profile */}
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 sm:p-6 mb-5">
        <div className="flex items-center gap-2 mb-4">
          <Stethoscope size={18} className="text-blue-600" />
          <h2 className="font-bold text-slate-900">Doctor Profile</h2>
          <span className="text-xs text-slate-400 ml-1">— prints on your reports &amp; prescriptions</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className={label}><User size={11} className="inline mr-1" />Full name</label>
            <input className={input} value={profile.name} onChange={(e) => set('name', e.target.value)} placeholder="Dr. Full Name" />
          </div>
          <div>
            <label className={label}><BadgeCheck size={11} className="inline mr-1" />Qualification</label>
            <input className={input} value={profile.qualification} onChange={(e) => set('qualification', e.target.value)} placeholder="MBBS, MD" />
          </div>
          <div>
            <label className={label}>Registration no.</label>
            <input className={input} value={profile.regNo} onChange={(e) => set('regNo', e.target.value)} placeholder="Medical council reg. no." />
          </div>
          <div className="sm:col-span-2">
            <label className={label}><Building2 size={11} className="inline mr-1" />Clinic / hospital name</label>
            <input className={input} value={profile.clinicName} onChange={(e) => set('clinicName', e.target.value)} placeholder="Clinic / hospital name" />
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={saveProfile}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold text-sm shadow-sm transition-colors"
          >
            Save profile
          </button>
          {savedProfile && (
            <span className="flex items-center gap-1.5 text-sm font-medium text-emerald-600">
              <Check size={16} /> Saved
            </span>
          )}
        </div>
      </section>

      {/* Preferences */}
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 sm:p-6 mb-5">
        <div className="flex items-center gap-2 mb-4">
          <Globe size={18} className="text-blue-600" />
          <h2 className="font-bold text-slate-900">Preferences</h2>
        </div>
        <label className={label}>Default transcription language</label>
        <select className={input} value={language} onChange={(e) => changeLanguage(e.target.value)}>
          {LANGUAGES.map((l) => (
            <option key={l} value={l}>{l}</option>
          ))}
        </select>
        <p className="text-xs text-slate-400 mt-2">New recordings use this language. You can still change it per session.</p>
      </section>

      {/* Account */}
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 sm:p-6">
        <div className="flex items-center gap-2 mb-4">
          <User size={18} className="text-blue-600" />
          <h2 className="font-bold text-slate-900">Account</h2>
        </div>
        <button
          onClick={onLogout}
          className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 font-semibold text-sm transition-colors"
        >
          <LogOut size={17} /> Log out
        </button>
      </section>
    </motion.div>
  );
}
