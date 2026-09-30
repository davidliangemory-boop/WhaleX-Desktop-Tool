"""Guard approved scene geometry, background pixels and the Retina whale renderer."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from playwright.sync_api import sync_playwright
import hashlib, json, os, re

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / 'tests/scene-lock.json'
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *args): pass
def serve(folder):
    server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(folder)))
    Thread(target=server.serve_forever,daemon=True).start()
    return server, f'http://127.0.0.1:{server.server_port}/'
def scene(page, url, w, h):
    page.set_viewport_size({'width':w,'height':h})
    page.goto(url)
    page.wait_for_function('() => window.WhaleXScene?.inspect().spriteReady')
    page.wait_for_selector('#inlineComposer textarea')
    page.wait_for_timeout(250)
    return page.evaluate('''() => {
      const rect=e=>{const r=e.getBoundingClientRect();return [r.x,r.y,r.width,r.height].map(n=>Math.round(n*100)/100)};
      return {hero:rect(document.querySelector('.hero')),canvas:rect(document.querySelector('.whale-canvas')),
        sky:document.querySelector('.cosmic-canvas').toDataURL(),whale:document.querySelector('.whale-canvas').toDataURL(),
        backdrop:getComputedStyle(document.querySelector('.cosmic-scene'),'::before').background.replace(location.origin,'<origin>')};
    }''')
manifest=json.loads(MANIFEST.read_text())
for path, expected in manifest['sha256'].items():
    assert hashlib.sha256((ROOT/path).read_bytes()).hexdigest()==expected, f'Locked scene file changed: {path}'
hero=re.search(r'<section class="hero".*?</section>',(ROOT/'web/index.html').read_text(),re.S)[0]
assert hashlib.sha256(hero.encode()).hexdigest()==manifest['heroSha256'], 'Locked hero markup changed'
server,url=serve(ROOT/'web')
reference=os.environ.get('WHALEX_REFERENCE_WEB')
refserver,refurl=serve(reference) if reference else (None,None)
sizes=[(1905,943),(1672,941),(1280,800),(980,800),(760,900),(390,844)]
try:
    with sync_playwright() as pw:
        executable=os.environ.get('CHROMIUM_PATH') or os.environ.get('WHALEX_CHROMIUM_PATH')
        browser=pw.chromium.launch(headless=True,args=['--no-sandbox'],**({'executable_path':executable} if executable else {}))
        context=browser.new_context(device_scale_factor=1)
        context.add_init_script("localStorage.setItem('whalex_scene_mode_v1','still')")
        page=context.new_page()
        baseline={}
        for w,h in sizes:
            actual=scene(page,url,w,h)
            key=f'{w}x{h}'
            baseline[key]={'hero':actual['hero'],'canvas':actual['canvas']}
            if os.environ.get('WHALEX_RECORD_SCENE'):
                continue
            assert baseline[key]==manifest['geometry'][key], f'Hero/whale moved at {key}: {baseline[key]}'
            if refurl:
                refpage=context.new_page()
                old=scene(refpage,refurl,w,h)
                # Whale antialiasing is the approved exception; backdrop and positions are not.
                for field in ['hero','canvas','sky','backdrop']:
                    assert actual[field]==old[field], f'Existing {field} changed at {key}'
                refpage.close()
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'), f'Horizontal overflow at {key}'
            print('PASS: approved scene files, unchanged geometry'+(' and background pixels' if refurl else '')+' at '+key,flush=True)
        for scale in [1,2,3]:
            retina=browser.new_context(viewport={'width':390,'height':844},device_scale_factor=scale,is_mobile=True,has_touch=True)
            retina.add_init_script("localStorage.setItem('whalex_scene_mode_v1','still')")
            mobile=retina.new_page()
            current=scene(mobile,url,390,844)
            metrics=mobile.evaluate('''() => {
              const whale=document.querySelector('.whale-canvas'),sky=document.querySelector('.cosmic-canvas');
              return {scene:WhaleXScene.inspect(),whale:[whale.width,whale.height],sky:[sky.width,sky.height]};
            }''')
            assert metrics['scene']['whaleDpr']==scale, metrics
            assert metrics['whale']==[362*scale,310*scale], metrics
            assert metrics['sky']==[390,844], metrics
            assert current['hero']==manifest['geometry']['390x844']['hero']
            if refurl:
                oldpage=retina.new_page();old=scene(oldpage,refurl,390,844)
                for field in ['hero','canvas','sky','backdrop']:
                    assert current[field]==old[field], f'Mobile {field} changed at DPR {scale}'
                oldpage.close()
            errors=[];mobile.on('pageerror',lambda error:errors.append(str(error)))
            still=mobile.evaluate("document.querySelector('.whale-canvas').toDataURL()")
            mobile.wait_for_timeout(120)
            assert mobile.evaluate("document.querySelector('.whale-canvas').toDataURL()") == still
            mobile.evaluate("WhaleXScene.setMode('cinematic')")
            mobile.wait_for_function('() => WhaleXScene.inspect().frames>=12')
            assert mobile.evaluate('WhaleXScene.inspect().running')
            mobile.set_viewport_size({'width':844,'height':390})
            mobile.wait_for_timeout(200)
            assert mobile.evaluate('document.querySelector(".whale-canvas").width*document.querySelector(".whale-canvas").height<=1803000')
            mobile.emulate_media(reduced_motion='reduce')
            mobile.wait_for_function("() => WhaleXScene.inspect().effective==='still' && !WhaleXScene.inspect().running")
            assert not errors,errors
            print(f'PASS: mobile DPR {scale}, original background resolution, motion, landscape pixel budget and reduced-motion',flush=True)
            retina.close()
        if os.environ.get('WHALEX_RECORD_SCENE'):
            manifest['geometry']=baseline
            Path('/tmp/whalex-layout-baseline-20260930/geometry.json').write_text(json.dumps(manifest,indent=2)+'\n')
            page.set_viewport_size({'width':1905,'height':943})
            page.goto(url); page.wait_for_function('() => window.WhaleXScene?.inspect().spriteReady')
            page.screenshot(path='/tmp/whalex-layout-baseline-20260930/home.png')
            print(json.dumps(baseline))
            print('Recorded approved scene geometry into temporary files at six viewports.')
        browser.close()
finally:
    server.shutdown()
    if refserver: refserver.shutdown()
