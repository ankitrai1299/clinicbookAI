import React, { useState } from 'react';
import { AlertCircle, ArrowLeft, ArrowRight, CalendarCheck, Key, Mail, Stethoscope, Eye, EyeOff } from 'lucide-react';

import { isMfaChallenge, loginUser, verifyMfaCode } from '../api/auth';
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
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Second factor. Non-null once the password has been accepted and a code is
  // owed — the password is NOT kept, so this token is the only thing carrying
  // the half-finished sign-in forward.
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState('');

  const handleMfaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mfaToken) return;
    setError(null);
    setLoading(true);
    try {
      const { user, accessToken } = await verifyMfaCode(mfaToken, mfaCode);
      setAuth(accessToken, user);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'That code is not valid.');
      // The challenge is only good for five minutes; if it has expired the
      // message says so and the user needs the password screen again.
      setMfaCode('');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      // Tell the server which door this is. `product` is 'novascribe' here for
      // historic routing reasons — the deep links on doctors' phones still use
      // that word — but the surface the SERVER knows is called 'mediscribe'.
      const result = await loginUser({
        email,
        password,
        product: isNova ? 'mediscribe' : 'clinicbook',
      });

      // Password accepted, second factor owed. Hold the short-lived challenge
      // token and ask for the code — nothing is stored as a session yet.
      if (isMfaChallenge(result)) {
        setMfaToken(result.mfaToken);
        setLoading(false);
        return;
      }

      const { user, accessToken } = result;
      setAuth(accessToken, user);
      // Do NOT navigate here — the host App routes to the intended product
      // (dashboard or novascribe) once the user is set. USER-BASED access: the
      // account's role (resolved on the backend) decides which panel opens.
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
            {isNova ? 'Sign in to MediScribe' : 'Sign in to your clinic'}
          </h1>
          <p className="text-slate-400 text-sm text-center">
            {isNova ? 'Access your MediScribe AI medical scribe' : 'Access your ClinicBook AI dashboard'}
          </p>
        </div>

        {error && (
          <div className="mb-4 flex items-center gap-2 px-4 py-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Second factor. Replaces the password form rather than appearing
            beside it — the password is already accepted and re-entering it
            would suggest otherwise. */}
        {mfaToken ? (
          <form onSubmit={handleMfaSubmit} className="space-y-4" id="login-mfa-form">
            <p className="text-sm text-slate-600 text-center">
              Open your authenticator app and enter the 6-digit code for this account.
            </p>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              maxLength={6}
              required
              value={mfaCode}
              onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ''))}
              placeholder="000000"
              className="w-full text-center tracking-[0.5em] text-lg font-mono px-3.5 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-sky-500 transition-colors"
              aria-label="Authentication code"
            />
            <button
              type="submit"
              disabled={loading || mfaCode.length !== 6}
              className="w-full py-3 bg-sky-600 hover:bg-sky-700 disabled:bg-sky-400 text-white font-bold rounded-xl text-sm shadow-lg shadow-sky-100 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              {loading ? 'Checking…' : 'Verify and sign in'}
            </button>
            <button
              type="button"
              onClick={() => {
                setMfaToken(null);
                setMfaCode('');
                setError(null);
              }}
              className="w-full text-xs text-slate-500 hover:text-slate-800 cursor-pointer"
            >
              Use a different account
            </button>
          </form>
        ) : (
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
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full text-xs px-3.5 py-2.5 pr-10 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-sky-500 transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
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
        )}

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
