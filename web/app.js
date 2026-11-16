import { cachedAudio, saveAudio, removeAudio, adoptLegacyAudio } from './audio-cache.js';
import { PracticePlayer, shortcutAction } from './practice-player.js';
import { closeSheets, initNavigation, openSheet, syncNavigation } from './navigation.js';
import {
  authenticate,
  initWorkspace,
  refreshProgress,
  manageMaterial,
  beginStudy,
} from './workspace.js';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const paths = {
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
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
    if (response.status === 401 && state.user && path !== '/auth/login') location.reload();
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
  if (!['library', 'studio', 'voices', 'practice', 'authoring', 'progress'].includes(view))
    view = 'library';
  state.view = view;
  closeSheets();
  if (view !== 'practice') setImmersive(false);
  $$('.view').forEach((el) => (el.hidden = el.id !== `view-${view}`));
  syncNavigation(view);
  $('#breadcrumb').textContent = {
    library: '语料库',
    studio: '语音工作台',
    voices: '声音库',
    practice: '练习室',
    authoring: '语料创作',
    progress: '学习进度',
  }[view];
  history.replaceState(null, '', `#${view}`);
  window.scrollTo({ top: 0 });
  if (view === 'progress' && state.user)
    void refreshProgress().catch((error) => toast(error.message, true));
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
  const materials = state.materials
    .filter((m) => {
      const ready = !!fullJob(m);
      return (
        (m.archived
          ? $('#library-scope').value === 'archived'
          : $('#library-scope').value !== 'archived') &&
        (!$('#library-language').value || m.language === $('#library-language').value) &&
        (!$('#library-kind').value ||
          ($('#library-kind').value === 'dialogue' ? m.turns?.length : !m.turns?.length)) &&
        (!$('#library-scope').value ||
          $('#library-scope').value === 'archived' ||
          ($('#library-scope').value === 'mine'
            ? m.owned
            : $('#library-scope').value === 'shared'
              ? m.visibility === 'shared'
              : m.favorite)) &&
        (state.filter === 'all' || (state.filter === 'ready' ? ready : !ready)) &&
        `${m.title} ${m.text} ${(m.tags || []).join(' ')}`.toLowerCase().includes(search)
      );
    })
    .sort((a, b) =>
      $('#library-sort').value === 'title'
        ? a.title.localeCompare(b.title)
        : (b.created_at || '').localeCompare(a.created_at || '')
    );
  $('#library-count').textContent = materials.length;
  const filterCount =
    ['library-language', 'library-kind', 'library-scope'].filter((id) => $(`#${id}`).value).length +
    Number($('#library-sort').value !== 'new');
  $('#active-filter-count').textContent = filterCount;
  $('#active-filter-count').hidden = !filterCount;
  $('#library-load-more').hidden = materials.length <= (state.libraryLimit || 24);
  $('#material-grid').innerHTML =
    materials
      .slice(0, state.libraryLimit || 24)
      .map((m) => {
        const job = fullJob(m);
        return `<article class="material-card"><div class="card-top"><span class="document-icon">${icon(m.turns?.length ? 'headphones' : 'file')}</span><span class="card-state ${job ? '' : 'draft'}">${icon(job ? 'check' : 'file')}${job ? '可练习' : '待配音'}</span></div><h3 class="card-title"><button class="material-open" data-open="${m.id}">${m.favorite ? '☆ ' : ''}${escape(m.title)}</button></h3><div class="card-subtitle">${escape(state.languages[m.language] || m.language)} · ${m.words.toLocaleString()} 词${job ? ` · ${time(job.duration)}` : ''}</div><div class="material-tags">${m.turns?.length ? '<span>角色对话</span>' : ''}${m.visibility === 'shared' ? '<span>已共享</span>' : ''}${(m.tags || []).map((tag) => `<span>${escape(tag)}</span>`).join('')}</div><p class="card-excerpt">${escape(m.text.slice(0, 180))}${m.text.length > 180 ? '…' : ''}</p><div class="card-bottom">${job ? `<button class="button secondary" data-practice="${job.id}">${icon('play')}开始练习</button>` : `<button class="button secondary" data-open="${m.id}">${icon('wave')}制作语音</button>`}<button class="icon-button" data-material-menu="${m.id}" aria-label="${escape(m.title)}的更多操作">${icon('more')}</button></div></article>`;
      })
      .join('') ||
    `<div class="empty-state">${icon('library')}<h3>${search || state.filter !== 'all' ? '没有找到匹配的语料' : '从自己的表达开始'}</h3><p>${search || state.filter !== 'all' ? '试试其他关键词，或调整筛选条件。' : '写一段想说的话，或导入已有文本。'}</p></div>`;
}
function showMaterialMenu(material) {
  if (!material) return;
  const job = fullJob(material);
  $('#material-menu-title').textContent = material.title;
  $('#material-menu-content').innerHTML =
    `<button data-open="${material.id}">${icon('sliders')}<span>编辑文字与配音</span></button>` +
    (job ? `<button data-play="${job.id}">${icon('play')}<span>试听录音</span></button>` : '') +
    (material.owned
      ? `<button data-manage="${material.id}">${icon('file')}<span>标签与语料权限</span></button>`
      : '');
  openSheet('material-menu');
}
function showRecordingMenu(job) {
  if (!job) return;
  $('#material-menu-title').textContent = job.title;
  const download = (url) => `${url}${url.includes('?') ? '&' : '?'}download=true`;
  $('#material-menu-content').innerHTML =
    `<button data-play="${job.id}">${icon('play')}<span>试听录音</span></button>` +
    (job.kind === 'full'
      ? `<button data-practice="${job.id}">${icon('book')}<span>进入逐句练习</span></button>`
      : '') +
    `<a href="${escape(download(job.audio_url))}">${icon('download')}<span>下载 MP3</span></a><a href="${escape(download(job.wav_url))}">${icon('download')}<span>下载原始 WAV</span></a>`;
  openSheet('material-menu');
}
function renderJobs() {
  const jobs = state.jobs.filter((j) => !state.materialId || j.material_id === state.materialId);
  const statusNames = {
    queued: '排队中',
    running: '生成中',
    completed: '已完成',
    failed: '生成失败',
    interrupted: '已中断',
  };
  $('#job-list').innerHTML =
    jobs
      .map((job) => {
        const ready = job.status === 'completed';
        const action = ready
          ? `<button class="button secondary" ${job.kind === 'full' ? 'data-practice' : 'data-play'}="${job.id}">${job.kind === 'full' ? '开始练习' : '试听'}</button><button class="icon-button" data-recording-menu="${job.id}" aria-label="${escape(job.title)}的录音操作">${icon('more')}</button>`
          : ['failed', 'interrupted'].includes(job.status)
            ? `<button class="button secondary" data-retry="${job.id}">重新生成</button>`
            : '';
        return `<div class="job-row"><span class="document-icon">${icon(job.kind === 'preview' ? 'wave' : 'music')}</span><div class="job-info"><strong>${escape(job.title)}</strong><small>${escape(job.voice)} · ${job.kind === 'preview' ? '试听' : '完整录音'} · ${job.speed}× · ${ready ? time(job.duration) : statusNames[job.status]}${job.status === 'running' ? ` ${job.progress}%` : ''}</small>${['queued', 'running'].includes(job.status) ? `<div class="job-progress"><span style="width:${job.progress}%"></span></div>` : ''}${job.error ? `<small class="error">${escape(job.error)}</small>` : ''}</div>${action}</div>`;
      })
      .join('') || '<div class="empty-state"><p>还没有录音，先生成一段试听吧。</p></div>';
}
function renderVoices() {
  $('#voice-grid').innerHTML = state.voices
    .filter(
      (v) =>
        v.language === $('#voice-language').value &&
        (!$('#voice-gender').value || v.gender === $('#voice-gender').value)
    )
    .map((v) => {
      const job = state.jobs.find(
        (j) => j.kind === 'preview' && j.voice === v.id && j.status === 'completed'
      );
      return `<article class="voice-card ${v.id === $('#voice').value ? 'selected' : ''}"><div class="card-top"><span class="voice-avatar">${v.name[0]}</span><div><h3>${v.name}</h3><small>${escape(state.languages[v.language])} · ${v.gender === 'female' ? '女声' : '男声'}</small></div></div><p>${escape(v.note)}</p><div class="card-bottom">${job ? `<button class="button secondary" data-play="${job.id}">${icon('play')}试听</button>` : `<button class="button secondary" data-sample="${v.id}">${icon('play')}生成试听</button>`}<button class="text-button" data-choose-voice="${v.id}">${v.id === $('#voice').value ? '已选用 ✓' : '选用声音'}</button></div></article>`;
    })
    .join('');
}
function renderPracticeOptions() {
  const options = state.jobs.filter((j) => j.kind === 'full' && j.status === 'completed');
  const current = $('#practice-recording').value;
  $('#practice-recording').innerHTML =
    '<option value="">选择一份完整录音</option>' +
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
      (v) => `<option value="${v.id}">${v.name} · ${v.gender === 'male' ? '男声' : '女声'}</option>`
    )
    .join('');
  $('#voice-b').innerHTML = $('#voice').innerHTML;
  $('#voice-b').value = voices.find((v) => v.gender === 'female')?.id || voices[0]?.id || '';
  if (voices.some((v) => v.id === preferred)) $('#voice').value = preferred;
  updateVoiceNote();
}
function updateVoiceNote() {
  $('#voice-note').textContent = state.voices.find((v) => v.id === $('#voice').value)?.note || '';
}
function updateCount() {
  const text = $('#editor').value.trim();
  $('#editor-count').textContent =
    `${text ? text.split(/\s+/).length.toLocaleString() : 0} 词 · ${text.length.toLocaleString()} 字`;
}
function rememberDraft() {
  try {
    localStorage.setItem(
      `llh-draft-${state.user.id}`,
      JSON.stringify({
        title: $('#material-title').value,
        text: $('#editor').value,
        materialId: state.materialId,
        language: $('#language').value,
        voice: $('#voice').value,
        voice_b: $('#voice-b').value,
        speed: $('#speed').value,
        pause: $('#pause').value,
      })
    );
  } catch {}
}
function syncDialogueControls(material) {
  const dialogue = Boolean(material?.turns?.length && material.text === $('#editor').value.trim());
  $('#editor').readOnly = dialogue;
  $('#voice-b-row').hidden = !dialogue;
  $('#voice-label').textContent = dialogue ? `角色 A：${material.role_a}` : '配音声音';
  $('#dialogue-note').textContent = dialogue
    ? `角色 B：${material.role_b}。只朗读台词，角色名和中文释义会保留在练习页面。`
    : '';
}
function openMaterial(id) {
  const material = state.materials.find((m) => m.id === id);
  if (!material) return;
  state.materialId = id;
  $('#material-title').value = material.title;
  $('#editor').value = material.text;
  syncDialogueControls(material);
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
  syncDialogueControls(null);
  updateCount();
  renderJobs();
  rememberDraft();
  showView('studio');
  $('#material-title').focus();
}
async function refreshJobs() {
  const oldCompleted = new Set(state.jobs.filter((j) => j.status === 'completed').map((j) => j.id));
  const jobs = await api('/generations');
  $('#engine-status').textContent = '语音服务已就绪';
  if (JSON.stringify(jobs) === JSON.stringify(state.jobs)) return;
  state.jobs = jobs;
  if (state.jobs.some((j) => j.status === 'completed' && !oldCompleted.has(j.id)))
    toast('新录音已生成，可以试听了。');
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
      voice_b: $('#voice-b-row').hidden ? null : $('#voice-b').value,
      speed: Number($('#speed').value),
      pause: Number($('#pause').value),
      kind,
      material_id: material.id,
    });
    toast(kind === 'preview' ? '试听已排队，可以继续编辑。' : '完整录音已排队，完成后会通知你。');
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
    ? '选择录音，开始练习。'
    : waiting
      ? index === segments.length - 1
        ? '本轮完成 · R 重播 · 空格重新开始'
        : '轮到你说 · 读完后按空格继续'
      : `${String(index + 1).padStart(2, '0')} / ${segments.length} · ${audio.paused ? '已暂停 · 空格继续' : mode === 'loop' ? '循环中 · 空格暂停' : '正在播放'}`;
  $('#sentence-status').textContent = status;
  $('#focus-instruction').textContent = status;
  $('#focus-cue').textContent = waiting
    ? '轮到你说'
    : audio.paused
      ? '慢慢来'
      : mode === 'loop'
        ? '把这一句练熟'
        : '听清楚，再跟着说';
  $('#focus-title').textContent = ready ? state.currentJob.title : '专注练习';
  $('#focus-position').textContent = ready
    ? `${String(index + 1).padStart(2, '0')} / ${segments.length}`
    : '00 / 00';
  $('#focus-current').textContent = current?.text || '给自己的声音留一点时间。';
  $('#focus-previous').textContent = ready ? segments[index - 1]?.text || '' : '';
  $('#focus-next').textContent = ready ? segments[index + 1]?.text || '' : '';
  if (current?.role)
    $('#focus-cue').textContent = `${current.role} · ${$('#focus-cue').textContent}`;
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
      const bottomEdge = $('.player').hidden
        ? innerHeight - 80
        : $('.player').getBoundingClientRect().top - 20;
      if (rect.top < 110 || rect.bottom > bottomEdge)
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
    toast('先选择一份完整录音，再进入专注练习。');
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

