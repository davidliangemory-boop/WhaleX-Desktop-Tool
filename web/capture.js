(function () {
  'use strict';
  const S = window.WhaleXStore;
  let component;
  async function close() {
    if (window.__TAURI__) {
      const win = window.__TAURI__.window.getCurrentWindow();
      if (win.label === 'capture') await window.__TAURI__.core.invoke('hide_capture'); else await win.close();
    } else window.close();
  }
  async function init() {
    component?.dispose();
    const warning = await S.ready;
    const id = new URLSearchParams(location.search).get('id');
    const record = id ? await S.get(id) : null;
    if (id && (!record || record.deleted || record.kind !== 'note')) {
      document.querySelector('#captureRoot').textContent = '当前账号找不到这条记录。请从工作台重新打开便签。'; return;
    }
    component = await window.WhaleXComposer.mount(document.querySelector('#captureRoot'), { record, draftSlot: 'capture', onClose: () => void close() });
    if (warning) document.querySelector('.paper-message').textContent = warning;
    component.focus(); window.WhaleXSync.start();
  }
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { component?.persist(); void close(); } });
  window.addEventListener('whalex-account', () => void init());
  window.addEventListener('focus', () => component?.focus());
  init().catch(e => { document.querySelector('#captureRoot').textContent = '便签启动失败：' + e.message; });
})();
