import { PracticePlayer, shortcutAction } from './practice-player.js';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const paths = {
  library: '<path d="M4 4h5v16H4zM12 4h4v16h-4zM19 5l3 14"/>',
  sliders:
    '<path d="M4 7h5m4 0h7M4 17h9m4 0h3"/><circle cx="11" cy="7" r="2"/><circle cx="15" cy="17" r="2"/>',
  wave: '<path d="M3 10v4m4-8v12m5-15v18m5-15v12m4-8v4"/>',
  headphones: '<path d="M4 14v-3a8 8 0 0116 0v3M4 12H3v7h4v-7H4m16 0h1v7h-4v-7h3"/>',
  book: '<path d="M12 5v15M3 4c4-1 6 0 9 2 3-2 5-3 9-2v15c-4-1-6 0-9 2-3-2-5-3-9-2z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/>',
  upload: '<path d="M12 16V3m-5 5 5-5 5 5M4 15v5h16v-5"/>',
  download: '<path d="M12 3v13m-5-5 5 5 5-5M4 17v4h16v-4"/>',
  file: '<path d="M5 3h9l5 5v13H5zM14 3v6h5M8 13h8M8 17h5"/>',
  play: '<path d="m8 5 11 7-11 7z" fill="currentColor" stroke-width="0"/>',
  pause: '<path d="M8 5v14M16 5v14" stroke-width="4"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  save: '<path d="M4 3h14l3 3v15H3V3h1M7 3v6h10V3M7 21v-8h10v8"/>',
  music:
    '<path d="M9 18V5l11-2v13M9 8l11-2"/><ellipse cx="6" cy="18" rx="3" ry="2"/><ellipse cx="17" cy="16" rx="3" ry="2"/>',
  spark: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
  repeat: '<path d="M4 9a7 7 0 0112-4l3 3m0-5v5h-5M20 15a7 7 0 01-12 4l-3-3m0 5v-5h5"/>',
  panel: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16m6-11-3 3 3 3"/>',
  expand: '<path d="M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6"/>',
  minimize: '<path d="M3 9h6V3m12 6h-6V3M9 21v-6H3m12 6v-6h6"/>',
  previous: '<path d="M5 5v14m14-14L8 12l11 7z"/>',
  next: '<path d="M19 5v14M5 5l11 7-11 7z"/>',
};
const icon = (name) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.file}</svg>`;
function icons() {
  $$('[data-icon]').forEach((el) => {
    el.outerHTML = icon(el.dataset.icon);
  });
}
const escape = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
const time = (seconds) =>
  `${Math.floor((seconds || 0) / 60)}:${String(Math.floor((seconds || 0) % 60)).padStart(2, '0')}`;
const state = {
  materials: [],
  jobs: [],
  voices: [],
  languages: {},
  filter: 'all',
  view: 'library',
  materialId: null,
  currentJob: null,
  segment: -1,
  practiceId: null,
};
let toastTimer;
function toast(message, error = false) {
  $('#toast').textContent = message;
  $('#toast').hidden = false;
  $('#toast').classList.toggle('error', error);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($('#toast').hidden = true), error ? 9000 : 4500);
}
async function api(path, options) {
  const response = await fetch(`/api${path}`, options);
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    const detail =
      typeof error.detail === 'string' ? error.detail : error.detail?.map((e) => e.msg).join('; ');
    throw new Error(detail || `Request failed (${response.status})`);
  }
  return response.json();
}
const post = (path, data) =>
  api(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
const safely =
  (fn) =>
  async (...args) => {
    try {
      await fn(...args);
    } catch (error) {
      toast(error.message, true);
    }
  };
function showView(view) {
  if (!['library', 'studio', 'voices', 'practice'].includes(view)) view = 'library';
  state.view = view;
  if (view !== 'practice') setImmersive(false);
  $$('.view').forEach((el) => (el.hidden = el.id !== `view-${view}`));
  $$('.nav-item').forEach((el) => el.classList.toggle('active', el.dataset.view === view));
  $('#breadcrumb').textContent = {
    library: 'My materials',
    studio: 'Speech studio',
    voices: 'Voice collection',
    practice: 'Practice room',
  }[view];
  history.replaceState(null, '', `#${view}`);
  window.scrollTo({ top: 0 });
}
function wave(seed = 0, count = 38) {
  return Array.from(
    { length: count },
    (_, i) =>
      `<i style="--h:${9 + Math.abs(Math.sin(i * 1.72 + seed) * Math.sin(i * 0.23 + 0.7)) * 38}px"></i>`
  ).join('');
}
function fullJob(material) {
  return state.jobs.find(
    (j) => j.material_id === material.id && j.kind === 'full' && j.status === 'completed'
  );
}
function renderLibrary() {
  $('#nav-count').textContent = state.materials.length;
  $('#stat-materials').textContent = state.materials.length;
  $('#stat-minutes').textContent = Math.round(
    state.jobs
      .filter((j) => j.kind === 'full' && j.status === 'completed')
      .reduce((sum, j) => sum + j.duration, 0) / 60
  );
  const search = $('#search').value.toLowerCase();
  const materials = state.materials.filter((m) => {
    const ready = !!fullJob(m);
    return (
      (state.filter === 'all' || (state.filter === 'ready' ? ready : !ready)) &&
      `${m.title} ${m.text}`.toLowerCase().includes(search)
    );
  });
  $('#library-count').textContent = materials.length;
  $('#material-grid').innerHTML =
    materials
      .map((m) => {
        const job = fullJob(m);
        return `<article class="material-card"><div class="card-top"><span class="document-icon">${icon('file')}</span><span class="card-state ${job ? '' : 'draft'}">${icon(job ? 'check' : 'file')}${job ? 'Audio ready' : 'Text only'}</span></div><h3 class="card-title">${escape(m.title)}</h3><div class="card-subtitle">${escape(state.languages[m.language] || m.language)} · ${m.words.toLocaleString()} words${job ? ` · ${time(job.duration)}` : ''}</div><p class="card-excerpt">${escape(m.text.slice(0, 180))}${m.text.length > 180 ? '…' : ''}</p><div class="card-bottom"><button class="text-button" data-open="${m.id}">${job ? 'Open in studio' : 'Create audio'} ${icon('arrow')}</button><div class="card-actions">${job ? `<button class="icon-button" data-practice="${job.id}" aria-label="Practice ${escape(m.title)}">${icon('book')}</button><button class="icon-button" data-play="${job.id}" aria-label="Play ${escape(m.title)}">${icon('play')}</button>` : ''}</div></div></article>`;
      })
      .join('') ||
    `<div class="empty-state">${icon('library')}<h3>${search || state.filter !== 'all' ? 'No matching materials.' : 'Your story starts here.'}</h3><p>${search || state.filter !== 'all' ? 'Try another search or filter.' : 'Add your first text, or import a .txt or .md file.'}</p></div>`;
}
function renderJobs() {
  const jobs = state.jobs.filter((j) => !state.materialId || j.material_id === state.materialId);
  $('#job-list').innerHTML =
    jobs
      .map(
        (j) =>
          `<div class="job-row"><span class="document-icon">${icon(j.kind === 'preview' ? 'wave' : 'music')}</span><div class="job-info"><strong>${escape(j.title)}</strong><small>${escape(j.voice.replace('am_', '').replaceAll('_', ' '))} · ${j.kind === 'preview' ? 'Preview' : 'Full recording'} · ${j.speed}× · ${j.status === 'completed' ? time(j.duration) : escape(j.status)}${j.status === 'running' ? ` ${j.progress}%` : ''}</small>${['queued', 'running'].includes(j.status) ? `<div class="job-progress"><span style="width:${j.progress}%"></span></div>` : ''}${j.error ? `<small class="error">${escape(j.error)}</small>` : ''}</div>${j.status === 'completed' ? `<button class="icon-button" data-play="${j.id}" aria-label="Play recording">${icon('play')}</button><a class="icon-button" href="${j.audio_url}?download=true" aria-label="Download MP3">${icon('download')}</a><a class="text-button" href="${j.wav_url}?download=true">WAV</a>${j.kind === 'full' ? `<button class="text-button" data-practice="${j.id}">Practice ↗</button>` : ''}` : ['failed', 'interrupted'].includes(j.status) ? `<button class="text-button" data-retry="${j.id}">Retry ↻</button>` : ''}</div>`
      )
      .join('') ||
    `<div class="empty-state"><p>No recordings yet. Start with a short preview.</p></div>`;
}
function renderVoices() {
  $('#voice-grid').innerHTML = state.voices
    .filter((v) => v.id.startsWith('am_'))
    .map((v, i) => {
      const job = state.jobs.find(
        (j) => j.kind === 'preview' && j.voice === v.id && j.status === 'completed'
      );
      return `<article class="voice-card ${v.id === $('#voice').value ? 'selected' : ''}">${v.id === 'am_fenrir' ? '<span class="pill">FULL-LENGTH DEFAULT</span>' : ''}<div class="card-top"><span class="voice-avatar">${v.name[0]}</span><div><h3>${v.name}</h3><small>American English · Male</small></div></div><div class="waveform" aria-hidden="true">${wave(i, 32)}</div><p>${escape(v.note)}</p><div class="card-bottom">${job ? `<button class="button secondary" data-play="${job.id}">${icon('play')}Listen · ${time(job.duration)}</button>` : `<button class="button secondary" data-sample="${v.id}">${icon('play')}Create preview</button>`}<button class="text-button" data-choose-voice="${v.id}">Use voice ↗</button></div></article>`;
    })
    .join('');
}
function renderPracticeOptions() {
  const options = state.jobs.filter((j) => j.kind === 'full' && j.status === 'completed');
  const current = $('#practice-recording').value;
  $('#practice-recording').innerHTML =
    '<option value="">Select a full recording</option>' +
    options
      .map(
        (j) =>
          `<option value="${j.id}">${escape(j.title)} · ${escape(j.voice)} · ${time(j.duration)}</option>`
      )
      .join('');
  $('#practice-recording').value = current;
}
function refreshViews() {
  renderLibrary();
  renderJobs();
  renderVoices();
  renderPracticeOptions();
}
function updateVoiceSelect(preferred) {
  const voices = state.voices.filter((v) => v.language === $('#language').value);
  $('#voice').innerHTML = voices
    .map(
      (v) =>
        `<option value="${v.id}">${v.name} · ${v.gender === 'male' ? 'Male' : 'Female'}</option>`
    )
    .join('');
  if (voices.some((v) => v.id === preferred)) $('#voice').value = preferred;
  updateVoiceNote();
}
function updateVoiceNote() {
  $('#voice-note').textContent = state.voices.find((v) => v.id === $('#voice').value)?.note || '';
}
function updateCount() {
  const text = $('#editor').value.trim();
  $('#editor-count').textContent =
    `${text ? text.split(/\s+/).length.toLocaleString() : 0} words · ${text.length.toLocaleString()} characters`;
}
function rememberDraft() {
  try {
    localStorage.setItem(
      'llh-draft',
      JSON.stringify({
        title: $('#material-title').value,
        text: $('#editor').value,
        materialId: state.materialId,
        language: $('#language').value,
        voice: $('#voice').value,
        speed: $('#speed').value,
        pause: $('#pause').value,
      })
    );
  } catch {}
}
function openMaterial(id) {
  const material = state.materials.find((m) => m.id === id);
  if (!material) return;
  state.materialId = id;
  $('#material-title').value = material.title;
  $('#editor').value = material.text;
  $('#language').value = material.language;
  updateVoiceSelect(material.language === 'a' ? 'am_fenrir' : undefined);
  updateCount();
  renderJobs();
  rememberDraft();
  showView('studio');
}
function newMaterial() {
  state.materialId = null;
  $('#material-title').value = '';
  $('#editor').value = '';
  updateCount();
  renderJobs();
  rememberDraft();
  showView('studio');
  $('#material-title').focus();
}
async function refreshJobs() {
  const oldCompleted = new Set(state.jobs.filter((j) => j.status === 'completed').map((j) => j.id));
  const jobs = await api('/generations');
  $('#engine-status').textContent = 'Kokoro is ready when you are';
  if (JSON.stringify(jobs) === JSON.stringify(state.jobs)) return;
  state.jobs = jobs;
  if (state.jobs.some((j) => j.status === 'completed' && !oldCompleted.has(j.id)))
    toast('Your new audio is ready to listen to.');
  refreshViews();
}
async function generate(kind, voiceOverride) {
  const text = $('#editor').value.trim();
  if (!text) throw new Error('Add some text or select a material first.');
  const buttons = [$('#preview'), $('#generate')];
  buttons.forEach((b) => (b.disabled = true));
  try {
    const material = await saveDraft();
    await post('/generations', {
      text: material.text,
      title: material.title,
      language: voiceOverride ? voiceOverride[0] : $('#language').value,
      voice: voiceOverride || $('#voice').value,
      speed: Number($('#speed').value),
      pause: Number($('#pause').value),
      kind,
      material_id: material.id,
    });
    toast(
      kind === 'preview'
        ? 'Preview queued. Your voice is warming up.'
        : 'Full recording queued. You can keep exploring.'
    );
    await refreshJobs();
  } finally {
    buttons.forEach((b) => (b.disabled = false));
  }
}

