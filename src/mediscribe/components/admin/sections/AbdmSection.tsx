// ABDM registration — the screen a clinic uses to get itself onto the national
// health registries, and the one place the resulting ids get typed in.
//
// ── Why this screen exists at all ──────────────────────────────────────────
//
// Two ids stand between a clinic and ABDM: an HFR id for the clinic and an HPR
// id for every doctor. Neither can be obtained by us. The clinic's manager
// registers the facility with their own Aadhaar-linked mobile; each doctor
// registers themselves, because the KYC is theirs.
//
// So this is a product problem, not a technical one: if nobody tells a clinic
// what to do, they will simply never do it, and every ABDM feature we build sits
// unused behind a blank field. Many clinics sign in to this app; support cannot
// walk each of them through it by phone. The instructions belong on the screen,
// beside the box the answer goes in.
//
// ── What it deliberately does NOT do ───────────────────────────────────────
//
// It does not block anything. A clinic with no ids runs completely — booking,
// WhatsApp, the scribe, prescriptions — and only ABDM sharing is unavailable.
// That is why the empty state reads as "not yet", never as an error. Holding a
// new clinic at the door until a government registration clears would cost far
// more than the feature is worth.

import React, { FC } from 'react';
import { useCallback, useEffect, useState } from 'react';
import {
  Landmark,
  Stethoscope,
  CheckCircle2,
  ExternalLink,
  AlertTriangle,
  Loader2,
  Save,
  LucideIcon,
} from 'lucide-react';
import {
  getRegistryStatus,
  saveFacilityId,
  saveProfessionalId,
  RegistryStatus,
  ProfessionalRegistration,
} from '../../../services/api';
import { useAuth } from '../../../context/Auth';
import {
  Page,
  SectionHeader,
  Card,
  Badge,
  PrimaryButton,
  inputClass,
  LoadingState,
  ErrorState,
} from '../ui';

const HFR_PORTAL = 'https://facility.abdm.gov.in';
const HPR_PORTAL = 'https://hpr.abdm.gov.in';

export default function AbdmSection() {
  const { token, hasPermission } = useAuth();
  const canManage = hasPermission('settings.manage');

  const [status, setStatus] = useState<RegistryStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!token) return;
    setLoading(true);
    getRegistryStatus(token)
      .then(setStatus)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(load, [load]);

  if (loading) return <LoadingState label="Loading registration status…" />;
  if (error) return <ErrorState message={error} />;
  if (!status) return null;

  return (
    <Page>
      <SectionHeader
        title="ABDM registration"
        description="What this clinic still needs before health records can be shared with ABDM."
        action={
          status.complete ? (
            <Badge tone="emerald">
              <CheckCircle2 className="w-3.5 h-3.5" /> Registered
            </Badge>
          ) : (
            <Badge tone="amber">Not registered yet</Badge>
          )
        }
      />

      {/* Said before anything else, because the list below looks like a set of
          blockers and is not one. */}
      <div className="mb-8 rounded-xl border border-slate-200 bg-slate-50 px-5 py-4">
        <p className="text-sm text-slate-600 leading-relaxed">
          <span className="font-semibold text-slate-800">Nothing here stops the clinic working.</span>{' '}
          Booking, WhatsApp, consultations and prescriptions all run without these ids.
          They are needed only to share records with the government health network (ABDM).
          Both registrations are free.
        </p>
      </div>

      <div className="space-y-6">
        <FacilityStep status={status} canManage={canManage} onSaved={setStatus} token={token} />
        <ProfessionalStep status={status} canManage={canManage} onSaved={setStatus} token={token} />
      </div>

      <Pitfalls />
    </Page>
  );
}

/* ── Step 1: the clinic ─────────────────────────────────────────────────── */

