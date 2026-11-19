import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PracticePlayer, shortcutAction } from '../web/practice-player.js';

function setup() {
  const audio = {
    paused: true,
    ended: false,
    currentTime: 0,
    loop: false,
    async play() {
      this.paused = false;
    },
    pause() {
      this.paused = true;
    },
  };
  const player = new PracticePlayer(audio);
  player.load([
    { start: 0, end: 2, text: 'First.' },
    { start: 2.3, end: 5, text: 'Second.' },
    { start: 5.3, end: 8, text: 'Third.' },
  ]);
  return { audio, player };
}
test('space pauses and resumes without replaying a clicked sentence', async () => {
  const { audio, player } = setup();
  await player.playSentence(1);
  audio.currentTime = 3.5;
  await player.toggle();
  assert.equal(audio.paused, true);
  assert.equal(audio.currentTime, 3.5);
  await player.toggle();
  assert.equal(audio.paused, false);
  assert.equal(audio.currentTime, 3.5);
});
test('shadow mode pauses at the sentence boundary and releases exactly one next sentence', async () => {
  const { audio, player } = setup();
  player.setMode('shadow');
  await player.playSentence(0);
  audio.currentTime = 2.05;
  player.tick();
  assert.equal(audio.paused, true);
  assert.equal(player.waiting, true);
  player.tick();
  assert.equal(player.index, 0);
  await player.toggle();
  assert.equal(audio.currentTime, 2.3);
  assert.equal(player.index, 1);
  assert.equal(audio.paused, false);
  audio.currentTime = 5.1;
  player.tick();
  assert.equal(audio.paused, true);
  assert.equal(player.index, 1);
});
test('loop repeats the selected sentence without drifting to the next', async () => {
  const { audio, player } = setup();
  player.setMode('loop');
  await player.playSentence(1);
  audio.currentTime = 5.1;
  player.tick();
  assert.equal(audio.currentTime, 2.3);
  assert.equal(player.index, 1);
});
test('manual seek resets a pending shadow pause and updates the target', async () => {
  const { audio, player } = setup();
  player.setMode('shadow');
  await player.playSentence(0);
  audio.currentTime = 2;
  player.tick();
  player.seek(6);
  assert.equal(player.waiting, false);
  assert.equal(player.index, 2);
  await player.toggle();
  assert.equal(audio.currentTime, 6);
  assert.equal(audio.paused, false);
});
test('continuous mode follows new sentences and holds highlighting through gaps', () => {
  const { audio, player } = setup();
  audio.currentTime = 2.1;
  player.tick();
  assert.equal(player.index, 0);
  audio.currentTime = 2.4;
  player.tick();
  assert.equal(player.index, 1);
});
test('last-sentence shadow pause and replay are predictable', async () => {
  const { audio, player } = setup();
  player.setMode('shadow');
  await player.playSentence(2);
  audio.currentTime = 8;
  player.tick();
  assert.equal(player.waiting, true);
  await player.playSentence(player.index);
  assert.equal(audio.currentTime, 5.3);
  assert.equal(player.waiting, false);
});
test('shortcuts ignore typing, IME composition and command chords, including space in editors', () => {
  assert.equal(shortcutAction({ code: 'Space', target: { closest: () => null } }), 'toggle');
  assert.equal(shortcutAction({ code: 'Space', target: { closest: () => ({}) } }), null);
  assert.equal(shortcutAction({ code: 'KeyR', ctrlKey: true }), null);
  assert.equal(shortcutAction({ code: 'Space', isComposing: true }), null);
  assert.equal(shortcutAction({ code: 'ArrowRight' }), 'next');
});

test('a paused resume waits for metadata without autoplay and later user seeks win', () => {
  const listeners = new Map();
  let position = 0;
  const audio = {
    readyState: 0,
    paused: true,
    playCalls: 0,
    get currentTime() {
      return position;
    },
    set currentTime(value) {
      if (this.readyState) position = value;
    },
    addEventListener(name, fn) {
      listeners.set(name, fn);
    },
    play() {
      this.playCalls++;
    },
  };
  const player = new PracticePlayer(audio);
  player.load([
    { start: 0, end: 4 },
    { start: 4, end: 10 },
  ]);
  player.seek(6);
  assert.equal(player.index, 1);
  assert.equal(position, 0);
  player.seek(3);
  audio.readyState = 1;
  listeners.get('loadedmetadata')();
  assert.equal(position, 3);
  assert.equal(player.index, 0);
  assert.equal(audio.playCalls, 0);
  assert.equal(audio.paused, true);
});

test('loading another recording discards a pending resume and invalid times return to zero', () => {
  const listeners = new Map();
  const audio = {
    readyState: 0,
    currentTime: 0,
    addEventListener(name, fn) {
      listeners.set(name, fn);
    },
  };
  const player = new PracticePlayer(audio);
  player.load([{ start: 0, end: 10 }]);
  player.seek(5);
  player.load([{ start: 0, end: 2 }]);
  audio.currentTime = 0;
  audio.readyState = 1;
  listeners.get('loadedmetadata')();
  assert.equal(audio.currentTime, 0);
  player.seek(Infinity);
  assert.equal(audio.currentTime, 0);
  assert.equal(player.index, 0);
});

test('reentering a recording before metadata preserves the pending paused position', () => {
  const listeners = new Map();
  let time = 0;
  const audio = {
    readyState: 0,
    get currentTime() {
      return time;
    },
    set currentTime(value) {
      if (this.readyState) time = value;
    },
    addEventListener(name, fn) {
      listeners.set(name, fn);
    },
  };
  const player = new PracticePlayer(audio),
    segments = [{ start: 0, end: 20 }];
  player.load(segments);
  player.seek(10);
  const position = player.position;
  player.load(segments);
  player.seek(position);
  audio.readyState = 1;
  listeners.get('loadedmetadata')();
  assert.equal(time, 10);
});