const audio = $('#audio');
let lastFollow = -1;
const transport = new PracticePlayer(audio, renderPractice);

function renderPractice() {
  const { index, segments, waiting, mode } = transport;
  const ready = state.currentJob?.id === state.practiceId && segments.length > 0;
  const current = ready ? segments[index] : null;
  $$('.passage').forEach((el, i) => {
    el.classList.toggle('active', ready && i === index);
    if (ready && i === index) el.setAttribute('aria-current', 'true');
    else el.removeAttribute('aria-current');
  });
  const status = !ready
    ? 'Select a recording to begin.'
    : waiting
      ? index === segments.length - 1
        ? 'Complete. R to repeat · Space to start again.'
        : 'Your turn. Speak it aloud · Space for the next sentence.'
      : `${String(index + 1).padStart(2, '0')} / ${segments.length} · ${audio.paused ? 'Paused · Space to continue' : mode === 'loop' ? 'On repeat · Space to pause' : 'Listen closely'}`;
  $('#sentence-status').textContent = status;
  $('#focus-instruction').textContent = status;
  $('#focus-cue').textContent = waiting
    ? 'YOUR TURN TO SPEAK'
    : audio.paused
      ? 'TAKE YOUR TIME'
      : mode === 'loop'
        ? 'ONE SENTENCE. MAKE IT YOURS.'
        : 'LET THE WORDS SINK IN';
  $('#focus-title').textContent = ready ? state.currentJob.title : 'Your listening room';
  $('#focus-position').textContent = ready
    ? `${String(index + 1).padStart(2, '0')} / ${segments.length}`
    : '00 / 00';
  $('#focus-current').textContent = current?.text || 'Make room for your voice.';
  $('#focus-previous').textContent = ready ? segments[index - 1]?.text || '' : '';
  $('#focus-next').textContent = ready ? segments[index + 1]?.text || '' : '';
  $('#focus-stage').classList.toggle('your-turn', waiting);
  $('.focus-play').innerHTML = icon(audio.paused ? 'play' : 'pause');
  $$('.focus-modes button, .mode-buttons button').forEach((el) =>
    el.setAttribute('aria-pressed', String(el.dataset.mode === mode))
  );
  $$('[data-action="previous"], [data-action="next"], [data-action="replay"]').forEach(
    (el) => (el.disabled = !ready)
  );
  $('#repeat').setAttribute('aria-pressed', String(audio.loop));
  if (
    ready &&
    state.view === 'practice' &&
    $('#auto-follow').checked &&
    index !== lastFollow &&
    !document.body.classList.contains('is-immersive')
  ) {
    const active = $$('.passage')[index];
    if (active) {
      const rect = active.getBoundingClientRect();
      if (rect.top < 110 || rect.bottom > innerHeight - 130)
        active.scrollIntoView({
          block: 'center',
          behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
        });
    }
    lastFollow = index;
  }
}

