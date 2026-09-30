(function () {
  'use strict';
  const L = window.WhaleXLogic;
  const CONFIG = 'whalex_cloud_config_v2', SESSION = 'whalex_cloud_session_v2';
  let dbPromise;
  const readJSON = key => { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } };
  const config = () => readJSON(CONFIG);
  const session = () => { const s = readJSON(SESSION); return s?.project === config()?.url ? s : null; };
  const scope = () => { const s = session(); return s?.user?.id ? `${s.project}|${s.user.id}` : 'local'; };
  const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('whalex-v2') : null;
  const notify = (reason = 'local') => {
    window.dispatchEvent(new CustomEvent('whalex-change', { detail: { reason } }));
    channel?.postMessage(reason);
    try { localStorage.setItem('whalex_change_v2', JSON.stringify([Date.now(), Math.random(), reason])); } catch { /* IDB remains authoritative. */ }
  };
  channel?.addEventListener('message', e => window.dispatchEvent(new CustomEvent('whalex-change', { detail: { reason: e.data } })));
  window.addEventListener('storage', e => {
    if ([CONFIG, SESSION].includes(e.key)) window.dispatchEvent(new Event('whalex-account'));
    if (e.key === 'whalex_change_v2' && !channel) window.dispatchEvent(new CustomEvent('whalex-change', { detail: { reason: 'local' } }));
  });
  const req = r => new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
  function open() {
    if (!dbPromise) dbPromise = new Promise((resolve, reject) => {
      const r = indexedDB.open('WhaleX-v2', 1);
      r.onupgradeneeded = () => {
        const s = r.result.createObjectStore('records', { keyPath: ['scope', 'id'] }); s.createIndex('scope', 'scope');
        r.result.createObjectStore('meta', { keyPath: 'key' });
      };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => { dbPromise = null; reject(new Error('本机存储不可用，请检查浏览器隐私设置或磁盘空间')); };
    });
    return dbPromise;
  }
  async function transact(storeName, fn, mode = 'readwrite') {
    const db = await open(), tx = db.transaction(storeName, mode);
    const done = new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = tx.onabort = () => reject(tx.error || new Error('本机保存失败')); });
    try { const result = await fn(tx.objectStore(storeName)); await done; return result; }
    catch (error) { try { tx.abort(); } catch {} await done.catch(() => {}); throw error; }
  }
  async function all(s = scope()) { return transact('records', st => req(st.index('scope').getAll(s)), 'readonly'); }
  async function get(id, s = scope()) { return transact('records', st => req(st.get([s, id])), 'readonly'); }
  async function put(kind, payload, options = {}) {
    const s = options.scope || scope(), id = options.id || L.uuid();
    const result = await transact('records', async st => {
      const old = await req(st.get([s, id]));
      let finalId = id, base = old?.base ?? null;
      let p = L.normalize(kind, payload);
      if (kind === 'note') p.updated = new Date().toISOString();
      if (options.expected && old && old.changeId !== options.expected) {
        finalId = L.uuid(); base = null;
        p = { ...p, title: p.title.slice(0, 140) + '（本机冲突副本）', tags: L.tags([...p.tags, '编辑冲突']) };
      }
      const row = { scope: s, id: finalId, kind, payload: p, deleted: !!options.deleted, base, dirty: true, changeId: L.uuid() };
      await req(st.put(row)); return row;
    });
    notify(); return result;
  }
  async function patch(id, changes) {
    const s = scope();
    const result = await transact('records', async st => {
      const old = await req(st.get([s, id])); if (!old) throw new Error('找不到这条记录');
      const row = { ...old, payload: L.normalize(old.kind, { ...old.payload, ...changes, updated: new Date().toISOString() }), dirty: true, changeId: L.uuid() };
      await req(st.put(row)); return row;
    }); notify(); return result;
  }
  async function remove(id) {
    const s = scope();
    await transact('records', async st => { const r = await req(st.get([s, id])); if (r) await req(st.put({ ...r, deleted: true, dirty: true, changeId: L.uuid() })); }); notify();
  }
  async function acknowledge(sent, response) {
    let conflict = false;
    await transact('records', async st => {
      const cur = await req(st.get([sent.scope, sent.id]));
      const rows = L.reconcile(cur, sent, response); conflict = rows.length > 1;
      for (const row of rows) await req(st.put(row));
    }); notify('remote'); return conflict;
  }
  async function receive(rows, s) {
    await transact('records', async st => {
      for (const raw of rows) {
        const remote = L.remoteRecord(raw, s), local = await req(st.get([s, remote.id]));
        if (!local || (!local.dirty && (local.base || 0) < remote.base)) await req(st.put(remote));
      }
    }); notify('remote');
  }
  async function defaults(s = scope()) {
    const rows = await all(s);
    for (const lib of L.DEFAULT_LIBRARIES) if (!rows.some(r => r.id === lib.id)) await put('library', lib, { id: lib.id, scope: s });
  }
  async function migrate() {
    const marker = await transact('meta', st => req(st.get('legacy-v1')), 'readonly');
    if (marker) return;
    let notes = readJSON('whalex_web_notes_v1') || [], libs = readJSON('whalex_web_libs_v1') || [];
    if (!Array.isArray(notes) || !Array.isArray(libs)) throw new Error('旧版本数据格式异常；原数据保留，请先导出备份');
    if (window.__TAURI__) {
      try {
        let db;
        if (window.__TAURI__.sql?.load) db = await window.__TAURI__.sql.load('sqlite:whalex.db');
        else {
          // Official SQL-plugin commands, for builds without global guest bindings.
          const invoke = window.__TAURI__.core.invoke;
          const path = await invoke('plugin:sql|load', { db: 'sqlite:whalex.db' });
          db = { select: query => invoke('plugin:sql|select', { db: path, query, values: [] }) };
        }
        const tables = await db.select("SELECT name FROM sqlite_master WHERE type='table'");
        if (tables.some(t => t.name === 'notes')) notes = [...notes, ...await db.select('SELECT * FROM notes')];
        if (tables.some(t => t.name === 'libraries')) libs = [...libs, ...await db.select('SELECT * FROM libraries')];
      } catch (e) { throw new Error('旧桌面数据库迁移未完成，原文件未改动：' + e.message); }
    }
    await defaults('local');
    const existing = await all('local');
    const byName = new Map(existing.filter(x => x.kind === 'library').map(x => [x.payload.name, x.id]));
    for (const name of new Set([...libs.map(l => l.name), ...notes.map(n => n.library)].filter(Boolean))) {
      if (!byName.has(name)) { const row = await put('library', { name }, { scope: 'local' }); byName.set(name, row.id); }
    }
    for (const n of notes) {
      const id = /^[a-zA-Z0-9_-]{1,120}$/.test(n.id) ? n.id : L.uuid();
      if (await get(id, 'local')) continue;
      let t = n.tags; if (typeof t === 'string') { try { t = JSON.parse(t); } catch { t = L.tags(t); } }
      await put('note', { ...n, tags: t, libraryId: byName.get(n.library) || 'lib-prompt' }, { id, scope: 'local' });
    }
    await transact('meta', st => req(st.put({ key: 'legacy-v1', value: true })));
  }
  async function importBackup(data) {
    const isLegacy = Array.isArray(data);
    const rawNotes = isLegacy ? data : data?.notes;
    if (!Array.isArray(rawNotes) || rawNotes.length > 10000) throw new Error('备份应包含 notes 数组，单次最多导入 1 万条');
    const rawLibs = isLegacy ? [] : (data.libraries || []);
    if (!Array.isArray(rawLibs)) throw new Error('资料库格式错误');
    // Validate all payloads before beginning any writes.
    const notes = rawNotes.map(n => L.normalize('note', n.payload || n));
    const libs = rawLibs.map(l => ({ old: l.id, payload: L.normalize('library', l.payload || l) }));
    const existing = (await all()).filter(r => r.kind === 'library' && !r.deleted);
    const mapping = new Map();
    for (const lib of libs) {
      let row = existing.find(r => r.payload.name === lib.payload.name);
      if (!row) { row = await put('library', lib.payload); existing.push(row); }
      mapping.set(lib.old, row.id);
    }
    for (let i = 0; i < notes.length; i++) {
      const note = notes[i];
      if (isLegacy && rawNotes[i].library) {
        const name = rawNotes[i].library;
        let lib = existing.find(r => r.payload.name === name);
        if (!lib) { lib = await put('library', { name }); existing.push(lib); }
        note.libraryId = lib.id;
      } else note.libraryId = mapping.get(note.libraryId) || (existing.some(r => r.id === note.libraryId) ? note.libraryId : 'lib-prompt');
      await put('note', note); // New IDs: never replace existing user data on import.
    }
    return notes.length;
  }
  async function backup(s = scope()) {
    const rows = (await all(s)).filter(r => !r.deleted);
    return { version: 2, exportedAt: new Date().toISOString(), libraries: rows.filter(r => r.kind === 'library').map(r => ({ id: r.id, ...r.payload })), notes: rows.filter(r => r.kind === 'note').map(r => ({ id: r.id, ...r.payload })) };
  }
  const api = { CONFIG, SESSION, config, session, scope, readJSON, notify, open, all, get, put, patch, remove, acknowledge, receive, defaults, migrate, importBackup, backup };
  api.ready = (async () => { await open(); let warning = ''; try { await migrate(); } catch (e) { warning = e.message; } await defaults(); return warning; })();
  window.WhaleXStore = api;
})();
