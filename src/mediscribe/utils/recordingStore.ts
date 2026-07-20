// Crash-safe recording store.
//
// MediaRecorder chunks normally live only in memory, so a reload, a crash, an
// incoming call or a closed tab mid-consultation loses the entire recording — and
// if the transcription upload fails, the audio is dropped with it. This store
// writes every chunk to IndexedDB the moment it is produced, so the audio
// survives all of that and can be recovered (or retried) afterwards.
//
// Every write is best-effort: recording must never break because storage did.

const DB_NAME = 'novascribe-recordings';
const DB_VERSION = 1;
const STORE = 'chunks';
const BY_CONSULTATION = 'byConsultation';

interface ChunkRecord {
  id?: number;
  consultationId: string;
  seq: number;
  blob: Blob;
  mimeType: string;
  at: number;
}

const supported = (): boolean => typeof indexedDB !== 'undefined';

function openDb(): Promise<IDBDatabase | null> {
  if (!supported()) return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
          store.createIndex(BY_CONSULTATION, 'consultationId', { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/** Append one recorded chunk. Fire-and-forget; never throws. */
export async function saveChunk(
  consultationId: string,
  blob: Blob,
  seq: number,
  mimeType: string,
): Promise<void> {
  if (!consultationId || !blob?.size) return;
  try {
    const db = await openDb();
    if (!db) return;
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      const rec: ChunkRecord = { consultationId, seq, blob, mimeType, at: Date.now() };
      tx.objectStore(STORE).add(rec);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
    db.close();
  } catch {
    /* storage full / private mode — recording continues regardless */
  }
}

export interface StoredRecording {
  blob: Blob;
  chunks: number;
  /** Wall-clock span the chunks cover, in seconds (approximate). */
  seconds: number;
  savedAt: number;
}

/** Rebuild a previously-recorded blob for a consultation, or null if none. */
export async function loadRecording(consultationId: string): Promise<StoredRecording | null> {
  if (!consultationId) return null;
  try {
    const db = await openDb();
    if (!db) return null;
    const records = await new Promise<ChunkRecord[]>((resolve) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).index(BY_CONSULTATION).getAll(consultationId);
      req.onsuccess = () => resolve((req.result as ChunkRecord[]) || []);
      req.onerror = () => resolve([]);
    });
    db.close();
    if (!records.length) return null;

    records.sort((a, b) => a.seq - b.seq);
    const mimeType = records[0].mimeType || records[0].blob.type || 'audio/webm';
    const blob = new Blob(records.map((r) => r.blob), { type: mimeType });
    if (blob.size < 2000) return null; // too small to be usable audio

    const first = records[0].at;
    const last = records[records.length - 1].at;
    return {
      blob,
      chunks: records.length,
      seconds: Math.max(0, Math.round((last - first) / 1000)),
      savedAt: last,
    };
  } catch {
    return null;
  }
}

/** Drop a consultation's stored chunks (after a successful transcription, or on discard). */
export async function clearRecording(consultationId: string): Promise<void> {
  if (!consultationId) return;
  try {
    const db = await openDb();
    if (!db) return;
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const req = store.index(BY_CONSULTATION).getAllKeys(consultationId);
      req.onsuccess = () => {
        for (const key of (req.result as IDBValidKey[]) || []) store.delete(key);
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
    db.close();
  } catch {
    /* best-effort */
  }
}
