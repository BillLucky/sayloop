import { requestId as uid } from './request-id.js';
import { setAudioUser, clearUserAudio } from './audio-cache.js';

const $ = (selector) => document.querySelector(selector);
const escape = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
const jsonOptions = (method, data) => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(data),
});
let api, post, state, toast, showView, openMaterial, refreshViews;
let mode = 'polish',
  current,
  revisions = [],
  dirty = false,
  metadataId,
  feedbackTarget;
let studySession,
  studyJob,
  studySeconds = 0,
  lastTick = 0,
  eventInFlight = false;
let pendingStudy;
let submitting = false;
let revisionEpoch = 0;
let authorEditEpoch = 0;
let loadingRevision = false;
let pendingSubmission;
let draftTimer;
let draftsEnabled = true;
const activeComposition = () => ['queued', 'running'].includes(current?.status);
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const actionLabels = { polish: '润色中文', variants: '生成外语表达', scenario: '生成场景对话' };
const draftKey = () => `sayloop-authoring-${state.user.id}`;

export async function authenticate(helpers) {
  ({ api, post, state, toast, showView, openMaterial, refreshViews } = helpers);
  let user = (await api('/auth/me')).user;
  if (!user) {
    try {
      if (sessionStorage.getItem('sayloop-cleanup-warning')) {
        $('#auth-error').textContent =
          '已退出账号，但设备缓存未能全部清理。共享设备请清除浏览器站点数据。';
        sessionStorage.removeItem('sayloop-cleanup-warning');
      }
    } catch {
      /* Login must remain available without browser storage. */
    }
    let registering = false;
    $('#auth-switch').onclick = () => {
      registering = !registering;
      $('#register-fields').hidden = !registering;
      $('#auth-heading').textContent = registering ? '创建自己的学习空间' : '登录你的学习空间';
      $('#auth-submit').textContent = registering ? '创建账号并登录' : '登录学习空间';
      $('#auth-switch').textContent = registering ? '已有账号，返回登录' : '使用邀请码创建账号';
      $('#login-password').minLength = registering ? 10 : 1;
      $('#login-password').autocomplete = registering ? 'new-password' : 'current-password';
      $('#register-code').required = $('#register-name').required = registering;
      $('#auth-error').textContent = '';
    };
    user = await new Promise((resolve) => {
      $('#auth-form').onsubmit = async (event) => {
        event.preventDefault();
        if ($('#auth-submit').disabled) return;
        $('#auth-submit').disabled = true;
        $('#auth-switch').disabled = true;
        $('#auth-error').textContent = '';
        try {
          const credentials = {
            username: $('#login-name').value.trim(),
            password: $('#login-password').value,
          };
          if (registering)
            await post('/auth/register', {
              ...credentials,
              display_name: $('#register-name').value,
              invite_code: $('#register-code').value.trim(),
            });
          const result = await post('/auth/login', credentials);
          $('#login-password').value = $('#register-code').value = '';
          resolve(result.user);
        } catch (error) {
          $('#auth-error').textContent = error.message;
          $('#auth-submit').disabled = false;
          $('#auth-switch').disabled = false;
        }
      };
      $('#auth-startup').hidden = true;
      $('#auth-submit').disabled = false;
      $('#auth-switch').disabled = false;
    });
  }
  $('#auth-startup span').textContent = '正在打开学习空间。若连接中断，请';
  $('#auth-startup').hidden = false;
  state.user = user;
  setAudioUser(user.id);
  window.addEventListener('sayloop:session-retired', async ({ detail }) => {
    if (detail.identifier !== state.user.id || state.loggingOut) return;
    await clearLocalSession(detail.identifier, false);
    location.reload();
  });
  $('#profile-name').textContent = $('#mobile-profile-name').textContent = user.display_name;
  $('#mobile-logout').onclick = () => $('#logout').click();
  $('#logout').onclick = async () => {
    document.querySelector('#audio').pause();
    try {
      await retireSession(() => post('/auth/logout', {}));
    } catch {
      toast('退出未完成，请检查连接后重试。', true);
      return;
    }
  };
}

async function retireSession(action) {
  if (state.loggingOut) return;
  // An older authenticated read may return 401 before the revoking POST returns.
  state.loggingOut = true;
  try {
    await action();
  } catch (error) {
    let activeUser;
    try {
      activeUser = (await api('/auth/me')).user;
    } catch {
      state.loggingOut = false;
      throw error;
    }
    if (activeUser?.id === state.user.id) {
      state.loggingOut = false;
      throw error;
    }
  }
  await clearLocalSession(state.user.id);
  location.reload();
}

