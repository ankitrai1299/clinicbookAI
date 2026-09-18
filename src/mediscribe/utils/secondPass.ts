// Is a second pass over the same audio worth paying for?
//
// The recording goes through Sarvam once while the doctor speaks, and it used
// to go through again the moment they pressed Stop. That second pass is the
// single largest line in the product's bill — transcription is about ₹10 per
// ten-minute consultation instead of ₹5, and at ten clinics of five thousand
// patients it is roughly ₹2.5 lakh a month for the same words twice.
//
// It is not removed, because it earns its keep when the live pass fails: the
// socket never opened and the browser's own recogniser filled in (poor at
// Indian languages, never trusted as the record), or the stream dropped and
// came back with a hole in the middle. Both look the same from here — far
// fewer words than the length of the recording can explain.

/** The floor, not the expectation.
 *
 *  Two people talking produce well over a hundred words a minute. A
 *  consultation that yields under forty had something go wrong, and that is the
 *  case worth paying to check. Deliberately low: paying for a pass we did not
 *  need costs about ₹5, and skipping one we did costs the doctor part of their
 *  consultation. The two mistakes are not the same size, so the threshold sits
 *  well below the truth. */
export const MIN_WORDS_PER_MINUTE = 40;

export interface SecondPassInput {
  /** Did OUR gateway produce the live transcript, rather than the browser? */
  gatewayLive: boolean;
  /** Words in the live transcript. */
  liveWords: number;
  /** How long the recording ran, in seconds. */
  seconds: number;
}

/**
 * True when the recording should be transcribed again.
 *
 * Errs towards YES. Every uncertain case — no live transcript, the browser
 * recogniser, a suspiciously short one — pays for the second pass, because the
 * thing being protected is the consultation, not the five rupees.
 */
export const needsSecondPass = ({ gatewayLive, liveWords, seconds }: SecondPassInput): boolean => {
  if (!gatewayLive) return true;            // browser recogniser, or none at all
  if (liveWords <= 0) return true;          // nothing came back
  const minutes = Math.max(seconds, 1) / 60;
  return liveWords < minutes * MIN_WORDS_PER_MINUTE;
};
