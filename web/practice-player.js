/** Media-independent sentence transport. One state machine powers every player control. */
export class PracticePlayer {
  constructor(audio, changed = () => {}) {
    this.audio = audio;
    this.changed = changed;
    this.segments = [];
    this.index = -1;
    this.mode = 'continuous';
    this.waiting = false;
  }

  load(segments) {
    this.segments = segments;
    this.index = segments.length ? 0 : -1;
    this.waiting = false;
    this.changed(this);
  }

  setMode(mode) {
    if (!['continuous', 'shadow', 'loop'].includes(mode)) return;
    this.mode = mode;
    if (mode !== 'continuous') this.audio.loop = false;
    this.changed(this);
  }

  locate(time) {
    let index = 0;
    for (let i = 0; i < this.segments.length; i++) {
      if (this.segments[i].start <= time + 0.015) index = i;
      else break;
    }
    return this.segments.length ? index : -1;
  }

  async playSentence(index) {
    if (!this.segments.length) return;
    this.index = Math.max(0, Math.min(index, this.segments.length - 1));
    this.waiting = false;
    this.audio.currentTime = this.segments[this.index].start;
    this.changed(this);
    await this.audio.play();
  }

  async toggle() {
    if (!this.audio.paused) {
      this.audio.pause();
    } else if (this.waiting) {
      const next = this.mode === 'loop' ? this.index : (this.index + 1) % this.segments.length;
      await this.playSentence(next);
    } else {
      if (this.audio.ended && this.segments.length) return this.playSentence(0);
      await this.audio.play();
    }
    this.changed(this);
  }

  seek(time) {
    this.waiting = false;
    this.audio.currentTime = time;
    this.index = this.locate(time);
    this.changed(this);
  }

  tick() {
    if (!this.segments.length || this.waiting) return;
    const current = this.segments[this.index];
    if (
      this.mode !== 'continuous' &&
      !this.audio.paused &&
      current &&
      this.audio.currentTime >= current.end - 0.015
    ) {
      if (this.mode === 'loop') {
        this.audio.currentTime = current.start;
      } else {
        this.audio.pause();
        this.audio.currentTime = current.end;
        this.waiting = true;
        this.changed(this);
      }
      return;
    }
    const index = this.locate(this.audio.currentTime);
    if (index !== this.index) {
      this.index = index;
      this.changed(this);
    }
  }

  async ended() {
    if (this.mode === 'loop' && this.segments.length) return this.playSentence(this.index);
    if (this.mode === 'shadow' && this.segments.length) {
      this.waiting = true;
      this.index = this.segments.length - 1;
    }
    this.changed(this);
  }
}

export function shortcutAction(event) {
  if (event.altKey || event.ctrlKey || event.metaKey || event.isComposing) return null;
  const target = event.target;
  if (target?.closest?.('input, textarea, select, [contenteditable="true"], [role="textbox"]'))
    return null;
  if (event.code === 'Space') return 'toggle';
  if (event.code === 'ArrowLeft') return 'previous';
  if (event.code === 'ArrowRight') return 'next';
  if (event.code === 'KeyR') return 'replay';
  if (event.code === 'KeyF') return 'focus';
  if (event.code === 'Escape') return 'escape';
  return null;
}
