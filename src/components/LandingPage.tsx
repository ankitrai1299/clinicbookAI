import React, { useState, useEffect } from 'react';
import {
  ArrowRight, CheckCircle2, MessageSquare, AlertCircle, Sparkles,
  Globe, Calendar, Bell, Users, Plus, Star, Landmark, ShieldCheck, HelpCircle,
  Terminal, Webhook, FlaskConical, KeyRound
} from 'lucide-react';
import { PageType } from '../types';

interface LandingPageProps {
  setCurrentPage: (page: PageType) => void;
}

export default function LandingPage({ setCurrentPage }: LandingPageProps) {
  // Simple chat message replay simulation to make the Hero preview feel alive!
  const [messages, setMessages] = useState<Array<{ sender: 'bot' | 'user'; text: string; time: string; delay?: number }>>([
    { sender: 'bot', text: '👋 Hello! Welcome to Pearl Health Clinic. How can we help you today? \n\nReply with a option number:\n1️⃣ Book Appointment\n2️⃣ Reschedule / Cancel\n3️⃣ Clinic Timings', time: '09:00 AM' },
  ]);
  const [currentStep, setCurrentStep] = useState(0);

  const script = [
    { sender: 'user', text: '1', time: '09:01 AM', nextBotText: 'Perfect! Which specialist do you need?\n\n🩺 Dr. Sarah (Dermatologist)\n🩺 Dr. Amit (Physician)\n🩺 Dr. Clara (Pediatrician)' },
    { sender: 'user', text: 'Dr. Sarah (Dermatologist)', time: '09:01 AM', nextBotText: 'Checking slots for Dr. Sarah... \n\nAvailable tomorrow:\n📅 A: 10:00 AM\n📅 B: 11:30 AM\n📅 C: 04:00 PM\n\nReply with letter to book.' },
    { sender: 'user', text: 'B', time: '09:02 AM', nextBotText: '🎉 Confirmed! Your appointment with Dr. Sarah is booked for tomorrow at 11:30 AM.\n\nWe will send you a WhatsApp confirmation card and a 24-hr reminder.' }
  ];

  useEffect(() => {
    if (currentStep >= script.length) {
      // Loop back after 10 seconds empty
      const timer = setTimeout(() => {
        setMessages([
          { sender: 'bot', text: '👋 Hello! Welcome to Pearl Health Clinic. How can we help you today? \n\nReply with a option number:\n1️⃣ Book Appointment\n2️⃣ Reschedule / Cancel\n3️⃣ Clinic Timings', time: '09:00 AM' }
        ]);
        setCurrentStep(0);
      }, 7000);
      return () => clearTimeout(timer);
    }

    const timer1 = setTimeout(() => {
      // Patient reply
      setMessages(prev => [...prev, { sender: 'user', text: script[currentStep].text, time: script[currentStep].time }]);
      
      const timer2 = setTimeout(() => {
        // Bot replies
        setMessages(prev => [...prev, { sender: 'bot', text: script[currentStep].nextBotText, time: script[currentStep].time }]);
        setCurrentStep(prev => prev + 1);
      }, 1800);

      return () => clearTimeout(timer2);
    }, 3500);

    return () => clearTimeout(timer1);
  }, [currentStep]);

  return (
    <div className="bg-slate-50 min-h-screen" id="landing-page-root">
      {/* 1. HERO SECTION */}
      <section className="relative overflow-hidden bg-white pt-10 pb-20 lg:pt-16 lg:pb-28 border-b border-slate-100" id="hero-section">
        {/* Decorative Grid and Blur Accent */}
        <div className="absolute inset-0 z-0 bg-radial-at-t from-sky-50 via-white to-transparent opacity-70 pointer-events-none"></div>
        <div className="absolute top-20 right-10 w-96 h-96 bg-teal-100 rounded-full blur-3xl opacity-20 pointer-events-none"></div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
            {/* Left side text column */}
            <div className="lg:col-span-7 space-y-6 text-center lg:text-left">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-sky-50 border border-sky-100 text-sky-700 rounded-full text-xs font-semibold tracking-wide uppercase shadow-2xs">
                <Sparkles className="w-4.5 h-4.5 text-sky-500 animate-pulse" />
                <span>Automated Patient Bookings</span>
              </div>

              <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-extrabold text-slate-900 tracking-tight leading-tight" id="hero-title">
                Clinic appointments.<br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-sky-600 to-teal-600">On WhatsApp.</span><br />
                In any language.
              </h1>

              <p className="text-lg text-slate-600 max-w-2xl mx-auto lg:mx-0 leading-relaxed" id="hero-subtitle">
                ClinicBook AI helps clinics automate appointment booking, reminders, cancellations, and waitlist recovery through WhatsApp. Give your patients a 24/7 multilingual booking agent without hiring.
              </p>

              {/* Action indicators */}
              <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start pt-2">
                <button
                  id="hero-cta-signup"
                  onClick={() => setCurrentPage('signup')}
                  className="px-8 py-4 bg-sky-600 text-white rounded-xl font-bold hover:bg-sky-700 shadow-lg shadow-sky-100 hover:shadow-xl transition-all duration-300 flex items-center justify-center gap-2 group cursor-pointer"
                >
                  Start Free Trial
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </button>
              </div>

              {/* Trust badges */}
              <div className="flex flex-wrap items-center justify-center lg:justify-start gap-6 pt-6 text-slate-400 text-xs font-medium">
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  <span>No credit card required</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  <span>Setup in under 10 minutes</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  <span>GDPR & HIPAA compliant framework</span>
                </div>
              </div>
            </div>

            {/* Right side WhatsApp simulation preview */}
            <div className="lg:col-span-5 flex justify-center">
              <div 
                className="w-full max-w-[370px] rounded-[36px] bg-slate-900 p-3 shadow-2xl relative border-4 border-slate-800 scale-100 hover:scale-[1.02] transition-transform duration-300"
                id="hero-whatsapp-simulator"
              >
                {/* Speaker top bar of a phone */}
                <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-32 h-6 bg-slate-900 rounded-b-2xl z-20 flex items-center justify-center">
                  <div className="w-12 h-1 bg-slate-700 rounded-full mb-1"></div>
                </div>

                <div className="bg-emerald-600 rounded-[28px] overflow-hidden aspect-[9/16] flex flex-col relative z-10 border border-slate-950">
                  {/* WhatsApp Custom Header */}
                  <div className="bg-emerald-700 text-white pt-6 pb-3 px-4 flex items-center justify-between shadow-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-800 font-bold flex items-center justify-center text-sm border-2 border-white/60">
                        🩺
                      </div>
                      <div>
                        <h4 className="font-semibold text-sm tracking-tight leading-normal">Pearl Health Clinic</h4>
                        <span className="text-[10px] text-emerald-200 flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-lightgreen animate-pulse"></span>
                          Online AI Booking Bot
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
                    </div>
                  </div>

                  {/* Message container */}
                  <div className="flex-1 p-4 overflow-y-auto space-y-3.5 whatsapp-chat-bg text-left flex flex-col justify-end min-h-[360px] max-h-[390px]">
                    {messages.map((m, i) => (
                      <div 
                        key={i} 
                        className={`flex flex-col max-w-[85%] rounded-2xl p-3 shadow-xs text-xs animate-slideUp ${
                          m.sender === 'bot' 
                            ? 'bg-white text-slate-800 self-start rounded-tl-none' 
                            : 'bg-emerald-100 text-slate-800 self-end rounded-tr-none'
                        }`}
                      >
                        <p className="whitespace-pre-line leading-relaxed">{m.text}</p>
                        <span className="text-[9px] text-slate-400 self-end mt-1 block font-mono">{m.time}</span>
                      </div>
                    ))}
                    {currentStep < script.length && (
                      <div className="bg-white/80 self-start rounded-2xl rounded-tl-none py-1.5 px-3 text-xs text-slate-500 italic shadow-2xs animate-pulse flex items-center gap-1.5">
                        <span className="font-mono">Patient is replying...</span>
                      </div>
                    )}
                  </div>

                  {/* WhatsApp Quick Reply footer bar mock */}
                  <div className="bg-white/90 p-3 border-t border-slate-100 flex items-center gap-2">
                    <div className="flex-1 bg-slate-50 rounded-full px-4 py-2 border border-slate-200 text-[11px] text-slate-400 text-left">
                      Message Pearl Health...
                    </div>
                    <div className="w-8 h-8 rounded-full bg-emerald-600 flex items-center justify-center text-white text-sm">
                      🎤
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3. THE SOLUTION SECTION */}
      <section className="py-20 bg-white border-y border-slate-100" id="solution-section">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto space-y-4">
            <span className="text-sky-600 font-semibold text-sm uppercase tracking-wider font-mono">The Intelligent Solution</span>
            <h2 className="font-display text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
              A 24/7 autonomous booking engine on WhatsApp
            </h2>
            <p className="text-slate-600 text-md leading-relaxed">
              ClinicBook AI replaces phone tag with direct WhatsApp scheduling, integrated with your calendars.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 pt-12" id="solutions-grid">
            {[
              {
                title: 'WhatsApp Booking Bot',
                desc: 'Instant interactive bookings directly inside WhatsApp. No phone software or web portals for patients to download.',
                icon: MessageSquare,
                benefit: 'Fully hands-free bookings'
              },
              {
                title: 'Real-time Slot Database',
                desc: 'Bookings live in a real-time PostgreSQL database, with optional Google Calendar sync, to prevent accidental double-bookings.',
                icon: Calendar,
                benefit: '0 overlap scheduling'
              },
              {
                title: 'Multilingual Conversation',
                desc: 'Speaks fluently in Hindi, Spanish, English and 15+ community dialects, respecting patient preference.',
                icon: Globe,
                benefit: 'Vernacular patient trust'
              },
              {
                title: 'Reminders Loop (24h & 2h)',
                desc: 'Smart notifications sent to check status. Clicking "Cancel" instantly triggers waitlist recover.',
                icon: Bell,
                benefit: 'Reduces no-shows by 70%'
              },
              {
                title: 'Waitlist Recovery Engine',
                desc: 'As soon as a slot is vacated, our AI instantly texts patients in the queue to book it instantly.',
                icon: Users,
                benefit: 'Recovers 90% lost booking'
              }
            ].map((sol, i) => {
              const Icon = sol.icon;
              return (
                <div key={i} className="bg-sky-50/50 rounded-2xl p-6 border border-sky-100/60 shadow-xs flex flex-col justify-between hover:shadow-md transition-shadow">
                  <div className="space-y-4">
                    <div className="w-10 h-10 rounded-lg bg-sky-600 flex items-center justify-center text-white shadow-xs">
                      <Icon className="w-5 h-5" />
                    </div>
                    <h3 className="font-display font-bold text-slate-900 text-lg leading-snug">{sol.title}</h3>
                    <p className="text-slate-600 text-xs leading-relaxed">{sol.desc}</p>
                  </div>
                  <div className="mt-4 pt-3 border-t border-sky-100/50 text-sky-800 font-bold text-xs bg-sky-100/50 p-2 rounded-lg text-center">
                    {sol.benefit}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 4. HOW IT WORKS */}
      <section className="py-20 bg-slate-50" id="how-it-works-section">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto space-y-4">
            <span className="text-teal-600 font-semibold text-sm uppercase tracking-wider font-mono">Streamlined Lifecycle</span>
            <h2 className="font-display text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
              Patient journey in 6 simple steps
            </h2>
            <p className="text-slate-600 text-md leading-relaxed">
              We design the experience to match normal social texting, requiring zero training for patient demographics.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 pt-12" id="steps-grid">
            {[
              { step: '1', title: 'Tap WhatsApp Link', desc: 'Patients click a website button, scan clinic QR, or tap a chat link on social profiles.' },
              { step: '2', title: 'Collect Patient Choice', desc: 'Bot asks them what date, language preference, appointment category and doctor name.' },
              { step: '3', title: 'Verify Doctor Slots', desc: 'The AI checks the clinic booking database instantly for vacancy.' },
              { step: '4', title: 'Lock Slot Booking', desc: 'The booking locks, patient confirms details on chat, and receives a WhatsApp card.' },
              { step: '5', title: 'Send Automated Reminders', desc: 'Alerts are dispatched 24 hours and 2 hours before the appointment with easy RSVP options.' },
              { step: '6', title: 'Recover Empty Slots', desc: 'Immediate automated waitlist notification loops out if an active patient cancels.' }
            ].map((s, idx) => (
              <div key={idx} className="bg-white rounded-2xl p-6 border border-slate-100 shadow-xs relative hover:-translate-y-1 transition-all duration-300">
                <div className="absolute top-4 right-4 w-10 h-10 bg-slate-100 text-slate-500 font-mono font-bold text-md rounded-full flex items-center justify-center">
                  #{s.step}
                </div>
                <div className="space-y-3 pr-8">
                  <h3 className="font-display font-extrabold text-slate-900 text-lg leading-snug">{s.title}</h3>
                  <p className="text-slate-500 text-xs leading-relaxed">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 5. PLATFORM FEATURES */}
      <section className="py-20 bg-white" id="features-section">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto space-y-4">
            <h2 className="font-display text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
              SaaS components built for modern healthcare providers
            </h2>
            <p className="text-slate-600 text-md leading-relaxed">
              Everything your staff needs to supervise bookings from our desktop dashboard, without touching daily WhatsApp channels.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 pt-12" id="features-grid">
            {[
              { title: 'WhatsApp Booking', desc: 'Dedicated digital WhatsApp profile dedicated exclusively for conversational scheduling.' },
              { title: 'Multilingual dialogue', desc: 'Autodetect and speak fluently in Hindi, English, Spanish or regional dialects.' },
              { title: 'Optional Google Calendar Integration', desc: 'Optional two-way sync layered on top of the PostgreSQL booking database, the single source of truth.' },
              { title: 'Automated Reminders', desc: '24h and 2h texts keeping patient attrition rates under 5%.' },
              { title: 'Waitlist Recovery', desc: 'Instantly notify fallback patients during short notice cancellations.' },
              { title: 'Clinic Dashboard', desc: 'Beautiful desktop control room for doctors, clinic staff and receptionists.' },
              { title: 'Razorpay / Stripe Billing', desc: 'Optional advance collection of consultation fee straight via WhatsApp checkout link.' },
              { title: 'No-Show Analytics & Tracking', desc: 'Identify high-risk offline phone booked patient profiles prior to consultations.' }
            ].map((f, i) => (
              <div key={i} className="bg-slate-50/50 rounded-2xl p-5 border border-slate-100 flex flex-col justify-between hover:border-sky-300 transition-colors">
                <div className="space-y-3">
                  <div className="w-8 h-8 rounded-lg bg-sky-100 flex items-center justify-center text-sky-700">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <h3 className="font-display font-bold text-slate-900 text-sm">{f.title}</h3>
                  <p className="text-slate-500 text-xs leading-relaxed">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 5b. DEVELOPERS & API — market the integration to hospitals/EMRs before signup */}
      <section className="py-20 bg-slate-900 text-white relative overflow-hidden" id="developers-section">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="space-y-6">
              <span className="inline-flex items-center gap-2 text-sky-300 font-semibold text-sm uppercase tracking-wider font-mono">
                <Terminal className="w-4 h-4" /> Developers &amp; API
              </span>
              <h2 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight leading-tight">
                Already run an EMR or hospital app? <span className="text-sky-400">Plug ClinicBook in.</span>
              </h2>
              <p className="text-slate-300 text-md leading-relaxed">
                Drop our API key into your system and every appointment it books flows through ClinicBook —
                WhatsApp confirmations, reminders and the clinic dashboard keep working untouched. Or let us
                push every booking back to you with signed webhooks. Build safely against a sandbox key that
                never messages a real patient.
              </p>
              <div className="grid sm:grid-cols-3 gap-3 pt-2">
                {[
                  { icon: KeyRound, label: 'REST API', desc: 'Book, reschedule, cancel' },
                  { icon: Webhook, label: 'Webhooks', desc: 'Signed, retried events' },
                  { icon: FlaskConical, label: 'Sandbox keys', desc: 'Test with zero risk' }
                ].map((f, i) => {
                  const Icon = f.icon;
                  return (
                    <div key={i} className="bg-white/5 border border-white/10 rounded-xl p-4">
                      <Icon className="w-5 h-5 text-sky-400 mb-2" />
                      <div className="font-semibold text-sm">{f.label}</div>
                      <div className="text-slate-400 text-xs">{f.desc}</div>
                    </div>
                  );
                })}
              </div>
              <div className="flex flex-wrap gap-3 pt-2">
                <button
                  id="developers-section-cta-docs"
                  onClick={() => setCurrentPage('developers')}
                  className="flex items-center gap-2 px-6 py-3 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-semibold text-sm transition-all"
                >
                  Read the API docs <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  id="developers-section-cta-signup"
                  onClick={() => setCurrentPage('signup')}
                  className="flex items-center gap-2 px-6 py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold text-sm transition-all"
                >
                  Start free trial
                </button>
              </div>
            </div>

            {/* Code peek */}
            <div className="bg-slate-950/70 border border-white/10 rounded-2xl p-5 shadow-2xl">
              <div className="flex items-center gap-1.5 mb-3">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-400/70" />
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400/70" />
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400/70" />
                <span className="ml-2 text-[11px] font-mono text-slate-500">book an appointment</span>
              </div>
              <pre className="text-[12px] sm:text-[13px] leading-relaxed text-slate-100 overflow-x-auto font-mono">
{`curl -X POST https://api.clinicbook.ai/api/v1/appointments \\
  -H "Authorization: Bearer ck_test_..." \\
  -H "Idempotency-Key: unique-123" \\
  -d '{
    "doctorId": "doc_a1b2",
    "patientName": "Ankit Rai",
    "patientPhone": "+919876543210",
    "date": "2026-08-01",
    "time": "10:00 AM"
  }'

`}<span className="text-emerald-400">{`→ 201  { "status": "PENDING", "id": "appt_x9" }`}</span>
              </pre>
            </div>
          </div>
        </div>
      </section>

      {/* 6. TRANSPARENT PRICING GRID */}
      <section className="py-20 bg-slate-50 border-t border-slate-100" id="pricing-section">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto space-y-4">
            <span className="text-sky-600 font-semibold text-sm uppercase tracking-wider font-mono">Simple Billing</span>
            <h2 className="font-display text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
              One clear price. Absolute return on investment.
            </h2>
            <p className="text-slate-600 text-md leading-relaxed">
              No contracts. Protect slots and cut administrative labor today.
            </p>
          </div>

          <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8 pt-12" id="pricing-grid">
            {/* India Plan */}
            <div className="bg-white rounded-3xl p-8 border border-slate-200/80 shadow-md relative overflow-hidden flex flex-col justify-between">
              <div>
                <div className="absolute top-0 right-0 bg-sky-600 text-white text-[10px] font-mono px-3 py-1 uppercase font-bold rounded-bl-xl">
                  Best Value for India
                </div>
                <div className="space-y-2">
                  <h4 className="font-display text-lg font-bold text-slate-900">India Plan</h4>
                  <p className="text-slate-500 text-xs">For clinics situated in India, with domestic WhatsApp volume.</p>
                </div>

                <div className="py-6 border-b border-slate-100">
                  <span className="font-display text-4xl font-extrabold text-slate-900">₹999</span>
                  <span className="text-slate-500 text-xs"> / month</span>
                </div>

                <ul className="py-6 space-y-3 text-left">
                  {[
                    'WhatsApp appointment booking bot',
                    '24hr & 2hr reminder automation',
                    'Autonomous Waitlist Recovery',
                    'Central desktop clinic dashboard',
                    'Multilingual vernacular support',
                    'Optional Google Calendar integration'
                  ].map((feat, idx) => (
                    <li key={idx} className="flex items-center gap-2.5 text-xs text-slate-600">
                      <CheckCircle2 className="w-4.5 h-4.5 text-emerald-500 shrink-0" />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <button 
                id="pricing-button-india"
                onClick={() => setCurrentPage('signup')}
                className="w-full py-3 px-4 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all"
              >
                Get Started with India Plan
              </button>
            </div>

            {/* International Plan */}
            <div className="bg-white rounded-3xl p-8 border border-sky-400 shadow-lg relative overflow-hidden flex flex-col justify-between ring-4 ring-sky-50">
              <div className="absolute top-0 right-0 bg-teal-600 text-white text-[10px] font-mono px-3 py-1 uppercase font-bold rounded-bl-xl animate-pulse">
                Global Active
              </div>
              <div>
                <div className="space-y-2">
                  <h4 className="font-display text-lg font-bold text-slate-900">International Plan</h4>
                  <p className="text-slate-500 text-xs">For clinics in US, Europe, Middle East and globally.</p>
                </div>

                <div className="py-6 border-b border-slate-100">
                  <span className="font-display text-4xl font-extrabold text-slate-900">$49</span>
                  <span className="text-slate-500 text-xs"> / month</span>
                </div>

                <ul className="py-6 space-y-3 text-left">
                  {[
                    'WhatsApp appointment booking bot',
                    '24hr & 2hr reminder automation',
                    'Autonomous Waitlist Recovery',
                    'Central desktop clinic dashboard',
                    'Multilingual support (Spanish, Hindi, etc.)',
                    'Optional Google Calendar & webhook API',
                    'Custom bot tone matching'
                  ].map((feat, idx) => (
                    <li key={idx} className="flex items-center gap-2.5 text-xs text-slate-600">
                      <CheckCircle2 className="w-4.5 h-4.5 text-emerald-500 shrink-0" />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <button 
                id="pricing-button-intl"
                onClick={() => setCurrentPage('signup')}
                className="w-full py-3.5 px-4 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold shadow-md shadow-sky-100 transition-all"
              >
                Get Started with International Plan
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* 7. FINAL CTA */}
      <section className="py-20 bg-sky-900 text-white relative overflow-hidden" id="final-cta-section">
        {/* Gradients */}
        <div className="absolute inset-0 bg-radial-at-b from-sky-800 to-sky-950 opacity-90 z-0"></div>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center space-y-8">
          <h2 className="font-display text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight">
            Start taking appointments on WhatsApp today.
          </h2>
          <p className="text-sky-100/90 max-w-2xl mx-auto text-sm sm:text-md leading-relaxed">
            Boost consultation slot utility and save overhead. Join hundreds of smart clinics automating bookings with ClinicBook AI.
          </p>
          <div>
            <button
              id="cta-bottom-signup"
              onClick={() => setCurrentPage('signup')}
              className="px-8 py-4 bg-white text-sky-950 font-bold text-base rounded-xl hover:bg-sky-50 shadow-xl transition-all duration-300 inline-flex items-center gap-2 cursor-pointer"
            >
              Create Clinic Account
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-900 text-slate-400 py-12 border-t border-slate-800 text-xs text-left">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row justify-between items-center gap-6">
          <button 
            onClick={() => {
              setCurrentPage('landing');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className="flex items-center gap-2.5 cursor-pointer text-left focus:outline-hidden group"
            id="footer-logo-btn"
          >
            <div className="w-8 h-8 rounded-lg bg-sky-600 flex items-center justify-center text-white font-mono text-sm transition-transform duration-300 group-hover:scale-105">
              🩺
            </div>
            <span className="font-display font-bold text-white text-base">ClinicBook AI</span>
          </button>
          <div>
            <p>© 2026 ClinicBook AI Inc. All rights reserved. Built for clinics, dentists, therapists and pediatricians globally.</p>
          </div>
          <div className="flex gap-4">
            <a href="#privacy" className="hover:text-white transition-colors">Privacy Policy</a>
            <a href="#terms" className="hover:text-white transition-colors">Terms of Service</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
