"""GPU rendering, planetary flow, pause/restore and compatibility regression.
SwiftShader is used only by the disposable CI browser, never by the production page.
"""
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
    page.goto(url)
    page.wait_for_function('() => WhaleXScene?.inspect().spriteReady && WhaleXScene.inspect().backdropReady')
def pixels(page,selector):
    return page.locator(selector).evaluate('e=>e.toDataURL()')
try:
    with sync_playwright() as pw:
        exe=os.environ.get('CHROMIUM_PATH') or os.environ.get('WHALEX_CHROMIUM_PATH')
        browser=pw.chromium.launch(headless=True,args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'],**({'executable_path':exe} if exe else {}))
        context=browser.new_context(viewport={'width':1440,'height':900},device_scale_factor=1)
        context.add_init_script("localStorage.setItem('whalex_scene_mode_v1','still')")
        page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));ready(page)
        inspect=page.evaluate('WhaleXScene.inspect()')
        check('GPU whale samples original 1400px alpha texture',inspect['quality']=='observatory-hd-v2' and inspect['pixelBudget']=={'sky':8400000,'whale':3600000} and inspect['renderer']=={'renderer':'webgl','contextLost':False,'texture':[1400,597]})
        check('GPU background samples original landscape',inspect['backdrop']=={'renderer':'webgl','contextLost':False,'texture':[1672,941]})
        check('no vignette or scene dimming',page.locator('.cosmic-vignette').evaluate('e=>getComputedStyle(e).display')=='none' and page.locator('.cosmic-scene').evaluate('e=>getComputedStyle(e).opacity')=='1')
        selectors=['.cosmic-surface','.cosmic-canvas','.whale-canvas']
        before=[pixels(page,s) for s in selectors];page.wait_for_timeout(180)
        check('all three render layers freeze in still mode',before==[pixels(page,s) for s in selectors] and page.evaluate('WhaleXScene.inspect().frames')==0)
        # Sample planetary surface (not orbit or foreground stars), proving the image itself moves.
        planet_sample='''() => {const e=document.querySelector('.cosmic-surface'),out=document.createElement('canvas');out.width=96;out.height=80;const c=out.getContext('2d');c.drawImage(e,680,95,100,90,0,0,96,80);return out.toDataURL()}'''
        planet_before=page.evaluate(planet_sample)
        page.locator('.motion-control select').select_option('cinematic');page.wait_for_function('() => WhaleXScene.inspect().elapsed > 1.4',timeout=30000)
        check('planet texture and atmosphere flow',planet_before!=page.evaluate(planet_sample))
        check('whale starfield and backdrop independently animate',all(a!=pixels(page,s) for a,s in zip(before,selectors)))
        page.locator('.motion-control select').select_option('gentle')
        page.wait_for_function('() => WhaleXScene.inspect().motionStrength < .4',timeout=30000)
        check('gentle mode clearly reduces movement amplitude',page.evaluate('WhaleXScene.inspect().motionStrength')<.4)
        page.locator('#recordTrigger').click();expect(page.locator('#inlineComposer textarea')).to_be_focused()
        check('writing never dims the scene',page.locator('.cosmic-scene').evaluate('e=>getComputedStyle(e).opacity')=='1')
        page.keyboard.press('Escape');page.locator('.motion-control select').select_option('still')
        page.reload();page.wait_for_function('() => WhaleXScene?.inspect().spriteReady && WhaleXScene.inspect().backdropReady')
        check('mode persists without a motion loop',page.evaluate('WhaleXScene.inspect().mode')=='still' and not page.evaluate('WhaleXScene.inspect().running'))
        # Lost contexts fall back visibly, then restore their texture without reloading notes.
        page.evaluate("() => {window.__testLoss=document.querySelector('.whale-canvas').getContext('webgl').getExtension('WEBGL_lose_context');window.__testLoss.loseContext()}")
        page.wait_for_function('() => WhaleXScene.inspect().renderer.contextLost')
        check('context loss exposes static whale fallback',page.locator('body').evaluate('e=>e.classList.contains("whale-fallback")') and page.locator('.hero-art').is_visible())
        page.evaluate("() => window.__testLoss.restoreContext()")
        page.wait_for_function('() => !WhaleXScene.inspect().renderer.contextLost')
        check('restored context redraws its texture',not page.locator('body').evaluate('e=>e.classList.contains("whale-fallback")'))
        page.locator('.motion-control select').select_option('cinematic');page.emulate_media(reduced_motion='reduce');page.wait_for_timeout(120)
        before=[pixels(page,s) for s in selectors];page.wait_for_timeout(180)
        check('reduced motion freezes all GPU and canvas layers',before==[pixels(page,s) for s in selectors] and not page.evaluate('WhaleXScene.inspect().running'))
        retina=browser.new_context(viewport={'width':1920,'height':1080},device_scale_factor=2)
        retina.add_init_script("localStorage.setItem('whalex_scene_mode_v1','still')")
        retina_page=retina.new_page();ready(retina_page)
        retina_inspect=retina_page.evaluate('WhaleXScene.inspect()')
        check('1080p desktop keeps a full 2x scene without upscaling',retina_page.locator('.cosmic-surface').evaluate('e=>[e.width,e.height]')==[3840,2160] and retina_inspect['dpr']==2 and retina_inspect['whaleDpr']==2)
        retina.close()
        phone=browser.new_context(viewport={'width':390,'height':844},device_scale_factor=3,is_mobile=True,has_touch=True)
        phone.add_init_script("localStorage.setItem('whalex_scene_mode_v1','still')")
        mobile=phone.new_page();ready(mobile)
        check('mobile HD whale and 2x background stay within budgets',mobile.locator('.whale-canvas').evaluate('e=>[e.width,e.height]')==[1086,930] and mobile.locator('.cosmic-surface').evaluate('e=>[e.width,e.height]')==[780,1688])
        for mode in ['cinematic','gentle','still']:
            mobile.locator('.motion-control select').select_option(mode);mobile.wait_for_timeout(120)
            check('mobile '+mode+' mode available',mobile.evaluate('WhaleXScene.inspect().mode')==mode)
        fallback=browser.new_context(viewport={'width':1280,'height':800})
        fallback.add_init_script("const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return type.includes('webgl')?null:original.call(this,type,...args)};localStorage.setItem('whalex_scene_mode_v1','still')")
        compat=fallback.new_page();ready(compat)
        check('non-WebGL devices keep original whale and all controls',compat.evaluate('WhaleXScene.inspect().renderer.renderer')=='canvas2d' and compat.locator('.motion-control option').count()==3)
        compat.locator('#recordTrigger').click();compat.locator('#inlineComposer textarea').fill('HD compatibility record');compat.locator('#inlineComposer .paper-save').click();expect(compat.locator('.note-card')).to_have_count(1)
        check('compatibility renderer preserves capture and save')
        page.evaluate('WhaleXScene.dispose()');check('all renderer surfaces are released',page.locator('.cosmic-surface,.cosmic-canvas,.whale-canvas,.motion-control').count()==0)
        check('no unhandled browser errors',not errors)
        print(json.dumps({'checks':len(checks),'passed':checks,'errors':errors},ensure_ascii=False))
        browser.close()
finally:server.shutdown()
