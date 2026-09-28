import type { AppState, CanvasElement } from '@canvas/shared';
import { AppStateSchema } from '@canvas/shared';
import { newId } from './elementFactory';

const DATABASE_NAME = 'canvasly-local-boards';
const DATABASE_VERSION = 1;
const BOARD_STORE = 'boards';

export interface LocalBoard {
  id: string;
  title: string;
  elements: CanvasElement[];
  appState: AppState;
  updatedAt: string;
}

let databasePromise: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('Local board storage is not available in this browser. Download your board file to keep it.'));
  }
  if (databasePromise) return databasePromise;

  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(BOARD_STORE)) {
        request.result.createObjectStore(BOARD_STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => {
        database.close();
        databasePromise = null;
      };
      resolve(database);
    };
    request.onerror = () => {
      databasePromise = null;
      reject(request.error ?? new Error('Could not open local board storage.'));
    };
    request.onblocked = () => {
      databasePromise = null;
      reject(new Error('Local board storage is busy in another tab. Close that tab and try again.'));
    };
  });

  return databasePromise;
}

function runRequest<T>(
  mode: IDBTransactionMode,
  requestFor: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDatabase().then((database) => new Promise<T>((resolve, reject) => {
    const transaction = database.transaction(BOARD_STORE, mode);
    const request = requestFor(transaction.objectStore(BOARD_STORE));
    let result: T | undefined;

    request.onsuccess = () => {
      result = request.result;
    };
    request.onerror = () => reject(request.error ?? new Error('Could not access local board storage.'));
    transaction.oncomplete = () => resolve(result as T);
    transaction.onerror = () => reject(transaction.error ?? new Error('Could not save this board on the device.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('Local board storage was interrupted.'));
  }));
}

export async function createLocalBoard(input: {
  title?: string;
  elements?: CanvasElement[];
  appState?: AppState;
} = {}): Promise<LocalBoard> {
  const board: LocalBoard = {
    id: newId(),
    title: input.title?.trim() || 'Untitled board',
    elements: input.elements ?? [],
    appState: AppStateSchema.parse(input.appState ?? {}),
    updatedAt: new Date().toISOString(),
  };
  await saveLocalBoard(board);
  return board;
}

export function saveLocalBoard(board: LocalBoard): Promise<string> {
  return runRequest('readwrite', (store) => store.put({
    ...board,
    updatedAt: new Date().toISOString(),
  })).then(() => board.id);
}

export function getLocalBoard(id: string): Promise<LocalBoard | undefined> {
  return runRequest('readonly', (store) => store.get(id));
}

export async function listLocalBoards(): Promise<LocalBoard[]> {
  const boards = await runRequest('readonly', (store) => store.getAll());
  return boards.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function deleteLocalBoard(id: string): Promise<void> {
  return runRequest('readwrite', (store) => store.delete(id)).then(() => undefined);
}
