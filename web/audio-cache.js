// Device audio is scoped to both account identity and the active browser session.
const DATABASE = 'sayloop-device-audio';
let database;
let user = '';
let session = 0;
let peerChannel;
if (typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined') {
  try {
    peerChannel = new BroadcastChannel('sayloop-account-retirement');
    peerChannel.onmessage = ({ data }) => {
      if (data?.type !== 'retire' || !user || data.identifier !== user) return;
      const identifier = user;
      user = '';
      session += 1;
      window.dispatchEvent(new CustomEvent('sayloop:session-retired', { detail: { identifier } }));
    };
  } catch {
    // Restricted browsers can still use account-scoped storage in this document.
  }
}
const key = (url) => `${user}|${url}`;
export function setAudioUser(identifier) {
  user = identifier;
  session += 1;
}
function requireSession(expected) {
  if (!user || expected !== session) {
    throw new DOMException('账号会话已改变，设备保存已取消。', 'AbortError');
  }
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
    let request;
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = tx.onabort = () => reject(tx.error || new Error('Device storage is unavailable.'));
    try {
      request = action(tx.objectStore('audio'));
    } catch (error) {
      tx.abort();
      reject(error);
    }
  });
}
export async function cachedAudio(url) {
  const expected = session,
    cacheKey = key(url);
  requireSession(expected);
  const blob = await transaction('readonly', (store) => {
    requireSession(expected);
    return store.get(cacheKey);
  });
  requireSession(expected);
  return blob;
}
export async function removeAudio(url) {
  const expected = session,
    cacheKey = key(url);
  requireSession(expected);
  return transaction('readwrite', (store) => {
    requireSession(expected);
    return store.delete(cacheKey);
  });
}
// Only call after an authenticated lookup authorizes this exact recording version.
export async function adoptLegacyAudio(url) {
  const expected = session,
    cacheKey = key(url);
  requireSession(expected);
  const legacyUrl = url.replace(/([?&]v=)account-v1-/, '$1');
  if (legacyUrl === url) return null;
  const blob = await transaction('readonly', (store) => store.get(legacyUrl));
  requireSession(expected);
  if (!blob) return null;
  await transaction('readwrite', (store) => {
    requireSession(expected);
    store.put(blob, cacheKey);
    return store.delete(legacyUrl);
  });
  return blob;
}
export async function clearUserAudio(retiringUser = user, notifyPeers = true) {
  // Revoke pending reads/writes before waiting for IndexedDB or network callbacks.
  if (user === retiringUser) {
    user = '';
    session += 1;
  }
  if (retiringUser && notifyPeers) {
    try {
      peerChannel?.postMessage({ type: 'retire', identifier: retiringUser });
    } catch {
      // Peer notification must not prevent local cleanup.
    }
  }
  const keys = await transaction('readonly', (store) => store.getAllKeys());
  for (const item of keys) {
    if (item.startsWith(`${retiringUser}|`) || !item.includes('|')) {
      await transaction('readwrite', (store) => store.delete(item));
    }
  }
}
export async function saveAudio(url) {
  const expected = session,
    cacheKey = key(url);
  requireSession(expected);
  const existing = await cachedAudio(url);
  requireSession(expected);
  if (existing) return existing;
  const response = await fetch(url);
  requireSession(expected);
  if (response.status !== 200 || !response.headers.get('content-type')?.startsWith('audio/')) {
    throw new Error('无法保存完整录音，请刷新后重试。');
  }
  const blob = await response.blob();
  requireSession(expected);
  if (!blob.size) throw new Error('The recording is empty.');
  await transaction('readwrite', (store) => {
    requireSession(expected);
    return store.put(blob, cacheKey);
  });
  return blob;
}
