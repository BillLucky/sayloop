// Audio stays in this browser profile, scoped to the current website origin.
const DATABASE = 'sayloop-device-audio';
let database;
let user = '';
const key = (url) => `${user}|${url}`;
export function setAudioUser(identifier) {
  user = identifier;
}
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
export const cachedAudio = (url) => transaction('readonly', (store) => store.get(key(url)));
export const removeAudio = (url) => transaction('readwrite', (store) => store.delete(key(url)));
// Call only after an authenticated generation lookup authorizes this exact recording version.
export async function adoptLegacyAudio(url) {
  const legacyUrl = url.replace(/([?&]v=)account-v1-/, '$1');
  if (legacyUrl === url) return null;
  const blob = await transaction('readonly', (store) => store.get(legacyUrl));
  if (!blob) return null;
  await transaction('readwrite', (store) => {
    store.put(blob, key(url));
    return store.delete(legacyUrl);
  });
  return blob;
}
export async function clearUserAudio() {
  const keys = await transaction('readonly', (store) => store.getAllKeys());
  for (const item of keys) {
    if (item.startsWith(`${user}|`) || !item.includes('|'))
      await transaction('readwrite', (store) => store.delete(item));
  }
}
export async function saveAudio(url) {
  const cacheKey = key(url);
  const existing = await cachedAudio(url);
  if (existing) return existing;
  const response = await fetch(url);
  if (response.status !== 200 || !response.headers.get('content-type')?.startsWith('audio/')) {
    throw new Error('无法保存完整录音，请刷新后重试。');
  }
  const blob = await response.blob();
  if (!blob.size) throw new Error('The recording is empty.');
  await transaction('readwrite', (store) => store.put(blob, cacheKey));
  return blob;
}
