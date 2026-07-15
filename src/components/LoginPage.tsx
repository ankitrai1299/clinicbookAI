import React, { useState } from 'react';
import { AlertCircle, ArrowLeft, ArrowRight, Building2, CalendarCheck, Key, Mail, ShieldCheck, Stethoscope, Users } from 'lucide-react';

import { loginUser } from '../api/auth';
import { useAuth } from '../context/AuthContext';
import { PageType } from '../types';

interface LoginPageProps {
  setCurrentPage: (page: PageType) => void;
  // Login of an unverified account (backend 403 EMAIL_NOT_VERIFIED) → route to OTP.
  onNeedVerification: (email: string) => void;
  // Which product the user is signing in to (drives the branding). After a
  // successful login the host App routes to the intended product automatically.
  product?: 'clinicbook' | 'novascribe';
}

// The four MediScribe roles, shown as a choose-your-role step before the login form.
// Selecting one is the entry context; the account's REAL role still governs what the
// user can access after sign-in (the backend enforces it).
const ROLE_OPTIONS = [
  { key: 'doctor', mrole: 'doctor', label: 'Doctor', desc: 'Record consultations, reports & prescriptions', Icon: Stethoscope },
  { key: 'staff', mrole: 'receptionist', label: 'Staff', desc: 'Front desk — patients & doctor directory', Icon: Users },
  { key: 'clinic_admin', mrole: 'hospital_admin', label: 'Clinic Admin', desc: 'Manage the whole clinic', Icon: Building2 },
  { key: 'super_admin', mrole: 'superadmin', label: 'Super Admin', desc: 'Full platform access', Icon: ShieldCheck },
] as const;

export default function LoginPage({ setCurrentPage, onNeedVerification, product = 'clinicbook' }: LoginPageProps) {
  const isNova = product === 'novascribe';
  const { setAuth } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // MediScribe: pick a role first, then log in. (null = show the role picker.)
  const [selectedRole, setSelectedRole] = useState<(typeof ROLE_OPTIONS)[number] | null>(null);
  const showRolePicker = isNova && !selectedRole;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { user, accessToken } = await loginUser({ email, password });
      setAuth(accessToken, user);
      // Do NOT navigate here — the host App routes to the intended product
      // (dashboard or novascribe) once the user is set. Hardcoding 'dashboard'
      // would send MediScribe sign-ins to the wrong app.
    } catch (err: unknown) {
      // Unverified account → the backend re-sent an OTP; take them to verify.
      if (err instanceof Error && err.message === 'EMAIL_NOT_VERIFIED') {
        onNeedVerification(email);
        return;
      }
      setError(err instanceof Error ? err.message : 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 bg-slate-50" id="login-page-root">
      <div className="w-full max-w-md bg-white rounded-3xl p-8 border border-slate-100 shadow-md">

        <button
          onClick={() => {
            // On the login form (after picking a role) → go back to the role picker.
            if (isNova && selectedRole) { setSelectedRole(null); setError(null); return; }
            setCurrentPage(isNova ? 'novascribe-landing' : 'landing');
          }}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-4 cursor-pointer"
          id="login-back-btn"
        >
          <ArrowLeft className="w-4 h-4" /> {isNova && selectedRole ? 'Choose a different role' : 'Back'}
        </button>

        <div className="flex flex-col items-center gap-2 mb-8">
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-md shadow-sky-100 ${
            isNova ? 'bg-gradient-to-br from-sky-500 to-sky-700' : 'bg-sky-600'
          }`}>
            {isNova ? <Stethoscope className="w-7 h-7" /> : <CalendarCheck className="w-7 h-7" />}
          </div>
          <h1 className="font-display text-2xl font-bold text-slate-900">
            {showRolePicker ? 'Sign in to MediScribe' : isNova ? `Sign in as ${selectedRole!.label}` : 'Sign in to your clinic'}
          </h1>
          <p className="text-slate-400 text-sm text-center">
            {showRolePicker
              ? 'Choose your role to continue'
              : isNova
                ? 'Access your MediScribe AI medical scribe'
                : 'Access your ClinicBook AI dashboard'}
          </p>
        </div>

        {/* Role picker (MediScribe) — shown before the login form. */}
        {showRolePicker && (
          <div className="space-y-2.5">
            {ROLE_OPTIONS.map((r) => (
              <button
                key={r.key}
                onClick={() => {
                  setSelectedRole(r);
                  setError(null);
                  // Drives which MediScribe panel opens after sign-in.
                  localStorage.setItem('mediscribe_role', r.mrole);
                }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-slate-200 hover:border-sky-500 hover:bg-sky-50/40 text-left transition-colors cursor-pointer"
              >
                <div className="w-10 h-10 rounded-xl bg-sky-100 text-sky-700 flex items-center justify-center shrink-0">
                  <r.Icon className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-bold text-slate-900">{r.label}</div>
                  <div className="text-xs text-slate-500 truncate">{r.desc}</div>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-300 ml-auto shrink-0" />
              </button>
            ))}
            <p className="text-[11px] text-slate-400 text-center pt-2">
              Pick the role your account is registered as — access is set by your account.
            </p>
          </div>
        )}

        {!showRolePicker && error && (
          <div className="mb-4 flex items-center gap-2 px-4 py-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {!showRolePicker && (
        <>
        <form onSubmit={handleSubmit} className="space-y-4" id="login-form">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
              <Mail className="w-3.5 h-3.5 text-slate-400" />
              Email Address
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={isNova ? 'doctor@example.com' : 'clinic@example.com'}
              className="w-full text-xs px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-sky-500 transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
              <Key className="w-3.5 h-3.5 text-slate-400" />
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full text-xs px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-sky-500 transition-colors"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-sky-600 hover:bg-sky-700 disabled:bg-sky-400 text-white font-bold rounded-xl text-sm shadow-lg shadow-sky-100 transition-all flex items-center justify-center gap-2 cursor-pointer mt-2"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Signing in...</span>
              </>
            ) : (
              <>
                <span>Sign In</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        <div className="mt-6 text-center text-xs text-slate-400">
          Don't have an account?{' '}
          <button
            onClick={() => setCurrentPage('signup')}
            className="text-sky-600 font-semibold hover:underline cursor-pointer"
          >
            Create clinic account
          </button>
        </div>
        </>
        )}
      </div>
    </div>
  );
}
