/* Shared, dependency-free model. No credentials or network access. */
(function (root) {
  'use strict';
  const TYPES = ['Prompt', 'Idea', 'Workflow', 'Reference', 'Todo', 'Snippet'];
  const DEFAULT_LIBRARIES = [
    { id: 'lib-prompt', name: 'Prompt Vault', color: 'violet' },
    { id: 'lib-ai', name: 'AI / Agent', color: 'cyan' },
    { id: 'lib-legal', name: 'Legal', color: 'teal' },
    { id: 'lib-work', name: 'Work', color: 'amber' }
  ];
  const uuid = () => root.crypto.randomUUID();
  const esc = (s = '') => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const tags = input => [...new Set((Array.isArray(input) ? input : String(input || '').split(/[,，\n\s]+/)).map(x => String(x).replace(/^#+/, '').trim().slice(0, 40)).filter(Boolean))].slice(0, 30);
  function normalize(kind, p = {}) {
    if (!p || typeof p !== 'object' || Array.isArray(p)) throw new Error('记录格式错误');
    if (kind === 'library') return { name: String(p.name || '未命名资料库').trim().slice(0, 60), color: ['violet', 'cyan', 'teal', 'amber'].includes(p.color) ? p.color : 'violet' };
    if (kind !== 'note') throw new Error('不支持的记录类型');
    const content = String(p.content || '');
    if (content.length > 200000) throw new Error('单条内容不能超过 20 万字符，请拆分记录');
    const note = {
      title: String(p.title || content.split('\n')[0] || '未命名').slice(0, 160), content,
      libraryId: String(p.libraryId || 'lib-prompt').slice(0, 120),
      type: TYPES.includes(p.type) ? p.type : 'Prompt', tags: tags(p.tags),
      favorite: !!p.favorite, archived: !!p.archived, pinned: !!(p.pinned || p.sticky), done: !!p.done,
      created: validDate(p.created || p.created_at), updated: validDate(p.updated || p.updated_at),
      ...(Array.isArray(p.references) && p.references.length ? { references: [...new Set(p.references.filter(id => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,120}$/.test(id)))].slice(0, 50) } : {}),
      ...(Array.isArray(p.annotations) && p.annotations.length ? { annotations: p.annotations.slice(-100).map(a => ({ id: String(a?.id || uuid()).slice(0,120), content: String(a?.content || '').slice(0,5000), created: validDate(a?.created) })).filter(a => a.content.trim()) } : {})
    };
    if (new TextEncoder().encode(JSON.stringify(note)).length > 2097152) throw new Error('内容与批注合计超过单条 2 MB 限制，请拆分记录');
    return note;
  }
  function validDate(s) { return s && Number.isFinite(Date.parse(s)) ? new Date(s).toISOString() : new Date().toISOString(); }
  function suggest(text) {
    const t = String(text || '').toLowerCase();
    if (/contract|agreement|legal|privacy|gdpr|合同|法律|仲裁|合规/.test(t)) return 'lib-legal';
    if (/agent|codex|workflow|mcp|智能体|模型/.test(t)) return 'lib-ai';
    if (/汇报|会议|项目|任务|work|todo/.test(t)) return 'lib-work';
    return 'lib-prompt';
  }
  const tagMatches = (values, tag) => !tag || values.some(t => t === tag || t.startsWith(tag + '/'));
  function parseQuery(raw, now = new Date()) {
    let text = String(raw || '').trim(), from = '', to = '', type = '', favorite = false;
    const foundTags = [...text.matchAll(/#([^\s,，]+)/g)].map(m => m[1]);
    text = text.replace(/#[^\s,，]+/g, ' ');
    const start = new Date(now); start.setHours(0,0,0,0);
    const iso = d => d.toISOString();
    if (/上周/.test(text)) { const end = new Date(start); end.setDate(end.getDate() - (end.getDay()+6)%7); const begin=new Date(end); begin.setDate(begin.getDate()-7); from=iso(begin); to=iso(end); text=text.replace(/上周/g,''); }
    else if (/本周|这周/.test(text)) { start.setDate(start.getDate()-(start.getDay()+6)%7); from=iso(start); text=text.replace(/本周|这周/g,''); }
    else if (/昨天/.test(text)) { to=iso(start); start.setDate(start.getDate()-1); from=iso(start); text=text.replace(/昨天/g,''); }
    else if (/今天|今日/.test(text)) { from=iso(start); text=text.replace(/今天|今日/g,''); }
    else if (/上个月|上月/.test(text)) { const end=new Date(start.getFullYear(),start.getMonth(),1); from=iso(new Date(start.getFullYear(),start.getMonth()-1,1)); to=iso(end); text=text.replace(/上个月|上月/g,''); }
    else if (/本月|这个月/.test(text)) { from=iso(new Date(start.getFullYear(),start.getMonth(),1)); text=text.replace(/本月|这个月/g,''); }
    for (const [pattern, value] of [[/提示词|\bprompt\b/ig,'Prompt'],[/工作流/g,'Workflow'],[/待办|任务/g,'Todo']]) if (pattern.test(text)) { type=value; text=text.replace(pattern,''); break; }
    if (/收藏/.test(text)) { favorite=true; text=text.replace(/收藏/g,''); }
    if (from || type || favorite || foundTags.length) text=text.replace(/找一下|帮我找|搜索|查找|关于|有关|记录|笔记/g,'').replace(/^[\s的]+|[\s的]+$/g,'');
    return { text:text.toLowerCase().trim(), from, to, type, favorite, tags:tags(foundTags) };
  }
  function queryMatches(p, query, library = '') {
    return (!query.type || p.type===query.type) && (!query.favorite || p.favorite) &&
      (!query.from || p.created>=query.from) && (!query.to || p.created<query.to) &&
      query.tags.every(t=>tagMatches(p.tags,t)) && (!query.text || [p.title,p.content,p.type,...p.tags,library].join(' ').toLowerCase().includes(query.text));
  }
  function remoteRecord(r, scope) {
    if (!r || !/^[a-zA-Z0-9_-]{1,120}$/.test(r.id) || !Number.isInteger(r.version) || r.version < 1) throw new Error('云端返回了无效记录');
    return { scope, id: r.id, kind: r.kind, payload: normalize(r.kind, r.payload), deleted: !!r.deleted,
      base: r.version, changeId: r.mutation_id, dirty: false };
  }
  // A late network acknowledgement must not erase a newer local edit.
  function reconcile(current, sent, result) {
    const remote = remoteRecord(result.record, sent.scope);
    if (!current) return [remote];
    if (result.status === 'applied') {
      return [current.changeId === sent.changeId ? remote : { ...current, base: remote.base }];
    }
    if (result.status !== 'conflict') throw new Error('未知的同步响应');
    if (JSON.stringify(current.payload) === JSON.stringify(remote.payload) && current.deleted === remote.deleted) return [remote];
    const copy = { ...current, id: uuid(), base: null, changeId: uuid(), dirty: true, deleted: false,
      payload: { ...current.payload, ...(current.kind === 'note' ? {
        title: current.payload.title.slice(0, 140) + '（冲突副本）', updated: new Date().toISOString(),
        tags: tags([...current.payload.tags, '同步冲突'])
      } : { name: current.payload.name.slice(0, 40) + '（冲突副本）' }) } };
    // Keep both versions, including edit-vs-delete races, for a human decision.
    return [remote, copy];
  }
  const api = { TYPES, DEFAULT_LIBRARIES, uuid, esc, tags, normalize, suggest, tagMatches, parseQuery, queryMatches, remoteRecord, reconcile };
  if (typeof module !== 'undefined') module.exports = api;
  else root.WhaleXLogic = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
