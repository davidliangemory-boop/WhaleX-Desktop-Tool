/* Interface framing only. Never change the scene, its viewport or its playback. */
(() => {
  'use strict';
  const drawer=document.querySelector('#inlineComposer');
  const trigger=document.querySelector('#recordTrigger');
  const tools=document.querySelector('#workbenchTools');
  const body=tools.querySelector('.utility-body');
  let previousFocus;
  for(const selector of ['.layout-overview','.today-panel','.review-entry','.bottom-note']) body.append(document.querySelector(selector));
  function measure(){
    const mobile=matchMedia('(max-width:760px)').matches;
    const hero=document.querySelector('.hero').getBoundingClientRect();
    const lane=document.querySelector('.right-column').getBoundingClientRect();
    const sidebar=document.querySelector('.sidebar').getBoundingClientRect();
    const style=document.documentElement.style;
    style.setProperty('--drawer-left',`${mobile?0:lane.left}px`);
    style.setProperty('--drawer-width',`${mobile?innerWidth:lane.width}px`);
    style.setProperty('--drawer-top',`${mobile?hero.bottom+8:hero.top}px`);
    style.setProperty('--dock-left',`${mobile?0:sidebar.right}px`);
  }
  function hide(restore=true){
    drawer.classList.remove('is-open');drawer.inert=true;drawer.setAttribute('aria-hidden','true');
    trigger.setAttribute('aria-expanded','false');
    if(restore && drawer.contains(document.activeElement)) (previousFocus?.isConnected?previousFocus:trigger).focus({preventScroll:true});
  }
  function show(){
    if(!drawer.classList.contains('is-open'))previousFocus=document.activeElement;
    tools.open=false;measure();drawer.inert=false;drawer.setAttribute('aria-hidden','false');drawer.classList.add('is-open');
    trigger.setAttribute('aria-expanded','true');
  }
  tools.addEventListener('toggle',()=>{if(tools.open){hide();measure();}});
  // Fixed small menus escape the scrollable record rail without covering the whale.
  document.addEventListener('toggle',e=>{
    if(!e.target.matches?.('.record-menu'))return;
    if(!e.target.open){delete e.target.querySelector('.record-menu-pop').dataset.placed;return;}
    hide(false);tools.open=false;
    document.querySelectorAll('.record-menu[open]').forEach(menu=>{if(menu!==e.target)menu.open=false;});
    const menu=e.target.querySelector('.record-menu-pop'),anchor=e.target.querySelector('summary').getBoundingClientRect();
    const floor=document.querySelector('.hero').getBoundingClientRect().bottom+8;
    menu.style.maxHeight=Math.max(80,innerHeight-floor-12)+'px';
    menu.style.left=Math.max(8,Math.min(innerWidth-163,anchor.right-155))+'px';
    menu.style.top=Math.max(floor,Math.min(innerHeight-menu.offsetHeight-12,anchor.top-menu.offsetHeight-6))+'px';
    menu.dataset.placed='true';
  },true);
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'&&!document.querySelector('dialog[open]')){
      if(drawer.classList.contains('is-open')){e.preventDefault();hide();}
      if(tools.open){tools.open=false;tools.querySelector('summary').focus();}
    }
  });
  document.addEventListener('click',e=>{
    if(tools.open&&!tools.contains(e.target))tools.open=false;
    document.querySelectorAll('.record-menu[open]').forEach(menu=>{if(!menu.contains(e.target)||e.target.closest('button'))menu.open=false;});
  });
  const observer=new ResizeObserver(measure);
  for(const selector of ['.hero','.right-column','.sidebar'])observer.observe(document.querySelector(selector));
  window.addEventListener('resize',()=>{document.querySelectorAll('.record-menu[open]').forEach(menu=>{menu.open=false;});measure();});measure();
  window.WhaleXFrame={show,hide,measure};
})();
