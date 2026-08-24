import { useEffect, useState, type ReactNode } from 'react';
import { ShieldCheck, FileText, CircleDot, ArrowRight } from 'lucide-react';

import { BRAND } from '../brand';
import AnvayaLogo from './AnvayaLogo';
// Lifted from the two product sites, which no longer have pages of their own.
import PatientAsksSection from './platform/PatientAsksSection';
import ClinicBookShowcase from './platform/ClinicBookShowcase';
import { HowItWorks } from './novascribe/v2/NovaProcess';
import { LiveDemo, RealReport } from './novascribe/v2/NovaDemo';
import NovaLanguages from './novascribe/v2/NovaLanguages';

interface AnvayaHomeProps {
  /** Open अन्वय Book — sign-in for a signed-out visitor. */
  onOpenBook: () => void;
  /** Open अन्वय Scribe — same. */
  onOpenScribe: () => void;
  /** Start a trial. This is the ONLY page that offers one. */
  onStartTrial: () => void;
  onSignIn: () => void;
}

// The platform's front door: what Anvaya is, and the two products that sit on
// it. The product sites are unchanged and still live at /clinicbook and
// /novascribe — this page is what now stands in front of them.
//
// It is written from the clinic's day rather than from a feature list, because
// the person reading it is the owner, and they are not buying "a booking tool"
// and "a scribe" — they are buying one fewer broken handoff between the front
// desk and the consulting room.
export default function AnvayaHome({
  onOpenBook,
  onOpenScribe,
  onStartTrial,
  onSignIn,
}: AnvayaHomeProps) {
  return (
    <div className="bg-white text-anvaya-ink">
      <Hero onStartTrial={onStartTrial} onOpenBook={onOpenBook} onOpenScribe={onOpenScribe} />
      <Chain />
      <Products openBook={onOpenBook} openScribe={onOpenScribe} />

      {/* The two product sites used to live at their own URLs and each opened
          with its own pitch — so a visitor who had just read this page and
          clicked "Book" was handed a second marketing page instead of a way in.
          Everything worth reading from both is now here, in one scroll, and the
          product buttons go straight to sign-in. */}
      <ProductSection
        id="book"
        who="For the clinic"
        cut="book"
        tint="text-anvaya-blue"
        onOpen={onOpenBook}
        label={BRAND.book.plain}
      >
        <PatientAsksSection />
        <ClinicBookShowcase />
      </ProductSection>

      <ProductSection
        id="scribe"
        who="For the doctor"
        cut="scribe"
        tint="text-anvaya-green"
        onOpen={onOpenScribe}
        label={BRAND.scribe.plain}
      >
        <HowItWorks />
        <LiveDemo />
        <NovaLanguages />
        <RealReport />
      </ProductSection>

      <WhereTheAiSits />
      <Trust />
      <Close onStartTrial={onStartTrial} onSignIn={onSignIn} />
    </div>
  );
}

/**
 * One product's whole story, under a heading that says whose it is.
 *
 * These blocks came from the two separate product sites. Dropped in without a
 * frame they read as unrelated slabs — the reader has no way to tell where the
 * clinic's story ends and the doctor's begins. The heading and the closing
 * button are what turn a pile of sections back into a chapter.
 */
function ProductSection({
  id,
  who,
  cut,
  tint,
  onOpen,
  label,
  children,
}: {
  id: string;
  who: string;
  cut: 'book' | 'scribe';
  tint: string;
  onOpen: () => void;
  label: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="border-t border-anvaya-rule">
      <div className="max-w-6xl mx-auto px-5 sm:px-8 pt-20 pb-2 text-center">
        <p className={`text-[11px] font-bold uppercase tracking-[0.19em] mb-5 ${tint}`}>{who}</p>
        <div className="flex justify-center">
          <AnvayaLogo height={44} cut={cut} />
        </div>
      </div>
      {children}
      <div className="max-w-6xl mx-auto px-5 sm:px-8 pb-20 text-center">
        <button type="button" onClick={onOpen} className={BTN_FILL}>
          Sign in to {label} <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </section>
  );
}

/* ── hero ─────────────────────────────────────────────────────────────── */

