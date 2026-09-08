import { useEffect, useRef, useState } from 'react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import type { CanvasElement } from '@canvas/shared';
import { useCanvasStore } from '@/store/canvasStore';
import { getAccessToken, useAuthStore } from '@/store/authStore';

/** Marks transactions this client originated, so remote echoes are ignored. */
export const LOCAL_ORIGIN = 'local';

const CURSOR_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#14b8a6', '#0ea5e9', '#6366f1', '#a855f7', '#ec4899',
];

export const colorForClient = (clientId: number): string =>
  CURSOR_COLORS[Math.abs(clientId) % CURSOR_COLORS.length]!;

export interface RemotePresence {
  clientId: number;
  name: string;
  color: string;
  cursor: { x: number; y: number } | null;
  selectedIds: string[];
}

export interface CollabState {
  isConnected: boolean;
  peers: RemotePresence[];
  /** Publish this client's pointer position, in canvas coordinates. */
  setCursor: (point: { x: number; y: number } | null) => void;
}

interface Options {
  projectId: string | undefined;
  enabled?: boolean;
  shareToken?: string;
}

const wsBase = (): string =>
  import.meta.env.VITE_WS_URL ??
  `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/collab`;

/**
 * Bind a Y.Map of elements bidirectionally to the canvas store.
 *
 * Every write is tagged with an origin. Without that tag a remote update writes
 * to the store, which writes back to the Y.Map, which broadcasts again — an
 * endless echo between two peers.
 */
export function useYjsRoom({ projectId, enabled = true, shareToken }: Options): CollabState {
  const [isConnected, setIsConnected] = useState(false);
  const [peers, setPeers] = useState<RemotePresence[]>([]);
  const providerRef = useRef<WebsocketProvider | null>(null);

  useEffect(() => {
    if (!projectId || !enabled) return;

    const doc = new Y.Doc();
    const params: Record<string, string> = { project: projectId };

    const token = getAccessToken();
    if (token) params.token = token;
    if (shareToken) params.share = shareToken;

    const url = wsBase();
    const provider = new WebsocketProvider(url, projectId, doc, { params, connect: true });
    providerRef.current = provider;

    const elements = doc.getMap<CanvasElement>('elements');
    const user = useAuthStore.getState().user;

    provider.awareness.setLocalStateField('user', {
      name: user?.name ?? user?.email ?? 'Guest',
      color: colorForClient(doc.clientID),
    });

    provider.on('status', ({ status }: { status: string }) => {
      setIsConnected(status === 'connected');
    });

    // Seed the shared document from whatever this client already has, so the
    // first peer to connect does not start everyone from an empty board.
    const seed = (): void => {
      const store = useCanvasStore.getState();
      if (elements.size > 0) return;

      doc.transact(() => {
        for (const element of store.orderedElements()) elements.set(element.id, element);
      }, LOCAL_ORIGIN);
    };

    provider.once('sync', (synced: boolean) => {
      if (!synced) return;

      // Adopt the shared state; it is authoritative once connected.
      const remote = [...elements.values()];
      if (remote.length > 0) {
        useCanvasStore.getState().applyCommands(
          [{ op: 'create', elements: remote }],
          'remote',
        );
      } else {
        seed();
      }
    });

    const onRemoteChange = (event: Y.YMapEvent<CanvasElement>, transaction: Y.Transaction): void => {
      // Our own writes come back as events too; ignore them.
      if (transaction.origin === LOCAL_ORIGIN) return;

      const updated: CanvasElement[] = [];
      const removed: string[] = [];

      for (const key of event.keysChanged) {
        const value = elements.get(key);
        if (!value) {
          removed.push(key);
          continue;
        }
        // Deletes travel as a flag, because removing a key from a Y.Map can
        // resurrect it when an offline peer merges.
        if (value.isDeleted) removed.push(key);
        else updated.push(value);
      }

      const store = useCanvasStore.getState();
      if (updated.length > 0) store.applyCommands([{ op: 'create', elements: updated }], 'remote');
      if (removed.length > 0) store.applyCommands([{ op: 'delete', ids: removed }], 'remote');
    };

    elements.observe(onRemoteChange);

    // Local store changes flow the other way, also origin-tagged.
    let lastSeen = new Map<string, CanvasElement>();
    const unsubscribeStore = useCanvasStore.subscribe((state) => {
      const changed: CanvasElement[] = [];
      for (const [id, element] of Object.entries(state.elements)) {
        if (lastSeen.get(id) !== element) changed.push(element);
      }

      lastSeen = new Map(Object.entries(state.elements));
      if (changed.length === 0) return;

      doc.transact(() => {
        for (const element of changed) {
          const current = elements.get(element.id);
          // Last-writer-wins on version, matching the server's upsert rule.
          if (!current || current.version <= element.version) elements.set(element.id, element);
        }
      }, LOCAL_ORIGIN);
    });

    const onAwareness = (): void => {
      const states = provider.awareness.getStates();
      const next: RemotePresence[] = [];

      for (const [clientId, state] of states) {
        if (clientId === doc.clientID) continue;
        const info = state as {
          user?: { name?: string; color?: string };
          cursor?: { x: number; y: number } | null;
          selectedIds?: string[];
        };

        next.push({
          clientId,
          name: info.user?.name ?? 'Guest',
          color: info.user?.color ?? colorForClient(clientId),
          cursor: info.cursor ?? null,
          selectedIds: info.selectedIds ?? [],
        });
      }

      setPeers(next);
    };

    provider.awareness.on('change', onAwareness);

    return () => {
      elements.unobserve(onRemoteChange);
      unsubscribeStore();
      provider.awareness.off('change', onAwareness);
      provider.destroy();
      doc.destroy();
      providerRef.current = null;
      setIsConnected(false);
      setPeers([]);
    };
  }, [projectId, enabled, shareToken]);

  const setCursor = (point: { x: number; y: number } | null): void => {
    const provider = providerRef.current;
    if (!provider) return;
    provider.awareness.setLocalStateField('cursor', point);
    provider.awareness.setLocalStateField('selectedIds', useCanvasStore.getState().selectedIds);
  };

  return { isConnected, peers, setCursor };
}