function FacilityStep({
  status,
  canManage,
  onSaved,
  token,
}: {
  status: RegistryStatus;
  canManage: boolean;
  onSaved: (s: RegistryStatus) => void;
  token: string | null;
}) {
  const done = Boolean(status.facility.hfrId);
  return (
    <Card>
      <StepHeader
        n={1}
        icon={Landmark}
        title="Register the clinic — HFR"
        subtitle="Health Facility Registry · the clinic's identity in ABDM"
        done={done}
      />

      <div className="mt-5 grid gap-6 lg:grid-cols-2">
        <div>
          <p className="text-sm text-slate-600 leading-relaxed">
            The clinic manager registers{' '}
            <span className="font-medium text-slate-800">{status.facility.clinicName}</span> on the
            government portal. Sign in with a mobile number that is{' '}
            <span className="font-medium text-slate-800">linked to Aadhaar</span> — the OTP goes there.
          </p>
          {/* Search-before-register is the step most clinics skip, and it is the
              one that saves the most time: a great many clinics are already in
              the registry from older state directories. */}
          <p className="mt-3 text-sm text-slate-600 leading-relaxed">
            Search for the clinic first. Many are already listed from older
            directories — if yours appears,{' '}
            <span className="font-medium text-slate-800">claim it</span> instead of creating a
            duplicate.
          </p>
          <Checklist
            items={[
              'Aadhaar-linked mobile number of the owner or manager',
              'Clinical establishment registration or trade licence',
              'Address, timings and the services offered',
            ]}
          />
          <PortalLink
            href={HFR_PORTAL}
            label="Open the facility portal"
            note="About 20–30 minutes, then verification"
          />
        </div>

        <IdBox
          label="HFR ID"
          value={status.facility.hfrId}
          placeholder="Paste the id from the portal"
          disabled={!canManage}
          onSave={(v) => saveFacilityId(token!, v).then(onSaved)}
        />
      </div>
    </Card>
  );
}

/* ── Step 2: every doctor ───────────────────────────────────────────────── */

