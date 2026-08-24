import { useEffect, useState, type ReactNode } from 'react';
import { ArrowRight, ShieldCheck, FileText, Languages, Mic, MessageCircle, CheckCheck } from 'lucide-react';

import { BRAND } from '../brand';
import AnvayaLogo from './AnvayaLogo';

interface AnvayaHomeProps {
  /** Open अन्वय Book — sign-in for a signed-out visitor. */
  onOpenBook: () => void;
  /** Open अन्वय Scribe — same. */
  onOpenScribe: () => void;
  /** Start a trial. This is the ONLY page that offers one. */
  onStartTrial: () => void;
  onSignIn: () => void;
}

// The whole platform on one page, deliberately short.
//
// This replaced a version that stitched the two old product sites together
// section by section. It covered everything, and nobody would have reached the
// end: a page that says everything says nothing, because the reader leaves
// before the part that would have convinced them.
//
// So each thing is said ONCE, in the fewest sections that can carry it — what
// it is, how a visit flows, the two products, where the AI stops, and who holds
// the data. A clinic owner can read the whole thing in about two minutes.
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
      <Products onOpenBook={onOpenBook} onOpenScribe={onOpenScribe} />
      <Pricing onStartTrial={onStartTrial} />
      <WhereTheAiSits />
      <Trust />
      <Close onStartTrial={onStartTrial} onSignIn={onSignIn} />
    </div>
  );
}

/* ── shared ───────────────────────────────────────────────────────────── */

const BTN_FILL =
  'inline-flex items-center gap-2 px-6 py-3 rounded-xl text-white font-semibold ' +
  'bg-gradient-to-r from-anvaya-navy via-anvaya-teal to-anvaya-green ' +
  'shadow-lg shadow-anvaya-teal/25 hover:-translate-y-px transition cursor-pointer';

const BTN_GHOST =
  'inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-anvaya-ink ' +
  'border border-anvaya-rule bg-white hover:-translate-y-px transition cursor-pointer';

function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="text-[11px] font-bold uppercase tracking-[0.19em] mb-4 text-anvaya-teal">{children}</p>;
}

function H2({ children }: { children: ReactNode }) {
  return (
    <h2
      className="text-[1.75rem] sm:text-[2.3rem] leading-[1.12] tracking-[-0.03em] text-anvaya-ink text-balance"
      style={{ fontFamily: 'var(--font-brand)', fontWeight: 500 }}
    >
      {children}
    </h2>
  );
}

/* ── hero ─────────────────────────────────────────────────────────────── */

function Hero({
  onStartTrial,
  onOpenBook,
  onOpenScribe,
}: Pick<AnvayaHomeProps, 'onStartTrial' | 'onOpenBook' | 'onOpenScribe'>) {
  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[34rem]"
        style={{
          background:
            'radial-gradient(50% 60% at 18% 18%, rgba(27,111,184,.13) 0%, transparent 70%),' +
            'radial-gradient(46% 56% at 84% 10%, rgba(18,161,80,.13) 0%, transparent 72%)',
        }}
      />
      <div className="relative max-w-6xl mx-auto px-5 sm:px-8 pt-14 pb-24 sm:pb-20">
        <div className="grid lg:grid-cols-[1.02fr_1fr] gap-14 items-center">
          <div>
            <AnvayaLogo height={62} cut="platform-compact" />
            <p
              className="mt-3 text-[1.02rem] font-semibold text-anvaya-teal"
              style={{ fontFamily: 'var(--font-devanagari-text)', letterSpacing: '.01em' }}
            >
              {BRAND.taglineHi}
            </p>

            <h1
              className="mt-7 text-[2.3rem] sm:text-[3.1rem] leading-[1.04] tracking-[-0.032em] text-balance"
              style={{ fontFamily: 'var(--font-brand)', fontWeight: 500 }}
            >
              Your clinic runs itself. You look after patients.
            </h1>
            <p className="mt-5 max-w-xl text-[1.1rem] text-anvaya-body leading-relaxed">
              Patients book on WhatsApp. Your desk confirms. The doctor speaks, and the
              note and prescription write themselves — back into the same chat the
              patient started in.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              {/* The only offer of a trial, other than the close. It is a decision
                  made once, by someone who has not yet picked a product —
                  repeating it beside each one asks a question already answered. */}
              <button type="button" onClick={onStartTrial} className={BTN_FILL}>
                Start free trial <ArrowRight className="w-4 h-4" />
              </button>
              <a href="#how" className={BTN_GHOST}>
                See how it works
              </a>
            </div>

            <div className="mt-7 flex flex-wrap items-center gap-2.5">
              <span className="text-sm text-anvaya-muted">Sign in to</span>
              <ProductChip onClick={onOpenBook} tint="text-anvaya-blue hover:border-anvaya-blue/50">
                {BRAND.book.plain}
              </ProductChip>
              <ProductChip onClick={onOpenScribe} tint="text-anvaya-green hover:border-anvaya-green/50">
                {BRAND.scribe.plain}
              </ProductChip>
            </div>
          </div>

          <HeroVisual />
        </div>
      </div>
    </section>
  );
}

