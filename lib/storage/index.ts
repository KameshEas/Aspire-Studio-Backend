/**
 * Storage adapter — abstracts local filesystem (dev) and S3-compatible (prod).
 * Controlled by STORAGE_TYPE env var: "local" | "s3"
 */
import fs from "fs";
import path from "path";

export interface StorageUploadResult {
  /** Opaque URL/key — use getSignedUrl() or getPublicUrl() to access */
  storageKey: string;
  sizeBytes: number;
}

export interface StorageAdapter {
  upload(key: string, data: Buffer, mimeType: string): Promise<StorageUploadResult>;
  getSignedUrl(storageKey: string, expiresInSeconds?: number): Promise<string>;
  delete(storageKey: string): Promise<void>;
}

// ── Local filesystem adapter ────────────────────────────────────────────────

class LocalStorageAdapter implements StorageAdapter {
  private basePath: string;

  constructor(basePath?: string) {
    this.basePath = basePath ?? process.env.LOCAL_STORAGE_PATH ?? "./storage";
    fs.mkdirSync(this.basePath, { recursive: true });
  }

  async upload(key: string, data: Buffer, _mimeType: string): Promise<StorageUploadResult> {
    const filePath = path.join(this.basePath, key);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, data);
    return { storageKey: key, sizeBytes: data.length };
  }

  async getSignedUrl(storageKey: string, _expiresInSeconds = 3600): Promise<string> {
    // In local dev, serve via /api/v1/storage/[...key] pass-through route
    return `/api/v1/storage/${storageKey}`;
  }

  async delete(storageKey: string): Promise<void> {
    const filePath = path.join(this.basePath, storageKey);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  /** Read raw file — used by the local storage serve route */
  readFile(storageKey: string): Buffer | null {
    const filePath = path.join(this.basePath, storageKey);
    if (!fs.existsSync(filePath)) return null;
    return fs.readFileSync(filePath);
  }
}

// ── Singleton factory ────────────────────────────────────────────────────────

let storageInstance: StorageAdapter | null = null;

export function getStorage(): StorageAdapter {
  if (storageInstance) return storageInstance;

  const type = process.env.STORAGE_TYPE ?? "local";

  if (type === "local") {
    storageInstance = new LocalStorageAdapter();
  } else {
    // S3 — defer to Phase 4 full implementation; for now throw a clear error
    throw new Error(
      "S3 storage adapter not yet implemented. Set STORAGE_TYPE=local for development."
    );
  }

  return storageInstance;
}

/** Expose LocalStorageAdapter for the file-serve route */
export { LocalStorageAdapter };