function Hero({
  onStartTrial,
  onOpenBook,
  onOpenScribe,
}: Pick<AnvayaHomeProps, 'onStartTrial' | 'onOpenBook' | 'onOpenScribe'>) {
  return (
    <section className="relative overflow-hidden px-5 sm:px-8 pt-16 pb-20 text-center">
      {/* A soft wash behind the mark, so it sits IN the page rather than
          floating on a flat white field. Radial, not linear: the light should
          come from behind the logo, which is where the eye lands first. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-1/3 h-2/3"
        style={{
          background:
            'radial-gradient(58% 62% at 50% 44%, rgba(18,140,126,.15) 0%, transparent 70%),' +
            'radial-gradient(40% 46% at 76% 34%, rgba(18,161,80,.12) 0%, transparent 72%),' +
            'radial-gradient(44% 50% at 24% 32%, rgba(27,111,184,.12) 0%, transparent 72%)',
        }}
      />
      <div className="relative max-w-4xl mx-auto">
        {/* The cut with NO line baked in — the slogan is set below as text, and
            the full artwork carries a different one. */}
        <div className="flex justify-center">
          <AnvayaLogo height={92} cut="platform-compact" />
        </div>
        <p
          className="mt-4 text-[1.02rem] font-semibold text-anvaya-teal"
          style={{ fontFamily: 'var(--font-devanagari-text)', letterSpacing: '.01em' }}
        >
          {BRAND.taglineHi}
        </p>

        <h1
          className="mt-8 mx-auto max-w-[17ch] text-[2.35rem] sm:text-[3.4rem] leading-[1.03] tracking-[-0.03em] text-balance"
          style={{ fontFamily: 'var(--font-brand)', fontWeight: 500 }}
        >
          The AI that runs the clinic around the doctor.
        </h1>
        <p className="mt-6 mx-auto max-w-2xl text-[1.15rem] text-anvaya-body leading-relaxed">
          A patient messages on WhatsApp and is booked. Your desk confirms. The doctor
          speaks, and the note and the prescription write themselves. Anvaya is the
          thread that runs through all of it — so nothing is left in a register nobody
          reads.
        </p>

        <div className="mt-9 flex flex-wrap gap-3 justify-center">
          {/* The ONLY place a trial starts. The product sections below offer a
              way IN, not another pitch — someone who has scrolled that far has
              already decided which of the two they came for. */}
          <button type="button" onClick={onStartTrial} className={BTN_FILL}>
            Start free trial <ArrowRight className="w-4 h-4" />
          </button>
          <a href="#how" className={BTN_GHOST}>See how it works</a>
        </div>

        {/* The two products, reachable without scrolling. Burying the only two
            doors on the page below three screens of copy is how a visitor
            decides there is nothing here to click. */}
        <div className="mt-7 flex flex-wrap gap-2.5 justify-center items-center">
          <span className="text-sm text-anvaya-muted">Two products:</span>
          <button
            type="button"
            onClick={onOpenBook}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-anvaya-rule bg-white
                       text-sm font-semibold text-anvaya-blue hover:border-anvaya-blue/50 hover:-translate-y-px transition cursor-pointer"
          >
            {BRAND.book.plain} <ArrowRight className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onOpenScribe}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-anvaya-rule bg-white
                       text-sm font-semibold text-anvaya-green hover:border-anvaya-green/50 hover:-translate-y-px transition cursor-pointer"
          >
            {BRAND.scribe.plain} <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <p className="mt-6 text-sm text-anvaya-muted">
          Nothing for your patients to install. It runs on the WhatsApp they already have.
        </p>

        <ChatPreview />
      </div>
    </section>
  );
}

const BTN_FILL =
  'inline-flex items-center gap-2 px-6 py-3 rounded-xl text-white font-medium ' +
  'bg-gradient-to-r from-anvaya-navy via-anvaya-teal to-anvaya-green ' +
  'shadow-lg shadow-anvaya-teal/25 hover:-translate-y-px transition cursor-pointer';

const BTN_GHOST =
  'inline-flex items-center gap-2 px-6 py-3 rounded-xl font-medium text-anvaya-ink ' +
  'border border-anvaya-rule bg-white hover:-translate-y-px transition cursor-pointer';

