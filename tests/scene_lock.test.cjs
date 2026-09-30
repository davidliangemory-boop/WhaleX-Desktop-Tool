const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'), locked=require('./scene-lock.json');
const digest=s=>crypto.createHash('sha256').update(s).digest('hex');
test('approved background, planets, whale, trails and base styles stay byte-identical',()=>{
  for(const [file,hash] of Object.entries(locked.sha256))assert.equal(digest(fs.readFileSync(path.join(root,file))),hash,file);
});
test('approved hero markup stays identical',()=>{
  const source=fs.readFileSync(path.join(root,'web/index.html'),'utf8');
  assert.equal(digest(source.match(/<section class="hero".*?<\/section>/s)[0]),locked.heroSha256);
});
