/* WhaleX Observatory: original dependency-free rendering. See docs/MOTION_DESIGN.md.
   This module never accesses notes, authentication or cloud data. */
(() => {
  'use strict';
  const hero = document.querySelector('.hero');
  if (!hero || window.WhaleXScene) return;
  const KEY = 'whalex_scene_mode_v1', TAU = Math.PI * 2;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)'), coarse = matchMedia('(pointer: coarse)');
  let mode = 'cinematic';
  try { mode = localStorage.getItem(KEY) || mode; } catch {}
  if (!['cinematic','gentle','still'].includes(mode)) mode = 'cinematic';
  const layer = document.createElement('div');
  layer.className = 'cosmic-scene'; layer.setAttribute('aria-hidden','true');
  layer.innerHTML = '<canvas class="cosmic-canvas"></canvas><div class="cosmic-vignette"></div>';
  document.body.prepend(layer);
  const sky = layer.querySelector('canvas'), hd = window.WhaleXWhaleRenderer?.create();
  const sea = hd?.canvas || document.createElement('canvas');
  const backdrop=window.WhaleXBackdropRenderer?.create();
  if(backdrop){backdrop.canvas.className='cosmic-surface';layer.prepend(backdrop.canvas);}
  sea.className = 'whale-canvas'; sea.setAttribute('aria-hidden','true'); hero.prepend(sea);
  const ctx = sky.getContext('2d'), whaleCtx = hd ? null : sea.getContext('2d');
  if (!ctx || (!hd && !whaleCtx)) { layer.remove(); sea.remove(); return; }
  document.body.classList.add('observatory');
  const control = document.createElement('label'); control.className = 'motion-control';
  control.innerHTML = '<span aria-hidden="true">✧</span><select aria-label="背景动效"><option value="cinematic">沉浸动效</option><option value="gentle">轻柔动效</option><option value="still">静止背景</option></select>';
  document.querySelector('.top-actions')?.prepend(control);
  const select = control.querySelector('select');
  let width=1,height=1,hw=1,hh=1,dpr=1,whaleDpr=1,raf=0,last=0,elapsed=0,frames=0;
  let disposed=false,pageAway=false,heroVisible=true,focused=false,slow=false,averageCost=0,averageFrame=0,resizeTimer,sprite=null,backdropReady=false,lastSurface=-1;
  let pointer={x:0,y:0},target={x:0,y:0},activeCard=null,motionStrength=1;
  const listeners=[],interactionAnimations=new Set();
  function on(el,event,fn,opts) { el.addEventListener(event,fn,opts); listeners.push(()=>el.removeEventListener(event,fn,opts)); }
  const random=(()=>{let s=37021;return()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296;};})();
  const stars=Array.from({length:280},()=>({x:random(),y:random(),r:.3+random()*1.1,phase:random()*TAU,depth:.25+random()*.75}));
  const effective=()=>reduced.matches?'still':mode;
  const allowed=()=>!disposed&&!document.hidden&&!pageAway&&effective()!=='still';
  function canvas(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;return c;}
  function glow(c,x,y,r,color,alpha=1){
    const g=c.createRadialGradient(x,y,0,x,y,r);
    g.addColorStop(0,`rgba(${color},${alpha})`);g.addColorStop(.22,`rgba(${color},${alpha*.4})`);g.addColorStop(1,`rgba(${color},0)`);
    c.fillStyle=g;c.fillRect(x-r,y-r,r*2,r*2);
  }
  // Cache the expensive dust and light textures once, outside the animation loop.
  const nebula=canvas(900,620),nc=nebula.getContext('2d');
  for(let i=0;i<120;i++){
    const x=random()*900,ridge=280+Math.sin(x/155)*135;
    glow(nc,x,ridge+(random()-.5)*175,35+random()*150,i%3?'47,99,222':'139,55,229',.045+random()*.09);
  }
  const galaxy=canvas(800,800),gc=galaxy.getContext('2d');gc.globalCompositeOperation='lighter';
  for(let i=0;i<7200;i++){
    const r=Math.pow(random(),.72)*350+4,arm=(i%3)*TAU/3;
    const a=arm+Math.log(1+r/15)*1.78+(random()-.5)*(.2+r/620),x=400+Math.cos(a)*r,y=400+Math.sin(a)*r;
    if(i%5===0)glow(gc,x,y,10+r/35,i%2?'88,125,255':'160,92,230',.032);
    gc.fillStyle=`rgba(${r<85?'227,216,255':i%3?'117,168,255':'195,141,255'},${.06+random()*.55})`;
    const size=.35+random()*1.1;gc.fillRect(x,y,size,size);
  }
  glow(gc,400,400,150,'149,110,255',.4);glow(gc,400,400,45,'231,222,255',.8);
  const halo=canvas(128,128);glow(halo.getContext('2d'),64,64,64,'95,176,255',.75);
  const deform=canvas(784,370),dc=deform.getContext('2d');
  const image=new Image(),landscape=new Image();
  landscape.onload=()=>{if(disposed)return;backdropReady=true;backdrop?.setSprite(landscape);draw();};
  landscape.src=new URL('./assets/cosmic-landscape.webp',document.currentScript.src).href;
  image.onload=()=>{
    if(disposed)return;
    // The production sprite has genuine alpha; preserve its fine luminous edges.
    sprite=image;hd?.setSprite(image);draw();
  };
  image.onerror=()=>{if(!disposed){document.body.classList.add('whale-fallback');draw();}};
  image.src=new URL('./assets/whale-luminous.webp',document.currentScript.src).href;
  function size(){
    if(disposed)return;
    width=Math.max(1,innerWidth);height=Math.max(1,innerHeight);
    const rect=hero.getBoundingClientRect();hw=Math.max(1,rect.width);hh=Math.max(1,rect.height);
    dpr=Math.min(devicePixelRatio||1,slow?1:coarse.matches?2:2,Math.sqrt(4200000/(width*height)));
    sky.width=Math.round(width*dpr);sky.height=Math.round(height*dpr);
    if(backdrop){backdrop.canvas.width=sky.width;backdrop.canvas.height=sky.height;lastSurface=-1;}ctx.setTransform(dpr,0,0,dpr,0,0);
    // Separate budgets: sharp stars up to 2x; the focal whale gets priority up to 3x.
    whaleDpr=Math.min(devicePixelRatio||1,slow?1.5:3,Math.sqrt(1800000/(hw*hh)));
    sea.width=Math.round(hw*whaleDpr);sea.height=Math.round(hh*whaleDpr);
    if(whaleCtx){whaleCtx.setTransform(whaleDpr,0,0,whaleDpr,0,0);whaleCtx.imageSmoothingQuality='high';}
    // Preserve the original 784x370 coordinate system without squeezing the source to 700 pixels.
    const detailScale=Math.min(2,whaleDpr);
    deform.width=Math.round(784*detailScale);deform.height=Math.round(370*detailScale);
    dc.setTransform(detailScale,0,0,detailScale,0,0);dc.imageSmoothingQuality='high';draw();
  }
  function drawGalaxy(c,x,y,radius,tilt,phase,opacity){
    c.save();c.translate(x,y);c.rotate(tilt);c.scale(1,.5);c.rotate(phase);c.globalAlpha=opacity;c.globalCompositeOperation='lighter';
    c.drawImage(galaxy,-radius,-radius,radius*2,radius*2);c.restore();
  }
  // Layered orbital filaments. Each head is bright and small; the rest of the ring stays quiet.
  function orbit(c,x,y,rx,ry,tilt,phase,strength,front=false){
    c.save();c.translate(x,y);c.rotate(tilt);c.globalCompositeOperation='lighter';
    c.strokeStyle=`rgba(110,155,229,${.12*strength})`;c.lineWidth=.65;c.beginPath();c.ellipse(0,0,rx,ry,0,0,TAU);c.stroke();
    const colors=front?'139,231,255':'161,169,255';
    for(let j=0;j<32;j++){
      const a=phase-j*.022;if(front&&Math.sin(a)<0)continue;
      const opacity=Math.pow(1-j/32,1.8)*strength;
      c.strokeStyle=`rgba(${colors},${opacity*.7})`;c.lineWidth=.7+(1-j/32)*1.2;c.beginPath();c.ellipse(0,0,rx,ry,0,a,a+.025);c.stroke();
    }
    if(!front||Math.sin(phase)>=0){const bx=Math.cos(phase)*rx,by=Math.sin(phase)*ry;c.globalAlpha=strength;c.drawImage(halo,bx-13,by-13,26,26);c.fillStyle='#f0fbff';c.beginPath();c.arc(bx,by,1.15,0,TAU);c.fill();}c.restore();
  }
  function atmosphere(t){
    // Match CSS cover coordinates to the original 1672 x 941 scene. Light follows the actual planets.
    const scale=Math.max(width/1672,height/941),offset=(width-1672*scale)*(width<=760?.44:.5);
    ctx.save();ctx.translate(offset,0);ctx.scale(scale,scale);ctx.globalCompositeOperation='screen';
    const planets=[[870,250,198,.44],[308,281,137,.21],[331,86,15,.17],[1314,297,21,.19]];
    for(const [x,y,r,a] of planets){
      const g=ctx.createLinearGradient(x-r,y,x+r,y-r);g.addColorStop(0,'#387cff00');g.addColorStop(.45,`rgba(87,168,255,${a*.4})`);g.addColorStop(.8,`rgba(164,225,255,${a})`);g.addColorStop(1,'#b4eeff00');
      ctx.strokeStyle=g;ctx.lineWidth=r>100?1.25:.65;
      ctx.beginPath();ctx.arc(x,y,r,Math.PI*1.05,TAU-.08);ctx.stroke();
      ctx.lineWidth=r>100?6:2;ctx.globalAlpha=.18+.04*Math.sin(t*.32);ctx.stroke();ctx.globalAlpha=1;
    }
    // Orbit tracks follow the planet's existing rings instead of adding unrelated circles.
    orbit(ctx,849,192,370,38,-.10,t*.20+.9,.65);
    orbit(ctx,849,192,351,32,-.10,-t*.12+3.6,.30);
    // A restrained sunrise glint and upper-atmosphere light; never a full-scene mask.
    glow(ctx,739,261,66,'126,210,255',.12+.025*Math.sin(t*.24));
    ctx.save();ctx.beginPath();ctx.arc(870,250,194,0,TAU);ctx.clip();ctx.beginPath();ctx.rect(670,46,400,206);ctx.clip();
    ctx.globalAlpha=.075;ctx.drawImage(nebula,620+Math.sin(t*.023)*12,18,500,370);ctx.restore();ctx.restore();
  }
  function drawSky(t){
    ctx.clearRect(0,0,width,height);const px=pointer.x,py=pointer.y;
    ctx.save();ctx.globalAlpha=.27;ctx.drawImage(nebula,-width*.1+Math.sin(t*.032)*26+px*9,-height*.12+py*6,width*1.2,height*1.25);ctx.restore();
    atmosphere(t);
    const count=slow?100:coarse.matches?160:stars.length;
    for(let i=0;i<count;i++){
      const s=stars[i],near=i%5===0,speed=near?6:1.15;
      const x=(s.x*width+t*s.depth*speed+px*s.depth*(near?20:7))%width,y=(s.y*height+py*s.depth*(near?14:5)+Math.sin(t*.08+s.phase)*2+height)%height;
      const a=.20+.44*(.5+.5*Math.sin(t*(near?.6:.25)+s.phase)),color=i%11===0?'255,222,177':i%3===0?'192,202,255':'194,227,255';
      ctx.fillStyle=`rgba(${color},${a})`;ctx.beginPath();ctx.arc(x,y,s.r*(near?1:.7),0,TAU);ctx.fill();
      if(i%31===0){ctx.save();ctx.globalAlpha=a*.65;ctx.drawImage(halo,x-9,y-9,18,18);ctx.strokeStyle='#d8eeff';ctx.lineWidth=.55;ctx.beginPath();ctx.moveTo(x-3,y);ctx.lineTo(x+3,y);ctx.moveTo(x,y-3);ctx.lineTo(x,y+3);ctx.stroke();ctx.restore();}
    }
    drawGalaxy(ctx,width*.76+px*12,height*.27+py*9,Math.min(270,width*.21),-.26,t*.019,.25);
    drawGalaxy(ctx,width*.31,height*.87,Math.min(250,width*.24),.21,-t*.017+2,.30);
    orbit(ctx,width*.54,height*.51,width*.48,height*.3,-.22,t*.21,.38);
    orbit(ctx,width*.54,height*.88,width*.50,height*.12,-.12,-t*.16+2.1,.62);
    if(effective()==='cinematic'){
      const flight=(t+3)%23;
      if(flight<2.6){
        const x=width*.12+flight*width*.20,y=height*.10+flight*height*.07,fade=Math.sin(flight/2.6*Math.PI),g=ctx.createLinearGradient(x-110,y-32,x,y);
        g.addColorStop(0,'#81baff00');g.addColorStop(.7,`rgba(145,198,255,${fade*.18})`);g.addColorStop(1,`rgba(230,248,255,${fade*.8})`);
        ctx.strokeStyle=g;ctx.lineWidth=.85;ctx.beginPath();ctx.moveTo(x-110,y-32);ctx.lineTo(x,y);ctx.stroke();
      }
    }
  }
  function drawWhale(t){
    if(hd){hd.draw(hw,hh,whaleDpr,t,pointer,motionStrength);return;}
    whaleCtx.clearRect(0,0,hw,hh);
    const ratio=sprite?sprite.naturalHeight/sprite.naturalWidth:819/1920;
    const x=hw*.54+pointer.x*8,y=hh*.34+pointer.y*4,w=Math.min(hw*.82,hh*1.5,630),h=w*ratio;
    glow(whaleCtx,x,y,hw*.28,'36,112,255',.10);
    orbit(whaleCtx,x,y+27,w*.61,h*.31,-.15,t*.33,.67);
    if(sprite){
      // Transparent offscreen buffer. Composite the resulting shape once to avoid seams.
      dc.clearRect(0,0,deform.width,deform.height);
      const strips=98,sw=sprite.width/strips,dw=700/strips;
      for(let i=0;i<strips;i++){
        const u=i/(strips-1),tail=Math.pow(1-u,2.4),wave=Math.sin(t*1.2-u*5)*tail*14;
        const dh=700*ratio*(1+Math.sin(t*1.2-u*5+.4)*tail*.015);
        dc.drawImage(sprite,i*sw,0,sw,sprite.height,42+i*dw,35+wave,dw+.2,dh);
      }
      whaleCtx.save();whaleCtx.translate(x+Math.sin(t*.23)*12,y+Math.sin(t*.65)*6);whaleCtx.rotate(Math.sin(t*.43)*.022);whaleCtx.globalCompositeOperation='screen';
      whaleCtx.drawImage(deform,-w*.56,-h*.62,w*1.12,w*370/700);whaleCtx.restore();
      whaleCtx.save();whaleCtx.globalCompositeOperation='lighter';
      for(let i=0;i<24;i++){const age=(t*.15+i/24)%1,tx=x-w*.35-age*110,ty=y+Math.sin(i*3+t*.9)*(8+age*14)-h*.1;whaleCtx.globalAlpha=(1-age)*.42;whaleCtx.drawImage(halo,tx-3,ty-3,6,6);}whaleCtx.restore();
    }
    orbit(whaleCtx,x,y+27,w*.61,h*.31,-.15,t*.33,.76,true);
  }
  function draw(){if(disposed||document.hidden||pageAway)return;
    if(backdropReady&&backdrop&&(lastSurface<0||elapsed-lastSurface>=(slow||coarse.matches?1/20:1/30))){backdrop.draw(width,height,dpr,elapsed,pointer,motionStrength);lastSurface=elapsed;}
    drawSky(elapsed);if(heroVisible)drawWhale(elapsed);}
  function tick(now){
    raf=0;if(!allowed())return;
    const fps=slow||coarse.matches||effective()==='gentle'?30:60;
    if(last&&now-last<1000/fps-1){raf=requestAnimationFrame(tick);return;}
    const gap=last?now-last:1000/fps;averageFrame=averageFrame*.95+gap*.05;
    const dt=Math.min(gap/1000,.06);last=now;const lag=1-Math.exp(-4*dt);
    motionStrength+=((effective()==='gentle'?.45:1)-motionStrength)*lag;
    pointer.x+=(target.x-pointer.x)*lag;pointer.y+=(target.y-pointer.y)*lag;
    elapsed+=dt*(effective()==='gentle'?.42:1)*(focused?.4:1);
    const before=performance.now();draw();frames++;averageCost=averageCost*.95+(performance.now()-before)*.05;
    if(!slow&&frames>60&&(averageCost>12||averageFrame>(coarse.matches?55:42))){slow=true;size();}raf=requestAnimationFrame(tick);
  }
  function resetCard(){if(activeCard){['--spot-x','--spot-y','--tilt-x','--tilt-y'].forEach(p=>activeCard.style.removeProperty(p));activeCard=null;}}
  function refresh(){
    cancelAnimationFrame(raf);raf=0;last=0;document.body.dataset.sceneMode=effective();document.body.dataset.scenePaused=String(!allowed());
    select.value=mode;select.title=reduced.matches?'系统已要求减少动态：背景保持静止':'仅影响背景，不影响记录和同步';
    if(!allowed()){resetCard();interactionAnimations.forEach(a=>a.cancel());interactionAnimations.clear();pointer={x:0,y:0};}
    draw();if(allowed())raf=requestAnimationFrame(tick);
  }
  function setMode(value){if(!['cinematic','gentle','still'].includes(value))return;mode=value;try{localStorage.setItem(KEY,mode);}catch{}refresh();}
  on(select,'change',e=>setMode(e.target.value));
  on(document,'pointermove',e=>{
    if(!allowed()||coarse.matches)return;target.x=e.clientX/width*2-1;target.y=e.clientY/height*2-1;
    const card=e.target.closest('.feature,.note-card,.collection-card');if(card!==activeCard){resetCard();activeCard=card;}
    if(card){const r=card.getBoundingClientRect();card.style.setProperty('--spot-x',e.clientX-r.left+'px');card.style.setProperty('--spot-y',e.clientY-r.top+'px');if(card.matches('.feature')){card.style.setProperty('--tilt-x',((.5-(e.clientY-r.top)/r.height)*3).toFixed(2)+'deg');card.style.setProperty('--tilt-y',(((e.clientX-r.left)/r.width-.5)*3).toFixed(2)+'deg');}}
  },{passive:true});
  on(document.documentElement,'pointerleave',()=>{target={x:0,y:0};resetCard();});
  on(document,'click',e=>{
    const b=e.target.closest('.feature,.paper-save,.primary');if(!b||b.disabled||!allowed()||!b.animate)return;
    const a=b.animate([{transform:'scale(.975)'},{transform:'scale(1)'}],{duration:160,easing:'cubic-bezier(.16,1,.3,1)'});
    interactionAnimations.add(a);a.finished.then(()=>interactionAnimations.delete(a),()=>interactionAnimations.delete(a));
  });
  const updateFocus=()=>{focused=!!document.activeElement?.matches('input,textarea,[contenteditable=true]');document.body.classList.toggle('scene-writing',focused);};
  on(document,'focusin',updateFocus);on(document,'focusout',()=>queueMicrotask(updateFocus));
  on(document,'visibilitychange',refresh);on(reduced,'change',refresh);on(coarse,'change',size);
  on(window,'resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(size,100);},{passive:true});
  on(window,'storage',e=>{if(e.key===KEY&&['cinematic','gentle','still'].includes(e.newValue)){mode=e.newValue;refresh();}});
  const observer=typeof IntersectionObserver!=='undefined'?new IntersectionObserver(entries=>{heroVisible=entries[0].isIntersecting;if(heroVisible)draw();}):null;observer?.observe(hero);
  function dispose(){
    if(disposed)return;disposed=true;cancelAnimationFrame(raf);clearTimeout(resizeTimer);observer?.disconnect();resetCard();listeners.forEach(off=>off());interactionAnimations.forEach(a=>a.cancel());
    image.onload=image.onerror=null;hd?.dispose();backdrop?.dispose();landscape.onload=null;sprite=null;layer.remove();sea.remove();control.remove();document.body.classList.remove('observatory');
  }
  on(window,'pagehide',e=>{if(e.persisted){pageAway=true;refresh();}else dispose();});on(window,'pageshow',()=>{pageAway=false;refresh();});
  window.WhaleXScene={setMode,dispose,inspect:()=>({mode,effective:effective(),running:allowed(),frames,elapsed,spriteReady:!!sprite,averageDrawMs:Math.round(averageCost*100)/100,averageFrameMs:Math.round(averageFrame*100)/100,lowPower:slow||coarse.matches,dpr,whaleDpr,reduced:reduced.matches,quality:'observatory-hd-v1',backdrop:backdrop?.inspect()||{renderer:'css'},backdropReady,motionStrength,renderer:hd?.inspect()||{renderer:'canvas2d'},pixelBudget:{sky:4200000,whale:1800000}})};
  size();refresh();
})();
