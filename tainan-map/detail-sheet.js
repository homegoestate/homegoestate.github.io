(() => {
  'use strict';
  const small=matchMedia('(max-width:900px)');
  const detail=document.getElementById('detail'), life=document.getElementById('lifeDetail');
  const shade=document.createElement('div');
  shade.className='atlas-sheet-shade'; shade.hidden=true; shade.setAttribute('aria-hidden','true');
  detail.before(shade);
  const surroundings=[document.querySelector('.masthead'),document.querySelector('.explorer'),
    document.querySelector('.map-stage'),document.getElementById('compareTray')].filter(Boolean);
  let current=null, previous=null;
  const changed=new Set();
  function sync() {
    const next=small.matches && (!life.hidden?life:!detail.hidden?detail:null);
    if ((next || null)===current) return;
    if(current){current.removeAttribute('aria-modal');current.removeAttribute('role');}
    for(const node of changed)node.inert=false;
    changed.clear();
    shade.hidden=!next;
    document.body.classList.toggle('atlas-sheet-open',!!next);
    if(next){
      if(!current)previous=document.activeElement;
      next.setAttribute('role','dialog');next.setAttribute('aria-modal','true');
      for(const node of [...surroundings,next===detail?life:detail]){
        if(!node.inert){changed.add(node);node.inert=true;}
      }
      next.scrollTop=0;
      if(!document.querySelector('dialog[open]'))next.querySelector('.detail-close')?.focus({preventScroll:true});
    } else if(!document.querySelector('dialog[open]') && current?.contains(document.activeElement)){
      const target=previous?.isConnected && previous!==document.body?previous:document.getElementById('search');
      target?.focus({preventScroll:true});
    }
    current=next || null;
  }
  shade.onclick=()=>current?.querySelector('.detail-close')?.click();
  document.addEventListener('keydown',e=>{
    if(!current || document.querySelector('dialog[open]'))return;
    if(e.key==='Escape'){e.preventDefault();shade.click();return;}
    if(e.key!=='Tab')return;
    const list=[...current.querySelectorAll('button:not(:disabled), a[href], select:not(:disabled), input:not(:disabled), summary')].filter(el=>el.getClientRects().length);
    if(list.length && ((e.shiftKey && document.activeElement===list[0]) || (!e.shiftKey && document.activeElement===list.at(-1)))){
      e.preventDefault();(e.shiftKey?list.at(-1):list[0]).focus();
    }
  });
  const observer=new MutationObserver(sync);
  for(const panel of [detail,life])observer.observe(panel,{attributes:true,attributeFilter:['hidden']});
  small.addEventListener('change',sync);sync();
})();
