import { useEffect, useState } from 'react';
import { CalendarPlus, Check, AlertCircle } from 'lucide-react';
import { getClinicDoctors, bookFollowUp, type ClinicDoctor } from '../services/api';
import { parseFollowUpDate, toISODate, FOLLOW_UP_TIMES } from '../utils/followUpDate';

// Book the follow-up the note already describes.
//
// The report's follow-up date has always been free text that printed on the PDF
// and then went nowhere — someone re-entered it into the appointment system by
// hand, or the patient simply never came back. This turns it into a real booking.
//
// The parsed date only PRE-FILLS the form. The doctor sees the date and confirms,
// so "after 3 days" being read wrong costs a correction, never a wrong appointment.

interface Props {
  consultationId: string;
  /** The free-text follow-up line from the report, e.g. "review after 1 week". */
  followUpText?: string;
  /** Set once booked, so we show the booking instead of offering it again. */
  bookedAppointmentId?: string;
  /** Name of the attending doctor, used to pre-select them in the list. */
  doctorName?: string;
  onBooked?: (appointmentId: string) => void;
}

export default function FollowUpBooking({
  consultationId,
  followUpText,
  bookedAppointmentId,
  doctorName,
  onBooked,
}: Props) {
  const [open, setOpen] = useState(false);
  const [doctors, setDoctors] = useState<ClinicDoctor[]>([]);
  const [doctorId, setDoctorId] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState(FOLLOW_UP_TIMES[2]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [booked, setBooked] = useState<{ date: string; time: string } | null>(null);

  // Pre-fill from what the note says, falling back to a week out — a follow-up
  // with no stated interval is still usually a follow-up.
  useEffect(() => {
    if (!open) return;
    const guess = parseFollowUpDate(followUpText);
    const week = new Date();
    week.setDate(week.getDate() + 7);
    setDate(guess ?? toISODate(week));
  }, [open, followUpText]);

  useEffect(() => {
    if (!open || doctors.length) return;
    void getClinicDoctors().then((list) => {
      setDoctors(list);
      // Pre-select the doctor who saw the patient, when we can recognise them.
      const bare = (n: string) => n.replace(/^dr\.?\s*/i, '').trim().toLowerCase();
      const mine = doctorName ? list.find((d) => bare(d.name) === bare(doctorName)) : undefined;
      setDoctorId((mine ?? list[0])?.id ?? '');
    });
  }, [open, doctors.length, doctorName]);

  const submit = async () => {
    setError('');
    setBusy(true);
    try {
      const result = await bookFollowUp(consultationId, { doctorId, date, time });
      setBooked({ date: result.date, time: result.time });
      setOpen(false);
      onBooked?.(result.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not book the follow-up');
    } finally {
      setBusy(false);
    }
  };

  if (booked || bookedAppointmentId) {
    return (
      <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-md px-3 py-2 mt-3">
        <Check size={14} className="flex-shrink-0" />
        <span>
          Follow-up booked{booked ? ` — ${booked.date} at ${booked.time}` : ''}. The patient gets the
          usual reminders.
        </span>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 mt-3 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors"
      >
        <CalendarPlus size={14} /> Book this follow-up
      </button>
    );
  }

  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3">
      <div className="grid sm:grid-cols-3 gap-2">
        <label className="text-[11px] font-semibold text-slate-600">
          Doctor
          <select
            value={doctorId}
            onChange={(e) => setDoctorId(e.target.value)}
            className="mt-1 w-full text-xs border border-slate-200 rounded-md px-2 py-1.5 bg-white"
          >
            {doctors.length === 0 && <option value="">Loading…</option>}
            {doctors.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
                {d.speciality ? ` · ${d.speciality}` : ''}
              </option>
            ))}
          </select>
        </label>

        <label className="text-[11px] font-semibold text-slate-600">
          Date
          <input
            type="date"
            value={date}
            min={toISODate(new Date())}
            onChange={(e) => setDate(e.target.value)}
            className="mt-1 w-full text-xs border border-slate-200 rounded-md px-2 py-1.5 bg-white"
          />
        </label>

        <label className="text-[11px] font-semibold text-slate-600">
          Time
          <select
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="mt-1 w-full text-xs border border-slate-200 rounded-md px-2 py-1.5 bg-white"
          >
            {FOLLOW_UP_TIMES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
      </div>

      {followUpText && (
        <p className="text-[11px] text-slate-500 mt-2">
          From the note: “{followUpText}”
        </p>
      )}

      {error && (
        <p className="flex items-start gap-1.5 text-[11px] text-amber-700 mt-2">
          <AlertCircle size={12} className="mt-px flex-shrink-0" />
          <span>{error}</span>
        </p>
      )}

      <div className="flex gap-2 mt-3">
        <button
          type="button"
          onClick={submit}
          disabled={busy || !doctorId || !date}
          className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed text-white px-3 py-1.5 rounded-md text-xs font-semibold transition-colors"
        >
          <CalendarPlus size={14} /> {busy ? 'Booking…' : 'Confirm booking'}
        </button>
        <button
          type="button"
          onClick={() => { setOpen(false); setError(''); }}
          className="text-xs font-semibold text-slate-500 hover:text-slate-700 px-2"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
