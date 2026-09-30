(function () {
  'use strict';
  const S = window.WhaleXStore, L = window.WhaleXLogic, C = window.WhaleXSync;
  const $ = s => document.querySelector(s);
  let rows = [], view = 'all', type = 'all', tag = '', search = '', composer, editor, pip, floatingComposer, toastTimer, renderTimer;
  const icons = {
    home: '<path d="m3 10 9-7 9 7v10H3Z"/><path d="M9 20v-7h6v7"/>', edit: '<path d="m14 4 6 6M4 20l5-1L21 7l-5-5L4 14Z"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 2v6m10-6v6M3 11h18m-14 4h3m4 0h3"/>', star: '<path d="m12 2 3 7 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z"/>',
    archive: '<path d="M4 8v12h16V8M9 12h6"/><rect x="2" y="3" width="20" height="5" rx="1"/>', settings: '<circle cx="12" cy="12" r="3"/><path d="m9 3 1-1h4l1 3 3 1 3 2v4l-3 2-1 3-2 3h-4l-2-3-3-1-3-2v-4l3-2 1-3Z"/>',
    search: '<circle cx="10" cy="10" r="7"/><path d="m15 15 6 6"/>', library: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v13c0 4 16 4 16 0V5M4 11c0 4 16 4 16 0"/>',
    tag: '<path d="M3 3h9l9 9-9 9-9-9Z"/><circle cx="8" cy="8" r="1"/>', workflow: '<circle cx="12" cy="4" r="3"/><circle cx="4" cy="19" r="3"/><circle cx="20" cy="19" r="3"/><path d="m10 7-4 9m8-9 4 9M7 19h10"/>',
    cloud: '<path d="M6 18a5 5 0 0 1-1-10 7 7 0 0 1 13-2 6 6 0 0 1 0 12M9 14l3-3 3 3m-3-3v11"/>', export: '<path d="M5 10H3v11h18V10h-2M12 16V2m-5 5 5-5 5 5"/>'
  };
  function renderIcons() { document.querySelectorAll('[data-icon]').forEach(el => { el.innerHTML = `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${icons[el.dataset.icon] || icons.tag}</svg>`; }); }
  function toast(text) { clearTimeout(toastTimer); $('#toast').textContent = text; $('#toast').classList.add('show'); toastTimer = setTimeout(() => $('#toast').classList.remove('show'), 4800); }
  function today(date) { return new Date(date).toDateString() === new Date().toDateString(); }
  const libraries = () => rows.filter(r => r.kind === 'library' && !r.deleted);
  const notes = () => rows.filter(r => r.kind === 'note' && !r.deleted);
  function filtered() {
    return notes().filter(r => {
      const p = r.payload;
      if (view === 'archived' ? !p.archived : p.archived) return false;
      if (view === 'today' && !today(p.created)) return false;
      if (view === 'favorites' && !p.favorite) return false;
      if (view.startsWith('lib:') && p.libraryId !== view.slice(4)) return false;
      if (type !== 'all' && p.type !== type) return false;
      if (tag && !p.tags.includes(tag)) return false;
      const libName = libraries().find(l => l.id === p.libraryId)?.payload.name || '';
      return !search || [p.title, p.content, p.type, ...p.tags, libName].join(' ').toLowerCase().includes(search);
    }).sort((a, b) => b.payload.updated.localeCompare(a.payload.updated));
  }
  async function render() {
    rows = await S.all();
    const active = notes().filter(r => !r.payload.archived), libs = libraries();
    const counts = { all: active.length, today: active.filter(r => today(r.payload.created)).length, favorites: active.filter(r => r.payload.favorite).length };
    document.querySelectorAll('[data-count]').forEach(el => { if (el.dataset.count in counts) el.textContent = counts[el.dataset.count]; });
    $('#libraryNav').innerHTML = libs.map(l => `<button class="nav-item ${view === 'lib:' + l.id ? 'active' : ''}" data-view="lib:${L.esc(l.id)}" title="${L.esc(l.payload.name)}"><i class="library-dot dot-${l.payload.color}"></i><span>${L.esc(l.payload.name)}</span><em>${active.filter(r => r.payload.libraryId === l.id).length}</em></button>`).join('');
    document.querySelectorAll('.nav-item[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === view));
    document.querySelectorAll('.toolbar [data-type]').forEach(b => b.classList.toggle('active', b.dataset.type === type));
    const names = { all: '最近记录', today: '今天的记录', favorites: '我的收藏', archived: '已归档' };
    $('#viewTitle').textContent = names[view] || libs.find(l => view === 'lib:' + l.id)?.payload.name || '资料库';
    const arr = filtered(); $('#viewSubtitle').textContent = `${arr.length} 条记录${tag ? ' · #' + tag : ''}${type !== 'all' ? ' · ' + type : ''}`;
    const allTags = [...new Set(active.flatMap(r => r.payload.tags))].slice(0, 16);
    $('#tagFilter').innerHTML = (tag ? `<button class="filter-tag active" data-tag="">清除 #${L.esc(tag)} ×</button>` : '') + allTags.map(t => `<button class="filter-tag ${tag === t ? 'active' : ''}" data-tag="${L.esc(t)}"># ${L.esc(t)}</button>`).join('');
    $('#noteGrid').innerHTML = arr.length ? arr.map(r => {
      const p = r.payload, lib = libs.find(l => l.id === p.libraryId)?.payload.name || '未分类';
      return `<article class="note-card"><div class="note-top"><span class="note-type">${L.esc(p.type)}</span><button class="mini-button favorite ${p.favorite ? 'active' : ''}" data-note-act="favorite" data-id="${L.esc(r.id)}" aria-label="${p.favorite ? '取消收藏' : '收藏'}">${p.favorite ? '★' : '☆'}</button></div><h3>${L.esc(p.title)}</h3><p>${L.esc(p.content)}</p><div class="note-tags">${p.tags.map(t => `<span>#${L.esc(t)}</span>`).join('')}</div><footer class="note-foot"><span title="${L.esc(lib)}">${L.esc(lib)} · ${new Date(p.updated).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })}</span><div class="note-actions"><button class="mini-button" data-note-act="edit" data-id="${L.esc(r.id)}">编辑</button><button class="mini-button" data-note-act="float" data-id="${L.esc(r.id)}">浮窗</button><button class="mini-button" data-note-act="copy" data-id="${L.esc(r.id)}" title="复制内容">复制</button></div></footer><div class="note-actions secondary-actions"><button class="mini-button" data-note-act="archive" data-id="${L.esc(r.id)}">${p.archived ? '移回资料库' : '归档'}</button><button class="mini-button" data-note-act="delete" data-id="${L.esc(r.id)}">删除</button></div></article>`;
    }).join('') : `<div class="empty"><strong>${search || tag ? '暂时没有匹配的记录' : '好想法，从第一张便签开始'}</strong><p>${search || tag ? '试试其他关键词，或清除筛选。' : '在右侧输入提示词，选择资料库和标签。<br>保存后，它就会出现在这里。'}</p><button class="primary" data-act="focus">记录一个想法 ↗</button></div>`;
    $('#todayDate').textContent = new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' });
    $('#todayCount').textContent = counts.today;
    const todos = active.filter(r => r.payload.type === 'Todo').sort((a,b) => Number(a.payload.done) - Number(b.payload.done)).slice(0, 5);
    $('#todayTasks').innerHTML = todos.length ? todos.map(r => `<div class="task ${r.payload.done ? 'done' : ''}"><button data-note-act="done" data-id="${L.esc(r.id)}" aria-label="${r.payload.done ? '标记未完成' : '标记完成'}">${r.payload.done ? '✓' : ''}</button><span>${L.esc(r.payload.title)}</span></div>`).join('') : `<p class="today-empty">今天已捕捉 ${counts.today} 条想法。<br>将便签类型设为 Todo，这里会显示待办。</p>`;
  }
  function queueRender() { clearTimeout(renderTimer); renderTimer = setTimeout(() => void render().catch(e => toast(e.message)), 50); }
  async function openEditor(record) {
    editor?.dispose(); const dialog = $('#editorDialog');
    editor = await window.WhaleXComposer.mount($('#editorRoot'), { record, onSaved: () => { dialog.close(); queueRender(); }, onClose: () => dialog.close() });
    dialog.showModal(); editor.focus();
  }
  async function float(record = null) {
    if (window.__TAURI__) {
      try { await window.__TAURI__.core.invoke(record ? 'open_sticky' : 'show_capture', record ? { id: record.id } : {}); }
      catch (e) { toast('桌面便签未能打开：' + (e.message || e)); }
      return;
    }
    if (!window.documentPictureInPicture) {
      toast('浏览器不支持置顶画中画。已尝试打开普通便签窗口；真正置顶请使用桌面版。');
      const win = window.open('./capture.html' + (record ? '?id=' + encodeURIComponent(record.id) : ''), 'WhaleXNote', 'width=440,height=620');
      if (!win) toast('弹窗被拦截，请允许弹窗或使用桌面版'); return;
    }
    try {
      // Request during the click gesture, before asynchronous storage work.
      const request = pip && !pip.closed ? Promise.resolve(pip) : window.documentPictureInPicture.requestWindow({ width: 420, height: 600 });
      pip = await request; floatingComposer?.dispose();
      pip.document.head.innerHTML = '';
      const link = pip.document.createElement('link'); link.rel = 'stylesheet'; link.href = new URL('./styles.css', location.href).href; pip.document.head.appendChild(link);
      pip.document.title = 'WhaleX · 悬浮输入'; pip.document.body.className = 'capture-page'; pip.document.body.innerHTML = '<div id="captureRoot"></div>';
      const thisPip = pip;
      floatingComposer = await window.WhaleXComposer.mount(pip.document.querySelector('#captureRoot'), { record, draftSlot: 'floating', onClose: () => thisPip.close() });
      thisPip.addEventListener('pagehide', () => { floatingComposer?.dispose(); floatingComposer = null; pip = null; }, { once: true });
      floatingComposer.focus(); pip.focus();
    } catch (e) { toast('画中画未能打开：' + e.message + '。请直接点击“悬浮便签”重试。'); }
  }
  function settings() {
    const c = S.config(); $('#cloudUrl').value = c?.url || ''; $('#cloudKey').value = c?.key || '';
    updateAccountUI(); $('#settingsDialog').showModal();
  }
  function updateAccountUI() {
    const s = S.session(); $('#accountNotice').textContent = s ? '当前账号：' + s.user.email + '。本机离线库与此账号分开保存。' : '未登录：记录仅保存在当前设备。';
    $('#loginForm').hidden = !!s; $('#loggedActions').hidden = !s;
    if (s) $('#loginEmail').value = s.user.email || '';
  }
  const settingMsg = text => { $('#settingsMessage').textContent = text; };
  async function accountAction(fn) { try { settingMsg('正在处理…'); const result = await fn(); settingMsg(result || '操作完成'); updateAccountUI(); } catch(e) { settingMsg(e.message || String(e)); } }
  async function download(name, content, mime) {
    if (window.__TAURI__) { const path = await window.__TAURI__.core.invoke('export_text', { filename: name, content }); toast('已保存：' + path); return; }
    const url = URL.createObjectURL(new Blob([content], { type: mime })), a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  async function exportView(kind) {
    const arr = filtered().map(r => ({ id: r.id, ...r.payload })), stamp = new Date().toISOString().slice(0, 10);
    let text, mime = 'text/plain;charset=utf-8';
    if (kind === 'json') { text = JSON.stringify({ version: 2, libraries: libraries().map(r => ({ id: r.id, ...r.payload })), notes: arr }, null, 2); mime = 'application/json'; }
    else if (kind === 'html') { text = '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>WhaleX 导出</title><body>' + arr.map(n => `<h1>${L.esc(n.title)}</h1><p>${L.esc(n.tags.join(' · '))}</p><p>${L.esc(n.content).replace(/\n/g, '<br>')}</p><hr>`).join('') + '</body></html>'; mime = 'text/html;charset=utf-8'; }
    else { text = arr.map(n => (kind === 'md' ? '# ' : '') + n.title + '\n\n' + n.tags.map(t => '#' + t).join(' ') + '\n\n' + n.content).join('\n\n---\n\n'); }
    await download(`WhaleX-${stamp}.${kind}`, text, mime); $('#exportDialog').close();
  }
  document.addEventListener('click', async e => {
    const btn = e.target.closest('button'); if (!btn) return;
    try {
      if (btn.dataset.close) return $('#' + btn.dataset.close).close();
      if ('view' in btn.dataset) { view = btn.dataset.view; tag = ''; await render(); return; }
      if ('type' in btn.dataset) { type = btn.dataset.type; await render(); return; }
      if ('tag' in btn.dataset) { tag = btn.dataset.tag; await render(); return; }
      if (btn.dataset.export) return await exportView(btn.dataset.export);
      const act = btn.dataset.act;
      if (act === 'capture') return await float();
      if (act === 'focus') { composer?.focus(); $('#inlineComposer').scrollIntoView({ behavior: 'smooth', block: 'center' }); }
      if (act === 'settings') settings();
      if (act === 'export') $('#exportDialog').showModal();
      if (act === 'newlib') { $('#libraryDialog').showModal(); $('#libraryName').focus(); }
      if (act === 'tags') { $('#tagFilter').scrollIntoView({ behavior: 'smooth', block: 'center' }); if (!$('#tagFilter').children.length) toast('为记录添加标签后，即可在这里筛选'); }
      const row = rows.find(r => r.id === btn.dataset.id); if (!row) return;
      const action = btn.dataset.noteAct;
      if (action === 'edit') await openEditor(row);
      if (action === 'float') await float(row);
      if (action === 'favorite') await S.patch(row.id, { favorite: !row.payload.favorite });
      if (action === 'archive') await S.patch(row.id, { archived: !row.payload.archived });
      if (action === 'done') await S.patch(row.id, { done: !row.payload.done });
      if (action === 'copy') { await navigator.clipboard.writeText(row.payload.content); toast('已复制提示词'); }
      if (action === 'delete' && confirm('删除这条记录？连接云端后，删除也会同步到其他设备。建议先导出备份。')) { await S.remove(row.id); toast('已删除'); }
    } catch (error) { toast(error.message || String(error)); }
  });
  $('#searchInput').addEventListener('input', e => { search = e.target.value.toLowerCase().trim(); queueRender(); });
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); $('#searchInput').focus(); }
    if (!window.__TAURI__ && e.ctrlKey && e.shiftKey && e.code === 'Space') { e.preventDefault(); void float(); }
  });
  $('#libraryForm').addEventListener('submit', async e => {
    e.preventDefault(); const name = $('#libraryName').value.trim(); if (!name) return;
    try { if (!libraries().some(l => l.payload.name === name)) await S.put('library', { name }); $('#libraryDialog').close(); $('#libraryName').value = ''; toast('资料库已创建'); } catch(err) { toast(err.message); }
  });
  $('#cloudForm').addEventListener('submit', e => { e.preventDefault(); void accountAction(async () => { C.configure($('#cloudUrl').value, $('#cloudKey').value); return '连接配置已保存在本机。请确认云端已运行 schema.sql，再登录。'; }); });
  $('#loginForm').addEventListener('submit', e => { e.preventDefault(); void accountAction(async () => { await C.login($('#loginEmail').value, $('#loginPassword').value); $('#loginPassword').value = ''; return '已登录，正在同步。离线库不会自动上传。'; }); });
  $('#signupButton').onclick = () => void accountAction(async () => { const msg = await C.signup($('#loginEmail').value, $('#loginPassword').value); $('#loginPassword').value = ''; return msg; });
  $('#logoutButton').onclick = () => void accountAction(async () => { await C.logout(); return '已退出；离线记录保留在本机。'; });
  $('#syncNowButton').onclick = () => void accountAction(async () => { await C.syncNow(); return C.status().message; });
  $('#importLocalButton').onclick = () => { if (confirm('将本机离线库复制到当前云账号？这会上传其中的全部笔记和资料库。多次执行会产生副本。')) void accountAction(async () => '已复制 ' + await S.importBackup(await S.backup('local')) + ' 条记录，等待同步。'); };
  $('#backupButton').onclick = () => void accountAction(async () => { await download('WhaleX-full-backup.json', JSON.stringify(await S.backup(), null, 2), 'application/json'); return '备份已导出'; });
  $('#importButton').onclick = () => $('#importFile').click();
  $('#importFile').onchange = e => { const file = e.target.files[0]; if (!file) return; void accountAction(async () => { if (file.size > 10 * 1024 * 1024) throw new Error('单次导入文件请小于 10 MB'); const count = await S.importBackup(JSON.parse(await file.text())); e.target.value = ''; return `已导入 ${count} 条记录，原记录未覆盖`; }); };
  window.addEventListener('whalex-change', queueRender);
  window.addEventListener('whalex-sync', e => { const s = e.detail, chip = $('#syncStatus'); chip.dataset.mode = s.mode; chip.querySelector('span:last-child').textContent = s.message; chip.title = s.message + (s.lastSync ? '\n上次同步：' + new Date(s.lastSync).toLocaleString('zh-CN') : ''); });
  window.addEventListener('whalex-account', async () => {
    try { pip?.close(); editor?.dispose(); $('#editorDialog').close(); composer?.dispose(); await S.defaults(); composer = await window.WhaleXComposer.mount($('#inlineComposer')); updateAccountUI(); await render(); } catch(e) { toast(e.message); }
  });
  window.addEventListener('focus', queueRender);
  (async () => {
    renderIcons(); const warning = await S.ready;
    if (warning) { $('#migrationNotice').hidden = false; $('#migrationNotice').textContent = warning; }
    composer = await window.WhaleXComposer.mount($('#inlineComposer')); await render(); C.start();
  })().catch(e => toast('启动失败：' + e.message));
})();
