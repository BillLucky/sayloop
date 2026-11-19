// The static login page also offers recovery if even this module cannot load.
const status = document.querySelector('#auth-startup');
status.querySelector('a').addEventListener('click', (event) => {
  event.preventDefault();
  location.reload();
});

import('./app.js')
  .then(({ init }) => init())
  .catch(() => {
    status.querySelector('span').textContent = '学习空间加载失败。请检查连接，然后';
    status.hidden = false;
  });
