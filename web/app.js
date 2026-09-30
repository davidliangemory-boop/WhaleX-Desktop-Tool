
const STORAGE_KEY='whalex_web_notes_v1';
const LIB_KEY='whalex_web_libs_v1';
const LANG_KEY='whalex_web_lang_v1';

const defaultLibs=[
  {name:'AI / Agent',color:'#63e8ff'},
  {name:'Prompt Vault',color:'#916eff'},
  {name:'Legal',color:'#2ff0d0'},
  {name:'Work',color:'#ffb15f'}
];

const seed=[
  {id:crypto.randomUUID(),title:'Privacy Agent — 多 Agent 架构',content:'把检索、路由、核验、输出拆成不同 agent；主控 agent 只负责调度与质量控制。',library:'AI / Agent',type:'Prompt',tags:['Agent','Privacy'],created:new Date().toISOString(),updated:new Date().toISOString(),favorite:true,pinned:true},
  {id:crypto.randomUUID(),title:'WhaleX 导出体系',content:'按日期、资料库、类型导出 TXT / Word / Markdown / JSON。',library:'Prompt Vault',type:'Idea',tags:['Export','WhaleX'],created:new Date(Date.now()-86400000).toISOString(),updated:new Date(Date.now()-86400000).toISOString(),favorite:false,pinned:false},
  {id:crypto.randomUUID(),title:'合同审阅结构 Prompt',content:'固定输出：核心商业决策是否落实、条款冲突点、法律风险、最小化修改建议。',library:'Legal',type:'Prompt',tags:['Contract','Review'],created:new Date(Date.now()-2*86400000).toISOString(),updated:new Date(Date.now()-2*86400000).toISOString(),favorite:false,pinned:false}
];

let libraries=JSON.parse(localStorage.getItem(LIB_KEY)||'null')||defaultLibs;
let notes=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null')||seed;
let view='all', typeFilter='all', query='', currentId=null, pipWindow=null;
let lang=localStorage.getItem(LANG_KEY)||'zh';

const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
function save(){localStorage.setItem(STORAGE_KEY,JSON.stringify(notes));localStorage.setItem(LIB_KEY,JSON.stringify(libraries))}
save();

function esc(s=''){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}
function today(iso){return new Date(iso).toDateString()===new Date().toDateString()}
function fmt(iso){return new Date(iso).toLocaleString(lang==='zh'?'zh-CN':'en-US',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}

function filtered(){
  let a=[...notes];
  if(view==='today')a=a.filter(n=>today(n.created));
  if(view==='pinned')a=a.filter(n=>n.pinned);
  if(view==='favorites')a=a.filter(n=>n.favorite);
  if(view.startsWith('lib:'))a=a.filter(n=>n.library===view.slice(4));
  if(view.startsWith('tag:'))a=a.filter(n=>(n.tags||[]).includes(view.slice(4)));
  if(typeFilter!=='all')a=a.filter(n=>n.type===typeFilter);
  if(query.trim()){
    const q=query.toLowerCase();
    a=a.filter(n=>[n.title,n.content,n.library,n.type,...(n.tags||[])].join(' ').toLowerCase().includes(q));
  }
  return a.sort((a,b)=>new Date(b.updated)-new Date(a.updated));
}

function routeSuggestion(text){
  const t=text.toLowerCase();
  if(/contract|agreement|clause|legal|法律|合同|条款|仲裁|privacy|gdpr|合规/.test(t))return 'Legal';
  if(/agent|ai|codex|prompt|workflow|mcp|模型|智能体/.test(t))return 'AI / Agent';
  if(/汇报|项目|会议|work|todo|任务|工作/.test(t))return 'Work';
  return 'Prompt Vault';
}

function renderNav(){
  $('#countAll').textContent=notes.length;
  $('#countToday').textContent=notes.filter(n=>today(n.created)).length;
  $('#countPinned').textContent=notes.filter(n=>n.pinned).length;
  $('#countFav').textContent=notes.filter(n=>n.favorite).length;
  $('#todayStat').textContent=notes.filter(n=>today(n.created)).length;
  $('#pinStat').textContent=notes.filter(n=>n.pinned).length;
  $('#libStat').textContent=libraries.length;

  $('#libraryNav').innerHTML=libraries.map(l=>{
    const c=notes.filter(n=>n.library===l.name).length;
    return '<button class="nav-item '+(view==='lib:'+l.name?'active':'')+'" data-lib="'+esc(l.name)+'"><span><i style="display:inline-block;width:8px;height:8px;border-radius:50%;background:'+l.color+'"></i></span><b>'+esc(l.name)+'</b><em>'+c+'</em></button>'
  }).join('');
  const counts={}; notes.forEach(n=>(n.tags||[]).forEach(t=>counts[t]=(counts[t]||0)+1));
  $('#tagNav').innerHTML=Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,7).map(([t,c])=>'<button class="nav-item '+(view==='tag:'+t?'active':'')+'" data-tag="'+esc(t)+'"><span>#</span><b>'+esc(t)+'</b><em>'+c+'</em></button>').join('');
  $$('[data-view]').forEach(b=>b.classList.toggle('active',view===b.dataset.view));
  $$('[data-lib]').forEach(b=>b.onclick=()=>{view='lib:'+b.dataset.lib;render()});
  $$('[data-tag]').forEach(b=>b.onclick=()=>{view='tag:'+b.dataset.tag;render()});
}

