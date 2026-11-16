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
const uid = () =>
  crypto.randomUUID
    ? crypto.randomUUID().replaceAll('-', '')
    : Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) =>
        b.toString(16).padStart(2, '0')
      ).join('');
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
const draftKey = () => `sayloop-authoring-${state.user.id}`;

export async function authenticate(helpers) {
  ({ api, post, state, toast, showView, openMaterial, refreshViews } = helpers);
  let user = (await api('/auth/me')).user;
  if (!user) {
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
        $('#auth-submit').disabled = true;
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
        } finally {
          $('#auth-submit').disabled = false;
        }
      };
    });
  }
  state.user = user;
  setAudioUser(user.id);
  $('#profile-name').textContent = $('#mobile-profile-name').textContent = user.display_name;
  $('#auth-screen').hidden = true;
  document.body.classList.remove('auth-pending');
  $('#mobile-logout').onclick = () => $('#logout').click();
  $('#logout').onclick = async () => {
    document.querySelector('#audio').pause();
    try {
      await post('/auth/logout', {});
      await clearUserAudio();
      localStorage.removeItem(draftKey());
      localStorage.removeItem(`llh-draft-${user.id}`);
    } finally {
      location.reload();
    }
  };
}

function remember() {
  dirty = true;
  $('#source-count').textContent =
    `${$('#author-source').value.length.toLocaleString()} / 12,000 字`;
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
      })
    );
  } catch {}
}
function setMode(value) {
  mode = value;
  document
    .querySelectorAll('[data-author-mode]')
    .forEach((button) =>
      button.setAttribute('aria-pressed', String(button.dataset.authorMode === mode))
    );
  $('#turns-field').hidden = mode !== 'scenario';
  $('#author-count').disabled = mode === 'polish';
  $('#author-count').max = mode === 'variants' ? 6 : 30;
  if (mode === 'variants' && Number($('#author-count').value) > 6) $('#author-count').value = 3;
  $('#author-language').disabled = mode === 'polish';
  $('#author-expression-options').hidden = mode === 'polish';
  $('#author-submit').textContent = {
    polish: '打磨这段中文',
    variants: '生成表达变体',
    scenario: '生成场景对话',
  }[mode];
  $('#source-label').textContent =
    mode === 'scenario'
      ? '描述演练场景、双方身份与沟通诉求'
      : mode === 'variants'
        ? '确认要表达的中文内容'
        : '写下你想说的话';
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
function renderResult(result) {
  const chinese = result.chinese
    ? `<article class="panel result-card"><h2>中文定稿</h2><label for="result-chinese">你可以直接修改，再继续打磨或生成表达</label><textarea id="result-chinese" rows="10" maxlength="12000">${escape(result.chinese)}</textarea><div class="result-actions"><button class="button primary" data-use-chinese>以这版中文生成表达</button><details class="result-more"><summary>这版中文的其他操作</summary><button class="text-button" data-refine-chinese>继续打磨中文</button><button class="text-button" data-save-chinese>保存中文语料</button></details></div></article>`
    : '';
  const variants = result.variants
    .map(
      (variant, index) =>
        `<article class="panel result-card"><h2>${escape(variant.label)}</h2><label for="variant-${index}">表达内容 · 可直接编辑</label><textarea id="variant-${index}" rows="8" maxlength="20000">${escape(variant.text)}</textarea><button class="button secondary" data-save-variant="${index}">保存语料并选择声音 →</button></article>`
    )
    .join('');
  const dialogues = result.dialogues
    .map(
      (dialogue, index) =>
        `<article class="panel result-card dialogue-result"><label for="dialogue-title-${index}">对话 ${index + 1} · 标题</label><input id="dialogue-title-${index}" value="${escape(dialogue.title)}" maxlength="160" /><div class="author-options"><label for="role-a-${index}">角色 A<input id="role-a-${index}" value="${escape(dialogue.role_a)}" maxlength="80" /></label><label for="role-b-${index}">角色 B<input id="role-b-${index}" value="${escape(dialogue.role_b)}" maxlength="80" /></label></div>${dialogue.turns.map((turn, turnIndex) => `<div class="dialogue-turn ${turn.speaker === 'B' ? 'speaker-b' : ''}"><label for="turn-${index}-${turnIndex}">${turn.speaker} · ${escape(turn.speaker === 'A' ? dialogue.role_a : dialogue.role_b)}</label><textarea id="turn-${index}-${turnIndex}" rows="2" maxlength="2000">${escape(turn.text)}</textarea><label class="translation-label" for="translation-${index}-${turnIndex}">中文释义</label><textarea id="translation-${index}-${turnIndex}" class="translation" rows="2" maxlength="2000">${escape(turn.translation)}</textarea></div>`).join('')}<button class="button secondary" data-save-dialogue="${index}">保存对话并分配声音 →</button></article>`
    )
    .join('');
  $('#author-result').innerHTML =
    `<div class="result-heading"><h2>${escape(result.title)}</h2><div class="result-actions"><button class="text-button" data-refine-result>按本轮要求再打磨</button><details class="result-more"><summary>更多操作</summary><button class="text-button" data-feedback-composition>记录创作反馈</button>${result.variants.length + result.dialogues.length > 1 ? '<button id="save-all-results" class="text-button">全部语料入库</button>' : ''}</details></div></div>${result.notes ? `<p class="result-notes">${escape(result.notes)}</p>` : ''}${chinese}${variants}${dialogues}`;
}
function renderHistory() {
  const selected = current?.id || '';
  $('#revision-select').innerHTML =
    '<option value="">选择一个历史版本</option>' +
    revisions
      .map(
        (item) =>
          `<option value="${item.id}">${new Date(item.created_at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} · ${{ polish: '中文打磨', variants: '表达变体', scenario: '场景对话' }[item.input.mode]} · ${{ queued: '排队中', running: '创作中', completed: '已完成', failed: '生成失败', interrupted: '已中断' }[item.status]} · ${escape(item.input.source.slice(0, 18))}</option>`
      )
      .join('');
  $('#revision-select').value = selected;
}
function renderStatus(item) {
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
  current = await api(`/compositions/${id}`);
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
  $('#source-count').textContent = `${spec.source.length.toLocaleString()} / 12,000 字`;
}
async function saveCandidate(kind, index, navigate = true) {
  const result = readResult();
  const language = current.input.language;
  let body = {
    title: result.title,
    language,
    tags: [current.input.style],
    composition_id: current.id?.length === 32 ? current.id : null,
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
  state.materials = await api('/materials');
  refreshViews();
  if (navigate) {
    openMaterial(material.id);
    toast('语料已保存。先试听，再生成完整录音。');
  }
  return material;
}
export function editDialogue(material) {
  current = {
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
  $('#author-status').textContent = '修改对话后保存为一份新语料；原语料与录音会保留。';
  showView('authoring');
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
  $('#author-form').onsubmit = async (event) => {
    event.preventDefault();
    $('#author-submit').disabled = true;
    try {
      const body = {
        mode,
        source: $('#author-source').value,
        style: $('#author-style').value,
        language: $('#author-language').value,
        person: $('#author-person').value,
        context: $('#author-context').value,
        instructions: $('#author-instructions').value,
        count: Number($('#author-count').value),
        turns: Number($('#author-turns').value),
        parent_id: current?.id?.length === 32 ? current.id : null,
      };
      const item = await post('/compositions', body);
      revisions.unshift(item);
      await selectRevision(item.id);
      if (innerWidth < 1180)
        $('#author-output').scrollIntoView({ block: 'start', behavior: 'smooth' });
      remember();
    } catch (error) {
      toast(error.message, true);
    } finally {
      $('#author-submit').disabled = false;
    }
  };
  $('#new-composition').onclick = () => {
    if (dirty && !confirm('当前编辑已在此浏览器保存。开始新创作会清空这份本地草稿，是否继续？'))
      return;
    current = null;
    dirty = false;
    localStorage.removeItem(draftKey());
    $('#author-source').value = $('#author-context').value = $('#author-instructions').value = '';
    $('#author-result').innerHTML =
      '<div class="result-empty"><h2>从一个新想法开始</h2><p>写下自己的表达，或描述一个想练习的场景。</p></div>';
    $('#author-status').textContent = '之前的生成版本仍保留在创作历史中。';
    setMode('polish');
    renderHistory();
    $('#author-source').focus();
  };
  $('#revision-select').onchange = async () => {
    if (!$('#revision-select').value) return;
    if (dirty && !confirm('打开历史版本会替换当前编辑区。已生成版本仍会保留，是否继续？')) {
      renderHistory();
      return;
    }
    await selectRevision($('#revision-select').value);
    remember();
    dirty = false;
  };
  $('#author-result').onclick = async (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    try {
      if (button.hasAttribute('data-use-chinese') || button.hasAttribute('data-refine-chinese')) {
        $('#author-source').value = $('#result-chinese').value;
        setMode(button.hasAttribute('data-use-chinese') ? 'variants' : 'polish');
        remember();
        $('#author-instructions').focus();
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
        $('#author-instructions').focus();
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
        const result = readResult();
        for (let i = 0; i < result.variants.length; i++) await saveCandidate('variant', i, false);
        for (let i = 0; i < result.dialogues.length; i++) await saveCandidate('dialogue', i, false);
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
      await post('/auth/password', {
        current: $('#current-password').value,
        new: $('#new-password').value,
      });
      await clearUserAudio();
      location.reload();
    } catch (error) {
      toast(error.message, true);
    }
  };
  revisions = await api('/compositions');
  renderHistory();
  let draft;
  try {
    draft = JSON.parse(localStorage.getItem(draftKey()) || 'null');
  } catch {}
  if (draft) {
    if (draft.current && revisions.some((item) => item.id === draft.current))
      await selectRevision(draft.current, draft.result);
    setMode(draft.mode);
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
    try {
      const item = await api(`/compositions/${current.id}`);
      current = item;
      renderStatus(item);
      if (item.result) {
        renderResult(item.result);
        remember();
        dirty = false;
      }
      revisions = await api('/compositions');
      renderHistory();
    } catch {
      $('#author-status').textContent = '连接暂时中断，正在重连。你的原文和已提交版本都已保存。';
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
