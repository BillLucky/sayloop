// One set of routes and native dialogs serves mouse, touch, and keyboard navigation.
const $ = (selector) => document.querySelector(selector);
const sheets = () => [...document.querySelectorAll('dialog.action-sheet')];

export function closeSheets() {
  sheets().forEach((dialog) => {
    if (dialog.open) dialog.close();
  });
}

export function openSheet(identifier) {
  closeSheets();
  if (identifier === 'playback-menu')
    $('#hide-player').hidden = document.body.classList.contains('is-immersive');
  $(`#${identifier}`).showModal();
}

export function syncNavigation(view) {
  document.querySelectorAll('[data-view]').forEach((button) => {
    const active = button.dataset.view === view;
    button.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  $('#more-tools').classList.toggle('active', ['studio', 'voices', 'progress'].includes(view));
}

export function initNavigation() {
  for (const [button, dialog] of [
    ['more-tools', 'more-menu'],
    ['library-tools', 'library-menu'],
    ['player-options', 'playback-menu'],
  ]) {
    $(`#${button}`).onclick = () => openSheet(dialog);
  }
  document.querySelectorAll('[data-close-sheet]').forEach((button) => {
    button.onclick = () => button.closest('dialog').close();
  });
  sheets().forEach((dialog) => {
    dialog.addEventListener('click', (event) => {
      if (event.target !== dialog) return;
      const bounds = dialog.getBoundingClientRect();
      if (
        event.clientX < bounds.left ||
        event.clientX > bounds.right ||
        event.clientY < bounds.top ||
        event.clientY > bounds.bottom
      )
        dialog.close();
    });
    dialog.addEventListener('close', () => $('#more-tools').setAttribute('aria-expanded', 'false'));
  });
  $('#hide-player').onclick = () => {
    $('#audio').pause();
    $('.player').hidden = true;
    document.body.classList.remove('player-visible');
    closeSheets();
  };
  $('#more-tools').addEventListener('click', () =>
    $('#more-tools').setAttribute('aria-expanded', 'true')
  );
  matchMedia('(min-width: 701px)').addEventListener('change', closeSheets);
}
