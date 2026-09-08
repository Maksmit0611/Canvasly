import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { notFound } from '../errors.js';
import type { StorageAdapter } from './StorageAdapter.js';

/** Filesystem-backed storage for development. */
export class LocalStorage implements StorageAdapter {
  private readonly root: string;

  constructor(root: string = config.UPLOAD_DIR) {
    this.root = path.resolve(root);
  }

  /**
   * Resolve a key under the storage root, refusing anything that escapes it.
   * Keys are generated server-side, but a traversal check costs nothing and
   * removes a whole class of bug if that ever stops being true.
   */
  private resolve(key: string): string {
    const full = path.resolve(this.root, key);
    if (full !== this.root && !full.startsWith(this.root + path.sep)) {
      throw new Error(`Storage key escapes the upload root: ${key}`);
    }
    return full;
  }

  /** `mimeType` is part of the interface but carries no meaning on disk — the
   *  value is stored on the asset row and set on the response instead. */
  async put(key: string, data: Buffer, _mimeType?: string): Promise<void> {
    const full = this.resolve(key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, data);
  }

  async get(key: string): Promise<Buffer> {
    // Resolve outside the try: a traversal is a programming error and must not
    // be flattened into a 404 alongside an ordinary missing file.
    const full = this.resolve(key);
    try {
      return await fs.readFile(full);
    } catch {
      throw notFound('Asset file');
    }
  }

  async getStream(key: string): Promise<NodeJS.ReadableStream> {
    const full = this.resolve(key);
    // Confirm existence up front so a missing file is a 404, not a mid-stream
    // error after headers have already gone out.
    await fs.access(full).catch(() => {
      throw notFound('Asset file');
    });
    return createReadStream(full);
  }

  async delete(key: string): Promise<void> {
    await fs.rm(this.resolve(key), { force: true });
  }

  async url(key: string): Promise<string> {
    return `/api/assets/${encodeURIComponent(key)}/raw`;
  }
}
