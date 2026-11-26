(() => {
  'use strict';

  const RAD = Math.PI / 180;
  const HOME = { yaw: -16, tilt: 39, zoom: 1 };
  const STEPS = [0, 1, 15, 60, 150, 300];
  const HEIGHT = [16, 29, 46, 70, 103, 145];
  const COLOR = ['#abbfc5', '#94d9d0', '#41b5aa', '#e7cd76', '#f29c60', '#da7072'];
  const POPULATION_BANDS = [
    {min:0, label:'未滿1萬', color:'#e5edcb'},
    {min:10000, label:'1–3萬', color:'#bdd8a7'},
    {min:30000, label:'3–5萬', color:'#80b6a0'},
    {min:50000, label:'5–10萬', color:'#478b83'},
    {min:100000, label:'10萬以上', color:'#235e66'}
  ];
  const GEO_HEIGHT = 16;
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
      const light=clamp(.52+(-nx*.78-ny*.35)*.25,.25,.8);
      walls.push({a,b,d,base,nx,ny,color:shade(COLOR[d.tier],light),highlight:shade('#e6bd79',light)});
    }
    const locate=([lon,lat])=>({x:((lon-120.3)*longitudeKm-cx)*unit,y:((23.15-lat)*latitudeKm-cy)*unit});
    return {districts,points:[...positions.values()],walls,footprint,unit,locate};
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
    // Mobile browsers can suppress the compatibility click immediately after
    // a drag. Accept a short touch tap once, and retain native keyboard clicks.
    function activateButton(button,action){
      let start=null,lastTap=-Infinity;
      listen(button,'pointerdown',e=>{if(e.pointerType==='touch')start={id:e.pointerId,x:e.clientX,y:e.clientY};});
      listen(button,'pointercancel',()=>{start=null;});
      listen(button,'pointerup',e=>{
        const tap=start;start=null;
        if(tap?.id!==e.pointerId||Math.hypot(e.clientX-tap.x,e.clientY-tap.y)>8)return;
        lastTap=performance.now();action();
      });
      listen(button,'click',e=>{
        if(e.detail&&performance.now()-lastTap<700&&(e.pointerType==='touch'||e.sourceCapabilities?.firesTouchEvents))return;
        action();
      });
    }
    const view={...HOME}, geo=window.CityGeoLayers?.prepare(model.locate);
    let layer=null, subsidenceKind='cumulative', geoStrokes=[], focusedFeature=null;
    const districtLayer=()=>layer==='registry'||layer==='population';
    const population=window.AtlasPopulation;
    const geoInfo=()=>layer==='subsidence'?geo?.subsidence[subsidenceKind]:geo?.[layer];
    let active=true, frame=0, resize, picked=null, retained=null, size, camera, targets=[], hoverFrame=0, hoverPoint=null;
    let markedDistrict=null;
    const pointerState=new Map();
    let pinch=null;
    for(const d of model.districts){
      const btn=element('button','city-model-label',labels);
      btn.type='button';btn.dataset.cityDistrict=d.name;
      element('span','city-model-name',btn).textContent=d.name;
      d.countLabel=element('span','city-model-count',btn);
      d.population=population?.districts[d.name];
      d.populationColor=d.population ? POPULATION_BANDS.filter(band=>d.population.population>=band.min).at(-1).color : '#a4b3b6';
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
    const layerBar=element('div','city-model-layers',root);
    layerBar.setAttribute('role','group');layerBar.setAttribute('aria-label','全市立體地圖圖層');
    const glyphs={
      registry:'<path d="m3 15 5-2 5 2-5 2-5-2Zm0 0v3l5 2 5-2v-3m-3-6 5-2 5 2-5 2-5-2Zm0 0v4m10-4v8l-5 2-2-1"/>',
      population:'<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6m1 3a5 5 0 0 1 4 5v1"/>',
      fault:'<path d="m3 17 4-4 2 1 3-6 2 4 3-5 1 1 3-4m-9 7-2 6"/>',
      subsidence:'<path d="M3 9c4-2 6-2 9 0s5 2 9 0M3 14c4-2 6-2 9 0s5 2 9 0M3 19c4-2 6-2 9 0s5 2 9 0"/>'
    };
    for(const [id,title] of [['registry','社區名冊'],['population','戶籍人口'],['fault','活動斷層'],['subsidence','地層下陷']]){
      const b=element('button','city-layer-choice',layerBar);
      b.type='button';b.dataset.cityLayer=id;
      b.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">'+glyphs[id]+'</svg>';
      b.append(title);activateButton(b,()=>setLayer(id));
    }
    const legend=element('div','city-model-legend',root);
    const scale=element('div','city-distance-scale',root);
    scale.setAttribute('aria-hidden','true');
    const scaleText=element('span','',scale);
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
      activateButton(b,action);
    }
    function sourceLink(parent,title,url) {
      if(!url?.startsWith('https://')){parent.append(title);return;}
      const a=element('a','',parent);a.href=url;a.target='_blank';a.rel='noopener noreferrer';a.textContent=title+' ↗';
    }
    const legendObserver=typeof ResizeObserver==='undefined'?null:new ResizeObserver(()=>{size=null;invalidate();});
    legendObserver?.observe(legend);
    function buildLegend(){
      legend.replaceChildren();
      root.dataset.subsidence=layer==='subsidence'?subsidenceKind:'';
      root.style.setProperty('--geo-swatch',({rate:'#8ff1fe',station:'#f1c5ff'})[subsidenceKind]||'#ffe181');
      const head=element('div','city-legend-head',legend);
      const title=element('strong','',head);
      if(layer==='registry'){
        title.textContent='各區收錄社區數';
        const units=element('span','city-legend-note',head);units.textContent='色階、柱高均按名冊筆數';
        const bands=element('div','city-legend-bands',legend);
        for(const [i,n] of STEPS.entries()){
          const item=element('span','',bands);item.style.setProperty('--band',COLOR[i]);
          item.textContent=i===STEPS.length-1?n+'+':i===0?'0':n+'–'+(STEPS[i+1]-1);
        }
        const meta=window.PILOT_DATA?.meta, source=meta?.sources?.find(x=>x.label.includes('工務局')&&x.label.includes('清冊'));
        if(source){const line=element('small','city-legend-source',legend);sourceLink(line,'臺南市工務局清冊',source.url);
          if(meta.registrySnapshot?.fileAsOf)line.append(' · '+meta.registrySnapshot.fileAsOf);}
      }else if(layer==='population'){
        title.textContent='各區戶籍人口';
        if(!population){
          element('span','city-legend-note',head).textContent='人口資料未載入';
          return;
        }
        element('span','city-legend-note',head).textContent=population.periodLabel+' · 全市 '+fmt(population.total)+' 人';
        const bands=element('div','city-legend-bands',legend);
        for(const band of POPULATION_BANDS){
          const item=element('span','',bands);item.style.setProperty('--band',band.color);
          item.textContent=band.label;
        }
        const line=element('small','city-legend-source',legend);
        sourceLink(line,population.source.name,population.source.url);
        const input=element('select','city-geo-select',head);
        input.setAttribute('aria-label','依人口排名選行政區');
        input.add(new Option('按人口排名選區',''));
        for(const [name,data] of Object.entries(population.districts).sort((a,b)=>a[1].rank-b[1].rank)){
          input.add(new Option('第 '+data.rank+' 名 · '+name+' '+fmt(data.population)+' 人',name));
        }
        input.onchange=()=>{highlightDistrict(input.value);onDistrict(input.value);};
      }else{
        const info=geoInfo(), rows=info?.rows||[];
        title.textContent=info?.title||(layer==='fault'?'活動斷層地質敏感區':'地層下陷');
        if(layer==='subsidence' && geo){
          const switcher=element('div','city-subsidence-choices',legend);
          switcher.setAttribute('role','group');switcher.setAttribute('aria-label','地層下陷資料種類');
          for(const [kind,name] of Object.entries(window.CityGeoLayers.groupNames)){
            const b=element('button','',switcher);
            b.type='button';b.dataset.citySubsidence=kind;b.textContent=name;
            b.setAttribute('aria-pressed',String(kind===subsidenceKind));
            b.onclick=()=>{
              subsidenceKind=kind;focusedFeature=null;geoStrokes=[];
              buildLegend();legend.querySelector('[data-city-subsidence="'+kind+'"]').focus({preventScroll:true});size=null;invalidate();
            };
          }
        }
        if(rows.length){
          const input=element('select','city-geo-select',head);
          input.setAttribute('aria-label',layer==='fault'?'選擇斷層公告區':'選擇地層下陷圖徵');
          input.add(new Option('查看個別'+(layer==='fault'?'公告區':'圖徵'), ''));
          for(const row of rows)input.add(new Option(row.label,row.key));
          input.value=focusedFeature||'';
          input.onchange=()=>focusFeature(input.value||null);
        }
        const message=element('div','city-geo-caption',legend);
        const selected=rows.find(row=>row.key===focusedFeature);
        message.textContent=selected?.detail||info?.caption||'本次未載入此圖層。';
        if(info){
          const line=element('small','city-legend-source',legend);
          sourceLink(line,info.source,selected?.source||info.url);
          if(info.date)line.append(' · '+info.date);
        }
      }
    }
    function focusFeature(key){
      focusedFeature=key;
      const select=legend.querySelector('select');if(select)select.value=key||'';
      const info=geoInfo(), row=info?.rows.find(r=>r.key===key);
      const caption=legend.querySelector('.city-geo-caption');
      if(caption)caption.textContent=row?.detail||info?.caption||'本次未載入此圖層。';
      const source=legend.querySelector('a');
      if(source)source.href=row?.source||info.url;
      if(row)announce.textContent=row.detail;
      size=null;invalidate();
    }
    function setLayer(id){
      if(layer===id || !['registry','population','fault','subsidence'].includes(id))return;
      layer=id;root.dataset.layer=id;focusedFeature=null;geoStrokes=[];
      picked=null;retained=null;markedDistrict=null;hoverPoint=null;
      for(const b of layerBar.children)b.setAttribute('aria-pressed',String(b.dataset.cityLayer===id));
      for(const d of model.districts){
        const pop=d.population, populationMode=id==='population';
        const stat=pop?'戶籍人口 '+fmt(pop.population)+' 人，全市第 '+pop.rank+' 名':'人口資料未載入';
        const registryStat='名冊 '+fmt(d.count)+' 個社區'+(d===leader?'（全市名冊數最多）':'');
        d.button.title=d.name+' · '+(populationMode?stat:registryStat);
        d.button.setAttribute('aria-label',d.button.title+'，開啟行政區');
        d.button.classList.toggle('is-leading',populationMode?pop?.rank===1:d===leader);
        d.countLabel.textContent=populationMode?(pop?fmt(pop.population):'—'):fmt(d.count);
      }
      buildLegend();size=null;invalidate();
      root.dispatchEvent(new CustomEvent('city-layer-change',{bubbles:true,detail:{layer:id}}));
    }
    function invalidate(){if(active&&!frame)frame=requestAnimationFrame(draw);}
    function rotateBy(degrees){view.yaw=(view.yaw+degrees)%360;invalidate();}
    function tiltBy(degrees){view.tilt=clamp(view.tilt+degrees,8,68);invalidate();}
    function zoomBy(factor){if(factor>0)view.zoom=clamp(view.zoom*factor,.68,2.4);invalidate();}
    function reset(){Object.assign(view,HOME);highlightDistrict(null);invalidate();}
    activateButton(resetButton,reset);
    function highlight(d){
      d ||= markedDistrict;
      if(picked===d)return;
      picked=d;
      canvas.style.cursor=d?'pointer':'grab';
      invalidate();
    }
    function highlightDistrict(name){
      const district=model.districts.find(row=>row.name===name);
      if(name && !district)return false;
      markedDistrict=district||null;
      if(layer==='population'){
        const input=legend.querySelector('select');if(input)input.value=name||'';
      }
      if(district){
        announce.textContent=district.button.title;
        if(camera&&size){
          const z=layer==='registry'?district.z:GEO_HEIGHT;
          const p=camera.at(district.anchor.x,district.anchor.y,z);
          if(p.x<35||p.x>size.width-35||p.y<size.top||p.y>size.height-size.bottom)Object.assign(view,HOME);
        }
      }
      highlight(markedDistrict);invalidate();
      return Boolean(district);
    }
    function sceneSize(){
      const width=root.clientWidth,height=root.clientHeight;
      if(!width||!height)return null;
      const compact=width<580,ratio=Math.min(window.devicePixelRatio||1,2);
      const top=layerBar.offsetTop+layerBar.offsetHeight+(compact?9:14);
      const bottom=Math.max(24,height-legend.offsetTop+(compact?6:12));
      const margin=compact?16:Math.max(32,width*.055);
      const defaultYaw=HOME.yaw*RAD, defaultTilt=HOME.tilt*RAD;
      const cs=Math.cos(defaultYaw),sn=Math.sin(defaultYaw),ct=Math.cos(defaultTilt),st=Math.sin(defaultTilt);
      let x1=Infinity,x2=-Infinity,y1=Infinity,y2=-Infinity;
      for(const d of model.districts)for(const poly of d.polygons)for(const p of poly[0]){
        const x=cs*p.x-sn*p.y,y=(sn*p.x+cs*p.y)*ct;
        const z=layer==='registry'?d.z:GEO_HEIGHT;
        x1=Math.min(x1,x);x2=Math.max(x2,x);y1=Math.min(y1,y-z*st);y2=Math.max(y2,y);
      }
      const scale=Math.max(.05,Math.min((width-2*margin)/(x2-x1),(height-top-bottom)/(y2-y1)));
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
      const km=5*model.unit*s<32?10:5;
      scaleText.textContent=km+' km';
      scale.style.width=(km*model.unit*s).toFixed(1)+'px';
      // Contact shadow follows the city's actual footprint, including its coast.
      for(const [dx,dy,alpha] of [[6,16,.09],[4,10,.16],[1,4,.35]]){
        roofMatrix(0,dx,dy);ctx.fillStyle='rgba(1,16,22,'+alpha+')';ctx.fill(model.footprint,'evenodd');
      }
      for(const p of model.points){p.rx=cs*p.x-sn*p.y;p.depth=sn*p.x+cs*p.y;p.sx=cx+s*p.rx;p.sy=cy+s*p.depth*ct;}
      const walls=model.walls.filter(w=>w.nx*sn+w.ny*cs>0);
      walls.sort((a,b)=>(a.a.depth+a.b.depth)-(b.a.depth+b.b.depth));
      targets=[];
      const registry=layer==='registry', levels=registry?HEIGHT:[GEO_HEIGHT];
      for(let tier=0;tier<levels.length;tier++){
        const low=tier?levels[tier-1]:0,high=levels[tier],up=high*s*st,down=low*s*st;
        ctx.setTransform(ratio,0,0,ratio,0,0);
        for(const w of walls){
          if(w.base>=high || w.d.z<high)continue;
          const {a,b,d}=w;
          ctx.fillStyle=registry?(d===picked?w.highlight:w.color):'#416571';
          ctx.beginPath();ctx.moveTo(a.sx,a.sy-up);ctx.lineTo(b.sx,b.sy-up);ctx.lineTo(b.sx,b.sy-down);ctx.lineTo(a.sx,a.sy-down);ctx.closePath();
          ctx.fill();
          // A narrow stroke seals anti-aliased seams between the neighbouring facets.
          ctx.strokeStyle=ctx.fillStyle;ctx.lineWidth=.43;ctx.stroke();
          targets.push({w,up,down});
        }
        for(const d of model.districts){
          if(registry&&d.tier!==tier)continue;
          roofMatrix(high);
          const base=layer==='population'?d.populationColor:registry?(d===picked?'#ffe6aa':COLOR[d.tier]):d===picked?'#accbc9':'#89a9ad';
          const surface=ctx.createLinearGradient(-330,-420,510,440);
          surface.addColorStop(0,base);surface.addColorStop(1,shade(base,.89));
          ctx.fillStyle=surface;ctx.fill(d.roof,'evenodd');
          ctx.strokeStyle=registry?(d===picked?'#fff4ce':'rgba(255,252,224,.83)'):'rgba(241,251,245,.6)';
          ctx.lineWidth=(d===picked?1.5:(registry ? .85 : .65))/s;ctx.lineJoin='round';ctx.stroke(d.roof);
          targets.push({d,z:high});
        }
      }
      ctx.setTransform(ratio,0,0,ratio,0,0);
      let occupied=[];
      if(!districtLayer() && geoInfo()){
        const projected=window.CityGeoLayers.draw(ctx,geoInfo(),p=>at(p.x,p.y,GEO_HEIGHT),{
          width,height,compact,top:size.top,bottom:height-size.bottom,focusedFeature
        });
        geoStrokes=projected.hits;occupied=projected.labels;
      }
      const ordered=picked?[picked,...labelOrder.filter(d=>d!==picked)]:labelOrder;
      for(const d of ordered){
        const anchor=at(d.anchor.x,d.anchor.y,registry?d.z:GEO_HEIGHT);
        const selected=d===picked;
        const featured=layer==='population'?(d.population?.rank===1||d.name==='新營區'):registry&&(d.name==='新營區'||d===leader||(!compact&&d.name==='善化區'));
        const flag=districtLayer()&&(selected||featured);
        const w=flag?Math.max(61,d.name.length*13+d.countLabel.textContent.length*7+14):d.name.length*(compact?10:12)+6;
        const h=flag?24:17,y=anchor.y-(featured?13:0),x=anchor.x;
        const rect=[x-w/2-3,y-h/2-3,x+w/2+3,y+h/2+3];
        const clips=rect[0]<3||rect[2]>width-3||rect[1]<size.top-9||rect[3]>height-size.bottom+8 ||
          (rect[2]>width-(compact?56:77)&&rect[1]<(compact?136:173)) ||
          (rect[0]<135&&rect[3]>height-(compact?85:70));
        const collides=occupied.some(r=>rect[0]<r[2]&&rect[2]>r[0]&&rect[1]<r[3]&&rect[3]>r[1]);
        const priority=districtLayer()||selected||(ranked.get(d.name)??50)<(compact?8:14);
        const show=priority&&((!clips&&!collides&&hit(anchor.x,anchor.y)===d)||selected);
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
          const rx=(x-cx)/s, depth=((y-cy)/s+t.z*st)/ct;
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
            hoverFrame=0;if(hoverPoint&&!pointerState.size) {
              highlight(districtLayer()?hit(hoverPoint.x,hoverPoint.y):null);
              if(!districtLayer())canvas.style.cursor=window.CityGeoLayers?.pick(geoStrokes,hoverPoint)?'pointer':'grab';
            }
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
      if(!cancelled&&!last.moved){
        const p=local(e), row=districtLayer()?null:window.CityGeoLayers?.pick(geoStrokes,p);
        if(row){focusFeature(row.key);return;}
        const d=hit(p.x,p.y);if(d)onDistrict(d.name);
      }
    }
    listen(canvas,'pointerup',e=>release(e,false));listen(canvas,'pointercancel',e=>release(e,true));
    // Pointerup already opens the district and can scroll its ranking into view.
    // Suppress the touch-generated click on the control now under the finger.
    // Native vertical panning is still handled by touch-action before touchend.
    listen(canvas,'touchend',e=>{if(e.cancelable)e.preventDefault();},{passive:false});
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
    const entry=new URLSearchParams(location.search).get('layer');
    setLayer(['fault','subsidence','population'].includes(entry)?entry:'registry');
    return {setActive,setLayer,getLayer:()=>layer,highlightDistrict,reset,zoomBy,rotateBy,tiltBy,destroy(){setActive(false);events.abort();resize?.disconnect();legendObserver?.disconnect();root.replaceChildren();}};
  }
  window.CityScene={mount};
})();