async function clearLocalSession(identifier, notifyPeers = true) {
  state.loggingOut = true;
  window.dispatchEvent(new Event('sayloop:logout'));
  draftsEnabled = false;
  revisionEpoch += 1;
  clearTimeout(draftTimer);
  let cleanupFailed = false;
  try {
    await clearUserAudio(identifier, notifyPeers);
  } catch {
    cleanupFailed = true;
  }
  for (const key of [draftKey(), `llh-draft-${identifier}`]) {
    try {
      localStorage.removeItem(key);
    } catch {
      cleanupFailed = true;
    }
  }
  if (cleanupFailed) {
    try {
      sessionStorage.setItem('sayloop-cleanup-warning', '1');
    } catch {
      /* Storage can be denied. */
    }
  }
}

function updateAuthorControls() {
  const locked = submitting || loadingRevision;
  const pending = locked || activeComposition();
  $('#author-fields').disabled = locked;
  $('#author-result').inert = locked;
  const submit = $('#author-submit');
  submit.disabled = pending;
  submit.textContent = submitting
    ? '正在提交…'
    : loadingRevision
      ? '正在打开版本…'
      : activeComposition()
        ? '正在生成…'
        : actionLabels[mode];
  submit.classList.toggle('is-pending', pending);
  $('#new-composition').disabled = submitting;
  $('#revision-select').disabled = submitting;
  $('#author-extra-options').hidden = mode === 'polish';
  $('#author-settings-summary').textContent =
    mode === 'polish'
      ? '场合 · 修改要求'
      : mode === 'scenario'
        ? `${$('#author-count').value || 3} 组 · 每组 ${$('#author-turns').value || 6} 轮`
        : `${$('#author-count').value || 3} 种表达 · 可调整人称`;
}

function persistDraft() {
  clearTimeout(draftTimer);
  if (!draftsEnabled) return;
  try {
    localStorage.setItem(
      draftKey(),
      JSON.stringify({
        mode,
        source: $('#author-source').value,
        context: $('#author-context').value,
        instructions: $('#author-instructions').value,
        style: $('#author-style').value,
        language: $('#author-language').value,
        person: $('#author-person').value,
        count: $('#author-count').value,
        turns: $('#author-turns').value,
        current: current?.id,
        result: readResult(),
        inlineInput: current && !current.id ? current.input : undefined,
        inlineTags: current?.tags,
        pendingSubmission,
      })
    );
    $('#author-draft-status').textContent = '草稿已保存在此浏览器';
  } catch {
    $('#author-draft-status').textContent = '此浏览器无法保存草稿，请复制重要内容';
  }
}

function validDraftResult(result) {
  const text = (value) => typeof value === 'string';
  const turn = (value) =>
    value &&
    ['A', 'B'].includes(value.speaker) &&
    text(value.text) &&
    (value.translation === undefined || text(value.translation));
  return (
    result &&
    text(result.title) &&
    Array.isArray(result.variants) &&
    result.variants.every((value) => value && text(value.label) && text(value.text)) &&
    Array.isArray(result.dialogues) &&
    result.dialogues.every(
      (value) =>
        value &&
        text(value.title) &&
        text(value.role_a) &&
        text(value.role_b) &&
        Array.isArray(value.turns) &&
        value.turns.every(turn)
    )
  );
}

function loadDraft() {
  try {
    const draft = JSON.parse(localStorage.getItem(draftKey()) || 'null');
    if (!draft || typeof draft.source !== 'string') return null;
    if (draft.result && !validDraftResult(draft.result)) delete draft.result;
    return draft;
  } catch {
    $('#author-draft-status').textContent = '本地草稿无法恢复，已保留服务器上的历史版本';
    return null;
  }
}

function remember(event) {
  authorEditEpoch += 1;
  dirty = true;
  $('#author-source').setCustomValidity('');
  $('#source-count').textContent =
    `${$('#author-source').value.length.toLocaleString()} / 12,000 字`;
  $('#author-draft-status').textContent = '正在保存草稿…';
  if (event?.target.matches('#author-result textarea')) fitField(event.target);
  updateAuthorControls();
  clearTimeout(draftTimer);
  draftTimer = setTimeout(persistDraft, 200);
}

function fitField(field) {
  field.style.height = 'auto';
  field.style.height = `${Math.min(480, Math.max(96, field.scrollHeight + 2))}px`;
}

function fitResults() {
  $('#author-result')
    .querySelectorAll('textarea')
    .forEach((field) => {
      if (field.getClientRects().length) fitField(field);
    });
}

function showAuthorInput({ instructions = false } = {}) {
  if (instructions) $('#author-settings').open = true;
  $('#author-form').scrollIntoView({
    block: 'start',
    behavior: reducedMotion() ? 'instant' : 'smooth',
  });
  (instructions ? $('#author-instructions') : $('#author-source')).focus({ preventScroll: true });
}

