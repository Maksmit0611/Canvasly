import { config } from '../config.js';
import { LocalStorage } from './LocalStorage.js';
import { S3Storage } from './S3Storage.js';
import type { StorageAdapter } from './StorageAdapter.js';

let instance: StorageAdapter | null = null;

/**
 * The single storage instance, chosen by STORAGE_DRIVER. Routes depend only on
 * the interface, so switching drivers never touches them.
 */
export function storage(): StorageAdapter {
  if (!instance) {
    instance = config.STORAGE_DRIVER === 's3' ? new S3Storage() : new LocalStorage();
  }
  return instance;
}

export type { StorageAdapter };
