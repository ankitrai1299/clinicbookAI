// Is this visit's scribe window open right now?
//
// Mirrors `scribeWindow` in the backend (products/mediscribe/clinicData.ts),
// which is where it is tested. Both sides compare the SAME two absolute instants
// the server sent, so neither has to rebuild the moment from a date, a
// "03:00 PM" label and a timezone — three chances to disagree, each showing up
// as a Start button missing for no visible reason.
//
// Unusable values return 'open'. A doctor who cannot record the patient in front
// of them is a worse failure than one recording slightly outside the window.
export type ScribeWindow = 'early' | 'open' | 'closed';

export const scribeWindow = (
  opensAt: string | undefined,
  closesAt: string | undefined,
  now: Date = new Date(),
): ScribeWindow => {
  const o = Date.parse(String(opensAt ?? ''));
  const c = Date.parse(String(closesAt ?? ''));
  if (!Number.isFinite(o) || !Number.isFinite(c)) return 'open';
  const t = now.getTime();
  if (t < o) return 'early';
  if (t >= c) return 'closed';
  return 'open';
};