function ProfessionalStep({
  status,
  canManage,
  onSaved,
  token,
}: {
  status: RegistryStatus;
  canManage: boolean;
  onSaved: (s: RegistryStatus) => void;
  token: string | null;
}) {
  const registered = status.doctors.filter((d) => d.hprId).length;
  const total = status.doctors.length;
  return (
    <Card>
      <StepHeader
        n={2}
        icon={Stethoscope}
        title="Each doctor registers themselves — HPR"
        subtitle="Healthcare Professional Registry · one id per doctor"
        done={total > 0 && registered === total}
        count={total > 0 ? `${registered} of ${total}` : undefined}
      />

      <div className="mt-5 grid gap-6 lg:grid-cols-2">
        <div>
          {/* Stated plainly because admins reasonably assume they can do this on
              a doctor's behalf, try, and get stuck at an Aadhaar OTP that goes
              to someone else's phone. */}
          <p className="text-sm text-slate-600 leading-relaxed">
            <span className="font-semibold text-slate-800">
              The clinic cannot do this for a doctor.
            </span>{' '}
            Registration is verified against the doctor's own Aadhaar, so each of them signs up
            personally and reports the id back.
          </p>
          <Checklist
            items={[
              'Medical council registration number',
              'A PHOTO of the council certificate — all four corners visible',
              'Passport-size photo on a plain background',
              'Signature on white paper — this prints on ABDM prescriptions',
              'Aadhaar-linked mobile for the KYC OTP',
            ]}
          />
          <PortalLink
            href={HPR_PORTAL}
            label="Open the professional portal"
            note="About 30 minutes · verified in 3–5 working days"
          />
        </div>

        <div>
          {total === 0 ? (
            <p className="text-sm text-slate-500 rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center">
              No doctors added yet. Add them under <span className="font-medium">Doctors</span> first.
            </p>
          ) : (
            <div className="space-y-3">
              {status.doctors.map((d) => (
                <DoctorRow
                  key={d.id}
                  doctor={d}
                  disabled={!canManage}
                  onSave={(v) => saveProfessionalId(token!, d.id, v).then(onSaved)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

const DoctorRow: FC<{
  doctor: ProfessionalRegistration;
  disabled: boolean;
  onSave: (value: string) => Promise<unknown>;
}> = ({ doctor, disabled, onSave }) => {
  return (
    <div className="rounded-xl border border-slate-200 p-3.5">
      <div className="flex items-center justify-between gap-3 mb-2.5">
        <div className="min-w-0">
          <p className="font-semibold text-slate-900 text-sm truncate">{doctor.name}</p>
          <p className="text-xs text-slate-500 truncate">{doctor.speciality}</p>
        </div>
        {doctor.hprId ? (
          <Badge tone="emerald">
            <CheckCircle2 className="w-3.5 h-3.5" /> Registered
          </Badge>
        ) : (
          <Badge tone="slate">Waiting</Badge>
        )}
      </div>
      <IdBox
        label=""
        compact
        value={doctor.hprId}
        placeholder="HPR ID"
        disabled={disabled}
        onSave={onSave}
      />
    </div>
  );
};

/* ── One id, one box ────────────────────────────────────────────────────── */

// Blank saves as CLEARED, matching the server. A registry id has no format to
// validate, so a typo is accepted in silence; if blank meant "leave alone",
// a wrong id could never be taken back out.
function IdBox({
  label,
  value,
  placeholder,
  disabled,
  compact,
  onSave,
}: {
  label: string;
  value: string | null;
  placeholder: string;
  disabled: boolean;
  compact?: boolean;
  onSave: (value: string) => Promise<unknown>;
}) {
  const [draft, setDraft] = useState(value ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Every save replaces the whole status object, so a fresh value has to reach
  // the box — otherwise it keeps showing what was typed before the server
  // trimmed it.
  useEffect(() => setDraft(value ?? ''), [value]);

  const dirty = draft.trim() !== (value ?? '');

  const save = async () => {
    setSaving(true);
    setErr(null);
    try {
      await onSave(draft.trim());
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={compact ? '' : 'rounded-xl bg-slate-50 border border-slate-200 p-5'}>
      {label && <p className="text-sm font-semibold text-slate-800 mb-2">{label}</p>}
      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className={`${inputClass} ${compact ? 'py-2 text-sm' : ''}`}
        />
        <PrimaryButton
          onClick={save}
          disabled={disabled || saving || !dirty}
          className={compact ? '!px-3 !py-2' : ''}
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        </PrimaryButton>
      </div>
      {err && <p className="mt-2 text-xs text-rose-600">{err}</p>}
      {saved && !err && <p className="mt-2 text-xs text-emerald-600">Saved</p>}
      {!compact && !err && !saved && (
        <p className="mt-2 text-xs text-slate-500">
          Leave blank and save to remove an id entered by mistake.
        </p>
      )}
    </div>
  );
}

/* ── Small parts ────────────────────────────────────────────────────────── */

function StepHeader({
  n,
  icon: Icon,
  title,
  subtitle,
  done,
  count,
}: {
  n: number;
  icon: LucideIcon;
  title: string;
  subtitle: string;
  done: boolean;
  count?: string;
}) {
  return (
    <div className="flex items-start gap-4">
      <div
        className={`shrink-0 w-11 h-11 rounded-xl flex items-center justify-center ${
          done ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600'
        }`}
      >
        {done ? <CheckCircle2 className="w-5 h-5" /> : <Icon className="w-5 h-5" />}
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Step {n}</span>
          {count && <span className="text-xs font-semibold text-slate-500">{count}</span>}
        </div>
        <h2 className="text-lg font-bold text-slate-900 mt-0.5">{title}</h2>
        <p className="text-sm text-slate-500">{subtitle}</p>
      </div>
    </div>
  );
}

function Checklist({ items }: { items: string[] }) {
  return (
    <ul className="mt-4 space-y-1.5">
      {items.map((item) => (
        <li key={item} className="flex gap-2.5 text-sm text-slate-600">
          <span className="mt-[7px] w-1.5 h-1.5 rounded-full bg-slate-300 shrink-0" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function PortalLink({ href, label, note }: { href: string; label: string; note: string }) {
  return (
    <div className="mt-5">
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 text-sm font-semibold text-blue-600 hover:text-blue-700"
      >
        {label} <ExternalLink className="w-3.5 h-3.5" />
      </a>
      <p className="text-xs text-slate-500 mt-1">{note}</p>
    </div>
  );
}

// The two reasons applications actually come back rejected. Worth the space:
// each one costs a clinic several days, and neither is guessable.
function Pitfalls() {
  return (
    <div className="mt-8 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
      <div className="flex gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="space-y-2.5 text-sm text-amber-900">
          <p className="font-semibold">Two things that get applications rejected</p>
          <p>
            <span className="font-medium">Do not upload a scanned PDF</span> of the council
            certificate. The portal wants an image — a clear phone photo works.
          </p>
          <p>
            <span className="font-medium">A lapsed council registration will fail.</span> The
            registry checks with the council, so renew first if it is due.
          </p>
        </div>
      </div>
    </div>
  );
}
