import React from 'react';
import { useState } from 'react';
import { motion } from 'motion/react';
import { Lock, Mail, ShieldCheck, Loader2 } from 'lucide-react';
import Logo from '../Logo';
import { useAuth } from '../../context/Auth';
import { inputClass } from './ui';

export default function LoginView() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-slate-50 p-4">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <div className="flex justify-center mb-6">
          <Logo />
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-6 sm:p-8">
            <div className="flex items-center gap-2 mb-1">
              <ShieldCheck size={20} className="text-blue-600" />
              <h1 className="text-xl font-bold text-slate-900">Admin Sign In</h1>
            </div>
            <p className="text-sm text-slate-500 mb-6">
              Access the MediScribe administration console.
            </p>

            {error && (
              <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-100 text-red-700 text-sm font-medium">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input
                    type="email"
                    required
                    autoFocus
                    autoComplete="username"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@novascribe.ai"
                    className={`${inputClass} pl-10`}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input
                    type="password"
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className={`${inputClass} pl-10`}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={busy}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-4 py-2.5 rounded-xl font-semibold shadow-sm hover:shadow-md transition-all flex items-center justify-center gap-2"
              >
                {busy ? <Loader2 size={18} className="animate-spin" /> : <Lock size={16} />}
                {busy ? 'Signing in…' : 'Sign In'}
              </button>
            </form>
          </div>

          <div className="px-6 sm:px-8 py-4 bg-slate-50 border-t border-slate-100">
            <p className="text-xs text-slate-500">
              <span className="font-semibold text-slate-600">Demo admin:</span>{' '}
              admin@novascribe.ai / ChangeMe123!
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
