const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../web/logic.js');
const p = L.normalize('note', { title:'Draft', content:'本机内容', tags:['Legal'], created:'2026-01-01', updated:'2026-01-01' });
const row = { scope:'user-a', id:'note-1', kind:'note', payload:p, deleted:false, dirty:true, base:1, changeId:'change-a' };
const remote = { id:row.id, kind:'note', payload:p, deleted:false, version:2, mutation_id:row.changeId };
test('tags normalize and deduplicate', () => { assert.deepEqual(L.tags('#AI, #Legal AI\nWorkflow'), ['AI','Legal','Workflow']); assert.equal(L.tags(Array.from({length:40},(_,i)=>'t'+i)).length,30); });
test('escape HTML', () => assert.equal(L.esc('<img onerror="x">'),'&lt;img onerror=&quot;x&quot;&gt;'));
test('legal routing takes priority', () => assert.equal(L.suggest('privacy agent workflow'),'lib-legal'));
test('legacy sticky and timestamps migrate', () => { const n=L.normalize('note',{content:'Hello',sticky:1,created_at:'2025-01-01'}); assert.equal(n.pinned,true); assert.equal(n.created,'2025-01-01T00:00:00.000Z'); });
test('invalid kinds rejected', () => assert.throws(()=>L.normalize('unknown',{})));
test('library colors cannot inject CSS', () => assert.equal(L.normalize('library',{color:'red;url(javascript:x)'}).color,'violet'));
test('oversized text rejected', () => assert.throws(()=>L.normalize('note',{content:'x'.repeat(200001)})));
test('remote IDs and versions validated', () => { assert.throws(()=>L.remoteRecord({...remote,id:'"><script>'},'a')); assert.throws(()=>L.remoteRecord({...remote,version:-1},'a')); });
test('same edit acknowledged clean', () => { const [r]=L.reconcile(row,row,{status:'applied',record:remote}); assert.equal(r.dirty,false); assert.equal(r.base,2); });
test('late acknowledgement preserves newer local text', () => { const newer={...row,changeId:'change-b',payload:{...p,content:'NEW'}}; const [r]=L.reconcile(newer,row,{status:'applied',record:remote}); assert.equal(r.payload.content,'NEW'); assert.equal(r.dirty,true); assert.equal(r.base,2); });
test('conflict retains local and remote versions', () => { const r=L.reconcile(row,row,{status:'conflict',record:{...remote,payload:{...p,content:'REMOTE'}}}); assert.equal(r.length,2); assert.equal(r[0].payload.content,'REMOTE'); assert.equal(r[1].payload.content,'本机内容'); assert.equal(r[1].dirty,true); assert.equal(r[1].base,null); assert.notEqual(r[1].id,row.id); });
test('edit vs delete retains local copy', () => { const r=L.reconcile(row,row,{status:'conflict',record:{...remote,deleted:true}}); assert.equal(r[0].deleted,true); assert.equal(r[1].deleted,false); });
test('identical conflicts do not duplicate', () => assert.equal(L.reconcile(row,row,{status:'conflict',record:remote}).length,1));
test('unknown result status rejected', () => assert.throws(()=>L.reconcile(row,row,{status:'ok',record:remote})));
test('sent snapshot remains immutable', () => { const before=JSON.stringify(row); L.reconcile(row,row,{status:'conflict',record:{...remote,deleted:true}}); assert.equal(JSON.stringify(row),before); });
test('parent tags match descendants without matching unrelated prefixes',()=>{
  assert.equal(L.tagMatches(['工作/法务/合同'],'工作/法务'),true);
  assert.equal(L.tagMatches(['工作/法务二'],'工作/法务'),false);
});
test('natural search keeps literal keywords when no time or type is requested',()=>{
  assert.equal(L.parseQuery('独立悬浮笔记').text,'独立悬浮笔记');
  const query=L.parseQuery('本周的合同 Prompt',new Date('2026-09-30T12:00:00Z'));
  assert.equal(query.type,'Prompt');assert.equal(query.text,'合同');assert.ok(query.from);
  assert.equal(L.queryMatches({...p,title:'合同',created:'2026-01-01T00:00:00.000Z'},query),false);
});
test('reference and annotation metadata survive normalization and sync',()=>{
  const n=L.normalize('note',{content:'source',references:['valid-id','bad<id>','valid-id'],annotations:[{id:'c1',content:'<b>批注</b>',created:'2026-01-01'}]});
  assert.deepEqual(n.references,['valid-id']);assert.equal(n.annotations[0].content,'<b>批注</b>');
  assert.deepEqual(L.remoteRecord({...remote,payload:n},'account').payload,n);
});
