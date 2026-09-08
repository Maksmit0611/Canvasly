import {
  DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client,
} from '@aws-sdk/client-s3';
import { config } from '../config.js';
import { notFound } from '../errors.js';
import type { StorageAdapter } from './StorageAdapter.js';

/**
 * S3-compatible storage (Cloudflare R2 in production). Railway's filesystem is
 * ephemeral, so local storage would silently lose every upload on redeploy.
 */
export class S3Storage implements StorageAdapter {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor() {
    if (!config.S3_BUCKET || !config.S3_ACCESS_KEY_ID || !config.S3_SECRET_ACCESS_KEY) {
      throw new Error('S3 storage selected but S3_* configuration is incomplete');
    }

    this.bucket = config.S3_BUCKET;
    this.client = new S3Client({
      region: config.S3_REGION,
      endpoint: config.S3_ENDPOINT,
      credentials: {
        accessKeyId: config.S3_ACCESS_KEY_ID,
        secretAccessKey: config.S3_SECRET_ACCESS_KEY,
      },
    });
  }

  async put(key: string, data: Buffer, mimeType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: data, ContentType: mimeType }),
    );
  }

  async get(key: string): Promise<Buffer> {
    const stream = await this.getStream(key);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  async getStream(key: string): Promise<NodeJS.ReadableStream> {
    try {
      const result = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      if (!result.Body) throw notFound('Asset file');
      return result.Body as NodeJS.ReadableStream;
    } catch {
      throw notFound('Asset file');
    }
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async url(key: string): Promise<string> {
    return `/api/assets/${encodeURIComponent(key)}/raw`;
  }
}
