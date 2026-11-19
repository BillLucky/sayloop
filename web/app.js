import { requestId } from './request-id.js';
import { cachedAudio, saveAudio, removeAudio, adoptLegacyAudio } from './audio-cache.js';
import { PracticePlayer, shortcutAction } from './practice-player.js';
import { readyRecordings, matchingMaterials, hasLibraryFilters } from './library.js';
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
let studioEpoch = 0;
let studioSubmitting = false;
let studioSessionActive = true;
let pendingGeneration;
let jobMutationEpoch = 0;
let jobsReadSequence = 0;
const pendingVoiceSamples = new Set();
const pendingRetries = new Map();
const sampleAttempts = new Map();
const retryAttempts = new Map();
let studioDraftTimer;
window.addEventListener('sayloop:logout', () => {
  studioSessionActive = false;
  audio.pause();
  audioLoadSequence += 1;
  clearTimeout(studioDraftTimer);
  studioEpoch += 1;
  pendingGeneration = null;
});
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
    if (response.status === 401 && state.user && !state.loggingOut && path !== '/auth/login')
      location.reload();
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
      if (error.name !== 'AbortError' && !state.loggingOut) toast(error.message, true);
    }
  };
const viewScroll = new Map();
function showView(view, { restoreScroll = false } = {}) {
  if (!['library', 'studio', 'voices', 'practice', 'authoring', 'progress'].includes(view))
    view = 'library';
  const previous = state.view;
  if (previous !== view && !document.body.classList.contains('is-immersive'))
    viewScroll.set(previous, scrollY);
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
  window.scrollTo({ top: restoreScroll && previous !== view ? viewScroll.get(view) || 0 : 0 });
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
  const filters = {
    query: $('#search').value,
    language: $('#library-language').value,
    kind: $('#library-kind').value,
    scope: $('#library-scope').value,
    sort: $('#library-sort').value,
    status: state.filter,
  };
  const ready = readyRecordings(state.jobs);
  const materials = matchingMaterials(state.materials, ready, filters);
  const filtered = hasLibraryFilters(filters);
  $('#clear-library-filters').hidden = !filtered;
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
      .map((material) => renderMaterialCard(material, ready.get(material.id)))
      .join('') ||
    `<div class="empty-state">${icon('library')}<h3>${filtered ? '没有找到匹配的语料' : '从自己的表达开始'}</h3><p>${filtered ? '试试其他关键词，或清除筛选条件。' : '写一段想说的话，或导入已有文本。'}</p>${filtered ? '<button class="button secondary" data-clear-library>清除筛选</button>' : ''}</div>`;
}
function renderMaterialCard(material, job) {
  const tags = (material.tags || []).map((tag) => `<span>${escape(tag)}</span>`).join('');
  const primary = job
    ? `<button class="button secondary" data-practice="${job.id}">${icon('play')}开始练习</button>`
    : `<button class="button secondary" data-open="${material.id}">${icon('wave')}制作语音</button>`;
  return `
    <article class="material-card">
      <div class="card-top">
        <span class="document-icon">${icon(material.turns?.length ? 'headphones' : 'file')}</span>
        <span class="card-state ${job ? '' : 'draft'}">${icon(job ? 'check' : 'file')}${job ? '可练习' : '待配音'}</span>
      </div>
      <h3 class="card-title"><button class="material-open" data-open="${material.id}">${material.favorite ? '☆ ' : ''}${escape(material.title)}</button></h3>
      <div class="card-subtitle">${escape(state.languages[material.language] || material.language)} · ${material.words.toLocaleString()} 词${job ? ` · ${time(job.duration)}` : ''}</div>
      <div class="material-tags">
        ${material.turns?.length ? '<span>角色对话</span>' : ''}
        ${material.visibility === 'shared' ? '<span>已共享</span>' : ''}
        ${tags}
      </div>
      <p class="card-excerpt">${escape(material.text.slice(0, 180))}${material.text.length > 180 ? '…' : ''}</p>
      <div class="card-bottom">
        ${primary}
        <button class="icon-button" data-material-menu="${material.id}" aria-label="${escape(material.title)}的更多操作">${icon('more')}</button>
      </div>
    </article>`;
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
            ? `<button class="button secondary" data-retry="${job.id}" ${pendingRetries.has(job.id) ? 'disabled' : ''}>${pendingRetries.has(job.id) ? '已重新排队' : '重新生成'}</button>`
            : '';
        return `<div class="job-row"><span class="document-icon">${icon(job.kind === 'preview' ? 'wave' : 'music')}</span><div class="job-info"><strong>${escape(job.title)}</strong><small>${escape(job.voice)} · ${job.kind === 'preview' ? '试听' : '完整录音'} · ${job.speed}× · ${ready ? time(job.duration) : statusNames[job.status]}${job.status === 'running' ? ` ${job.progress}%` : ''}</small>${['queued', 'running'].includes(job.status) ? `<div class="job-progress"><span style="width:${job.progress}%"></span></div>` : ''}${job.error ? `<small class="error">${escape(job.error)}</small>` : ''}</div>${action}</div>`;
      })
      .join('') || '<div class="empty-state"><p>还没有录音，先生成一段试听吧。</p></div>';
}
function renderVoices() {
  const samples = new Map();
  for (const job of state.jobs) {
    if (
      job.owned &&
      !job.material_id &&
      job.kind === 'preview' &&
      ['completed', 'queued', 'running'].includes(job.status) &&
      !samples.has(job.voice)
    )
      samples.set(job.voice, job);
  }
  $('#voice-grid').innerHTML = state.voices
    .filter(
      (v) =>
        v.language === $('#voice-language').value &&
        (!$('#voice-gender').value || v.gender === $('#voice-gender').value)
    )
    .map((v) => {
      const job = samples.get(v.id);
      const ready = job?.status === 'completed';
      const pending = pendingVoiceSamples.has(v.id) || (job && !ready);
      return `<article class="voice-card ${v.id === $('#voice').value ? 'selected' : ''}"><div class="card-top"><span class="voice-avatar">${v.name[0]}</span><div><h3>${v.name}</h3><small>${escape(state.languages[v.language])} · ${v.gender === 'female' ? '女声' : '男声'}</small></div></div><p>${escape(v.note)}</p><div class="card-bottom">${ready ? `<button class="button secondary" data-play="${job.id}">${icon('play')}试听</button>` : `<button class="button secondary" data-sample="${v.id}" ${pending ? 'disabled' : ''}>${icon('play')}${pending ? '生成中…' : '生成试听'}</button>`}<button class="text-button" data-choose-voice="${v.id}">${v.id === $('#voice').value ? '已选用 ✓' : '选用声音'}</button></div></article>`;
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
  syncStudioActions();
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
  if (!studioSessionActive) return;
  syncStudioActions();
  clearTimeout(studioDraftTimer);
  studioDraftTimer = setTimeout(persistStudioDraft, 200);
}
window.addEventListener('pagehide', () => persistStudioDraft());
function persistStudioDraft() {
  clearTimeout(studioDraftTimer);
  if (!studioSessionActive) return;
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
        pendingGeneration,
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
  studioEpoch += 1;
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
  studioEpoch += 1;
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
function adoptJob(job) {
  if (!studioSessionActive) return;
  jobMutationEpoch += 1;
  state.jobs = [{ ...job, owned: true }, ...state.jobs.filter((item) => item.id !== job.id)];
  refreshViews();
}

async function refreshJobs() {
  const sequence = ++jobsReadSequence;
  const epoch = jobMutationEpoch;
  let jobs;
  try {
    jobs = await api('/generations');
  } catch (error) {
    if (epoch !== jobMutationEpoch || sequence !== jobsReadSequence || !studioSessionActive) return;
    throw error;
  }
  if (epoch !== jobMutationEpoch || sequence !== jobsReadSequence || !studioSessionActive) return;
  const oldCompleted = new Set(
    state.jobs.filter((job) => job.status === 'completed').map((job) => job.id)
  );
  $('#engine-status').textContent = '语音服务已就绪';
  if (JSON.stringify(jobs) === JSON.stringify(state.jobs)) return;
  state.jobs = jobs;
  if (jobs.some((job) => job.status === 'completed' && !oldCompleted.has(job.id)))
    toast('新录音已生成，可以试听了。');
  refreshViews();
}

function studioSnapshot(voiceOverride) {
  const text = $('#editor').value.trim();
  const source = state.materials.find((material) => material.id === state.materialId);
  const dialogue = source?.turns?.length && source.text === text;
  return {
    epoch: studioEpoch,
    materialId: state.materialId,
    title: $('#material-title').value.trim() || 'Untitled material',
    text,
    language: voiceOverride ? voiceOverride[0] : $('#language').value,
    voice: voiceOverride || $('#voice').value,
    voice_b: dialogue ? $('#voice-b').value : null,
    speed: Number($('#speed').value),
    pause: Number($('#pause').value),
    tags: source?.tags || [],
    turns: dialogue ? structuredClone(source.turns) : [],
    role_a: dialogue ? source.role_a : 'A',
    role_b: dialogue ? source.role_b : 'B',
    composition_id: source?.owned ? source.composition_id || null : null,
  };
}

function matchingRecording(materialId, settings, kind) {
  return state.jobs.find(
    (job) =>
      job.owned &&
      job.material_id === materialId &&
      job.kind === kind &&
      ['completed', 'queued', 'running'].includes(job.status) &&
      job.title === settings.title &&
      job.voice === settings.voice &&
      (job.voice_b || job.voice) === (settings.voice_b || settings.voice) &&
      Number(job.speed) === settings.speed &&
      Number(job.pause) === settings.pause
  );
}

function syncStudioActions() {
  if (studioSubmitting || !state.user) return;
  const snapshot = studioSnapshot();
  const material = state.materials.find(
    (item) =>
      item.id === state.materialId &&
      item.owned &&
      item.visibility !== 'shared' &&
      !item.archived &&
      item.title === snapshot.title &&
      item.text === snapshot.text &&
      item.language === snapshot.language
  );
  const preview = material && matchingRecording(material.id, snapshot, 'preview');
  const full = material && matchingRecording(material.id, snapshot, 'full');
  $('#preview').innerHTML =
    `${icon('play')}${preview?.status === 'completed' ? (state.currentJob?.id === preview.id && !audio.paused ? '暂停试听' : '播放已有试听') : preview ? '试听生成中…' : '先试听'}`;
  $('#generate').innerHTML =
    `${icon(full?.status === 'completed' ? 'book' : 'spark')}${full?.status === 'completed' ? '继续练习' : full ? '完整录音生成中…' : '生成完整录音'}`;
}

function lockStudio(locked) {
  studioSubmitting = locked;
  $('.editor-panel').inert = locked;
  $('.settings-panel').inert = locked;
  for (const id of ['preview', 'generate', 'save-material']) $(`#${id}`).disabled = locked;
  if (!locked) syncStudioActions();
}

async function generate(kind, voiceOverride) {
  if (studioSubmitting || !studioSessionActive) return;
  const snapshot = studioSnapshot(voiceOverride);
  if (!snapshot.text) throw new Error('请先写下用于配音的文字，或选择一份语料。');
  lockStudio(true);
  try {
    const material = await saveDraft(snapshot);
    if (!studioSessionActive) return;
    const body = {
      text: material.text,
      title: material.title,
      language: snapshot.language,
      voice: snapshot.voice,
      voice_b: snapshot.voice_b,
      speed: snapshot.speed,
      pause: snapshot.pause,
      kind,
      material_id: material.id,
    };
    const reusable = matchingRecording(material.id, body, kind);
    if (reusable) {
      pendingGeneration = null;
      rememberDraft();
      if (reusable.status === 'completed') {
        if (kind === 'full') await practice(reusable.id);
        else if (state.currentJob?.id === reusable.id) await transport.toggle();
        else await loadAudio(reusable.id);
      } else toast('这份录音正在生成，可在录音版本中查看进度。');
      return;
    }
    const payload = JSON.stringify(body);
    if (!pendingGeneration || pendingGeneration.payload !== payload) {
      pendingGeneration = { id: requestId(), payload };
    }
    rememberDraft();
    const accepted = await post('/generations', { ...body, request_id: pendingGeneration.id });
    if (!studioSessionActive) return;
    pendingGeneration = null;
    adoptJob(accepted);
    rememberDraft();
    toast(kind === 'preview' ? '试听已排队，可以继续编辑。' : '完整录音已排队，完成后会通知你。');
    void refreshJobs().catch(() => {
      $('#engine-status').textContent = '录音已受理，正在恢复状态连接…';
    });
  } finally {
    lockStudio(false);
  }
}

const audio = $('#audio');
let lastFollow = -1;
const transport = new PracticePlayer(audio, renderPractice);
audio.addEventListener('play', syncStudioActions);
audio.addEventListener('pause', syncStudioActions);
audio.addEventListener('ended', syncStudioActions);

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

async function ensurePracticeRecording() {
  const identifier = state.practiceId;
  if (!identifier || state.view !== 'practice') return false;
  if (state.currentJob?.id === identifier) {
    if (!transport.segments.length) {
      const position = audio.ended ? 0 : transport.position;
      transport.load(state.currentJob.segments);
      transport.seek(position);
    }
    return true;
  }
  const job = await loadAudio(identifier, false);
  if (
    !job ||
    state.currentJob?.id !== identifier ||
    state.practiceId !== identifier ||
    state.view !== 'practice'
  )
    return false;
  transport.load(job.segments);
  transport.seek(Number.isFinite(job.resume_position) ? job.resume_position : 0);
  return true;
}

async function practiceAction(action) {
  if (action === 'escape') {
    setImmersive(false);
    return;
  }
  if (action === 'focus') {
    if (!state.practiceId) {
      toast('先选择一份完整录音，再进入专注练习。');
      return;
    }
    if (!document.body.classList.contains('is-immersive') && !(await ensurePracticeRecording()))
      return;
    setImmersive(!document.body.classList.contains('is-immersive'));
    return;
  }
  if (!state.currentJob) return;
  if (action === 'restart') {
    if (!(await ensurePracticeRecording())) return;
    transport.seek(0);
    $('#practice-resume').hidden = true;
    return;
  }
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
  const sequence = ++audioLoadSequence;
  if (state.currentJob?.id !== id) {
    audio.pause();
    const job = await api(`/generations/${id}`);
    if (sequence !== audioLoadSequence || !studioSessionActive) return null;
    if (job.status !== 'completed') throw new Error('This recording is not ready yet.');
    const blob =
      (await cachedAudio(job.audio_url).catch(() => null)) ||
      (await adoptLegacyAudio(job.audio_url).catch(() => null));
    if (sequence !== audioLoadSequence) return null;
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
  const fresh = state.currentJob?.id !== id;
  const job = await loadAudio(id, false);
  if (!job || state.currentJob?.id !== id) return;
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
  const previousPosition = transport.position;
  transport.load(job.segments);
  const savedPosition = Number.isFinite(job.resume_position) ? job.resume_position : 0;
  transport.seek(fresh ? savedPosition : previousPosition);
  if (fresh) {
    $('#practice-resume').hidden = savedPosition <= 0;
    $('#practice-resume-label').textContent = `上次练到 ${time(savedPosition)}`;
  }
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
    if (target.hasAttribute('data-clear-library')) {
      clearLibraryFilters();
      return;
    }
    if (target.dataset.view) showView(target.dataset.view, { restoreScroll: true });
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
      studioEpoch += 1;
      $('#language').value = target.dataset.chooseVoice[0];
      updateVoiceSelect(target.dataset.chooseVoice);
      rememberDraft();
      renderVoices();
      showView('studio');
      toast(`${target.dataset.chooseVoice.slice(3)} selected. Your text is ready when you are.`);
    }
    if (target.dataset.sample) {
      const voice = target.dataset.sample;
      if (pendingVoiceSamples.has(voice)) return;
      pendingVoiceSamples.add(voice);
      target.disabled = true;
      if (!sampleAttempts.has(voice)) sampleAttempts.set(voice, requestId());
      try {
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
        const accepted = await post('/generations', {
          request_id: sampleAttempts.get(voice),
          text: samples[voice[0]],
          title: 'Voice preview',
          voice,
          language: voice[0],
          speed: 0.95,
          pause: 0.3,
          kind: 'preview',
        });
        sampleAttempts.delete(voice);
        adoptJob(accepted);
        toast('试听已排队。');
      } finally {
        pendingVoiceSamples.delete(voice);
        renderVoices();
      }
    }
    if (target.dataset.retry) {
      if (pendingRetries.has(target.dataset.retry)) return;
      pendingRetries.set(target.dataset.retry, true);
      target.disabled = true;
      try {
        const job = await api(`/generations/${target.dataset.retry}`);
        if (!retryAttempts.has(job.id)) retryAttempts.set(job.id, requestId());
        const accepted = await post('/generations', {
          request_id: retryAttempts.get(job.id),
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
        retryAttempts.delete(job.id);
        pendingRetries.set(target.dataset.retry, accepted.id);
        adoptJob(accepted);
        toast('已重新加入生成队列。');
      } catch (error) {
        pendingRetries.delete(target.dataset.retry);
        target.disabled = false;
        throw error;
      }
    }
    if (target.dataset.segment !== undefined) {
      $('#practice-resume').hidden = true;
      if (state.currentJob?.id !== state.practiceId) await loadAudio(state.practiceId, false);
      if (!transport.segments.length) transport.load(state.currentJob.segments);
      await transport.playSentence(Number(target.dataset.segment));
    }
  })
);
function clearLibraryFilters() {
  clearTimeout(searchTimer);
  $('#search').value = '';
  for (const id of ['library-language', 'library-kind', 'library-scope']) $(`#${id}`).value = '';
  $('#library-sort').value = 'new';
  state.filter = 'all';
  state.libraryLimit = 24;
  $$('[data-filter]').forEach((button) =>
    button.classList.toggle('active', button.dataset.filter === 'all')
  );
  renderLibrary();
  $('#search').focus({ preventScroll: true });
}
let searchTimer;
function searchLibrary(event) {
  clearTimeout(searchTimer);
  if (event.isComposing) return;
  state.libraryLimit = 24;
  searchTimer = setTimeout(renderLibrary, 120);
}
$('#search').addEventListener('input', searchLibrary);
$('#search').addEventListener('compositionend', searchLibrary);
$('#library-load-more').onclick = () => {
  state.libraryLimit = (state.libraryLimit || 24) + 24;
  renderLibrary();
};
['library-language', 'library-kind', 'library-scope', 'library-sort'].forEach((id) => {
  $(`#${id}`).onchange = () => {
    state.libraryLimit = 24;
    renderLibrary();
  };
});
['voice-language', 'voice-gender'].forEach((id) => ($(`#${id}`).onchange = renderVoices));
$('#new-material').onclick = newMaterial;
$('#hero-start').onclick = () => showView('authoring');
$('#browse-voices').onclick = () => showView('voices');
$('#all-voices').onclick = () => {
  showView('studio');
  $('#language').focus();
};
$('#language').onchange = () => {
  studioEpoch += 1;
  updateVoiceSelect();
  rememberDraft();
};
$('#voice-b').onchange = () => {
  studioEpoch += 1;
  rememberDraft();
};
$('#voice').onchange = () => {
  studioEpoch += 1;
  updateVoiceNote();
  renderVoices();
  rememberDraft();
};
$('#speed').oninput = () => {
  studioEpoch += 1;
  $('#speed-value').textContent = `${Number($('#speed').value).toFixed(2)}×`;
  rememberDraft();
};
$('#pause').oninput = () => {
  studioEpoch += 1;
  $('#pause-value').textContent = `${$('#pause').value}s`;
  rememberDraft();
};
$('#editor').oninput = () => {
  studioEpoch += 1;
  updateCount();
  rememberDraft();
};
$('#material-title').oninput = () => {
  studioEpoch += 1;
  rememberDraft();
};
$('#preview').onclick = safely(() => generate('preview'));
$('#generate').onclick = safely(() => generate('full'));
async function saveDraft(snapshot = studioSnapshot()) {
  if (!snapshot.text) throw new Error('请先写下用于配音的文字。');
  const sameSnapshot = (material) =>
    material.owned &&
    material.visibility !== 'shared' &&
    !material.archived &&
    material.title === snapshot.title &&
    material.text === snapshot.text &&
    material.language === snapshot.language &&
    JSON.stringify(material.tags || []) === JSON.stringify(snapshot.tags) &&
    JSON.stringify(material.turns || []) === JSON.stringify(snapshot.turns) &&
    (material.role_a || 'A') === snapshot.role_a &&
    (material.role_b || 'B') === snapshot.role_b &&
    (material.composition_id || null) === snapshot.composition_id;
  const existing =
    state.materials.find(
      (material) => material.id === snapshot.materialId && sameSnapshot(material)
    ) || state.materials.find(sameSnapshot);
  if (existing) return existing;
  const material = await post('/materials', {
    title: snapshot.title,
    text: snapshot.text,
    language: snapshot.language,
    tags: snapshot.tags,
    turns: snapshot.turns,
    role_a: snapshot.role_a,
    role_b: snapshot.role_b,
    composition_id: snapshot.composition_id,
    reuse: true,
  });
  if (!studioSessionActive) return material;
  state.materials = [
    { ...material, owned: true },
    ...state.materials.filter((item) => item.id !== material.id),
  ];
  if (studioEpoch === snapshot.epoch) {
    state.materialId = material.id;
    $('#editor').value = material.text;
    syncDialogueControls(material);
    updateCount();
    rememberDraft();
  }
  refreshViews();
  return material;
}
$('#save-material').onclick = safely(async () => {
  if (studioSubmitting) return;
  lockStudio(true);
  try {
    await saveDraft();
    if (studioSessionActive) toast('语料已保存，原有版本仍保留。');
  } finally {
    lockStudio(false);
  }
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
$('#seek').oninput = () => {
  $('#practice-resume').hidden = true;
  transport.seek(Number($('#seek').value));
};
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
export async function init() {
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
      pendingGeneration = draft.pendingGeneration;
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
  $('#auth-screen').hidden = true;
  document.body.classList.remove('auth-pending');
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