function setImmersive(enabled) {
  if (enabled && (!state.practiceId || state.currentJob?.id !== state.practiceId)) {
    toast('Choose a full recording in the practice room first.');
    return;
  }
  document.body.classList.toggle('is-immersive', enabled);
  $('#focus-stage').hidden = !enabled;
  if (enabled) {
    renderPractice();
    $('.focus-exit').focus();
  } else if (state.view === 'practice') {
    lastFollow = -1;
    $('#enter-focus').focus();
  }
}

async function practiceAction(action) {
  if (action === 'escape') {
    setImmersive(false);
    return;
  }
  if (action === 'focus') {
    setImmersive(!document.body.classList.contains('is-immersive'));
    return;
  }
  if (!state.currentJob) return;
  if (action === 'toggle') return transport.toggle();
  if (state.currentJob.id !== state.practiceId) return;
  const index =
    action === 'previous'
      ? transport.index - 1
      : action === 'next'
        ? transport.index + 1
        : transport.index;
  return transport.playSentence(index);
}

async function loadAudio(id, autoplay = true) {
  if (state.currentJob?.id !== id) {
    audio.pause();
    const job = await api(`/generations/${id}`);
    if (job.status !== 'completed') throw new Error('This recording is not ready yet.');
    state.currentJob = job;
    state.segment = -1;
    audio.src = job.audio_url;
    transport.load([]);
    audio.playbackRate = Number($('#playback-rate').value);
    $('#player-title').textContent = job.title;
    $('#player-subtitle').textContent =
      `${job.voice} · ${job.kind === 'preview' ? 'Preview' : 'Full recording'}`;
    $('#duration').textContent = time(job.duration);
    $('#player-download').href = `${job.audio_url}?download=true`;
    $('.player').hidden = false;
    document.body.classList.add('player-visible');
  }
  if (autoplay) await audio.play();
  return state.currentJob;
}
async function practice(id) {
  const job = await loadAudio(id, false);
  state.practiceId = id;
  $('#practice-recording').value = id;
  lastFollow = -1;
  $('#transcript').innerHTML = job.segments
    .map(
      (s, i) =>
        `<button class="passage" data-segment="${i}"><span class="passage-number">${String(i + 1).padStart(2, '0')}<br>${time(s.start)}</span><span class="passage-text">${escape(s.text)}</span></button>`
    )
    .join('');
  showView('practice');
  transport.load(job.segments);
  transport.seek(audio.currentTime || 0);
}
window.addEventListener('hashchange', () => showView(location.hash.slice(1)));
document.addEventListener(
  'click',
  safely(async (event) => {
    const target = event.target.closest('button, a');
    if (!target) return;
    if (target.dataset.action) {
      await practiceAction(target.dataset.action);
      return;
    }
    if (target.dataset.mode) {
      transport.setMode(target.dataset.mode);
      rememberPreferences();
      return;
    }
    if (target.dataset.view) showView(target.dataset.view);
    if (target.dataset.open) openMaterial(target.dataset.open);
    if (target.dataset.play) {
      if (state.currentJob?.id === target.dataset.play && !audio.paused) audio.pause();
      else await loadAudio(target.dataset.play);
    }
    if (target.dataset.practice) await practice(target.dataset.practice);
    if (target.dataset.filter) {
      state.filter = target.dataset.filter;
      $$('[data-filter]').forEach((el) => el.classList.toggle('active', el === target));
      renderLibrary();
    }
    if (target.dataset.chooseVoice) {
      $('#language').value = 'a';
      updateVoiceSelect(target.dataset.chooseVoice);
      renderVoices();
      showView('studio');
      toast(`${target.dataset.chooseVoice.slice(3)} selected. Your text is ready when you are.`);
    }
    if (target.dataset.sample) {
      const material = [...state.materials].sort((a, b) => a.title.localeCompare(b.title))[0];
      if (!material) throw new Error('Import a material first to create a voice preview.');
      await post('/generations', {
        text: material.text,
        title: material.title,
        voice: target.dataset.sample,
        language: 'a',
        speed: 0.95,
        pause: 0.3,
        kind: 'preview',
        material_id: material.id,
      });
      toast('Voice preview queued.');
      await refreshJobs();
    }
    if (target.dataset.retry) {
      const job = await api(`/generations/${target.dataset.retry}`);
      await post('/generations', {
        text: job.text,
        title: job.title,
        voice: job.voice,
        language: job.voice[0],
        speed: job.speed,
        pause: job.pause,
        kind: job.kind,
        material_id: job.material_id,
      });
      toast('A new attempt has been queued.');
      await refreshJobs();
    }
    if (target.dataset.segment !== undefined) {
      if (state.currentJob?.id !== state.practiceId) await loadAudio(state.practiceId, false);
      if (!transport.segments.length) transport.load(state.currentJob.segments);
      await transport.playSentence(Number(target.dataset.segment));
    }
  })
);
$('#search').addEventListener('input', renderLibrary);
$('#new-material').onclick = newMaterial;
$('#hero-start').onclick = () =>
  state.materials.length ? openMaterial(state.materials[0].id) : newMaterial();
