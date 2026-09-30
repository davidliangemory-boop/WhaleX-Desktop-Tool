(function(){
  const isTauri = !!window.__TAURI__;
  let dbPromise = null;
  const seedLibraries = [
    ['AI / Agent','cyan',0],['Prompt Vault','violet',1],['Legal','teal',2],['Work','amber',3],['Random','blue',4]
  ];
  const now = () => new Date().toISOString();

  async function getDb(){
    if(!isTauri) return null;
    if(!dbPromise){ dbPromise = window.__TAURI__.sql.load('sqlite:whalex.db'); }
    return dbPromise;
  }
  async function initDb(){
    if(!isTauri) return false;
    const db=await getDb();
    await db.execute(`CREATE TABLE IF NOT EXISTS libraries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      color TEXT NOT NULL DEFAULT 'cyan',
      sort_index INTEGER NOT NULL DEFAULT 0
    )`);
    await db.execute(`CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL DEFAULT '',
      library TEXT NOT NULL DEFAULT 'Random',
      type TEXT NOT NULL DEFAULT 'Idea',
      tags TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      favorite INTEGER NOT NULL DEFAULT 0,
      archived INTEGER NOT NULL DEFAULT 0,
      sticky INTEGER NOT NULL DEFAULT 0,
      minimized INTEGER NOT NULL DEFAULT 0,
      color TEXT NOT NULL DEFAULT 'blue'
    )`);
    await db.execute(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);

    const lc=await db.select('SELECT COUNT(*) AS c FROM libraries');
    if(Number(lc[0]?.c||0)===0){
      for(const [name,color,sort] of seedLibraries){
        await db.execute('INSERT INTO libraries (name,color,sort_index) VALUES (?,?,?)',[name,color,sort]);
      }
    }
    const nc=await db.select('SELECT COUNT(*) AS c FROM notes');
    if(Number(nc[0]?.c||0)===0){
      const seeds=[
        ['Privacy Agent — 多 Agent 架构','把检索、法域路由、证据核验、结论生成和输出格式拆成不同 Agent；主控 Agent 只负责调度与质量控制。','AI / Agent','Prompt',['Agent','Privacy','Codex'],1,'blue'],
        ['WhaleX 导出体系','按日期、资料库、类型导出。TXT / Markdown 用于快速复用；Word 导出作为下一阶段能力。','Prompt Vault','Idea',['Export','WhaleX'],1,'purple'],
        ['合同审阅结构 Prompt','固定输出：商业决策落实、条款冲突、法律风险、最小化 redline。','Legal','Prompt',['Contract','Review'],0,'green']
      ];
      for(const [title,content,library,type,tags,sticky,color] of seeds){
        const id=crypto.randomUUID(), t=now();
        await db.execute(`INSERT INTO notes (id,title,content,library,type,tags,created_at,updated_at,favorite,archived,sticky,minimized,color)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,[id,title,content,library,type,JSON.stringify(tags),t,t,0,0,sticky,0,color]);
      }
    }
    return true;
  }
  function normalizeNote(row){
    return {...row,
      tags:(()=>{try{return JSON.parse(row.tags||'[]')}catch{return []}})(),
      favorite:Boolean(row.favorite), archived:Boolean(row.archived), sticky:Boolean(row.sticky), minimized:Boolean(row.minimized)
    };
  }
  async function listLibraries(){ const db=await getDb(); return await db.select('SELECT * FROM libraries ORDER BY sort_index,name'); }
  async function listNotes(){ const db=await getDb(); return (await db.select('SELECT * FROM notes ORDER BY updated_at DESC')).map(normalizeNote); }
  async function getNote(id){ const db=await getDb(); const rows=await db.select('SELECT * FROM notes WHERE id=?',[id]); return rows[0]?normalizeNote(rows[0]):null; }
  async function createNote(input={}){
    const db=await getDb(), id=crypto.randomUUID(), t=now();
    const n={id,title:input.title||'Untitled',content:input.content||'',library:input.library||'Random',type:input.type||'Idea',tags:input.tags||[],created_at:t,updated_at:t,favorite:false,archived:false,sticky:Boolean(input.sticky),minimized:false,color:input.color||'blue'};
    await db.execute(`INSERT INTO notes (id,title,content,library,type,tags,created_at,updated_at,favorite,archived,sticky,minimized,color)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,[n.id,n.title,n.content,n.library,n.type,JSON.stringify(n.tags),n.created_at,n.updated_at,0,0,n.sticky?1:0,0,n.color]);
    return n;
  }
  async function updateNote(id,patch){
    const allowed=['title','content','library','type','tags','favorite','archived','sticky','minimized','color'];
    const keys=Object.keys(patch).filter(k=>allowed.includes(k));
    if(!keys.length)return;
    const db=await getDb(); const vals=[];
    const clauses=keys.map(k=>{let v=patch[k]; if(k==='tags')v=JSON.stringify(v||[]); if(['favorite','archived','sticky','minimized'].includes(k))v=v?1:0; vals.push(v); return `${k}=?`;});
    clauses.push('updated_at=?'); vals.push(now(),id);
    await db.execute(`UPDATE notes SET ${clauses.join(',')} WHERE id=?`,vals);
  }
  async function notify(){ if(isTauri){ await window.__TAURI__.core.invoke('broadcast_notes_changed'); } }
  window.WhaleXDB={isTauri,initDb,listLibraries,listNotes,getNote,createNote,updateNote,notify};
})();
