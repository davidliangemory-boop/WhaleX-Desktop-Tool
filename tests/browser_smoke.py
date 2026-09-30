"""Real Chromium UI/storage tests with mocked Supabase transport; not a live-cloud or native-Windows test."""
import copy
import functools
import http.server
import os
from pathlib import Path
import shutil
import threading
from urllib.parse import parse_qs, urlparse
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parents[1]
class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_): pass
server = http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(QuietHandler,directory=str(ROOT/'web')))
threading.Thread(target=server.serve_forever,daemon=True).start()
BASE='http://127.0.0.1:'+str(server.server_port)
checks=[]
def check(name,condition=True):
    assert condition,name
    checks.append(name)
    print('PASS:',name,flush=True)
def ready(page):
    page.wait_for_selector('#inlineComposer textarea',state='attached',timeout=15000)
    page.locator('#recordTrigger').click()
    page.wait_for_function("() => document.querySelectorAll('#inlineComposer [name=libraryId] option').length >= 4")
    page.evaluate('() => WhaleXStore.ready')
def rows(page): return page.evaluate('() => WhaleXStore.all()')
def notes(page): return [r for r in rows(page) if r['kind']=='note' and not r['deleted']]
cloud={}
def api(route):
    request=route.request
    headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'GET,POST,OPTIONS'}
    if request.method=='OPTIONS':
        route.fulfill(status=204,headers=headers); return
    path=urlparse(request.url).path
    query=parse_qs(urlparse(request.url).query)
    body=request.post_data_json if request.post_data else {}
    token=request.headers.get('authorization','Bearer user-a').split()[-1]
    user='user-b' if token=='user-b' else 'user-a'
    result,status=None,200
    if path=='/auth/v1/token':
        user='user-b' if body.get('email')=='b@example.test' or body.get('refresh_token')=='refresh-b' else 'user-a'
        result={'access_token':user,'refresh_token':'refresh-'+user[-1],'expires_in':3600,'user':{'id':user,'email':user[-1]+'@example.test'}}
    elif path=='/auth/v1/logout': result={}
    elif path=='/rest/v1/rpc/whalex_apply_record':
        records=cloud.setdefault(user,{})
        old=records.get(body['p_id'])
        if old and (old['mutation_id']==body['p_mutation'] or (body['p_base'] is None and old['payload']==body['p_payload'] and old['deleted']==body['p_deleted'])):
            result={'status':'applied','record':old}
        elif old and body['p_base']!=old['version']:
            result={'status':'conflict','record':old}
        else:
            new={'id':body['p_id'],'kind':body['p_kind'],'payload':body['p_payload'],'deleted':body['p_deleted'],'version':old['version']+1 if old else 1,'mutation_id':body['p_mutation']}
            records[new['id']]=new
            result={'status':'applied','record':new}
    elif path=='/rest/v1/whalex_records':
        offset=int(query.get('offset',['0'])[0]); limit=int(query.get('limit',['500'])[0])
        result=sorted(cloud.setdefault(user,{}).values(),key=lambda r:r['id'])[offset:offset+limit]
    else: status,result=404,{'message':'not implemented in mock'}
    route.fulfill(status=status,json=copy.deepcopy(result),headers=headers)

