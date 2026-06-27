import React, { useState } from 'react';
import { PartyPopper, ArrowRight, MessageCircle, LayoutDashboard } from 'lucide-react';

import ConnectWhatsApp from './ConnectWhatsApp';

interface Props {
  clinicName: string;
  ownerName?: string;
  onContinue: () => void;
}

// First-run screen after email verification. Centerpiece is the one-click
// Connect WhatsApp step; everything else (doctors, schedules, billing) lives in
// the dashboard, so this stays focused and non-technical.
export default function WelcomeScreen({ clinicName, ownerName, onContinue }: Props) {
  const [connected, setConnected] = useState(false);

  return (
    <div className="max-w-2xl mx-auto px-4 py-14" id="welcome-screen">
      <div className="text-center mb-8">
        <div className="w-16 h-16 bg-sky-100 text-sky-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <PartyPopper className="w-8 h-8" />
        </div>
        <h1 className="font-display text-3xl font-extrabold text-slate-900">
          Welcome{ownerName ? `, ${ownerName.split(' ')[0]}` : ''}! 🎉
        </h1>
        <p className="text-slate-500 text-sm mt-2 max-w-lg mx-auto">
          <span className="font-semibold text-slate-700">{clinicName}</span> is ready. One last step to go live —
          connect your WhatsApp so patients can start booking.
        </p>
      </div>

      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3 text-slate-400 text-xs font-bold uppercase tracking-wider">
          <MessageCircle className="w-4 h-4" /> Step 1 · Connect WhatsApp
        </div>
        <ConnectWhatsApp onConnected={() => setConnected(true)} />
      </div>

      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-slate-100">
        <p className="text-xs text-slate-400">
          You can manage doctors, schedules and settings from your dashboard anytime.
        </p>
        <button
          onClick={onContinue}
          className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold cursor-pointer ${
            connected ? 'bg-sky-600 hover:bg-sky-700 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
          }`}
        >
          <LayoutDashboard className="w-4 h-4" />
          {connected ? 'Continue to Dashboard' : 'Skip for now'}
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