$('#browse-voices').onclick = () => showView('voices');
$('#all-voices').onclick = () => {
  showView('studio');
  $('#language').focus();
};
$('#language').onchange = () => {
  updateVoiceSelect();
  rememberDraft();
};
$('#voice').onchange = () => {
  updateVoiceNote();
  renderVoices();
  rememberDraft();
};
$('#speed').oninput = () => {
  $('#speed-value').textContent = `${Number($('#speed').value).toFixed(2)}×`;
  rememberDraft();
};
$('#pause').oninput = () => {
  $('#pause-value').textContent = `${$('#pause').value}s`;
  rememberDraft();
};
$('#editor').oninput = () => {
  updateCount();
  rememberDraft();
};
$('#material-title').oninput = rememberDraft;
$('#preview').onclick = safely(() => generate('preview'));
$('#generate').onclick = safely(() => generate('full'));
async function saveDraft() {
  const title = $('#material-title').value.trim() || 'Untitled material';
  const text = $('#editor').value.trim();
  if (!text) throw new Error('Add some text before saving.');
  const existing = state.materials.find(
    (m) => m.title === title && m.text === text && m.language === $('#language').value
  );
  if (existing) {
    state.materialId = existing.id;
    renderJobs();
    return existing;
  }
  const material = await post('/materials', { title, text, language: $('#language').value });
  state.materials = await api('/materials');
  state.materialId = material.id;
  $('#editor').value = material.text;
  updateCount();
  refreshViews();
  rememberDraft();
  return material;
}
$('#save-material').onclick = safely(async () => {
  await saveDraft();
  toast('Saved to your library. Existing versions are kept.');
});
$('#import-button').onclick = $('#studio-import').onclick = () => $('#file-input').click();
$('#file-input').onchange = safely(async () => {
  const file = $('#file-input').files[0];
  if (!file) return;
  const form = new FormData();
  form.append('file', file);
  form.append('language', $('#language').value || 'a');
  try {
    const material = await api('/materials/upload', { method: 'POST', body: form });
    state.materials = await api('/materials');
    refreshViews();
    openMaterial(material.id);
    toast('Material imported. Take a moment to check the text and language.');
  } finally {
    $('#file-input').value = '';
  }
});
$('#play-toggle').onclick = safely(() => transport.toggle());
let animationFrame;
function playbackFrame() {
  if (state.currentJob?.id === state.practiceId) transport.tick();
  if (!audio.paused) animationFrame = requestAnimationFrame(playbackFrame);
}
audio.onplay = () => {
  $('#play-toggle').innerHTML = icon('pause');
  $('#play-toggle').setAttribute('aria-label', 'Pause');
  cancelAnimationFrame(animationFrame);
  animationFrame = requestAnimationFrame(playbackFrame);
  renderPractice();
};
audio.onpause = () => {
  $('#play-toggle').innerHTML = icon('play');
  $('#play-toggle').setAttribute('aria-label', 'Play');
  cancelAnimationFrame(animationFrame);
  renderPractice();
};
audio.onended = safely(() => transport.ended());
audio.onerror = () =>
  toast('This audio could not be loaded. Check that the local server is running.', true);