function setMode(value) {
  mode = value;
  document.querySelectorAll('[data-author-mode]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.authorMode === mode));
  });
  $('#turns-field').hidden = mode !== 'scenario';
  $('#author-turns').disabled = mode !== 'scenario';
  $('#author-count').disabled = mode === 'polish';
  $('#author-count').max = mode === 'variants' ? 6 : 30;
  if (mode === 'variants' && Number($('#author-count').value) > 6) $('#author-count').value = 3;
  $('#author-language').disabled = mode === 'polish';
  $('#author-expression-options').hidden = mode === 'polish';
  $('#source-label').textContent =
    mode === 'scenario'
      ? '描述场景和你想练习的对话'
      : mode === 'variants'
        ? '确认要表达的中文'
        : '写下你想说的话';
  $('#author-source').placeholder =
    mode === 'scenario'
      ? '例如：我与合作伙伴商议交付时间，希望争取多两周。'
      : '用中文写下你的想法，不用一开始就写得很完整。';
  updateAuthorControls();
}

async function submitComposition() {
  if (submitting || loadingRevision || activeComposition()) return;
  const form = $('#author-form');
  $('#author-source').setCustomValidity(
    $('#author-source').value.trim() ? '' : '先写下想说的话或要练习的场景。'
  );
  const invalid = form.querySelector(':invalid');
  if (invalid) {
    if (invalid.closest('details')) invalid.closest('details').open = true;
    form.reportValidity();
    return;
  }
  const epoch = ++revisionEpoch;
  submitting = true;
  $('#author-error').hidden = true;
  updateAuthorControls();
  try {
    const body = {
      mode,
      source: $('#author-source').value,
      style: $('#author-style').value,
      language: $('#author-language').value,
      person: $('#author-person').value,
      context: $('#author-context').value,
      instructions: $('#author-instructions').value,
      count: mode === 'polish' ? 3 : Number($('#author-count').value),
      turns: mode === 'scenario' ? Number($('#author-turns').value) : 6,
      parent_id: current?.id?.length === 32 ? current.id : null,
    };
    const payload = JSON.stringify(body);
    if (!pendingSubmission || pendingSubmission.payload !== payload) {
      pendingSubmission = { id: uid(), payload };
    }
    const attempt = pendingSubmission;
    persistDraft();
    const item = await post('/compositions', { ...body, request_id: attempt.id });
    if (epoch !== revisionEpoch) return;
    pendingSubmission = null;
    revisions = [item, ...revisions.filter((revision) => revision.id !== item.id)];
    // The POST response is already the accepted revision; an extra GET must not create a retry.
    adoptRevision(item);
    if (innerWidth < 1180)
      $('#author-output').scrollIntoView({
        block: 'start',
        behavior: reducedMotion() ? 'instant' : 'smooth',
      });
    remember();
    dirty = false;
  } catch (error) {
    $('#author-error').textContent = error.message;
    $('#author-error').hidden = false;
    showAuthorInput();
  } finally {
    submitting = false;
    updateAuthorControls();
  }
}

function readResult() {
  if (!current?.result) return null;
  const result = structuredClone(current.result);
  if ($('#result-chinese')) result.chinese = $('#result-chinese').value;
  result.variants.forEach((variant, index) => {
    variant.text = $(`#variant-${index}`)?.value ?? variant.text;
  });
  result.dialogues.forEach((dialogue, index) => {
    dialogue.title = $(`#dialogue-title-${index}`)?.value ?? dialogue.title;
    dialogue.role_a = $(`#role-a-${index}`)?.value ?? dialogue.role_a;
    dialogue.role_b = $(`#role-b-${index}`)?.value ?? dialogue.role_b;
    dialogue.turns.forEach((turn, turnIndex) => {
      turn.text = $(`#turn-${index}-${turnIndex}`)?.value ?? turn.text;
      turn.translation = $(`#translation-${index}-${turnIndex}`)?.value ?? turn.translation;
    });
  });
  return result;
}
function renderChinese(result) {
  if (!result.chinese) return '';
  if (result.variants.length || result.dialogues.length) {
    return `
      <details class="result-chinese-reference">
        <summary>查看原中文</summary>
        <label for="result-chinese" class="sr-only">确认过的中文</label>
        <textarea id="result-chinese" rows="3" maxlength="12000">${escape(result.chinese)}</textarea>
      </details>`;
  }
  return `
    <article class="panel result-card">
      <h2>中文定稿</h2>
      <label for="result-chinese">可直接修改，满意后生成外语表达</label>
      <textarea id="result-chinese" rows="3" maxlength="12000">${escape(result.chinese)}</textarea>
      <div class="result-actions">
        <button class="button primary" data-use-chinese>生成外语表达</button>
        <details class="result-more">
          <summary>其他操作</summary>
          <button class="text-button" data-expression-settings>调整语言和风格</button>
          <button class="text-button" data-refine-chinese>继续打磨中文</button>
          <button class="text-button" data-save-chinese>保存中文语料</button>
        </details>
      </div>
    </article>`;
}

