import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, type WebSocket } from 'ws';
import * as Y from 'yjs';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as syncProtocol from 'y-protocols/sync';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import { verifyAccessToken } from '../auth/tokens.js';
import { findProjectById, findProjectForOwner } from '../db/queries/projects.js';
import { findActiveShareLink } from '../db/queries/shareLinks.js';
import { listElements } from '../db/queries/elements.js';
import { findLatestSnapshot, insertSnapshot, pruneSnapshots } from '../db/queries/snapshots.js';
import { logger } from '../logger.js';

const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;

const SNAPSHOT_DEBOUNCE_MS = 10_000;
const SNAPSHOTS_TO_KEEP = 5;
/** Drop a socket that stops answering pings. */
const PING_INTERVAL_MS = 30_000;

interface Room {
  doc: Y.Doc;
  awareness: awarenessProtocol.Awareness;
  connections: Set<WebSocket>;
  /**
   * Awareness client ids owned by each socket. Needed so a disconnect clears
   * only that peer's presence — removing every id would wipe everyone else's
   * cursor, and leaving them would strand ghost peers on the board.
   */
  controlledIds: Map<WebSocket, Set<number>>;
  snapshotTimer: ReturnType<typeof setTimeout> | null;
  hydrated: Promise<void>;
}

const rooms = new Map<string, Room>();

/**
 * Build a room, hydrating from the newest snapshot and falling back to the
 * elements table when a project has never had a live document.
 */
function getRoom(projectId: string): Room {
  const existing = rooms.get(projectId);
  if (existing) return existing;

  const doc = new Y.Doc();
  const awareness = new awarenessProtocol.Awareness(doc);

  const room: Room = {
    doc,
    awareness,
    connections: new Set(),
    controlledIds: new Map(),
    snapshotTimer: null,
    hydrated: Promise.resolve(),
  };

  room.hydrated = (async () => {
    try {
      const snapshot = await findLatestSnapshot(projectId);
      if (snapshot) {
        Y.applyUpdate(doc, new Uint8Array(snapshot.ydoc_state), 'hydrate');
        return;
      }

      const elements = await listElements(projectId);
      if (elements.length === 0) return;

      const map = doc.getMap('elements');
      doc.transact(() => {
        for (const element of elements) map.set(element.id, element);
      }, 'hydrate');
    } catch (err) {
      logger.error({ err, projectId }, 'failed to hydrate collaboration room');
    }
  })();

  doc.on('update', (_update: Uint8Array, origin: unknown) => {
    if (origin === 'hydrate') return;
    scheduleSnapshot(projectId, room);
  });

  rooms.set(projectId, room);
  return room;
}

function scheduleSnapshot(projectId: string, room: Room): void {
  if (room.snapshotTimer) return;

  room.snapshotTimer = setTimeout(() => {
    room.snapshotTimer = null;
    void (async () => {
      try {
        await insertSnapshot(projectId, Buffer.from(Y.encodeStateAsUpdate(room.doc)));
        await pruneSnapshots(projectId, SNAPSHOTS_TO_KEEP);
      } catch (err) {
        logger.error({ err, projectId }, 'failed to persist ydoc snapshot');
      }
    })();
  }, SNAPSHOT_DEBOUNCE_MS);
}

export type CollabPermission = 'edit' | 'view';

export interface CollabIdentity {
  projectId: string;
  userId: string | null;
  permission: CollabPermission;
}

/**
 * Authorise a socket before the upgrade completes.
 *
 * An unauthenticated WebSocket is a wide-open door into every board, so this
 * runs before any Yjs message is exchanged: either a valid access token whose
 * user owns the project, or a live share token for that same project.
 */
export async function authorizeCollab(url: URL): Promise<CollabIdentity | null> {
  const projectId = url.searchParams.get('project');
  if (!projectId) return null;

  const token = url.searchParams.get('token');
  if (token) {
    try {
      const claims = verifyAccessToken(token);
      const project = await findProjectForOwner(projectId, claims.sub);
      if (project) return { projectId, userId: claims.sub, permission: 'edit' };
    } catch {
      // Fall through to the share-token path.
    }
  }

  const share = url.searchParams.get('share');
  if (share) {
    const link = await findActiveShareLink(share);
    if (link && link.project_id === projectId) {
      return { projectId, userId: null, permission: link.permission };
    }
  }

  return null;
}

function send(socket: WebSocket, data: Uint8Array): void {
  if (socket.readyState !== socket.OPEN) return;
  socket.send(data, (err) => {
    if (err) socket.close();
  });
}

