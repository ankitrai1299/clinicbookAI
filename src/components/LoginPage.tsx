import React, { useState } from 'react';
import { AlertCircle, ArrowRight, CalendarCheck, Key, Mail } from 'lucide-react';

import { loginUser } from '../api/auth';
import { useAuth } from '../context/AuthContext';
import { PageType } from '../types';

interface LoginPageProps {
  setCurrentPage: (page: PageType) => void;
}

export default function LoginPage({ setCurrentPage }: LoginPageProps) {
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
      setCurrentPage('dashboard');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 bg-slate-50" id="login-page-root">
      <div className="w-full max-w-md bg-white rounded-3xl p-8 border border-slate-100 shadow-md">

        <div className="flex flex-col items-center gap-2 mb-8">
          <div className="w-12 h-12 rounded-2xl bg-sky-600 flex items-center justify-center text-white shadow-md shadow-sky-100">
            <CalendarCheck className="w-7 h-7" />
          </div>
          <h1 className="font-display text-2xl font-bold text-slate-900">Sign in to your clinic</h1>
          <p className="text-slate-400 text-sm text-center">Access your ClinicBook AI dashboard</p>
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
              placeholder="clinic@example.com"
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
