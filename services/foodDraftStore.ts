// Photos stay on this device until the user explicitly starts analysis.
// IndexedDB avoids localStorage's small quota for multi-photo drafts.
function openDrafts(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('ding-food-drafts', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('drafts');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function readFoodDraft<T>(uid: string): Promise<T | null> {
  const db = await openDrafts();
  try {
    return await new Promise<T | null>((resolve, reject) => {
      const request = db.transaction('drafts').objectStore('drafts').get(uid);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error);
    });
  } finally { db.close(); }
}

// Serialize writes so a slow prior save cannot replace the latest edit.
let writes: Promise<void> = Promise.resolve();
export function writeFoodDraft(uid: string, value: unknown): Promise<void> {
  const next = writes.catch(() => {}).then(async () => {
    const db = await openDrafts();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('drafts', 'readwrite');
        tx.objectStore('drafts').put(value, uid);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    } finally { db.close(); }
  });
  writes = next;
  return next;
}
