import { useEffect, useRef } from 'react';
import { CanvasElementSchema, type CanvasElement } from '@canvas/shared';
import { useCanvasStore } from '@/store/canvasStore';
import { useSaveStore } from '@/store/saveStore';
import { saveElementBatch, updateProject } from '@/lib/projects';
import { backoffDelay } from '@/lib/backoff';

/** Flush after this long without changes... */
const QUIESCENCE_MS = 800;
/** ...or this long since the first unsaved change, whichever comes first. */
const MAX_WAIT_MS = 5000;
const THUMBNAIL_INTERVAL_MS = 60_000;

interface Options {
  projectId: string | undefined;
  enabled?: boolean;
  /** Returns a small dataURL of the stage, for the dashboard preview. */
  captureThumbnail?: () => string | null;
}

/**
 * Debounced, batched autosave with retry.
 *
 * Saving per element per mouse-move would melt the database, so changed ids are
 * collected into a dirty set and flushed as one batch. A failed flush keeps the
 * ids queued and retries with exponential backoff, so work survives the API
 * being briefly unreachable.
 */
export function useAutosave({ projectId, enabled = true, captureThumbnail }: Options): void {
  const quiesceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxWaitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef(false);
  const lastThumbnailAt = useRef(0);

  useEffect(() => {
    if (!projectId || !enabled) return;

    const clearTimers = (): void => {
      if (quiesceTimer.current) clearTimeout(quiesceTimer.current);
      if (maxWaitTimer.current) clearTimeout(maxWaitTimer.current);
      quiesceTimer.current = null;
      maxWaitTimer.current = null;
    };

    const flush = async (): Promise<void> => {
      if (inFlight.current) return;

      const store = useCanvasStore.getState();
      const dirtyIds = [...store.dirtyIds];
      const deletedIds = [...store.deletedIds];
      if (dirtyIds.length === 0 && deletedIds.length === 0) return;

      // Snapshot what we are sending, then clear it optimistically. Anything
      // changed while the request is in flight lands in a fresh dirty set.
      // Elements can arrive from other peers over the CRDT, so validate before
      // sending: one malformed element would otherwise fail every batch and
      // wedge the queue in a permanent retry loop.
      const candidates = dirtyIds
        .map((id) => store.elements[id])
        .filter((el): el is CanvasElement => Boolean(el) && !el!.isDeleted);

      const upserts: CanvasElement[] = [];
      for (const element of candidates) {
        if (CanvasElementSchema.safeParse(element).success) upserts.push(element);
        else console.warn('dropping malformed element from save batch', element.id);
      }
      const deletes = deletedIds.filter((id) => store.elements[id]?.isDeleted);

      inFlight.current = true;
      clearTimers();
      useSaveStore.getState().setStatus('saving');
      store.markClean();

      try {
        await saveElementBatch(projectId, upserts, deletes);
        useSaveStore.getState().markSaved();

        // Thumbnails are throttled: they are a nicety, not worth a render on
        // every save.
        const now = Date.now();
        if (captureThumbnail && now - lastThumbnailAt.current > THUMBNAIL_INTERVAL_MS) {
          const thumbnail = captureThumbnail();
          if (thumbnail) {
            lastThumbnailAt.current = now;
            await updateProject(projectId, { thumbnail }).catch(() => {
              // A failed thumbnail must never fail the save.
            });
          }
        }
      } catch (err) {
        // A 4xx means the payload will never be accepted; retrying it forever
        // would wedge the queue. Only transient failures are re-queued.
        const status = (err as { status?: number }).status ?? 0;
        const isPermanent = status >= 400 && status < 500 && status !== 408 && status !== 429;

        if (isPermanent) {
          console.error('save rejected permanently, dropping batch', err);
          useSaveStore.getState().markSaved();
          return;
        }

        // Re-queue everything so nothing is lost, then retry with backoff.
        const canvas = useCanvasStore.getState();
        useCanvasStore.setState({
          dirtyIds: new Set([...canvas.dirtyIds, ...dirtyIds]),
          deletedIds: new Set([...canvas.deletedIds, ...deletedIds]),
          isDirty: true,
        });

        const save = useSaveStore.getState();
        save.markFailed(err instanceof Error ? err.message : 'Save failed');

        if (retryTimer.current) clearTimeout(retryTimer.current);
        retryTimer.current = setTimeout(() => void flush(), backoffDelay(save.failures));
      } finally {
        inFlight.current = false;
      }
    };

    const schedule = (): void => {
      if (quiesceTimer.current) clearTimeout(quiesceTimer.current);
      quiesceTimer.current = setTimeout(() => void flush(), QUIESCENCE_MS);

      // Started on the first unsaved change and left running, so a continuous
      // stream of edits still saves at least every MAX_WAIT_MS.
      if (!maxWaitTimer.current) {
        maxWaitTimer.current = setTimeout(() => void flush(), MAX_WAIT_MS);
      }
    };

    const unsubscribe = useCanvasStore.subscribe((state, previous) => {
      if (state.dirtyIds === previous.dirtyIds && state.deletedIds === previous.deletedIds) return;
      if (state.dirtyIds.size === 0 && state.deletedIds.size === 0) return;

      if (useSaveStore.getState().status === 'saved') useSaveStore.getState().setStatus('dirty');
      schedule();
    });

    const onOnline = (): void => void flush();
    const onBeforeUnload = (e: BeforeUnloadEvent): void => {
      const canvas = useCanvasStore.getState();
      if (canvas.dirtyIds.size > 0 || canvas.deletedIds.size > 0) e.preventDefault();
    };

    window.addEventListener('online', onOnline);
    window.addEventListener('beforeunload', onBeforeUnload);

    return () => {
      unsubscribe();
      clearTimers();
      if (retryTimer.current) clearTimeout(retryTimer.current);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('beforeunload', onBeforeUnload);
      // A pending change would otherwise be lost on navigation.
      void flush();
    };
  }, [projectId, enabled, captureThumbnail]);
}
