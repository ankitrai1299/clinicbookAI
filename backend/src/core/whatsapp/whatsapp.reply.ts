// ===========================================================================
// BotReply — the value the FSM returns for one turn.
//
//   - a plain `string`  → sent as a WhatsApp text message (current behaviour)
//   - an InteractiveReply → sent as WhatsApp interactive buttons or a list
//
// The FSM builds these; the inbound dispatcher (whatsapp.inbound.ts) sends the
// right Graph API shape. Interactive replies carry STABLE option ids (see RID /
// optionId) so that when the patient taps a button/row, the inbound webhook can
// normalise the id back into the exact text the deterministic handlers already
// accept ("1", "yes", "more", …). The state machine core is unchanged: a tap is
// just another way to type the same answer.
// ===========================================================================

export interface ReplyButton {
  id: string; // ≤256 chars; matched on tap
  title: string; // shown on the button, ≤20 chars (WhatsApp limit)
}

export interface ReplyRow {
  id: string; // ≤200 chars
  title: string; // ≤24 chars
  description?: string; // ≤72 chars
}

export interface ButtonReply {
  kind: 'buttons';
  body: string;
  buttons: ReplyButton[]; // 1–3 (WhatsApp caps at 3)
  header?: string;
  footer?: string;
}

export interface ListReply {
  kind: 'list';
  body: string;
  button: string; // label of the button that opens the list, ≤20 chars
  rows: ReplyRow[]; // 1–10 (WhatsApp caps at 10 per section)
  header?: string;
  footer?: string;
  sectionTitle?: string;
}

export type InteractiveReply = ButtonReply | ListReply;
export type BotReply = string | InteractiveReply;

export const isInteractive = (r: BotReply): r is InteractiveReply =>
  typeof r === 'object' && r !== null && 'kind' in r;

// --- Stable reply ids -----------------------------------------------------
// Fixed ids for top-level / control actions, plus an OPT_<n> scheme for the
// "pick item N from the list I just showed" selections that map onto the FSM's
// existing numbered-choice parser.
export const RID = {
  MENU_BOOK: 'MENU_BOOK',
  MENU_APPTS: 'MENU_APPTS',
  MENU_CANCEL: 'MENU_CANCEL',
  MENU_RESCHED: 'MENU_RESCHED',
  CONF_YES: 'CONF_YES',
  CONF_NO: 'CONF_NO',
  CHANGE_TIME: 'CHANGE_TIME',
  TALK_HUMAN: 'TALK_HUMAN',
  MORE: 'MORE',
  BOOK_AGAIN: 'BOOK_AGAIN'
} as const;

export const OPT_PREFIX = 'OPT_';
export const optionId = (n: number): string => `${OPT_PREFIX}${n}`;

// --- Builders -------------------------------------------------------------
export const buttons = (opts: Omit<ButtonReply, 'kind'>): ButtonReply => ({ kind: 'buttons', ...opts });
export const list = (opts: Omit<ListReply, 'kind'>): ListReply => ({ kind: 'list', ...opts });

// Prepend text to a reply (used when a handler needs to add a one-line note —
// e.g. "⚠️ that slot was just taken" — above a freshly-rendered list).
export const prefixReply = (prefix: string, reply: BotReply): BotReply =>
  typeof reply === 'string' ? prefix + reply : { ...reply, body: prefix + reply.body };

// Flatten any BotReply to plain text — for WhatsAppLog bodies, the /debug
// diagnostics buffer, and the safe-fallback comparison.
export const botReplyText = (r: BotReply): string => {
  if (typeof r === 'string') return r;
  const opts =
    r.kind === 'buttons'
      ? r.buttons.map((b) => `[${b.title}]`).join(' ')
      : r.rows.map((row, i) => `${i + 1}. ${row.title}${row.description ? ` — ${row.description}` : ''}`).join('\n');
  return [r.header, r.body, opts, r.footer].filter(Boolean).join('\n');
};