function setupConnection(socket: WebSocket, identity: CollabIdentity): void {
  const room = getRoom(identity.projectId);
  room.connections.add(socket);
  room.controlledIds.set(socket, new Set());

  const readOnly = identity.permission === 'view';

  void room.hydrated.then(() => {
    // Step 1 of the sync protocol: offer our state vector.
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_SYNC);
    syncProtocol.writeSyncStep1(encoder, room.doc);
    send(socket, encoding.toUint8Array(encoder));

    const states = room.awareness.getStates();
    if (states.size > 0) {
      const awarenessEncoder = encoding.createEncoder();
      encoding.writeVarUint(awarenessEncoder, MESSAGE_AWARENESS);
      encoding.writeVarUint8Array(
        awarenessEncoder,
        awarenessProtocol.encodeAwarenessUpdate(room.awareness, [...states.keys()]),
      );
      send(socket, encoding.toUint8Array(awarenessEncoder));
    }
  });

  const onDocUpdate = (update: Uint8Array, origin: unknown): void => {
    // Don't echo an update back to the socket that produced it.
    if (origin === socket) return;
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_SYNC);
    syncProtocol.writeUpdate(encoder, update);
    send(socket, encoding.toUint8Array(encoder));
  };

  const onAwarenessUpdate = (
    { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown,
  ): void => {
    if (origin === socket) return;
    const changed = [...added, ...updated, ...removed];
    if (changed.length === 0) return;

    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
    encoding.writeVarUint8Array(
      encoder,
      awarenessProtocol.encodeAwarenessUpdate(room.awareness, changed),
    );
    send(socket, encoding.toUint8Array(encoder));
  };

  room.doc.on('update', onDocUpdate);
  room.awareness.on('update', onAwarenessUpdate);

  socket.on('message', (data: ArrayBuffer | Buffer) => {
    try {
      const message = new Uint8Array(data as ArrayBuffer);
      const decoder = decoding.createDecoder(message);
      const type = decoding.readVarUint(decoder);

      if (type === MESSAGE_SYNC) {
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, MESSAGE_SYNC);

        if (readOnly) {
          // A viewer may sync down but never write; answer step 1 only.
          const step = decoding.readVarUint(decoder);
          if (step === syncProtocol.messageYjsSyncStep1) {
            syncProtocol.readSyncStep1(decoder, encoder, room.doc);
            send(socket, encoding.toUint8Array(encoder));
          }
          return;
        }

        syncProtocol.readSyncMessage(decoder, encoder, room.doc, socket);
        if (encoding.length(encoder) > 1) send(socket, encoding.toUint8Array(encoder));
        return;
      }

      if (type === MESSAGE_AWARENESS) {
        const update = decoding.readVarUint8Array(decoder);
        // Record which client ids this socket speaks for, so its presence can
        // be cleared precisely when it goes away.
        const owned = room.controlledIds.get(socket);
        if (owned) {
          const reader = decoding.createDecoder(update);
          const count = decoding.readVarUint(reader);
          for (let i = 0; i < count; i++) {
            const clientId = decoding.readVarUint(reader);
            decoding.readVarUint(reader); // clock
            decoding.readVarString(reader); // state json
            owned.add(clientId);
          }
        }

        awarenessProtocol.applyAwarenessUpdate(room.awareness, update, socket);
      }
    } catch (err) {
      logger.error({ err }, 'malformed collaboration message');
    }
  });

  let alive = true;
  socket.on('pong', () => {
    alive = true;
  });

  const pingTimer = setInterval(() => {
    if (!alive) {
      socket.terminate();
      return;
    }
    alive = false;
    socket.ping();
  }, PING_INTERVAL_MS);

  const cleanup = (): void => {
    clearInterval(pingTimer);
    room.doc.off('update', onDocUpdate);
    room.awareness.off('update', onAwarenessUpdate);
    room.connections.delete(socket);

    const owned = room.controlledIds.get(socket);
    room.controlledIds.delete(socket);
    if (owned && owned.size > 0) {
      awarenessProtocol.removeAwarenessStates(room.awareness, [...owned], null);
    }

    // Last one out writes a final snapshot and frees the document.
    if (room.connections.size === 0) {
      if (room.snapshotTimer) {
        clearTimeout(room.snapshotTimer);
        room.snapshotTimer = null;
      }

      void (async () => {
        try {
          // Wait for hydration first. A socket that connects and closes again
          // immediately would otherwise snapshot an empty document over the
          // project's real elements — silent data loss on the next load.
          await room.hydrated;
          await insertSnapshot(identity.projectId, Buffer.from(Y.encodeStateAsUpdate(room.doc)));
          await pruneSnapshots(identity.projectId, SNAPSHOTS_TO_KEEP);
        } catch (err) {
          logger.error({ err }, 'failed to write final snapshot');
        } finally {
          // Another peer may have joined while we were awaiting; only tear the
          // room down if it is still empty.
          if (room.connections.size === 0) {
            rooms.delete(identity.projectId);
            room.doc.destroy();
          }
        }
      })();
    }
  };

  socket.on('close', cleanup);
  socket.on('error', cleanup);
}

/** Attach the collaboration server to the existing HTTP server on /collab. */
export function attachCollabServer(server: Server): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
    // y-websocket appends the room name, so the path is /collab/<projectId>.
    if (url.pathname !== '/collab' && !url.pathname.startsWith('/collab/')) return;

    void (async () => {
      const identity = await authorizeCollab(url).catch(() => null);

      if (!identity) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      // Confirm the project still exists before opening a room for it.
      if (!(await findProjectById(identity.projectId))) {
        socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
        socket.destroy();
        return;
      }

      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
        setupConnection(ws, identity);
      });
    })();
  });

  return wss;
}

/** Test helper: drop all in-memory rooms. */
export function resetCollabRooms(): void {
  for (const room of rooms.values()) {
    if (room.snapshotTimer) clearTimeout(room.snapshotTimer);
    room.doc.destroy();
  }
  rooms.clear();
}