let audioLoadSequence = 0;
let activeBlobUrl;
async function deviceStatus(job) {
  try {
    const blob = await cachedAudio(job.audio_url);
    if (state.currentJob?.id !== job.id) return;
    $('#save-device').disabled = false;
    $('#save-device').textContent = blob ? '已保存到此设备 ✓' : '保存到此设备';
    $('#remove-device').hidden = !blob;
    $('#device-status').textContent = blob
      ? `${(blob.size / 1048576).toFixed(1)} MB · 下次打开直接使用设备副本`
      : '在 Wi‑Fi 下保存，外出练习时不再传输音频。';
  } catch {
    $('#device-status').textContent = '设备存储不可用，仍可在线播放。';
    $('#save-device').disabled = true;
  }
}
$('#save-device').addEventListener(
  'click',
  safely(async () => {
    const job = state.currentJob;
    if (!job) return;
    $('#save-device').disabled = true;
    $('#save-device').textContent = '正在保存…';
    try {
      await saveAudio(job.audio_url);
      toast('录音已保存到此设备，请继续使用同一个网址访问。');
    } finally {
      if (state.currentJob) await deviceStatus(state.currentJob);
    }
  })
);
$('#remove-device').addEventListener(
  'click',
  safely(async () => {
    const job = state.currentJob;
    if (!job) return;
    await removeAudio(job.audio_url);
    await deviceStatus(state.currentJob);
    toast('已移除设备副本，服务器原件仍保留。');
  })
);
async function loadAudio(id, autoplay = true) {
  if (state.currentJob?.id !== id) {
    const sequence = ++audioLoadSequence;
    audio.pause();
    const job = await api(`/generations/${id}`);
    if (job.status !== 'completed') throw new Error('This recording is not ready yet.');
    const blob =
      (await cachedAudio(job.audio_url).catch(() => null)) ||
      (await adoptLegacyAudio(job.audio_url).catch(() => null));
    if (sequence !== audioLoadSequence) throw new Error('Another recording was selected.');
    state.currentJob = job;
    state.segment = -1;
    if (activeBlobUrl) URL.revokeObjectURL(activeBlobUrl);
    activeBlobUrl = blob ? URL.createObjectURL(blob) : null;
    audio.src = activeBlobUrl || job.audio_url;
    void deviceStatus(job);
    void beginStudy(job).catch((error) => toast(error.message, true));
    transport.load([]);
    audio.playbackRate = Number($('#playback-rate').value);
    $('#player-title').textContent = job.title;
    $('#player-subtitle').textContent =
      `${job.voice} · ${job.kind === 'preview' ? '试听' : '完整录音'}`;
    $('#duration').textContent = time(job.duration);
    $('#player-download').href =
      `${job.audio_url}${job.audio_url.includes('?') ? '&' : '?'}download=true`;
  }
  $('.player').hidden = false;
  document.body.classList.add('player-visible');
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
        `<button class="passage" data-segment="${i}"><span class="passage-number">${s.role ? escape(s.role) : String(i + 1).padStart(2, '0')}<br>${time(s.start)}</span><span class="passage-text">${escape(s.text)}${s.translation ? `<small class="passage-translation">${escape(s.translation)}</small>` : ''}</span></button>`
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
    if (
      target.closest('.action-sheet') &&
      ['view', 'open', 'play', 'practice', 'manage'].some((key) => target.dataset[key])
    )
      closeSheets();
    if (target.dataset.recordingMenu)
      showRecordingMenu(state.jobs.find((job) => job.id === target.dataset.recordingMenu));
    if (target.dataset.materialMenu)
      showMaterialMenu(state.materials.find((m) => m.id === target.dataset.materialMenu));
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
    if (target.dataset.manage)
      manageMaterial(state.materials.find((m) => m.id === target.dataset.manage));
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
      $('#language').value = target.dataset.chooseVoice[0];
      updateVoiceSelect(target.dataset.chooseVoice);
      renderVoices();
      showView('studio');
      toast(`${target.dataset.chooseVoice.slice(3)} selected. Your text is ready when you are.`);
    }
    if (target.dataset.sample) {
      const voice = target.dataset.sample;
      const samples = {
        a: 'Could we go over the delivery schedule together? I would like to make sure we have enough time.',
        b: 'Could we go over the delivery schedule together?',
        z: '我们可以一起确认一下交付时间吗？我希望预留充分的时间。',
        e: '¿Podemos revisar juntos el calendario de entrega?',
        f: 'Pouvons-nous revoir ensemble le calendrier de livraison ?',
        h: 'क्या हम समय के बारे में बात कर सकते हैं?',
        i: 'Possiamo rivedere insieme il programma di consegna?',
        j: '納品の日程を一緒に確認できますか。',
        p: 'Podemos revisar juntos o cronograma de entrega?',
      };
      await post('/generations', {
        text: samples[voice[0]],
        title: 'Voice preview',
        voice,
        language: voice[0],
        speed: 0.95,
        pause: 0.3,
        kind: 'preview',
      });
      toast('试听已排队。');
      await refreshJobs();
    }
    if (target.dataset.retry) {
      const job = await api(`/generations/${target.dataset.retry}`);
      await post('/generations', {
        text: job.text,
        title: job.title,
        voice: job.voice,
        voice_b: job.voice_b || null,
        language: job.voice[0],
        speed: job.speed,
        pause: job.pause,
        kind: job.kind,
        material_id: job.material_id,
      });
      toast('已重新加入生成队列。');
      await refreshJobs();
    }
    if (target.dataset.segment !== undefined) {
      if (state.currentJob?.id !== state.practiceId) await loadAudio(state.practiceId, false);
      if (!transport.segments.length) transport.load(state.currentJob.segments);
      await transport.playSentence(Number(target.dataset.segment));
    }
  })
);
$('#search').addEventListener('input', () => {
  state.libraryLimit = 24;
  renderLibrary();
});
$('#library-load-more').onclick = () => {
  state.libraryLimit = (state.libraryLimit || 24) + 24;
  renderLibrary();
};
['library-language', 'library-kind', 'library-scope', 'library-sort'].forEach(
  (id) => ($(`#${id}`).onchange = renderLibrary)
);
['voice-language', 'voice-gender'].forEach((id) => ($(`#${id}`).onchange = renderVoices));
$('#new-material').onclick = newMaterial;
$('#hero-start').onclick = () => showView('authoring');
$('#browse-voices').onclick = () => showView('voices');
$('#all-voices').onclick = () => {
  showView('studio');
  $('#language').focus();
};
$('#language').onchange = () => {
  updateVoiceSelect();
  rememberDraft();
};
$('#voice-b').onchange = rememberDraft;
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
  const source = state.materials.find((material) => material.id === state.materialId);
  const dialogue =
    source?.turns?.length && source.text === text
      ? { turns: source.turns, role_a: source.role_a, role_b: source.role_b }
      : {};
  const material = await post('/materials', {
    title,
    text,
    language: $('#language').value,
    ...dialogue,
  });
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
  toast('已保存到语料库，原有版本仍保留。');
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
    toast('文本已导入，请确认文字和对应语言。');
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
  $('.player').hidden = false;
  document.body.classList.add('player-visible');
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
    if (document.querySelector('dialog[open]')) return;
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
  $('#sidebar-toggle').setAttribute('aria-label', collapsed ? '展开侧栏' : '收起侧栏');
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
  $('#hide-text').textContent = hidden ? '显示文字' : '隐藏文字';
};
async function init() {
  icons();
  initNavigation();
  await authenticate({ api, post, state, toast, showView, openMaterial, refreshViews });
  const [catalog, materials, jobs, health] = await Promise.all([
    api('/voices'),
    api('/materials'),
    api('/generations'),
    api('/health'),
  ]);
  const languageNames = {
    a: '美式英语',
    b: '英式英语',
    e: '西班牙语',
    f: '法语',
    h: '印地语',
    i: '意大利语',
    j: '日语',
    p: '巴西葡萄牙语',
    z: '普通话',
  };
  catalog.languages = Object.fromEntries(
    Object.entries(catalog.languages).map(([id, name]) => [id, languageNames[id] || name])
  );
  Object.assign(state, catalog, { materials, jobs });
  $('#engine-status').textContent = health.ffmpeg
    ? '语音服务已就绪'
    : '缺少 FFmpeg，请检查运行环境';
  $('#language').innerHTML = Object.entries(catalog.languages)
    .map(([id, name]) => `<option value="${id}">${name}</option>`)
    .join('');
  updateVoiceSelect('am_fenrir');
  await initWorkspace();
  try {
    const preferences = JSON.parse(localStorage.getItem('sayloop-preferences') || '{}');
    collapseSidebar(Boolean(preferences.collapsed));
    $('#auto-follow').checked = preferences.follow !== false;
    transport.setMode(preferences.mode || 'continuous');
  } catch {}
  try {
    const draft = JSON.parse(localStorage.getItem(`llh-draft-${state.user.id}`) || 'null');
    if (draft) {
      $('#material-title').value = draft.title;
      $('#editor').value = draft.text;
      state.materialId = materials.some((m) => m.id === draft.materialId) ? draft.materialId : null;
      if (state.languages[draft.language]) $('#language').value = draft.language;
      updateVoiceSelect(draft.voice || 'am_fenrir');
      if ([...$('#voice-b').options].some((option) => option.value === draft.voice_b))
        $('#voice-b').value = draft.voice_b;
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
      $('#language').value = first.language;
      updateVoiceSelect(first.language === 'a' ? 'am_fenrir' : undefined);
    }
  } catch {}
  syncDialogueControls(state.materials.find((material) => material.id === state.materialId));
  updateCount();
  refreshViews();
  showView(location.hash.slice(1) || 'library');
  let polling = false;
  let lastRefresh = Date.now();
  async function pollJobs(force = false) {
    const active = state.jobs.some((job) => ['queued', 'running'].includes(job.status));
    if (polling || document.hidden || (!force && !active && Date.now() - lastRefresh < 30000))
      return;
    lastRefresh = Date.now();
    polling = true;
    try {
      await refreshJobs();
    } catch {
      $('#engine-status').textContent = '连接暂时中断，正在重连…';
    } finally {
      polling = false;
    }
  }
  setInterval(() => void pollJobs(), 3500);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) void pollJobs(true);
  });
}
safely(init)();
