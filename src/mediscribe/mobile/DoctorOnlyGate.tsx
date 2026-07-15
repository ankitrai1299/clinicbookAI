import { Stethoscope, Monitor, LogOut } from 'lucide-react';

// The phone app is for DOCTORS only — each doctor records their own consultations
// and sees only their own patients/data. A non-doctor account (Admin / Staff /
// Super Admin) that signs in here is shown this screen and asked to use the web
// dashboard instead. Web is unaffected (this only renders inside the WebView).
interface DoctorOnlyGateProps {
  email?: string;
  onSignOut: () => void;
}

export default function DoctorOnlyGate({ email, onSignOut }: DoctorOnlyGateProps) {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center px-8 text-center">
      <div className="w-20 h-20 rounded-2xl bg-blue-600 text-white flex items-center justify-center mb-6 shadow-lg shadow-blue-600/25">
        <Stethoscope size={38} />
      </div>
      <h1 className="text-2xl font-bold text-slate-900 mb-2">Doctors only</h1>
      <p className="text-slate-500 leading-relaxed max-w-sm">
        The MediScribe mobile app is for <span className="font-semibold text-slate-700">doctor accounts</span>.
        Please sign in with a doctor login to record consultations and see your patients.
      </p>

      {email && (
        <p className="text-xs text-slate-400 mt-4">
          Signed in as <span className="font-medium text-slate-500">{email}</span>
        </p>
      )}

      <div className="mt-8 flex items-center gap-2 text-sm text-slate-500 bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm">
        <Monitor size={16} className="text-blue-500" />
        Admins &amp; staff: please use the web dashboard.
      </div>

      <button
        onClick={onSignOut}
        className="mt-8 inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow-sm transition-colors"
      >
        <LogOut size={18} /> Sign out &amp; switch account
      </button>
    </div>
  );
}
