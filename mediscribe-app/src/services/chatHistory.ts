// Persistence for the analytics assistant's conversation.
//
// Scoped per account like the rest of device storage — on a shared handset the
// previous doctor's questions (and the figures in the answers) must not be
// readable by whoever signs in next.
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface StoredMessage {
  role: 'user' | 'assistant';
  content: string;
}

// Version suffix (v2): conversations saved before the assistant's concise
// answers + card rendering held verbose text and markdown tables that render
// badly in the new UI. Bumping the key starts those accounts fresh rather than
// migrating stale message shapes.
const BASE_KEY = 'novascribe.assistant.v2';

let scope: string | null = null;

/** Published by AuthProvider whenever the signed-in account changes. */
export function setChatScope(userId: string | null): void {
  scope = userId || null;
}

const key = () => (scope ? `${BASE_KEY}.${scope}` : BASE_KEY);

// Older turns are dropped on save: the server only uses the last few for
// context, and an unbounded transcript would grow without limit on the device.
const MAX_TURNS = 40;

export async function loadConversation(): Promise<StoredMessage[]> {
  try {
    const raw = await AsyncStorage.getItem(key());
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveConversation(messages: unknown[]): Promise<void> {
  try {
    await AsyncStorage.setItem(key(), JSON.stringify(messages.slice(-MAX_TURNS)));
  } catch {
    // Losing the transcript is not worth surfacing an error for.
  }
}

export async function clearConversation(): Promise<void> {
  try {
    await AsyncStorage.removeItem(key());
  } catch {
    /* ignore */
  }
}