function renderVariant(variant, index) {
  return `
    <article class="panel result-card">
      <h2>${escape(variant.label)}</h2>
      <label for="variant-${index}">表达内容 · 可直接编辑</label>
      <textarea id="variant-${index}" rows="3" maxlength="20000">${escape(variant.text)}</textarea>
      <button class="button secondary" data-save-variant="${index}">保存并配音 →</button>
    </article>`;
}

function renderTurn(turn, index, turnIndex, dialogue) {
  const role = turn.speaker === 'A' ? dialogue.role_a : dialogue.role_b;
  return `
    <div class="dialogue-turn ${turn.speaker === 'B' ? 'speaker-b' : ''}">
      <label for="turn-${index}-${turnIndex}">${turn.speaker} · ${escape(role)}</label>
      <textarea id="turn-${index}-${turnIndex}" rows="2" maxlength="2000">${escape(turn.text)}</textarea>
      <label class="translation-label" for="translation-${index}-${turnIndex}">中文释义</label>
      <textarea id="translation-${index}-${turnIndex}" class="translation" rows="2" maxlength="2000">${escape(turn.translation)}</textarea>
    </div>`;
}

function renderDialogue(dialogue, index) {
  const turns = dialogue.turns
    .map((turn, turnIndex) => renderTurn(turn, index, turnIndex, dialogue))
    .join('');
  return `
    <details class="panel result-card dialogue-result" ${index === 0 ? 'open' : ''}>
      <summary>对话 ${index + 1} · ${escape(dialogue.title)}<span>${dialogue.turns.length} 轮</span></summary>
      <div class="dialogue-body">
        <label for="dialogue-title-${index}">标题</label>
        <input id="dialogue-title-${index}" value="${escape(dialogue.title)}" maxlength="160" />
        <div class="author-options">
          <label for="role-a-${index}">角色 A<input id="role-a-${index}" value="${escape(dialogue.role_a)}" maxlength="80" /></label>
          <label for="role-b-${index}">角色 B<input id="role-b-${index}" value="${escape(dialogue.role_b)}" maxlength="80" /></label>
        </div>
        ${turns}
        <button class="button secondary" data-save-dialogue="${index}">保存并配音 →</button>
      </div>
    </details>`;
}

function renderResult(result) {
  const multiple = result.variants.length + result.dialogues.length > 1;
  $('#author-result').innerHTML = `
    <div class="result-heading">
      <h2>${escape(result.title)}</h2>
      <div class="result-actions">
        <button class="text-button" data-refine-result>继续打磨</button>
        <details class="result-more">
          <summary>更多操作</summary>
          <button class="text-button" data-feedback-composition>记录创作反馈</button>
          ${multiple ? '<button id="save-all-results" class="text-button">全部语料入库</button>' : ''}
        </details>
      </div>
    </div>
    ${result.notes ? `<p class="result-notes">${escape(result.notes)}</p>` : ''}
    ${renderChinese(result)}
    ${result.variants.map(renderVariant).join('')}
    ${result.dialogues.map(renderDialogue).join('')}`;
  requestAnimationFrame(fitResults);
}
function renderHistory() {
  const modeNames = { polish: '中文润色', variants: '外语表达', scenario: '场景对话' };
  const statusNames = {
    queued: '排队中',
    running: '创作中',
    completed: '已完成',
    failed: '生成失败',
    interrupted: '已中断',
  };
  $('#revision-select').innerHTML =
    '<option value="">选择一个历史版本</option>' +
    revisions
      .map((item) => {
        const time = new Date(item.created_at).toLocaleString('zh-CN', {
          month: 'numeric',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });
        const label = [
          time,
          modeNames[item.input.mode],
          statusNames[item.status],
          item.input.source.slice(0, 18),
        ].join(' · ');
        return `<option value="${item.id}">${escape(label)}</option>`;
      })
      .join('');
  $('#revision-select').value = current?.id || '';
  $('#revision-count').textContent = String(revisions.length);
  $('#author-history').hidden = revisions.length === 0;
  $('#author-output').hidden = !current && revisions.length === 0;
  $('#view-authoring').classList.toggle('is-starting', $('#author-output').hidden);
}
function renderStatus(item) {
  updateAuthorControls();
  $('#author-status').textContent =
    item.status === 'completed'
      ? `本版已保留${item.providers?.length ? ` · ${item.providers.join(' → ')}` : ''}。修改满意后再保存到语料库。`
      : item.status === 'failed' || item.status === 'interrupted'
        ? item.error
        : item.status === 'queued'
          ? '已排队，原文已保存。可以离开页面，稍后在历史中查看。'
          : `正在创作${item.progress ? ` · ${item.progress}%` : ''}，原文和已有版本已保留。`;
  $('#author-output')?.setAttribute(
    'aria-busy',
    String(['queued', 'running'].includes(item.status))
  );
}
async function selectRevision(id, localResult) {
  const epoch = ++revisionEpoch;
  loadingRevision = true;
  updateAuthorControls();
  try {
    const item = await api(`/compositions/${id}`);
    if (epoch !== revisionEpoch) return false;
    adoptRevision(item, localResult);
    return true;
  } catch {
    if (epoch === revisionEpoch) {
      $('#author-status').textContent = '打开版本失败，当前编辑内容已保留，请重试。';
      renderHistory();
    }
    return false;
  } finally {
    if (epoch === revisionEpoch) {
      loadingRevision = false;
      updateAuthorControls();
    }
  }
}

