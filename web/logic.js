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
    return {
      title: String(p.title || content.split('\n')[0] || '未命名').slice(0, 160), content,
      libraryId: String(p.libraryId || 'lib-prompt').slice(0, 120),
      type: TYPES.includes(p.type) ? p.type : 'Prompt', tags: tags(p.tags),
      favorite: !!p.favorite, archived: !!p.archived, pinned: !!(p.pinned || p.sticky), done: !!p.done,
      created: validDate(p.created || p.created_at), updated: validDate(p.updated || p.updated_at)
    };
  }
  function validDate(s) { return s && Number.isFinite(Date.parse(s)) ? new Date(s).toISOString() : new Date().toISOString(); }
  function suggest(text) {
    const t = String(text || '').toLowerCase();
    if (/contract|agreement|legal|privacy|gdpr|合同|法律|仲裁|合规/.test(t)) return 'lib-legal';
    if (/agent|codex|workflow|mcp|智能体|模型/.test(t)) return 'lib-ai';
    if (/汇报|会议|项目|任务|work|todo/.test(t)) return 'lib-work';
    return 'lib-prompt';
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
  const api = { TYPES, DEFAULT_LIBRARIES, uuid, esc, tags, normalize, suggest, remoteRecord, reconcile };
  if (typeof module !== 'undefined') module.exports = api;
  else root.WhaleXLogic = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
