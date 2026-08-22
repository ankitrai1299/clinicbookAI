import React, { useEffect } from 'react';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { BRAND } from '../brand';

// Public, unauthenticated legal pages — Privacy Policy and Terms of Service —
// served at /privacy and /terms. They carry no app chrome and need no login, so
// a prospective clinic (and Meta's app review) can reach them directly.
//
// India-first: the operating law is the Digital Personal Data Protection Act,
// 2023 (DPDP). The clinic is the Data Fiduciary for its patients' data; the
// platform acts as a Data Processor on the clinic's instructions. We describe
// what the product ACTUALLY does — no certification is claimed that we do not
// hold. The bracketed items must be confirmed by the company before launch.

const COMPANY = 'NextDot'; // TODO: confirm exact registered legal entity name
const CONTACT_EMAIL = 'apps@nextdot.co.in';
const LAST_UPDATED = '28 July 2026';

type LegalKind = 'privacy' | 'terms';

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="mt-8">
    <h2 className="text-lg font-bold text-slate-900">{title}</h2>
    <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-slate-600">{children}</div>
  </section>
);

const PrivacyBody: React.FC = () => (
  <>
    <p>
      This Privacy Policy explains how {COMPANY} ("we", "us") handles personal data in the
      {BRAND.desk} and {BRAND.scribe} (together, the "Platform"). It is written to align with
      India's Digital Personal Data Protection Act, 2023 (the "DPDP Act").
    </p>

    <Section title="1. Our role, and the clinic's role">
      <p>
        The Platform is used by clinics to book appointments, send reminders, and document
        consultations. For the personal data of patients, the <strong>clinic is the Data
        Fiduciary</strong> — it decides why and how that data is used. We act as a{' '}
        <strong>Data Processor</strong>, handling patient data only on the clinic's instructions and
        to provide the service. For a clinic's own account data (its staff logins, billing), we are
        the Data Fiduciary.
      </p>
    </Section>

    <Section title="2. What data we process">
      <ul className="list-disc space-y-1.5 pl-5">
        <li><strong>Patient data:</strong> name, phone number, appointment details, and the health
          information a patient shares over WhatsApp or a doctor records in a consultation (symptoms,
          notes, prescriptions).</li>
        <li><strong>Message content:</strong> WhatsApp messages and voice notes exchanged for
          booking and reminders.</li>
        <li><strong>Clinic account data:</strong> clinic name, staff email and login, configuration,
          and billing information.</li>
        <li><strong>Technical data:</strong> logs needed to operate and secure the service.</li>
      </ul>
    </Section>

    <Section title="3. How we use it">
      <p>
        To provide the booking, reminder, and clinical-documentation features; to send WhatsApp
        messages on the clinic's behalf; to secure and support the service; and to meet legal
        obligations. We do <strong>not</strong> sell personal data, and we do not use patient health
        data for advertising.
      </p>
    </Section>

    <Section title="4. AI processing">
      <p>
        Some features use automated processing — for example, converting a voice note to text and
        drafting a clinical note. This may involve trusted sub-processors (such as speech-to-text and
        language-model providers) that process the content solely to return the result to the clinic.
        A clinician reviews clinical output; the Platform does not make medical decisions.
      </p>
    </Section>

    <Section title="5. Sharing and sub-processors">
      <p>
        We share data only with service providers that help us run the Platform — messaging (WhatsApp
        / Meta), cloud hosting, speech and language processing — under contracts that limit them to
        our instructions. We may disclose data where required by law.
      </p>
    </Section>

    <Section title="6. Where data is stored">
      <p>
        Data is stored on managed cloud infrastructure. Where processing occurs outside India, it is
        done under safeguards consistent with the DPDP Act. [Confirm hosting region and any
        cross-border transfers before launch.]
      </p>
    </Section>

    <Section title="7. Retention">
      <p>
        We keep personal data for as long as the clinic's account is active and as needed to provide
        the service, then delete or anonymise it, unless a longer period is required by law (for
        example, medical-record retention rules that apply to the clinic).
      </p>
    </Section>

    <Section title="8. Security">
      <p>
        We use reasonable technical and organisational measures — encryption in transit, access
        controls, tenant isolation so one clinic can never see another's data, and audit logging — to
        protect personal data. No system is perfectly secure, but we work to reduce risk.
      </p>
    </Section>

    <Section title="9. Your rights">
      <p>
        Patients can exercise their rights (access, correction, erasure, grievance) primarily through
        the clinic that holds their data. For account data, or to raise a concern with us, contact us
        below. Under the DPDP Act you may also approach the Data Protection Board of India.
      </p>
    </Section>

    <Section title="10. Grievance / contact">
      <p>
        Grievance Officer: [Name] — <a className="text-emerald-700 underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        We will respond within the timelines required by law. [Add registered address before launch.]
      </p>
    </Section>
  </>
);

