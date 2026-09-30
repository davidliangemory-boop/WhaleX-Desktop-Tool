"""Solid frame/drawer acceptance with isolated browser storage."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from playwright.sync_api import sync_playwright, expect
import os,json
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
    page.wait_for_selector('#inlineComposer textarea',state='attached')
    page.wait_for_function('() => document.querySelector("#noteGrid .empty") || document.querySelector("#noteGrid .note-card")')
    page.wait_for_function('() => WhaleXScene.inspect().spriteReady')
def hero(page):return page.locator('.hero').bounding_box()
def open_drawer(page):
    if page.locator('#inlineComposer').get_attribute('aria-hidden')=='true':page.locator('#recordTrigger').click()
    expect(page.locator('#inlineComposer textarea')).to_be_focused();page.wait_for_timeout(180)
def close_drawer(page):
    page.locator('#inlineComposer [data-action=close]').click()
    expect(page.locator('#inlineComposer')).to_have_attribute('aria-hidden','true');page.wait_for_timeout(180)
def tools_open(page):
    if not page.locator('#workbenchTools').evaluate('e=>e.open'):page.locator('#workbenchTools>summary').click()
def clear_stage(page):
    check('composer defaults closed and inert',page.locator('#inlineComposer').get_attribute('aria-hidden')=='true' and page.locator('#inlineComposer').evaluate('e=>e.inert'))
    check('sidebar is sole WhaleX wordmark',page.locator('.hero-copy,.hero h1,.hero p,.sidebar-poster').count()==0 and page.locator('body').inner_text().count('WhaleX')==1)
    check('zero stats and badges hidden',page.locator('.layout-overview').get_attribute('hidden') is not None and page.evaluate('''() => [...document.querySelectorAll('.sidebar em,[data-review-count],#weekCount,#inboxCount,#todayCount')].every(e=>!e.getClientRects().length || (e.textContent.trim() && e.textContent.trim()!=='0'))'''))
    check('one concise empty state',page.locator('.empty').count()==1 and page.locator('.empty strong').inner_text()=='还没有记录。好想法，从第一张便签开始。' and page.locator('.empty button').inner_text()=='记录一个想法')
try:
    with sync_playwright() as pw:
        executable=os.environ.get('CHROMIUM_PATH') or os.environ.get('WHALEX_CHROMIUM_PATH')
        browser=pw.chromium.launch(headless=True,args=['--no-sandbox'],**({'executable_path':executable} if executable else {}))
        context=browser.new_context(viewport={'width':1920,'height':1080})
        context.add_init_script("localStorage.setItem('whalex_scene_mode_v1','still')")
        page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto(url);ready(page);clear_stage(page)
        check('fixed solid sidebar without glow',page.locator('.sidebar').evaluate('e=>{const c=getComputedStyle(e);return c.position==="fixed"&&c.backgroundColor==="rgb(8, 15, 30)"&&c.backdropFilter==="none"&&c.boxShadow==="none"}'))
        check('short search with Ctrl K hint',page.locator('.search').bounding_box()['width']<=380 and page.locator('.search kbd').inner_text()=='Ctrl K')
        check('square solid bottom dock at 26 percent',page.locator('.notes-section').evaluate('e=>{const c=getComputedStyle(e),r=e.getBoundingClientRect();return c.position==="fixed"&&c.backgroundColor==="rgb(8, 15, 30)"&&c.borderRadius==="0px"&&c.backdropFilter==="none"&&Math.abs(r.height-innerHeight*.26)<1&&Math.abs(r.bottom-innerHeight)<1}'))
        check('top only search and status controls',not page.locator('.round-button').is_visible() and page.locator('.motion-control option').count()==3)
        page.screenshot(path=str(ROOT/'tests/visual-empty-desktop-preview.png'),full_page=True)
        initial=hero(page);page.locator('.empty button').click();page.wait_for_timeout(180)
        check('empty action opens drawer without moving whale',hero(page)==initial and page.locator('#inlineComposer').get_attribute('aria-hidden')=='false')
        check('drawer beyond whale canvas',page.locator('#inlineComposer').bounding_box()['x']>=initial['x']+initial['width'])
        check('solid drawer without blur or tape',page.locator('#inlineComposer .sticky-paper').evaluate('e=>{const c=getComputedStyle(e);return c.backgroundColor==="rgb(13, 22, 39)"&&c.backdropFilter==="none"&&getComputedStyle(e,"::before").display==="none"}'))
        check('160ms drawer transition',page.locator('#inlineComposer').evaluate('e=>getComputedStyle(e).transitionDuration.startsWith("0.16s, 0.16s")'))
        page.locator('#inlineComposer textarea').fill('抽屉草稿验收');close_drawer(page)
        expect(page.locator('.empty button')).to_be_focused()
        check('close restores focus and preserves draft',page.locator('#inlineComposer textarea').input_value()=='抽屉草稿验收')
        page.reload();ready(page)
        check('reload leaves draft intact and drawer closed',page.locator('#inlineComposer').get_attribute('aria-hidden')=='true' and page.locator('#inlineComposer textarea').input_value()=='抽屉草稿验收')
        page.keyboard.press('Control+k');expect(page.locator('#searchInput')).to_be_focused();check('Ctrl K remains search')
        page.keyboard.press('Control+Enter');expect(page.locator('#inlineComposer textarea')).to_be_focused()
        page.locator('#inlineComposer textarea').press('Control+Enter');expect(page.locator('.note-card')).to_have_count(1)
        check('Ctrl Enter opens then saves exactly one record',page.evaluate("async()=> (await WhaleXStore.all()).filter(r=>r.kind==='note'&&!r.deleted).length")==1)
        page.keyboard.press('Escape');expect(page.locator('#inlineComposer')).to_have_attribute('aria-hidden','true');check('Escape closes drawer')
        page.locator('.sidebar [data-act=capture]').click();expect(page.locator('#inlineComposer textarea')).to_be_focused();check('quick record opens drawer');close_drawer(page)
        tools_open(page);expect(page.locator('.today-panel')).to_be_visible();expect(page.locator('.layout-overview')).to_be_visible()
        check('task review overview and floating entries retained',page.locator('[data-act=floatcapture]').is_visible() and page.locator('.review-entry').is_visible())
        page.locator('.add-task').click();expect(page.locator('#inlineComposer textarea')).to_be_focused();expect(page.locator('#inlineComposer [name=type]')).to_have_value('Todo')
        page.locator('#inlineComposer textarea').fill('抽屉任务验收');page.locator('#inlineComposer .paper-save').click();expect(page.locator('.note-card')).to_have_count(2)
        tools_open(page);page.locator('#todayTasks [data-note-act=done]').click();expect(page.locator('#todayCount')).to_have_text('1/1');page.locator('#workbenchTools>summary').click();check('task creation and completion unchanged')
        page.locator('#searchInput').fill('抽屉草稿验收');expect(page.locator('.note-card')).to_have_count(1)
        page.locator('.record-title').click();expect(page.locator('#workspaceTitle')).to_have_text('抽屉草稿验收');page.locator('[data-close=workspaceDialog]').click()
        page.locator('#searchInput').fill('');expect(page.locator('.note-card')).to_have_count(2);check('search and details work')
        page.locator('.record-menu summary').first.click()
        popup=page.locator('.record-menu[open] .record-menu-pop');expect(popup).to_be_visible()
        check('record menu escapes dock clipping without covering whale',popup.bounding_box()['y']>=hero(page)['y']+hero(page)['height'] and popup.bounding_box()['y']+popup.bounding_box()['height']<=1080)
        popup.locator('[data-note-act=edit]').click();expect(page.locator('#editorDialog')).to_be_visible()
        page.locator('#editorRoot [data-action=close]').click();check('record menu edit still accessible')
        page.screenshot(path=str(ROOT/'tests/visual-filled-desktop-preview.png'),full_page=True)
        open_drawer(page);page.screenshot(path=str(ROOT/'tests/visual-drawer-desktop-preview.png'),full_page=True);close_drawer(page)
        for width,height in [(1920,1080),(1672,941),(1280,800),(980,800),(760,900),(390,844)]:
            page.set_viewport_size({'width':width,'height':height});page.wait_for_timeout(200)
            before=hero(page);open_drawer(page);r=page.locator('#inlineComposer').bounding_box()
            check(f'drawer avoids whale canvas at {width}px',r['x']>=before['x']+before['width']-1 if width>760 else r['y']>=before['y']+before['height'])
            check(f'drawer preserves geometry at {width}px',hero(page)==before)
            check(f'no horizontal overflow at {width}px',page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'));close_drawer(page)
        page.locator('.mobile-tools').click();expect(page.locator('#workspaceTitle')).to_have_text('更多功能');page.locator('[data-close=workspaceDialog]').click();check('mobile navigation preserved')
        mobile=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,device_scale_factor=3)
        mobile.add_init_script("localStorage.setItem('whalex_scene_mode_v1','still')")
        phone=mobile.new_page();phone.on('pageerror',lambda e:errors.append(str(e)));phone.goto(url);ready(phone);clear_stage(phone)
        check('mobile solid topbar and full-width whale',phone.locator('.topbar').evaluate('e=>getComputedStyle(e).backgroundColor')=='rgb(8, 15, 30)' and hero(phone)['width']==362)
        check('mobile 3x renderer unchanged',phone.evaluate('WhaleXScene.inspect().whaleDpr')==3)
        phone.screenshot(path=str(ROOT/'tests/visual-empty-mobile-preview.png'),full_page=True)
        open_drawer(phone);phone.screenshot(path=str(ROOT/'tests/visual-drawer-mobile-preview.png'),full_page=True);close_drawer(phone)
        for mode in ['cinematic','gentle','still']:
            phone.locator('.motion-control select').select_option(mode);phone.wait_for_function('(mode)=>WhaleXScene.inspect().mode===mode',arg=mode)
        check('three motion modes work')
        floating=context.new_page();floating.goto(url+'capture.html');floating.wait_for_selector('.sticky-paper textarea')
        check('standalone capture is solid',floating.locator('.sticky-paper').evaluate('e=>getComputedStyle(e).backgroundColor')=='rgb(13, 22, 39)')
        check('no unhandled errors',not errors);browser.close()
finally:server.shutdown()
print(json.dumps({'checks':len(checks),'passed':checks},ensure_ascii=False))
