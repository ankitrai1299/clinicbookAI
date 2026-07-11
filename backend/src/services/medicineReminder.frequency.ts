// Pure helpers that turn a prescription's free-text frequency/duration into a
// concrete daily reminder SCHEDULE (clinic-local "HH:MM" times) + a course length
// in days. Deliberately conservative: an unrecognised or "as-needed" frequency
// yields NO scheduled times (we never guess a reminder we aren't sure about).

// Default clinic-local times for a given number of doses/day. Chosen to sit at
// sensible waking hours; a clinic can tune these later via config if needed.
const TIMES_BY_COUNT: Record<number, string[]> = {
  1: ['09:00'],
  2: ['09:00', '21:00'],
  3: ['08:00', '14:00', '20:00'],
  4: ['08:00', '12:00', '16:00', '20:00']
};

// Position → clock time for an "x-x-x[-x]" (morning-afternoon-night[-bedtime]) pattern.
const POSITION_TIMES = ['08:00', '14:00', '20:00', '22:00'];

/**
 * Parse a frequency string into the clinic-local times a reminder should fire.
 * Returns [] when there is nothing sensible to schedule (unknown, or as-needed).
 */
export function parseFrequencyTimes(frequency: string): string[] {
  const f = (frequency || '').toLowerCase().trim();
  if (!f) return [];

  // As-needed / SOS / PRN → no fixed schedule (patient takes it when required).
  if (/\b(sos|prn|as needed|as required|when required|if needed)\b/.test(f)) return [];

  // Explicit "1-0-1" / "1-1-1" / "0-0-1" (morning-afternoon-night[-bedtime]).
  const dashed = f.match(/^(\d)\s*-\s*(\d)\s*-\s*(\d)(?:\s*-\s*(\d))?$/);
  if (dashed) {
    const times: string[] = [];
    [dashed[1], dashed[2], dashed[3], dashed[4]].forEach((v, i) => {
      if (v && Number(v) > 0) times.push(POSITION_TIMES[i]);
    });
    return times;
  }

  // "every N hours" → N-hourly, capped to 1–4 doses/day.
  const everyHrs = f.match(/every\s*(\d{1,2})\s*(hours?|hrs?|h)\b/);
  if (everyHrs) {
    const h = Number(everyHrs[1]);
    if (h > 0) return TIMES_BY_COUNT[Math.max(1, Math.min(4, Math.round(24 / h)))];
  }

  // Bedtime only.
  if (/\b(hs|at bedtime|bedtime|at night)\b/.test(f)) return ['22:00'];

  // Standard medical shorthand + plain English.
  if (/\b(qid|qds|four times|4 times|1-1-1-1)\b/.test(f)) return TIMES_BY_COUNT[4];
  if (/\b(tds|tid|thrice|three times|3 times)\b/.test(f)) return TIMES_BY_COUNT[3];
  if (/\b(bd|bid|twice|two times|2 times)\b/.test(f)) return TIMES_BY_COUNT[2];
  if (/\b(od|qd|once|one time|1 time|daily|every day)\b/.test(f)) return TIMES_BY_COUNT[1];

  // Natural time-of-day words ("night only", "morning and night", "subah shaam").
  const tod: string[] = [];
  if (/\b(morning|subah)\b/.test(f)) tod.push('08:00');
  if (/\b(afternoon|noon|dopahar)\b/.test(f)) tod.push('14:00');
  if (/\b(evening|shaam)\b/.test(f)) tod.push('18:00');
  if (/\b(night|raat)\b/.test(f)) tod.push('20:00');
  if (tod.length) return [...new Set(tod)].sort();

  return []; // unknown → schedule nothing rather than guess
}

/**
 * Parse a duration string ("5 days", "1 week", "2 months", bare "7") into a
 * course length in days. null = open-ended / unknown (caller applies a cap).
 */
export function parseDurationDays(duration: string): number | null {
  const d = (duration || '').toLowerCase().trim();
  if (!d) return null;
  const wk = d.match(/(\d+)\s*(weeks?|wks?)\b/);
  if (wk) return Number(wk[1]) * 7;
  const mo = d.match(/(\d+)\s*(months?|mnths?|mo)\b/);
  if (mo) return Number(mo[1]) * 30;
  const dy = d.match(/(\d+)\s*(days?|d)\b/);
  if (dy) return Number(dy[1]);
  const bare = d.match(/^(\d+)$/);
  if (bare) return Number(bare[1]);
  return null;
}

// A one-line human label for the medicine, used in the reminder message.
export function medicineLabel(m: {
  medicine?: string; strength?: string; dose?: string; timing?: string;
}): string {
  const name = [m.medicine, m.strength].filter(Boolean).join(' ').trim() || 'your medicine';
  const detail = [m.dose, m.timing].map((s) => (s || '').trim()).filter(Boolean).join(', ');
  return detail ? `${name} — ${detail}` : name;
}