function adoptRevision(item, localResult) {
  current = item;
  const spec = current.input;
  setMode(spec.mode);
  for (const field of [
    'source',
    'context',
    'instructions',
    'style',
    'language',
    'person',
    'count',
    'turns',
  ])
    $(`#author-${field}`).value = spec[field];
  if (localResult) current.result = localResult;
  renderStatus(current);
  if (current.result) renderResult(current.result);
  else
    $('#author-result').innerHTML =
      '<div class="result-empty"><h2>正在准备学习材料</h2><p>生成完成后会显示在这里。页面关闭后任务仍会继续。</p></div>';
  renderHistory();
  dirty = false;
  fitResults();
  updateAuthorControls();
  $('#source-count').textContent = `${spec.source.length.toLocaleString()} / 12,000 字`;
}
function candidateSnapshot() {
  return {
    result: readResult(),
    input: { ...current.input },
    id: current.id,
    tags: current.tags ? [...current.tags] : null,
    epoch: revisionEpoch,
    editEpoch: authorEditEpoch,
  };
}
async function saveCandidate(kind, index, navigate = true, selection = candidateSnapshot()) {
  if (!draftsEnabled) return null;
  const { result, input } = selection;
  const language = input.language;
  let body = {
    title: result.title,
    language,
    tags: selection.tags || (input.style ? [input.style] : []),
    composition_id: selection.id?.length === 32 ? selection.id : null,
    reuse: true,
  };
  if (kind === 'chinese') body = { ...body, text: result.chinese, language: 'z' };
  else if (kind === 'variant')
    body = {
      ...body,
      title: `${result.title} · ${result.variants[index].label}`.slice(0, 160),
      text: result.variants[index].text,
    };
  else {
    const dialogue = result.dialogues[index];
    body = {
      ...body,
      title: dialogue.title,
      text: dialogue.turns.map((turn) => turn.text).join('\n\n'),
      turns: dialogue.turns,
      role_a: dialogue.role_a,
      role_b: dialogue.role_b,
    };
  }
  const material = await post('/materials', body);
  if (!draftsEnabled) return material;
  state.materials = [
    { ...material, owned: true },
    ...state.materials.filter((item) => item.id !== material.id),
  ];
  refreshViews();
  if (
    navigate &&
    selection.epoch === revisionEpoch &&
    selection.editEpoch === authorEditEpoch &&
    state.view === 'authoring'
  ) {
    openMaterial(material.id);
    toast('语料已保存。先试听，再生成完整录音。');
  }
  return material;
}
export function editDialogue(material) {
  revisionEpoch += 1;
  loadingRevision = false;
  current = {
    tags: material.tags || [],
    input: { language: material.language, mode: 'scenario' },
    result: {
      title: material.title,
      chinese: '',
      variants: [],
      dialogues: [
        {
          title: material.title,
          role_a: material.role_a,
          role_b: material.role_b,
          turns: material.turns,
        },
      ],
      notes: '',
    },
  };
  renderResult(current.result);
  setMode('scenario');
  $('#author-source').value = material.title;
  $('#author-language').value = material.language;
  $('#author-status').textContent = '修改对话后保存为一份新语料；原语料与录音会保留。';
  $('#author-error').hidden = true;
  renderHistory();
  showView('authoring');
  remember();
}
export function manageMaterial(material) {
  metadataId = material.id;
  $('#meta-title').value = material.title;
  $('#meta-tags').value = (material.tags || []).join(', ');
  $('#meta-shared').checked = material.visibility === 'shared';
  $('#meta-favorite').checked = !!material.favorite;
  $('#meta-archived').checked = !!material.archived;
  $('#metadata-error').textContent = '';
  $('#metadata-dialog').showModal();
}
export function giveFeedback(type, id) {
  if (!id) return toast('先选择要反馈的内容。');
  feedbackTarget = { target_type: type, target_id: id };
  $('#feedback-note').value = '';
  $('#feedback-error').textContent = '';
  $('#feedback-dialog').showModal();
}
export async function refreshProgress() {
  const [stats, feedback] = await Promise.all([api('/study/stats'), api('/feedback')]);
  $('#feedback-history').innerHTML =
    feedback
      .slice(0, 8)
      .map(
        (item) =>
          `<div class="feedback-row"><strong>${escape({ material: '语料', generation: '录音', composition: '创作' }[item.target_type])} · ${item.rating} / 5</strong><p>${escape(item.note || '已记录评分')}</p></div>`
      )
      .join('') || '<p class="field-help">生成或试听之后，可以记录声音、节奏和内容的改进意见。</p>';
  $('#progress-summary').innerHTML =
    `<div class="panel daily-progress"><span>今天的播放目标</span><strong>${Math.floor(stats.today / 60)} / ${Math.floor(stats.goal / 60)} <small>分钟</small></strong><progress max="${stats.goal}" value="${Math.min(stats.goal, stats.today)}" aria-label="每日播放目标"></progress><p>${stats.today >= stats.goal ? '今天的目标已完成。' : `还差 ${Math.ceil((stats.goal - stats.today) / 60)} 分钟。选一份想练的语料继续。`}</p></div><div class="panel progress-number"><span>累计有效播放</span><strong>${Math.floor(stats.total / 60)}<small>分钟</small></strong></div><div class="panel progress-number"><span>连续学习</span><strong>${stats.streak}<small>天</small></strong></div>`;
  const max = Math.max(60, ...stats.days.map((day) => day.seconds));
  $('#activity-chart').innerHTML = stats.days
    .map(
      (day) =>
        `<div class="activity-day" title="${day.day}：${Math.floor(day.seconds / 60)} 分钟"><div><i style="height:${Math.max(2, (day.seconds / max) * 100)}%"></i></div><span>${day.day.slice(8)}</span><span class="sr-only">${Math.floor(day.seconds / 60)} 分钟</span></div>`
    )
    .join('');
  $('#milestones').innerHTML = stats.milestones
    .map(
      (m) =>
        `<div class="milestone ${m.achieved ? 'achieved' : ''}"><strong>${m.achieved ? '✓' : '○'} ${m.minutes} 分钟</strong><span>${m.achieved ? '已达成' : '继续积累'}</span></div>`
    )
    .join('');
  $('#recent-practice').innerHTML =
    stats.recent
      .map((item) => {
        const job = state.jobs.find((job) => job.id === item.job_id);
        return job
          ? `<button class="recent-row" data-practice="${escape(job.id)}"><span>${escape(job.title)}</span><small>${Math.floor(item.seconds / 60)} 分钟 · 继续练习 →</small></button>`
          : '';
      })
      .join('') || '<p class="field-help">播放一份录音后，记录会出现在这里。</p>';
  $('#leaderboard').innerHTML =
    stats.leaderboard
      .map(
        (row) =>
          `<li><span>${escape(row.display_name)}</span><strong>${Math.floor(row.seconds / 60)} 分钟</strong></li>`
      )
      .join('') || '<p class="field-help">还没有学习者参加。你可以在个人目标里选择加入。</p>';
  $('#display-name').value = state.user.display_name;
  $('#daily-goal').value = Math.floor(state.user.goal / 60);
  $('#join-leaderboard').checked = !!state.user.leaderboard;
}
export async function beginStudy(job) {
  await flushStudy();
  studySession = null;
  studyJob = job.id;
  studySeconds = 0;
  const session = await post('/study/sessions', { job_id: job.id });
  if (studyJob === job.id) studySession = session.id;
}
async function flushStudy() {
  if (eventInFlight) return;
  if (!pendingStudy && studySession && studySeconds > 0) {
    pendingStudy = {
      session_id: studySession,
      event_id: uid(),
      seconds: Math.min(30, studySeconds),
      position: document.querySelector('#audio').currentTime || 0,
    };
    studySeconds = 0;
  }
  if (!pendingStudy) return;
  eventInFlight = true;
  try {
    await post('/study/events', pendingStudy);
    pendingStudy = null;
  } catch {
    /* Keep the same event ID for an idempotent retry. */
  } finally {
    eventInFlight = false;
  }
}
export async function initWorkspace() {
  const languages = Object.entries(state.languages)
    .map(([id, name]) => `<option value="${id}">${escape(name)}</option>`)
    .join('');
  $('#author-language').innerHTML = $('#voice-language').innerHTML = languages;
  $('#library-language').innerHTML += languages;
  $('#create-invite').hidden = !state.user.admin;
  $('#author-form').addEventListener('input', remember);
  $('#author-form').addEventListener('change', remember);
  $('#author-result').addEventListener('input', remember);
  $('#author-file').onchange = async () => {
    const file = $('#author-file').files[0];
    if (!file) return;
    try {
      const text = await file.text();
      if (text.length > 12000) throw new Error('每次创作最多 12,000 字，请分段导入。');
      $('#author-source').value = text;
      remember();
    } catch (error) {
      toast(error.message, true);
    } finally {
      $('#author-file').value = '';
    }
  };
  document.querySelectorAll('[data-author-mode]').forEach(
    (button) =>
      (button.onclick = () => {
        setMode(button.dataset.authorMode);
        remember();
      })
  );
  $('#author-form').onsubmit = (event) => {
    event.preventDefault();
    void submitComposition();
  };
  $('#import-author-text').onclick = () => $('#author-file').click();
  $('#author-result').addEventListener('toggle', fitResults, true);
  window.addEventListener('pagehide', persistDraft);
  $('#new-composition').onclick = () => {
    if (dirty && !confirm('当前编辑已在此浏览器保存。开始新创作会清空这份本地草稿，是否继续？'))
      return;
    clearTimeout(draftTimer);
    revisionEpoch += 1;
    loadingRevision = false;
    pendingSubmission = null;
    current = null;
    dirty = false;
    localStorage.removeItem(draftKey());
    $('#author-source').value = $('#author-context').value = $('#author-instructions').value = '';
    $('#author-result').innerHTML =
      '<div class="result-empty"><h2>从一个新想法开始</h2><p>写下自己的表达，或描述一个想练习的场景。</p></div>';
    $('#author-status').textContent = '之前的生成版本仍保留在创作历史中。';
    setMode('polish');
    $('#author-settings').open = false;
    $('#author-error').hidden = true;
    $('#author-draft-status').textContent = '草稿仅保存在此浏览器';
    renderHistory();
    $('#author-source').focus();
  };
  $('#revision-select').onchange = async () => {
    if (!$('#revision-select').value) return;
    if (dirty && !confirm('打开历史版本会替换当前编辑区。已生成版本仍会保留，是否继续？')) {
      renderHistory();
      return;
    }
    if (await selectRevision($('#revision-select').value)) {
      remember();
      dirty = false;
    }
  };
  $('#author-result').onclick = async (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    try {
      if (button.hasAttribute('data-use-chinese') || button.hasAttribute('data-refine-chinese')) {
        $('#author-source').value = $('#result-chinese').value;
        if (button.hasAttribute('data-use-chinese')) $('#author-instructions').value = '';
        setMode(button.hasAttribute('data-use-chinese') ? 'variants' : 'polish');
        remember();
        if (button.hasAttribute('data-use-chinese')) await submitComposition();
        else showAuthorInput({ instructions: true });
        return;
      }
      if (button.hasAttribute('data-expression-settings')) {
        $('#author-source').value = $('#result-chinese').value;
        setMode('variants');
        $('#author-instructions').value = '';
        remember();
        showAuthorInput();
        return;
      }
      if (button.hasAttribute('data-refine-result')) {
        const edited = readResult();
        const source =
          current.input.mode === 'polish'
            ? edited.chinese
            : current.input.mode === 'variants'
              ? edited.variants.map((v) => `${v.label}: ${v.text}`).join('\n\n')
              : JSON.stringify(edited.dialogues);
        if (source.length > 12000)
          throw new Error('本版内容超过单次创作长度，请复制需要打磨的部分到左侧。');
        $('#author-source').value = source;
        setMode(current.input.mode);
        remember();
        showAuthorInput({ instructions: true });
        return;
      }
      if (button.hasAttribute('data-feedback-composition'))
        return giveFeedback('composition', current.id);
      button.disabled = true;
      if (button.hasAttribute('data-save-chinese')) await saveCandidate('chinese', 0);
      if (button.dataset.saveVariant !== undefined)
        await saveCandidate('variant', Number(button.dataset.saveVariant));
      if (button.dataset.saveDialogue !== undefined)
        await saveCandidate('dialogue', Number(button.dataset.saveDialogue));
      if (button.id === 'save-all-results') {
        const selection = candidateSnapshot();
        for (let i = 0; i < selection.result.variants.length; i++) {
          if (!draftsEnabled) return;
          await saveCandidate('variant', i, false, selection);
        }
        for (let i = 0; i < selection.result.dialogues.length; i++) {
          if (!draftsEnabled) return;
          await saveCandidate('dialogue', i, false, selection);
        }
        toast('本版语料已全部入库，可按标签和语言筛选。');
      }
      button.textContent = '已保存到语料库 ✓';
    } catch (error) {
      button.disabled = false;
      toast(error.message, true);
    }
  };
  $('#metadata-form').onsubmit = async (event) => {
    event.preventDefault();
    try {
      await api(
        `/materials/${metadataId}`,
        jsonOptions('PATCH', {
          title: $('#meta-title').value,
          tags: $('#meta-tags')
            .value.split(/[,，]/)
            .map((s) => s.trim())
            .filter(Boolean),
          visibility: $('#meta-shared').checked ? 'shared' : 'private',
          favorite: $('#meta-favorite').checked,
          archived: $('#meta-archived').checked,
        })
      );
      state.materials = await api('/materials');
      refreshViews();
      $('#metadata-dialog').close();
      toast('语料设置已保存。');
    } catch (error) {
      $('#metadata-error').textContent = error.message;
    }
  };
  document
    .querySelectorAll('[data-close-dialog]')
    .forEach((button) => (button.onclick = () => button.closest('dialog').close()));
  $('#feedback-form').onsubmit = async (event) => {
    event.preventDefault();
    try {
      await post('/feedback', {
        ...feedbackTarget,
        rating: Number($('#feedback-rating').value),
        note: $('#feedback-note').value,
      });
      if (feedbackTarget.target_type === 'composition') {
        $('#author-instructions').value = $('#feedback-note').value;
        remember();
      }
      $('#feedback-dialog').close();
      toast('反馈已保存，可在下一轮修改中使用。');
    } catch (error) {
      $('#feedback-error').textContent = error.message;
    }
  };
  $('#audio-feedback').onclick = () => giveFeedback('generation', state.currentJob?.id);
  $('#edit-dialogue').onclick = () =>
    editDialogue(state.materials.find((item) => item.id === state.materialId));
  $('#refresh-progress').onclick = () =>
    refreshProgress().catch((error) => toast(error.message, true));
  $('#profile-form').onsubmit = async (event) => {
    event.preventDefault();
    try {
      const data = {
        display_name: $('#display-name').value,
        goal: Number($('#daily-goal').value) * 60,
        leaderboard: $('#join-leaderboard').checked,
      };
      await api('/auth/profile', jsonOptions('PATCH', data));
      Object.assign(state.user, data);
      $('#profile-name').textContent = $('#mobile-profile-name').textContent = data.display_name;
      await refreshProgress();
      toast('学习目标已保存。');
    } catch (error) {
      toast(error.message, true);
    }
  };
  $('#create-invite').onclick = async () => {
    try {
      $('#invite-result').textContent =
        `邀请码（24 小时内可使用一次）：${(await post('/auth/invite', {})).code}`;
    } catch (error) {
      toast(error.message, true);
    }
  };
  $('#password-form').onsubmit = async (event) => {
    event.preventDefault();
    try {
      await retireSession(() =>
        post('/auth/password', {
          current: $('#current-password').value,
          new: $('#new-password').value,
        })
      );
    } catch (error) {
      toast(error.message, true);
    }
  };
  revisions = await api('/compositions');
  renderHistory();
  const draft = loadDraft();
  if (draft) {
    pendingSubmission = draft.pendingSubmission;
    if (draft.current && revisions.some((item) => item.id === draft.current))
      await selectRevision(draft.current, draft.result);
    if (!draft.current && draft.inlineInput && validDraftResult(draft.result)) {
      current = {
        input: draft.inlineInput,
        result: draft.result,
        tags: Array.isArray(draft.inlineTags)
          ? draft.inlineTags.filter((tag) => typeof tag === 'string')
          : [],
      };
      renderResult(current.result);
    }
    setMode(['polish', 'variants', 'scenario'].includes(draft.mode) ? draft.mode : 'polish');
    for (const field of [
      'source',
      'context',
      'instructions',
      'style',
      'language',
      'person',
      'count',
      'turns',
    ])
      if (draft[field] !== undefined) $(`#author-${field}`).value = draft[field];
    $('#source-count').textContent =
      `${$('#author-source').value.length.toLocaleString()} / 12,000 字`;
  } else setMode('polish');
  updateAuthorControls();
  renderHistory();
  let polling = false;
  setInterval(async () => {
    if (
      document.hidden ||
      polling ||
      !current?.id ||
      !['queued', 'running'].includes(current.status)
    )
      return;
    polling = true;
    const identifier = current.id;
    const epoch = revisionEpoch;
    try {
      const item = await api(`/compositions/${identifier}`);
      if (epoch !== revisionEpoch || current?.id !== identifier) return;
      current = item;
      renderStatus(item);
      if (item.result) {
        renderResult(item.result);
        persistDraft();
      }
      const history = await api('/compositions');
      if (epoch !== revisionEpoch || current?.id !== identifier) return;
      revisions = history;
      renderHistory();
    } catch {
      if (epoch === revisionEpoch && current?.id === identifier) {
        $('#author-status').textContent = '连接暂时中断，正在重连。你的原文和已提交版本都已保存。';
      }
    } finally {
      polling = false;
    }
  }, 2500);
  const audio = document.querySelector('#audio');
  setInterval(() => {
    const stamp = performance.now();
    const elapsed = lastTick ? Math.min(2, (stamp - lastTick) / 1000) : 0;
    lastTick = stamp;
    if (
      studySession &&
      !audio.paused &&
      !audio.ended &&
      !audio.seeking &&
      audio.readyState >= 3 &&
      elapsed >= 0.5
    )
      studySeconds = Math.min(30, studySeconds + 1);
    if (studySeconds >= 10 || pendingStudy) void flushStudy();
  }, 1000);
  audio.addEventListener('pause', () => void flushStudy());
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) void flushStudy();
  });
  window.addEventListener('pagehide', () => {
    if (studySession && studySeconds)
      fetch('/api/study/events', {
        ...jsonOptions('POST', {
          session_id: studySession,
          event_id: uid(),
          seconds: studySeconds,
          position: audio.currentTime || 0,
        }),
        keepalive: true,
      });
  });
}