function ProductChip({
  onClick,
  tint,
  children,
}: {
  onClick: () => void;
  tint: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-anvaya-rule bg-white text-sm font-semibold hover:-translate-y-px transition cursor-pointer ${tint}`}
    >
      {children} <ArrowRight className="w-3.5 h-3.5" />
    </button>
  );
}

// A real doctor at a real desk, with the patient's side of the same moment
// overlapping it. Two photographs would have shown two products; one photo and
// one live conversation shows the thing a clinic is actually buying — the join.
function HeroVisual() {
  return (
    <div className="relative">
      <div className="rounded-3xl overflow-hidden border border-anvaya-rule shadow-2xl shadow-anvaya-navy/20">
        <img
          src="/images/doctor-hero-anvaya.jpg"
          alt="A doctor writing up a consultation"
          className="w-full h-[24rem] sm:h-[29rem] object-cover"
          width={1235}
          height={1000}
          loading="eager"
          decoding="async"
        />
      </div>
      {/* Overlapping, not beside: the chat is what is happening on the other
          side of that desk, at the same moment. */}
      <div className="absolute -bottom-10 sm:-bottom-8 left-2 sm:-left-8 w-[16.5rem] sm:w-[18.5rem]">
        <ChatPreview />
      </div>
    </div>
  );
}

/* ── the animated chat ────────────────────────────────────────────────── */

// A still image of a chat is a picture. The same exchange arriving line by line
// is the product doing its job in front of the reader.
//
// Two things matter more than the animation, and both are about it not being
// annoying: NOTHING MOVES (every bubble holds its space from the first frame and
// only fades in, so the hero never relayouts under the cursor), and IT CAN BE
// OFF (prefers-reduced-motion shows the whole thing at once — for a vestibular
// disorder that is not a preference).
const CHAT: Array<{ from: 'p' | 'c'; text: string; wait: number }> = [
  { from: 'p', text: 'कल डॉक्टर से मिलना है', wait: 800 },
  { from: 'c', text: 'नमस्ते 🙏 कल डॉ. रुचि — 11:30 AM या 4:00 PM?', wait: 1600 },
  { from: 'p', text: '4 बजे', wait: 1100 },
  { from: 'c', text: 'हो गया। कल 4:00 PM, डॉ. रुचि।', wait: 1500 },
  { from: 'c', text: 'आपकी पर्ची तैयार है 📄', wait: 2000 },
];

function ChatPreview() {
  const reduced =
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  const [shown, setShown] = useState(reduced ? CHAT.length : 0);

  useEffect(() => {
    if (reduced) return;
    let timer: ReturnType<typeof setTimeout>;
    const step = (i: number) => {
      // After the last line, hold, then run again — someone arriving mid-way
      // should still get to see the whole exchange.
      const next = i >= CHAT.length ? 0 : i + 1;
      const delay = i >= CHAT.length ? 4000 : CHAT[i].wait;
      timer = setTimeout(() => {
        setShown(next);
        step(next);
      }, delay);
    };
    step(0);
    return () => clearTimeout(timer);
  }, [reduced]);

  const typing = !reduced && shown < CHAT.length && CHAT[shown].from === 'c';

  return (
    <div className="rounded-2xl border border-anvaya-rule bg-white overflow-hidden shadow-2xl shadow-anvaya-navy/25">
      <div className="px-3 py-2.5 flex items-center gap-2 bg-gradient-to-r from-anvaya-navy via-anvaya-teal to-anvaya-green">
        <AnvayaLogo height={14} cut="platform-compact" decorative className="brightness-0 invert" />
        <span className="text-white text-xs font-semibold">Sunrise Clinic</span>
        <span className="ml-auto text-[9px] uppercase tracking-widest text-white/60">WhatsApp</span>
      </div>
      <div className="whatsapp-chat-bg p-3 space-y-1.5">
        {CHAT.map((l, i) => (
          <div key={i} className={l.from === 'p' ? 'flex justify-end' : 'flex justify-start'}>
            <div
              className={
                'max-w-[88%] px-2.5 py-1.5 rounded-xl text-[12px] leading-snug transition-all duration-500 ease-out ' +
                (l.from === 'p'
                  ? 'bg-[#DCF8C6] text-slate-800 rounded-br-sm'
                  : 'bg-white border border-anvaya-rule text-slate-700 rounded-bl-sm')
              }
              style={{
                fontFamily: 'var(--font-devanagari-text)',
                opacity: i < shown ? 1 : 0,
                transform: i < shown ? 'none' : 'translateY(5px)',
              }}
              // Transparent is not hidden to a screen reader — without this the
              // whole conversation is announced at once, in the wrong order.
              aria-hidden={i < shown ? undefined : true}
            >
              {l.text}
            </div>
          </div>
        ))}
        <div className="flex justify-start" aria-hidden>
          <div
            className="px-2.5 py-2 rounded-xl rounded-bl-sm bg-white border border-anvaya-rule flex gap-1 transition-opacity duration-300"
            style={{ opacity: typing ? 1 : 0 }}
          >
            {[0, 1, 2].map((d) => (
              <span
                key={d}
                className="w-1 h-1 rounded-full bg-anvaya-muted"
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
      icon: <MessageCircle className="w-4 h-4" />,
      when: 'Patient messages',
      what: 'Any hour, in their own language, typed or spoken. The AI works out what they need.',
      by: 'AI',
      bar: 'bg-anvaya-navy',
    },
    {
      icon: <CheckCheck className="w-4 h-4" />,
      when: 'Desk confirms',
      what: 'It arrives as a booking to approve — not a note on a pad someone must remember.',
      by: 'Your staff',
      bar: 'bg-anvaya-blue',
    },
    {
      icon: <Mic className="w-4 h-4" />,
      when: 'Doctor speaks',
      what: 'The consultation is recorded, and the note and prescription draft themselves.',
      by: 'AI',
      bar: 'bg-anvaya-teal',
    },
    {
      icon: <FileText className="w-4 h-4" />,
      when: 'Doctor approves',
      what: 'They read it, correct it, sign it. Only then does it reach the patient.',
      by: 'The doctor',
      bar: 'bg-anvaya-green',
    },
  ];
  return (
    <section id="how" className="bg-anvaya-mist border-y border-anvaya-rule px-5 sm:px-8 py-20">
      <div className="max-w-6xl mx-auto">
        <div className="max-w-2xl">
          <Eyebrow>One visit, end to end</Eyebrow>
          <H2>Four moments. Nothing dropped between them.</H2>
          <p className="mt-4 text-anvaya-body leading-relaxed">
            Most clinics lose a visit in the gaps — a register the doctor never sees, a
            note on paper that reaches nobody, a prescription photographed on someone's
            phone. Anvaya joins the four, and says plainly which a machine handles and
            which a person does.
          </p>
        </div>

        <ol className="mt-11 grid sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-8">
          {steps.map((s, i) => (
            <li key={s.when}>
              <div className={`h-[3px] rounded-full ${s.bar}`} />
              <div className="mt-4 flex items-center gap-2">
                <span className="w-7 h-7 rounded-lg bg-white border border-anvaya-rule flex items-center justify-center text-anvaya-teal">
                  {s.icon}
                </span>
                <span className="font-mono text-[11px] text-anvaya-muted tabular-nums">
                  {String(i + 1).padStart(2, '0')}
                </span>
              </div>
              <h3 className="mt-3 mb-1.5 font-semibold text-anvaya-ink">{s.when}</h3>
              <p className="text-sm text-anvaya-body leading-relaxed">{s.what}</p>
              <span
                className={
                  'inline-block mt-3 text-[10px] font-bold uppercase tracking-[0.11em] px-2 py-0.5 rounded-full ' +
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

/* ── the two products ─────────────────────────────────────────────────── */

function Products({ onOpenBook, onOpenScribe }: Pick<AnvayaHomeProps, 'onOpenBook' | 'onOpenScribe'>) {
  return (
    <section id="products" className="px-5 sm:px-8 py-20">
      <div className="max-w-6xl mx-auto">
        <div className="max-w-2xl">
          <Eyebrow>Two products, one platform</Eyebrow>
          <H2>One login. One patient record. Two sides of the same visit.</H2>
          <p className="mt-4 text-anvaya-body leading-relaxed">
            Take either on its own, or both. Together they are one system — the patient
            booked on WhatsApp is the same patient in the consulting room, with one shared
            timeline behind them.
          </p>
        </div>

        <div className="mt-12 grid md:grid-cols-2 gap-6">
          <ProductCard
            onOpen={onOpenBook}
            cut="book"
            label={BRAND.book.plain}
            who="For the clinic"
            tint="text-anvaya-blue"
            cap="from-anvaya-navy to-anvaya-blue"
            photo="/images/patient-2.jpg"
            photoAlt="A patient messaging their clinic"
            line="Everything the front desk does, minus the phone calls."
            points={[
              'Book, move and cancel over WhatsApp — 24 hours, any language',
              'Reminders that go out on their own',
              'A waitlist that offers a freed slot to the next patient',
              'Every patient, visit and message in one record',
            ]}
          />
          <ProductCard
            onOpen={onOpenScribe}
            cut="scribe"
            label={BRAND.scribe.plain}
            who="For the doctor"
            tint="text-anvaya-green"
            cap="from-anvaya-teal to-anvaya-green"
            photo="/images/doctor-1.jpg"
            photoAlt="A doctor reviewing a consultation note"
            line="Talk to your patient. The paperwork keeps up on its own."
            points={[
              'Records the consultation, drafts the clinical note',
              'Prescription written from the same conversation',
              'Hindi, English and the mix people actually speak',
              'Nothing is sent until the doctor approves it',
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
  tint,
  cap,
  photo,
  photoAlt,
  line,
  points,
}: {
  onOpen: () => void;
  cut: 'book' | 'scribe';
  label: string;
  who: string;
  tint: string;
  cap: string;
  photo: string;
  photoAlt: string;
  line: string;
  points: string[];
}) {
  // The WHOLE card opens the product. It was a text link at the bottom — the
  // least visible pixel on the card, and the one thing the section exists to do.
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
      <div className="flex gap-5 p-6 pb-0">
        <div className="flex-1 min-w-0">
          <p className={`text-[11px] font-bold uppercase tracking-[0.15em] mb-3 ${tint}`}>{who}</p>
          {/* The lockup carries its own name, so nothing repeats it here. */}
          <AnvayaLogo height={30} cut={cut} decorative />
          <p
            className="mt-3.5 text-[1.02rem] text-anvaya-ink leading-snug"
            style={{ fontFamily: 'var(--font-brand)', fontWeight: 500 }}
          >
            {line}
          </p>
        </div>
        <img
          src={photo}
          alt={photoAlt}
          className="hidden sm:block w-28 h-36 object-cover rounded-xl shrink-0"
          width={540}
          height={900}
          loading="lazy"
          decoding="async"
        />
      </div>
      <div className="px-6 pb-6">
        <ul className="mt-5 space-y-2.5">
          {points.map((p) => (
            <li key={p} className="flex gap-2.5 text-[0.92rem] text-anvaya-body leading-relaxed">
              <span className={`mt-2 w-1.5 h-1.5 rounded-full shrink-0 bg-gradient-to-r ${cap}`} />
              {p}
            </li>
          ))}
        </ul>
        <span
          className={`mt-6 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-semibold
                      bg-gradient-to-r ${cap} shadow-md group-hover:gap-3 transition-all`}
        >
          Sign in to {label} <ArrowRight className="w-4 h-4" />
        </span>
      </div>
    </div>
  );
}

/* ── pricing ──────────────────────────────────────────────────────────── */

// The prices a clinic is actually charged today, carried over unchanged from the
// two product pages. Nothing here is invented: a number on a pricing page is a
// promise, and inventing one to fill a layout is the worst kind of placeholder
// because it looks finished.
//
// Book has one plan and Scribe has three, and that asymmetry is left alone.
// Padding Book out to three columns for symmetry would have meant making two of
// them up.
const BOOK_PLAN = {
  price: '₹999',
  period: '/month',
  blurb: 'For a clinic in India, with domestic WhatsApp volume.',
  features: [
    'WhatsApp appointment booking',
    '24-hour and 2-hour reminders, automatic',
    'Waitlist that fills a freed slot on its own',
    'Clinic dashboard for the front desk',
    'Hindi, English and the mix in between',
    'Google Calendar, if you use it',
  ],
};

const SCRIBE_PLANS = [
  { name: 'Free', price: '₹0', period: '', blurb: '5 consultations a month', popular: false },
  { name: 'Starter', price: '₹1,499', period: '/month', blurb: '100 consultations, patient timeline', popular: false },
  {
    name: 'Professional',
    price: '₹2,999',
    period: '/month',
    blurb: 'Unlimited consultations, WhatsApp prescription delivery',
    popular: true,
  },
];

function Pricing({ onStartTrial }: Pick<AnvayaHomeProps, 'onStartTrial'>) {
  return (
    <section id="pricing" className="bg-anvaya-mist border-y border-anvaya-rule px-5 sm:px-8 py-20">
      <div className="max-w-6xl mx-auto">
        <div className="max-w-2xl">
          <Eyebrow>Pricing</Eyebrow>
          <H2>Per clinic, per month. Cancel whenever.</H2>
          <p className="mt-4 text-anvaya-body leading-relaxed">
            Take one product or both. Every plan includes a 14-day free trial, and no
            card is asked for to start it.
          </p>
        </div>

        <div className="mt-12 grid lg:grid-cols-[1fr_1.25fr] gap-6 items-start">
          {/* ── Book ── */}
          <div className="rounded-2xl border border-anvaya-rule bg-white overflow-hidden">
            <div className="h-1 bg-gradient-to-r from-anvaya-navy to-anvaya-blue" />
            <div className="p-7">
              <AnvayaLogo height={28} cut="book" decorative />
              <p className="mt-4 text-sm text-anvaya-muted">{BOOK_PLAN.blurb}</p>
              <p className="mt-5">
                <span
                  className="text-[2.6rem] leading-none text-anvaya-ink"
                  style={{ fontFamily: 'var(--font-brand)', fontWeight: 600 }}
                >
                  {BOOK_PLAN.price}
                </span>
                <span className="text-sm text-anvaya-muted">{BOOK_PLAN.period}</span>
              </p>
              <ul className="mt-6 space-y-2.5">
                {BOOK_PLAN.features.map((f) => (
                  <li key={f} className="flex gap-2.5 text-[0.92rem] text-anvaya-body leading-relaxed">
                    <span className="mt-2 w-1.5 h-1.5 rounded-full shrink-0 bg-gradient-to-r from-anvaya-navy to-anvaya-blue" />
                    {f}
                  </li>
                ))}
              </ul>
              <button type="button" onClick={onStartTrial} className={`${BTN_FILL} mt-7 w-full justify-center`}>
                Start free trial <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* ── Scribe ── */}
          <div className="rounded-2xl border border-anvaya-rule bg-white overflow-hidden">
            <div className="h-1 bg-gradient-to-r from-anvaya-teal to-anvaya-green" />
            <div className="p-7">
              <AnvayaLogo height={28} cut="scribe" decorative />
              <p className="mt-4 text-sm text-anvaya-muted">Priced by how much a doctor consults.</p>

              <div className="mt-5 grid sm:grid-cols-3 gap-3">
                {SCRIBE_PLANS.map((pl) => (
                  <div
                    key={pl.name}
                    className={
                      'rounded-xl p-4 border ' +
                      (pl.popular
                        ? 'border-anvaya-green bg-anvaya-green/5'
                        : 'border-anvaya-rule bg-white')
                    }
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-anvaya-muted">
                        {pl.name}
                      </p>
                      {pl.popular && (
                        <span className="text-[9px] font-bold uppercase tracking-[0.1em] text-anvaya-green bg-anvaya-green/15 px-1.5 py-0.5 rounded-full">
                          Popular
                        </span>
                      )}
                    </div>
                    <p>
                      <span
                        className="text-[1.6rem] leading-none text-anvaya-ink"
                        style={{ fontFamily: 'var(--font-brand)', fontWeight: 600 }}
                      >
                        {pl.price}
                      </span>
                      <span className="text-xs text-anvaya-muted">{pl.period}</span>
                    </p>
                    <p className="mt-2 text-[0.82rem] text-anvaya-body leading-snug">{pl.blurb}</p>
                  </div>
                ))}
              </div>

              <button type="button" onClick={onStartTrial} className={`${BTN_FILL} mt-7 w-full justify-center`}>
                Start free trial <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── where the AI sits ────────────────────────────────────────────────── */

function WhereTheAiSits() {
  return (
    <section id="ai" className="bg-anvaya-mist border-y border-anvaya-rule px-5 sm:px-8 py-20">
      <div className="max-w-6xl mx-auto">
        <div className="max-w-2xl">
          <Eyebrow>Where the AI stops</Eyebrow>
          <H2>The AI drafts. The doctor decides. There is no third option.</H2>
          <p className="mt-4 text-anvaya-body leading-relaxed">
            Worth being precise about, because "AI-powered healthcare" is said by everyone
            and means something different every time. Here the line is not a policy we
            intend to follow — it is built so it cannot be crossed.
          </p>
        </div>

        <div className="mt-11 grid md:grid-cols-2 gap-5">
          <Panel title="What the AI does" tone="does">
            {[
              'Reads a patient’s message and works out what they need',
              'Turns a voice note into text, in the language it was spoken',
              'Transcribes the consultation as it happens',
              'Drafts the clinical note and a suggested prescription',
              'Answers a doctor’s question about their own patient’s history',
            ]}
          </Panel>
          <Panel title="What it is never allowed to do" tone="never">
            {[
              'Approve a prescription',
              'Send anything clinical to a patient',
              'Diagnose, or change what a doctor wrote',
              'Confirm a booking without your desk',
              'Be overridden — no role and no setting skips the doctor',
            ]}
          </Panel>
        </div>
      </div>
    </section>
  );
}

function Panel({ title, tone, children }: { title: string; tone: 'does' | 'never'; children: string[] }) {
  const does = tone === 'does';
  return (
    <div className={`rounded-2xl bg-white p-7 border ${does ? 'border-anvaya-teal/40' : 'border-anvaya-navy/30'}`}>
      <h3 className={`mb-4 font-semibold ${does ? 'text-anvaya-teal' : 'text-anvaya-navy'}`}>{title}</h3>
      <ul className="space-y-3">
        {children.map((t) => (
          <li
            key={t}
            className={`flex gap-2.5 text-[0.93rem] leading-relaxed ${does ? 'text-anvaya-body' : 'text-anvaya-muted'}`}
          >
            <span className={`shrink-0 font-bold ${does ? 'text-anvaya-teal' : 'text-anvaya-navy'}`}>
              {does ? '→' : '✕'}
            </span>
            {t}
          </li>
        ))}
      </ul>
    </div>
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
      body: 'Who opened which patient, when, and what changed — an append-only trail nothing in the product can edit.',
    },
    {
      icon: <Languages className="w-5 h-5" />,
      title: 'Built for how India speaks',
      body: 'Hindi, English and the mix in between — typed or spoken, from the patient and from the doctor.',
    },
  ];
  return (
    <section className="px-5 sm:px-8 py-20">
      <div className="max-w-6xl mx-auto">
        <div className="max-w-2xl">
          <Eyebrow>Built for Indian clinics</Eyebrow>
          <H2>Where the data lives, and who touched it.</H2>
        </div>

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

        {/* Said plainly. Claiming a certification that has not been granted is
            cheap to write and expensive to have written. */}
        <p className="mt-8 max-w-3xl text-sm text-anvaya-muted leading-relaxed">
          Anvaya is being built towards ABDM certification — ABHA on the patient, HFR for
          the clinic, HPR for the doctor, consultations that export as FHIR. Registration
          with the National Health Authority is in progress; we do not claim to be
          certified until we are.
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
          <AnvayaLogo height={54} cut="platform-compact" decorative className="brightness-0 invert" />
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
        <p className="mt-9 text-white/70 text-[0.98rem]" style={{ fontFamily: 'var(--font-devanagari-text)' }}>
          {BRAND.taglineHi}
        </p>
      </div>
    </section>
  );
}
