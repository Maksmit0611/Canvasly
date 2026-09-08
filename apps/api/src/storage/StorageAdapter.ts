export interface StorageAdapter {
  put(key: string, data: Buffer, mimeType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  getStream(key: string): Promise<NodeJS.ReadableStream>;
  delete(key: string): Promise<void>;
  url(key: string): Promise<string>;
}
