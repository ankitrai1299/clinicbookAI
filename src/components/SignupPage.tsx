import React, { useState } from 'react';
import {
  Shield, CheckCircle, Smartphone, Clock, Sparkles,
  ArrowRight, Key, Mail, Building, User, Phone, Globe, Activity, AlertCircle
} from 'lucide-react';

import { registerClinic } from '../api/auth';
import { createDoctor } from '../api/doctors';
import { useAuth } from '../context/AuthContext';
import { PageType, ClinicConfig } from '../types';

interface SignupPageProps {
  onSignupSuccess: (customConfig: Partial<ClinicConfig>) => void;
  setCurrentPage: (page: PageType) => void;
}

const DEMO_DOCTORS = [
  { name: 'Dr. Sarah Jenkins', speciality: 'Dermatologist' },
  { name: 'Dr. Amit Patel', speciality: 'General Physician' },
  { name: 'Dr. Clara Oswald', speciality: 'Pediatrician' },
  { name: 'Dr. Marcus Vance', speciality: 'Orthopedic' },
];

export default function SignupPage({ onSignupSuccess, setCurrentPage }: SignupPageProps) {
  const { setAuth } = useAuth();
  const [clinicName, setClinicName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [country, setCountry] = useState('India');
  const [clinicType, setClinicType] = useState('Dental Clinic');
  const [prefLanguage, setPrefLanguage] = useState('English');
  const [password, setPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [registered, setRegistered] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clinicName || !ownerName || !email || !phone || !password) return;

    setLoading(true);
    setError(null);
    try {
      const { user, accessToken } = await registerClinic({
        clinicName,
        ownerName,
        email,
        phone,
        password,
      });

      setAuth(accessToken, user);

      // Seed demo doctors for the new clinic (ignore individual failures)
      await Promise.allSettled(DEMO_DOCTORS.map((d) => createDoctor(d)));

      setRegistered(true);

      const customConfig: Partial<ClinicConfig> = {
        name: clinicName,
        ownerName,
        email,
        phone,
        country,
        clinicType,
        preferredLanguage: prefLanguage,
        whatsappNumber: phone,
      };

      setTimeout(() => {
        onSignupSuccess(customConfig);
        setCurrentPage('dashboard');
      }, 1200);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Registration failed. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12" id="signup-page-root">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">

        {/* Registration Form */}
        <div className="lg:col-span-7 bg-white rounded-3xl p-8 border border-slate-100 shadow-md">
          <div className="space-y-2 text-left mb-6">
            <h1 className="font-display text-3xl font-bold tracking-tight text-slate-900">
              Create your Clinic Account
            </h1>
            <p className="text-slate-500 text-xs">
              Start your 14-day free trial. Setup takes less than 3 minutes, no credit card required.
            </p>
          </div>

          {registered ? (
            <div className="py-12 text-center space-y-4 animate-fadeIn" id="signup-success-state">
              <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-md">
                <CheckCircle className="w-10 h-10" />
              </div>
              <h3 className="font-display font-extrabold text-2xl text-slate-900">Configuring Clinic Webhooks...</h3>
              <p className="text-slate-500 text-sm max-w-md mx-auto">
                Setting up virtual WhatsApp number, registering metadata workspace and securing database parameters. Redirecting to your clinic control desk...
              </p>
              <div className="w-12 h-12 border-4 border-sky-600 border-t-transparent rounded-full animate-spin mx-auto mt-6" />
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4 text-left" id="clinic-signup-form">

              {error && (
                <div className="flex items-center gap-2 px-4 py-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-sm">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
                    <Building className="w-3.5 h-3.5 text-slate-400" />
                    Clinic Name
                  </label>
                  <input
                    type="text"
                    required
                    value={clinicName}
                    onChange={(e) => setClinicName(e.target.value)}
                    placeholder="e.g. Apex Dental Center"
                    className="w-full text-xs px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:border-sky-500 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
                    <User className="w-3.5 h-3.5 text-slate-400" />
                    Doctor / Owner Name
                  </label>
                  <input
                    type="text"
                    required
                    value={ownerName}
                    onChange={(e) => setOwnerName(e.target.value)}
                    placeholder="e.g. Dr. Jane Stevens"
                    className="w-full text-xs px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:border-sky-500 transition-colors"
                  />
                </div>

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
                    placeholder="e.g. contact@apexdental.com"
                    className="w-full text-xs px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:border-sky-500 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
                    <Phone className="w-3.5 h-3.5 text-slate-400" />
                    WhatsApp Phone Number
                  </label>
                  <input
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="e.g. +91 99999 88888"
                    className="w-full text-xs px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:border-sky-500 transition-colors"
                  />
                  <span className="text-[10px] text-slate-400 mt-1 block">Includes automatic country code dialing</span>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
                    <Globe className="w-3.5 h-3.5 text-slate-400" />
                    Country
                  </label>
                  <select
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    className="w-full text-xs px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:border-sky-500 transition-colors"
                  >
                    <option value="India">India (INR Billing)</option>
                    <option value="United States">United States (USD Billing)</option>
                    <option value="United Kingdom">United Kingdom</option>
                    <option value="Singapore">Singapore</option>
                    <option value="Mexico">Mexico</option>
                    <option value="Spain">Spain</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
                    <Activity className="w-3.5 h-3.5 text-slate-400" />
                    Clinic Type
                  </label>
                  <select
                    value={clinicType}
                    onChange={(e) => setClinicType(e.target.value)}
                    className="w-full text-xs px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:border-sky-500 transition-colors"
                  >
                    <option value="Dental Clinic">Dentistry / Dental Clinic</option>
                    <option value="Dermatology Care">Dermatology & Skin Clinic</option>
                    <option value="Pediatrics Center">Pediatric & Child Health</option>
                    <option value="Orthopedic Center">Orthopedics & Joint Clinic</option>
                    <option value="General Physician">General Practice / Family OPD</option>
                    <option value="Multi-Specialty Care">Multi-Specialty Clinic Group</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
                    <Globe className="w-3.5 h-3.5 text-slate-400" />
                    Preferred Language
                  </label>
                  <select
                    value={prefLanguage}
                    onChange={(e) => setPrefLanguage(e.target.value)}
                    className="w-full text-xs px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:border-sky-500 transition-colors"
                  >
                    <option value="English">English</option>
                    <option value="Hindi">हिंदी (Hindi)</option>
                    <option value="Spanish">Español (Spanish)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
                    <Key className="w-3.5 h-3.5 text-slate-400" />
                    Account Password
                  </label>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full text-xs px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:border-sky-500 transition-colors"
                  />
                </div>

              </div>

              <div className="pt-2">
                <label className="flex items-start gap-2.5 text-[11px] text-slate-500 cursor-pointer">
                  <input type="checkbox" defaultChecked required className="mt-0.5 rounded-sm bg-slate-100 border-slate-300" />
                  <span>I agree to ClinicBook AI's 14-day terms. I authorize virtual sandbox numbers to generate messaging alerts for test patients.</span>
                </label>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-4.5 bg-sky-600 hover:bg-sky-700 disabled:bg-sky-400 text-white font-bold rounded-xl text-base shadow-lg shadow-sky-100 transition-all flex items-center justify-center gap-2 cursor-pointer mt-2"
              >
                {loading ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Deploying Booking Engine...</span>
                  </>
                ) : (
                  <>
                    <span>Create Clinic Account</span>
                    <ArrowRight className="w-5 h-5" />
                  </>
                )}
              </button>

              <p className="text-center text-xs text-slate-400 pt-1">
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => setCurrentPage('login')}
                  className="text-sky-600 font-semibold hover:underline cursor-pointer"
                >
                  Sign in
                </button>
              </p>
            </form>
          )}
        </div>

        {/* Benefits Panel */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-sky-900 rounded-3xl p-8 text-white relative overflow-hidden shadow-xl">
            <div className="absolute inset-0 bg-radial-at-t from-sky-800 to-sky-950 opacity-95 z-0" />

            <div className="relative z-10 space-y-8 text-left">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-sky-800/80 rounded-full text-[11px] font-mono tracking-wider font-bold">
                <Sparkles className="w-3.5 h-3.5 text-sky-400" />
                <span>SAAS BENEFITS PROFILE</span>
              </div>

              <h3 className="font-display text-2xl font-bold tracking-tight">
                Designed for healthcare practitioners.
              </h3>

              <div className="space-y-6">
                {[
                  { title: 'Start in minutes', desc: 'Autoconfigure templates for dental, dermatology or General OPD inside 180 seconds flat.', icon: Clock },
                  { title: 'No sales demo required', desc: 'Self-serve dashboards and custom WhatsApp numbers that function instantly for testing.', icon: Shield },
                  { title: 'WhatsApp-only friction', desc: 'Patients complete bookings natively within WhatsApp. No log-ins or apps required.', icon: Smartphone },
                  { title: 'Cancel anytime', desc: 'No-contract annual lock-ins. Switch plans or terminate your registration with 1 click.', icon: CheckCircle },
                ].map((ben, idx) => {
                  const Icon = ben.icon;
                  return (
                    <div key={idx} className="flex gap-4 items-start">
                      <div className="w-10 h-10 bg-sky-800/85 text-sky-300 rounded-xl flex items-center justify-center shrink-0 border border-sky-700/65">
                        <Icon className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="font-display font-black text-sm tracking-tight">{ben.title}</h4>
                        <p className="text-sky-200/80 text-xs leading-relaxed mt-0.5">{ben.desc}</p>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="pt-6 border-t border-sky-800 flex items-center justify-between text-sky-250">
                <div>
                  <span className="block text-2xl font-extrabold font-display leading-tight text-white">4.9/5</span>
                  <span className="text-[10px] text-slate-300 uppercase font-mono tracking-wider">Patient RSVP rating</span>
                </div>
                <div>
                  <span className="block text-2xl font-extrabold font-display leading-tight text-white">99.9%</span>
                  <span className="text-[10px] text-slate-300 uppercase font-mono tracking-wider">Messaging uptime</span>
                </div>
                <div>
                  <span className="block text-2xl font-extrabold font-display leading-tight text-white">70%</span>
                  <span className="text-[10px] text-slate-300 uppercase font-mono tracking-wider">Fewer clinic no-shows</span>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
