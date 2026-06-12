import React, { useState, useEffect, useRef } from 'react';
import { 
  Send, Globe, Clock, CheckCircle2, Phone, Calendar as CalendarIcon, 
  Sparkles, Check, ChevronRight, RefreshCw, MessageSquare
} from 'lucide-react';
import { Appointment } from '../types';
import { INITIAL_DOCTORS } from '../data/mockData';

interface BookingDemoProps {
  onNewAppointmentBooked: (appointment: Appointment) => void;
  whatsappNumber: string;
}

interface ChatMessage {
  id: string;
  sender: 'bot' | 'patient';
  text: string;
  timestamp: string;
  options?: string[]; // Quick reply options
  showSlots?: string[]; // Available slot cards
}

type DemoStep = 'language' | 'specialty' | 'date' | 'slot' | 'details' | 'confirmed';

export default function BookingDemo({ onNewAppointmentBooked, whatsappNumber }: BookingDemoProps) {
  const [step, setStep] = useState<DemoStep>('language');
  const [language, setLanguage] = useState<string>('');
  const [specialty, setSpecialty] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedSlot, setSelectedSlot] = useState<string>('');
  
  const [patientName, setPatientName] = useState('');
  const [patientPhone, setPatientPhone] = useState('');
  
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'm1',
      sender: 'bot',
      text: '🤖 Hello! Welcome to Pearl Health Clinic booking assistant on WhatsApp. How can I help you today?',
      timestamp: 'Just now',
      options: ['Select Language / भाषा चुनें / Seleccionar Idioma']
    }
  ]);
  
  const [isTyping, setIsTyping] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = chatEndRef.current?.parentElement;
    if (container) {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [messages, isTyping]);

  const addMessage = (sender: 'bot' | 'patient', text: string, options?: string[], slots?: string[]) => {
    const newMessage: ChatMessage = {
      id: Date.now().toString(),
      sender,
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      options,
      showSlots: slots
    };
    setMessages(prev => [...prev, newMessage]);
  };

  const simulateBotResponse = (promptText: string, delay = 1500) => {
    setIsTyping(true);
    setTimeout(() => {
      setIsTyping(false);
      promptText.split('||').forEach((part, index) => {
        setTimeout(() => {
          let opts: string[] | undefined = undefined;
          let s_cards: string[] | undefined = undefined;

          if (step === 'language' && index === 0) {
            opts = ['🩺 Dermatology', '🩺 Pediatrics', '🩺 Orthopedics', '🩺 General Practice'];
          } else if (step === 'specialty' && index === 0) {
            opts = ['📅 Tomorrow', '📅 Day After Tomorrow', '📅 Monday next week'];
          } else if (step === 'date' && index === 0) {
            s_cards = ['10:00 AM', '11:30 AM', '02:00 PM', '04:30 PM'];
          }

          addMessage('bot', part, opts, s_cards);
        }, index * 800);
      });
    }, delay);
  };

  const handleLanguageSelect = (lang: string) => {
    setLanguage(lang);
    addMessage('patient', lang);
    setStep('specialty');
    
    let botMsg = '';
    if (lang === 'Hindi') {
      botMsg = '🤖 Pearl Health Clinic में आपका स्वागत है। आपके लिए किस विभाग में अपॉइंटमेंट बुक करें?';
    } else if (lang === 'Spanish') {
      botMsg = '🤖 Bienvenidos a Pearl Health Clinic. ¿Para qué especialidad le gustaría reservar cita?';
    } else {
      botMsg = '🤖 Excellent. What type of specialist appointment do you need today?';
    }
    
    simulateBotResponse(botMsg);
  };

  const handleSpecialtySelect = (spec: string) => {
    setSpecialty(spec);
    addMessage('patient', spec);
    setStep('date');
    
    let botMsg = '';
    if (language === 'Hindi') {
      botMsg = '📅 किस तारीख के लिए आप अपॉइंटमेंट लेना चाहते हैं? कृपया नीचे से एक दिन चुनें:';
    } else if (language === 'Spanish') {
      botMsg = '📅 ¿Para qué fecha le gustaría programar su cita?';
    } else {
      botMsg = '📅 Understood! We have active slots open. Which date works best for you?';
    }
    
    simulateBotResponse(botMsg);
  };

  const handleDateSelect = (dateStr: string) => {
    setSelectedDate(dateStr);
    addMessage('patient', dateStr);
    setStep('slot');
    
    let botMsg = '';
    if (language === 'Hindi') {
      botMsg = '🔍 डॉक्टर के पास कल निम्नलिखित समय उपलब्ध हैं। स्लॉट चुनने के लिए उस पर क्लिक करें:';
    } else if (language === 'Spanish') {
      botMsg = '🔍 Las siguientes horas están disponibles para esa fecha. Seleccione su franja horaria:';
    } else {
      botMsg = '🔍 Searching doctor schedule in real-time... || Here are available slots for ' + dateStr + ':';
    }
    
    simulateBotResponse(botMsg);
  };

  const handleSlotSelect = (slotStr: string) => {
    setSelectedSlot(slotStr);
    addMessage('patient', slotStr);
    setStep('details');
    
    let botMsg = '';
    if (language === 'Hindi') {
      botMsg = '👤 अपॉइंटमेंट को अंतिम रूप देने के लिए, कृपया नीचे अपना पूरा नाम और फोन नंबर दर्ज करें:';
    } else if (language === 'Spanish') {
      botMsg = '👤 Para completar su reserva, ingrese su nombre completo y número de móvil a continuación:';
    } else {
      botMsg = '👤 Almost done! I just need some quick details. Please fill in your name and phone details so we can lock this clinical slot:';
    }
    
    simulateBotResponse(botMsg, 800);
  };

  const handleConfirmSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!patientName || !patientPhone) return;

    addMessage('patient', `My Name: ${patientName}\nMy Phone: ${patientPhone}`);
    setStep('confirmed');
    
    // Add real-time dynamic appointment object to main dashboard context!
    const docNameMap: Record<string, string> = {
      'Dermatology': 'Dr. Sarah Jenkins',
      'Pediatrics': 'Dr. Clara Oswald',
      'Orthopedics': 'Dr. Marcus Vance',
      'General Practice': 'Dr. Amit Patel'
    };
    const mappedDoctor = docNameMap[specialty] || INITIAL_DOCTORS[0].name;

    const newApt: Appointment = {
      id: 'apt-sim-' + Math.floor(Math.random() * 10000),
      patientName,
      patientPhone,
      doctorName: mappedDoctor,
      date: selectedDate.includes('Tomorrow') ? '2026-06-11' : '2026-06-12',
      time: selectedSlot || '11:30 AM',
      status: 'Confirmed',
      language: language || 'English'
    };

    // Callback to App.tsx so Clinic Dashboard registers this appointment instantly!
    onNewAppointmentBooked(newApt);

    let botMsg = '';
    if (language === 'Hindi') {
      botMsg = `🎉 बधाई हो! आपका अपॉइंटमेंट सफलतापूर्वक बुक हो गया है।\n\n📌 मरीज: ${patientName}\n👨‍⚕️ डॉक्टर: ${mappedDoctor}\n📅 तारीख: ${newApt.date}\n⏰ समय: ${newApt.time}\n\nहमने आपके नंबर (${patientPhone}) पर व्हाट्सएप पुष्टिकरण और रिमाइंडर्स सेटअप कर दिए हैं। मिलते हैं!`;
    } else if (language === 'Spanish') {
      botMsg = `🎉 ¡Cita Confirmada con éxito!\n\n📌 Paciente: ${patientName}\n👨‍⚕️ Especialista: ${mappedDoctor}\n📅 Fecha: ${newApt.date}\n⏰ Hora: ${newApt.time}\n\nHemos programado recordatorios en su número (${patientPhone}). ¡Gracias!`;
    } else {
      botMsg = `🎉 Boom! Your Appointment is locked and confirmed.\n\n📌 Patient Name: ${patientName}\n👩‍⚕️ Specialist: ${mappedDoctor}\n📅 Date: ${newApt.date}\n⏰ Time: ${newApt.time}\n\nWe has integrated your booking into our clinic system. High-priority WhatsApp alerts are set up on ${patientPhone}. See you soon!`;
    }

    simulateBotResponse(botMsg, 1200);
  };

  const resetSimulator = () => {
    setStep('language');
    setLanguage('');
    setSpecialty('');
    setSelectedDate('');
    setSelectedSlot('');
    setPatientName('');
    setPatientPhone('');
    setMessages([
      {
        id: 'm1',
        sender: 'bot',
        text: '🤖 Hello! Welcome to Pearl Health Clinic booking assistant on WhatsApp. How can I help you today?',
        timestamp: 'Just now',
        options: ['Select Language / भाषा चुनें / Seleccionar Idioma']
      }
    ]);
  };

  // UI mappings based on current active simulated language
  const getDocNameFriendly = (spec: string) => {
    const docNameMap: Record<string, string> = {
      'Dermatology': 'Dr. Sarah Jenkins (Dermatology)',
      'Pediatrics': 'Dr. Clara Oswald (Pediatrics)',
      'Orthopedics': 'Dr. Marcus Vance (Orthopedics)',
      'General Practice': 'Dr. Amit Patel (General Physician)'
    };
    return docNameMap[spec] || spec;
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10" id="booking-demo-root">
      
      {/* Page Header */}
      <div className="text-center max-w-3xl mx-auto space-y-4 mb-10">
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-teal-50 border border-teal-100 text-teal-700 rounded-full text-xs font-semibold uppercase tracking-wider">
          <Sparkles className="w-4 h-4 text-teal-500" />
          <span>Live Booking Simulator</span>
        </div>
        <h1 className="font-display text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
          Experience the WhatsApp booking funnel
        </h1>
        <p className="text-slate-600 text-sm leading-relaxed">
          See firsthand what your patients experience. Click/tap options below to simulate how the WhatsApp bot guides patients, syncs clinical slots, and sends real reminders.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Left Side: Explanation and Backend telemetry panel (4 Columns) */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm space-y-5">
            <h3 className="font-display font-bold text-slate-900 text-lg flex items-center gap-2 pb-3 border-b border-slate-100">
              <span className="p-2 rounded-lg bg-sky-50 text-sky-600">⚙️</span>
              How does this work?
            </h3>
            
            <p className="text-slate-600 text-xs leading-relaxed">
              When a patient clicks your clinic’s custom link (or scans your front-desk WhatsApp QR code), a chat session triggers instantly on their mobile phone.
            </p>

            {/* Backstage logging simulation container */}
            <div className="bg-slate-950 font-mono text-[11px] text-sky-400 p-4 rounded-xl space-y-2 border border-slate-900">
              <span className="block text-slate-500 text-[9px] uppercase tracking-wider pb-1 border-b border-white/10 font-bold">
                📡 Sandbox Event Logs
              </span>
              <div className="space-y-1.5 pt-1.5 h-[170px] overflow-y-auto text-left">
                <p className="text-slate-400">⚡ Webhook initialized: whatsapp-inbound</p>
                {language && <p className="text-emerald-400">✔ Language preference set: <span className="text-white underline">{language}</span></p>}
                {specialty && <p className="text-emerald-400">✔ Category filtered: <span className="text-white font-bold">{specialty}</span></p>}
                {selectedDate && <p className="text-emerald-400">✔ Google Calendar scan query: <span className="text-white">{selectedDate}</span></p>}
                {selectedSlot && <p className="text-emerald-400">✔ Reserved slot in calendar state: <span className="text-white">{selectedSlot}</span></p>}
                {step === 'confirmed' && (
                  <>
                    <p className="text-yellow-400">⏳ WhatsApp Cloud API: Enqueued 24h reminders for {patientName}</p>
                    <p className="text-purple-400">ℹ Synced to Clinic Dashboard table successfully!</p>
                  </>
                )}
                <div className="text-[10px] text-slate-600 italic">Listening for user clicks...</div>
              </div>
            </div>

            {/* API Integration Hint block */}
            <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-100 text-left">
              <h4 className="text-emerald-950 font-bold text-xs flex items-center gap-1.5 mb-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                Production Deployment Architecture
              </h4>
              <p className="text-emerald-800 text-[11px] leading-relaxed">
                In production, the <code>Meta WhatsApp Cloud API</code> sends and receives webhook messages. An <code>Express + Prisma</code> backend parses incoming messages and runs <code>OpenAI GPT-4.1-mini</code> to extract intent, persisting bookings to <code>PostgreSQL (Supabase)</code> and updating your calendar instantly.
              </p>
            </div>
          </div>
          
          {step === 'confirmed' && (
            <div className="bg-teal-500 rounded-2xl p-6 text-white text-left space-y-4 shadow-lg shadow-teal-100 animate-fadeIn">
              <h4 className="font-display font-bold text-md flex items-center gap-2">
                <Check className="w-5 h-5 bg-white text-teal-600 rounded-full p-0.5" />
                Clinical Appointment Created!
              </h4>
              <p className="text-xs text-teal-50/90 leading-relaxed">
                We have added <strong>{patientName}</strong> successfully. Switch to the <strong>Clinic Dashboard</strong> tab to view this appointment instantly listed on tomorrow's roster!
              </p>
              <button 
                onClick={resetSimulator}
                className="w-full py-2 bg-white text-teal-800 font-bold rounded-lg text-xs hover:bg-teal-50 transition-colors"
              >
                Reset & Try Another Booking
              </button>
            </div>
          )}
        </div>

        {/* Right Side: Interactive Smart-phone Simulation (7 Columns) */}
        <div className="lg:col-span-7 flex justify-center">
          <div className="w-full max-w-[500px] bg-slate-900 rounded-[44px] p-4 shadow-xl border-4 border-slate-800 relative">
            
            {/* Phone notch speaker */}
            <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-32 h-6 bg-slate-900 rounded-b-2xl z-20 flex items-center justify-center">
              <div className="w-16 h-1 bg-slate-700 rounded-full mb-1"></div>
            </div>

            <div className="bg-[#efeae2] rounded-[34px] overflow-hidden aspect-[9/14] flex flex-col relative z-10 border border-slate-950">
              
              {/* WhatsApp Live Simulator Header */}
              <div className="bg-emerald-700 text-white pt-6 pb-3.5 px-4 flex items-center justify-between shadow-md">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-emerald-500 text-white flex items-center justify-center font-bold text-lg shadow-xs">
                    🩺
                  </div>
                  <div>
                    <h4 className="font-semibold text-sm tracking-tight text-white m-0">Pearl Clinic Booking</h4>
                    <span className="text-[10px] text-emerald-200 block text-left">
                      Typically replies instantly
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={resetSimulator}
                    className="p-1 rounded-full hover:bg-emerald-600 text-emerald-100 transition-colors"
                    title="Restart Demo"
                    id="reset-demo-simulator-btn"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                  <span className="w-3 h-3 rounded-full bg-emerald-500"></span>
                </div>
              </div>

              {/* Chat Timeline (Scrollable) */}
              <div className="flex-1 p-4 overflow-y-auto space-y-4 whatsapp-chat-bg max-h-[460px] min-h-[380px]">
                {messages.map((msg) => (
                  <div key={msg.id} className="space-y-2">
                    <div className={`flex ${msg.sender === 'bot' ? 'justify-start' : 'justify-end'}`}>
                      <div className={`max-w-[85%] rounded-2xl p-3.5 shadow-xs text-xs relative ${
                        msg.sender === 'bot'
                          ? 'bg-white text-slate-800 rounded-tl-none text-left'
                          : 'bg-emerald-200 text-slate-800 rounded-tr-none text-left'
                      }`}>
                        <p className="whitespace-pre-line leading-relaxed font-sans">{msg.text}</p>
                        <span className="text-[9px] text-slate-400 self-end mt-1.5 block font-mono text-right">{msg.timestamp}</span>
                      </div>
                    </div>

                    {/* Interactive inline options */}
                    {msg.options && msg.options.length > 0 && step === 'language' && (
                      <div className="grid grid-cols-1 gap-2 pl-2 animate-fadeIn">
                        <button 
                          onClick={() => handleLanguageSelect('English')}
                          id="lang-opt-en"
                          className="px-4 py-2.5 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-sky-700 shadow-xs text-left cursor-pointer transition-transform duration-150 hover:-translate-y-0.5"
                        >
                          🇺🇸 Continue in English
                        </button>
                        <button 
                          onClick={() => handleLanguageSelect('Hindi')}
                          id="lang-opt-hi"
                          className="px-4 py-2.5 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-sky-700 shadow-xs text-left cursor-pointer transition-transform duration-150 hover:-translate-y-0.5"
                        >
                          🇮🇳 हिंदी में जारी रखें
                        </button>
                        <button 
                          onClick={() => handleLanguageSelect('Spanish')}
                          id="lang-opt-es"
                          className="px-4 py-2.5 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-sky-700 shadow-xs text-left cursor-pointer transition-transform duration-150 hover:-translate-y-0.5"
                        >
                          🇪🇸 Continuar en Español
                        </button>
                      </div>
                    )}

                    {/* Interactive Specialty choices */}
                    {msg.options && msg.options.length > 0 && step === 'specialty' && (
                      <div className="grid grid-cols-2 gap-2 pl-2 animate-fadeIn">
                        {msg.options.map((opt) => (
                          <button
                            key={opt}
                            onClick={() => handleSpecialtySelect(opt.replace('🩺 ', ''))}
                            className="px-3 py-2 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-sky-700 shadow-xs text-left cursor-pointer"
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Interactive Date choices */}
                    {msg.options && msg.options.length > 0 && step === 'date' && (
                      <div className="flex flex-col gap-2 pl-2 animate-fadeIn">
                        {msg.options.map((opt) => (
                          <button
                            key={opt}
                            onClick={() => handleDateSelect(opt.replace('📅 ', ''))}
                            className="px-4 py-2.5 bg-white hover:bg-sky-50 border border-slate-200 rounded-xl text-xs font-bold text-sky-700 text-left cursor-pointer flex justify-between items-center"
                          >
                            <span>{opt}</span>
                            <ChevronRight className="w-4 h-4 text-sky-400" />
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Interactive Slot-cards */}
                    {msg.showSlots && msg.showSlots.length > 0 && step === 'slot' && (
                      <div className="p-1">
                        <div className="text-[10px] text-slate-500 font-bold mb-1.5 uppercase font-mono text-left">Select Available Time:</div>
                        <div className="grid grid-cols-2 gap-2 animate-fadeIn">
                          {msg.showSlots.map((slot) => (
                            <button
                              key={slot}
                              onClick={() => handleSlotSelect(slot)}
                              className="px-4 py-2.5 bg-sky-600 hover:bg-sky-700 font-bold text-white rounded-xl text-xs text-center cursor-pointer flex items-center justify-center gap-1 shadow-sm"
                            >
                              <Clock className="w-3.5 h-3.5" />
                              {slot}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {isTyping && (
                  <div className="flex justify-start items-center gap-1 animate-pulse" id="bot-typing-indicator">
                    <div className="bg-white/80 rounded-2xl rounded-tl-none py-2 px-3 text-xs text-slate-500 italic shadow-2xs flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-emerald-600 animate-bounce"></span>
                      <span className="w-2 h-2 rounded-full bg-emerald-600 animate-bounce [animation-delay:0.2s]"></span>
                      <span className="w-2 h-2 rounded-full bg-emerald-600 animate-bounce [animation-delay:0.4s]"></span>
                    </div>
                  </div>
                )}
                
                {/* Scroll Anchor */}
                <div ref={chatEndRef} />
              </div>

              {/* Patient Details Form - Renders when capturing name and phone */}
              {step === 'details' && (
                <div className="bg-white border-t border-slate-200 p-4 shrink-0 animate-fadeIn text-left">
                  <span className="block text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider mb-2">
                    Enter Patient Info
                  </span>
                  <form onSubmit={handleConfirmSubmit} className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] text-slate-500 font-medium mb-1">Full Name</label>
                        <input 
                          type="text" 
                          required
                          value={patientName}
                          onChange={(e) => setPatientName(e.target.value)}
                          placeholder="e.g. John Doe"
                          className="w-full text-xs px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:border-sky-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-500 font-medium mb-1">WhatsApp Mobile</label>
                        <input 
                          type="tel" 
                          required
                          value={patientPhone}
                          onChange={(e) => setPatientPhone(e.target.value)}
                          placeholder="+91 9999999999"
                          className="w-full text-xs px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:border-sky-500"
                        />
                      </div>
                    </div>
                    <button
                      type="submit"
                      className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-emerald-50 cursor-pointer"
                    >
                      Confirm and Schedule Session
                    </button>
                  </form>
                </div>
              )}

              {/* Bot typing bar (disabled inputs during click funnel) */}
              {step !== 'details' && (
                <div className="bg-white/95 p-3.5 border-t border-slate-100 flex items-center gap-2">
                  <div className="flex-1 bg-slate-50 rounded-full px-4.5 py-2 border border-slate-200 text-xs text-slate-400 text-left font-mono">
                    {step === 'confirmed' ? 'Booking successfully created' : 'Choose option in screen...'}
                  </div>
                  <div className="w-8.5 h-8.5 rounded-full bg-emerald-600 flex items-center justify-center text-white cursor-pointer active:scale-95 transition-transform text-sm">
                    🎤
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
