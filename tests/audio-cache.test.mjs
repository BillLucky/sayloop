import { test } from 'node:test';
import assert from 'node:assert/strict';

const values = new Map();
const db = {
  transaction() {
    let aborted = false;
    const tx = {
      objectStore: () => ({
        get: (key) => ({ result: values.get(key) }),
        getAllKeys: () => ({ result: [...values.keys()] }),
        put: (value, key) => {
          values.set(key, value);
          return { result: key };
        },
        delete: (key) => {
          values.delete(key);
          return { result: undefined };
        },
      }),
      abort() {
        aborted = true;
        queueMicrotask(() => tx.onabort?.());
      },
    };
    setTimeout(() => {
      if (!aborted) tx.oncomplete?.();
    }, 0);
    return tx;
  },
};
globalThis.indexedDB = {
  open() {
    const request = { result: db };
    queueMicrotask(() => request.onsuccess());
    return request;
  },
};
const cache = await import('../web/audio-cache.js');

test('a device download finishing after logout cannot recreate private stored audio', async () => {
  values.clear();
  cache.setAudioUser('synthetic-a');
  let release;
  const started = new Promise((resolve) => {
    globalThis.fetch = () =>
      new Promise((done) => {
        release = done;
        resolve();
      });
  });
  const saving = cache.saveAudio('/api/audio/synthetic.wav?v=account-v1-test');
  saving.catch(() => {});
  await started;
  await cache.clearUserAudio();
  release(
    new Response(new Blob(['synthetic audio']), { headers: { 'content-type': 'audio/wav' } })
  );
  await assert.rejects(saving, { name: 'AbortError' });
  cache.setAudioUser('synthetic-a');
  assert.equal(await cache.cachedAudio('/api/audio/synthetic.wav?v=account-v1-test'), undefined);
});

test('switching accounts cancels a pending download instead of writing into either account', async () => {
  values.clear();
  cache.setAudioUser('synthetic-a');
  let release;
  const started = new Promise((resolve) => {
    globalThis.fetch = () =>
      new Promise((done) => {
        release = done;
        resolve();
      });
  });
  const saving = cache.saveAudio('/api/audio/shared.wav');
  saving.catch(() => {});
  await started;
  cache.setAudioUser('synthetic-b');
  release(
    new Response(new Blob(['synthetic audio']), { headers: { 'content-type': 'audio/wav' } })
  );
  await assert.rejects(saving, { name: 'AbortError' });
  assert.equal(values.size, 0);
});
