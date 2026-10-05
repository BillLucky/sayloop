// Audio stays in this browser profile, scoped to the current website origin.
const DATABASE = 'sayloop-device-audio';
let database;
function open() {
  if (!database)
    database = new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE, 1);
      request.onupgradeneeded = () => request.result.createObjectStore('audio');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('Close other Sayloop tabs and try again.'));
    }).catch((error) => {
      database = undefined;
      throw error;
    });
  return database;
}
async function transaction(mode, action) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('audio', mode);
    const request = action(tx.objectStore('audio'));
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = tx.onabort = () => reject(tx.error || new Error('Device storage is unavailable.'));
  });
}
export const cachedAudio = (url) => transaction('readonly', (store) => store.get(url));
export const removeAudio = (url) => transaction('readwrite', (store) => store.delete(url));
export async function saveAudio(url) {
  const existing = await cachedAudio(url);
  if (existing) return existing;
  const response = await fetch(url);
  if (response.status !== 200 || !response.headers.get('content-type')?.startsWith('audio/')) {
    throw new Error('Unable to save the complete recording. Refresh and try again.');
  }
  const blob = await response.blob();
  if (!blob.size) throw new Error('The recording is empty.');
  await transaction('readwrite', (store) => store.put(blob, url));
  return blob;
}