// A real exchange, not a screenshot — and it plays, because a still image of a
// chat is just a picture, while a conversation arriving line by line is the
// product doing its job in front of you.
//
// Two things are load-bearing here and neither is the animation itself:
//
//   Nothing moves.  Every bubble occupies its space from the first frame and
//                   only fades in. Appending them as they arrive would relayout
//                   the hero six times, dragging the page under the reader's
//                   cursor — the classic way an "alive" section makes a site
//                   feel broken.
//
//   It can be off.  prefers-reduced-motion shows the whole conversation at once.
//                   For a vestibular disorder this is not a preference.
const CHAT: Array<{ from: 'p' | 'c'; text: string; hi?: boolean; wait: number }> = [
  { from: 'p', text: 'कल डॉक्टर से मिलना है', hi: true, wait: 700 },
  { from: 'c', text: 'नमस्ते 🙏 कल डॉ. रुचि उपलब्ध हैं — 11:30 AM या 4:00 PM?', hi: true, wait: 1500 },
  { from: 'p', text: '4 बजे', hi: true, wait: 1100 },
  { from: 'c', text: 'हो गया। कल 4:00 PM, डॉ. रुचि। सुबह याद दिला देंगे।', hi: true, wait: 1400 },
  { from: 'p', text: '🎤 voice note', wait: 1500 },
  { from: 'c', text: 'आपकी पर्ची तैयार है 📄 — डॉ. रुचि ने अभी साइन की है।', hi: true, wait: 1800 },
];

