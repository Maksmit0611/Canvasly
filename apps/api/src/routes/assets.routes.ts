import { createHash } from 'node:crypto';
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { PDFDocument } from 'pdf-lib';
import { fromBuffer as fileTypeFromBuffer } from 'file-type';
import type { AssetKind } from '@canvas/shared';
import { config } from '../config.js';
import { validate } from '../middleware/validate.js';
import { requireAuth, currentUser, optionalAuth } from '../middleware/auth.js';
import { uploadLimiter } from '../middleware/rateLimit.js';
import { createAsset, findAssetByChecksum, findAssetRow } from '../db/queries/assets.js';
import { findProjectForOwner, findProjectById } from '../db/queries/projects.js';
import { findActiveShareLink } from '../db/queries/shareLinks.js';
import { storage } from '../storage/index.js';
import { ApiError, forbidden, notFound } from '../errors.js';
import { logger } from '../logger.js';

export const assetsRouter = Router();

/** Allowed types, keyed by the MIME that magic-byte sniffing reports. */
const ALLOWED: Record<string, { kind: AssetKind; ext: string }> = {
  'image/png': { kind: 'image', ext: 'png' },
  'image/jpeg': { kind: 'image', ext: 'jpg' },
  'image/webp': { kind: 'image', ext: 'webp' },
  'image/gif': { kind: 'image', ext: 'gif' },
  'application/pdf': { kind: 'pdf', ext: 'pdf' },
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.MAX_UPLOAD_BYTES, files: 1 },
});

const IdParams = z.object({ id: z.string().uuid() });

assetsRouter.post(
  '/projects/:id/assets',
  requireAuth,
  uploadLimiter,
  validate({ params: IdParams }),
  (req, res, next) => {
    upload.single('file')(req, res, (err: unknown) => {
      if (!err) {
        next();
        return;
      }
      const code = (err as { code?: string }).code;
      if (code === 'LIMIT_FILE_SIZE') {
        next(new ApiError('PAYLOAD_TOO_LARGE', 'File exceeds the maximum upload size'));
        return;
      }
      next(new ApiError('VALIDATION_ERROR', 'File upload failed'));
    });
  },
  async (req, res, next) => {
    try {
      const user = currentUser(req);
      const projectId = req.params.id!;

      const project = await findProjectForOwner(projectId, user.id);
      if (!project) throw notFound('Project');

      const file = req.file;
      if (!file) throw new ApiError('VALIDATION_ERROR', 'No file was uploaded');

      // Determine the real type from magic bytes, never from the client's
      // Content-Type or the filename — renaming evil.html to nice.png must
      // be rejected here.
      const detected = await fileTypeFromBuffer(file.buffer);
      const allowed = detected ? ALLOWED[detected.mime] : undefined;

      if (!detected || !allowed) {
        throw new ApiError('VALIDATION_ERROR', 'Unsupported file type', {
          detected: detected?.mime ?? 'unknown',
          allowed: Object.keys(ALLOWED),
        });
      }

      const checksum = createHash('sha256').update(file.buffer).digest('hex');

      // Identical content already in this project: reuse it rather than
      // storing a second copy.
      const existing = await findAssetByChecksum(projectId, checksum);
      if (existing) {
        res.status(200).json(existing);
        return;
      }

      let pageCount: number | null = null;
      if (allowed.kind === 'pdf') {
        try {
          const pdf = await PDFDocument.load(file.buffer, { ignoreEncryption: true });
          pageCount = pdf.getPageCount();
        } catch {
          throw new ApiError('VALIDATION_ERROR', 'The PDF could not be read');
        }
      }

      // Storage key is generated, never derived from the uploaded filename.
      const assetId = crypto.randomUUID();
      const storageKey = `${projectId}/${assetId}.${allowed.ext}`;
      await storage().put(storageKey, file.buffer, detected.mime);

      const asset = await createAsset({
        projectId,
        uploaderId: user.id,
        kind: allowed.kind,
        filename: file.originalname.slice(0, 255),
        mimeType: detected.mime,
        sizeBytes: file.size,
        storageKey,
        pageCount,
        checksum,
      });

      res.status(201).json(asset);
    } catch (err) {
      next(err);
    }
  },
);

/** Owner, or the holder of a valid share token, may read an asset. */
async function assertCanRead(
  assetProjectId: string,
  userId: string | undefined,
  shareToken: string | undefined,
): Promise<void> {
  if (userId) {
    const owned = await findProjectForOwner(assetProjectId, userId);
    if (owned) return;
  }

  if (shareToken) {
    const link = await findActiveShareLink(shareToken);
    if (link && link.project_id === assetProjectId) return;
  }

  // A project that exists but is not yours is reported as missing, so the
  // response does not confirm the id.
  const exists = await findProjectById(assetProjectId);
  throw exists ? forbidden('You do not have access to this asset') : notFound('Asset');
}

assetsRouter.get(
  '/assets/:id/raw',
  optionalAuth,
  validate({
    params: IdParams,
    query: z.object({ token: z.string().optional() }),
  }),
  async (req, res, next) => {
    try {
      const row = await findAssetRow(req.params.id!);
      if (!row) throw notFound('Asset');

      const { token } = req.query as { token?: string };
      await assertCanRead(row.project_id, req.user?.id, token);

      const stream = await storage().getStream(row.storage_key);

      res.setHeader('Content-Type', row.mime_type);
      res.setHeader('Content-Disposition', 'inline');
      // Belt and braces: the file type was verified on upload, but this stops
      // a browser sniffing its way to something executable regardless.
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');

      stream.on('error', (err) => {
        logger.error({ err, assetId: row.id }, 'asset stream failed');
        if (!res.headersSent) res.status(500).end();
        else res.destroy();
      });

      stream.pipe(res);
    } catch (err) {
      next(err);
    }
  },
);