const TermsBody: React.FC = () => (
  <>
    <p>
      These Terms govern use of the {BRAND.desk} and {BRAND.scribe} products (the "Platform") provided
      by {COMPANY}. By creating an account or using the Platform, you agree to these Terms.
    </p>

    <Section title="1. Who can use the Platform">
      <p>
        The Platform is for clinics and their authorised staff. You must be legally able to enter
        this agreement and responsible for keeping account credentials secure and for all activity
        under your account.
      </p>
    </Section>

    <Section title="2. The service, and what it is not">
      <p>
        The Platform helps clinics manage appointments, send reminders, and draft clinical
        documentation. It is a tool for clinicians — <strong>it does not provide medical advice,
        diagnosis, or treatment</strong>, and any AI-generated draft must be reviewed by a qualified
        clinician before use. The clinician remains responsible for all clinical decisions.
      </p>
    </Section>

    <Section title="3. Patient data and your responsibilities">
      <p>
        You are the Data Fiduciary for your patients' data. You are responsible for having a lawful
        basis to collect it, for informing patients, and for using the Platform in line with
        applicable medical and data-protection law. Our handling of that data is described in the{' '}
        <a className="text-emerald-700 underline" href="/privacy">Privacy Policy</a>.
      </p>
    </Section>

    <Section title="4. WhatsApp and third-party services">
      <p>
        Messaging is delivered through WhatsApp / Meta and is subject to their policies and message
        limits. Availability of third-party services is outside our control.
      </p>
    </Section>

    <Section title="5. Acceptable use">
      <p>
        Do not use the Platform to send spam or unlawful content, to message people without a lawful
        basis, to attempt to access another clinic's data, or to disrupt the service. We may suspend
        accounts that put the service, its users, or message-delivery quality at risk.
      </p>
    </Section>

    <Section title="6. Fees">
      <p>
        Paid plans and any usage limits are as described at sign-up or in your order. Trials may be
        offered and changed. [Confirm billing, trial, and usage-limit terms before launch.]
      </p>
    </Section>

    <Section title="7. Availability and changes">
      <p>
        We work to keep the Platform available but do not guarantee uninterrupted service. We may
        update features and these Terms; material changes will be notified, and continued use means
        acceptance.
      </p>
    </Section>

    <Section title="8. Liability">
      <p>
        The Platform is provided "as is" to the extent permitted by law. We are not liable for
        clinical decisions, for third-party service outages, or for indirect or consequential loss.
        [Have counsel set the liability cap and warranty terms before launch.]
      </p>
    </Section>

    <Section title="9. Termination">
      <p>
        You may stop using the Platform at any time. We may suspend or end access for breach of these
        Terms. On termination we handle your data as described in the Privacy Policy.
      </p>
    </Section>

    <Section title="10. Governing law and contact">
      <p>
        These Terms are governed by the laws of India, with courts at [city/jurisdiction]. Questions:{' '}
        <a className="text-emerald-700 underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
    </Section>
  </>
);

const LegalPage: React.FC<{ kind: LegalKind }> = ({ kind }) => {
  const isPrivacy = kind === 'privacy';
  const title = isPrivacy ? 'Privacy Policy' : 'Terms of Service';

  useEffect(() => {
    document.title = `${title} · ${BRAND.name}`;
  }, [title]);

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <header className="border-b border-slate-100">
        <div className="mx-auto max-w-3xl px-6 py-5 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-900 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back to {BRAND.name}
          </a>
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
            <ShieldCheck className="w-3.5 h-3.5" /> DPDP Act, 2023
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-3xl font-extrabold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-slate-400">Last updated: {LAST_UPDATED}</p>

        <div className="mt-8">{isPrivacy ? <PrivacyBody /> : <TermsBody />}</div>

        <nav className="mt-14 border-t border-slate-100 pt-6 flex gap-6 text-sm">
          <a className="text-emerald-700 underline" href="/privacy">Privacy Policy</a>
          <a className="text-emerald-700 underline" href="/terms">Terms of Service</a>
          <a className="text-slate-500 hover:text-slate-900 transition-colors" href="/">Home</a>
        </nav>
      </main>
    </div>
  );
};

export default LegalPage;
