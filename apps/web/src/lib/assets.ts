import type { Asset } from '@canvas/shared';
import { api } from './api';

/**
 * Absolute URL for an asset's bytes. Only useful where the caller can attach
 * the bearer token or a share token — see fetchAssetBytes for the usual path.
 */
export function assetRawUrl(assetId: string, shareToken?: string): string {
  const base = (import.meta.env.VITE_API_URL ?? '/api').replace(/\/$/, '');
  const query = shareToken ? `?token=${encodeURIComponent(shareToken)}` : '';
  return `${base}/assets/${assetId}/raw${query}`;
}

/**
 * Fetch an asset's bytes through the API client.
 *
 * Neither pdf.js nor <img src> can attach an Authorization header, so loading
 * an asset by URL would be rejected. Pulling the bytes through axios keeps a
 * single auth mechanism instead of bolting a second one onto asset URLs.
 */
export async function fetchAssetBytes(
  assetId: string,
  shareToken?: string,
): Promise<ArrayBuffer> {
  const { data } = await api.get<ArrayBuffer>(`/assets/${assetId}/raw`, {
    responseType: 'arraybuffer',
    params: shareToken ? { token: shareToken } : undefined,
  });
  return data;
}

/** Object URL for an asset, for anything that must consume a real URL. */
export async function fetchAssetObjectUrl(
  assetId: string,
  shareToken?: string,
): Promise<string> {
  const bytes = await fetchAssetBytes(assetId, shareToken);
  return URL.createObjectURL(new Blob([bytes]));
}

/** Read a selected local file as a self-contained data URL for offline boards. */
export function fileToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string'
      ? resolve(reader.result)
      : reject(new Error('Could not read this file'));
    reader.onerror = () => reject(new Error('Could not read this file'));
    reader.readAsDataURL(file);
  });
}

/** Fetch an older online asset once so a desktop board export can include its bytes. */
export async function fetchAssetDataUrl(assetId: string): Promise<string> {
  const { data, headers } = await api.get<ArrayBuffer>(`/assets/${assetId}/raw`, {
    responseType: 'arraybuffer',
  });
  const headerType = headers['content-type'];
  const mimeType = typeof headerType === 'string' ? headerType : 'application/octet-stream';
  return fileToDataUrl(new Blob([data], { type: mimeType }));
}

export async function uploadAsset(projectId: string, file: File): Promise<Asset> {
  const form = new FormData();
  form.append('file', file);

  const { data } = await api.post<Asset>(`/projects/${projectId}/assets`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

/** Natural size of an image file, for placing it at true dimensions. */
export function imageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read the image'));
    };

    img.src = url;
  });
}

export const MAX_PLACED_SIZE = 600;

/** Scale a natural size down to fit a sensible maximum, never scaling up. */
export function fitPlacementSize(
  width: number,
  height: number,
  max = MAX_PLACED_SIZE,
): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}
