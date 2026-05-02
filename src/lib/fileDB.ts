import { v4 as uuidv4 } from 'uuid';

const DB_NAME = 'ideaflow-files';
const DB_VERSION = 1;
const STORE_NAME = 'files';

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

export interface StoredFile {
  id: string;
  name: string;
  type: string;
  size: number;
  data: string;
  createdAt: number;
}

export async function saveFile(file: File): Promise<string> {
  const id = uuidv4();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async () => {
      const data = reader.result as string;
      try {
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const record: StoredFile = {
          id,
          name: file.name,
          type: file.type || 'application/octet-stream',
          size: file.size,
          data,
          createdAt: Date.now(),
        };
        const request = store.put(record);
        request.onerror = () => reject(request.error);
        tx.oncomplete = () => { db.close(); resolve(id); };
        tx.onerror = () => { db.close(); reject(tx.error); };
      } catch (e) {
        reject(e);
      }
    };
    reader.onerror = () => reject(reader.error);

    if (
      file.type.startsWith('text/') ||
      file.name.endsWith('.md') ||
      file.name.endsWith('.json') ||
      file.name.endsWith('.txt') ||
      file.name.endsWith('.csv')
    ) {
      reader.readAsText(file);
    } else {
      reader.readAsDataURL(file);
    }
  });
}

export async function saveDataUrl(dataUrl: string, name = 'image.png', type = 'image/png'): Promise<string> {
  const id = uuidv4();
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const record: StoredFile = {
      id,
      name,
      type,
      size: dataUrl.length,
      data: dataUrl,
      createdAt: Date.now(),
    };
    const request = store.put(record);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => { db.close(); resolve(id); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function getFile(id: string): Promise<StoredFile | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

export async function deleteFile(id: string): Promise<void> {
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
