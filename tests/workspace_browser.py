"""Exercise capture, review, references, restore and opt-in integrations with mocked providers."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from playwright.sync_api import sync_playwright, expect
import json, os

ROOT=Path(__file__).resolve().parents[1]
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(ROOT/'web')))
Thread(target=server.serve_forever,daemon=True).start()
url=f'http://127.0.0.1:{server.server_port}/'
checks=[]
def check(name,value=True):
    assert value,name
    checks.append(name);print('PASS:',name,flush=True)
def ready(page):
    page.wait_for_selector('#inlineComposer textarea')
    page.wait_for_function('() => document.querySelector("#noteGrid .empty") || document.querySelectorAll(".note-card").length>0')
def close(page):
    if page.locator('#workspaceDialog').evaluate('e=>e.open'):page.locator('[data-close=workspaceDialog]').click()
def select_home(page):
    close(page);page.locator('.sidebar [data-view=all]').click();page.locator('#searchInput').fill('');page.wait_for_timeout(150)
def detail(page,id):
    close(page)
    if not page.locator(f'[data-record="{id}"]').count():page.locator('.records-footer [data-act=browse]').click()
    page.locator(f'[data-record="{id}"] .record-title').click()
    expect(page.locator('#workspaceDialog')).to_be_visible()
def payload(page,id):return page.evaluate('id=>WhaleXStore.get(id)',id)['payload']
sent_models=[];sent_flomo=[]
def model_route(route):
    if route.request.method=='OPTIONS':
        route.fulfill(status=204,headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'POST,OPTIONS'});return
    sent_models.append(route.request.post_data_json)
    route.fulfill(json={'choices':[{'message':{'content':'模型生成的结构化内容 [来源 1]'}}]},headers={'Access-Control-Allow-Origin':'*'})
def flomo_route(route):
    if route.request.method=='OPTIONS':
        route.fulfill(status=204,headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'POST,OPTIONS'});return
    sent_flomo.append(route.request.post_data_json)
    route.fulfill(json={'code':0,'message':'success'},headers={'Access-Control-Allow-Origin':'*'})
try:
    with sync_playwright() as pw:
        executable=os.environ.get('CHROMIUM_PATH') or os.environ.get('WHALEX_CHROMIUM_PATH')
        browser=pw.chromium.launch(headless=True,args=['--no-sandbox'],**({'executable_path':executable} if executable else {}))
        context=browser.new_context(viewport={'width':1905,'height':943})
        context.grant_permissions(['clipboard-read','clipboard-write'])
        context.route('https://models.example.test/**',model_route)
        context.route('https://api.flomoapp.com/**',flomo_route)
        page=context.new_page();errors=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto(url);ready(page)
        check('fresh workspace has no fake notes',page.locator('.note-card').count()==0)
        check('capture metadata starts collapsed',not page.locator('#inlineComposer .capture-details').evaluate('e=>e.open'))
        page.locator('#inlineComposer [name=content]').fill('先记下来，稍后再整理')
        page.locator('#inlineComposer .paper-save').click()
        expect(page.locator('#inboxCount')).to_have_text('1')
        quick=page.evaluate("async()=> (await WhaleXStore.all()).find(r=>r.kind==='note'&&!r.deleted)")
        check('capture requires only content',quick['payload']['libraryId']=='lib-inbox' and quick['payload']['title']=='先记下来，稍后再整理')
        page.locator('#toast [data-act=undocapture]').click()
        expect(page.locator('#inboxCount')).to_have_text('')
        expect(page.locator('#inboxCount')).to_be_hidden()
        check('undo returns content to draft without losing it',page.locator('#inlineComposer [name=content]').input_value()=='先记下来，稍后再整理')
        page.locator('#inlineComposer [name=content]').fill('')
        fixture=page.evaluate("""async()=> {
          const defs=[
            {id:'legal-one',title:'旧合同审核',content:'原版合同审查内容',created:'2026-01-01',libraryId:'lib-legal',tags:['工作/法务/合同']},
            {id:'legal-two',title:'合同风险清单',content:'风险事实与来源',created:'2026-01-02',libraryId:'lib-legal',tags:['工作/法务']},
            {id:'agent-one',title:'Agent 研究方法',content:'检索、整理、引用与复核',created:'2026-01-03',libraryId:'lib-ai',tags:['AI/Agent']},
            {id:'today-one',title:'本周合同 Prompt',content:'今天的新合同提示词',libraryId:'lib-legal',tags:['工作/法务']}
          ];for(const p of defs)await WhaleXStore.put('note',p,{id:p.id});return defs;
        }""")
        page.locator('.records-footer [data-act=browse]').click()
        page.wait_for_function('() => document.querySelectorAll(".note-card").length===4')
        check('overview comes from actual records',page.locator('#weekCount').inner_text()=='1')
        page.locator('.sidebar [data-act=tags]').click()
        page.locator('#tagTree button').filter(has_text='#工作/法务').first.click()
        expect(page.locator('.note-card')).to_have_count(3)
        check('parent tag includes descendants')
        select_home(page)
        page.locator('#searchInput').fill('本周的合同 Prompt')
        expect(page.locator('.note-card')).to_have_count(1)
        expect(page.locator('#noteGrid')).to_contain_text('本周合同 Prompt')
        check('natural time and type search uses actual dates')
        select_home(page)
        page.locator('.sidebar [data-act=review]').click()
        page.wait_for_function("() => document.querySelector('.home-tab[data-act=review]').classList.contains('active') && document.querySelectorAll('.note-card').length===3 && !document.querySelector('[data-record=today-one]')")
        expect(page.locator('.note-card')).to_have_count(3)
        check('daily review selects old records only',all('today-one'!=x for x in page.locator('.note-card').evaluate_all('els=>els.map(e=>e.dataset.record)')))
        detail(page,'legal-one')
        page.locator('#annotationForm [name=comment]').fill('先核对事实，再给修改建议。')
        page.locator('#annotationForm [type=submit]').click()
        expect(page.locator('.annotation')).to_contain_text('先核对事实')
        check('annotation is persisted',payload(page,'legal-one')['annotations'][0]['content']=='先核对事实，再给修改建议。')
        page.locator('#referenceForm [name=target]').select_option('legal-two')
        page.locator('#referenceForm [type=submit]').click()
        page.wait_for_function("async()=> (await WhaleXStore.get('legal-one')).payload.references?.includes('legal-two')")
        check('explicit references persist')
        page.locator('#workspaceDialog [data-act=reviewed]').click()
        expect(page.locator('#workspaceDialog [data-act=reviewed]')).to_be_disabled()
        close(page);expect(page.locator('.note-card')).to_have_count(2)
        check('review completion reduces daily queue')
        select_home(page);detail(page,'legal-two')
        expect(page.locator('#workspaceDialog')).to_contain_text('↩ 旧合同审核')
        check('reverse link points back to the citing record')
        select_home(page);detail(page,'legal-one')
        page.locator('#workspaceDialog [data-note-act=edit]').click()
        page.locator('#editorRoot [name=content]').fill('第二版合同审查内容')
        page.locator('#editorRoot .paper-save').click()
        page.wait_for_function('() => !document.querySelector("#editorDialog").open')
        detail(page,'legal-one')
        page.locator('#workspaceDialog [data-note-act=history]').click()
        expect(page.locator('.history-item')).to_have_count(2)
        check('editing snapshots original content atomically')
        page.locator('[data-act=goodversion]').first.click()
        expect(page.locator('.history-item').first).to_contain_text('★ 好版本')
        page.locator('[data-act=compareversion]').first.click()
        expect(page.locator('.diff-old')).to_contain_text('原版合同审查内容')
        expect(page.locator('.diff-new')).to_contain_text('第二版合同审查内容')
        check('version comparison shows old and current content')
        page.locator('[data-act=restoreversion]').click()
        page.wait_for_function("async()=> (await WhaleXStore.get('legal-one')).payload.content==='原版合同审查内容'")
        check('restore preserves later annotations',len(payload(page,'legal-one')['annotations'])==1)
        check('restore preserves the replaced current version',page.evaluate("async()=> (await WhaleXStore.history('legal-one')).some(v=>v.payload.content==='第二版合同审查内容')"))
        select_home(page);detail(page,'legal-one')
        before=payload(page,'legal-one')
        page.locator('#workspaceDialog [data-act=insight]').click()
        page.locator('#runInsight').click()
        expect(page.locator('#aiResult')).to_be_visible()
        check('local refinement sends no network requests',not sent_models and not sent_flomo)
        check('refinement preview preserves original',payload(page,'legal-one')==before)
        page.locator('[data-act=saveinsight]').click()
        page.wait_for_function("async()=> (await WhaleXStore.all()).some(r=>r.payload.tags?.includes('提炼'))")
        refined=page.evaluate("async()=> (await WhaleXStore.all()).find(r=>r.payload.tags?.includes('提炼'))")
        check('saved refinement includes selected sources',refined['payload']['references']==['legal-one'])
        select_home(page);page.locator('.overview-actions [data-act=insight]').click()
        page.locator('#insightForm [data-act=connections]').click()
        f=page.locator('#connectionForm')
        f.locator('[name=endpoint]').fill('https://models.example.test/v1/chat/completions')
        f.locator('[name=model]').fill('test-model')
        f.locator('[name=key]').fill('sample-secret')
        f.locator('[name=flomo]').fill('https://api.flomoapp.com/v1/memo/demo/sample')
        f.locator('[type=submit]').click()
        expect(page.locator('#connectionMessage')).to_contain_text('尚未发送')
        check('configuration alone sends nothing',not sent_models and not sent_flomo)
        check('secrets excluded from note backups','sample-secret' not in json.dumps(page.evaluate('()=>WhaleXStore.backup()')))
        page.locator('[data-close=settingsDialog]').click()
        page.locator('.overview-actions [data-act=insight]').click()
        page.locator('#insightForm [name=engine]').select_option('api')
        choices=page.locator('#sourceList [name=source]')
        for i in range(choices.count()):choices.nth(i).uncheck()
        page.locator('#sourceList [name=source][value=legal-one]').check()
        page.locator('#runInsight').click()
        expect(page.locator('#aiPreview')).to_have_value('模型生成的结构化内容 [来源 1]')
        check('external model gets only selected source',len(sent_models)==1 and '原版合同审查内容' in sent_models[0]['messages'][1]['content'] and '风险事实与来源' not in sent_models[0]['messages'][1]['content'])
        close(page);select_home(page);detail(page,'legal-one')
        page.locator('#workspaceDialog [data-act=flomo]').click()
        expect(page.locator('#toast')).to_contain_text('flomo 已确认保存')
        check('manual flomo send uses one selected record',len(sent_flomo)==1 and '原版合同审查内容' in sent_flomo[0]['content'])
        close(page);select_home(page)
        backup=page.evaluate('()=>WhaleXStore.backup()')
        original_ids=[n['id'] for n in backup['notes']]
        page.evaluate('data=>WhaleXStore.importBackup(data)',backup)
        imported=page.evaluate('()=>WhaleXStore.all()')
        copies=[r for r in imported if r['kind']=='note' and not r['deleted'] and r['id'] not in original_ids]
        copied_legal=next(r for r in copies if r['payload']['title']=='旧合同审核')
        copied_target=next(r for r in copies if r['payload']['title']=='合同风险清单')
        check('backup copies references to the imported counterpart',copied_legal['payload']['references']==[copied_target['id']])
        check('backup import preserves inbox classification',all(r['payload']['libraryId']=='lib-inbox' for r in copies if r['payload']['title']=='先记下来，稍后再整理'))
        page.locator('[data-type=Workflow]').first.click()
        page.locator('#workflowCreate').click()
        page.locator('#workflowForm [name=title]').fill('研究流程')
        page.locator('#workflowForm [name=steps]').fill('检索原文\n核对来源\n整理结论')
        page.locator('#workflowForm [type=submit]').click()
        expect(page.locator('#noteGrid')).to_contain_text('研究流程')
        check('workflow builder stores ordered reusable steps',page.evaluate("async()=> (await WhaleXStore.all()).some(r=>r.payload.type==='Workflow'&&r.payload.content.includes('2. 核对来源'))"))
        page.locator('.overview-actions [data-act=overview]').click()
        expect(page.locator('.heatmap button')).to_have_count(84)
        expect(page.locator('.topic-map')).to_be_visible()
        check('overview renders recording dates and actual tag connections')
        close(page);page.set_viewport_size({'width':390,'height':844});page.wait_for_timeout(250)
        page.locator('.mobile-tools').click()
        expect(page.locator('#workspaceDialog')).to_contain_text('分级标签')
        check('mobile menu exposes secondary features')
        close(page);select_home(page)
        check('mobile has no horizontal overflow',page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'))
        page.screenshot(path=str(ROOT/'tests/workspace-mobile-preview.png'),full_page=True)
        page.set_viewport_size({'width':1905,'height':943});page.wait_for_timeout(250)
        page.evaluate('window.scrollTo(0,0)')
        page.locator('body').click(position={'x':1000,'y':12})
        page.screenshot(path=str(ROOT/'tests/workspace-desktop-preview.png'),full_page=True)
        check('no unhandled browser errors',not errors)
        browser.close()
finally:server.shutdown()
print(str(len(checks))+' workspace checks passed; external model and flomo transport mocked.')
