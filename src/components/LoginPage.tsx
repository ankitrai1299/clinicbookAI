import React, { useState } from 'react';
import { AlertCircle, ArrowLeft, ArrowRight, CalendarCheck, Key, Mail, Stethoscope } from 'lucide-react';

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

export default function LoginPage({ setCurrentPage, onNeedVerification, product = 'clinicbook' }: LoginPageProps) {
  const isNova = product === 'novascribe';
  const { setAuth } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { user, accessToken } = await loginUser({ email, password });
      setAuth(accessToken, user);
      // Do NOT navigate here — the host App routes to the intended product
      // (dashboard or novascribe) once the user is set. Hardcoding 'dashboard'
      // would send NovaScribe sign-ins to the wrong app.
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
          onClick={() => setCurrentPage(isNova ? 'novascribe-landing' : 'landing')}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-4 cursor-pointer"
          id="login-back-btn"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>

        <div className="flex flex-col items-center gap-2 mb-8">
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-md shadow-sky-100 ${
            isNova ? 'bg-gradient-to-br from-sky-500 to-sky-700' : 'bg-sky-600'
          }`}>
            {isNova ? <Stethoscope className="w-7 h-7" /> : <CalendarCheck className="w-7 h-7" />}
          </div>
          <h1 className="font-display text-2xl font-bold text-slate-900">
            {isNova ? 'Sign in to NovaScribe' : 'Sign in to your clinic'}
          </h1>
          <p className="text-slate-400 text-sm text-center">
            {isNova ? 'Access your NovaScribe AI medical scribe' : 'Access your ClinicBook AI dashboard'}
          </p>
        </div>

        {error && (
          <div className="mb-4 flex items-center gap-2 px-4 py-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

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
      </div>
    </div>
  );
}
