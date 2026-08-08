// Where uploaded files live.
//
// Consultation audio is a patient's recorded visit — it has to survive a deploy,
// and it must never be readable by another clinic. This port is the seam that
// makes both true regardless of where the bytes actually sit.
//
// Keys are ALWAYS clinic-scoped: `clinics/<clinicId>/...`. That is not decoration
// — it is what lets a read be checked against the caller's clinic with a string
// comparison instead of a lookup, and it means a misconfigured bucket leaks a
// path, not a patient.

export interface StoredObject {
  body: Buffer;
  contentType: string;
}

export interface StoragePort {
  /** Human-readable name of the backend, for logs and the health check. */
  readonly name: string;
  /** True when files survive a restart. Local disk on Railway does not. */
  readonly durable: boolean;
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<StoredObject | null>;
  delete(key: string): Promise<void>;
}

/** Build a clinic-scoped key. The only supported way to name an object. */
export const objectKey = (clinicId: string, folder: string, fileName: string): string =>
  `clinics/${clinicId}/${folder}/${fileName}`;

/**
 * The clinic a key belongs to, or null if it isn't a well-formed key. Used to
 * refuse a read whose key doesn't match the caller's clinic — the check that
 * makes one clinic's audio unreachable from another's session.
 */
export const clinicOfKey = (key: string): string | null => {
  const m = /^clinics\/([^/]+)\//.exec(key || '');
  return m ? m[1] : null;
};
