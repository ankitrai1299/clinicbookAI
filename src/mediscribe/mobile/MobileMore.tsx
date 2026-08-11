import React from 'react';
import { User, Pill, FileBarChart2, MessageSquareText, Shield, LogOut, ChevronRight, Stethoscope } from 'lucide-react';
import { initials, bareName } from './ui';

// The "More" tab: who is signed in, and the screens that don't earn a tab.
//
// Every row goes somewhere that exists. The design this follows listed Templates,
// Integrations and Help & Support; those aren't built, and a row that opens
// nothing is worse than no row.

interface MobileMoreProps {
  doctorName?: string;
  email?: string;
  roleLabel?: string;
  speciality?: string;
  canViewAdmin?: boolean;
  onNavigate: (view: string) => void;
  onLogout: () => void;
}

export default function MobileMore({
  doctorName,
  email,
  roleLabel,
  speciality,
  canViewAdmin,
  onNavigate,
  onLogout,
}: MobileMoreProps) {
  const rows = [
    { key: 'settings', label: 'Profile & Letterhead', hint: 'Name, qualifications, clinic', icon: User },
    { key: 'prescriptions', label: 'Prescriptions', hint: 'Medicines you have prescribed', icon: Pill },
    { key: 'transcripts', label: 'Transcripts', hint: 'What was said in each session', icon: MessageSquareText },
    { key: 'reports', label: 'Clinical Reports', hint: 'Structured AI reports', icon: FileBarChart2 },
    ...(canViewAdmin
      ? [{ key: 'admin', label: 'Admin Console', hint: 'Clinic-wide analytics', icon: Shield }]
      : []),
  ];

  return (
    <div className="px-5 pt-4">
      {/* Who is signed in — the question this screen answers first. */}
      <button
        onClick={() => onNavigate('settings')}
        className="w-full text-left rounded-2xl p-5 mb-5 bg-gradient-to-br from-[#5B5CEB] to-[#4A4BD4] shadow-lg shadow-[#5B5CEB]/25 active:scale-[0.99] transition-transform"
      >
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-white/20 border border-white/30 text-white flex items-center justify-center font-bold text-[17px] flex-shrink-0">
            {initials(doctorName)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-white font-bold text-[18px] truncate">Dr. {bareName(doctorName) || 'Doctor'}</div>
            {speciality && (
              <div className="text-white/85 text-[13px] truncate flex items-center gap-1.5 mt-0.5">
                <Stethoscope size={13} /> {speciality}
              </div>
            )}
            {email && <div className="text-white/70 text-[12px] truncate mt-0.5">{email}</div>}
          </div>
          <ChevronRight size={20} className="text-white/70 flex-shrink-0" />
        </div>
        {roleLabel && (
          <span className="inline-block mt-4 text-[11px] font-semibold text-white bg-white/20 border border-white/25 px-2.5 py-1 rounded-full">
            {roleLabel}
          </span>
        )}
      </button>

      <div className="bg-white rounded-2xl border border-[#E8ECF2] shadow-sm overflow-hidden mb-5">
        {rows.map((r, i) => {
          const Icon = r.icon;
          return (
            <button
              key={r.key}
              onClick={() => onNavigate(r.key)}
              className={`w-full flex items-center gap-3.5 p-4 text-left active:bg-slate-50 transition-colors ${
                i ? 'border-t border-slate-100' : ''
              }`}
            >
              <span className="w-9 h-9 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center flex-shrink-0">
                <Icon size={18} />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block font-semibold text-slate-900 text-[14.5px] truncate">{r.label}</span>
                <span className="block text-[12px] text-slate-400 truncate">{r.hint}</span>
              </span>
              <ChevronRight size={18} className="text-slate-300 flex-shrink-0" />
            </button>
          );
        })}
      </div>

      <button
        onClick={onLogout}
        className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-white border border-[#E8ECF2] text-rose-600 font-bold shadow-sm active:bg-rose-50 transition-colors"
      >
        <LogOut size={17} /> Log out
      </button>

      <p className="text-center text-[11.5px] text-slate-400 mt-5">MediScribe AI</p>
    </div>
  );
}
