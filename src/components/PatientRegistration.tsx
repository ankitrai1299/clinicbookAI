import React, { useEffect, useState } from 'react';
import { CheckCircle, HeartPulse, Loader2, AlertTriangle } from 'lucide-react';

import { ApiError } from '../api/client';
import {
  getPublicClinic,
  registerPublicPatient,
  PublicClinic
} from '../api/publicRegistration';

interface PatientRegistrationProps {
  clinicId: string;
}

const GENDER_OPTIONS = ['Male', 'Female', 'Other', 'Prefer not to say'];

const labelClass = 'block text-xs font-bold text-slate-700 mb-1.5';
const inputClass =
  'w-full text-sm px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-sky-500 focus:bg-white transition-colors';

export default function PatientRegistration({ clinicId }: PatientRegistrationProps) {
  const [clinic, setClinic] = useState<PublicClinic | null>(null);
  const [clinicLoading, setClinicLoading] = useState(true);
  const [clinicError, setClinicError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState('');
  const [healthConcern, setHealthConcern] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!clinicId) {
      setClinicError('This registration link is invalid. Please ask the clinic for a new link.');
      setClinicLoading(false);
      return;
    }

    let active = true;
    (async () => {
      try {
        const data = await getPublicClinic(clinicId);
        if (active) setClinic(data);
      } catch (err) {
        if (active) {
          const message =
            err instanceof ApiError && err.status === 404
              ? 'We could not find this clinic. Please check the link and try again.'
              : 'Something went wrong loading this page. Please try again later.';
          setClinicError(message);
        }
      } finally {
        if (active) setClinicLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [clinicId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    const ageNum = Number(age);
    if (!name.trim() || name.trim().length < 2) {
      setSubmitError('Please enter your full name.');
      return;
    }
    if (!phone.trim() || phone.trim().length < 6) {
      setSubmitError('Please enter a valid mobile number.');
      return;
    }
    if (!age || Number.isNaN(ageNum) || ageNum < 0 || ageNum > 120) {
      setSubmitError('Please enter a valid age.');
      return;
    }
    if (!gender) {
      setSubmitError('Please select your gender.');
      return;
    }
    if (!healthConcern.trim() || healthConcern.trim().length < 2) {
      setSubmitError('Please describe your health concern or reason for visit.');
      return;
    }

    setSubmitting(true);
    try {
      await registerPublicPatient(clinicId, {
        name: name.trim(),
        phone: phone.trim(),
        age: ageNum,
        gender,
        healthConcern: healthConcern.trim()
      });
      setSuccess(true);
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : 'Registration failed. Please try again.';
      setSubmitError(message);
    } finally {
      setSubmitting(false);
    }
  };

  // --- Full-screen states -------------------------------------------------
  if (clinicLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#fafcff]">
        <Loader2 className="w-8 h-8 text-sky-600 animate-spin" />
      </div>
    );
  }

  if (clinicError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#fafcff] px-4">
        <div className="max-w-md w-full bg-white border border-slate-100 rounded-3xl p-8 text-center shadow-sm">
          <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-amber-50 flex items-center justify-center">
            <AlertTriangle className="w-7 h-7 text-amber-500" />
          </div>
          <h1 className="font-display font-extrabold text-lg text-slate-950 mb-2">
            Registration unavailable
          </h1>
          <p className="text-sm text-slate-500">{clinicError}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#fafcff] font-sans antialiased flex flex-col items-center py-8 px-4 sm:py-12">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-sky-600 flex items-center justify-center shadow-lg shadow-sky-200">
            <HeartPulse className="w-7 h-7 text-white" />
          </div>
          <h1 className="font-display font-extrabold text-2xl text-slate-950 leading-tight">
            {clinic?.name}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {success ? 'Registration complete' : 'Patient Registration'}
          </p>
        </div>

        {success ? (
          <div
            className="bg-white border border-slate-100 rounded-3xl p-8 text-center shadow-sm animate-fadeIn"
            id="registration-success"
          >
            <div className="w-16 h-16 mx-auto mb-5 rounded-full bg-emerald-50 flex items-center justify-center">
              <CheckCircle className="w-9 h-9 text-emerald-500" />
            </div>
            <h2 className="font-display font-extrabold text-xl text-slate-950 mb-2">
              You're registered!
            </h2>
            <p className="text-sm text-slate-500 leading-relaxed">
              Thank you, <strong className="text-slate-700">{name.trim()}</strong>. Your details have
              been received by {clinic?.name}. We've sent a confirmation to your WhatsApp number and
              our team will reach out shortly to confirm your appointment.
            </p>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="bg-white border border-slate-100 rounded-3xl p-6 sm:p-8 space-y-5 shadow-sm"
            id="patient-registration-form"
          >
            <div>
              <label className={labelClass} htmlFor="reg-name">
                Full Name
              </label>
              <input
                id="reg-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Priya Sharma"
                autoComplete="name"
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass} htmlFor="reg-phone">
                Mobile Number
              </label>
              <input
                id="reg-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g. +91 98765 43210"
                autoComplete="tel"
                inputMode="tel"
                className={inputClass}
              />
              <p className="text-[11px] text-slate-400 mt-1.5">
                We'll send your confirmation here on WhatsApp.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass} htmlFor="reg-age">
                  Age
                </label>
                <input
                  id="reg-age"
                  type="number"
                  min={0}
                  max={120}
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  placeholder="e.g. 34"
                  inputMode="numeric"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="reg-gender">
                  Gender
                </label>
                <select
                  id="reg-gender"
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                  className={`${inputClass} ${gender ? 'text-slate-900' : 'text-slate-400'}`}
                >
                  <option value="" disabled>
                    Select
                  </option>
                  {GENDER_OPTIONS.map((g) => (
                    <option key={g} value={g} className="text-slate-900">
                      {g}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className={labelClass} htmlFor="reg-concern">
                Health Concern / Reason for Visit
              </label>
              <textarea
                id="reg-concern"
                value={healthConcern}
                onChange={(e) => setHealthConcern(e.target.value)}
                placeholder="Briefly describe your symptoms or the reason for your visit"
                rows={4}
                className={`${inputClass} resize-none`}
              />
            </div>

            {submitError && (
              <div className="flex items-start gap-2 bg-rose-50 border border-rose-100 rounded-xl px-4 py-3">
                <AlertTriangle className="w-4 h-4 text-rose-500 mt-0.5 shrink-0" />
                <p className="text-xs text-rose-600 font-medium">{submitError}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3.5 bg-sky-600 hover:bg-sky-700 disabled:bg-sky-400 text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2"
              id="patient-registration-submit"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {submitting ? 'Registering...' : 'Register'}
            </button>

            <p className="text-[11px] text-slate-400 text-center leading-relaxed">
              By registering you agree to be contacted by {clinic?.name} regarding your appointment.
            </p>
          </form>
        )}

        <p className="text-center text-[11px] text-slate-300 mt-6 font-mono">
          Powered by ClinicBook AI
        </p>
      </div>
    </div>
  );
}
