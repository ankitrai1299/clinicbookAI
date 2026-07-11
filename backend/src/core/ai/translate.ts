// Lightweight text translation via Sarvam's Translate API (mayura:v1). Self-
// contained (reads SARVAM_API_KEY / SARVAM_API_URL directly) so core/ never
// imports a product. Best-effort: on any failure it returns the ORIGINAL text,
// so a translation hiccup can never break a WhatsApp reply.

const sarvamKey = (): string => (process.env.SARVAM_API_KEY || '').trim();
const sarvamOrigin = (): string => {
  const raw = (process.env.SARVAM_API_URL || '').trim();
  try {
    return raw ? new URL(raw).origin : 'https://api.sarvam.ai';
  } catch {
    return 'https://api.sarvam.ai';
  }
};

// Our language code → Sarvam Translate language code. mayura:v1 covers all of
// these except Urdu (handled by the caller, which skips it).
const SARVAM_LANG: Record<string, string> = {
  en: 'en-IN', hi: 'hi-IN', ta: 'ta-IN', te: 'te-IN', bn: 'bn-IN', mr: 'mr-IN',
  gu: 'gu-IN', kn: 'kn-IN', ml: 'ml-IN', pa: 'pa-IN'
};

export const isTranslatable = (lang: string): boolean => lang in SARVAM_LANG;

const CHUNK = 900; // mayura:v1 accepts ~1000 chars/request

// Split on line/sentence boundaries so each piece stays under the limit.
const chunk = (text: string): string[] => {
  if (text.length <= CHUNK) return [text];
  const out: string[] = [];
  let buf = '';
  for (const part of text.split(/(\n+)/)) {
    if ((buf + part).length > CHUNK && buf) {
      out.push(buf);
      buf = '';
    }
    buf += part;
    while (buf.length > CHUNK) {
      out.push(buf.slice(0, CHUNK));
      buf = buf.slice(CHUNK);
    }
  }
  if (buf) out.push(buf);
  return out;
};

const translateChunk = async (text: string, target: string, source: string): Promise<string> => {
  const res = await fetch(`${sarvamOrigin()}/translate`, {
    method: 'POST',
    headers: { 'api-subscription-key': sarvamKey(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input: text,
      source_language_code: source === 'auto' ? 'auto' : SARVAM_LANG[source] ?? 'auto',
      target_language_code: SARVAM_LANG[target],
      model: 'mayura:v1'
    })
  });
  if (!res.ok) throw new Error(`sarvam translate ${res.status}`);
  const data = (await res.json()) as any;
  return (data?.translated_text ?? text).toString();
};

/**
 * Translate `text` into `targetLang` (our code, e.g. 'hi'). `sourceLang` defaults
 * to auto-detect. Returns the original text unchanged when translation is not
 * possible (no key, unsupported language, same language, or an API error).
 */
export const translateText = async (
  text: string,
  targetLang: string,
  sourceLang: string = 'auto'
): Promise<string> => {
  const body = (text || '').trim();
  if (!body) return text;
  if (!sarvamKey()) return text;
  if (targetLang === sourceLang) return text;
  if (!isTranslatable(targetLang)) return text; // e.g. Urdu → leave as-is

  try {
    const parts = chunk(text);
    const translated = await Promise.all(parts.map((p) => translateChunk(p, targetLang, sourceLang)));
    return translated.join('');
  } catch (err) {
    console.error('[translate] failed — returning original:', (err as Error).message);
    return text;
  }
};
