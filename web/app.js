(function () {
  'use strict';
  const S = window.WhaleXStore, L = window.WhaleXLogic, C = window.WhaleXSync, W = window.WhaleXWorkspace;
  const $ = s => document.querySelector(s);
  let rows = [], view = 'all', type = 'all', tag = '', search = '', composer, editor, pip, popupWindow, pipRecordId, floatingComposer, toastTimer, renderTimer, renderVersion = 0, displayLimit = 3, undoCapture;
  const icons = {
    menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',
    home: '<path d="m3 10 9-7 9 7v10H3Z"/><path d="M9 20v-7h6v7"/>', edit: '<path d="m14 4 6 6M4 20l5-1L21 7l-5-5L4 14Z"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 2v6m10-6v6M3 11h18m-14 4h3m4 0h3"/>', star: '<path d="m12 2 3 7 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z"/>',
    archive: '<path d="M4 8v12h16V8M9 12h6"/><rect x="2" y="3" width="20" height="5" rx="1"/>', settings: '<circle cx="12" cy="12" r="3"/><path d="m9 3 1-1h4l1 3 3 1 3 2v4l-3 2-1 3-2 3h-4l-2-3-3-1-3-2v-4l3-2 1-3Z"/>',
    search: '<circle cx="10" cy="10" r="7"/><path d="m15 15 6 6"/>', library: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v13c0 4 16 4 16 0V5M4 11c0 4 16 4 16 0"/>',
    tag: '<path d="M3 3h9l9 9-9 9-9-9Z"/><circle cx="8" cy="8" r="1"/>', workflow: '<circle cx="12" cy="4" r="3"/><circle cx="4" cy="19" r="3"/><circle cx="20" cy="19" r="3"/><path d="m10 7-4 9m8-9 4 9M7 19h10"/>',
    cloud: '<path d="M6 18a5 5 0 0 1-1-10 7 7 0 0 1 13-2 6 6 0 0 1 0 12M9 14l3-3 3 3m-3-3v11"/>', export: '<path d="M5 10H3v11h18V10h-2M12 16V2m-5 5 5-5 5 5"/>',
    sparkles: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3ZM21 2v5m-2.5-2.5h5M3 18v4m-2-2h4"/>',
    message: '<path d="M20 15a9 9 0 1 0-15 3L3 22l6-2a9 9 0 0 0 11-5Z"/><path d="M7 10h.1M12 10h.1M17 10h.1"/>',
    note: '<path d="M14 3H5v18h14V8l-5-5Zm0 0v5h5M8 12h8m-8 4h6"/>'
  };
  function renderIcons() { document.querySelectorAll('[data-icon]').forEach(el => { el.innerHTML = `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${icons[el.dataset.icon] || icons.tag}</svg>`; }); document.querySelectorAll('.sidebar .nav-item').forEach(el => { if (!el.hasAttribute('aria-label')) el.setAttribute('aria-label', el.querySelector('span')?.textContent || el.textContent.trim()); }); }
  function toast(text, undo = false) { clearTimeout(toastTimer); $('#toast').textContent = text; if (undo) { const button = document.createElement('button'); button.dataset.act='undocapture'; button.textContent='撤销'; $('#toast').appendChild(button); } $('#toast').classList.add('show'); toastTimer = setTimeout(() => $('#toast').classList.remove('show'), undo ? 10000 : 4800); }
  function captureSaved(row) { undoCapture={id:row.id,changeId:row.changeId,scope:row.scope}; toast('已保存记录',true); queueRender(); }
  function openCapture(){ window.WhaleXFrame?.show(); composer?.focus(); }
  function closeCapture(){ window.WhaleXFrame?.hide(); }
  function today(date) { return new Date(date).toDateString() === new Date().toDateString(); }
  const scrollBehavior = () => matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth';
  function browse() { window.WhaleXFrame?.reveal(); }
  const libraries = () => rows.filter(r => r.kind === 'library' && !r.deleted);
  const notes = () => rows.filter(r => r.kind === 'note' && !r.deleted);
  function filtered() {
    const query=L.parseQuery(search), review=W.reviewIds();
    return notes().filter(r => {
      const p = r.payload;
      if (view === 'archived' ? !p.archived : p.archived) return false;
      if (view === 'today' && !today(p.created)) return false;
      if (view === 'review' && !review.has(r.id)) return false;
      if (view === 'inbox' && p.libraryId !== 'lib-inbox' && p.tags.length) return false;
      if (view === 'favorites' && !p.favorite) return false;
      if (view.startsWith('lib:') && p.libraryId !== view.slice(4)) return false;
      if (type !== 'all' && p.type !== type) return false;
      if (!L.tagMatches(p.tags,tag) || !W.matches(p)) return false;
      const libName = libraries().find(l => l.id === p.libraryId)?.payload.name || '';
      return L.queryMatches(p,query,libName);
    }).sort((a, b) => b.payload.updated.localeCompare(a.payload.updated));
  }
  async function render() {
    const version=++renderVersion, scope=S.scope();
    rows = await S.all();
    if(version!==renderVersion||scope!==S.scope())return;
    await W.refresh(rows,{view,type});
    if(version!==renderVersion||scope!==S.scope())return;
    const active = notes().filter(r => !r.payload.archived), libs = libraries();
    const counts = { all: active.length, today: active.filter(r => today(r.payload.created)).length, favorites: active.filter(r => r.payload.favorite).length };
    document.querySelectorAll('[data-count]').forEach(el => { if (el.dataset.count in counts) { const n=counts[el.dataset.count]; el.textContent=n?String(n):''; el.hidden=!n; } });
    document.querySelectorAll('[data-collection-count]').forEach(el => { const key = el.dataset.collectionCount; el.textContent = key === 'favorites' ? counts.favorites : active.filter(r => r.payload.type === key).length; });
    $('#libraryNav').innerHTML = libs.map(l => { const n=active.filter(r=>r.payload.libraryId===l.id).length; return `<button class="nav-item ${view === 'lib:' + l.id ? 'active' : ''}" data-view="lib:${L.esc(l.id)}" title="${L.esc(l.payload.name)}"><i class="library-dot dot-${l.payload.color}"></i><span>${L.esc(l.payload.name)}</span>${n?`<em>${n}</em>`:''}</button>`; }).join('');
    document.querySelectorAll('.nav-item[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === view));
    document.querySelectorAll('.toolbar [data-type]').forEach(b => b.classList.toggle('active', b.dataset.type === type));
    const labels={Prompt:'Prompt',Idea:'想法',Reference:'资料',Todo:'待办',Snippet:'片段',Workflow:'工作流'};
    const names={all:'最近记录',review:'每日回顾',inbox:'待整理',today:'今天的记录',favorites:'我的收藏',archived:'已归档'};
    const scopeName=names[view]||libs.find(l=>'lib:'+l.id===view)?.payload.name||'资料库';
    const title=search?'搜索结果':type==='Workflow'?'工作流':scopeName;
    $('#viewTitle').textContent=title;$('#dockTitle').textContent=title;
    document.querySelectorAll('.sidebar .nav-item[data-type]').forEach(b=>b.classList.toggle('active',b.dataset.type===type));
    document.querySelectorAll('.sidebar .nav-item[data-act=review]').forEach(b=>b.classList.toggle('active',view==='review'));
    document.querySelector('.sidebar [data-view=all]').classList.toggle('active',view==='all'&&type==='all');
    const filters=W.filters(), chips=[];
    if(search)chips.push(['search','关键词：'+search]);
    if(tag)chips.push(['tag','#'+tag]);
    if(type!=='all')chips.push(['type','类型：'+(labels[type]||type)]);
    if(filters.library)chips.push(['extra','资料库：'+(libs.find(l=>l.id===filters.library)?.payload.name||'未分类')]);
    if(filters.from||filters.to)chips.push(['extra','日期：'+(filters.from||'不限')+' – '+(filters.to||'不限')]);
    const arr=filtered(), narrowed=chips.length>0;
    $('#viewSubtitle').textContent=(search?'范围：'+(view==='all'?'全部资料库':scopeName)+' · ':'')+(arr.length?arr.length+' 条记录'+(arr.length>displayLimit?' · 显示最近 '+displayLimit+' 条':''):narrowed?'没有匹配记录':'');
    $('#viewSubtitle').hidden=!arr.length&&!narrowed;
    $('#dockPreview').textContent=arr.length?arr.length+' 条 · '+arr[0].payload.title:narrowed?'没有匹配记录 · 展开调整筛选':'写下第一条记录';
    $('#tagFilter').innerHTML=chips.map(([key,label])=>'<button class="filter-tag" data-act="clearfilter" data-filter="'+key+'" aria-label="清除 '+L.esc(label)+'">'+L.esc(label)+' ×</button>').join('')+(narrowed?'<button class="filter-tag" data-act="resetsearch">重置全部筛选</button>':'');
    $('#noteGrid').innerHTML=arr.length?arr.slice(0,displayLimit).map(r=>W.card(r,libs.find(l=>l.id===r.payload.libraryId)?.payload.name||'未分类',search)).join('')+(arr.length>displayLimit&&displayLimit>3?'<button class="record-more" data-act="more">再显示 50 条 · 共 '+arr.length+' 条</button>':''):'<div class="empty"><strong>'+(narrowed?'暂时没有匹配的记录':view==='review'?'今日回顾已完成或暂无旧记录':'还没有记录。好想法，从第一张便签开始。')+'</strong><button class="primary" data-act="'+(narrowed?'resetsearch':view==='review'?'reviewsettings':'focus')+'">'+(narrowed?'清除筛选':view==='review'?'调整回顾设置':'记录一个想法')+'</button></div>';
    $('#todayDate').textContent = new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' });
    const allTodos = active.filter(r => r.payload.type === 'Todo'), completed = allTodos.filter(r => r.payload.done).length;
    $('#todayCount').textContent = allTodos.length ? `${completed}/${allTodos.length}` : ''; $('#todayCount').hidden=!allTodos.length;
    $('.today-panel').classList.toggle('is-empty',!allTodos.length);
    const progress = allTodos.length ? Math.round(completed / allTodos.length * 100) : 0;
    $('#taskProgress').setAttribute('aria-valuenow', progress);
    $('#taskProgress span').style.width = progress + '%';
    const todos = active.filter(r => r.payload.type === 'Todo').sort((a,b) => Number(a.payload.done) - Number(b.payload.done)).slice(0, 5);
    $('#todayTasks').innerHTML = todos.map(r => `<div class="task ${r.payload.done ? 'done' : ''}"><button data-note-act="done" data-id="${L.esc(r.id)}" aria-label="${r.payload.done ? '标记未完成' : '标记完成'}">${r.payload.done ? '✓' : ''}</button><span>${L.esc(r.payload.title)}</span></div>`).join('');
  }
  function queueRender() { clearTimeout(renderTimer); renderTimer = setTimeout(() => void render().catch(e => toast(e.message)), 50); }
  async function openEditor(record) {
    W.close();
    editor?.dispose(); const dialog = $('#editorDialog');
    editor = await window.WhaleXComposer.mount($('#editorRoot'), { record, onSaved: () => { dialog.close(); queueRender(); }, onClose: () => dialog.close(), onFloat:async (row,draft)=>{if(await float(row,draft))dialog.close();} });
    dialog.showModal(); editor.focus();
  }
  function updateFloatLabel(){
    const active=pip&&!pip.closed||popupWindow&&!popupWindow.closed;
    const label=active?'返回浮窗':window.__TAURI__||window.documentPictureInPicture?'悬浮便签':'独立便签';
    $('#floatTrigger span').textContent=label;
    $('#floatTrigger').title=window.__TAURI__?'打开桌面置顶便签':window.documentPictureInPicture?'置顶画中画；请保持工作台页面打开':'当前浏览器使用独立窗口，不能保证置顶';
  }
  async function float(record = null, handoff = null) {
    let copied=false, kept=false;
    const copyDraft=slot=>{
      if(!handoff)return;
      const key='whalex_draft_v2:'+S.scope()+':'+slot+':'+(record?.id||'new');
      const old=S.readJSON(key);
      if(old&&(old.content?.trim()||old.title?.trim())&&JSON.stringify(old)!==JSON.stringify(handoff)){kept=true;return;}
      localStorage.setItem(key,JSON.stringify(handoff));copied=true;
    };
    const done=()=>{window.WhaleXFrame?.hide(false);updateFloatLabel();if(kept)toast('浮窗已有草稿，已为你保留；当前草稿仍在工作台。');else if(copied)toast('草稿已复制到浮窗，工作台草稿仍保留。');return true;};
    try{
      if(window.__TAURI__){copyDraft('capture');await window.__TAURI__.core.invoke(record?'open_sticky':'show_capture',record?{id:record.id}:{});return done();}
      if(!window.documentPictureInPicture){
        copyDraft('capture');
        popupWindow=window.open('./capture.html'+(record?'?id='+encodeURIComponent(record.id):''),'WhaleXNote','width=440,height=620');
        if(!popupWindow){toast('窗口被拦截。请允许本站弹窗后重试；草稿仍保留在本机。');return false;}
        popupWindow.focus();return done();
      }
      if(pip&&!pip.closed&&pipRecordId===(record?.id||'new')){copyDraft('floating');if(!copied){pip.focus();return done();}}
      // Keep the request within the user gesture, before mounting the composer.
      const request=pip&&!pip.closed?Promise.resolve(pip):window.documentPictureInPicture.requestWindow({width:420,height:600});
      copyDraft('floating');pip=await request;floatingComposer?.dispose();
      pip.document.head.innerHTML='';
      for(const path of ['./styles.css','./workspace.css','./refinement.css?v=20260930-glass','./frame.css?v=20261001-workbench-v4','./capture.css?v=20261001-workbench-v4']){const link=pip.document.createElement('link');link.rel='stylesheet';link.href=new URL(path,location.href).href;pip.document.head.appendChild(link);}
      pip.document.title='WhaleX · 悬浮输入';pip.document.body.className='capture-page workbench';pip.document.body.innerHTML='<div id="captureRoot"></div>';
      const thisPip=pip;pipRecordId=record?.id||'new';
      floatingComposer=await window.WhaleXComposer.mount(pip.document.querySelector('#captureRoot'),{record,draftSlot:'floating',onClose:()=>thisPip.close()});
      thisPip.addEventListener('pagehide',()=>{if(pip===thisPip){floatingComposer?.dispose();floatingComposer=null;pip=null;updateFloatLabel();}},{once:true});
      floatingComposer.focus();pip.focus();return done();
    }catch(e){toast('浮窗未能打开：'+e.message+'。草稿仍保留在本机。');return false;}
  }
  function settings() {
    const c = S.config(); $('#cloudUrl').value = c?.url || ''; $('#cloudKey').value = c?.key || '';
    $('#cloudAdvanced').open=!c?.url; updateAccountUI(); W.fillConnections(); if(!$('#settingsDialog').open)$('#settingsDialog').showModal();
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
      if (await W.handle(btn)) return;
      if(btn.dataset.act==='clearfilter'||btn.dataset.act==='resetsearch'){const key=btn.dataset.filter;if(!key||key==='search'){search='';$('#searchInput').value='';}if(!key||key==='tag')tag='';if(!key||key==='type')type='all';if(!key||key==='extra')W.clearFilters();if(!key)view='all';displayLimit=50;await render();browse();return;}
      if (btn.dataset.act === 'undocapture' && undoCapture) { const old=undoCapture; undoCapture=null; if(old.scope!==S.scope()) return toast('账号已切换，撤销已取消'); const row=await S.get(old.id); if(!row||row.deleted||row.changeId!==old.changeId)return toast('记录已发生后续修改，保留当前记录'); if(!composer?.restoreDraft(row.payload))return toast('已有新草稿，原记录仍保留');await S.remove(old.id); toast('已撤销保存，内容已回到便签草稿'); return; }
      if ('view' in btn.dataset) { W.close();W.clearFilters(); if(btn.dataset.view==='all'){search='';$('#searchInput').value='';const nav=document.querySelector('.sidebar>nav');if(nav)nav.scrollTop=0;window.scrollTo({top:0,behavior:scrollBehavior()});}displayLimit=3; view = btn.dataset.view; tag = ''; type = btn.dataset.collectionType || 'all'; await render(); browse(); return; }
      if ('type' in btn.dataset) { W.close(); type = btn.dataset.type; await render(); if (btn.classList.contains('feature') || btn.classList.contains('nav-item')) browse(); return; }
      if ('tag' in btn.dataset) { W.close(); tag = btn.dataset.tag; await render(); return; }
      if (btn.dataset.export) return await exportView(btn.dataset.export);
      const act = btn.dataset.act;
      if (act === 'libraries') { view = 'all'; type = 'all'; tag = ''; await render(); browse(); }
      if (act === 'browse' || act === 'more') { displayLimit=Math.max(50,displayLimit+50); await render(); if(act==='browse')browse(); }
      if (act === 'suggest') { openCapture(); composer?.suggest(); }
      if (act === 'newtask') { composer?.setType('Todo'); openCapture(); }
      if (act === 'capture' || act === 'focus') openCapture();
      if (act === 'floatcapture') return await float();
      if (act === 'settings') { W.close();settings(); }
      if (act === 'export') { W.close();$('#exportDialog').showModal(); }
      if (act === 'newlib') { $('#libraryDialog').showModal(); $('#libraryName').focus(); }
      if (act === 'tags') { $('#tagFilter').scrollIntoView({ behavior: scrollBehavior(), block: 'center' }); if (!$('#tagFilter').children.length) toast('为记录添加标签后，即可在这里筛选'); }
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
  $('#searchInput').addEventListener('input', e => { search = e.target.value.trim(); displayLimit=50; browse();queueRender(); });
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); $('#searchInput').focus(); }
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !e.defaultPrevented && !document.querySelector('dialog[open]')) { e.preventDefault(); openCapture(); }
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
    try { W.reset(); undoCapture=null; view='all';type='all';tag='';search='';$('#searchInput').value='';pip?.close(); editor?.dispose(); $('#editorDialog').close(); composer?.dispose(); await S.defaults(); composer = await window.WhaleXComposer.mount($('#inlineComposer'),{onSaved:captureSaved,onClose:closeCapture,onFloat:float}); updateAccountUI(); await render(); } catch(e) { toast(e.message); }
  });
  window.addEventListener('focus',()=>{queueRender();updateFloatLabel();});
  const bridge={refresh:queueRender,toast,settings,editor:openEditor,float,download,selection:()=>({view,type,tag,search}),select:async options=>{view=options.view??view;type=options.type??type;tag=options.tag??tag;search=options.search??search;$('#searchInput').value=search;displayLimit=view==='review'?10:3;await render();browse();}};
  window.WhaleXApp=bridge; W.init(bridge);
  (async () => {
    renderIcons();updateFloatLabel(); const warning = await S.ready;
    if (warning) { $('#migrationNotice').hidden = false; $('#migrationNotice').textContent = warning; }
    composer = await window.WhaleXComposer.mount($('#inlineComposer'),{onSaved:captureSaved,onClose:closeCapture,onFloat:float}); await render(); C.start();
  })().catch(e => toast('启动失败：' + e.message));
})();