function ChatPreview() {
  const reduced =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  const [shown, setShown] = useState(reduced ? CHAT.length : 0);

  useEffect(() => {
    if (reduced) return;
    let timer: ReturnType<typeof setTimeout>;
    const step = (i: number) => {
      // After the last line, hold, then run it again — a visitor who arrives
      // mid-conversation should still get to see the whole thing.
      const next = i >= CHAT.length ? 0 : i + 1;
      const delay = i >= CHAT.length ? 4200 : CHAT[i].wait;
      timer = setTimeout(() => {
        setShown(next);
        step(next);
      }, delay);
    };
    step(0);
    return () => clearTimeout(timer);
  }, [reduced]);

  // Typing dots while the clinic's side is composing — shown in a row that is
  // always in the DOM, so its appearance never moves anything either.
  const typing = !reduced && shown < CHAT.length && CHAT[shown].from === 'c';

  return (
    <div className="mt-14 max-w-md mx-auto text-left rounded-2xl border border-anvaya-rule bg-white overflow-hidden shadow-2xl shadow-anvaya-navy/15">
      <div className="px-4 py-3 flex items-center gap-2.5 bg-gradient-to-r from-anvaya-navy via-anvaya-teal to-anvaya-green">
        <AnvayaLogo height={17} cut="platform-compact" decorative className="brightness-0 invert" />
        <span className="text-white text-sm font-semibold">Sunrise Clinic</span>
        <span className="ml-auto text-[10px] uppercase tracking-widest text-white/60">WhatsApp</span>
      </div>

      <div className="whatsapp-chat-bg p-4 space-y-2">
        {CHAT.map((l, i) => (
          <div key={i} className={l.from === 'p' ? 'flex justify-end' : 'flex justify-start'}>
            <div
              className={
                'max-w-[87%] px-3 py-2 rounded-xl text-[13.5px] leading-snug transition-all duration-500 ease-out ' +
                (l.from === 'p'
                  ? 'bg-[#DCF8C6] text-slate-800 rounded-br-sm'
                  : 'bg-white border border-anvaya-rule text-slate-700 rounded-bl-sm')
              }
              style={{
                fontFamily: l.hi ? 'var(--font-devanagari-text)' : undefined,
                opacity: i < shown ? 1 : 0,
                transform: i < shown ? 'none' : 'translateY(6px)',
              }}
              // Hidden bubbles are still read by a screen reader if they are only
              // transparent, so the whole conversation would be announced at once.
              aria-hidden={i < shown ? undefined : true}
            >
              {l.from === 'c' && (
                <span className="block text-[9px] uppercase tracking-[0.14em] text-anvaya-muted mb-0.5">
                  Anvaya
                </span>
              )}
              {l.text}
            </div>
          </div>
        ))}

        <div className="flex justify-start" aria-hidden>
          <div
            className="px-3 py-2.5 rounded-xl rounded-bl-sm bg-white border border-anvaya-rule flex gap-1 transition-opacity duration-300"
            style={{ opacity: typing ? 1 : 0 }}
          >
            {[0, 1, 2].map((d) => (
              <span
                key={d}
                className="w-1.5 h-1.5 rounded-full bg-anvaya-muted"
                style={{ animation: 'anvaya-typing 1.2s infinite', animationDelay: `${d * 0.18}s` }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── the chain ────────────────────────────────────────────────────────── */

function Chain() {
  const steps = [
    {
      when: 'The patient messages',
      what: 'Any hour, in Hindi, English or the mix people actually speak — typed or spoken. The AI works out what they want and offers real slots.',
      by: 'AI' as const,
      bar: 'bg-anvaya-navy',
    },
    {
      when: 'Your desk confirms',
      what: 'Every request arrives as a booking waiting for approval — not a note on a pad someone has to remember to act on.',
      by: 'Your staff' as const,
      bar: 'bg-anvaya-blue',
    },
    {
      when: 'The doctor speaks',
      what: 'The consultation is recorded and transcribed, and a clinical note and prescription are drafted from what was actually said.',
      by: 'AI' as const,
      bar: 'bg-anvaya-teal',
    },
    {
      when: 'The doctor approves',
      what: 'They read it, correct it and sign it. Only then does it reach the patient — on the same WhatsApp thread they started on.',
      by: 'The doctor' as const,
      bar: 'bg-anvaya-green',
    },
  ];
  return (
    <section id="how" className="bg-anvaya-mist border-y border-anvaya-rule px-5 sm:px-8 py-20">
      <div className="max-w-6xl mx-auto">
        <Eyebrow>How the platform runs</Eyebrow>
        <H2>One visit. Four moments. Nothing dropped between them.</H2>
        <p className="mt-4 max-w-2xl text-anvaya-body leading-relaxed">
          Most clinics lose a visit in the gaps — the appointment sits in a register the
          doctor never sees, the note is on paper that reaches nobody, the prescription
          is a photograph on someone's phone. Anvaya joins the four moments into one
          chain, and says plainly which of them a machine handles and which a person does.
        </p>

        {/* The rule across the top of each step is the chain itself — one line
            running navy to green, so the four read as a sequence rather than as
            four unrelated cards. */}
        <ol className="mt-12 grid sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-8">
          {steps.map((s, i) => (
            <li key={s.when}>
              <div className={`h-[3px] rounded-full ${s.bar}`} />
              <p className="mt-4 font-mono text-[11px] text-anvaya-muted tabular-nums">
                {String(i + 1).padStart(2, '0')}
              </p>
              <h3 className="mt-1.5 mb-2 font-semibold text-anvaya-ink">{s.when}</h3>
              <p className="text-sm text-anvaya-body leading-relaxed">{s.what}</p>
              <span
                className={
                  'inline-block mt-3.5 text-[10px] font-bold uppercase tracking-[0.11em] px-2 py-0.5 rounded-full ' +
                  (s.by === 'AI' ? 'bg-anvaya-teal/15 text-anvaya-teal' : 'bg-anvaya-navy/10 text-anvaya-navy')
                }
              >
                {s.by}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ── products ─────────────────────────────────────────────────────────── */

function Products({ openBook, openScribe }: { openBook: () => void; openScribe: () => void }) {
  return (
    <section id="products" className="px-5 sm:px-8 py-20">
      <div className="max-w-6xl mx-auto">
        <Eyebrow>Two products, one platform</Eyebrow>
        <H2>One login. One patient record. Two sides of the same visit.</H2>
        <p className="mt-4 max-w-2xl text-anvaya-body leading-relaxed">
          A clinic can take either on its own. Together they are one system — the
          patient booked on WhatsApp is the same patient in the consulting room, with
          one shared timeline behind them.
        </p>

        <div className="mt-12 grid md:grid-cols-2 gap-5">
          <ProductCard
            onOpen={openBook}
            cut="book"
            label={BRAND.book.latin}
            who="For the clinic"
            whoClass="text-anvaya-blue"
            cap="from-anvaya-navy to-anvaya-blue"
            line="Everything the front desk does, minus the phone calls."
            points={[
              'Booking, rescheduling and cancelling over WhatsApp, 24 hours',
              'Reminders that go out on their own, in the patient’s language',
              'A waitlist that offers a freed slot to the next patient automatically',
              'Every patient, visit and message in one record',
            ]}
          />
          <ProductCard
            onOpen={openScribe}
            cut="scribe"
            label={BRAND.scribe.latin}
            who="For the doctor"
            whoClass="text-anvaya-green"
            cap="from-anvaya-teal to-anvaya-green"
            line="Talk to your patient. The paperwork keeps up on its own."
            points={[
              'Records the consultation and drafts the clinical note',
              'Prescription written from the same conversation',
              'Works in Hindi, English and the mix people actually speak',
              'Nothing is sent until the doctor has read it and approved it',
            ]}
          />
        </div>
      </div>
    </section>
  );
}

function ProductCard({
  onOpen,
  cut,
  label,
  who,
  whoClass,
  cap,
  line,
  points,
}: {
  onOpen: () => void;
  cut: 'book' | 'scribe';
  label: string;
  who: string;
  whoClass: string;
  cap: string;
  line: string;
  points: string[];
}) {
  // The WHOLE card opens the product. It used to be a small "Learn more" text
  // link at the very bottom, which is the least visible pixel on the card — the
  // one thing the section exists to do was the hardest thing on it to find.
  return (
    <div
      role="link"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
      className="group cursor-pointer rounded-2xl border border-anvaya-rule bg-white overflow-hidden
                 hover:shadow-xl hover:shadow-anvaya-navy/10 hover:-translate-y-0.5 hover:border-anvaya-teal/40
                 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-anvaya-teal transition"
    >
      <div className={`h-1 bg-gradient-to-r ${cap}`} />
      <div className="p-7">
        <p className={`text-[11px] font-bold uppercase tracking-[0.15em] mb-4 ${whoClass}`}>{who}</p>
        {/* The lockup carries its own name, so nothing repeats it here. */}
        <AnvayaLogo height={34} cut={cut} decorative />
        <p className="mt-4 mb-5 text-[1.05rem] text-anvaya-ink" style={{ fontFamily: 'var(--font-brand)', fontWeight: 500 }}>
          {line}
        </p>
        <ul className="space-y-2.5">
          {points.map((p) => (
            <li key={p} className="flex gap-2.5 text-[0.93rem] text-anvaya-body leading-relaxed">
              <span className={`mt-2 w-1.5 h-1.5 rounded-full shrink-0 bg-gradient-to-r ${cap}`} />
              {p}
            </li>
          ))}
        </ul>
        <span
          className={`mt-7 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-semibold
                      bg-gradient-to-r ${cap} shadow-md group-hover:gap-3 transition-all`}
        >
          Sign in to {label} <ArrowRight className="w-4 h-4" />
        </span>
      </div>
    </div>
  );
}

/* ── where the AI sits ────────────────────────────────────────────────── */

function WhereTheAiSits() {
  return (
    <section id="ai" className="bg-anvaya-mist border-y border-anvaya-rule px-5 sm:px-8 py-20">
      <div className="max-w-6xl mx-auto">
        <Eyebrow>Where the AI sits</Eyebrow>
        <H2>The AI drafts. The doctor decides. There is no third option.</H2>
        <p className="mt-4 max-w-2xl text-anvaya-body leading-relaxed">
          This is worth being precise about, because "AI-powered healthcare" is said by
          everyone and means something different every time. Here the line is not a
          policy we intend to follow — it is built so it cannot be crossed.
        </p>

        <div className="mt-11 grid md:grid-cols-2 gap-5">
          <div className="rounded-2xl bg-white p-7 border border-anvaya-teal/40">
            <h3 className="mb-4 font-semibold text-anvaya-teal">What the AI does</h3>
            <ul className="space-y-3">
              {[
                'Reads a patient’s message and works out what they are asking for',
                'Turns a voice note into text, in the language it was spoken',
                'Transcribes the consultation as it happens',
                'Drafts the clinical note and a suggested prescription',
                'Answers a doctor’s question about their own patient’s history',
              ].map((t) => (
                <li key={t} className="flex gap-2.5 text-[0.94rem] text-anvaya-body leading-relaxed">
                  <span className="font-bold text-anvaya-teal shrink-0">→</span>
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl bg-white p-7 border border-anvaya-navy/30">
            <h3 className="mb-4 font-semibold text-anvaya-navy">What it is never allowed to do</h3>
            <ul className="space-y-3">
              {[
                'Approve a prescription',
                'Send anything clinical to a patient',
                'Diagnose, or change what a doctor wrote',
                'Confirm a booking without your desk',
                'Be overridden — no role and no setting skips the doctor',
              ].map((t) => (
                <li key={t} className="flex gap-2.5 text-[0.94rem] text-anvaya-muted leading-relaxed">
                  <span className="font-bold text-anvaya-navy shrink-0">✕</span>
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <p className="mt-8 max-w-2xl text-anvaya-body leading-relaxed">
          A booking is a state machine, not a guess: the AI labels what the patient
          meant, and fixed rules move the appointment. And a consultation becomes a
          prescription only when a doctor opens it, reads it and signs it — the one act
          that separates a draft from a clinical record.
        </p>
      </div>
    </section>
  );
}

/* ── trust ────────────────────────────────────────────────────────────── */

function Trust() {
  const cards = [
    {
      icon: <ShieldCheck className="w-5 h-5" />,
      title: 'Data stays in India',
      body: 'Patient records are held on Indian infrastructure — where health data belongs, and what ABDM expects.',
    },
    {
      icon: <FileText className="w-5 h-5" />,
      title: 'Every action recorded',
      body: 'Who opened which patient, when, and what changed — an append-only trail that nothing in the product can edit.',
    },
    {
      icon: <CircleDot className="w-5 h-5" />,
      title: 'Ready for ABDM',
      body: 'ABHA on the patient, HFR for the clinic, HPR for the doctor, and consultations that export as FHIR.',
    },
  ];
  return (
    <section className="px-5 sm:px-8 py-20">
      <div className="max-w-6xl mx-auto">
        <Eyebrow>Built for Indian clinics</Eyebrow>
        <H2>Where the data lives, and who touched it.</H2>

        <div className="mt-11 grid sm:grid-cols-3 gap-4">
          {cards.map((c) => (
            <div key={c.title} className="rounded-2xl border border-anvaya-rule bg-white p-6">
              <span className="w-10 h-10 rounded-xl mb-4 flex items-center justify-center text-white bg-gradient-to-br from-anvaya-navy via-anvaya-teal to-anvaya-green">
                {c.icon}
              </span>
              <h3 className="mb-1.5 font-semibold text-anvaya-ink">{c.title}</h3>
              <p className="text-sm text-anvaya-body leading-relaxed">{c.body}</p>
            </div>
          ))}
        </div>

        {/* Said plainly, because claiming a certification that has not been granted
            is the kind of thing that is cheap to write and expensive to have written. */}
        <p className="mt-8 max-w-3xl text-sm text-anvaya-muted leading-relaxed">
          Anvaya is being built towards ABDM certification. Registration and
          certification with the National Health Authority are in progress — we do not
          claim to be certified until we are.
        </p>
      </div>
    </section>
  );
}

/* ── close ────────────────────────────────────────────────────────────── */

function Close({ onStartTrial, onSignIn }: Pick<AnvayaHomeProps, 'onStartTrial' | 'onSignIn'>) {
  return (
    <section className="px-5 sm:px-8 py-20 text-center bg-gradient-to-br from-anvaya-navy via-anvaya-teal to-anvaya-green">
      <div className="max-w-3xl mx-auto">
        <div className="flex justify-center mb-7">
          <AnvayaLogo height={58} cut="platform-compact" decorative className="brightness-0 invert" />
        </div>
        <h2
          className="mx-auto max-w-[18ch] text-[2rem] sm:text-[2.5rem] leading-tight tracking-[-0.03em] text-white text-balance"
          style={{ fontFamily: 'var(--font-brand)', fontWeight: 500 }}
        >
          Set it up this week. Not this quarter.
        </h2>
        <p className="mt-5 mx-auto max-w-xl text-white/80 leading-relaxed">
          Add your clinic, add your doctors, connect your WhatsApp number. Patients can
          book the same day — nothing to install at your end, and nothing at theirs.
        </p>
        <div className="mt-9 flex flex-wrap gap-3 justify-center">
          <button
            type="button"
            onClick={onStartTrial}
            className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl bg-white text-anvaya-navy font-semibold hover:-translate-y-px transition cursor-pointer"
          >
            Start free trial <ArrowRight className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onSignIn}
            className="px-7 py-3.5 rounded-xl border border-white/40 text-white font-semibold hover:bg-white/10 transition cursor-pointer"
          >
            Sign in
          </button>
        </div>
      </div>
    </section>
  );
}

/* ── small shared bits ────────────────────────────────────────────────── */

function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="text-[11px] font-bold uppercase tracking-[0.19em] text-anvaya-teal mb-4">{children}</p>
  );
}

function H2({ children }: { children: ReactNode }) {
  return (
    <h2
      className="max-w-3xl text-[1.75rem] sm:text-[2.35rem] leading-[1.1] tracking-[-0.03em] text-anvaya-ink text-balance"
      style={{ fontFamily: 'var(--font-brand)', fontWeight: 500 }}
    >
      {children}
    </h2>
  );
}
