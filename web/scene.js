/* WhaleX Observatory. Original Canvas/CSS implementation; research: docs/MOTION_DESIGN.md.
   Decorative only: no network services, credentials, note reads or writes. */
(() => {
  'use strict';
  const hero = document.querySelector('.hero');
  if (!hero || window.WhaleXScene) return;
  const KEY = 'whalex_scene_mode_v1', TAU = Math.PI * 2;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)'), coarse = matchMedia('(pointer: coarse)');
  let mode = 'cinematic';
  try { mode = localStorage.getItem(KEY) || mode; } catch {}
  if (!['cinematic', 'gentle', 'still'].includes(mode)) mode = 'cinematic';
  const layer = document.createElement('div');
  layer.className = 'cosmic-scene'; layer.setAttribute('aria-hidden', 'true');
  layer.innerHTML = '<canvas class="cosmic-canvas"></canvas><div class="cosmic-vignette"></div>';
  document.body.prepend(layer);
  const sky = layer.querySelector('canvas'), sea = document.createElement('canvas');
  sea.className = 'whale-canvas'; sea.setAttribute('aria-hidden', 'true'); hero.prepend(sea);
  const ctx = sky.getContext('2d'), whaleCtx = sea.getContext('2d');
  if (!ctx || !whaleCtx) { layer.remove(); sea.remove(); return; }
  document.body.classList.add('observatory');
  const control = document.createElement('label'); control.className = 'motion-control';
  control.innerHTML = '<span aria-hidden="true">✧</span><select aria-label="背景动效"><option value="cinematic">沉浸动效</option><option value="gentle">轻柔动效</option><option value="still">静止背景</option></select>';
  document.querySelector('.top-actions')?.prepend(control);
  const select = control.querySelector('select');
  let width = 1, height = 1, hw = 1, hh = 1, dpr = 1, raf = 0, last = 0, elapsed = 0;
  let frames = 0, disposed = false, pageAway = false, heroVisible = true, focused = false;
  let slow = false, averageCost = 0, resizeTimer, sprite = null;
  let pointer = { x: 0, y: 0 }, target = { x: 0, y: 0 }, activeCard = null;
  const listeners = [], interactionAnimations = new Set();
  function on(el, event, fn, opts) { el.addEventListener(event, fn, opts); listeners.push(() => el.removeEventListener(event, fn, opts)); }
  const random = (() => { let s = 37021; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; })();
  const stars = Array.from({ length: 170 }, () => ({ x: random(), y: random(), r: .25 + random() * 1.05, phase: random() * TAU, depth: .25 + random() * .75 }));
  const effective = () => reduced.matches ? 'still' : mode;
  const allowed = () => !disposed && !document.hidden && !pageAway && effective() !== 'still';
  function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function glow(c, x, y, r, color, alpha = 1) {
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${color},${alpha})`); g.addColorStop(.22, `rgba(${color},${alpha * .4})`); g.addColorStop(1, `rgba(${color},0)`);
    c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // Cache expensive dust and glow textures once.
  const nebula = canvas(900, 620), nc = nebula.getContext('2d');
  for (let i = 0; i < 120; i++) {
    const x = random() * 900, ridge = 280 + Math.sin(x / 155) * 135;
    glow(nc, x, ridge + (random() - .5) * 175, 35 + random() * 150, i % 3 ? '47,99,222' : '139,55,229', .045 + random() * .09);
  }
  const galaxy = canvas(800, 800), gc = galaxy.getContext('2d'); gc.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 7200; i++) {
    const r = Math.pow(random(), .72) * 350 + 4, arm = (i % 3) * TAU / 3;
    const a = arm + Math.log(1 + r / 15) * 1.78 + (random() - .5) * (.2 + r / 620);
    const x = 400 + Math.cos(a) * r, y = 400 + Math.sin(a) * r;
    if (i % 5 === 0) glow(gc, x, y, 10 + r / 35, i % 2 ? '88,125,255' : '160,92,230', .032);
    gc.fillStyle = `rgba(${r < 85 ? '227,216,255' : i % 3 ? '117,168,255' : '195,141,255'},${.06 + random() * .55})`;
    const size = .35 + random() * 1.1; gc.fillRect(x, y, size, size);
  }
  glow(gc, 400, 400, 150, '149,110,255', .4); glow(gc, 400, 400, 45, '231,222,255', .8);
  const halo = canvas(128, 128); glow(halo.getContext('2d'), 64, 64, 64, '95,176,255', .75);
  // Masked higher-resolution whale from the user's reference. Deform with source-over,
  // then screen-composite ONCE: additive per-strip drawing creates visible seams.
  const deform = canvas(784, 370), dc = deform.getContext('2d');
  const image = new Image();
  image.onload = () => { if (!disposed) { sprite = image; draw(); } };
  image.onerror = () => { if (!disposed) { document.body.classList.add('whale-fallback'); draw(); } };
  image.src = new URL('./assets/whale-isolated.webp', document.currentScript.src).href;
  const globe = canvas(920, 920), pc = globe.getContext('2d');
  pc.save(); pc.beginPath(); pc.arc(460, 460, 451, 0, TAU); pc.clip();
  const pg = pc.createRadialGradient(410, 40, 10, 460, 430, 700);
  pg.addColorStop(0, '#15385d'); pg.addColorStop(.43, '#081b36'); pg.addColorStop(1, '#030816');
  pc.fillStyle = pg; pc.fillRect(0, 0, 920, 920);
  for (let i = 0; i < 5200; i++) {
    const x = random() * 920, y = random() * 920;
    const ridge = Math.sin(x * .022 + Math.sin(y * .02)) + Math.sin(y * .015 - x * .005);
    if (ridge > .38) {
      pc.fillStyle = `rgba(85,149,200,${.025 + random() * .09})`;
      pc.fillRect(x, y, 1 + random() * 11, .4 + random() * 1.4);
      if (i % 39 === 0) glow(pc, x, y, 3, '163,193,231', .28);
    }
  }
  pc.restore();
  function size() {
    if (disposed) return;
    width = Math.max(1, innerWidth); height = Math.max(1, innerHeight);
    const rect = hero.getBoundingClientRect(); hw = Math.max(1, rect.width); hh = Math.max(1, rect.height);
    dpr = Math.min(devicePixelRatio || 1, slow || coarse.matches ? 1 : 1.5, Math.sqrt(2300000 / (width * height)));
    sky.width = Math.round(width * dpr); sky.height = Math.round(height * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    sea.width = Math.round(hw * dpr); sea.height = Math.round(hh * dpr); whaleCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }
  function drawGalaxy(c, x, y, radius, tilt, phase, opacity) {
    c.save(); c.translate(x, y); c.rotate(tilt); c.scale(1, .5); c.rotate(phase);
    c.globalAlpha = opacity; c.globalCompositeOperation = 'lighter';
    c.drawImage(galaxy, -radius, -radius, radius * 2, radius * 2); c.restore();
  }
  // Moving head and graduated trail on curved orbits, without high-frequency flashes.
  function orbit(c, x, y, rx, ry, tilt, phase, strength, front = false) {
    c.save(); c.translate(x, y); c.rotate(tilt); c.globalCompositeOperation = 'lighter';
    c.strokeStyle = `rgba(99,154,251,${.14 * strength})`; c.lineWidth = .7;
    c.beginPath(); c.ellipse(0, 0, rx, ry, 0, 0, TAU); c.stroke();
    for (let j = 0; j < 22; j++) {
      const a = phase - j * .021, next = a + .025;
      if (front && Math.sin(a) < 0) continue;
      c.strokeStyle = `rgba(${front ? '99,203,255' : '147,126,255'},${(1 - j / 22) * strength * .78})`;
      c.lineWidth = 1.1 + (1 - j / 22) * 1.4; c.beginPath(); c.ellipse(0, 0, rx, ry, 0, a, next); c.stroke();
    }
    if (!front || Math.sin(phase) >= 0) {
      const bx = Math.cos(phase) * rx, by = Math.sin(phase) * ry;
      c.globalAlpha = strength; c.drawImage(halo, bx - 18, by - 18, 36, 36);
      c.fillStyle = '#dcfaff'; c.beginPath(); c.arc(bx, by, 1.3, 0, TAU); c.fill();
    } c.restore();
  }
  function drawSky(t) {
    ctx.clearRect(0, 0, width, height);
    const px = pointer.x, py = pointer.y;
    ctx.save(); ctx.globalAlpha = focused ? .57 : .96;
    ctx.drawImage(nebula, -width * .1 + Math.sin(t * .032) * 40 + px * 9, -height * .12 + py * 6, width * 1.2, height * 1.25);
    ctx.restore(); ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let band = 0; band < 3; band++) {
      for (let x = 0; x < width; x += 12) {
        const y = height * (.09 + band * .07) + Math.sin(x / 220 + t * .14 + band) * 35 + Math.sin(x / 67 - t * .09) * 9;
        const a = (.022 + .028 * Math.pow(Math.sin(x / 180 + band + t * .08), 2)) * (focused ? .5 : 1);
        const gradient = ctx.createLinearGradient(x, y - 95, x, y + 35);
        gradient.addColorStop(0, 'rgba(61,218,250,0)'); gradient.addColorStop(.8, `rgba(${band % 2 ? '146,100,238' : '67,199,238'},${a})`); gradient.addColorStop(1, 'rgba(61,218,250,0)');
        ctx.fillStyle = gradient; ctx.fillRect(x, y - 95, 12, 130);
      }
    } ctx.restore();
    const count = coarse.matches || slow ? 85 : stars.length;
    for (let i = 0; i < count; i++) {
      const s = stars[i], x = (s.x * width + t * s.depth * 1.3 + px * s.depth * 14) % width;
      const y = (s.y * height + py * s.depth * 10 + Math.sin(t * .08 + s.phase) * 3 + height) % height;
      const a = .25 + .38 * (.5 + .5 * Math.sin(t * .65 + s.phase));
      ctx.fillStyle = `rgba(187,216,255,${a})`; ctx.beginPath(); ctx.arc(x, y, s.r, 0, TAU); ctx.fill();
      if (i % 28 === 0) { ctx.save(); ctx.globalAlpha = a * .7; ctx.drawImage(halo, x - 12, y - 12, 24, 24); ctx.restore(); }
    }
    drawGalaxy(ctx, width * .72 + px * 12, height * .18 + py * 9, Math.min(330, width * .25), -.26, t * .045, .8);
    drawGalaxy(ctx, width * .27, height * .87, Math.min(240, width * .21), .21, -t * .035 + 2, .5);
    orbit(ctx, width * .54, height * .51, width * .48, height * .3, -.22, t * .28, .48);
    orbit(ctx, width * .5, height * .76, width * .52, height * .15, -.12, -t * .2 + 2.1, .35);
    const flight = (t + 3) % 19;
    if (flight < 4.5 && effective() === 'cinematic') {
      const x = width * .18 + flight * width * .14, y = height * .035 + flight * 28;
      const g = ctx.createLinearGradient(x - 100, y - 28, x, y);
      g.addColorStop(0, '#81baff00'); g.addColorStop(1, '#aadeffb0'); ctx.strokeStyle = g; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x - 100, y - 28); ctx.lineTo(x, y); ctx.stroke();
    }
  }
  function drawWhale(t) {
    whaleCtx.clearRect(0, 0, hw, hh);
    const centerX = hw * .5 + pointer.x * 7, centerY = hh * .28 + pointer.y * 4;
    const w = Math.min(hw * .84, hh * 1.21, 580), h = w * 207 / 490;
    const horizon = whaleCtx.createRadialGradient(hw * .5, hh * 1.48, hh * .92, hw * .5, hh * 1.48, hh * 1.17);
    horizon.addColorStop(0, '#050d2200'); horizon.addColorStop(.81, '#102c591a'); horizon.addColorStop(.9, '#579cf06b'); horizon.addColorStop(.912, '#b4eeff96'); horizon.addColorStop(.925, '#316fdb3b'); horizon.addColorStop(1, '#0c154200');
    whaleCtx.save(); whaleCtx.globalAlpha = .6; whaleCtx.drawImage(globe, hw * .5 - hh * 1.15, hh * .35, hh * 2.3, hh * 2.3); whaleCtx.restore();
    whaleCtx.fillStyle = horizon; whaleCtx.fillRect(0, 0, hw, hh);
    drawGalaxy(whaleCtx, hw * .76, hh * .15, Math.min(hw * .24, 170), -.35, -t * .055, .75);
    orbit(whaleCtx, centerX, centerY + 42, w * .59, h * .32, -.14, t * .45, .7);
    if (sprite) {
      dc.clearRect(0, 0, deform.width, deform.height);
      dc.fillStyle = '#000'; dc.fillRect(0, 0, deform.width, deform.height);
      const strips = 98, sw = sprite.width / strips, dw = 700 / strips;
      for (let i = 0; i < strips; i++) {
        const u = i / (strips - 1), tail = Math.pow(1 - u, 2.4);
        const wave = Math.sin(t * 1.2 - u * 5) * tail * 14;
        const dh = 700 * 207 / 490 * (1 + Math.sin(t * 1.2 - u * 5 + .4) * tail * .02);
        dc.drawImage(sprite, i * sw, 0, sw, sprite.height, 42 + i * dw, 35 + wave, dw + .2, dh);
      }
      whaleCtx.save(); whaleCtx.translate(centerX + Math.sin(t * .23) * 12, centerY + Math.sin(t * .65) * 6);
      whaleCtx.rotate(Math.sin(t * .43) * .022); whaleCtx.globalCompositeOperation = 'screen';
      whaleCtx.drawImage(deform, -w * .56, -h * .62, w * 1.12, w * 370 / 700); whaleCtx.restore();
      whaleCtx.save(); whaleCtx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 24; i++) {
        const age = (t * .15 + i / 24) % 1;
        const x = centerX - w * .35 - age * 110, y = centerY + Math.sin(i * 3 + t * .9) * (8 + age * 14) - h * .1;
        whaleCtx.globalAlpha = (1 - age) * .42; whaleCtx.drawImage(halo, x - 3, y - 3, 6, 6);
      } whaleCtx.restore();
    }
    orbit(whaleCtx, centerX, centerY + 42, w * .59, h * .32, -.14, t * .45, .83, true);
  }
  function draw() { if (disposed || document.hidden || pageAway) return; drawSky(elapsed); if (heroVisible) drawWhale(elapsed); }
  function tick(now) {
    raf = 0; if (!allowed()) return;
    const fps = slow || coarse.matches || effective() === 'gentle' ? 30 : 60;
    if (last && now - last < 1000 / fps - 1) { raf = requestAnimationFrame(tick); return; }
    const dt = last ? Math.min((now - last) / 1000, .06) : 1 / fps; last = now;
    const lag = 1 - Math.exp(-4 * dt);
    pointer.x += (target.x - pointer.x) * lag; pointer.y += (target.y - pointer.y) * lag;
    elapsed += dt * (effective() === 'gentle' ? .42 : 1) * (focused ? .4 : 1);
    const before = performance.now(); draw(); frames++;
    averageCost = averageCost * .95 + (performance.now() - before) * .05;
    if (!slow && frames > 90 && averageCost > 12) { slow = true; size(); }
    raf = requestAnimationFrame(tick);
  }
  function resetCard() { if (activeCard) { activeCard.style.removeProperty('--spot-x'); activeCard.style.removeProperty('--spot-y'); activeCard = null; } }
  function refresh() {
    cancelAnimationFrame(raf); raf = 0; last = 0;
    document.body.dataset.sceneMode = effective(); document.body.dataset.scenePaused = String(!allowed());
    select.value = mode; select.title = reduced.matches ? '系统已要求减少动态：背景保持静止' : '仅影响背景，不影响记录和同步';
    if (!allowed()) { resetCard(); interactionAnimations.forEach(a => a.cancel()); interactionAnimations.clear(); pointer = { x: 0, y: 0 }; }
    draw(); if (allowed()) raf = requestAnimationFrame(tick);
  }
  function setMode(value) {
    if (!['cinematic', 'gentle', 'still'].includes(value)) return;
    mode = value; try { localStorage.setItem(KEY, mode); } catch {} refresh();
  }
  on(select, 'change', e => setMode(e.target.value));
  on(document, 'pointermove', e => {
    if (!allowed() || coarse.matches) return;
    target.x = e.clientX / width * 2 - 1; target.y = e.clientY / height * 2 - 1;
    const card = e.target.closest('.feature,.note-card');
    if (card !== activeCard) { resetCard(); activeCard = card; }
    if (card) { const r = card.getBoundingClientRect(); card.style.setProperty('--spot-x', e.clientX - r.left + 'px'); card.style.setProperty('--spot-y', e.clientY - r.top + 'px'); }
  }, { passive: true });
  on(document.documentElement, 'pointerleave', () => { target = { x: 0, y: 0 }; resetCard(); });
  on(document, 'click', e => {
    const b = e.target.closest('.feature,.paper-save,.primary');
    if (!b || b.disabled || !allowed() || !b.animate) return;
    const a = b.animate([{ transform: 'scale(.975)' }, { transform: 'scale(1)' }], { duration: 260, easing: 'cubic-bezier(.16,1,.3,1)' });
    interactionAnimations.add(a); a.finished.then(() => interactionAnimations.delete(a), () => interactionAnimations.delete(a));
  });
  const updateFocus = () => { focused = !!document.activeElement?.matches('input,textarea,select,[contenteditable=true]'); document.body.classList.toggle('scene-writing', focused); };
  on(document, 'focusin', updateFocus); on(document, 'focusout', () => queueMicrotask(updateFocus));
  on(document, 'visibilitychange', refresh); on(reduced, 'change', refresh); on(coarse, 'change', size);
  on(window, 'resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(size, 100); }, { passive: true });
  on(window, 'storage', e => { if (e.key === KEY && ['cinematic', 'gentle', 'still'].includes(e.newValue)) { mode = e.newValue; refresh(); } });
  const observer = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver(entries => { heroVisible = entries[0].isIntersecting; if (heroVisible) draw(); }) : null;
  observer?.observe(hero);
  function dispose() {
    if (disposed) return;
    disposed = true; cancelAnimationFrame(raf); clearTimeout(resizeTimer); observer?.disconnect(); resetCard();
    listeners.forEach(off => off()); interactionAnimations.forEach(a => a.cancel());
    image.onload = image.onerror = null; sprite = null; layer.remove(); sea.remove(); control.remove(); document.body.classList.remove('observatory');
  }
  on(window, 'pagehide', e => { if (e.persisted) { pageAway = true; refresh(); } else dispose(); });
  on(window, 'pageshow', () => { pageAway = false; refresh(); });
  window.WhaleXScene = { setMode, dispose, inspect: () => ({ mode, effective: effective(), running: allowed(), frames, elapsed, spriteReady: !!sprite, averageDrawMs: Math.round(averageCost * 100) / 100, lowPower: slow || coarse.matches, dpr, reduced: reduced.matches }) };
  size(); refresh();
})();
