import {
  CheckCircle2,
  AlertTriangle,
  Phone,
  CreditCard,
  Smartphone,
  UserCircle,
  ArrowLeft,
} from 'lucide-react';

import { BRAND } from '../brand';
import type { PageType } from '../types';

// What a clinic needs before it connects WhatsApp, and what goes wrong.
//
// Written after connecting a real number end to end for the first time. Every
// warning here is something that actually happened during that hour, in the
// order it bit us — not a transcription of everything Meta documents. The
// billing one in particular is invisible: the dashboard shows every light green
// and Meta silently refuses each message.
//
// Public on purpose. A clinic should be able to read this BEFORE booking the
// ten minutes, and the desk should be able to send the link to whoever owns the
// clinic's phone and card.

const NEEDED = [
  {
    icon: UserCircle,
    title: 'A Facebook account you own',
    body:
      'Meta only creates a WhatsApp Business account underneath a Facebook account, so you sign in with one during setup. Any personal Facebook works — a Facebook Page is not required.',
    note: 'Use the clinic owner’s account, not a staff member’s — whoever should still have access in two years.',
  },
  {
    icon: Smartphone,
    title: 'A phone number that is not on WhatsApp',
    body:
      'Any number works — including your reception landline. It must not be signed in to WhatsApp or WhatsApp Business anywhere, because Meta will not let one number do both.',
    note: 'Already on WhatsApp? Open that app → Settings → Account → Delete my account, then wait a few minutes.',
  },
  {
    icon: Phone,
    title: 'Someone at that phone during setup',
    body:
      'Meta sends a code to confirm the number is yours. Choose “Verify by phone call” — the phone rings and a voice reads the code out.',
    note: 'A landline never receives SMS, so choosing SMS is the usual reason verification fails.',
  },
  {
    icon: CreditCard,
    title: 'A card or UPI for Meta',
    body:
      'WhatsApp charges for some messages, so Meta needs a payment method on your account before it will send anything. Set the country to India and add a card.',
    note: 'Skip this and everything looks connected while every message is quietly refused. It is the easiest step to miss.',
  },
];

const STEPS = [
  {
    title: 'Open Connect WhatsApp',
    body: 'In your clinic dashboard, go to Settings and press Connect WhatsApp. A Meta window opens over the page.',
  },
  {
    title: 'Sign in with your own Facebook',
    body:
      'Your clinic’s WhatsApp account is created under your Facebook, not ours. Use the clinic owner’s account — whoever should still have access in two years.',
  },
  {
    title: 'Create your business, not someone else’s',
    body:
      'When Meta asks for a business portfolio, create a new one in your clinic’s name. Pick an existing one belonging to someone else and patients see that name on WhatsApp instead of yours.',
  },
  {
    title: 'Add your number and take the call',
    body: 'Enter the number, choose “Verify by phone call”, answer it, and type in the code you hear.',
  },
  {
    title: 'Add the payment method',
    body:
      'On Meta, set the country to India and add a card. Until this is done, messages will not send even though the connection is complete.',
  },
];

const TROUBLE = [
  {
    q: 'Everything says connected, but no messages arrive',
    a: 'Almost always the payment method. Your dashboard shows a red “Billing — not set up” line with a button that opens the right page on Meta.',
  },
  {
    q: 'The verification code never comes',
    a: 'If you chose SMS on a landline, it cannot arrive. Start again and choose “Verify by phone call”.',
  },
  {
    q: 'Meta says the number is already in use',
    a: 'That number still has a WhatsApp or WhatsApp Business account. Delete it from that app first — the two cannot exist at once.',
  },
  {
    q: 'Patients see the wrong business name',
    a: 'The wrong business portfolio was chosen during setup. Press “Reconnect a different number” in Settings and create your own portfolio this time.',
  },
];

export default function WhatsAppSetupGuide({
  setCurrentPage,
}: {
  setCurrentPage: (p: PageType) => void;
}) {
  return (
    <div className="min-h-screen bg-[#fafcff]">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        <button
          onClick={() => setCurrentPage('landing')}
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 mb-8 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>

        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-slate-400">
          Connecting {BRAND.book.plain}
        </p>
        <h1 className="font-display text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight mt-3 text-balance">
          How your clinic&rsquo;s WhatsApp gets connected
        </h1>
        <p className="text-slate-600 mt-4 leading-relaxed max-w-2xl">
          Your clinic messages patients from its <strong>own</strong> WhatsApp number, under your
          own account &mdash; not a shared one. It takes about ten minutes, once. Read this first
          and it takes ten; skip it and it usually takes a day.
        </p>

        {/* The whole answer in one line, for the person who will not read the
            rest — which is most of them. The detail below is for when one of
            these four turns out to be the thing they do not have. */}
        <p className="mt-6 text-sm text-slate-700 bg-white border border-slate-200 rounded-xl px-4 py-3 leading-relaxed">
          <strong className="text-slate-900">In short:</strong> a Facebook account, a phone number
          that is not already on WhatsApp, someone near that phone to take a verification call, and
          a card on Meta.
        </p>

        <h2 className="font-display text-xl font-extrabold text-slate-900 mt-12 mb-1">
          Four things to have ready
        </h2>
        <p className="text-sm text-slate-500 mb-6">
          Every one of these stops the setup if it is missing.
        </p>

        <div className="space-y-4">
          {NEEDED.map((n) => {
            const Icon = n.icon;
            return (
              <div key={n.title} className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6">
                <div className="flex items-start gap-4">
                  <span className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
                    <Icon className="w-5 h-5" />
                  </span>
                  <div className="min-w-0">
                    <h3 className="font-display font-bold text-slate-900">{n.title}</h3>
                    <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">{n.body}</p>
                    <p className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mt-3">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span>{n.note}</span>
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <h2 className="font-display text-xl font-extrabold text-slate-900 mt-12 mb-6">
          What happens, in order
        </h2>
        <ol className="space-y-4">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex items-start gap-4">
              <span className="w-8 h-8 rounded-full bg-slate-900 text-white font-mono text-xs font-bold flex items-center justify-center shrink-0">
                {i + 1}
              </span>
              <div className="min-w-0 pt-1">
                <h3 className="font-bold text-slate-900 text-[0.95rem]">{s.title}</h3>
                <p className="text-sm text-slate-600 mt-1 leading-relaxed">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>

        <h2 className="font-display text-xl font-extrabold text-slate-900 mt-12 mb-1">
          If something does not work
        </h2>
        <p className="text-sm text-slate-500 mb-6">These four cover almost everything we have seen.</p>
        <div className="divide-y divide-slate-200 border border-slate-200 rounded-2xl bg-white">
          {TROUBLE.map((t) => (
            <div key={t.q} className="p-5">
              <h3 className="font-bold text-slate-900 text-[0.95rem]">{t.q}</h3>
              <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">{t.a}</p>
            </div>
          ))}
        </div>

        <div className="mt-12 p-6 bg-emerald-50 border border-emerald-200 rounded-2xl">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
            <div>
              <h3 className="font-display font-bold text-emerald-900">Once it is done, it stays done</h3>
              <p className="text-sm text-emerald-800 mt-1.5 leading-relaxed">
                The number is yours and stays with your clinic. Bookings, reminders and
                confirmations go out on it from then on, and your dashboard shows the number, the
                webhook and your message templates so you can see it working.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