function renderNotes(){
  const arr=filtered();
  $('#noteFlow').innerHTML=arr.length?arr.map(n=>`
    <article class="note-card" data-note="${n.id}">
      <span class="type">${esc(n.type)}</span>
      <h3>${esc(n.title||'Untitled')}</h3>
      <p>${esc(n.content||'')}</p>
      <div class="note-meta">
        ${(n.tags||[]).slice(0,2).map(t=>'<span class="tag">#'+esc(t)+'</span>').join('')}
        ${n.pinned?'<span class="tag">⌃ 置顶</span>':''}
        <time>${fmt(n.updated)}</time>
      </div>
    </article>`).join(''):'<div style="grid-column:1/-1;color:#7f8ca7;padding:40px;text-align:center">当前视图没有内容。</div>';
  $$('[data-note]').forEach(c=>c.onclick=()=>openDrawer(c.dataset.note));
}

function render(){
  renderNav(); renderNotes();
  $('#smartRouteLabel').textContent=notes[0]?'最近归档：'+notes[0].library:'等待下一条记录';
}

function fillSelects(){
  const libOptions=libraries.map(l=>'<option>'+esc(l.name)+'</option>').join('');
  $('#captureLibrary').innerHTML=libOptions; $('#drawerLibrary').innerHTML=libOptions;
  const types=['Prompt','Idea','Workflow','Snippet','Reference','Todo'];
  $('#drawerType').innerHTML=types.map(t=>'<option>'+t+'</option>').join('');
}

function openCapture(){
  $('#captureModal').classList.add('show');
  $('#captureTitle').value='';$('#captureContent').value='';$('#captureTags').value='';$('#capturePinned').checked=false;
  $('#captureType').value='Prompt';$('#captureLibrary').value='Prompt Vault';
  $('#routeHint').textContent='WhaleX 会根据内容给出归库建议。';
  setTimeout(()=>$('#captureContent').focus(),30);
}
function closeCapture(){ $('#captureModal').classList.remove('show') }

$('#captureContent').addEventListener('input',e=>{
  const lib=routeSuggestion(e.target.value+' '+$('#captureTitle').value);
  $('#captureLibrary').value=lib;
  $('#routeHint').textContent='建议归库：'+lib+'（可手动修改）';
});
$('#captureTitle').addEventListener('input',()=>$('#captureContent').dispatchEvent(new Event('input')));

