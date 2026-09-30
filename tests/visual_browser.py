"""Validate the visual-only homepage brief in isolated browser storage."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from playwright.sync_api import sync_playwright, expect
import os, json

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
    page.wait_for_function('() => document.querySelector("#noteGrid .empty") || document.querySelector("#noteGrid .note-card")')
    page.wait_for_function('() => WhaleXScene.inspect().spriteReady')
def zero(page):
    expect(page.locator('.layout-overview')).to_be_hidden()
    check('zero badges and composer word-count are hidden',page.evaluate('''() =>
      [...document.querySelectorAll('.sidebar em,[data-review-count],#weekCount,#inboxCount,#todayCount,.paper-under [data-count]')]
        .every(e=>!e.getClientRects().length || (e.textContent.trim() && !/^0(?: 字)?$/.test(e.textContent.trim())))'''))
    check('one empty state with one sentence and one primary action',page.locator('.empty').count()==1 and page.locator('.empty strong').inner_text()=='好想法，从第一张便签开始' and page.locator('.empty button').count()==1 and page.locator('.empty p').count()==0)
    check('zero record subtitle is hidden',not page.locator('#viewSubtitle').is_visible())
try:
    with sync_playwright() as pw:
        executable=os.environ.get('CHROMIUM_PATH') or os.environ.get('WHALEX_CHROMIUM_PATH')
        browser=pw.chromium.launch(headless=True,args=['--no-sandbox'],**({'executable_path':executable} if executable else {}))
        context=browser.new_context(viewport={'width':1920,'height':1080})
        context.add_init_script("localStorage.setItem('whalex_scene_mode_v1','still')")
        page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto(url);ready(page);zero(page)
        check('duplicate whale poster and overlapping copy removed',page.locator('.sidebar-poster,.handwritten-note,.hero-description,.brand small').count()==0)
        check('one hero whale source and one English hero line',page.locator('img[src$="whale-luminous.webp"]').count()==1 and page.locator('body').inner_text().count('YOUR AI CO-PILOT')==1)
        check('redundant slogans removed',all(text not in page.locator('body').inner_text() for text in ['更好的想法','好想法，值得被好好保存','更大的想法','让每一个想法','让灵感不再稍纵即逝']))
        style=page.locator('#inlineComposer .sticky-paper').evaluate('''e=>{
          const c=getComputedStyle(e),b=getComputedStyle(e,'::before'),r=e.getBoundingClientRect(),parent=e.closest('.right-column').getBoundingClientRect();
          return {background:c.backgroundColor,blur:c.backdropFilter,radius:c.borderRadius,animation:c.animationName,transform:c.transform,bar:b.height,barTransform:b.transform,aligned:Math.abs(r.x-parent.x)<1&&Math.abs(r.width-parent.width)<1};
        }''')
        check('glass composer uses exact dark fill and blur',style['background']=='rgba(13, 25, 48, 0.75)' and style['blur']=='blur(20px)')
        check('stationary composer aligns with right grid',style['aligned'] and style['animation']=='none' and style['transform']=='none')
        check('tape becomes straight 3px accent',style['bar']=='3px' and style['barTransform']=='none')
        check('peer card radii and borders match task card',page.evaluate('''() => {
          const selectors=['#inlineComposer .sticky-paper','.today-panel','.review-entry','.notes-section'];
          return new Set(selectors.map(s=>getComputedStyle(document.querySelector(s)).borderRadius)).size===1 && new Set(selectors.map(s=>getComputedStyle(document.querySelector(s)).border)).size===1;
        }'''))
        check('dark content and readable shortcut',page.locator('.paper-content').evaluate('e=>getComputedStyle(e).color')=='rgb(201, 214, 242)' and page.locator('.paper-shortcut').evaluate('e=>getComputedStyle(e).fontSize')=='12px' and page.locator('.paper-shortcut').evaluate('e=>getComputedStyle(e).opacity')=='0.6')
        check('empty side widgets are 48px',all(abs(page.locator(s).bounding_box()['height']-48)<1 for s in ['.today-panel','.review-entry']))
        check('hero copy is a 75 percent, 0.68 opacity watermark',page.locator('.hero-copy').evaluate('e=>getComputedStyle(e).opacity')=='0.68' and page.locator('.hero-copy').evaluate('e=>getComputedStyle(e).transform')=='matrix(0.75, 0, 0, 0.75, 0, 0)')
        check('records header appears in first 1080p viewport',page.locator('.notes-section>.section-title').bounding_box()['y']<600)
        check('top controls share radius without changing scene switch',page.evaluate('''() => new Set(['.motion-control','.sync-chip','.round-button'].map(s=>getComputedStyle(document.querySelector(s)).borderRadius)).size===1''') and page.locator('.motion-control option').count()==3)
        for mode in ['cinematic','gentle','still']:
            page.locator('.motion-control select').select_option(mode)
            page.wait_for_function('(mode)=>WhaleXScene.inspect().mode===mode',arg=mode)
        check('all three existing motion settings work')
        check('footer controls share vertical alignment',abs(page.locator('.scene-status').bounding_box()['y']-page.locator('.bottom-note>.text-button').bounding_box()['y'])<1)
        page.screenshot(path=str(ROOT/'tests/visual-empty-desktop-preview.png'),full_page=True)
        page.locator('.toolbar [data-act=overview]').click();expect(page.locator('#workspaceTitle')).to_have_text('知识概览');page.locator('[data-close=workspaceDialog]').click()
        page.locator('.sidebar [data-act=insight]').click();expect(page.locator('#insightForm')).to_be_visible();page.locator('[data-close=workspaceDialog]').click()
        check('overview and refinement remain accessible when stats hidden')
        page.locator('.empty [data-act=focus]').click();expect(page.locator('#inlineComposer textarea')).to_be_focused()
        page.locator('#inlineComposer textarea').fill('视觉验收：保存交互保持不变')
        expect(page.locator('.paper-under [data-count]')).to_be_visible()
        page.locator('#inlineComposer .paper-save').click();expect(page.locator('.note-card')).to_have_count(1)
        expect(page.locator('.layout-overview')).to_be_visible();expect(page.locator('#weekCount')).to_have_text('1')
        expect(page.locator('.sidebar [data-count=all]')).to_have_text('1');expect(page.locator('[data-review-count]').first).to_be_hidden()
        check('nonzero counts return and individual zero review badges stay hidden')
        awaitable='''async()=>{
          const old=new Date(Date.now()-10*86400000).toISOString();
          await WhaleXStore.put('note',{title:'旧记录回顾验收',content:'回顾记录',type:'Idea',libraryId:'lib-legal',tags:['工作/法务'],created:old});
          await WhaleXStore.put('note',{title:'待办验收',content:'待办仍可完成',type:'Todo',libraryId:'lib-work',tags:['测试']});
        }'''
        page.evaluate(awaitable);page.wait_for_function('() => !document.querySelector(".today-panel").classList.contains("is-empty") && !document.querySelector(".review-entry").classList.contains("is-empty")')
        check('task and review widgets expand when data arrives')
        page.locator('#todayTasks [data-note-act=done]').click();expect(page.locator('#todayCount')).to_have_text('1/1')
        page.locator('#searchInput').fill('旧记录回顾验收');expect(page.locator('.note-card')).to_have_count(1)
        page.locator('.record-title').click();expect(page.locator('#workspaceTitle')).to_have_text('旧记录回顾验收');page.locator('[data-close=workspaceDialog]').click()
        page.locator('#searchInput').fill('');expect(page.locator('.note-card')).to_have_count(3)
        page.screenshot(path=str(ROOT/'tests/visual-filled-desktop-preview.png'),full_page=True)
        check('task completion, search and record detail remain functional')
        for width in [1672,1280,980,760,390]:
            page.set_viewport_size({'width':width,'height':844});page.wait_for_timeout(180)
            check(f'no horizontal overflow at {width}px',page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'))
            if width>760:
                check(f'composer stays inside right column at {width}px',page.locator('#inlineComposer .sticky-paper').evaluate('e=>{const r=e.getBoundingClientRect(),p=e.closest(".right-column").getBoundingClientRect();return r.left>=p.left-1&&r.right<=p.right+1}'))
        page.locator('.mobile-tools').click();expect(page.locator('#workspaceTitle')).to_have_text('更多功能');page.locator('[data-close=workspaceDialog]').click()
        check('mobile secondary navigation remains accessible')
        # Recreate a fresh visitor so no zero-state assertions depend on seeded data.
        mobile=context.browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,device_scale_factor=3)
        mobile.add_init_script("localStorage.setItem('whalex_scene_mode_v1','still')")
        phone=mobile.new_page();phone.goto(url);ready(phone);zero(phone)
        phone.screenshot(path=str(ROOT/'tests/visual-empty-mobile-preview.png'),full_page=True)
        check('mobile retains approved 3x whale renderer',phone.evaluate('WhaleXScene.inspect().whaleDpr')==3)
        floating=context.new_page();floating.goto(url+'capture.html');floating.wait_for_selector('.sticky-paper textarea')
        check('separate capture window uses same glass theme',floating.locator('.sticky-paper').evaluate('e=>getComputedStyle(e).backgroundColor')=='rgba(13, 25, 48, 0.75)')
        check('separate capture window has no paper tape',floating.locator('.sticky-paper').evaluate('e=>getComputedStyle(e,"::before").height')=='3px' and floating.locator('.sticky-paper').evaluate('e=>getComputedStyle(e,"::before").transform')=='none')
        check('no unhandled page errors',not errors)
        browser.close()
finally:
    server.shutdown()
print(json.dumps({'checks':len(checks),'passed':checks},ensure_ascii=False))
