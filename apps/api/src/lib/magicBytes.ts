/**
 * Magic-byte detection for the formats this application accepts.
 *
 * Replaces the `file-type` package, which carries a moderate DoS advisory in
 * its ASF parser (GHSA-5v7r-6r5c-r473). We never accept ASF, but that library
 * parses every upload before our allowlist is applied, so a crafted file could
 * hang the parser. Recognising exactly the five formats we permit removes the
 * vulnerable code path and rejects everything else by default.
 */

export type DetectedMime =
  | 'image/png'
  | 'image/jpeg'
  | 'image/webp'
  | 'image/gif'
  | 'application/pdf';

const startsWith = (buffer: Buffer, bytes: readonly number[], offset = 0): boolean => {
  if (buffer.length < offset + bytes.length) return false;
  return bytes.every((byte, i) => buffer[offset + i] === byte);
};

const asciiAt = (buffer: Buffer, text: string, offset: number): boolean =>
  buffer.length >= offset + text.length &&
  buffer.toString('latin1', offset, offset + text.length) === text;

/** The real type of `buffer`, or null when it is not one we accept. */
export function detectMimeType(buffer: Buffer): DetectedMime | null {
  // PNG: \x89PNG\r\n\x1a\n
  if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';

  // JPEG: FFD8FF
  if (startsWith(buffer, [0xff, 0xd8, 0xff])) return 'image/jpeg';

  // GIF: "GIF87a" or "GIF89a"
  if (asciiAt(buffer, 'GIF87a', 0) || asciiAt(buffer, 'GIF89a', 0)) return 'image/gif';

  // WebP: "RIFF" ... "WEBP" — both markers required, so a bare RIFF
  // container (AVI, WAV) is not mistaken for an image.
  if (asciiAt(buffer, 'RIFF', 0) && asciiAt(buffer, 'WEBP', 8)) return 'image/webp';

  // PDF: "%PDF-". Some writers prepend junk, so scan a small window rather
  // than requiring it at offset zero.
  const header = buffer.subarray(0, 1024).toString('latin1');
  if (header.includes('%PDF-')) return 'application/pdf';

  return null;
}