with sync_playwright() as p:
    executable=os.environ.get('WHALEX_CHROMIUM_PATH')
    browser=p.chromium.launch(headless=True,**({'executable_path':executable} if executable else {}),args=['--no-sandbox'])
    context=browser.new_context(viewport={'width':1536,'height':1000})
    # This suite checks storage/sync across devices; motion has its own GPU regression.
    context.add_init_script("localStorage.setItem('whalex_scene_mode_v1','still')")
    page=context.new_page(); errors=[]
    page.on('pageerror',lambda error:errors.append(str(error)))
    try:
        page.goto(BASE); ready(page)
        check('fresh startup has libraries and no fake notes',len(notes(page))==0 and len(rows(page))==4)
        form=page.locator('#inlineComposer')
        form.locator('[name=content]').focus()
        form.locator('.capture-details > summary').click()
        form.locator('[name=title]').fill('合同审核提示词')
        form.locator('[name=content]').fill('审阅合同，逐项说明履约责任、风险和最小修改建议。')
        form.locator('[data-action=suggest]').click()
        check('local routing suggests Legal',form.locator('[name=libraryId]').input_value()=='lib-legal')
        form.locator('[name=tag]').fill('Legal,合同'); form.locator('[name=tag]').press('Enter')
        form.locator('button[type=submit]').click()
        page.wait_for_function('() => document.querySelectorAll(".note-card").length === 1')
        saved=notes(page)[0]
        check('library and tags saved',saved['payload']['libraryId']=='lib-legal' and saved['payload']['tags']==['Legal','合同'])
        page.reload(); ready(page)
        check('note survives reload',len(notes(page))==1)
        page.locator('#inlineComposer [name=content]').fill('未保存但应该保留的草稿')
        page.reload(); ready(page)
        check('draft survives reload',page.locator('#inlineComposer [name=content]').input_value()=='未保存但应该保留的草稿')
        capture=context.new_page(); capture.goto(BASE+'/capture.html')
        capture.wait_for_function("() => document.querySelectorAll('[name=libraryId] option').length >= 4")
        capture.locator('.capture-details > summary').click()
        capture.locator('[name=content]').fill('从独立悬浮输入窗口保存')
        capture.locator('[name=libraryId]').select_option('lib-ai')
        capture.locator('[name=tag]').fill('Agent'); capture.locator('button[type=submit]').click()
        page.wait_for_function('() => document.querySelectorAll(".note-card").length === 2')
        check('standalone capture updates main window',len(notes(page))==2)
        check('capture does not overwrite main draft',page.locator('#inlineComposer [name=content]').input_value()=='未保存但应该保留的草稿')
        capture.close()
        page.locator('#searchInput').fill('独立悬浮')
        page.wait_for_function('() => document.querySelectorAll(".note-card").length === 1')
        check('full-text search works')
        page.locator('#searchInput').fill(''); page.wait_for_timeout(150)
        first_id=notes(page)[0]['id']
        page.locator(f'[data-record="{first_id}"] .record-menu > summary').click()
        page.locator(f'[data-note-act=edit][data-id="{first_id}"]').click()
        page.locator('#editorRoot [name=content]').fill('更新后的提示词')
        page.locator('#editorRoot button[type=submit]').click()
        page.wait_for_function('() => !document.querySelector("#editorDialog").open')
        check('editing updates without duplicating',len(notes(page))==2 and any(r['payload']['content']=='更新后的提示词' for r in notes(page)))
        page.evaluate("() => WhaleXStore.put('note',{title:'<img src=x onerror=alert(1)>',content:'<script>bad()</script>',tags:['<x>']})")
        page.wait_for_function("() => document.querySelector('#noteGrid').textContent.includes('<script>bad()</script>')")
        check('user markup escaped',page.locator('#noteGrid img').count()==0 and '<script>' in page.locator('#noteGrid').inner_text())
        check('no desktop horizontal overflow',page.evaluate('document.documentElement.scrollWidth <= innerWidth'))
        page.evaluate("() => WhaleXStore.metadata('review',{count:7,age:30})")
        context.route('https://test.supabase.co/**',api)
        page.evaluate("() => WhaleXSync.configure('https://test.supabase.co','sb_publishable_test')")
        page.evaluate("() => WhaleXSync.login('a@example.test','testpassword')")
        page.wait_for_timeout(400)
        check('login does not upload offline workspace',len(notes(page))==0)
        check('history stays separated by account',page.evaluate("id=>WhaleXStore.history(id)",first_id)==[])
        check('review preferences stay separated by account',page.evaluate("()=>WhaleXStore.metadata('review')") is None)
        page.evaluate("() => WhaleXStore.put('note',{title:'同步测试',content:'跨设备内容',libraryId:'lib-work',tags:['云同步']})")
        page.wait_for_timeout(1600); page.evaluate('() => WhaleXSync.syncNow()')
        page.wait_for_function("() => WhaleXSync.status().mode === 'synced'")
        check('push acknowledges dirty records',any(r['kind']=='note' for r in cloud['user-a'].values()) and all(not r['dirty'] for r in rows(page)))
        second_context=browser.new_context(viewport={'width':1200,'height':900})
        second_context.add_init_script("localStorage.setItem('whalex_scene_mode_v1','still')")
        second_context.route('https://test.supabase.co/**',api)
        device=second_context.new_page(); device.goto(BASE); ready(device)
        device.evaluate("() => WhaleXSync.configure('https://test.supabase.co','sb_publishable_test')")
        device.evaluate("() => WhaleXSync.login('a@example.test','testpassword')")
        device.wait_for_timeout(1600); device.evaluate('() => WhaleXSync.syncNow()')
        check('second device pulls tags and text',len(notes(device))==1 and notes(device)[0]['payload']['tags']==['云同步'])
        sync_id=notes(device)[0]['id']
        second_context.set_offline(True)
        device.evaluate("id => WhaleXStore.patch(id,{content:'离线修改'})",sync_id)
        check('offline edit durable',notes(device)[0]['payload']['content']=='离线修改' and notes(device)[0]['dirty'])
        second_context.set_offline(False); device.wait_for_timeout(1800); device.evaluate('() => WhaleXSync.syncNow()')
        page.evaluate('() => WhaleXSync.syncNow()'); page.wait_for_timeout(300)
        check('reconnect retries local edits',notes(page)[0]['payload']['content']=='离线修改')
        context.set_offline(True); second_context.set_offline(True)
        page.evaluate("id => WhaleXStore.patch(id,{content:'设备 A 的编辑'})",sync_id)
        device.evaluate("id => WhaleXStore.patch(id,{content:'设备 B 的编辑'})",sync_id)
        context.set_offline(False); page.wait_for_timeout(1700); page.evaluate('() => WhaleXSync.syncNow()')
        second_context.set_offline(False); device.wait_for_timeout(2300); device.evaluate('() => WhaleXSync.syncNow()')
        texts=[r['payload']['content'] for r in notes(device)]
        check('conflicts preserve both devices text','设备 A 的编辑' in texts and '设备 B 的编辑' in texts)
        template=copy.deepcopy(next(r for r in cloud['user-a'].values() if r['kind']=='note'))
        for i in range(1105):
            record=copy.deepcopy(template); record['id']=f'bulk-{i:04d}'; cloud['user-a'][record['id']]=record
        device.evaluate('() => WhaleXSync.syncNow()')
        device.wait_for_function("async () => { await WhaleXSync.syncNow(); return (await WhaleXStore.all()).filter(r=>r.kind==='note'&&!r.deleted).length >= 1107; }",polling=200,timeout=20000)
        check('pull pagination exceeds 1000 records',len(notes(device))>=1107)
        page.evaluate('() => WhaleXSync.logout()'); page.wait_for_timeout(300)
        check('logout preserves offline workspace',len(notes(page))==3)
        check('offline review preferences remain intact',page.evaluate("()=>WhaleXStore.metadata('review')")['count']==7)
        page.evaluate("() => WhaleXSync.login('b@example.test','testpassword')"); page.wait_for_timeout(400)
        check('accounts have separate local caches',len(notes(page))==0)
        check('privileged keys rejected',page.evaluate("() => {try{WhaleXSync.validateConfig('https://test.supabase.co','sb_secret_no');return false}catch{return true}}"))
        page.evaluate('() => WhaleXSync.logout()'); page.wait_for_timeout(300)
        before=len(notes(page)); page.evaluate('async () => WhaleXStore.importBackup(await WhaleXStore.backup())')
        check('backup import creates safe copies',len(notes(page))==before*2)
        page.set_viewport_size({'width':390,'height':844}); page.wait_for_timeout(200)
        check('mobile no horizontal overflow',page.evaluate('document.documentElement.scrollWidth <= innerWidth'))
        page.screenshot(path=str(ROOT/'tests/mobile-preview.png'),full_page=True)
        page.set_viewport_size({'width':1536,'height':1000}); page.wait_for_timeout(200)
        page.screenshot(path=str(ROOT/'tests/desktop-preview.png'),full_page=True)
        check('no unhandled browser errors',not errors)
        second_context.close()
    except Exception:
        print('Browser errors:',errors,flush=True)
        print('Sync state:',page.evaluate('() => window.WhaleXSync?.status()'),flush=True)
        page.screenshot(path=str(ROOT/'tests/failure-preview.png'),full_page=True)
        raise
    finally:
        context.close(); browser.close(); server.shutdown()
print(f'{len(checks)} browser checks passed. Supabase transport mocked; native desktop and live backend not covered.')
