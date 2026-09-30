(function () {
  'use strict';
  const S = window.WhaleXStore, L = window.WhaleXLogic;
  async function mount(host, { record = null, onSaved = () => {}, onClose = null, onFloat = null, draftSlot = 'main' } = {}) {
    await S.ready;
    const activeScope = S.scope();
    let current = record, chosenTags = [], saving = false, disposed = false, receipt=null;
    const draftKey = 'whalex_draft_v2:' + activeScope + ':' + draftSlot + ':' + (record?.id || 'new');
    const lastKey = 'whalex_last_library_v2:' + activeScope;
    const draft = S.readJSON(draftKey);
    const initial = draft || record?.payload || { content: '', title: '', type: 'Prompt', libraryId: localStorage.getItem(lastKey) || 'lib-inbox', tags: [] };
    const suggestionId = 'capture-tags-' + L.uuid();
    const expected = draft?.expected || record?.changeId;
    if (draft && current && expected) current = { ...current, changeId: expected };
    chosenTags = L.tags(initial.tags);
    host.innerHTML = `<section class="sticky-paper">
      <header class="paper-head" data-tauri-drag-region><span class="paper-brand" data-tauri-drag-region>✦ ${record ? '编辑提示词' : '记录你的想法'}</span>
        <div class="paper-controls">${onFloat ? '<button type="button" class="paper-popout" data-action="popout" title="将当前草稿复制到浮窗，原草稿保留">浮窗 ↗</button>' : window.__TAURI__ ? '<button type="button" data-action="pin" title="切换窗口置顶" aria-label="切换窗口置顶" aria-pressed="false">⌃</button>' : ''}<button type="button" data-action="close" title="收起便签，保留草稿" aria-label="收起便签">×</button></div></header>
      <form class="capture-form">
        <textarea name="content" class="paper-content" maxlength="200000" placeholder="输入提示词、想法或笔记…" aria-label="提示词内容" required></textarea>
        <div class="paper-under"><span data-draft>草稿自动保留在本机</span><span data-count hidden></span></div>
        <div class="paper-destination" data-destination></div>
        <details class="capture-details" ${record ? 'open' : ''}><summary>标签与归属 <small>可稍后整理</small></summary>
        <input class="paper-title" name="title" maxlength="160" placeholder="标题（可留空）" aria-label="标题">
        <div class="field-head"><label>保存到资料库</label><button type="button" class="paper-link" data-action="newlib">＋ 新建库</button></div>
        <div class="paper-selects"><select name="libraryId" aria-label="资料库"></select><select name="type" aria-label="内容类型">${L.TYPES.map(t => `<option>${t}</option>`).join('')}</select></div>
        <div class="inline-library" hidden><input name="newlib" maxlength="60" placeholder="新资料库名称" aria-label="新资料库名称"><button type="button" data-action="createlib">创建</button></div>
        <label class="paper-label">标签 <small>按回车或逗号添加</small></label>
        <div class="tag-editor"><div data-tags></div><input name="tag" maxlength="200" placeholder="＋ 标签/子标签" aria-label="添加标签" list="${suggestionId}"></div><datalist id="${suggestionId}"></datalist></details>
        <div class="paper-message" role="status" aria-live="polite">${draft ? '已恢复上次未保存的草稿' : ''}</div>
        <footer class="paper-actions"><button type="button" class="paper-suggest" data-action="suggest">归档建议</button><button type="submit" class="paper-save">${record ? '保存修改' : '保存记录'}</button></footer>
        <div class="paper-shortcut">Ctrl / ⌘ + Enter 保存</div>
      </form></section>`;
    const form = host.querySelector('form'), field = name => form.elements.namedItem(name);
    const message = text => { host.querySelector('.paper-message').textContent = text; };
    const renderCount = () => { const n=field('content').value.length, el=host.querySelector('[data-count]'); el.textContent=n?n.toLocaleString()+' 字':'';el.hidden=!n; };
    const renderDestination=()=>{host.querySelector('[data-destination]').textContent='保存到：'+(field('libraryId').selectedOptions[0]?.text||'未分类')+' · '+({Idea:'想法',Reference:'资料',Todo:'待办',Snippet:'片段',Workflow:'工作流'}[field('type').value]||field('type').value);};
    for (const name of ['title', 'content', 'type']) field(name).value = initial[name] || (name === 'type' ? 'Prompt' : '');
    async function refreshLibraries() {
      const selected = field('libraryId').value || initial.libraryId;
      const allRows = await S.all(), libs = allRows.filter(x => x.kind === 'library' && !x.deleted);
      if (disposed) return;
      field('libraryId').innerHTML = '<option value="lib-inbox">未分类 · 稍后整理</option>' + libs.map(l => `<option value="${L.esc(l.id)}">${L.esc(l.payload.name)}</option>`).join('');
      if (selected === 'lib-inbox' || libs.some(l => l.id === selected)) field('libraryId').value = selected;
      host.querySelector('datalist').innerHTML = [...new Set(allRows.filter(r=>r.kind==='note'&&!r.deleted).flatMap(r=>r.payload.tags))].sort().map(t=>`<option value="#${L.esc(t)}"></option>`).join('');
      renderDestination();
    }
    await refreshLibraries();
    function renderTags() {
      host.querySelector('[data-tags]').innerHTML = chosenTags.map((t, i) => `<button type="button" class="tag-chip" data-tag-index="${i}" aria-label="移除标签 ${L.esc(t)}"># ${L.esc(t)} <span>×</span></button>`).join('');
    }
    function addTags() { chosenTags = L.tags([...chosenTags, ...L.tags(field('tag').value)]); field('tag').value = ''; renderTags(); persist(); }
    function values() { return { ...current?.payload, title: field('title').value, content: field('content').value, type: field('type').value, libraryId: field('libraryId').value, tags: L.tags([...chosenTags, ...L.tags(field('tag').value)]) }; }
    function persist() {
      receipt=null;renderCount();renderDestination();message('');
      try { localStorage.setItem(draftKey, JSON.stringify({ ...values(), expected: current?.changeId })); host.querySelector('[data-draft]').textContent = '草稿已保留在本机'; }
      catch { host.querySelector('[data-draft]').textContent = '草稿暂存失败，请及时保存'; }
    }
    form.addEventListener('input', persist); form.addEventListener('change', persist);
    field('tag').addEventListener('keydown', e => { if (['Enter', ',', '，'].includes(e.key)) { e.preventDefault(); addTags(); } });
    form.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); form.requestSubmit(); } });
    const clickHandler = async e => {
      const tag = e.target.closest('[data-tag-index]');
      if (tag) { chosenTags.splice(Number(tag.dataset.tagIndex), 1); renderTags(); persist(); return; }
      const action = e.target.closest('[data-action]')?.dataset.action;
      try {
        if (action === 'suggest') {
          host.querySelector('.capture-details').open = true;
          const id = L.suggest(field('title').value + ' ' + field('content').value);
          if ([...field('libraryId').options].some(o => o.value === id)) field('libraryId').value = id;
          persist();message('建议归入 ' + field('libraryId').selectedOptions[0].text + '，可手动调整');
        }
        if (action === 'newlib') { host.querySelector('.inline-library').hidden = !host.querySelector('.inline-library').hidden; field('newlib').focus(); }
        if (action === 'createlib') {
          const name = field('newlib').value.trim(); if (!name) return;
          const libs = (await S.all()).filter(r => r.kind === 'library' && !r.deleted);
          const lib = libs.find(r => r.payload.name === name) || await S.put('library', { name });
          await refreshLibraries(); field('libraryId').value = lib.id; host.querySelector('.inline-library').hidden = true; field('newlib').value = ''; persist();
        }
        if (action === 'close') { persist(); if (onClose) onClose(); else message('草稿已保留，可继续输入或打开浮窗'); }
        if (action === 'popout' && onFloat) { persist();await onFloat(current,{...values(),expected:current?.changeId}); }
        if (action === 'pin') {
          if (window.__TAURI__ && document.body.classList.contains('capture-page')) {
            const win = window.__TAURI__.window.getCurrentWindow(); const pinned = await win.isAlwaysOnTop(); await win.setAlwaysOnTop(!pinned);host.querySelector('[data-action=pin]').setAttribute('aria-pressed',String(!pinned)); message(pinned ? '已取消窗口置顶' : '窗口已置顶于普通应用之上');
          } else message('桌面版支持切换置顶；网页请点击“悬浮便签”打开画中画窗口');
        }
      } catch (error) { message(error.message); }
    };
    host.addEventListener('click', clickHandler);
    form.addEventListener('submit', async e => {
      e.preventDefault(); if (saving) return;
      if (S.scope() !== activeScope) return message('账号已切换，请重新打开便签');
      if (!field('content').value.trim()) return message('请先输入提示词内容');
      saving = true; const btn = form.querySelector('[type=submit]'), label=btn.textContent; btn.disabled = true;btn.textContent='保存中…';form.setAttribute('aria-busy','true');
      try {
        const row = await S.put('note', values(), { ...(current ? { id: current.id, expected: current.changeId } : {}) });
        localStorage.setItem(lastKey, field('libraryId').value); localStorage.removeItem(draftKey);
        const libName = field('libraryId').selectedOptions[0]?.text || '资料库';
        receipt={id:row.id,scope:S.scope(),library:libName};
        if (current) current = row;
        else { field('content').value = ''; field('title').value = ''; field('tag').value = ''; chosenTags = []; renderTags(); }
        renderCount();
        host.querySelector('[data-draft]').textContent = '记录已保存到本机';
        message('已保存到 ' + libName + (S.session() ? ' · 等待自动同步' : ' · 仅本机'));
        onSaved(row); field('content').focus();
      } catch (error) { message('保存失败：' + error.message); }
      finally { saving = false; btn.disabled = false;btn.textContent=label;form.removeAttribute('aria-busy'); }
    });
    renderTags(); renderCount();renderDestination();
    if(window.__TAURI__&&host.querySelector('[data-action=pin]')){
      try{host.querySelector('[data-action=pin]').setAttribute('aria-pressed',String(await window.__TAURI__.window.getCurrentWindow().isAlwaysOnTop()));}catch{/* Native capability may be unavailable in test hosts. */}
    }
    const changed = () => void refreshLibraries(); window.addEventListener('whalex-change', changed);
    const syncReceipt=async e=>{const saved=receipt;if(!saved||disposed||saved.scope!==S.scope())return;let row;try{row=await S.get(saved.id);}catch{return;}if(receipt!==saved||disposed||saved.scope!==S.scope())return;if(e.detail.mode==='synced'&&row&&!row.dirty)message('已保存到 '+saved.library+' · 云端同步已确认');else if(e.detail.mode==='error'||e.detail.mode==='offline')message('已保存到本机 · 云端暂未确认，请查看同步状态');};
    window.addEventListener('whalex-sync',syncReceipt);
    return { focus: () => field('content').focus(), restoreDraft: payload => { if(field('content').value.trim())return false;for(const name of ['title','content','type','libraryId'])field(name).value=payload[name];chosenTags=L.tags(payload.tags);renderTags();persist();field('content').focus();return true; }, setType: type => { if (L.TYPES.includes(type)) { field('type').value = type; persist(); field('content').focus(); } }, suggest: () => host.querySelector('[data-action="suggest"]').click(), dispose: () => { disposed = true; host.removeEventListener('click', clickHandler); window.removeEventListener('whalex-change', changed);window.removeEventListener('whalex-sync',syncReceipt); }, persist };
  }
  window.WhaleXComposer = { mount };
})();
