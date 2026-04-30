import { v4 as uuidv4 } from 'uuid';

const DB_NAME = 'ideaflow-images';
const DB_VERSION = 1;
const STORE_NAME = 'images';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
  });
}

export async function saveImage(dataUrl: string): Promise<string> {
  const id = uuidv4();
  console.log('[imageDB] saveImage start', id, 'length=', dataUrl.length);
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.put({ id, dataUrl, createdAt: Date.now() });
    request.onerror = () => {
      console.error('[imageDB] saveImage request error', id, request.error);
      reject(request.error);
    };
    tx.oncomplete = () => {
      console.log('[imageDB] saveImage committed', id);
      db.close();
      resolve(id);
    };
    tx.onerror = () => {
      console.error('[imageDB] saveImage transaction error', id, tx.error);
      db.close();
      reject(tx.error);
    };
  });
}

export async function getImage(id: string): Promise<string | undefined> {
  console.log('[imageDB] getImage', id);
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(id);
    request.onsuccess = () => {
      const result = request.result;
      console.log('[imageDB] getImage result', id, result ? 'found' : 'NOT FOUND', 'dataUrl length=', result?.dataUrl?.length);
      resolve(result?.dataUrl);
    };
    request.onerror = () => {
      console.error('[imageDB] getImage error', id, request.error);
      reject(request.error);
    };
    tx.oncomplete = () => db.close();
  });
}

export async function deleteImage(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}
