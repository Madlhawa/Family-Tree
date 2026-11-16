/** Local-first persistence in IndexedDB — portraits and audio would overflow localStorage. */
import type { Dynasty } from '../model/types';

const DB = 'dynasty-chronicle';
const STORE = 'state';
const KEY = 'current';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function loadDynasty(): Promise<Dynasty | undefined> {
  try {
    const db = await open();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve(req.result as Dynasty | undefined);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return undefined;
  }
}

export async function saveDynasty(d: Dynasty): Promise<void> {
  try {
    const db = await open();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(d, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.warn('Could not save dynasty', e);
  }
}

export function loadPref<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem('dc:' + key);
    return v === null ? fallback : (JSON.parse(v) as T);
  } catch {
    return fallback;
  }
}

export function savePref(key: string, v: unknown) {
  try {
    localStorage.setItem('dc:' + key, JSON.stringify(v));
  } catch {
    /* ignore */
  }
}
