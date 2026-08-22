import type { ReactNode } from 'react';
import { MessageCircle, Mic, CheckCheck, ShieldCheck, Languages, FileText, ArrowRight } from 'lucide-react';

import { BRAND } from '../brand';
import { PageType } from '../types';
import AnvayaMark from './AnvayaMark';

interface AnvayaSiteProps {
  setCurrentPage: (page: PageType) => void;
}

// The site a clinic owner reads before deciding.
//
// It replaces two separate product landing pages that each sold half the thing
// to the same buyer. One person signs the cheque — the owner — and they are not
// buying "a booking tool" and "a scribe", they are buying one fewer broken
// handoff between the front desk and the consulting room.
//
// So it is written from the clinic's day, not from a feature list.
export default function AnvayaSite({ setCurrentPage }: AnvayaSiteProps) {
  return (
    <div className="bg-anvaya-paper text-anvaya-ink" style={{ fontFamily: 'var(--font-body)' }}>
      <Nav setCurrentPage={setCurrentPage} />
      <Hero setCurrentPage={setCurrentPage} />
      <Chain />
      <Products />
      <WhyWhatsApp />
      <Trust />
      <Close setCurrentPage={setCurrentPage} />
      <Foot />
    </div>
  );
}

/* ── nav ──────────────────────────────────────────────────────────────── */

function Nav({ setCurrentPage }: AnvayaSiteProps) {
  return (
    <header className="sticky top-0 z-30 backdrop-blur bg-anvaya-paper/85 border-b border-anvaya-rule">
      <div className="max-w-6xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <AnvayaMark size={26} />
          <span
            className="text-[1.35rem] leading-none text-anvaya-indigo"
            style={{ fontFamily: 'var(--font-brand)', fontWeight: 500, letterSpacing: '-0.02em' }}
          >
            {BRAND.name}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCurrentPage('login')}
            className="px-3.5 py-2 text-sm font-semibold text-anvaya-indigo hover:bg-anvaya-sand rounded-lg transition"
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => setCurrentPage('signup')}
            className="px-4 py-2 text-sm font-semibold text-white bg-anvaya-indigo hover:bg-anvaya-indigo-2 rounded-lg transition"
          >
            Start free
          </button>
        </div>
      </div>
    </header>
  );
}

/* ── hero ─────────────────────────────────────────────────────────────── */

function Hero({ setCurrentPage }: AnvayaSiteProps) {
  return (
    <section className="max-w-6xl mx-auto px-5 sm:px-8 pt-16 pb-14 sm:pt-24 sm:pb-20">
      <div className="grid lg:grid-cols-[1.15fr_1fr] gap-12 lg:gap-16 items-center">
        <div>
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-anvaya-amber mb-5">
            {BRAND.devanagari} · {BRAND.meaning}
          </p>
          <h1
            className="text-[2.6rem] sm:text-[3.6rem] leading-[1.02] tracking-[-0.03em] text-anvaya-ink text-balance"
            style={{ fontFamily: 'var(--font-brand)', fontWeight: 500 }}
          >
            Your clinic's day, without the gaps.
          </h1>
          <p className="mt-6 text-lg text-slate-600 max-w-xl leading-relaxed">
            The patient books on WhatsApp. Your desk confirms. The doctor talks, and the
            note writes itself. One thread, from the first message to the prescription —
            with nothing falling into a register nobody reads.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => setCurrentPage('signup')}
              className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-anvaya-indigo text-white
                         font-semibold hover:bg-anvaya-indigo-2 transition shadow-sm"
            >
              Start free <ArrowRight className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setCurrentPage('demo')}
              className="px-6 py-3.5 rounded-xl border border-anvaya-rule bg-white text-anvaya-ink
                         font-semibold hover:border-anvaya-indigo-3 transition"
            >
              See it work
            </button>
          </div>
          <p className="mt-5 text-sm text-slate-500">
            No app for your patients to install. Works on the WhatsApp they already have.
          </p>
        </div>

        <ChatPreview />
      </div>
    </section>
  );
}

