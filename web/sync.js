/* Opt-in Supabase Auth + versioned RPC sync. Never embeds a service-role key. */
(function () {
  'use strict';
  const S = window.WhaleXStore;
  let timer, periodic, running = false, failures = 0;
  let state = { mode: 'local', message: '仅本机 · 未连接云端', pending: 0 };
  const setState = value => { state = { ...state, ...value }; window.dispatchEvent(new CustomEvent('whalex-sync', { detail: state })); };
  function validateConfig(url, key) {
    const u = new URL(String(url).trim());
    if (u.protocol !== 'https:' || !/^[a-z0-9-]+\.supabase\.co$/.test(u.hostname) || u.username || u.password || u.search || u.hash) throw new Error('请填写 https://项目编号.supabase.co 格式的项目网址');
    key = String(key).trim();
    let anon = false;
    if (key.startsWith('eyJ')) { try { anon = JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).role === 'anon'; } catch {} }
    if (!/^sb_publishable_[a-zA-Z0-9_-]+$/.test(key) && !anon) throw new Error('只能使用 Publishable key 或旧版 anon key；不要填写 Secret / service_role key');
    return { url: u.origin, key };
  }
  function configure(url, key) {
    const c = validateConfig(url, key);
    if (S.config()?.url !== c.url) localStorage.removeItem(S.SESSION);
    localStorage.setItem(S.CONFIG, JSON.stringify(c));
    window.dispatchEvent(new Event('whalex-account')); return c;
  }
  async function request(path, { method = 'GET', body, token, expectedScope, headers = {} } = {}) {
    const c = S.config(); if (!c) throw new Error('请先在设置里连接同步项目');
    if (expectedScope && S.scope() !== expectedScope) throw new Error('账号已切换，本次同步已停止');
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const r = await fetch(c.url + path, { method, signal: controller.signal,
        headers: { apikey: c.key, 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...headers },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      const text = await r.text(); let data; try { data = text ? JSON.parse(text) : null; } catch { throw new Error('同步服务返回了无法读取的数据'); }
      if (!r.ok) {
        if (r.status === 401) throw new Error('登录已失效，请重新登录');
        if (r.status === 429) throw new Error('请求过于频繁，请稍后再试');
        if (['PGRST202', 'PGRST205', '42P01', '42883'].includes(data?.code)) throw new Error('云端数据表尚未配置，请先运行仓库中的 supabase/schema.sql');
        throw new Error(String(data?.msg || data?.message || data?.error_description || '同步请求失败（' + r.status + '）').slice(0, 240));
      }
      return data;
    } catch (e) { if (e.name === 'AbortError') throw new Error('同步连接超时；记录已保留在本机'); throw e; }
    finally { clearTimeout(timeout); }
  }
  function saveSession(data) {
    if (!data?.access_token || !data?.refresh_token || !data?.user?.id) throw new Error('登录服务没有返回有效会话');
    const value = { project: S.config().url, access_token: data.access_token, refresh_token: data.refresh_token,
      expires_at: data.expires_at || Math.floor(Date.now() / 1000) + data.expires_in, user: { id: data.user.id, email: data.user.email } };
    localStorage.setItem(S.SESSION, JSON.stringify(value)); return value;
  }
  async function login(email, password) {
    const data = await request('/auth/v1/token?grant_type=password', { method: 'POST', body: { email: email.trim(), password } });
    saveSession(data); await S.defaults(); window.dispatchEvent(new Event('whalex-account')); schedule(50);
  }
  async function signup(email, password) {
    if (password.length < 8) throw new Error('密码至少 8 位');
    const data = await request('/auth/v1/signup', { method: 'POST', body: { email: email.trim(), password } });
    if (data?.access_token) { saveSession(data); await S.defaults(); window.dispatchEvent(new Event('whalex-account')); schedule(50); return '注册成功，已登录'; }
    return '请到邮箱确认注册，再回到这里登录。收不到邮件时请检查 Supabase 的邮件配置。';
  }
  async function logout() {
    const s = S.session();
    // Local logout is immediate, including while offline.
    localStorage.removeItem(S.SESSION); clearTimeout(timer);
    window.dispatchEvent(new Event('whalex-account'));
    if (s?.access_token && navigator.onLine) request('/auth/v1/logout?scope=local', { method: 'POST', token: s.access_token }).catch(() => {});
    setState({ mode: 'local', message: '已退出 · 仅本机', pending: 0 });
  }
  async function accessToken(expectedScope) {
    const refresh = async () => {
      let s = S.session();
      if (!s || S.scope() !== expectedScope) throw new Error('请先登录同步账号');
      if (s.expires_at * 1000 > Date.now() + 60000) return s.access_token;
      const data = await request('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: s.refresh_token }, expectedScope });
      if (S.scope() !== expectedScope) throw new Error('账号已切换');
      s = saveSession(data); return s.access_token;
    };
    return navigator.locks ? navigator.locks.request('whalex-auth-refresh', refresh) : refresh();
  }
  async function cycle() {
    if (running) return;
    await S.ready;
    if (!S.session()) { setState({ mode: 'local', message: '仅本机 · 未连接云端', pending: 0 }); return; }
    const s = S.scope();
    if (!navigator.onLine) { setState({ mode: 'offline', message: '离线 · 联网后自动同步' }); return; }
    running = true;
    try {
      const dirty = (await S.all(s)).filter(r => r.dirty);
      setState({ mode: 'syncing', message: '正在同步…', pending: dirty.length });
      let conflicts = 0;
      for (const row of dirty) {
        const token = await accessToken(s);
        const result = await request('/rest/v1/rpc/whalex_apply_record', { method: 'POST', token, expectedScope: s,
          body: { p_id: row.id, p_kind: row.kind, p_payload: row.payload, p_deleted: row.deleted, p_base: row.base, p_mutation: row.changeId } });
        if (await S.acknowledge(row, result)) conflicts++;
      }
      // Paged pull, including tombstones. No silent 1,000-row truncation.
      for (let offset = 0; ; offset += 500) {
        const token = await accessToken(s);
        const rows = await request(`/rest/v1/whalex_records?select=id,kind,payload,deleted,version,mutation_id&order=id.asc&limit=500&offset=${offset}`, { token, expectedScope: s });
        if (!Array.isArray(rows)) throw new Error('云端记录格式错误');
        await S.receive(rows, s); if (rows.length < 500) break;
      }
      failures = 0;
      const pending = (await S.all(s)).filter(r => r.dirty).length;
      if (S.scope() === s) setState({ mode: pending ? 'pending' : 'synced', pending, lastSync: new Date().toISOString(),
        message: conflicts ? '已保留冲突副本，请检查' : pending ? '已保存本机 · 等待同步' : '已同步' });
      if (pending) schedule(1200);
    } catch (e) {
      failures++;
      if (S.scope() === s) setState({ mode: 'error', message: e.message || '暂时无法同步；本机记录未丢失' });
      schedule(Math.min(120000, 3000 * 2 ** Math.min(failures, 5)));
    } finally { running = false; }
  }
  async function syncNow() {
    clearTimeout(timer);
    if (navigator.locks) await navigator.locks.request('whalex-sync', { ifAvailable: true }, lock => lock ? cycle() : undefined);
    else await cycle();
  }
  function schedule(ms = 700) { clearTimeout(timer); timer = setTimeout(() => void syncNow(), ms); }
  function start() {
    if (periodic) return;
    periodic = setInterval(() => void syncNow(), 20000);
    window.addEventListener('whalex-change', e => { if (e.detail?.reason !== 'remote') schedule(); });
    window.addEventListener('whalex-account', () => schedule(50));
    window.addEventListener('online', () => schedule(50));
    window.addEventListener('offline', () => setState({ mode: 'offline', message: '离线 · 联网后自动同步' }));
    window.addEventListener('focus', () => schedule(300));
    schedule(500);
  }
  window.WhaleXSync = { validateConfig, configure, login, signup, logout, start, syncNow, status: () => state };
})();