function saveCapture(){
  const content=$('#captureContent').value.trim();
  if(!content && !$('#captureTitle').value.trim())return toastMsg('请输入内容');
  const now=new Date().toISOString();
  const title=$('#captureTitle').value.trim()||content.split('\n')[0].slice(0,48)||'Untitled';
  const tags=$('#captureTags').value.split(/[\s,，]+/).map(x=>x.replace(/^#/,'').trim()).filter(Boolean);
  const n={id:crypto.randomUUID(),title,content,library:$('#captureLibrary').value,type:$('#captureType').value,tags,created:now,updated:now,favorite:false,pinned:$('#capturePinned').checked};
  notes.unshift(n);save();closeCapture();render();toastMsg('已保存到 '+n.library);
  if(n.pinned) openFloatingDesk();
}

function openDrawer(id){
  const n=notes.find(x=>x.id===id); if(!n)return;
  currentId=id;
  $('#drawerPath').textContent=n.library+' · '+n.type;
  $('#drawerTitle').value=n.title;$('#drawerContent').value=n.content;$('#drawerType').value=n.type;$('#drawerLibrary').value=n.library;$('#drawerTags').value=(n.tags||[]).map(t=>'#'+t).join(' ');
  $('#drawerFavorite').textContent=n.favorite?'★ 已收藏':'☆ 收藏';
  $('#drawerPin').textContent=n.pinned?'⌃ 取消置顶':'⌃ 置顶';
  $('#noteDrawer').classList.add('show');
}
function closeDrawer(){$('#noteDrawer').classList.remove('show')}
function saveDrawer(){
  const n=notes.find(x=>x.id===currentId);if(!n)return;
  n.title=$('#drawerTitle').value;n.content=$('#drawerContent').value;n.type=$('#drawerType').value;n.library=$('#drawerLibrary').value;n.tags=$('#drawerTags').value.split(/[\s,，]+/).map(x=>x.replace(/^#/,'')).filter(Boolean);n.updated=new Date().toISOString();
  save();render();openDrawer(n.id);toastMsg('已保存');
  refreshPip();
}

async function openFloatingDesk(){
  const pinned=notes.filter(n=>n.pinned);
  if(!pinned.length){toastMsg('先把至少一条记录设为置顶');return}
  if(!('documentPictureInPicture' in window)){
    toastMsg('当前浏览器不支持置顶浮窗，请使用较新的 Chrome / Edge');
    return;
  }
  try{
    if(pipWindow && !pipWindow.closed){pipWindow.focus();refreshPip();return}
    pipWindow=await window.documentPictureInPicture.requestWindow({width:420,height:560});
    const style=pipWindow.document.createElement('style');
    style.textContent=`
      *{box-sizing:border-box}body{margin:0;background:linear-gradient(180deg,#0a1020,#111a2f);color:#f6f8ff;font-family:Inter,-apple-system,"Segoe UI","Microsoft YaHei",sans-serif;padding:12px}
      header{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}header strong{font-size:15px}header span{font-size:9px;color:#8fe6ff;border:1px solid rgba(255,255,255,.12);padding:5px 7px;border-radius:999px}
      .cards{display:flex;flex-direction:column;gap:9px}.card{border:1px solid rgba(255,255,255,.1);background:linear-gradient(135deg,rgba(255,255,255,.1),rgba(255,255,255,.035));border-radius:16px;padding:12px;box-shadow:0 12px 30px rgba(0,0,0,.18)}
      .meta{font-size:9px;color:#8aa1c7;text-transform:uppercase;letter-spacing:.08em}.title{font-size:14px;font-weight:800;margin:8px 0}.content{font-size:11px;line-height:1.55;color:#c7d2e7;white-space:pre-wrap;max-height:150px;overflow:auto}.foot{display:flex;gap:6px;margin-top:10px}.foot button{border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.06);color:#dbe6fb;border-radius:8px;padding:6px 8px;font-size:9px}.empty{color:#8392ad;text-align:center;padding:50px 10px}
    `;
    pipWindow.document.head.appendChild(style);
    pipWindow.addEventListener('pagehide',()=>{pipWindow=null});
    refreshPip();
  }catch(e){toastMsg('无法打开置顶浮窗：'+(e.message||e))}
}

function refreshPip(){
  if(!pipWindow || pipWindow.closed)return;
  const doc=pipWindow.document;
  doc.body.innerHTML='';
  const header=doc.createElement('header'); header.innerHTML='<strong>WhaleX Floating Desk</strong><span>Always on top</span>';doc.body.appendChild(header);
  const wrap=doc.createElement('div');wrap.className='cards';doc.body.appendChild(wrap);
  const pinned=notes.filter(n=>n.pinned);
  if(!pinned.length){wrap.innerHTML='<div class="empty">没有置顶内容</div>';return}
  pinned.forEach(n=>{
    const card=doc.createElement('div');card.className='card';
    card.innerHTML='<div class="meta">'+esc(n.library)+' · '+esc(n.type)+'</div><div class="title">'+esc(n.title)+'</div><div class="content">'+esc(n.content)+'</div><div class="foot"><button data-copy>复制</button><button data-unpin>取消置顶</button></div>';
    card.querySelector('[data-copy]').onclick=()=>navigator.clipboard.writeText(n.content||'');
    card.querySelector('[data-unpin]').onclick=()=>{n.pinned=false;save();render();refreshPip()};
    wrap.appendChild(card);
  });
}

function download(name,content,type='text/plain'){
  const blob=new Blob([content],{type});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),800)
}
function exportData(kind){
  const arr=filtered(); const stamp=new Date().toISOString().slice(0,10);
  if(kind==='json')return download('WhaleX-'+stamp+'.json',JSON.stringify(arr,null,2),'application/json');
  if(kind==='md')return download('WhaleX-'+stamp+'.md',arr.map(n=>'# '+n.title+'\n\n**'+n.library+' · '+n.type+'**\n\n'+(n.tags||[]).map(t=>'#'+t).join(' ')+'\n\n'+n.content).join('\n\n---\n\n'),'text/markdown');
  if(kind==='doc'){
    const html='<html><head><meta charset="utf-8"></head><body>'+arr.map(n=>'<h1>'+esc(n.title)+'</h1><p><b>'+esc(n.library)+' · '+esc(n.type)+'</b></p><p>'+esc(n.content).replace(/\n/g,'<br>')+'</p><hr>').join('')+'</body></html>';
    return download('WhaleX-'+stamp+'.doc',html,'application/msword');
  }
  download('WhaleX-'+stamp+'.txt',arr.map(n=>n.title+'\n'+n.library+' · '+n.type+'\n'+(n.tags||[]).map(t=>'#'+t).join(' ')+'\n'+n.content+'\n\n---').join('\n\n'));
}

function toastMsg(msg){const t=$('#toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),1500)}

$('#captureBtn').onclick=openCapture;$('#heroCapture').onclick=openCapture;$('#quickOrb').onclick=openCapture;$('#closeCapture').onclick=closeCapture;$('#saveCapture').onclick=saveCapture;
$('#captureModal').onclick=e=>{if(e.target.id==='captureModal')closeCapture()};
$('#closeDrawer').onclick=closeDrawer;$('#drawerSave').onclick=saveDrawer;
$('#drawerFavorite').onclick=()=>{const n=notes.find(x=>x.id===currentId);if(n){n.favorite=!n.favorite;save();render();openDrawer(n.id)}};
$('#drawerPin').onclick=()=>{const n=notes.find(x=>x.id===currentId);if(n){n.pinned=!n.pinned;save();render();openDrawer(n.id);refreshPip()}};
$('#drawerDelete').onclick=()=>{if(!currentId)return;notes=notes.filter(n=>n.id!==currentId);save();closeDrawer();render();refreshPip();toastMsg('已删除')};
$('#floatingDeskBtn').onclick=openFloatingDesk;$('#heroFloat').onclick=openFloatingDesk;
$('#exportMenuBtn').onclick=()=>$('#exportPopover').classList.toggle('show');
$$('[data-export]').forEach(b=>b.onclick=()=>{exportData(b.dataset.export);$('#exportPopover').classList.remove('show')});
$$('[data-view]').forEach(b=>b.onclick=()=>{view=b.dataset.view;render()});
$$('[data-type]').forEach(b=>b.onclick=()=>{typeFilter=b.dataset.type;$$('[data-type]').forEach(x=>x.classList.toggle('active',x===b));renderNotes()});
$('#searchInput').oninput=e=>{query=e.target.value;renderNotes()};
$('#languageBtn').onclick=()=>{lang=lang==='zh'?'en':'zh';localStorage.setItem(LANG_KEY,lang);toastMsg(lang==='zh'?'已切换中文':'English mode');};
document.addEventListener('keydown',e=>{if(e.ctrlKey&&e.shiftKey&&e.code==='Space'){e.preventDefault();openCapture()}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();$('#searchInput').focus()}if(e.key==='Escape'){closeCapture();closeDrawer()}});

fillSelects();render();
