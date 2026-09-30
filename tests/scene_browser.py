"""Real Chromium motion/accessibility tests without weakening the site's CSP."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from playwright.sync_api import sync_playwright, expect
import json
import os
import time

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'tests' / 'motion-review'
OUT.mkdir(exist_ok=True)
checks = []
def check(name, condition):
    assert condition, name
    checks.append(name)
    print('PASS:', name, flush=True)
def ready(page):
    page.wait_for_selector('.whale-canvas')
    deadline = time.monotonic() + 15
    while time.monotonic() < deadline:
        if page.evaluate('() => Boolean(window.WhaleXScene?.inspect().spriteReady)'):
            return
        page.wait_for_timeout(100)
    raise AssertionError('Whale sprite failed to load')
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass
server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Quiet, directory=str(ROOT / 'web')))
Thread(target=server.serve_forever, daemon=True).start()
url = f'http://127.0.0.1:{server.server_port}/'
try:
    with sync_playwright() as pw:
        options = {'headless': True}
        if os.environ.get('CHROMIUM_PATH'):
            options['executable_path'] = os.environ['CHROMIUM_PATH']
        browser = pw.chromium.launch(**options)
        context = browser.new_context(viewport={'width': 1672, 'height': 941}, device_scale_factor=1)
        page = context.new_page()
        errors, requests = [], []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('request', lambda r: requests.append(r.url))
        page.goto(url)
        ready(page)
        page.wait_for_selector('#inlineComposer textarea')
        page.wait_for_timeout(700)
        page.screenshot(path=str(OUT/'initial-preview.png'), full_page=True)
        first = page.evaluate('WhaleXScene.inspect()')
        page.wait_for_timeout(650)
        second = page.evaluate('WhaleXScene.inspect()')
        check('animation clock advances', second['frames'] > first['frames'] and second['elapsed'] > first['elapsed'])
        check('decorative canvas never captures pointer events', page.locator('.cosmic-scene').evaluate("e=>getComputedStyle(e).pointerEvents==='none'"))
        sky1 = page.evaluate("document.querySelector('.cosmic-canvas').toDataURL()")
        whale1 = page.evaluate("document.querySelector('.whale-canvas').toDataURL()")
        page.wait_for_timeout(1100)
        check('galaxy and laser pixels animate', sky1 != page.evaluate("document.querySelector('.cosmic-canvas').toDataURL()"))
        check('whale pixels animate independently', whale1 != page.evaluate("document.querySelector('.whale-canvas').toDataURL()"))
        page.locator('#inlineComposer [name=title]').fill('动态界面测试')
        page.locator('#inlineComposer [name=content]').fill('请基于原文整理合同条款，并保留引用。')
        page.locator('#inlineComposer [name=libraryId]').select_option('lib-legal')
        page.locator('#inlineComposer [name=tag]').fill('动画验收')
        page.locator('#inlineComposer [name=tag]').press('Enter')
        check('writing mode enabled while editing', page.locator('body').evaluate("e=>e.classList.contains('scene-writing')"))
        page.locator('#inlineComposer .paper-save').click()
        expect(page.locator('#noteGrid')).to_contain_text('动态界面测试')
        saved = page.evaluate("async()=> (await WhaleXStore.all()).find(r=>r.kind==='note')")
        check('capture preserves text library and tag', saved['payload']['libraryId'] == 'lib-legal' and '动画验收' in saved['payload']['tags'])
        page.get_by_label('背景动效').select_option('still')
        page.wait_for_timeout(300)
        still = page.evaluate('WhaleXScene.inspect()')
        still_pixels = page.evaluate("document.querySelector('.whale-canvas').toDataURL()")
        page.wait_for_timeout(700)
        check('static mode stops requestAnimationFrame', page.evaluate('WhaleXScene.inspect().frames') == still['frames'])
        check('static whale remains pixel-identical', still_pixels == page.evaluate("document.querySelector('.whale-canvas').toDataURL()"))
        page.reload()
        ready(page)
        check('motion setting survives reload', page.evaluate('WhaleXScene.inspect().mode') == 'still')
        page.get_by_label('背景动效').select_option('cinematic')
        page.emulate_media(reduced_motion='reduce')
        page.wait_for_timeout(200)
        stopped = page.evaluate('WhaleXScene.inspect()')
        page.wait_for_timeout(500)
        check('system reduced motion overrides cinematic', stopped['effective'] == 'still' and page.evaluate('WhaleXScene.inspect().frames') == stopped['frames'])
        page.emulate_media(reduced_motion='no-preference')
        page.wait_for_timeout(300)
        check('animation resumes when reduction removed', page.evaluate('WhaleXScene.inspect().running'))
        page.evaluate("window.dispatchEvent(new PageTransitionEvent('pagehide', {persisted:true}))")
        n = page.evaluate('WhaleXScene.inspect().frames')
        page.wait_for_timeout(500)
        check('bfcache pagehide suspends animation', page.evaluate('WhaleXScene.inspect().frames') == n)
        page.evaluate("window.dispatchEvent(new PageTransitionEvent('pageshow', {persisted:true}))")
        page.wait_for_timeout(500)
        check('bfcache pageshow resumes animation', page.evaluate('WhaleXScene.inspect().frames') > n)
        for w, h in [(1672,941), (1280,800), (980,800), (760,900), (390,844)]:
            page.set_viewport_size({'width':w,'height':h})
            page.wait_for_timeout(450)
            page.screenshot(path=str(OUT/f'width-{w}-preview.png'), full_page=True)
            check(f'no horizontal overflow at {w}px', page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'))
        page.screenshot(path=str(OUT/'mobile-preview.png'), full_page=True)
        page.set_viewport_size({'width':1672,'height':941})
        page.locator('body').click(position={'x':1000,'y':15})
        page.evaluate('window.scrollTo(0,0)')
        page.wait_for_timeout(600)
        check('DPR is capped', page.evaluate('WhaleXScene.inspect().dpr') <= 1.5)
        page.screenshot(path=str(OUT/'desktop-preview.png'), full_page=True)
        page.locator('.hero').screenshot(path=str(OUT/'hero-preview.png'))
        page.locator('#inlineComposer').screenshot(path=str(OUT/'sticky-preview.png'))
        for i in range(8):
            page.wait_for_timeout(220)
            page.locator('.hero').screenshot(path=str(OUT/f'motion-{i:02}.png'))
        check('all assets and scripts are same-origin', all(r.startswith(url) or r.startswith('data:') for r in requests))
        page.evaluate('WhaleXScene.dispose()')
        check('dispose removes canvas and controls', page.locator('.cosmic-canvas,.whale-canvas,.motion-control').count() == 0)
        check('no unhandled browser errors', not errors)
        report = {'checks':len(checks),'passed':checks,'sample':second,'errors':errors,'limitations':'Chromium CI only; no guarantee for native Windows/GPU frame rate or live sync.'}
        (OUT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
        browser.close()
        print(json.dumps(report,ensure_ascii=False,indent=2))
finally:
    server.shutdown()
