import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Sparkles, Check, RefreshCw, Clock, ChevronRight, CheckCircle2, Loader2, AlertTriangle } from 'lucide-react';
import { Appointment } from '../types';
import {
  PUBLIC_CLINIC_ID,
  getPublicClinic,
  getPublicDoctors,
  getPublicAvailability,
  createPublicBooking,
  PublicDoctor
} from '../api/publicRegistration';

interface BookingDemoProps {
  onNewAppointmentBooked?: (appointment: Appointment) => void;
  whatsappNumber: string;
}

interface ChatMessage {
  id: string;
  sender: 'bot' | 'patient';
  text: string;
  timestamp: string;
}

type DemoStep = 'language' | 'specialty' | 'date' | 'slot' | 'details' | 'confirmed';

const nowLabel = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

// Local YYYY-MM-DD (avoids UTC off-by-one from toISOString).
const isoLocal = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const buildDateOptions = () => {
  const make = (offset: number, label: string) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    const pretty = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    return { label: `${label} · ${pretty}`, iso: isoLocal(d) };
  };
  return [make(1, 'Tomorrow'), make(2, 'Day after'), make(7, 'Next week')];
};

export default function BookingDemo({ onNewAppointmentBooked }: BookingDemoProps) {
  const [clinicName, setClinicName] = useState<string>('the clinic');
  const [doctors, setDoctors] = useState<PublicDoctor[]>([]);
  const [loadError, setLoadError] = useState<string>('');

  const [step, setStep] = useState<DemoStep>('language');
  const [language, setLanguage] = useState<string>('');
  const [specialty, setSpecialty] = useState<string>('');
  const [doctorId, setDoctorId] = useState<string>('');
  const [doctorName, setDoctorName] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<{ label: string; iso: string } | null>(null);
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<string>('');
  const [slotsLoading, setSlotsLoading] = useState(false);

  const [patientName, setPatientName] = useState('');
  const [patientPhone, setPatientPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const dateOptions = useMemo(() => buildDateOptions(), []);
  const specialties = useMemo(
    () => Array.from(new Set(doctors.map((d) => d.speciality))),
    [doctors]
  );

  const addMessage = (sender: 'bot' | 'patient', text: string) => {
    setMessages((prev) => [...prev, { id: `${Date.now()}-${Math.round(Math.random() * 1e6)}`, sender, text, timestamp: nowLabel() }]);
  };

  // Load the real clinic + doctors for the configured public clinic.
  useEffect(() => {
    if (!PUBLIC_CLINIC_ID) {
      setLoadError('Public clinic is not configured (VITE_PUBLIC_CLINIC_ID).');
      return;
    }
    let active = true;
    (async () => {
      try {
        const [clinic, docs] = await Promise.all([
          getPublicClinic(PUBLIC_CLINIC_ID),
          getPublicDoctors(PUBLIC_CLINIC_ID)
        ]);
        if (!active) return;
        setClinicName(clinic.name);
        setDoctors(docs);
        setMessages([
          {
            id: 'm1',
            sender: 'bot',
            text: `🤖 Hello! Welcome to ${clinic.name} booking assistant on WhatsApp. How can I help you today?`,
            timestamp: nowLabel()
          }
        ]);
      } catch (err) {
        if (active) setLoadError(err instanceof Error ? err.message : 'Failed to load clinic data');
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const container = chatEndRef.current?.parentElement;
    if (container) container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
  }, [messages, isTyping, step]);

  const handleLanguageSelect = (lang: string) => {
    setLanguage(lang);
    addMessage('patient', lang);
    setStep('specialty');
    const prompt =
      lang === 'Hindi'
        ? `🤖 ${clinicName} में आपका स्वागत है। आप किस विभाग में अपॉइंटमेंट लेना चाहते हैं?`
        : lang === 'Spanish'
        ? `🤖 Bienvenido a ${clinicName}. ¿Para qué especialidad desea reservar?`
        : `🤖 Great! Which type of specialist would you like to see?`;
    addMessage('bot', prompt);
  };

  const handleSpecialtySelect = (spec: string) => {
    const doctor = doctors.find((d) => d.speciality === spec);
    if (!doctor) return;
    setSpecialty(spec);
    setDoctorId(doctor.id);
    setDoctorName(doctor.name);
    addMessage('patient', spec);
    setStep('date');
    addMessage('bot', `📅 ${doctor.name} (${spec}) is available. Which day works best for you?`);
  };

  const handleDateSelect = async (opt: { label: string; iso: string }) => {
    setSelectedDate(opt);
    addMessage('patient', opt.label);
    addMessage('bot', '🔍 Checking the doctor’s real-time availability…');
    setStep('slot');
    setSlotsLoading(true);
    setIsTyping(true);
    try {
      const res = await getPublicAvailability(PUBLIC_CLINIC_ID, doctorId, opt.iso);
      setAvailableSlots(res.slots);
      if (res.slots.length === 0) {
        addMessage('bot', `😔 No open slots for ${doctorName} on that day. Please pick another date.`);
        setStep('date');
      } else {
        addMessage('bot', `🗓️ Here are the open times for ${doctorName}. Tap a slot to continue:`);
      }
    } catch (err) {
      addMessage('bot', '⚠️ Could not load availability. Please try another date.');
      setStep('date');
    } finally {
      setSlotsLoading(false);
      setIsTyping(false);
    }
  };

  const handleSlotSelect = (slot: string) => {
    setSelectedSlot(slot);
    addMessage('patient', slot);
    setStep('details');
    const prompt =
      language === 'Hindi'
        ? '👤 अपॉइंटमेंट पक्का करने के लिए कृपया अपना नाम और WhatsApp नंबर दर्ज करें:'
        : language === 'Spanish'
        ? '👤 Para confirmar, ingrese su nombre y número de WhatsApp:'
        : '👤 Almost done! Enter your name and WhatsApp number to confirm this slot:';
    addMessage('bot', prompt);
  };

  const handleConfirmSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patientName || !patientPhone || !selectedDate) return;
    setSubmitting(true);
    setSubmitError('');
    addMessage('patient', `My Name: ${patientName}\nMy Phone: ${patientPhone}`);

    try {
      const result = await createPublicBooking(PUBLIC_CLINIC_ID, {
        name: patientName,
        phone: patientPhone,
        language: language || 'English',
        doctorId,
        date: selectedDate.iso,
        time: selectedSlot
      });

      setStep('confirmed');

      onNewAppointmentBooked?.({
        id: result.appointmentId,
        patientName,
        patientPhone,
        doctorName: result.doctor,
        date: result.date,
        time: result.time,
        status: 'Pending',
        language: language || 'English'
      });

      const confirm =
        language === 'Hindi'
          ? `🎉 बुकिंग प्राप्त हुई!\n\n📌 मरीज: ${patientName}\n👨‍⚕️ डॉक्टर: ${result.doctor}\n📅 तारीख: ${result.date}\n⏰ समय: ${result.time}\n\nWhatsApp पुष्टिकरण ${patientPhone} पर भेजा गया है।`
          : language === 'Spanish'
          ? `🎉 ¡Solicitud recibida!\n\n📌 Paciente: ${patientName}\n👨‍⚕️ Médico: ${result.doctor}\n📅 Fecha: ${result.date}\n⏰ Hora: ${result.time}\n\nConfirmación por WhatsApp enviada a ${patientPhone}.`
          : `🎉 Booking received!\n\n📌 Patient: ${patientName}\n👩‍⚕️ Doctor: ${result.doctor}\n📅 Date: ${result.date}\n⏰ Time: ${result.time}\n\nA WhatsApp confirmation was sent to ${patientPhone}. (Patient ID: ${result.patient.patientCode ?? '—'})`;
      addMessage('bot', confirm);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Booking failed';
      setSubmitError(msg);
      addMessage('bot', `⚠️ ${msg}`);
      // Slot likely taken meanwhile — send them back to pick another time.
      if (/no longer available|not available/i.test(msg)) setStep('slot');
    } finally {
      setSubmitting(false);
    }
  };

  const resetSimulator = () => {
    setStep('language');
    setLanguage('');
    setSpecialty('');
    setDoctorId('');
    setDoctorName('');
    setSelectedDate(null);
    setAvailableSlots([]);
    setSelectedSlot('');
    setPatientName('');
    setPatientPhone('');
    setSubmitError('');
    setMessages([
      {
        id: 'm1',
        sender: 'bot',
        text: `🤖 Hello! Welcome to ${clinicName} booking assistant on WhatsApp. How can I help you today?`,
        timestamp: nowLabel()
      }
    ]);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10" id="booking-demo-root">
      <div className="text-center max-w-3xl mx-auto space-y-4 mb-10">
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-teal-50 border border-teal-100 text-teal-700 rounded-full text-xs font-semibold uppercase tracking-wider">
          <Sparkles className="w-4 h-4 text-teal-500" />
          <span>Live Booking</span>
        </div>
        <h1 className="font-display text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
          Book a real appointment on WhatsApp
        </h1>
        <p className="text-slate-600 text-sm leading-relaxed">
          This funnel runs on live data from <strong>{clinicName}</strong> — real doctors, real availability, and a real
          appointment saved to the clinic with a WhatsApp confirmation.
        </p>
      </div>

      {loadError && (
        <div className="max-w-xl mx-auto mb-8 flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-3 text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{loadError}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left: telemetry panel */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm space-y-5">
            <h3 className="font-display font-bold text-slate-900 text-lg flex items-center gap-2 pb-3 border-b border-slate-100">
              <span className="p-2 rounded-lg bg-sky-50 text-sky-600">⚙️</span>
              How does this work?
            </h3>
            <p className="text-slate-600 text-xs leading-relaxed">
              Each step calls the real backend: doctors and open slots come from the database, and confirming creates a
              real appointment plus a WhatsApp message via the Cloud API.
            </p>
            <div className="bg-slate-950 font-mono text-[11px] text-sky-400 p-4 rounded-xl space-y-2 border border-slate-900">
              <span className="block text-slate-500 text-[9px] uppercase tracking-wider pb-1 border-b border-white/10 font-bold">
                📡 Live Event Log
              </span>
              <div className="space-y-1.5 pt-1.5 h-[170px] overflow-y-auto text-left">
                <p className="text-slate-400">⚡ Connected: {clinicName}</p>
                {language && <p className="text-emerald-400">✔ Language: <span className="text-white">{language}</span></p>}
                {specialty && <p className="text-emerald-400">✔ Doctor resolved: <span className="text-white font-bold">{doctorName}</span></p>}
                {selectedDate && <p className="text-emerald-400">✔ Availability query (PostgreSQL): <span className="text-white">{selectedDate.iso}</span></p>}
                {selectedSlot && <p className="text-emerald-400">✔ Slot selected: <span className="text-white">{selectedSlot}</span></p>}
                {step === 'confirmed' && (
                  <>
                    <p className="text-yellow-400">⏳ Appointment created (PENDING) + WhatsApp sent</p>
                    <p className="text-purple-400">ℹ Persisted to clinic database</p>
                  </>
                )}
                <div className="text-[10px] text-slate-600 italic">Listening…</div>
              </div>
            </div>
            <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-100 text-left">
              <h4 className="text-emerald-950 font-bold text-xs flex items-center gap-1.5 mb-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                Production Architecture
              </h4>
              <p className="text-emerald-800 text-[11px] leading-relaxed">
                <code>Meta WhatsApp Cloud API</code> + <code>Express + Prisma</code> + <code>OpenAI GPT-4.1-mini</code>,
                persisting bookings to <code>PostgreSQL (Supabase)</code>.
              </p>
            </div>
          </div>

          {step === 'confirmed' && (
            <div className="bg-teal-500 rounded-2xl p-6 text-white text-left space-y-4 shadow-lg shadow-teal-100 animate-fadeIn">
              <h4 className="font-display font-bold text-md flex items-center gap-2">
                <Check className="w-5 h-5 bg-white text-teal-600 rounded-full p-0.5" />
                Appointment Created!
              </h4>
              <p className="text-xs text-teal-50/90 leading-relaxed">
                <strong>{patientName}</strong> is booked with {doctorName}. A WhatsApp confirmation was sent to {patientPhone}.
              </p>
              <button onClick={resetSimulator} className="w-full py-2 bg-white text-teal-800 font-bold rounded-lg text-xs hover:bg-teal-50 transition-colors">
                Book Another
              </button>
            </div>
          )}
        </div>

        {/* Right: phone */}
        <div className="lg:col-span-7 flex justify-center">
          <div className="w-full max-w-[500px] bg-slate-900 rounded-[44px] p-4 shadow-xl border-4 border-slate-800 relative">
            <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-32 h-6 bg-slate-900 rounded-b-2xl z-20 flex items-center justify-center">
              <div className="w-16 h-1 bg-slate-700 rounded-full mb-1"></div>
            </div>
            <div className="bg-[#efeae2] rounded-[34px] overflow-hidden aspect-[9/14] flex flex-col relative z-10 border border-slate-950">
              <div className="bg-emerald-700 text-white pt-6 pb-3.5 px-4 flex items-center justify-between shadow-md">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-emerald-500 text-white flex items-center justify-center font-bold text-lg">🩺</div>
                  <div>
                    <h4 className="font-semibold text-sm tracking-tight text-white m-0">{clinicName}</h4>
                    <span className="text-[10px] text-emerald-200 block text-left">Typically replies instantly</span>
                  </div>
                </div>
                <button onClick={resetSimulator} className="p-1 rounded-full hover:bg-emerald-600 text-emerald-100 transition-colors" title="Restart" id="reset-demo-simulator-btn">
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 p-4 overflow-y-auto space-y-4 whatsapp-chat-bg max-h-[460px] min-h-[380px]">
                {messages.map((msg) => (
                  <div key={msg.id} className={`flex ${msg.sender === 'bot' ? 'justify-start' : 'justify-end'}`}>
                    <div className={`max-w-[85%] rounded-2xl p-3.5 shadow-xs text-xs ${msg.sender === 'bot' ? 'bg-white text-slate-800 rounded-tl-none text-left' : 'bg-emerald-200 text-slate-800 rounded-tr-none text-left'}`}>
                      <p className="whitespace-pre-line leading-relaxed font-sans">{msg.text}</p>
                      <span className="text-[9px] text-slate-400 mt-1.5 block font-mono text-right">{msg.timestamp}</span>
                    </div>
                  </div>
                ))}

                {/* Step controls */}
                {!loadError && step === 'language' && doctors.length > 0 && (
                  <div className="grid grid-cols-1 gap-2 pl-2 animate-fadeIn">
                    {['English', 'Hindi', 'Spanish'].map((lng) => (
                      <button key={lng} onClick={() => handleLanguageSelect(lng)} className="px-4 py-2.5 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-sky-700 shadow-xs text-left">
                        {lng === 'English' ? '🇺🇸 Continue in English' : lng === 'Hindi' ? '🇮🇳 हिंदी में जारी रखें' : '🇪🇸 Continuar en Español'}
                      </button>
                    ))}
                  </div>
                )}

                {step === 'specialty' && (
                  <div className="grid grid-cols-2 gap-2 pl-2 animate-fadeIn">
                    {specialties.map((spec) => (
                      <button key={spec} onClick={() => handleSpecialtySelect(spec)} className="px-3 py-2 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-sky-700 shadow-xs text-left">
                        🩺 {spec}
                      </button>
                    ))}
                  </div>
                )}

                {step === 'date' && (
                  <div className="flex flex-col gap-2 pl-2 animate-fadeIn">
                    {dateOptions.map((opt) => (
                      <button key={opt.iso} onClick={() => handleDateSelect(opt)} className="px-4 py-2.5 bg-white hover:bg-sky-50 border border-slate-200 rounded-xl text-xs font-bold text-sky-700 text-left flex justify-between items-center">
                        <span>📅 {opt.label}</span>
                        <ChevronRight className="w-4 h-4 text-sky-400" />
                      </button>
                    ))}
                  </div>
                )}

                {step === 'slot' && (
                  <div className="p-1">
                    {slotsLoading ? (
                      <div className="flex items-center gap-2 text-[11px] text-slate-500 font-mono pl-2">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading slots…
                      </div>
                    ) : availableSlots.length > 0 ? (
                      <>
                        <div className="text-[10px] text-slate-500 font-bold mb-1.5 uppercase font-mono text-left">Select Available Time:</div>
                        <div className="grid grid-cols-2 gap-2 animate-fadeIn">
                          {availableSlots.map((slot) => (
                            <button key={slot} onClick={() => handleSlotSelect(slot)} className="px-4 py-2.5 bg-sky-600 hover:bg-sky-700 font-bold text-white rounded-xl text-xs flex items-center justify-center gap-1 shadow-sm">
                              <Clock className="w-3.5 h-3.5" />
                              {slot}
                            </button>
                          ))}
                        </div>
                      </>
                    ) : null}
                  </div>
                )}

                {isTyping && (
                  <div className="flex justify-start items-center gap-1" id="bot-typing-indicator">
                    <div className="bg-white/80 rounded-2xl rounded-tl-none py-2 px-3 text-xs text-slate-500 italic shadow-2xs flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-emerald-600 animate-bounce"></span>
                      <span className="w-2 h-2 rounded-full bg-emerald-600 animate-bounce [animation-delay:0.2s]"></span>
                      <span className="w-2 h-2 rounded-full bg-emerald-600 animate-bounce [animation-delay:0.4s]"></span>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {step === 'details' && (
                <div className="bg-white border-t border-slate-200 p-4 shrink-0 animate-fadeIn text-left">
                  <span className="block text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider mb-2">Enter Patient Info</span>
                  <form onSubmit={handleConfirmSubmit} className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] text-slate-500 font-medium mb-1">Full Name</label>
                        <input type="text" required value={patientName} onChange={(e) => setPatientName(e.target.value)} placeholder="e.g. John Doe" className="w-full text-xs px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:border-sky-500" />
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-500 font-medium mb-1">WhatsApp Mobile</label>
                        <input type="tel" required value={patientPhone} onChange={(e) => setPatientPhone(e.target.value)} placeholder="e.g. 919876543210" className="w-full text-xs px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:border-sky-500" />
                      </div>
                    </div>
                    {submitError && <p className="text-[10px] text-red-600">{submitError}</p>}
                    <button type="submit" disabled={submitting} className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center justify-center gap-1.5">
                      {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      {submitting ? 'Booking…' : 'Confirm and Schedule'}
                    </button>
                  </form>
                </div>
              )}

              {step !== 'details' && (
                <div className="bg-white/95 p-3.5 border-t border-slate-100 flex items-center gap-2">
                  <div className="flex-1 bg-slate-50 rounded-full px-4.5 py-2 border border-slate-200 text-xs text-slate-400 text-left font-mono">
                    {step === 'confirmed' ? 'Booking created' : 'Choose an option above…'}
                  </div>
                  <div className="w-8.5 h-8.5 rounded-full bg-emerald-600 flex items-center justify-center text-white text-sm">🎤</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