audio.onloadedmetadata = () => {
  $('#seek').max = audio.duration;
  $('#duration').textContent = time(audio.duration);
};
audio.ontimeupdate = () => {
  $('#seek').value = audio.currentTime;
  $('#current-time').textContent = time(audio.currentTime);
  if (state.currentJob?.id === state.practiceId) transport.tick();
};
$('#seek').oninput = () => transport.seek(Number($('#seek').value));
$('#playback-rate').onchange = () => (audio.playbackRate = Number($('#playback-rate').value));
$('#repeat').onclick = () => {
  audio.loop = !audio.loop;
  if (audio.loop) transport.setMode('continuous');
  $('#repeat').setAttribute('aria-pressed', String(audio.loop));
};
let spaceHandled = false;
document.addEventListener(
  'keydown',
  (event) => {
    const action = shortcutAction(event);
    if (!action || !state.currentJob || (state.view !== 'practice' && action !== 'toggle')) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.code === 'Space') spaceHandled = true;
    if (!event.repeat) safely(practiceAction)(action);
  },
  true
);
document.addEventListener(
  'keyup',
  (event) => {
    if (event.code === 'Space' && spaceHandled) {
      event.preventDefault();
      event.stopPropagation();
      spaceHandled = false;
    }
  },
  true
);
function rememberPreferences() {
  try {
    localStorage.setItem(
      'sayloop-preferences',
      JSON.stringify({
        collapsed: document.body.classList.contains('sidebar-collapsed'),
        follow: $('#auto-follow').checked,
        mode: transport.mode,
      })
    );
  } catch {}
}
function collapseSidebar(collapsed) {
  document.body.classList.toggle('sidebar-collapsed', collapsed);
  $('#sidebar-toggle').setAttribute('aria-expanded', String(!collapsed));
  $('#sidebar-toggle').setAttribute(
    'aria-label',
    collapsed ? 'Expand sidebar' : 'Collapse sidebar'
  );
}
$('#sidebar-toggle').onclick = () => {
  collapseSidebar(!document.body.classList.contains('sidebar-collapsed'));
  rememberPreferences();
};
$('#auto-follow').onchange = () => {
  lastFollow = -1;
  renderPractice();
  rememberPreferences();
};
$('#practice-recording').onchange = safely(async () => {
  if ($('#practice-recording').value) await practice($('#practice-recording').value);
});
$('#hide-text').onclick = () => {
  const hidden = $('#transcript').classList.toggle('concealed');
  $('#focus-stage').classList.toggle('text-hidden', hidden);
  $('#hide-text').textContent = hidden ? 'Show text' : 'Hide text';
};
setInterval(() => {
  const key = `llh-listening-${new Date().toLocaleDateString('en-CA')}`;
  try {
    let seconds = Number(localStorage.getItem(key) || 0);
    if (!audio.paused && !audio.ended && !audio.seeking && audio.readyState >= 3)
      localStorage.setItem(key, String(++seconds));
    $('#practice-time').textContent = `${Math.floor(seconds / 60)} min listened today`;
  } catch {}
}, 1000);
async function init() {
  icons();
  $('.decorative-wave').innerHTML = wave(2, 40);
  const [catalog, materials, jobs, health] = await Promise.all([
    api('/voices'),
    api('/materials'),
    api('/generations'),
    api('/health'),
  ]);
  Object.assign(state, catalog, { materials, jobs });
  $('#engine-status').textContent = health.ffmpeg
    ? 'Kokoro is ready when you are'
    : 'FFmpeg is missing — check setup';
  $('#language').innerHTML = Object.entries(catalog.languages)
    .map(([id, name]) => `<option value="${id}">${name}</option>`)
    .join('');
  updateVoiceSelect('am_fenrir');
  try {
    const preferences = JSON.parse(localStorage.getItem('sayloop-preferences') || '{}');
    collapseSidebar(Boolean(preferences.collapsed));
    $('#auto-follow').checked = preferences.follow !== false;
    transport.setMode(preferences.mode || 'continuous');
  } catch {}
  try {
    const draft = JSON.parse(localStorage.getItem('llh-draft') || 'null');
    if (draft) {
      $('#material-title').value = draft.title;
      $('#editor').value = draft.text;
      state.materialId = materials.some((m) => m.id === draft.materialId) ? draft.materialId : null;
      if (state.languages[draft.language]) $('#language').value = draft.language;
      updateVoiceSelect(draft.voice || 'am_fenrir');
      if (draft.speed) {
        $('#speed').value = draft.speed;
        $('#speed-value').textContent = `${Number(draft.speed).toFixed(2)}×`;
      }
      if (draft.pause !== undefined) {
        $('#pause').value = draft.pause;
        $('#pause-value').textContent = `${draft.pause}s`;
      }
    } else if (materials.length) {
      const first = [...materials].sort((a, b) => a.title.localeCompare(b.title))[0];
      $('#material-title').value = first.title;
      $('#editor').value = first.text;
      state.materialId = first.id;
    }
  } catch {}
  updateCount();
  refreshViews();
  showView(location.hash.slice(1) || 'library');
  let polling = false;
  setInterval(async () => {
    if (polling) return;
    polling = true;
    try {
      await refreshJobs();
    } catch {
      $('#engine-status').textContent = 'Server unavailable — reconnecting…';
    } finally {
      polling = false;
    }
  }, 3500);
}
safely(init)();
