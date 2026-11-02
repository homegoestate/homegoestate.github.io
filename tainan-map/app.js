window.CATALOG_READY.then(()=>{
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const data = window.PILOT_DATA || {meta:{},communities:[]}, meta = data.meta || {}, communities = data.communities || [], legacyCommunities=data.legacyCommunities||[];
  const features = window.DISTRICT_GEOJSON?.features || [], lifeItems = window.LIFE_DATA?.items || [];
  const categories = {daily:'日常',scenery:'風景',culture:'人文',history:'歷史',food:'名產',events:'活動'};
  const kindLabels = {highrise_candidate:'6 樓以上候選',lowrise_community:'低樓社區',use_unverified:'用途／樓層待核'};
  const marketCategories={all:'全部住宅（不混店面）',studio:'套房（依官方型態）',one_room:'1 房住宅',two_room:'2 房住宅',three_room:'3 房住宅',four_room:'4 房住宅',five_plus:'5 房以上住宅',shop:'店面',unknown:'用途／格局待核'};
  const BASELINE='2012-08-01', OFFICIAL_LVR='https://lvr.land.moi.gov.tw/';
  const esc = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const valid = v => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));
  const fmt = v => valid(v) ? Number(v).toLocaleString('zh-TW',{minimumFractionDigits:1,maximumFractionDigits:1}) : '—';
  const num = v => Number(v || 0).toLocaleString('zh-TW');
  const link = (href,label) => {try{const u=new URL(href);return /^https?:$/.test(u.protocol)?`<a class="source-link" href="${esc(u.href)}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>`:'';}catch{return '';}};
  const track = (name,id) => {try{window.pilotAnalytics?.track(name,id);}catch{}};
  const located = c => valid(c.lon) && valid(c.lat) && +c.lon > 119 && +c.lon < 122 && +c.lat > 21 && +c.lat < 26;
  const byId = new Map(communities.map(c=>[String(c.id),c]));
  const byDistrict = new Map(features.map(f=>[f.properties.name,[]]));
  communities.forEach(c=>{if(!byDistrict.has(c.district))byDistrict.set(c.district,[]);byDistrict.get(c.district).push(c);});
  const counts = name => name ? (byDistrict.get(name)||[]).length : communities.length;
  const lifeCount = name => lifeItems.filter(i=>(!name||i.district===name)&&i.kind!=='event-directory').length;
  const directoryCount = name => lifeItems.filter(i=>(!name||i.district===name)&&i.kind==='event-directory').length;
  let district='', selected=null, category='all', marketCategory='all', viewMode='market', period='all', kind='all', query='', page=1, sort='price';
  let compared=[], camera=[0,0,1100,900], animation=0, drag=null, dragged=false, searchTimer, renderTimer;
  const PAGE_SIZE=matchMedia('(max-width:700px)').matches?16:40, TX_PAGE_SIZE=40;
  const emptyStats={count:0,eligibleCount:0,mean:null,median:null,min:null,max:null,latestDate:null};
  // Read audited period statistics; never calculate from the paginated UI subset.
  const stats = c => c.statsByCategory?.[marketCategory]?.[period] || emptyStats;
  const sufficient = c => Number(stats(c).eligibleCount)>=5 && valid(stats(c).mean);
  const limited = c => Number(stats(c).eligibleCount)>0 && Number(stats(c).eligibleCount)<5 && valid(stats(c).sampleMean);
  const priceText = c => sufficient(c) ? `${fmt(stats(c).mean)} 萬／坪` : limited(c)?`少量成交均價 ${fmt(stats(c).sampleMean)} 萬／坪 · ${num(stats(c).eligibleCount)} 筆`:'資料不足，不推估';
  const periodInfo = () => {const p=meta.periods?.[period]||{};return {...p,start:period==='all'?BASELINE:(p.start||BASELINE),end:p.end||meta.asOf||'2026-11-02',label:period==='all'?'101/08/01 起歷史':p.label||(period==='12m'?'近 12 個月':'近 36 個月')};};
  const periodLabel = () => period==='all'?'101/08/01 起歷史 · 非當期行情':periodInfo().label;
  const categoryLabel = () => marketCategories[marketCategory]||'用途／格局待核';
  const priceValue = c => sufficient(c)?Number(stats(c).mean):limited(c)?Number(stats(c).sampleMean):null;
  const ageValue = c => valid(stats(c).ageYearsMedian)?Number(stats(c).ageYearsMedian):null;
  const unitValue = c => valid(stats(c).distinctTransactedUnitCount)?Number(stats(c).distinctTransactedUnitCount):null;
  const householdValue = c => valid(c.householdCount)?Number(c.householdCount):null;
  const householdAvailable = communities.some(c=>valid(c.householdCount));
  const sortLabels={price:'均價 高→低',age:'成交樣本屋齡 低→高',households:'使照戶數 多→少',units:'已揭露成交戶別 多→少',samples:'可比樣本 多→少',name:'社區名稱'};
  const stableTie=(a,b)=>String(a.name||'').localeCompare(String(b.name||''),'zh-TW')||String(a.district||'').localeCompare(String(b.district||''),'zh-TW')||String(a.id).localeCompare(String(b.id));
  function compareCommunities(a,b){
    if(sort==='name')return stableTie(a,b);
    const value=sort==='price'?priceValue:sort==='age'?ageValue:sort==='households'?householdValue:sort==='units'?unitValue:c=>Number(stats(c).eligibleCount)||null;
    const x=value(a),y=value(b);if(x===null&&y===null)return stableTie(a,b);if(x===null)return 1;if(y===null)return -1;return (sort==='age'?x-y:y-x)||stableTie(a,b);
  }
  const sortExplanation=()=>({price:'依所選類型與期間的真實成交均價排序；少量樣本另標示，缺值置後。',age:'依所選成交樣本的屋齡中位數排序，缺值置後；管理組織核准日不作屋齡。',households:'依使用執照登載戶數排序，缺值置後；不是目前社區住戶普查。',units:'只計本類型、本期間可辨識的不同成交戶別；不是社區總戶數，缺值置後。',samples:'依所選類型、期間的可比成交筆數排序。',name:'依社區名稱排序；無價、無屋齡的名冊同樣保留。'}[sort]);
  const matching = c => !query || `${c.name||''} ${c.district||''} ${c.address||''}`.toLocaleLowerCase().includes(query);
  const listPool = () => (query?communities:(district?byDistrict.get(district)||[]:communities)).filter(c=>matching(c)&&(kind==='all'||c.kind===kind));
  const scopePool = () => district ? byDistrict.get(district)||[] : communities;
  const coverageOf = items => ({total:items.length,located:items.filter(located).length,priced:items.filter(sufficient).length,limited:items.filter(limited).length});
  const addressFor=c=>c.address?(/^(臺|台)南市/.test(c.address)?c.address:'臺南市'+c.address):'';
  function queryActions(c){return `<div class="row-actions"><a class="official-lvr-link" href="${OFFICIAL_LVR}" target="_blank" rel="noopener noreferrer" title="開啟官方查詢首頁，再貼上門牌搜尋">實價登錄 ↗</a><button class="copy-address" data-copy-id="${esc(c.id)}" ${c.address?'':'disabled'}>複製門牌</button><span class="copy-status" aria-live="polite"></span></div>`;}
  async function copyAddress(c,button){
    const value=addressFor(c);if(!value)return;
    const status=button.parentElement.querySelector('.copy-status');let done=false;
    try{if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(value);done=true;}}catch{}
    if(!done){const field=document.createElement('textarea');field.value=value;field.setAttribute('aria-label','待複製門牌');field.style.cssText='position:fixed;left:0;top:0;opacity:0;';document.body.append(field);field.select();try{done=document.execCommand('copy');}catch{}field.remove();}
    if(done){button.textContent='✓ 已複製';status.textContent='已複製完整門牌，請貼到官方實價查詢。';}
    else{status.innerHTML=`<label>請選取門牌複製<input class="copy-fallback" readonly value="${esc(value)}"></label>`;status.querySelector('input')?.select();}
  }
  function bindQueryActions(root){root.querySelectorAll('.copy-address').forEach(el=>el.onclick=()=>copyAddress(byId.get(el.dataset.copyId),el));}
  function communityRow(c,cluster=false){
    const s=stats(c),enough=sufficient(c),few=limited(c),age=ageValue(c),units=unitValue(c),households=householdValue(c);
    return `<article class="community-card ${String(selected)===String(c.id)?'active':''}" data-community-id="${esc(c.id)}"><button class="community-row ${cluster?'nearby-choice':''} ${String(selected)===String(c.id)?'active':''}" data-id="${esc(c.id)}"><span class="row-heading"><span class="mini-building ${valid(c.floors)&&+c.floors<=5?'low':valid(c.floors)&&+c.floors>=15?'high':'mid'}" aria-hidden="true"></span><strong>${esc(c.name)}</strong><span class="row-arrow">↗</span></span><span class="row-address">${esc(c.address||'門牌待核')}</span><span class="row-meta">${esc(c.district)} · ${esc(kindLabels[c.kind]||c.kindLabel||'類型待核')}${located(c)?'':' · 待補座標'}</span><span class="row-price ${enough?'':few?'limited':'pending'}">${enough?`${fmt(s.mean)}<small> 萬／坪 · ${period==='all'?'歷史均價':'期間均價'}</small>`:few?`${fmt(s.sampleMean)}<small> 萬／坪 · 少量成交均價</small>`:'資料不足，不推估'}</span>${few?'<span class="sample-warning">樣本少，僅供個案參考</span>':''}<span class="row-sample">${esc(categoryLabel())} · 可比 ${num(s.eligibleCount)} / 匹配 ${num(s.count)} 筆${s.latestDate?' · 最新 '+esc(s.latestDate):''}</span><span class="row-facts"><span>樣本屋齡 <b>${age===null?'待補':fmt(age)+' 年'}</b></span><span>使照戶數 <b>${households===null?'待補':num(households)+' 戶'}</b></span><span>成交戶別 <b>${units===null?'待核':num(units)+' 戶別'}</b></span></span></button>${queryActions(c)}</article>`;
  }
  function bindCommunityRows(root,closeModal=false){root.querySelectorAll('.community-row[data-id]').forEach(el=>el.onclick=()=>{if(closeModal)$('infoDialog').close();selectCommunity(el.dataset.id);});bindQueryActions(root);}
  function filterControls(prefix,withSort=true){return `<div class="shared-market-controls"><label>成交類型<select id="${prefix}CategorySelect">${Object.entries(marketCategories).map(([key,label])=>`<option value="${key}" ${marketCategory===key?'selected':''}>${label}</option>`).join('')}</select></label><label>成交期間<select id="${prefix}PeriodSelect">${[['all','101/08/01 起歷史'],['12m','近 12 個月'],['36m','近 36 個月']].map(([key,label])=>`<option value="${key}" ${period===key?'selected':''}>${label}</option>`).join('')}</select></label>${withSort?`<label>社區排序<select id="${prefix}SortSelect">${Object.entries(sortLabels).map(([key,label])=>`<option value="${key}" ${sort===key?'selected':''} ${key==='households'&&!householdAvailable?'disabled':''}>${label}${key==='households'&&!householdAvailable?'（尚無來源）':''}</option>`).join('')}</select></label>`:''}</div>`;}
  function applyMarketFilter(key,value,refreshModal){
    if(key==='category')marketCategory=value;else if(key==='period')period=value;else if(key==='sort')sort=value;
    page=1;$('categorySelect').value=marketCategory;$('periodSelect').value=period;$('sortSelect').value=sort;
    updateSummary();renderList();renderDetail();renderPins();if(refreshModal)refreshModal();
  }
  function bindFilterControls(prefix,refreshModal,withSort=true){
    for(const [key,suffix] of [['category','Category'],['period','Period'],...(withSort?[['sort','Sort']]:[])])$(`${prefix}${suffix}Select`).onchange=e=>applyMarketFilter(key,e.target.value,refreshModal);
  }
  const projection = ([lon,lat]) => [(+lon-120.3)*Math.cos(23*Math.PI/180),-(+lat-23.1)];
  const polygons = f => f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.type==='MultiPolygon'?f.geometry.coordinates:[];
  const allPoints=features.flatMap(f=>polygons(f).flat(2).map(projection));
  const rawBounds=allPoints.length?[Math.min(...allPoints.map(p=>p[0])),Math.min(...allPoints.map(p=>p[1])),Math.max(...allPoints.map(p=>p[0])),Math.max(...allPoints.map(p=>p[1]))]:[-.3,-.3,.3,.3];
  const scale=Math.min(790/(rawBounds[2]-rawBounds[0]),730/(rawBounds[3]-rawBounds[1]));
  const project=ll=>{const p=projection(ll);return [550+(p[0]-(rawBounds[0]+rawBounds[2])/2)*scale,440+(p[1]-(rawBounds[1]+rawBounds[3])/2)*scale];};
  const pathOf=f=>polygons(f).map(poly=>poly.map(ring=>ring.map((p,i)=>`${i?'L':'M'}${project(p).map(v=>v.toFixed(2)).join(',')}`).join('')+'Z').join('')).join('');
  const boundsOf=f=>{const p=polygons(f).flat(2).map(project);return [Math.min(...p.map(p=>p[0])),Math.min(...p.map(p=>p[1])),Math.max(...p.map(p=>p[0])),Math.max(...p.map(p=>p[1]))];};
  function centroid(f){let largest=0,result=null;for(const poly of polygons(f)){const ring=poly[0].map(project);let a=0,x=0,y=0;for(let i=0;i<ring.length;i++){const p=ring[i],q=ring[(i+1)%ring.length],cross=p[0]*q[1]-q[0]*p[1];a+=cross;x+=(p[0]+q[0])*cross;y+=(p[1]+q[1])*cross;}if(Math.abs(a)>largest){largest=Math.abs(a);result=[x/(3*a),y/(3*a)];}}const b=boundsOf(f);return result||[(b[0]+b[2])/2,(b[1]+b[3])/2];}
  const densityColor=n=>n>=300?'#789980':n>=150?'#96af91':n>=60?'#b0c09d':n>=15?'#c8ceb0':n>0?'#dcdbc1':'#e9e4cf';
  const districts=features.map(f=>({f,name:f.properties.name,path:pathOf(f),center:centroid(f),bounds:boundsOf(f),color:densityColor(counts(f.properties.name))}));
  const positions=new Map(communities.filter(located).map(c=>[String(c.id),project([c.lon,c.lat])]));
  function renderMap(){
    $('thickness').innerHTML=districts.map(d=>`<path data-name="${esc(d.name)}" d="${d.path}" fill="#c7b998" stroke="#b7aa8c" stroke-width=".8"/>`).join('');
    $('districts').innerHTML=districts.map(d=>`<path class="district" data-name="${esc(d.name)}" d="${d.path}" fill="${d.color}" fill-rule="evenodd" tabindex="0" role="button" aria-label="${esc(d.name)}，名冊 ${counts(d.name)} 個社區"><title>${esc(d.name)} · 名冊 ${counts(d.name)} 個社區</title></path>`).join('');
    $('districts').querySelectorAll('.district').forEach(el=>{el.onclick=()=>{if(!dragged)chooseDistrict(el.dataset.name);};el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();chooseDistrict(el.dataset.name);}};});
    if(!features.length)$('mapHint').textContent='行政區圖尚未載入，仍可使用名冊搜尋。';
  }
  function pixelScale(){return 1/($('mapSvg').getScreenCTM()?.a||1);}
  function syncCamera(){
    $('mapSvg').setAttribute('viewBox',camera.join(' '));const px=pixelScale();
    $('thickness').style.transform=`translateY(${7*px}px)`;
    document.querySelectorAll('.pin-scale,.cluster-scale,.badge-scale').forEach(el=>el.setAttribute('transform',`scale(${px})`));
    $('mapTooltip').hidden=true;
  }
  function renderDistrictBadges(){
    const px=pixelScale(), placed=[], centerCamera=[camera[0]+camera[2]/2,camera[1]+camera[3]/2],compact=matchMedia('(max-width:700px)').matches&&!district,bw=compact?43:58,bh=compact?29:37;
    const stageRect=$('mapSvg').getBoundingClientRect(),matrix=$('mapSvg').getScreenCTM(),visibleTop=(stageRect.top-matrix.f)/matrix.d,visibleBottom=(stageRect.bottom-matrix.f)/matrix.d;
    const ordered=[...districts].sort((a,b)=>((a.bounds[2]-a.bounds[0])*(a.bounds[3]-a.bounds[1]))-((b.bounds[2]-b.bounds[0])*(b.bounds[3]-b.bounds[1])));
    $('districtLabels').innerHTML=ordered.map(d=>{
      if(district && d.name!==district)return '';
      let [x,y]=d.center;
      if(!district){
        // Leaders connect a readable district badge to its true centroid. Community anchors never move.
        const w=(bw+3)*px,h=(bh+3)*px,collides=(nx,ny)=>placed.some(p=>Math.abs(nx-p[0])<w&&Math.abs(ny-p[1])<h);
        if(collides(x,y)){let found=false;for(let r=1;r<17&&!found;r++)for(let a=0;a<16;a++){const angle=a*Math.PI/8,nx=d.center[0]+Math.cos(angle)*r*(compact?18:26)*px,ny=d.center[1]+Math.sin(angle)*r*(compact?17:25)*px;if(nx<camera[0]+36*px||nx>camera[0]+camera[2]-36*px||ny<(compact?visibleTop+165*px:camera[1]+85*px)||ny>(compact?visibleBottom-116*px:camera[1]+camera[3]-90*px))continue;if(!collides(nx,ny)){x=nx;y=ny;found=true;break;}}}
        placed.push([x,y]);
      }else {x=centerCamera[0];y=camera[1]+92*px;}
      const displaced=Math.hypot(x-d.center[0],y-d.center[1])>5*px;
      return `<g class="district-badge ${compact?'compact':''} ${d.name==='善化區'?'featured':''}" data-name="${esc(d.name)}" role="button" tabindex="0" aria-label="${esc(d.name)}，名冊 ${counts(d.name)} 個社區">${!district&&displaced?`<path class="badge-leader" d="M${d.center.join(',')}L${x},${y}"/>`:''}<g transform="translate(${x} ${y})"><g class="badge-scale" transform="scale(${px})"><rect x="${-bw/2}" y="${-bh/2}" width="${bw}" height="${bh}" rx="${compact?7:10}"/><text class="district-label" y="${compact?-2:-3}" text-anchor="middle">${esc(d.name)}</text><text class="district-count" y="${compact?9:11}" text-anchor="middle">${num(counts(d.name))}</text></g></g></g>`;
    }).join('');
    $('districtLabels').querySelectorAll('.district-badge').forEach(el=>{el.onclick=e=>{e.stopPropagation();if(!dragged)chooseDistrict(el.dataset.name);};el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();chooseDistrict(el.dataset.name);}};});
  }
  function fly(target){cancelAnimationFrame(animation);const from=[...camera],start=performance.now(),duration=matchMedia('(prefers-reduced-motion: reduce)').matches?0:430;const tick=now=>{const t=duration?Math.min(1,(now-start)/duration):1,e=1-(1-t)**3;camera=target.map((v,i)=>from[i]+(v-from[i])*e);syncCamera();if(t<1)animation=requestAnimationFrame(tick);else {renderPins();renderDistrictBadges();}};animation=requestAnimationFrame(tick);}
  function fitDistrict(name){const d=districts.find(d=>d.name===name);if(!d)return;const [x1,y1,x2,y2]=d.bounds,w=Math.max(42,(x2-x1)*1.48),h=Math.max(42,(y2-y1)*1.5),width=Math.max(w,h*1100/900);fly([(x1+x2)/2-width/2,(y1+y2)/2-width*900/1100/2,width,width*900/1100]);}
  function buildingArt(c){
    const floor=valid(c.floors)?+c.floors:null;
    if(floor!==null&&floor<=5)return `<ellipse cy="1" rx="22" ry="7" fill="#526b4925"/><g filter="url(#pinShadow)"><path class="pin-face" d="M-19 -27L3 -20V0L-19 -7Z" fill="#eee5cc"/><path d="M3 -20L20 -27V-7L3 0Z" fill="#c8c4a9"/><path d="M-22 -29L-6 -42L22 -29L3 -20Z" fill="#668767"/><path d="M-22 -29L-6 -42L3 -20Z" fill="#90a17b"/><path d="M-13 -21L-7 -19V-12L-13 -14ZM9 -19L15 -22V-15L9 -12Z" fill="#74908a"/><path d="M-3 -15L1 -14V-1L-3 -2Z" fill="#9b8b64"/></g>`;
    if(floor!==null&&floor>=15)return `<ellipse cy="1" rx="23" ry="7" fill="#526b4925"/><g filter="url(#pinShadow)"><path d="M-20 -15L4 -7L24 -15V-5L4 3L-20 -5Z" fill="#c7c0a3"/><path class="pin-face" d="M-15 -65L2 -59V-7L-15 -13Z" fill="#eee8d7"/><path d="M2 -59L17 -66V-14L2 -7Z" fill="#c8c9b3"/><path d="M-15 -65L0 -72L17 -66L2 -59Z" fill="#6b8a64"/><path d="M-12 -67L0 -72L13 -67L1 -62Z" fill="#a5b58c"/><path d="M-20 -36L-15 -34V-13L-20 -15Z" fill="#d6d0ba"/><path d="M-10 -56L-5 -54M-10 -47L-5 -45M-10 -38L-5 -36M-10 -29L-5 -27M-10 -20L-5 -18M7 -55L12 -57M7 -46L12 -48M7 -37L12 -39M7 -28L12 -30M7 -19L12 -21" stroke="#7e9b90" stroke-width="3"/></g>`;
    const h=floor===null?31:47;
    return `<ellipse cy="1" rx="22" ry="7" fill="#526b4925"/><g filter="url(#pinShadow)"><path class="pin-face" d="M-18 -${h}L3 -${h-7}V0L-18 -7Z" fill="${floor===null?'#e1dfd2':'#eee6d0'}"/><path d="M3 -${h-7}L20 -${h}V-7L3 0Z" fill="#c8c7ae"/><path d="M-18 -${h}L-1 -${h+7}L20 -${h}L3 -${h-7}Z" fill="${floor===null?'#8c9b84':'#789568'}"/><path d="M-12 -${h+1}L0 -${h+5}L12 -${h+1}L1 -${h-4}Z" fill="#b2bf96"/>${[16,27,...(h>40?[38]:[])].map(y=>`<path d="M-12 -${y}L-6 -${y-2}M8 -${y-2}L14 -${y+1}" stroke="#839d8e" stroke-width="3"/>`).join('')}</g>`;
  }
  function showTooltip(c,e){const tip=$('mapTooltip');tip.innerHTML=`<strong>${esc(c.name)}</strong><span>${priceText(c)}</span><small>${esc(categoryLabel())} · 可比 ${num(stats(c).eligibleCount)} 筆<br>${esc(periodLabel())}</small>`;tip.hidden=false;const box=$('mapSvg').getBoundingClientRect();tip.style.left=`${Math.max(10,Math.min(e.clientX-box.left+15,box.width-235))}px`;tip.style.top=`${Math.max(85,Math.min(e.clientY-box.top-70,box.height-160))}px`;}
  function renderPins(){
    if(!district){$('pins').innerHTML='';return;}
    const items=(byDistrict.get(district)||[]).filter(c=>located(c)&&(kind==='all'||c.kind===kind)),px=pixelScale(),cell=matchMedia('(max-width:700px)').matches?66:62,bins=new Map();
    for(const c of items){const [x,y]=positions.get(String(c.id)),sx=(x-camera[0])/px,sy=(y-camera[1])/px,key=`${Math.floor(sx/cell)}:${Math.floor(sy/cell)}`;if(!bins.has(key))bins.set(key,[]);bins.get(key).push(c);}
    const clusters=[...bins.values()];
    const groupCenter=group=>group.reduce((a,c)=>{const p=positions.get(String(c.id));return [a[0]+p[0]/group.length,a[1]+p[1]/group.length];},[0,0]);
    // Merge adjacent bins whose screen symbols would overlap; every input remains represented.
    for(let i=0;i<clusters.length;i++){let center=groupCenter(clusters[i]);for(let j=i+1;j<clusters.length;j++){const next=groupCenter(clusters[j]);if(Math.hypot(center[0]-next[0],center[1]-next[1])<57*px){clusters[i].push(...clusters[j]);clusters.splice(j,1);center=groupCenter(clusters[i]);j=i;}}}
    $('pins').innerHTML=clusters.map((group,index)=>{
      if(group.length>1){const xy=group.reduce((a,c)=>{const p=positions.get(String(c.id));return [a[0]+p[0]/group.length,a[1]+p[1]/group.length];},[0,0]),radius=group.length>=100?27:group.length>=10?25:23;return `<g class="map-cluster" data-index="${index}" data-count="${group.length}" data-sample-count="${group.filter(c=>priceValue(c)!==null).length}" data-ids="${esc(group.map(c=>c.id).join(','))}" transform="translate(${xy.join(' ')})" tabindex="0" role="button" aria-label="此區共 ${group.length} 個社區，${group.filter(c=>priceValue(c)!==null).length} 個有本類型樣本，點選放大或查看全部"><g class="cluster-scale" transform="scale(${px})"><circle r="${radius+6}" fill="#f9f5df" opacity=".6"/><circle r="${radius}" fill="url(#clusterFill)" stroke="#e5e6c8" stroke-width="2"/><text class="cluster-count" text-anchor="middle" y="1">${group.length}</text><text class="cluster-label" text-anchor="middle" y="14">${group.filter(c=>priceValue(c)!==null).length} 有樣本</text></g><title>此處 ${group.length} 個社區，點選查看全部與放大</title></g>`;}
      const c=group[0],p=positions.get(String(c.id));return `<g class="community-pin ${String(selected)===String(c.id)?'active':''} ${sufficient(c)?'priced':'unpriced'}" data-id="${esc(c.id)}" data-lon="${c.lon}" data-lat="${c.lat}" transform="translate(${p.join(' ')})" role="button" tabindex="0" aria-label="${esc(c.name)}，${esc(priceText(c))}"><title>${esc(c.name)}｜${esc(priceText(c))}｜${esc(periodLabel())}</title><g class="pin-scale" transform="scale(${px})">${buildingArt(c)}<circle class="pin-anchor" r="3" fill="${sufficient(c)?'#375f44':'#9b9e90'}"/><rect x="-25" y="-78" width="52" height="85" fill="transparent"/></g></g>`;
    }).join('');
    $('pins').querySelectorAll('.community-pin').forEach(el=>{const c=byId.get(el.dataset.id);el.onclick=e=>{e.stopPropagation();if(!dragged)selectCommunity(c.id);};el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();selectCommunity(c.id);}};el.onpointerenter=e=>showTooltip(c,e);el.onpointermove=e=>{if(!drag)showTooltip(c,e);};el.onpointerleave=()=>$('mapTooltip').hidden=true;});
    $('pins').querySelectorAll('.map-cluster').forEach(el=>{const group=clusters[+el.dataset.index],open=e=>{e.stopPropagation();if(!dragged)openCluster(group);};el.onclick=open;el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open(e);}};});
    $('pins').dataset.representedCount=String(items.length);$('pins').dataset.clusterCount=String(clusters.filter(g=>g.length>1).length);
  }
  function openCluster(group,clusterPage=1){
    const items=[...group].sort(compareCommunities),cov=coverageOf(items),pages=Math.max(1,Math.ceil(items.length/PAGE_SIZE));clusterPage=Math.max(1,Math.min(clusterPage,pages));const shown=items.slice((clusterPage-1)*PAGE_SIZE,clusterPage*PAGE_SIZE);
    openDialog(`這一帶有 ${num(group.length)} 個社區`,`<div class="cluster-summary"><strong>${num(cov.total)} 個社區名冊</strong><span>${num(cov.priced+cov.limited)} 個有本類型成交樣本</span><small>其中 ${num(cov.priced)} 個至少 5 筆可比成交；${num(cov.limited)} 個為少量參考。無樣本的名冊仍保留。</small></div>${filterControls('cluster')}<p class="filter-context"><span class="filter-choice">${esc(categoryLabel())} · ${esc(periodLabel())}<br></span><span class="filter-dates">${esc(periodInfo().start)} ～ ${esc(periodInfo().end)}</span><span class="filter-explanation">。${esc(sortExplanation())}</span></p><div class="cluster-toolbar"><button id="zoomCluster" class="primary">放大這一帶 ↗</button><a class="official-lvr-link" href="${OFFICIAL_LVR}" target="_blank" rel="noopener noreferrer">開啟官方實價登錄 ↗</a></div><p class="official-query-note">官方連結為查詢首頁；複製門牌後貼上，並設定日期及類型。</p><div id="clusterList" class="nearby-list cluster-community-list">${shown.map(c=>communityRow(c,true)).join('')}</div><nav id="clusterPager" class="pager"><button id="clusterPrev" ${clusterPage===1?'disabled':''}>上一頁</button><span>${clusterPage} / ${pages} 頁 · ${num(group.length)} 筆</span><button id="clusterNext" ${clusterPage===pages?'disabled':''}>下一頁</button></nav>`);
    bindCommunityRows($('clusterList'),true);bindFilterControls('cluster',()=>openCluster(group,1));
    $('clusterPrev').onclick=()=>openCluster(group,clusterPage-1);$('clusterNext').onclick=()=>openCluster(group,clusterPage+1);
    $('zoomCluster').onclick=()=>{const points=group.map(c=>positions.get(String(c.id))),x=points.reduce((a,p)=>a+p[0],0)/points.length,y=points.reduce((a,p)=>a+p[1],0)/points.length,w=Math.max(1.2,camera[2]*.4);$('infoDialog').close();fly([x-w/2,y-w*900/1100/2,w,w*900/1100]);};
    track('cluster_open',district);
  }
  function updateSummary(){
    const cov=coverageOf(scopePool()),isCity=!district;
    $('districtTitle').textContent=district||'全市社區名冊';$('sceneLabel').textContent=district?'EXPLORE THE NEIGHBORHOOD':'THE WHOLE CITY';
    $('districtDescription').textContent=`名冊 ${num(cov.total)} · 可定位 ${num(cov.located)} · 有可比行情 ${num(cov.priced)} · 待補價格 ${num(cov.total-cov.priced)}`;
    $('mapTitle').textContent=district?`${district}，慢慢看。`:'全城，一眼看見。';
    $('breadcrumb').textContent=district?`台南市 / ${district}`:'台灣 / 台南市';
    $('mapHint').textContent=district?'點建築看均價；點數字展開聚合社區。':'選一個行政區，展開全區社區名冊。';
    $('mapStatus').innerHTML=isCity?`<strong>${num(cov.total)}</strong><span>筆社區名冊</span><small>${num(cov.located)} 筆有座標 · 37 個行政區</small>`:`<strong>${num(cov.located)}</strong><span>筆可定位名冊</span><small>${num(cov.total-cov.located)} 筆待補座標，仍列在名冊</small>`;
    $('legendText').textContent=district?'聚合大數為社區總數，小字為有樣本社區數':'數字為社區名冊數，顏色不是房價';
    $('readDistrictLife').textContent=`閱讀${district||'北區'}生活 ↗`;
    $('periodNote').textContent=`${categoryLabel()} · ${periodLabel()}${periodInfo().start?' · '+periodInfo().start+' ～ '+periodInfo().end:''}${period==='all'?'；跨期歷史統計，非目前行情。':'；依資料快照計算，非即時房價。'}`;
    $('atlasStats').innerHTML=`<strong>${num(communities.length)}<span>筆社區名冊</span></strong><strong>37<span>行政區可切換</span></strong><strong>${num(communities.filter(located).length)}<span>筆有座標</span></strong>`;
  }
  function renderList(){
    const items=listPool().sort(compareCommunities);
    const pages=Math.max(1,Math.ceil(items.length/PAGE_SIZE));page=Math.min(Math.max(1,page),pages);const start=(page-1)*PAGE_SIZE,shown=items.slice(start,start+PAGE_SIZE),cov=coverageOf(items);
    $('resultCount').textContent=`${query?'全市搜尋':kind!=='all'?'篩選結果':'全部名冊'} ${num(items.length)} 筆`;
    $('scopeCoverage').innerHTML=`<div><strong>${num(cov.total)}</strong><span>名冊</span></div><div><strong>${num(cov.located)}</strong><span>可定位</span></div><div><strong>${num(cov.priced+cov.limited)}</strong><span>有成交參考</span></div><div><strong>${num(cov.priced)}</strong><span>達 5 筆</span></div>`;
    $('sampleCoverageNote').textContent=`有可比行情須至少 5 筆；另有 ${num(cov.limited)} 筆名冊提供少量成交參考，未計入可比行情。`;
    $('communityList').innerHTML=shown.map(c=>communityRow(c)).join('')||'<p class="empty">這個篩選目前沒有名冊結果。可清除搜尋、更換類型，或補充名冊；不代表本區沒有建物或交易。</p>';
    $('communityList').dataset.total=String(items.length);$('communityList').dataset.page=String(page);
    bindCommunityRows($('communityList'));$('sortNote').textContent=sortExplanation()+(!householdAvailable?' 使照戶數目前無可核對來源，該排序暫停使用。':'');
    $('marketListPager').innerHTML=`<button id="marketPrev" ${page<=1?'disabled':''} aria-label="上一頁社區名冊">←</button><span>${items.length?start+1:0}–${Math.min(start+PAGE_SIZE,items.length)} / ${num(items.length)}<small>第 ${page} / ${pages} 頁</small></span><button id="marketNext" ${page>=pages?'disabled':''} aria-label="下一頁社區名冊">→</button><label class="jump-label">跳至<input id="marketPageInput" type="number" min="1" max="${pages}" value="${page}" aria-label="跳至社區名冊頁碼">頁</label>`;
    const turn=p=>{page=p;renderList();$('communityList').scrollIntoView({behavior:'smooth',block:'start'});};
    $('marketPrev').onclick=()=>turn(page-1);$('marketNext').onclick=()=>turn(page+1);$('marketPageInput').onchange=e=>turn(Math.max(1,Math.min(pages,Number(e.target.value)||1)));
  }
  function closeDetail(){selected=null;$('detail').hidden=true;document.body.classList.remove('detail-open');document.querySelectorAll('.community-pin').forEach(el=>el.classList.remove('active'));renderList();}
  function chooseDistrict(name,keepDetail=false){
    district=name;page=1;query='';$('search').value='';$('clearSearch').hidden=true;$('searchResults').hidden=true;category='all';
    document.body.classList.toggle('district-focused',!!name);$('districtSelect').value=name;closeLife();if(!keepDetail)closeDetail();
    document.querySelectorAll('.district').forEach(el=>{el.classList.toggle('selected',el.dataset.name===name);el.classList.toggle('muted',!!name&&el.dataset.name!==name);el.setAttribute('aria-pressed',String(el.dataset.name===name));});
    $('thickness').querySelectorAll('path').forEach(el=>el.style.opacity=name&&el.dataset.name!==name?'.15':'1');
    document.querySelectorAll('.shortcuts button').forEach(el=>el.classList.toggle('active',el.dataset.name===name));
    updateSummary();renderPins();renderDistrictBadges();renderList();renderLife();if(name)fitDistrict(name);else fly([0,0,1100,900]);
  }
  function selectCommunity(id){
    const c=byId.get(String(id));if(!c)return;closeLife();if(district!==c.district)chooseDistrict(c.district,true);setMode('market');selected=c.id;$('searchResults').hidden=true;renderList();renderDetail();renderPins();track('community_open',c.id);
  }
  function renderDetail(){
    const c=byId.get(String(selected));if(!c)return;const s=stats(c),enough=sufficient(c),few=limited(c),age=ageValue(c),units=unitValue(c),households=householdValue(c);
    $('detail').hidden=false;document.body.classList.add('detail-open');
    $('detail').innerHTML=`<button id="closeDetail" class="detail-close" aria-label="關閉社區資訊">×</button><span class="detail-kicker">${esc(c.district)} / ${esc(kindLabels[c.kind]||c.kindLabel||'類型待核')}</span><div class="detail-art" aria-hidden="true"><svg viewBox="-40 -83 80 92">${buildingArt(c)}</svg></div><h2>${esc(c.name)}</h2><p class="address">${esc(c.address||'代表門牌待補')}</p>${queryActions(c)}<p class="official-query-note">官方入口開啟查詢首頁；複製門牌後，在官方頁設定地址與條件。</p>${filterControls('detail',false)}<div class="building-facts"><span>${valid(c.floors)?esc(c.floors)+' 樓':'樓層待核'}</span>${valid(c.buildingCount)?'<span>'+esc(c.buildingCount)+' 棟</span>':''}<span>${located(c)?'有來源座標':'待補座標'}</span></div><div class="metric"><span class="metric-label">${esc(categoryLabel())}<br>${esc(periodLabel())} · ${few?'少量成交均價':'算術平均單價'}</span><div class="metric-value ${enough?'':few?'limited':'insufficient'}">${enough?fmt(s.mean)+'<small>萬元／坪</small>':few?fmt(s.sampleMean)+'<small>萬元／坪 · '+num(s.eligibleCount)+' 筆</small>':'資料不足，不推估'}</div><div class="metrics"><div><span>可比 / 本類型匹配成交</span><strong>${num(s.eligibleCount)} / ${num(s.count)}<small> 筆</small></strong></div><div><span>中位單價</span><strong>${enough?fmt(s.median):few?fmt(s.sampleMedian):'—'}<small> 萬／坪</small></strong></div></div><p class="help">${enough?'可比單價範圍 '+fmt(s.min)+'–'+fmt(s.max)+' 萬／坪':few?'樣本少，僅供個案參考。少量單價範圍 '+fmt(s.sampleMin)+'–'+fmt(s.sampleMax)+' 萬／坪；不視為完整社區行情。':'此類型、期間尚無可比成交或資料缺漏，保留名冊、不推估均價。'}<br>期間最新成交：${esc(s.latestDate||'尚無匹配紀錄')}${period==='all'?'<br><strong>此為 101/08/01 起跨期歷史均價，非當期市場行情。</strong>':''}</p></div><dl class="community-evidence"><div><dt>成交樣本屋齡</dt><dd>${age===null?'資料待補':fmt(age)+' 年'}<small>${age===null?'沒有可核對的完成日期':'中位數 · '+num(s.ageSampleCount)+' 筆有日期樣本；計至 '+esc(meta.asOf||'資料基準日')}${s.agePrecision==='month'||s.agePrecision==='mixed'?'；部分日期精確至月，屋齡為約數':''}</small></dd></div><div><dt>使照登載戶數</dt><dd>${households===null?'來源待補':num(households)+' 戶'}<small>${esc(c.householdNote||c.householdCountNote||'使用執照的登載戶數，非目前社區住戶普查。')}</small>${c.householdSourceUrl?link(c.householdSourceUrl,c.householdSource||'戶數來源'):''}</dd></div><div><dt>已揭露成交戶別</dt><dd>${units===null?'戶別證據待補':num(units)+' 個不同戶別'}<small>僅計本類型、本期間可辨識的成交戶別，非社區總戶數。${s.unitIdentityCoverage?' 已辨識 '+num(s.unitIdentityCoverage.identifiedRows)+' / '+num(s.unitIdentityCoverage.transactionRows)+' 筆交易列。':''}</small></dd></div></dl><button id="transactionsButton" class="primary full">查看 ${num(s.count)} 筆本類型成交明細 ↗</button><button id="addCompare" class="full">${compared.includes(c.id)?'✓ 已加入比較 · 點此移除':'＋ 加入比較（最多 3 個）'}</button><div class="detail-section"><h3>這份資料涵蓋什麼</h3><p>${esc(c.matchNote||'僅涵蓋可確定門牌配對的交易，不推定名冊外門牌或其他棟別。')}</p><p>${esc(categoryLabel())} · ${esc(periodInfo().start)} ～ ${esc(periodInfo().end)}<br>資料快照 ${esc(meta.asOf||'未提供')}</p>${c.approvalDate?'<p>名冊成立核准：'+esc(c.approvalDate)+'<br><span class="help">此日期不是建物完工年或屋齡。</span></p>':''}${link(c.sourceUrl,'次級來源：社區名冊')}<p class="help">${located(c)?'圖示錨定來源經緯度 '+esc(c.lon)+'，'+esc(c.lat)+'；輪廓依樓層分類示意，非實際外觀。':'來源缺少可信座標，保留在名冊、不臆測地圖位置。'}<br>成交條件仍須逐筆核對；不是銀行鑑價。</p></div><button id="communityFeedback" class="full">補充／回報這個社區</button>`;
    bindQueryActions($('detail'));bindFilterControls('detail',null,false);
    $('closeDetail').onclick=closeDetail;$('communityFeedback').onclick=()=>feedback({district:c.district,communityId:c.id});$('transactionsButton').onclick=()=>showTransactions(c);
    $('addCompare').onclick=()=>{if(compared.includes(c.id))compared=compared.filter(id=>id!==c.id);else if(compared.length<3)compared.push(c.id);else{openDialog('已選滿 3 個社區','<p>請先移除一個社區，再加入新的比較對象。</p>');return;}renderCompare();renderDetail();};
  }
  let txRequestEpoch=0;
  $('infoDialog').addEventListener('close',()=>{txRequestEpoch++;});
  function openDialog(title,html){txRequestEpoch++;$('dialogTitle').textContent=title;$('dialogBody').innerHTML=html;if(!$('infoDialog').open)$('infoDialog').showModal();}
  function txInPeriod(t){const p=periodInfo();return !!t.date&&t.date>=p.start&&t.date<=p.end;}
  function txInCategory(t){return marketCategory==='all'?t.propertyUse==='residential':t.category===marketCategory;}
  async function showTransactions(c,txPage=1){
    if(!Array.isArray(c.transactions)){
      openDialog(c.name+'｜成交明細','<p role="status">正在載入 '+esc(c.district)+' 的原始成交明細…</p><p>分類、期間與均價已載入；明細取得後即可逐筆核對。</p>');
      const requestEpoch=txRequestEpoch;
      try{
        await window.ensureDistrictTransactions(c.district);
        if(requestEpoch!==txRequestEpoch||!$('infoDialog').open||selected!==c.id)return;
        return showTransactions(c,txPage);
      }catch(error){
        if(requestEpoch!==txRequestEpoch||!$('infoDialog').open)return;
        openDialog(c.name+'｜明細暫時無法載入','<p role="alert">連線或資料檢查未完成，無法確認成交明細；這不代表沒有成交。</p><button id="retryTransactions" class="primary">重新載入明細</button>'+queryActions(c));
        $('retryTransactions').onclick=()=>showTransactions(c,txPage);bindQueryActions($('dialogBody'));return;
      }
    }
    const rows=(c.transactions||[]).filter(t=>txInPeriod(t)&&txInCategory(t)).sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))||String(a.id||'').localeCompare(String(b.id||''))),pages=Math.max(1,Math.ceil(rows.length/TX_PAGE_SIZE));txPage=Math.max(1,Math.min(txPage,pages));const shown=rows.slice((txPage-1)*TX_PAGE_SIZE,txPage*TX_PAGE_SIZE);
    const rooms=t=>[valid(t.roomCount)?t.roomCount+' 房':null,valid(t.hallCount)?t.hallCount+' 廳':null,valid(t.bathCount)?t.bathCount+' 衛':null].filter(Boolean).join(' / ')||'格局未提供';
    const uses={residential:'住宅',shop:'店面',non_residential:'非住宅',unknown:'用途待核'};
    openDialog(c.name+'｜成交明細',`${filterControls('tx',false)}<p class="filter-context"><strong>${esc(categoryLabel())} · ${esc(periodLabel())}</strong><br>${esc(periodInfo().start)} ～ ${esc(periodInfo().end)} · 共 ${num(rows.length)} 筆。未納入統計的資料仍保留，每頁 ${TX_PAGE_SIZE} 筆。</p>${queryActions(c)}<p class="help">住宅與店面分開統計；套房依官方建物型態辨識，不以 1 房推定。屋齡依來源完成日期計算，部分只精確至月。單價須符合可比條件；缺漏與排除原因保留供核對。</p><div class="table-scroll"><table class="transaction-table"><thead><tr><th>交易日期／類型</th><th>總價含車位<br>萬元</th><th>面積含車位<br>坪</th><th>可比單價<br>萬元／坪</th><th>用途／格局</th><th>完成日期／屋齡</th><th>樓層／車位</th><th>統計狀態／原始列</th></tr></thead><tbody>${shown.map(t=>`<tr><td>${esc(t.date||'日期待核')}<br><small>${esc(t.categoryLabel||marketCategories[t.category]||'分類待核')}</small></td><td>${fmt(t.priceWan)}</td><td>${fmt(t.areaPing)}</td><td>${fmt(t.unitWan)}</td><td>${esc(t.mainUse||uses[t.propertyUse]||'用途待核')}<br>${esc(rooms(t))}<br><small>${esc(t.buildingType||'建物型態未提供')}</small></td><td>${esc(t.buildingCompletionDate||t.buildingCompletionRaw||'完成日期未提供')}<br>${valid(t.ageYears)?fmt(t.ageYears)+' 年':'屋齡待補'}${t.completionPrecision==='month'?'<br><small>來源精確至月，屋齡約數</small>':''}</td><td>${esc(t.floor||'樓層未提供')}<br>${esc(t.parkingMode||'車位待核')}</td><td>${t.eligible===true?'納入可比統計':`<span class="badge">未納入：${esc(t.exclusionReason||'待核對')}</span>`}<br><small>${esc(t.notes||'')}<br>來源列 ${esc(t.sourceRow||t.id||'未提供')}${Array.isArray(t.sourceRows)&&t.sourceRows.length>1?'<br>合併相同資料 '+t.sourceRows.length+' 個來源列':''}</small></td></tr>`).join('')||'<tr><td colspan="8">此類型、期間尚無可確定匹配紀錄，不使用其他類型或鄰近社區價格填補。</td></tr>'}</tbody></table></div><nav id="transactionsPager" class="pager"><button id="txPrev" ${txPage<=1?'disabled':''}>上一頁</button><span>第 ${txPage} / ${pages} 頁 · ${num(rows.length)} 筆</span><button id="txNext" ${txPage>=pages?'disabled':''}>下一頁</button></nav><p class="help">資料快照 ${esc(meta.asOf||'未提供')}。顯示範圍最早自 101/08/01 起，日期無法解析者不混入期間統計。原始批次與方法可從主頁「資料與方法」查閱。</p>`);
    bindFilterControls('tx',()=>showTransactions(c,1),false);bindQueryActions($('dialogBody'));
    $('txPrev').onclick=()=>showTransactions(c,txPage-1);$('txNext').onclick=()=>showTransactions(c,txPage+1);
  }
  function showCompare(){
    const rows=compared.map(id=>byId.get(String(id))).filter(Boolean);if(rows.length<2)return;
    const n=v=>v===null?'待補':num(v),age=c=>ageValue(c)===null?'待補':fmt(ageValue(c))+' 年（'+num(stats(c).ageSampleCount)+' 筆日期樣本）';
    openDialog('把社區，放在一起看',`${filterControls('compare',false)}<p class="filter-context">同一成交類型：<strong>${esc(categoryLabel())}</strong><br>同一期別：<strong>${esc(periodLabel())}</strong>，${esc(periodInfo().start)} ～ ${esc(periodInfo().end)}。不同樓層、車位及棟別條件仍須逐筆核對，這不是同質物件估價。</p><div class="table-scroll"><table class="compare-table"><thead><tr><th>指標</th>${rows.map(c=>`<th>${esc(c.name)}${queryActions(c)}</th>`).join('')}</tr></thead><tbody>${[['行政區',c=>esc(c.district)],['成交類型',()=>esc(categoryLabel())],['統計期間',()=>esc(periodInfo().start)+' ～ '+esc(periodInfo().end)],['平均單價（萬／坪）',c=>sufficient(c)?fmt(stats(c).mean):limited(c)?fmt(stats(c).sampleMean)+'（少量 '+num(stats(c).eligibleCount)+' 筆，僅供個案參考）':'資料不足，不推估'],['中位單價（萬／坪）',c=>sufficient(c)?fmt(stats(c).median):limited(c)?fmt(stats(c).sampleMedian)+'（少量參考）':'—'],['可比／本類型匹配筆數',c=>`${num(stats(c).eligibleCount)} / ${num(stats(c).count)}`],['成交樣本屋齡',age],['使照登載戶數',c=>n(householdValue(c))+(householdValue(c)===null?'':' 戶；非現況普查')],['已揭露成交戶別',c=>n(unitValue(c))+(unitValue(c)===null?'':' 戶別；非社區總戶數')],['期間最新成交',c=>esc(stats(c).latestDate||'尚無匹配')],['匹配範圍',c=>esc(c.matchNote||'門牌依來源核對')]].map(([name,fn])=>`<tr><th>${name}</th>${rows.map(c=>`<td>${fn(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
    bindFilterControls('compare',showCompare,false);bindQueryActions($('dialogBody'));
  }
  function renderCompare(){$('compareTray').hidden=!compared.length;$('compareNames').textContent=compared.map(id=>byId.get(String(id))?.name).join(' ／ ');$('compareButton').disabled=compared.length<2;}
  $('compareButton').onclick=()=>{track('compare_open');showCompare();};
  $('clearCompare').onclick=()=>{compared=[];renderCompare();renderDetail();};
  function matchingCoverageText(){
    const c=meta.coverage||{},total=Number(c.residentialAddressCount),matched=Number(c.matchedResidentialAddressCount);
    if(!Number.isFinite(total)||!Number.isFinite(matched)||total<=0)return `<p>尚未能對應名冊的住宅成交門牌 ${num(c.unmatchedResidentialAddressCount)} 組；唯一門牌總數尚待統計，不推估未匹配率。</p>`;
    return `<p>可解析且用途確認為住宅的成交唯一門牌 ${num(total)} 組；成功配對 ${num(matched)} 組；未確定配對 ${num(total-matched)} 組（${((total-matched)/total*100).toFixed(1)}%），包含多名冊歧義 ${num(c.ambiguousResidentialAddressCount)} 組。另有 ${num(c.residentialUnparseableRows)} 筆交易列因門牌遮蔽或不可解析未進入此分母。<br>這是成交門牌的配對缺口，不是全市住宅建物漏失率。</p>`;
  }
  $('methodButton').onclick=()=>{
    const cov=meta.coverage||{},current=coverageOf(communities),raw=cov.officialRegistryRawRows,unmatched=cov.unmatchedResidentialAddressCount,latestMatched=communities.map(c=>c.statsByPeriod?.all?.latestDate||'').sort().at(-1)||'未提供';
    const districtTable=districts.map(d=>{const x=coverageOf(byDistrict.get(d.name)||[]);return `<tr><td>${esc(d.name)}</td><td>${num(x.total)}</td><td>${num(x.located)}</td><td>${num(x.priced)}</td><td>${num(x.total-x.priced)}</td></tr>`;}).join('');
    openDialog('名冊的範圍，行情的依據',`<div class="method-intro"><strong>${num(communities.length)} 筆社區名冊 · 37 個行政區可查</strong><p>這是依目前取得來源整理的社區名冊，不是全市完整建築普查。低樓社區、用途待核及缺少行情的項目都保留；未收錄不代表不存在。</p></div><h3>資料覆蓋與缺口</h3><p>工務局清冊原始 ${valid(raw)?num(raw):'未提供'} 列，具名稱 ${num(cov.officialRegistryCount)} 列；核對重複後主目錄 ${num(communities.length)} 筆。<br>另保留舊圖台待核 ${num(legacyCommunities.length)} 筆，獨立查詢，不混入主目錄或行情統計。<br>清冊下載頁更新 ${esc(meta.registrySnapshot?.publishedAt||'2026-09-04')}；檔名標示資料截至 ${esc(meta.registrySnapshot?.fileAsOf||'2026-05-01')}。本次整理日期不表示清冊涵蓋當日全部建物。<br>可定位 ${num(current.located)} 筆；待補座標 ${num(current.total-current.located)} 筆。<br>${esc(periodLabel())}有可比行情 ${num(current.priced)} 筆；待補價格 ${num(current.total-current.priced)} 筆（${current.total?((current.total-current.priced)/current.total*100).toFixed(1):'0'}%）。「待補價格」表示未達 5 筆可比行情，其中 ${num(current.limited)} 筆名冊仍提供 1–4 筆真實成交均價作個案參考。</p>${matchingCoverageText()}<p>未匹配資料不任意攤派給鄰近社區。名冊不是交易全量，交易配對也不等於社區全部棟別。</p><h3>交易批次與日期</h3><p>快照基準：${esc(meta.asOf||'未提供')}<br>已匹配歷史成交區間：${esc(meta.periods?.all?.start||'未提供')} ～ ${esc(latestMatched)}；其中較早日期為後續公開資料中的回溯成交，不代表當年已公開申報。<br>統計來源：${esc(meta.statisticalSource||'內政部公開實價資料')}<br>目前統計期別：${esc(periodLabel())}，${esc(periodInfo().start||'來源最早成交')} ～ ${esc(periodInfo().end||meta.asOf||'未提供')}。</p>${Array.isArray(meta.batches)?'<ul>'+meta.batches.map(b=>'<li>'+esc(typeof b==='string'?b:(b.label||b.file||JSON.stringify(b)))+'</li>').join('')+'</ul>':''}<h3>成交類型、時間與排序</h3><p>目前視角：${esc(categoryLabel())}；${esc(periodLabel())}，${esc(periodInfo().start)} ～ ${esc(periodInfo().end)}。主清單、聚合清單、明細與比較共用同一分類與期別。</p><p>全部住宅僅納入用途可確認為住宅的成交，包含格局未揭露的住宅，不混入店面；套房依官方套房型態辨識，1 房不直接當套房。其餘住宅按官方房數分為 1、2、3、4、5 房以上；「用途／格局待核」保留不確定資料並顯示原始用途。顯示與統計下限固定 101/08/01（2012-08-01），更早或無法解析日期者不混入本期統計。</p><p>均價由高到低、成交樣本屋齡由低到高、使照戶數與已揭露成交戶別由多到少；缺值一律置後，同值依名稱、行政區與來源識別碼穩定排序。使照戶數依官方使用執照登載資料，非現況普查；成交戶別只計本類型、期間可辨識的不同戶別，不能代替社區總戶數。</p><h3>怎麼計算均價</h3><ol><li>以來源名冊可核對門牌匹配，不以相近位置、相似名稱猜測其他棟別。</li><li>主值是可比成交單價的算術平均；中位數作輔助。均價不是總價合計除以總坪數。</li><li>車位缺漏、特殊交易及其他排除原因保留於逐筆明細；1–4 筆真實可比成交另標「少量成交均價」，樣本少，僅供個案參考；0 筆才顯示「資料不足，不推估」。少量參考不計入可比行情數。</li><li>近 12／36 月採固定快照日期往前計算；101/08/01 起歷史混合不同市況，明示非當期行情。</li></ol><h3>每個行政區都可以查</h3><div class="table-scroll"><table><thead><tr><th>行政區</th><th>名冊</th><th>可定位</th><th>有可比行情</th><th>待補價格</th></tr></thead><tbody>${districtTable}</tbody></table></div><h3>地圖與建築圖示</h3><p>37 區採歷史行政區界資料（2014 年 g0v/twgeojson，CC0），經簡化供探索，非現行法定界線、地籍圖或測量成果。${link('https://github.com/g0v/twgeojson','行政區界來源')}<br>北向上投影，以 cos(23°) 校正經度比例。區塊顏色表示名冊數量密度，與房價無關。建築錨定來源經緯度，依 1–5、6–14、15 樓以上示意不同輪廓；缺樓層採中性圖示，不代表實測外型、實際高度或社區範圍。聚合數字包含全部對應名冊，點選可分頁查看全部。</p><h3>生活內容與回饋</h3><p>${lifeCount()} 則地方內容及 ${directoryCount()} 個官方活動查詢入口，各篇附來源與查閱日期。官方活動入口不代表當期有活動；未有可信座標者不猜測位置。可使用社區或內容的「補充／回報」提供修正。</p><h3>來源與逐批日期區間</h3><p class="help">以下為來源批次原始日期範圍，可能含已排除的異常日期；不等同本產品可比統計範圍。</p><div class="table-scroll"><table><thead><tr><th>來源批次</th><th>原始最早日期</th><th>原始最新日期</th><th>用途</th></tr></thead><tbody>${(meta.sources||[]).map(s=>`<tr><td>${link(s.url,s.label||s.url)}</td><td>${esc(s.dateMin||'—')}</td><td>${esc(s.dateMax||'—')}</td><td>${s.usedForStatistics===true?'實價統計':s.usedForStatistics===false?'留存來源審計':'名冊來源'}</td></tr>`).join('')}</tbody></table></div><h3>使用紀錄</h3><p>此公開版本不啟用訪客事件收集，也不顯示累積人數。回饋可複製或下載，再由使用者自行前往安心城正式回饋入口送出。</p><p class="help">這是可查證的資料快照，非即時行情、銀行鑑價或估價報告；個別交易仍須核對原始申報與物件條件。</p>`);
  };
  $('closeDialog').onclick=()=>$('infoDialog').close();$('infoDialog').onclick=e=>{if(e.target===$('infoDialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();}};
  function updateSearch(){query=$('search').value.trim().toLocaleLowerCase();page=1;$('clearSearch').hidden=!query;setMode('market');renderList();const results=query?lifeItems.filter(c=>`${c.title} ${c.district} ${c.summary}`.toLocaleLowerCase().includes(query)):[];$('searchResults').hidden=!query;$('searchResults').innerHTML=query?`<p>已搜尋全市 ${num(communities.length)} 筆名冊，結果列於下方。${results.length?`另有 ${results.length} 則生活內容。`:''}</p>${results.slice(0,3).map(c=>`<button data-id="${esc(c.id)}">生活｜${esc(c.title)}<small>${esc(c.district)}</small></button>`).join('')}`:'';$('searchResults').querySelectorAll('[data-id]').forEach(el=>el.onclick=()=>openLife(el.dataset.id));}
  $('search').oninput=()=>{clearTimeout(searchTimer);searchTimer=setTimeout(updateSearch,100);};$('search').onkeydown=e=>{if(e.key==='Enter'){clearTimeout(searchTimer);updateSearch();}if(e.key==='Escape')$('searchResults').hidden=true;};$('clearSearch').onclick=()=>{$('search').value='';updateSearch();};
  $('periodSelect').onchange=e=>applyMarketFilter('period',e.target.value);$('categorySelect').onchange=e=>applyMarketFilter('category',e.target.value);
  $('kindSelect').onchange=e=>{kind=e.target.value;page=1;renderList();renderPins();};$('sortSelect').onchange=e=>applyMarketFilter('sort',e.target.value);$('sortSelect').querySelector('[value="households"]').disabled=!householdAvailable;
  [...districts].sort((a,b)=>a.name.localeCompare(b.name,'zh-TW')).forEach(d=>{const option=document.createElement('option');option.value=d.name;option.textContent=`${d.name} · 名冊 ${num(counts(d.name))}`;$('districtSelect').append(option);});
  $('districtSelect').onchange=e=>chooseDistrict(e.target.value);
  $('districtShortcuts').innerHTML=['善化區','安南區','永康區','東區','北區','安平區'].map(name=>`<button data-name="${name}" class="${name==='善化區'?'shanhua-shortcut':''}">${name==='善化區'?'先看善化':name}<span>${num(counts(name))}</span></button>`).join('');$('districtShortcuts').querySelectorAll('button').forEach(el=>el.onclick=()=>chooseDistrict(el.dataset.name));
  $('backToCity').onclick=()=>chooseDistrict('');document.querySelector('.brand').onclick=e=>{e.preventDefault();chooseDistrict('');};
  $('modeButton').onclick=()=>{const flat=document.body.classList.toggle('flat');$('modeButton').textContent=flat?'平面':'立體';$('modeButton').setAttribute('aria-pressed',String(!flat));};
  function zoom(factor,at){cancelAnimationFrame(animation);const width=Math.max(.8,Math.min(1800,camera[2]*factor)),f=width/camera[2],p=at||[camera[0]+camera[2]/2,camera[1]+camera[3]/2];fly([p[0]-(p[0]-camera[0])*f,p[1]-(p[1]-camera[1])*f,width,camera[3]*f]);}
  $('zoomIn').onclick=()=>zoom(.62);$('zoomOut').onclick=()=>zoom(1.55);
  const svg=$('mapSvg'),mapPoint=e=>{const p=svg.createSVGPoint();p.x=e.clientX;p.y=e.clientY;return p.matrixTransform(svg.getScreenCTM().inverse());};
  svg.addEventListener('wheel',e=>{e.preventDefault();const p=mapPoint(e);zoom(e.deltaY>0?1.25:.8,[p.x,p.y]);},{passive:false});
  svg.addEventListener('pointerdown',e=>{if(e.button!==0||e.pointerType==='touch')return;cancelAnimationFrame(animation);drag={x:e.clientX,y:e.clientY,origin:[...camera]};dragged=false;});
  svg.addEventListener('pointermove',e=>{if(!drag)return;if(Math.abs(e.clientX-drag.x)+Math.abs(e.clientY-drag.y)>6){dragged=true;svg.setPointerCapture(e.pointerId);}if(dragged){const m=svg.getScreenCTM();camera=[drag.origin[0]-(e.clientX-drag.x)/m.a,drag.origin[1]-(e.clientY-drag.y)/m.d,drag.origin[2],drag.origin[3]];syncCamera();}});
  const endDrag=()=>{if(drag&&dragged){renderPins();renderDistrictBadges();}drag=null;setTimeout(()=>{dragged=false;},80);};svg.addEventListener('pointerup',endDrag);svg.addEventListener('pointercancel',endDrag);window.addEventListener('pointerup',endDrag);
  $('asOf').textContent=meta.asOf||'未提供';window.addEventListener('resize',()=>{clearTimeout(renderTimer);renderTimer=setTimeout(()=>{syncCamera();renderPins();renderDistrictBadges();},150);});
  function revealLife(){if(matchMedia('(max-width:700px)').matches)$('lifePanel').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth',block:'start'});else $('lifePanel').scrollIntoView({behavior:'smooth',block:'nearest'});}
  function feedback(context){if(window.MapFeedback?.open)window.MapFeedback.open(context);else openDialog('回饋暫時無法開啟','<p>回饋元件尚未載入，請重新整理後再試。</p>');}
  function closeLife(){$('lifeDetail').hidden=true;if($('detail').hidden)document.body.classList.remove('detail-open');}
  function setMode(mode){viewMode=mode;$('lifePanel').hidden=mode!=='life';$('marketPanel').hidden=mode!=='market';['life','market'].forEach(key=>{$(key+'Mode').classList.toggle('active',mode===key);$(key+'Mode').setAttribute('aria-pressed',String(mode===key));});if(mode==='life')closeDetail();else closeLife();renderList();}
  function taipeiToday() {const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());return ['year','month','day'].map(key=>parts.find(p=>p.type===key).value).join('-');}
  function eventStatus(item) {if(item.kind==='event-directory')return '官方活動查詢';if(item.kind!=='event')return '';const today=taipeiToday();if(item.endDate && item.endDate<today)return item.eventType==='registration-window'?'報名已截止':'已結束';if(item.startDate && item.startDate>today)return item.eventType==='registration-window'?'尚未開放報名':'尚未開始';if(item.startDate && item.endDate && item.startDate<=today && item.endDate>=today)return item.eventType==='registration-window'?'報名期間':'進行中';return '活動日期待確認';}
  function sourceDates(item) {return [item.verifiedAt?'資料核對：'+esc(item.verifiedAt):'',item.sourceCheckedAt?'來源查閱：'+esc(item.sourceCheckedAt):''].filter(Boolean).join(' · ') || '來源查閱日期未提供';}
  function renderLife() {const pool=lifeItems.filter(item=>!district||item.district===district), shown=pool.filter(item=>category==='all'||item.category===category);$('categoryChips').innerHTML=[['all','全部'],...Object.entries(categories)].map(([key,label])=>'<button class="category-chip '+(key===category?'active':'')+'" data-category="'+key+'" aria-pressed="'+(key===category)+'">'+label+'<span>'+(key==='all'?pool.length:pool.filter(i=>i.category===key).length)+'</span></button>').join('');$('categoryChips').querySelectorAll('button').forEach(el=>el.onclick=()=>{category=el.dataset.category;renderLife();});$('lifeList').innerHTML=(category==='events'?'<p class="event-counts">'+shown.filter(i=>i.kind==='event').length+' 則活動／報名紀錄 · '+shown.filter(i=>i.kind==='event-directory').length+' 個官方查詢入口</p>':'')+shown.map(item=>'<article class="life-card" data-id="'+esc(item.id)+'"><div class="life-card-meta"><span>'+esc(item.district)+' / '+(categories[item.category]||'生活')+'</span>'+(eventStatus(item)?'<span class="event-status">'+eventStatus(item)+'</span>':'')+'</div><h3><button class="read-life" data-id="'+esc(item.id)+'">'+esc(item.title)+'</button></h3><p>'+esc(item.summary)+'</p><div class="life-card-source">'+link(item.sourceUrl,item.sourceLabel||'資料來源')+'<p class="source-date">'+sourceDates(item)+'</p></div><div class="life-card-actions"><button class="read-life" data-id="'+esc(item.id)+'">詳讀 ↗</button><button class="report-life" data-id="'+esc(item.id)+'">補充／回報</button></div></article>').join('') || '<p class="empty">本區這個分類尚待補充；可切換其他分類，或給我們回饋。</p>';$('lifeList').querySelectorAll('.read-life').forEach(el=>el.onclick=()=>openLife(el.dataset.id));$('lifeList').querySelectorAll('.report-life').forEach(el=>el.onclick=()=>{const item=lifeItems.find(i=>i.id===el.dataset.id);feedback({district:item.district,contentId:item.id});});}
  function openLife(id) {const item=lifeItems.find(i=>i.id===id);if(!item)return;if(district!==item.district)chooseDistrict(item.district);setMode('life');$('searchResults').hidden=true;$('lifeDetail').hidden=false;document.body.classList.add('detail-open');$('lifeDetail').innerHTML='<button id="closeLife" class="detail-close" aria-label="關閉生活內容">×</button><span class="detail-kicker">'+esc(item.district)+' / '+(categories[item.category]||'生活')+'</span><h2>'+esc(item.title)+'</h2>'+(eventStatus(item)?'<p class="event-status">'+eventStatus(item)+'</p>':'')+'<p class="life-reading">'+esc(item.summary)+'</p>'+(item.kind==='event'?'<p>'+esc(item.eventType==='registration-window'?'報名期間':(item.dateLabel||'活動日期'))+'：'+esc(item.startDate||'未提供')+' 至 '+esc(item.endDate||'未提供')+'<br><small>狀態判定基準：'+taipeiToday()+'</small></p>':'')+(item.kind==='event-directory'?'<p class="life-note">這是官方活動查詢入口，請開啟來源確認最新場次、日期及報名條件。</p>':'')+(item.caution?'<p class="life-note">'+esc(item.caution)+'</p>':'')+(item.verificationNote?'<p class="life-note">來源確認限制：'+esc(item.verificationNote)+'</p>':'')+'<section class="detail-section"><h3>沿著來源繼續讀</h3>'+link(item.sourceUrl,item.sourceLabel||'查看原始來源')+'<p>'+sourceDates(item)+'</p><p class="help">'+(located(item)?'內容附有資料座標；請以官方現場資訊確認出入口。':'這是一則區域生活內容，未以推測座標在地圖上標點。')+'</p></section><button id="lifeFeedback" class="full primary">補充／回報這篇內容</button>';$('closeLife').onclick=closeLife;$('lifeFeedback').onclick=()=>feedback({district:item.district,contentId:item.id});track('life_open',id);}
  function showLegacy(initialQuery=''){
    openDialog('舊圖台待核名冊｜獨立補充',`<p>共 ${num(legacyCommunities.length)} 筆尚未確認對應最新工務局清冊的來源紀錄。不列入 ${num(communities.length)} 筆主目錄，也不提供未核對行情；保留名稱、門牌與來源供補查。</p><input id="legacySearch" class="legacy-search" type="search" aria-label="搜尋舊圖台待核名冊" placeholder="搜尋舊名冊名稱、行政區、門牌" value="${esc(initialQuery)}"><div id="legacyList" class="nearby-list"></div><nav id="legacyPager" class="pager"></nav>`);
    let legacyPage=1;
    const paint=()=>{const q=$('legacySearch').value.trim().toLocaleLowerCase(),items=legacyCommunities.filter(c=>`${c.name} ${c.district} ${c.address}`.toLocaleLowerCase().includes(q)),pages=Math.max(1,Math.ceil(items.length/PAGE_SIZE));legacyPage=Math.min(legacyPage,pages);$('legacyList').innerHTML=items.slice((legacyPage-1)*PAGE_SIZE,legacyPage*PAGE_SIZE).map(c=>`<article class="life-card"><div class="life-card-meta">${esc(c.district)} · 舊圖台待核</div><h3>${esc(c.name)}</h3><p>${esc(c.address||'門牌待核')}</p><p class="legacy-note">${valid(c.floors)?esc(c.floors)+' 樓':'樓層待核'} · ${located(c)?'有來源座標':'待補座標'}<br>尚未確認與最新清冊的對應關係，不以相似名稱合併。</p>${link(c.sourceUrl,'查看原始名冊來源')}</article>`).join('')||'<p class="empty">這個關鍵字沒有待核名冊結果。</p>';$('legacyPager').innerHTML=`<button id="legacyPrev" ${legacyPage===1?'disabled':''}>上一頁</button><span>${num(items.length)} 筆 · 第 ${legacyPage} / ${pages} 頁</span><button id="legacyNext" ${legacyPage===pages?'disabled':''}>下一頁</button>`;$('legacyPrev').onclick=()=>{legacyPage--;paint();};$('legacyNext').onclick=()=>{legacyPage++;paint();};};
    $('legacySearch').oninput=()=>{legacyPage=1;paint();};paint();
  }
  $('legacyButton').textContent=`另查舊圖台待核名冊 ${num(legacyCommunities.length)} 筆 ↗`;$('legacyButton').onclick=()=>showLegacy(query);
  $('catalogNote').textContent=`名冊與交易分開呈現；本類型無樣本的社區仍完整保留。每頁 ${PAGE_SIZE} 筆，可翻頁查閱全部。實價登錄連結為官方首頁，複製門牌後自行查詢。`; 
  $('lifeMode').onclick=()=>{setMode('life');renderLife();};$('marketMode').onclick=()=>setMode('market');$('northStart').onclick=()=>{chooseDistrict('北區');setMode('life');revealLife();};$('readDistrictLife').onclick=()=>{if(!district)chooseDistrict('北區');setMode('life');revealLife();};$('feedbackButton').onclick=()=>feedback({district});
  renderMap();chooseDistrict('');renderCompare();
})();

window.catalogLoaded();
}).catch(error=>window.catalogLoadFailed(error));
