import React, { useState } from 'react';
import { Stethoscope, Loader2, AlertCircle } from 'lucide-react';

import { DoctorAuthResult, loginDoctor, registerDoctor } from '../../api/doctorPortal';

interface Props {
  onAuthed: (res: DoctorAuthResult) => void;
}

export default function DoctorAuthPage({ onAuthed }: Props) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [form, setForm] = useState({ name: '', speciality: '', email: '', phone: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res =
        mode === 'register'
          ? await registerDoctor(form)
          : await loginDoctor({ email: form.email, password: form.password });
      onAuthed(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#fafcff] flex items-center justify-center p-4 font-sans">
      <div className="w-full max-w-md bg-white border border-slate-100 rounded-3xl shadow-sm p-8">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-11 h-11 rounded-2xl bg-sky-600 flex items-center justify-center">
            <Stethoscope className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="font-display font-extrabold text-lg text-slate-950 leading-tight">Doctor Portal</h1>
            <p className="text-slate-400 text-xs">ClinicBook AI</p>
          </div>
        </div>

        <div className="flex gap-1 bg-slate-100 rounded-xl p-1 my-6">
          {(['login', 'register'] as const).map((m) => (
            <button
              key={m}
              onClick={() => { setMode(m); setError(null); }}
              className={`flex-1 py-2 rounded-lg text-xs font-bold capitalize transition-all ${mode === m ? 'bg-white text-sky-700 shadow-xs' : 'text-slate-500'}`}
            >
              {m === 'login' ? 'Log in' : 'Register'}
            </button>
          ))}
        </div>

        {error && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-3 py-2 text-xs mb-4">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> <span>{error}</span>
          </div>
        )}

        <form onSubmit={submit} className="space-y-3">
          {mode === 'register' && (
            <>
              <Field label="Full name" value={form.name} onChange={set('name')} placeholder="Dr. Jane Doe" required />
              <Field label="Speciality" value={form.speciality} onChange={set('speciality')} placeholder="Cardiologist" required />
              <Field label="Phone" value={form.phone} onChange={set('phone')} placeholder="919812345678" required />
            </>
          )}
          <Field label="Email" type="email" value={form.email} onChange={set('email')} placeholder="dr.jane@clinic.com" required />
          <Field label="Password" type="password" value={form.password} onChange={set('password')} placeholder="••••••••" required />

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2 mt-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {mode === 'register' ? 'Create doctor account' : 'Log in'}
          </button>
        </form>

        <p className="text-center text-[11px] text-slate-400 mt-5">
          Patients never log in — they book via WhatsApp. This portal is for doctors only.
        </p>
      </div>
    </div>
  );
}

function Field({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">{label}</span>
      <input
        {...props}
        className="w-full text-sm px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-hidden focus:border-sky-500"
      />
    </label>
  );
}
