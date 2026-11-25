(() => {
  'use strict';

  const RAD = Math.PI / 180;
  const HOME = { yaw: 19, tilt: 44, zoom: 1 };
  const STEPS = [0, 1, 15, 60, 150, 300];
  const HEIGHT = [22, 34, 49, 68, 92, 122];
  const COLOR = ['#b8cdbb', '#b2d9c5', '#94cfba', '#75bfad', '#56af9f', '#389e95'];
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const fmt = n => n.toLocaleString('zh-TW');
  const icons = {
    left: '<path d="M7 5 3 9l4 4M3 9h10a7 7 0 0 1 7 7"/>',
    right: '<path d="m17 5 4 4-4 4m4-4H11a7 7 0 0 0-7 7"/>',
    up: '<path d="m3 16 9-4 9 4-9 4-9-4Zm9-7V3m-3 3 3-3 3 3"/>',
    down: '<path d="m3 16 9-4 9 4-9 4-9-4Zm9-13v6m-3-3 3 3 3-3"/>',
    minus: '<path d="M5 12h14"/>', plus: '<path d="M5 12h14m-7-7v14"/>'
  };
  function element(type, className, parent) {
    const el = document.createElement(type);
    el.className = className;
    parent.append(el);
    return el;
  }
  function ringsOf(f) {
    if (f.geometry?.type === 'Polygon') return [f.geometry.coordinates];
    return f.geometry?.type === 'MultiPolygon' ? f.geometry.coordinates : [];
  }
  function inside(x, y, ring) {
    let yes = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i], b = ring[j];
      if ((a.y > y) !== (b.y > y) && x < (b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x) yes = !yes;
    }
    return yes;
  }
  function labelAnchor(polygons) {
    let best, bestArea = 0;
    for (const poly of polygons) {
      const ring = poly[0];
      let area = 0, cx = 0, cy = 0;
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i], b = ring[(i+1) % ring.length], c = a.x*b.y-b.x*a.y;
        area += c; cx += (a.x+b.x)*c; cy += (a.y+b.y)*c;
      }
      if (Math.abs(area) <= bestArea) continue;
      bestArea = Math.abs(area);
      const within = (x,y) => inside(x,y,ring) && !poly.slice(1).some(hole=>inside(x,y,hole));
      cx /= 3*area; cy /= 3*area;
      if (within(cx,cy)) { best = {x:cx,y:cy}; continue; }
      const xs = ring.map(p=>p.x), ys = ring.map(p=>p.y);
      const left = Math.min(...xs), top = Math.min(...ys);
      const dx = (Math.max(...xs)-left)/16, dy = (Math.max(...ys)-top)/16;
      let closest = Infinity;
      for (let j=0;j<16;j++) for(let i=0;i<16;i++) {
        const x=left+(i+.5)*dx, y=top+(j+.5)*dy, dist=(x-cx)**2+(y-cy)**2;
        if(dist < closest && within(x,y)) {best={x,y};closest=dist;}
      }
      if (!best) best=ring[0];
    }
    return best;
  }
  function makeModel(features, counts) {
    const positions = new Map(), edges = new Map(), districts = [];
    let xmin=Infinity,xmax=-Infinity,ymin=Infinity,ymax=-Infinity;
    // Local equirectangular coordinates in kilometres. Shared vertices and boundaries
    // retain their identities, so a wall is created only for the exposed height.
    const longitudeKm = 111.32*Math.cos(23.15*RAD), latitudeKm = 110.75;
    function point(pair) {
      const key=pair.join(',');
      if (!positions.has(key)) {
        const x=(pair[0]-120.3)*longitudeKm, y=(23.15-pair[1])*latitudeKm;
        positions.set(key,{x,y,id:positions.size});
        xmin=Math.min(xmin,x); xmax=Math.max(xmax,x); ymin=Math.min(ymin,y); ymax=Math.max(ymax,y);
      }
      return positions.get(key);
    }
    for (const feature of features) {
      const name = feature.properties?.name;
      const polygons = ringsOf(feature).map(poly=>poly.map(ring=>{
        const points=ring.map(point);
        if(points.length>1 && points[0]===points.at(-1)) points.pop();
        return points;
      }).filter(ring=>ring.length>=3)).filter(poly=>poly.length);
      if (!name || !polygons.length) continue;
      const count = Math.max(0, Number(typeof counts==='function'?counts(name):counts?.[name])||0);
      const tier = STEPS.reduce((level,threshold,i)=>count>=threshold?i:level,0);
      districts.push({name,count,polygons,tier,z:HEIGHT[tier],roof:new Path2D()});
    }
    if (!districts.length) return null;
    const unit = 1000/Math.max(xmax-xmin,ymax-ymin);
    const cx=(xmin+xmax)/2, cy=(ymin+ymax)/2, footprint=new Path2D();
    for(const p of positions.values()){p.x=(p.x-cx)*unit;p.y=(p.y-cy)*unit;}
    for(const d of districts) {
      d.anchor=labelAnchor(d.polygons);
      for(const poly of d.polygons) for (const [index,ring] of poly.entries()) {
        d.roof.moveTo(ring[0].x,ring[0].y);
        let area = 0;
        for(let i=0;i<ring.length;i++){
          const a=ring[i],b=ring[(i+1)%ring.length];
          area+=a.x*b.y-b.x*a.y;
          if(i) d.roof.lineTo(a.x,a.y);
        }
        d.roof.closePath();
        const outward=(area>0?1:-1)*(index? -1:1);
        for(let i=0;i<ring.length;i++){
          const a=ring[i],b=ring[(i+1)%ring.length];
          if(a===b)continue;
          const key=a.id<b.id?a.id+':'+b.id:b.id+':'+a.id;
          const side={a,b,d,outward};
          if(edges.has(key)) edges.get(key).push(side); else edges.set(key,[side]);
        }
      }
      footprint.addPath(d.roof);
    }
    const walls=[];
    for(const sides of edges.values()){
      sides.sort((a,b)=>b.d.z-a.d.z);
      const {a,b,d,outward}=sides[0], base=sides[1]?.d.z||0;
      if(base===d.z)continue;
      const dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);
      const nx=outward*dy/length,ny=-outward*dx/length;
      const light=clamp(.45+(-nx*.78-ny*.35)*.19,.23,.69);
      walls.push({a,b,d,base,nx,ny,color:shade(COLOR[d.tier],light),highlight:shade('#e6bd79',light)});
    }
    return {districts,points:[...positions.values()],walls,footprint,unit};
  }
  function shade(hex, fraction) {
    const value=parseInt(hex.slice(1),16);
    const c=[value>>16,(value>>8)&255,value&255].map((v,i)=>Math.round([9,39,45][i]+(v-[9,39,45][i])*fraction));
    return 'rgb('+c.join(',')+')';
  }
  function mount(root,{features=[],counts=()=>0,onDistrict=()=>{}}={}) {
    if(!root || typeof Path2D==='undefined')return null;
    const model=makeModel(features,counts);
    if(!model)return null;
    const canvas=element('canvas','city-model-canvas',root),ctx=canvas.getContext('2d');
    if(!ctx){canvas.remove();return null;}
    canvas.tabIndex=0;
    canvas.setAttribute('aria-label','台南行政區立體圖。方向鍵調整角度，加減鍵縮放，Home 回正，PageDown 或 PageUp 選區，Enter 開啟。');
    const labels=element('div','city-model-labels',root);
    const sorted=[...model.districts].sort((a,b)=>a.name.localeCompare(b.name,'zh-TW'));
    const leader=[...model.districts].sort((a,b)=>b.count-a.count)[0];
    const ranked=new Map([...new Set([leader.name,'新營區','善化區','永康區','七股區','玉井區','白河區','安南區','麻豆區','南化區','關廟區','北門區','歸仁區','楠西區'])].map((s,i)=>[s,i]));
    const labelOrder=[...model.districts].sort((a,b)=>(ranked.get(a.name)??50)-(ranked.get(b.name)??50)||b.count-a.count);
    const events=new AbortController(), listen=(target,event,fn,opts={})=>target.addEventListener(event,fn,{...opts,signal:events.signal});
    const view={...HOME};
    let active=true, frame=0, resize, picked=null, retained=null, size, camera, targets=[], hoverFrame=0, hoverPoint=null;
    const pointerState=new Map();
    let pinch=null;
    for(const d of model.districts){
      const btn=element('button','city-model-label',labels);
      btn.type='button';btn.dataset.cityDistrict=d.name;btn.title=d.name+' · 名冊 '+fmt(d.count)+' 個社區';
      btn.setAttribute('aria-label',btn.title+'，開啟行政區');
      element('span','city-model-name',btn).textContent=d.name;
      element('span','city-model-count',btn).textContent=fmt(d.count);
      if(d===leader){btn.classList.add('is-leading');btn.title+='（全市名冊數最多）';btn.setAttribute('aria-label',btn.title+'，開啟行政區');}
      d.button=btn;
      listen(btn,'click',()=>onDistrict(d.name));
      listen(btn,'focus',()=>{retained=d;highlight(d);});
      listen(btn,'blur',()=>{retained=null;highlight(null);});
      listen(btn,'pointerenter',e=>{if(e.pointerType==='mouse')highlight(d);});
      listen(btn,'pointerleave',()=>highlight(retained));
    }
    const resetButton=element('button','city-model-compass',root);
    resetButton.type='button';resetButton.title='回到預設方向與縮放';resetButton.setAttribute('aria-label',resetButton.title);
    resetButton.innerHTML='<svg viewBox="0 0 52 52" aria-hidden="true"><circle cx="26" cy="26" r="23" fill="none" stroke="currentColor" opacity=".32" stroke-dasharray="1 4"/><g class="city-model-needle"><path d="m26 10 5.5 21-5.5-4-5.5 4Z" fill="#f5d6a0"/><path d="m26 41-4-13 4 2.7 4-2.7Z" fill="#83b4af"/><circle cx="26" cy="26.5" r="1.2" fill="#123840"/></g></svg><span>N</span>';
    const needle=resetButton.querySelector('g');
    const legend=element('div','city-model-legend',root);
    legend.innerHTML='<b>行政區名冊數</b><div class="city-model-scale"><span>0</span><i></i><span>300+</span></div><small>色階與高度代表社區數</small>';
    const tools=element('div','city-model-tools',root);
    tools.setAttribute('role','group');tools.setAttribute('aria-label','立體地圖視角');
    const announce=element('div','city-model-sr',root);announce.setAttribute('aria-live','polite');
    for(const [key,title,action] of [
      ['left','向左旋轉',()=>rotateBy(-15)],['right','向右旋轉',()=>rotateBy(15)],
      ['up','增加傾斜',()=>tiltBy(8)],['down','減少傾斜',()=>tiltBy(-8)],
      ['minus','縮小立體地圖',()=>zoomBy(1/1.2)],['plus','放大立體地圖',()=>zoomBy(1.2)]
    ]){
      const b=element('button','city-model-tool',tools);b.type='button';b.title=title;b.setAttribute('aria-label',title);
      b.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+icons[key]+'</svg>';
      listen(b,'click',action);
    }
    function invalidate(){if(active&&!frame)frame=requestAnimationFrame(draw);}
    function rotateBy(degrees){view.yaw=(view.yaw+degrees)%360;invalidate();}
    function tiltBy(degrees){view.tilt=clamp(view.tilt+degrees,8,68);invalidate();}
    function zoomBy(factor){if(factor>0)view.zoom=clamp(view.zoom*factor,.68,2.4);invalidate();}
    function reset(){Object.assign(view,HOME);highlight(null);invalidate();}
    listen(resetButton,'click',reset);
    function highlight(d){
      if(picked===d)return;
      picked=d;
      canvas.style.cursor=d?'pointer':'grab';
      invalidate();
    }
    function sceneSize(){
      const width=root.clientWidth,height=root.clientHeight;
      if(!width||!height)return null;
      const compact=width<580,ratio=Math.min(window.devicePixelRatio||1,2);
      const top=compact?clamp(height*.17,61,93):clamp(height*.11,68,108);
      const bottom=compact?74:65,margin=compact?12:Math.max(28,width*.045);
      const defaultYaw=HOME.yaw*RAD, defaultTilt=HOME.tilt*RAD;
      const cs=Math.cos(defaultYaw),sn=Math.sin(defaultYaw),ct=Math.cos(defaultTilt),st=Math.sin(defaultTilt);
      let x1=Infinity,x2=-Infinity,y1=Infinity,y2=-Infinity;
      for(const d of model.districts)for(const poly of d.polygons)for(const p of poly[0]){
        const x=cs*p.x-sn*p.y,y=(sn*p.x+cs*p.y)*ct;
        x1=Math.min(x1,x);x2=Math.max(x2,x);y1=Math.min(y1,y-d.z*st);y2=Math.max(y2,y);
      }
      const scale=Math.min((width-2*margin)/(x2-x1),(height-top-bottom)/(y2-y1));
      return {width,height,ratio,compact,top,bottom,scale,cx:width/2-(x1+x2)*scale/2,cy:(height+top-bottom)/2-(y1+y2)*scale/2};
    }
    function drawGrid(c) {
      const {width,height}=size;
      ctx.save();ctx.setTransform(size.ratio,0,0,size.ratio,0,0);
      ctx.beginPath();
      const limit=2300,step=5*model.unit;
      for(let i=-limit;i<=limit;i+=step){
        const a=c.at(i,-limit),b=c.at(i,limit),u=c.at(-limit,i),v=c.at(limit,i);
        ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.moveTo(u.x,u.y);ctx.lineTo(v.x,v.y);
      }
      ctx.strokeStyle='rgba(129,206,195,.083)';ctx.lineWidth=.65;ctx.stroke();
      ctx.fillStyle='rgba(161,214,198,.22)';
      for(let i=-12;i<=12;i++)for(let j=-12;j<=12;j++){
        const p=c.at(i*step*2,j*step*2);
        if(p.x<0||p.x>width||p.y<0||p.y>height)continue;
        ctx.fillRect(p.x-1,p.y-.5,2,1);
      }
      ctx.restore();
    }
    function draw(){
      frame=0;
      if(!active)return;
      size ||= sceneSize();
      if(!size)return;
      const {width,height,ratio,cx,cy,compact}=size;
      const s=size.scale*view.zoom, cs=Math.cos(view.yaw*RAD),sn=Math.sin(view.yaw*RAD),ct=Math.cos(view.tilt*RAD),st=Math.sin(view.tilt*RAD);
      if(canvas.width!==Math.round(width*ratio)||canvas.height!==Math.round(height*ratio)){
        canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);
      }
      ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,canvas.width,canvas.height);
      ctx.setTransform(ratio,0,0,ratio,0,0);
      const at=(x,y,z=0)=>({x:cx+s*(cs*x-sn*y),y:cy+s*((sn*x+cs*y)*ct-z*st)});
      const roofMatrix=(z,xOff=0,yOff=0)=>ctx.setTransform(ratio*s*cs,ratio*s*sn*ct,-ratio*s*sn,ratio*s*cs*ct,ratio*(cx+xOff),ratio*(cy-s*st*z+yOff));
      camera={at,cs,sn,ct,st,s,cx,cy};drawGrid(camera);
      // Contact shadow follows the city's actual footprint, including its coast.
      for(const [dx,dy,alpha] of [[3,12,.12],[2,7,.18],[1,3,.35]]){
        roofMatrix(0,dx,dy);ctx.fillStyle='rgba(1,16,22,'+alpha+')';ctx.fill(model.footprint,'evenodd');
      }
      for(const p of model.points){p.rx=cs*p.x-sn*p.y;p.depth=sn*p.x+cs*p.y;p.sx=cx+s*p.rx;p.sy=cy+s*p.depth*ct;}
      const walls=model.walls.filter(w=>w.nx*sn+w.ny*cs>0);
      walls.sort((a,b)=>(a.a.depth+a.b.depth)-(b.a.depth+b.b.depth));
      targets=[];
      for(let tier=0;tier<HEIGHT.length;tier++){
        const low=tier?HEIGHT[tier-1]:0,high=HEIGHT[tier],up=high*s*st,down=low*s*st;
        ctx.setTransform(ratio,0,0,ratio,0,0);
        for(const w of walls){
          if(w.base>=high || w.d.z<high)continue;
          const {a,b,d}=w;
          ctx.fillStyle=d===picked?w.highlight:w.color;
          ctx.beginPath();ctx.moveTo(a.sx,a.sy-up);ctx.lineTo(b.sx,b.sy-up);ctx.lineTo(b.sx,b.sy-down);ctx.lineTo(a.sx,a.sy-down);ctx.closePath();
          ctx.fill();
          // A narrow stroke seals anti-aliased seams between the neighbouring facets.
          ctx.strokeStyle=ctx.fillStyle;ctx.lineWidth=.43;ctx.stroke();
          targets.push({w,up,down});
        }
        for(const d of model.districts){
          if(d.tier!==tier)continue;
          roofMatrix(d.z);
          const base=d===picked?'#efc98b':COLOR[d.tier], surface=ctx.createLinearGradient(-400,-350,480,540);
          surface.addColorStop(0,base);surface.addColorStop(1,shade(base,.89));
          ctx.fillStyle=surface;ctx.fill(d.roof,'evenodd');
          ctx.strokeStyle=d===picked?'#fff2cc':'rgba(237,250,225,.83)';ctx.lineWidth=(d===picked?1.5:.8)/s;ctx.lineJoin='round';ctx.stroke(d.roof);
          targets.push({d});
        }
      }
      ctx.setTransform(ratio,0,0,ratio,0,0);
      const occupied=[], ordered=picked?[picked,...labelOrder.filter(d=>d!==picked)]:labelOrder;
      for(const d of ordered){
        const anchor=at(d.anchor.x,d.anchor.y,d.z);
        const selected=d===picked, featured=d.name==='新營區'||d===leader||(!compact&&d.name==='善化區'),flag=selected||featured;
        const w=flag?Math.max(61,d.name.length*13+String(d.count).length*7+14):d.name.length*(compact?10:12)+6;
        const h=flag?24:17,y=anchor.y-(featured?13:0),x=anchor.x;
        const rect=[x-w/2-3,y-h/2-3,x+w/2+3,y+h/2+3];
        const clips=rect[0]<3||rect[2]>width-3||rect[1]<size.top-21||rect[3]>height-42 ||
          (rect[2]>width-(compact?56:77)&&rect[1]<(compact?136:173)) ||
          (rect[0]<135&&rect[3]>height-(compact?85:70));
        const collides=occupied.some(r=>rect[0]<r[2]&&rect[2]>r[0]&&rect[1]<r[3]&&rect[3]>r[1]);
        const show=(!clips&&!collides&&hit(anchor.x,anchor.y)===d)||selected;
        d.button.hidden=!show;
        if(!show)continue;
        occupied.push(rect);
        d.button.classList.toggle('is-flag',flag);d.button.classList.toggle('is-picked',selected);
        d.button.style.left=x.toFixed(1)+'px';d.button.style.top=y.toFixed(1)+'px';
      }
      const north=at(0,-1), origin=at(0,0);
      const northAngle=Math.atan2(north.x-origin.x,origin.y-north.y);
      needle.style.transform='rotate('+northAngle/RAD+'deg)';
      const letter=resetButton.lastElementChild;
      letter.style.left=(50+47*Math.sin(northAngle))+'%';
      letter.style.top=(50-47*Math.cos(northAngle))+'%';
    }
    function hit(x,y){
      if(!camera)return null;
      const {cs,sn,ct,st,s,cx,cy}=camera;
      for(let i=targets.length-1;i>=0;i--){
        const t=targets[i];
        if(t.d){
          const rx=(x-cx)/s, depth=((y-cy)/s+t.d.z*st)/ct;
          const px=cs*rx+sn*depth,py=-sn*rx+cs*depth;
          if(t.d.polygons.some(poly=>inside(px,py,poly[0])&&!poly.slice(1).some(hole=>inside(px,py,hole))))return t.d;
        }else{
          const {a,b,d}=t.w,dx=b.sx-a.sx;
          if(Math.abs(dx)<.01)continue;
          const u=(x-a.sx)/dx;if(u<0||u>1)continue;
          const baseline=a.sy+u*(b.sy-a.sy);
          if(y>=baseline-t.up&&y<=baseline-t.down)return d;
        }
      }
      return null;
    }
    function local(e){const b=canvas.getBoundingClientRect();return {x:e.clientX-b.left,y:e.clientY-b.top};}
    listen(canvas,'pointerdown',e=>{
      if(e.button!==0)return;
      const p=local(e);pointerState.set(e.pointerId,{...p,start:p,moved:false});
      canvas.setPointerCapture(e.pointerId);
      if(pointerState.size===2){
        const [a,b]=pointerState.values();a.moved=b.moved=true;
        pinch={distance:Math.max(1,Math.hypot(a.x-b.x,a.y-b.y)),zoom:view.zoom};
      }
    });
    listen(canvas,'pointermove',e=>{
      const p=local(e), last=pointerState.get(e.pointerId);
      if(!last){
        if(e.pointerType==='mouse'){
          hoverPoint=p;
          if(!hoverFrame)hoverFrame=requestAnimationFrame(()=>{
            hoverFrame=0;if(hoverPoint&&!pointerState.size)highlight(hit(hoverPoint.x,hoverPoint.y));
          });
        }
        return;
      }
      if(Math.hypot(last.start.x-p.x,last.start.y-p.y)>5)last.moved=true;
      if(!last.moved)return;
      const dx=p.x-last.x,dy=p.y-last.y;Object.assign(last,p);highlight(null);
      if(pinch&&pointerState.size===2){
        const [a,b]=pointerState.values();
        view.zoom=clamp(pinch.zoom*Math.hypot(a.x-b.x,a.y-b.y)/pinch.distance,.68,2.4);invalidate();
      }else{rotateBy(dx*.42);tiltBy(-dy*.25);}
    });
    function release(e,cancelled){
      const last=pointerState.get(e.pointerId);if(!last)return;
      pointerState.delete(e.pointerId);pinch=null;
      if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);
      if(!cancelled&&!last.moved){const p=local(e),d=hit(p.x,p.y);if(d)onDistrict(d.name);}
    }
    listen(canvas,'pointerup',e=>release(e,false));listen(canvas,'pointercancel',e=>release(e,true));
    listen(canvas,'pointerleave',()=>{hoverPoint=null;if(!pointerState.size)highlight(retained);});
    listen(canvas,'wheel',e=>{if(e.ctrlKey || !matchMedia('(pointer:coarse)').matches){e.preventDefault();zoomBy(Math.exp(-clamp(e.deltaY,-160,160)*.0018));}},{passive:false});
    let stepIndex=-1;
    listen(canvas,'keydown',e=>{
      const commands={ArrowLeft:()=>rotateBy(-12),ArrowRight:()=>rotateBy(12),ArrowUp:()=>tiltBy(7),ArrowDown:()=>tiltBy(-7),'+':()=>zoomBy(1.2),'=':()=>zoomBy(1.2),'-':()=>zoomBy(1/1.2),Home:reset};
      if(commands[e.key]){e.preventDefault();commands[e.key]();return;}
      if(e.key==='PageUp'||e.key==='PageDown'){
        e.preventDefault();stepIndex=(stepIndex+(e.key==='PageUp'?-1:1)+sorted.length)%sorted.length;
        highlight(sorted[stepIndex]);announce.textContent=sorted[stepIndex].button.title;
      }else if((e.key==='Enter'||e.key===' ')&&picked){e.preventDefault();onDistrict(picked.name);}
    });
    function setActive(value){
      active=Boolean(value);root.hidden=!active;
      if(active){size=null;invalidate();}else{
        if(frame)cancelAnimationFrame(frame);if(hoverFrame)cancelAnimationFrame(hoverFrame);
        frame=0;hoverFrame=0;hoverPoint=null;pointerState.clear();pinch=null;picked=null;retained=null;
      }
    }
    if(typeof ResizeObserver!=='undefined'){
      resize=new ResizeObserver(()=>{size=null;invalidate();});resize.observe(root);
    }else listen(window,'resize',()=>{size=null;invalidate();});
    invalidate();
    return {setActive,reset,zoomBy,rotateBy,tiltBy,destroy(){setActive(false);events.abort();resize?.disconnect();root.replaceChildren();}};
  }
  window.CityScene={mount};
})();
