(async function(){
  const $=id=>document.getElementById(id);
  const invoke=(cmd,args={})=>window.__TAURI__?.core?.invoke(cmd,args);
  let notes=[],libraries=[],currentView='all',currentType='all',query='',currentId=null,saveTimer=null;
  const toast=msg=>{const t=$('toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),1500)};
  const esc=s=>String(s??'').replace(/[&<>'"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[m]));
  const today=iso=>new Date(iso).toDateString()===new Date().toDateString();
  const tagsOf=n=>Array.isArray(n.tags)?n.tags:[];

  await WhaleXDB.initDb();
  async function reload(){
    [notes,libraries]=await Promise.all([WhaleXDB.listNotes(),WhaleXDB.listLibraries()]);
    render();
  }
  function visible(){
    let a=[...notes];
    if(currentView==='today')a=a.filter(n=>today(n.created_at)&&!n.archived);
    else if(currentView==='favorites')a=a.filter(n=>n.favorite&&!n.archived);
    else if(currentView==='archive')a=a.filter(n=>n.archived);
    else if(currentView.startsWith('lib:'))a=a.filter(n=>n.library===currentView.slice(4)&&!n.archived);
    else if(currentView.startsWith('tag:'))a=a.filter(n=>tagsOf(n).includes(currentView.slice(4))&&!n.archived);
    else a=a.filter(n=>!n.archived);
    if(currentType!=='all')a=a.filter(n=>n.type===currentType);
    if(query){const q=query.toLowerCase();a=a.filter(n=>[n.title,n.content,n.library,n.type,...tagsOf(n)].join(' ').toLowerCase().includes(q));}
    return a;
  }
  function renderRail(){
    $('countAll').textContent=notes.filter(n=>!n.archived).length;
    $('countToday').textContent=notes.filter(n=>today(n.created_at)&&!n.archived).length;
    $('countFav').textContent=notes.filter(n=>n.favorite&&!n.archived).length;
    $('countArchive').textContent=notes.filter(n=>n.archived).length;
    $('libraryNav').innerHTML=libraries.map(l=>`<button class="rail-item" data-lib="${esc(l.name)}"><span><i class="lib-dot" style="color:${l.color==='violet'?'#936dff':l.color==='teal'?'#2ff4d1':l.color==='amber'?'#ffba64':'#62e8ff'}"></i>${esc(l.name)}</span><i>${notes.filter(n=>n.library===l.name&&!n.archived).length}</i></button>`).join('');
    const tc={};notes.filter(n=>!n.archived).forEach(n=>tagsOf(n).forEach(t=>tc[t]=(tc[t]||0)+1));
    $('tagNav').innerHTML=Object.entries(tc).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([t,c])=>`<button class="rail-item" data-tag="${esc(t)}"><span># ${esc(t)}</span><i>${c}</i></button>`).join('');
    document.querySelectorAll('[data-lib]').forEach(b=>b.onclick=()=>{currentView='lib:'+b.dataset.lib;render()});
    document.querySelectorAll('[data-tag]').forEach(b=>b.onclick=()=>{currentView='tag:'+b.dataset.tag;render()});
    document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',currentView===b.dataset.view));
  }
  function renderStage(){
    let title='让想法自己流动起来。',sub='捕捉 · 连接 · 整理 · 复用。不是另一套死板笔记，而是你的个人 Prompt / Idea 中枢。';
    if(currentView==='today'){title='今天的信号。';sub='把今天捕捉的想法继续推进，而不是让它们沉下去。'}
    else if(currentView==='favorites'){title='高信号内容。';sub='你主动留下的高价值 Prompt、Idea 与 Workflow。'}
    else if(currentView==='archive'){title='已归档，但没有消失。';sub='所有历史记录仍可搜索、恢复和导出。'}
    else if(currentView.startsWith('lib:')){title=currentView.slice(4);sub='当前资料库 · 内容按最近修改动态排列。'}
    else if(currentView.startsWith('tag:')){title='#'+currentView.slice(4);sub='跨资料库聚合的标签视图。'}
    $('stageTitle').textContent=title;$('stageSub').textContent=sub;
    const t=notes.filter(n=>today(n.created_at)&&!n.archived).slice(0,4);$('todayProgress').textContent=`${t.length}/${Math.max(t.length,3)}`;
    $('todayMini').innerHTML=t.map(n=>`<div class="mini-row"><span class="mini-check"></span><span>${esc(n.title)}</span></div>`).join('')||'<div class="mini-row">今天还没有记录</div>';
  }
  function renderFlow(){
    const a=visible();
    $('flowTitle').textContent=currentView.startsWith('lib:')?currentView.slice(4):currentView.startsWith('tag:')?'#'+currentView.slice(4):currentView==='archive'?'归档内容':'最近捕捉';
    $('noteFlow').innerHTML=a.length?a.map(n=>`<article class="note-card" data-note="${n.id}"><span class="type">${esc(n.type)}</span><h3>${esc(n.title)}</h3><p>${esc(n.content)}</p><div class="note-meta">${tagsOf(n).slice(0,2).map(t=>`<span>#${esc(t)}</span>`).join('')}<i>${n.sticky?'▣ 置顶':'· '+new Date(n.updated_at).toLocaleDateString()}</i></div></article>`).join(''):'<div style="color:#617594;padding:30px">这里还没有内容。</div>';
    document.querySelectorAll('[data-note]').forEach(c=>c.onclick=()=>openInspector(c.dataset.note));
  }
  function render(){renderRail();renderStage();renderFlow()}
  async function openInspector(id){
    currentId=id;const n=notes.find(x=>x.id===id);if(!n)return;
    $('editLibrary').innerHTML=libraries.map(l=>`<option>${esc(l.name)}</option>`).join('');
    $('editTitle').value=n.title;$('editContent').value=n.content;$('editLibrary').value=n.library;$('editType').value=n.type;$('editTags').value=tagsOf(n).map(t=>'#'+t).join(' ');
    $('inspectorPath').textContent=`${n.library} · ${n.type}`;$('favoriteBtn').textContent=n.favorite?'★ 已收藏':'☆ 收藏';$('archiveBtn').textContent=n.archived?'取消归档':'归档';$('pinBtn').textContent=n.sticky?(n.minimized?'恢复置顶便签':'取消桌面便签'):'固定为置顶便签';$('inspector').classList.add('open');
  }
  async function saveInspector(){
    if(!currentId)return;const patch={title:$('editTitle').value,content:$('editContent').value,library:$('editLibrary').value,type:$('editType').value,tags:$('editTags').value.split(/[\s,]+/).map(x=>x.replace(/^#/,'')).filter(Boolean)};
    await WhaleXDB.updateNote(currentId,patch);await WhaleXDB.notify();await reload();$('inspectorPath').textContent=`${patch.library} · ${patch.type}`;
  }
  ['editTitle','editContent','editLibrary','editType','editTags'].forEach(id=>$(id).addEventListener('input',()=>{clearTimeout(saveTimer);saveTimer=setTimeout(saveInspector,260)}));
  $('closeInspector').onclick=()=>$('inspector').classList.remove('open');
  $('favoriteBtn').onclick=async()=>{const n=notes.find(x=>x.id===currentId);if(!n)return;await WhaleXDB.updateNote(n.id,{favorite:!n.favorite});await WhaleXDB.notify();await reload();openInspector(n.id)};
  $('archiveBtn').onclick=async()=>{const n=notes.find(x=>x.id===currentId);if(!n)return;await WhaleXDB.updateNote(n.id,{archived:!n.archived});await WhaleXDB.notify();$('inspector').classList.remove('open');await reload()};
  $('pinBtn').onclick=async()=>{const n=notes.find(x=>x.id===currentId);if(!n)return;if(n.sticky&&n.minimized){await WhaleXDB.updateNote(n.id,{minimized:false});await invoke('open_sticky',{id:n.id});}else if(n.sticky){await WhaleXDB.updateNote(n.id,{sticky:false,minimized:false});await invoke('close_sticky',{id:n.id});}else{await WhaleXDB.updateNote(n.id,{sticky:true,minimized:false});await invoke('open_sticky',{id:n.id});}await WhaleXDB.notify();await reload();openInspector(n.id)};

  $('captureBtn').onclick=()=>invoke('show_capture');$('newStickyBtn').onclick=()=>invoke('show_capture');$('stickyHubBtn').onclick=()=>{const n=notes.find(x=>x.sticky&&!x.archived);if(n)invoke('open_sticky',{id:n.id});else invoke('show_capture')};
  document.querySelectorAll('.node').forEach(b=>b.onclick=()=>{const a=b.dataset.action;if(a==='capture')invoke('show_capture');else if(a==='export')doExport();else if(a==='library'){currentView='all';document.querySelector('.rail-section:nth-of-type(2)')?.scrollIntoView({behavior:'smooth'})}else if(a==='tags')toast('标签会跨库聚合内容');else if(a==='workflow'){currentType='Workflow';renderFlow()}else toast('智能归档建议：下一阶段接入 AI 分类器')});
  $('inlineSave').onclick=async()=>{const v=$('inlineCapture').value.trim();if(!v)return;await WhaleXDB.createNote({title:v.length>28?v.slice(0,28)+'…':v,content:v,library:'Random',type:'Idea',tags:['Inbox']});$('inlineCapture').value='';await WhaleXDB.notify();await reload();toast('已快速保存到 Random')};
  $('inlineCapture').addEventListener('keydown',e=>{if(e.key==='Enter')$('inlineSave').click()});
  $('search').oninput=e=>{query=e.target.value.trim();renderFlow()};
  document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{currentView=b.dataset.view;render()});
  document.querySelectorAll('.filters button').forEach(b=>b.onclick=()=>{currentType=b.dataset.type;document.querySelectorAll('.filters button').forEach(x=>x.classList.toggle('active',x===b));renderFlow()});
  async function doExport(){const a=visible();const grouped={};a.forEach(n=>(grouped[n.library]??=[]).push(n));let text=`WhaleX Export\n${new Date().toLocaleString()}\n\n`;for(const [lib,items] of Object.entries(grouped)){text+=`# ${lib}\n\n`;for(const n of items){text+=`${n.title}\n${n.type} · ${new Date(n.created_at).toLocaleDateString()}\n${tagsOf(n).map(t=>'#'+t).join(' ')}\n\n${n.content}\n\n---\n\n`}}const path=await invoke('export_text',{filename:`WhaleX-${new Date().toISOString().slice(0,10)}.txt`,content:text});toast('已导出：'+path)}
  $('exportBtn').onclick=doExport;
  document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();$('search').focus()}if(e.key==='Escape')$('inspector').classList.remove('open')});
  if(window.__TAURI__?.event){window.__TAURI__.event.listen('notes-changed',reload)}
  await reload();
  for(const n of notes.filter(x=>x.sticky&&!x.archived&&!x.minimized)){invoke('open_sticky',{id:n.id})}
})();
