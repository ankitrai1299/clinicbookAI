// Audio storage contract. Local filesystem for dev; swap for S3 / Supabase
// Storage in production (encrypted, with retention) WITHOUT touching callers.

export interface AudioStorage {
  readonly name: string;
  /** Persist bytes under `key`; returns the storage-relative key/path. */
  save(key: string, data: Buffer, contentType?: string): Promise<string>;
  read(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}
