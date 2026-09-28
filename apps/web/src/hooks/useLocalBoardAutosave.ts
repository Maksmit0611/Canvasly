import { useEffect, useRef } from 'react';
import { AppStateSchema } from '@canvas/shared';
import { saveLocalBoard } from '@/lib/localBoards';
import { useCanvasStore } from '@/store/canvasStore';
import { useSaveStore } from '@/store/saveStore';

const SAVE_DELAY_MS = 400;

interface Options {
  boardId: string | undefined;
  title: string;
  enabled: boolean;
}

/** Persists drafts only to this browser's IndexedDB; it never contacts the API. */
export function useLocalBoardAutosave({ boardId, title, enabled }: Options): void {
  const titleRef = useRef(title);
  const scheduleRef = useRef<(() => void) | null>(null);
  titleRef.current = title;

  useEffect(() => {
    if (!boardId || !enabled) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    let active = true;
    let revision = 0;

    const persist = async (): Promise<void> => {
      const saveRevision = revision;
      const store = useCanvasStore.getState();
      useSaveStore.getState().setStatus('saving');
      try {
        await saveLocalBoard({
          id: boardId,
          title: titleRef.current.trim() || 'Untitled board',
          elements: store.orderedElements(),
          appState: AppStateSchema.parse({
            zoom: store.zoom,
            scrollX: store.scrollX,
            scrollY: store.scrollY,
          }),
          updatedAt: new Date().toISOString(),
        });
        if (active && saveRevision === revision) useSaveStore.getState().markSaved();
      } catch (error) {
        if (active && saveRevision === revision) {
          useSaveStore.getState().markFailed(
            error instanceof Error ? error.message : 'Could not save on this device',
          );
        }
      }
    };

    const schedule = (): void => {
      revision += 1;
      useSaveStore.getState().setStatus('dirty');
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        void persist();
      }, SAVE_DELAY_MS);
    };
    scheduleRef.current = schedule;

    const unsubscribe = useCanvasStore.subscribe((state, previous) => {
      if (
        state.elements !== previous.elements ||
        state.zoom !== previous.zoom ||
        state.scrollX !== previous.scrollX ||
        state.scrollY !== previous.scrollY
      ) {
        schedule();
      }
    });

    return () => {
      active = false;
      unsubscribe();
      scheduleRef.current = null;
      if (timer) {
        clearTimeout(timer);
        timer = null;
        void persist();
      }
    };
  }, [boardId, enabled]);

  useEffect(() => {
    scheduleRef.current?.();
  }, [title]);
}
