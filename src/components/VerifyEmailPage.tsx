import React, { useEffect, useRef, useState } from 'react';
import { Mail, ArrowRight, AlertCircle, CheckCircle } from 'lucide-react';

import { resendOtp, verifyOtp, type AuthUser } from '../api/auth';

interface Props {
  email: string;
  onVerified: (token: string, user: AuthUser) => void;
  onBack: () => void;
}

const RESEND_SECONDS = 60;

export default function VerifyEmailPage({ email, onVerified, onBack }: Props) {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(RESEND_SECONDS);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    timer.current = setInterval(() => setCooldown((c) => (c > 0 ? c - 1 : 0)), 1000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length !== 6) return;
    setLoading(true);
    setError(null);
    try {
      const { user, accessToken } = await verifyOtp({ email, code });
      onVerified(accessToken, user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed. Please try again.');
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0) return;
    setError(null);
    setInfo(null);
    try {
      await resendOtp({ email });
      setInfo('A new code has been sent to your email.');
      setCooldown(RESEND_SECONDS);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not resend the code.');
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-16" id="verify-email-page">
      <div className="bg-white rounded-3xl p-8 border border-slate-100 shadow-md text-center">
        <div className="w-14 h-14 bg-sky-100 text-sky-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Mail className="w-7 h-7" />
        </div>
        <h1 className="font-display text-2xl font-bold text-slate-900">Verify your email</h1>
        <p className="text-slate-500 text-sm mt-2">
          We sent a 6-digit code to <span className="font-semibold text-slate-700">{email}</span>. Enter it below to
          activate your account.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {error && (
            <div className="flex items-center gap-2 px-3 py-2 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-xs text-left">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          {info && (
            <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-700 text-xs text-left">
              <CheckCircle className="w-4 h-4 shrink-0" />
              <span>{info}</span>
            </div>
          )}

          <input
            inputMode="numeric"
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="••••••"
            className="w-full text-center tracking-[0.6em] text-2xl font-bold px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:border-sky-500"
          />

          <button
            type="submit"
            disabled={loading || code.length !== 6}
            className="w-full py-3.5 bg-sky-600 hover:bg-sky-700 disabled:bg-sky-300 text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2 cursor-pointer"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                Verify & Continue <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        <div className="mt-5 text-xs text-slate-400 space-y-2">
          <button
            type="button"
            onClick={handleResend}
            disabled={cooldown > 0}
            className="text-sky-600 font-semibold hover:underline disabled:text-slate-300 disabled:no-underline cursor-pointer"
          >
            {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
          </button>
          <div>
            <button type="button" onClick={onBack} className="text-slate-400 hover:text-slate-600 cursor-pointer">
              Use a different email
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