// A real exchange, not a screenshot. It is the whole product in nine lines, and
// it answers the only question a clinic actually has: what does my patient see?
function ChatPreview() {
  const lines: Array<{ from: 'p' | 'c'; text: string }> = [
    { from: 'p', text: 'Doctor se milna hai kal' },
    { from: 'c', text: 'Namaste 🙏 Kal Dr. Ruchi available hain — 11:30 AM ya 4:00 PM?' },
    { from: 'p', text: '4 baje' },
    { from: 'c', text: 'Ho gaya. Kal 4:00 PM, Dr. Ruchi. Reminder subah bhej denge.' },
    { from: 'p', text: '🎤 voice note' },
    { from: 'c', text: 'Aapki parchi taiyaar hai 📄 — Dr. Ruchi ne abhi sign ki hai.' },
  ];
  return (
    <div className="rounded-2xl border border-anvaya-rule bg-white shadow-sm overflow-hidden">
      <div className="bg-anvaya-indigo px-4 py-3 flex items-center gap-2.5">
        <AnvayaMark size={20} variant="onDark" />
        <span className="text-white text-sm font-semibold">Sunrise Clinic</span>
        <span className="ml-auto text-[10px] uppercase tracking-widest text-white/50">WhatsApp</span>
      </div>
      <div className="whatsapp-chat-bg p-4 space-y-2.5">
        {lines.map((l, i) => (
          <div key={i} className={l.from === 'p' ? 'flex justify-end' : 'flex justify-start'}>
            <div
              className={
                'max-w-[85%] px-3 py-2 rounded-xl text-[13.5px] leading-snug shadow-sm ' +
                (l.from === 'p' ? 'bg-[#DCF8C6] text-slate-800' : 'bg-white text-slate-700')
              }
            >
              {l.text}
              {l.from === 'p' && <CheckCheck className="inline w-3.5 h-3.5 ml-1.5 text-sky-500 align-[-2px]" />}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── the chain ────────────────────────────────────────────────────────── */

function Chain() {
  const steps = [
    {
      icon: <MessageCircle className="w-5 h-5" />,
      when: 'The patient messages',
      what: 'Any hour, any language. They book, move or cancel without anyone picking up a phone.',
    },
    {
      icon: <CheckCheck className="w-5 h-5" />,
      when: 'Your desk confirms',
      what: 'Every request arrives as a booking to approve — not a note on a pad that someone has to remember to act on.',
    },
    {
      icon: <Mic className="w-5 h-5" />,
      when: 'The doctor talks',
      what: 'The consultation is recorded and the note drafts itself. The doctor edits it and approves it.',
    },
    {
      icon: <FileText className="w-5 h-5" />,
      when: 'The patient gets it back',
      what: 'Prescription on the same WhatsApp thread they started on, with medicine reminders that follow.',
    },
  ];
  return (
    <section className="border-y border-anvaya-rule bg-white">
      <div className="max-w-6xl mx-auto px-5 sm:px-8 py-16 sm:py-20">
        <h2
          className="text-[1.9rem] sm:text-[2.3rem] tracking-[-0.02em] text-balance max-w-2xl"
          style={{ fontFamily: 'var(--font-brand)', fontWeight: 500 }}
        >
          A visit is a chain. Most clinics lose it in the middle.
        </h2>
        <p className="mt-4 text-slate-600 max-w-2xl leading-relaxed">
          The appointment is in a register the doctor never sees. The note is on paper that
          reaches nobody. The prescription is a photo on someone's phone. Every step is real;
          none of them are joined. That joining is the whole product — and the name.
        </p>

        <ol className="mt-12 grid sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-9">
          {steps.map((s, i) => (
            <li key={s.when} className="relative">
              <div className="flex items-center gap-3 mb-3">
                <span className="w-9 h-9 rounded-lg bg-anvaya-sand text-anvaya-indigo flex items-center justify-center">
                  {s.icon}
                </span>
                <span className="font-mono text-[11px] text-slate-400 tabular-nums">
                  {String(i + 1).padStart(2, '0')}
                </span>
              </div>
              <p className="font-semibold text-anvaya-ink mb-1.5">{s.when}</p>
              <p className="text-sm text-slate-600 leading-relaxed">{s.what}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ── the two products ─────────────────────────────────────────────────── */

function Products() {
  return (
    <section className="max-w-6xl mx-auto px-5 sm:px-8 py-16 sm:py-20">
      <h2
        className="text-[1.9rem] sm:text-[2.3rem] tracking-[-0.02em] text-balance max-w-2xl"
        style={{ fontFamily: 'var(--font-brand)', fontWeight: 500 }}
      >
        Two sides. One login, one patient record.
      </h2>

      <div className="mt-10 grid md:grid-cols-2 gap-5">
        <Product
          who="For the clinic"
          name={BRAND.desk}
          accent="indigo"
          lead="Everything the front desk does, minus the phone calls."
          points={[
            'Bookings, changes and cancellations over WhatsApp — 24 hours',
            'Reminders that go out on their own, in the patient’s language',
            'A waitlist that offers a freed slot to the next patient automatically',
            'Every patient, visit and message in one record',
          ]}
        />
        <Product
          who="For the doctor"
          name={BRAND.scribe}
          accent="marigold"
          lead="Talk to your patient. The paperwork keeps up on its own."
          points={[
            'Records the consultation and drafts the clinical note',
            'Prescription written from the same conversation',
            'Works in Hindi, English and the mix people actually speak',
            'Nothing is sent until the doctor has read it and approved it',
          ]}
        />
      </div>
    </section>
  );
}

function Product({
  who,
  name,
  lead,
  points,
  accent,
}: {
  who: string;
  name: string;
  lead: string;
  points: string[];
  accent: 'indigo' | 'marigold';
}) {
  const bar = accent === 'indigo' ? 'bg-anvaya-indigo' : 'bg-anvaya-marigold';
  const label = accent === 'indigo' ? 'text-anvaya-indigo-3' : 'text-anvaya-amber';
  return (
    <div className="rounded-2xl border border-anvaya-rule bg-white overflow-hidden">
      <div className={`h-1 ${bar}`} />
      <div className="p-7">
        <p className={`text-[0.68rem] font-semibold uppercase tracking-[0.14em] ${label} mb-2`}>{who}</p>
        <p
          className="text-[1.55rem] tracking-[-0.02em] text-anvaya-ink mb-2"
          style={{ fontFamily: 'var(--font-brand)', fontWeight: 500 }}
        >
          {name}
        </p>
        <p className="text-slate-600 mb-6">{lead}</p>
        <ul className="space-y-2.5">
          {points.map((p) => (
            <li key={p} className="flex gap-2.5 text-[0.94rem] text-slate-700 leading-relaxed">
              <span className={`mt-2 w-1.5 h-1.5 rounded-full shrink-0 ${bar}`} />
              {p}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* ── why whatsapp ─────────────────────────────────────────────────────── */

function WhyWhatsApp() {
  return (
    <section className="border-y border-anvaya-rule bg-anvaya-sand">
      <div className="max-w-6xl mx-auto px-5 sm:px-8 py-16 sm:py-20 grid lg:grid-cols-2 gap-12 items-center">
        <div>
          <h2
            className="text-[1.9rem] sm:text-[2.3rem] tracking-[-0.02em] text-balance"
            style={{ fontFamily: 'var(--font-brand)', fontWeight: 500 }}
          >
            Your patients will not download an app.
          </h2>
          <p className="mt-4 text-slate-700 leading-relaxed">
            They will not remember a password either, and they will not use a portal.
            They will send a WhatsApp message, because that is what they already do all
            day. So the patient side of Anvaya is only WhatsApp — no install, no account,
            no login, nothing to teach.
          </p>
          <p className="mt-4 text-slate-700 leading-relaxed">
            Which also means the clinic gets the one thing a booking system usually fails
            at: patients who actually use it.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <Small icon={<Languages className="w-5 h-5" />} title="Their own language" body="Hindi, English, or the mix people speak in real life. Voice notes work too." />
          <Small icon={<MessageCircle className="w-5 h-5" />} title="No app, no password" body="Nothing to install and nothing to forget. It is the thread they already have." />
        </div>
      </div>
    </section>
  );
}

function Small({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return (
    <div className="rounded-xl bg-white border border-anvaya-rule p-5">
      <span className="w-9 h-9 rounded-lg bg-anvaya-sand text-anvaya-indigo flex items-center justify-center mb-3">
        {icon}
      </span>
      <p className="font-semibold text-anvaya-ink mb-1">{title}</p>
      <p className="text-sm text-slate-600 leading-relaxed">{body}</p>
    </div>
  );
}

/* ── trust ────────────────────────────────────────────────────────────── */

function Trust() {
  return (
    <section className="max-w-6xl mx-auto px-5 sm:px-8 py-16 sm:py-20">
      <h2
        className="text-[1.9rem] sm:text-[2.3rem] tracking-[-0.02em] text-balance max-w-2xl"
        style={{ fontFamily: 'var(--font-brand)', fontWeight: 500 }}
      >
        The AI drafts. The doctor decides. Always.
      </h2>
      <p className="mt-4 text-slate-600 max-w-2xl leading-relaxed">
        This is not a policy we intend to follow — it is built so it cannot be
        skipped. No prescription reaches a patient until a doctor has opened it, read it
        and approved it. There is no override, and no role that can send on the doctor's
        behalf.
      </p>

      <div className="mt-10 grid sm:grid-cols-3 gap-4">
        <Small
          icon={<ShieldCheck className="w-5 h-5" />}
          title="Approval is a gate"
          body="Enforced on the server for every request, not hidden behind a button in the app."
        />
        <Small
          icon={<FileText className="w-5 h-5" />}
          title="Every action recorded"
          body="Who opened which patient, when, and what changed — an append-only trail."
        />
        <Small
          icon={<Languages className="w-5 h-5" />}
          title="Data stays in India"
          body="Patient records are held on Indian infrastructure, ready for ABDM."
        />
      </div>
    </section>
  );
}

/* ── close ────────────────────────────────────────────────────────────── */

function Close({ setCurrentPage }: AnvayaSiteProps) {
  return (
    <section className="bg-anvaya-indigo">
      <div className="max-w-3xl mx-auto px-5 sm:px-8 py-20 text-center">
        <div className="flex justify-center mb-6">
          <AnvayaMark size={40} variant="onDark" />
        </div>
        <h2
          className="text-[2rem] sm:text-[2.5rem] leading-tight tracking-[-0.025em] text-white text-balance"
          style={{ fontFamily: 'var(--font-brand)', fontWeight: 500 }}
        >
          Set it up this week. Not this quarter.
        </h2>
        <p className="mt-5 text-white/70 max-w-xl mx-auto leading-relaxed">
          Add your clinic, add your doctors, and put your WhatsApp number in. Patients can
          book the same day. Nothing to install at your end, and nothing at theirs.
        </p>
        <div className="mt-9 flex flex-wrap gap-3 justify-center">
          <button
            type="button"
            onClick={() => setCurrentPage('signup')}
            className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl bg-anvaya-marigold text-anvaya-ink
                       font-semibold hover:bg-white transition"
          >
            Start free <ArrowRight className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setCurrentPage('login')}
            className="px-7 py-3.5 rounded-xl border border-white/25 text-white font-semibold hover:bg-white/10 transition"
          >
            Sign in
          </button>
        </div>
      </div>
    </section>
  );
}

function Foot() {
  return (
    <footer className="bg-anvaya-paper border-t border-anvaya-rule">
      <div className="max-w-6xl mx-auto px-5 sm:px-8 py-10 flex flex-wrap items-center gap-4 justify-between">
        <div className="flex items-center gap-2.5">
          <AnvayaMark size={20} />
          <span className="text-sm text-slate-500">
            <span style={{ fontFamily: 'var(--font-brand)' }} className="text-anvaya-indigo">
              {BRAND.name}
            </span>{' '}
            {BRAND.devanagari} — {BRAND.meaning}
          </span>
        </div>
        <p className="text-xs text-slate-400">
          © {new Date().getFullYear()} {BRAND.company}. Patient data held in India.
        </p>
      </div>
    </footer>
  );
}
