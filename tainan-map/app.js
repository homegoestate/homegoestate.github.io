window.CATALOG_READY.then(()=>{
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  // Registry rows that the source itself labels as duplicate/void (重覆、作廢、多的無法刪); the original rows stay.
  const HIDDEN_DUPLICATES = new Set(['community-registry-57','community-registry-63','community-registry-713','community-registry-1026','community-registry-1061','community-registry-3425']);
  const data =window.PILOT_DATA || {meta:{},communities:[]}, meta = data.meta || {}, communities = (data.communities || []).filter(c=>!HIDDEN_DUPLICATES.has(String(c.id))), legacyCommunities=data.legacyCommunities||[];
  // Registry names sometimes carry stray % wildcards from the source export; strip them for display and search only.
  for(const c of communities)if(typeof c.name==='string'){const clean=c.name.replace(/^%+|%+$/g,'').trim();if(clean)c.name=clean;}
  // Rows without registry coordinates: use positions matched against the official 114 doorplate dataset (estimated-positions.js).
  const EST=window.ESTIMATED_POSITIONS||{},EST_LABEL={exact:'名冊門牌比對114年官方門牌座標（名冊未附座標，本站比對）',main:'依名冊門牌主號推估（子號不在官方門牌資料），非精確位置',nearby:'依同巷弄最接近門牌推估，非精確位置'};
  for(const c of communities){const e=EST[c.id];const has=Number.isFinite(+c.lon)&&+c.lon>119&&Number.isFinite(+c.lat)&&+c.lat>21;if(e&&!has){c.lon=e.lon;c.lat=e.lat;c.positionEstimated=e.tier;c.positionQuality=EST_LABEL[e.tier]+'｜比對門牌：'+e.matched;}}
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
  function positionLabel(c) {
    if (!located(c)) return '待補座標';
    if (c.positionEstimated === 'main') return '依主門牌推估';
    if (c.positionEstimated === 'nearby') return '依鄰近門牌推估';
    if (c.positionEstimated === 'exact' || c.positionQuality?.includes('門牌')) return '門牌座標';
    return '圖台來源座標';
  }
  const byId = new Map(communities.map(c=>[String(c.id),c]));
  const byDistrict = new Map(features.map(f=>[f.properties.name,[]]));
  communities.forEach(c=>{if(!byDistrict.has(c.district))byDistrict.set(c.district,[]);byDistrict.get(c.district).push(c);});
  const counts = name => name ? (byDistrict.get(name)||[]).length : communities.length;
  let guide = null, cityController = null, buildingController = null, preferCityScene = true;
  function syncCityView() {
    const available = !district && !!cityController;
    const active = available && preferCityScene;
    $('cityModeSwitch').hidden = !available;
    $('cityScene').hidden = !active;
    $('mapSvg').setAttribute('aria-hidden', String(active));
    $('mapSvg').toggleAttribute('inert', active);
    document.querySelector('.map-stage').classList.toggle('city-active', active);
    $('showCityScene').setAttribute('aria-pressed', String(active));
    $('showPlanMap').setAttribute('aria-pressed', String(!active));
    cityController?.setActive(active);
  }
  const lifeCount = name => lifeItems.filter(i=>(!name||i.district===name)&&i.kind!=='event-directory').length;
  const directoryCount = name => lifeItems.filter(i=>(!name||i.district===name)&&i.kind==='event-directory').length;
  let district='', selected=null, category='all', marketCategory='all', viewMode='market', period='all', kind='all', query='', page=1, sort='price';
  let compared=[], camera=[0,0,1100,900], animation=0, drag=null, dragged=false, searchTimer, renderTimer;
  const PAGE_SIZE=matchMedia('(max-width:900px)').matches?16:40, TX_PAGE_SIZE=40;
  const emptyStats={count:0,eligibleCount:0,mean:null,median:null,min:null,max:null,latestDate:null};
  // Read audited period statistics; never calculate from the paginated UI subset.
  const stats = c => c.statsByCategory?.[marketCategory]?.[period] || emptyStats;
  const sufficient = c => Number(stats(c).eligibleCount)>=5 && valid(stats(c).mean);
  const limited = c => Number(stats(c).eligibleCount)>0 && Number(stats(c).eligibleCount)<5 && valid(stats(c).sampleMean);
  const priceText = c => sufficient(c) ? `${fmt(stats(c).mean)} 萬／坪` : limited(c)?`少量成交均價 ${fmt(stats(c).sampleMean)} 萬／坪 · ${num(stats(c).eligibleCount)} 筆`:'資料不足，不推估';
  const periodInfo = () => {const p=meta.periods?.[period]||{};return {...p,start:period==='all'?BASELINE:(p.start||BASELINE),end:p.end||meta.asOf||'2026-11-02',label:period==='all'?'101/08/01 起歷史':p.label||(period==='12m'?'近 12 個月':'近 36 個月')};};
  const periodLabel = () => period==='all'?'101/08/01 起歷史 · 非當期行情':periodInfo().label;
  const latestBatch = meta.latestRefresh?.latestBatch;
  function batchDates() {
    if (!latestBatch?.publicBatchDate) return '';
    return `內政部最新匯入批次 ${latestBatch.publicBatchDate}，登記期間 ${latestBatch.registrationDateFrom} 至 ${latestBatch.registrationDateTo}。`;
  }
  const categoryLabel = () => marketCategories[marketCategory]||'用途／格局待核';
  const priceValue = c => sufficient(c)?Number(stats(c).mean):limited(c)?Number(stats(c).sampleMean):null;
  const ageValue = c => valid(stats(c).ageYearsMedian)?Number(stats(c).ageYearsMedian):null;
  const unitValue = c => valid(stats(c).distinctTransactedUnitCount)?Number(stats(c).distinctTransactedUnitCount):null;
  const householdValue = c => valid(c.householdCount)?Number(c.householdCount):null;
  const withCount=(value,unit,missing='待核')=>valid(value)&&Number(value)>=0?num(value)+' '+unit:missing;
  const buildingText=c=>valid(c.buildingCount)&&+c.buildingCount>0?num(c.buildingCount)+' 棟':'待核';
  const projectText=c=>withCount(c.projectUnits?.count,'戶','全社區待核');
  const totalSalesText=c=>withCount(c.allUseHistoricalCount,'筆');
  function identifiedText(c) {
    const s=stats(c), identified=unitValue(c);
    if (!s.count) return '本條件無成交';
    return identified===null?'戶別待核':num(identified)+' 個不同戶別';
  }
  function identityEvidence(c) {
    const s=stats(c), cov=s.unitIdentityCoverage||{};
    if (!s.count) return '這個成交類型與期間沒有匹配紀錄。';
    const direct=cov.directRows??cov.identifiedRows??0, doors=cov.doorplateRows||0;
    const method='原始門牌列出樓與室號 '+num(direct)+' 筆';
    const checked=doors?'，另有 '+num(doors)+' 筆依唯一使照地號、完工日、總層數與 114 年門牌表確認完整樓層門牌':'';
    return method+checked+'。共 '+num(cov.identifiedRows)+' / '+num(s.count)+' 筆可辨識。同一戶再次交易只算一戶。同層多戶且未揭露室號者列為待核。';
  }
  function scopeFacts(c) {
    const presale=window.PresaleUnits?.lookup(c.id);
    const rows=[
      ['名冊總棟數',buildingText(c)],['社區總戶數',projectText(c)],
      ['單張使照戶數',withCount(householdValue(c),'戶')],
      ['歷年各用途成交',totalSalesText(c)],['本條件成交戶別',identifiedText(c)],
      ['成交樣本屋齡',ageValue(c)===null?'待補':fmt(ageValue(c))+' 年']
    ];
    if(presale)rows.push(['預售備查規劃戶數',withCount(presale.count,'戶')]);
    return rows.map(([label,value])=>`<span>${esc(label)} <b>${esc(value)}</b></span>`).join('');
  }
  function detailCounts(c) {
    const permit=c.householdEvidence, project=c.projectUnits, matched=c.parcelMatchedAddresses||[];
    const presale=window.PresaleUnits?.lookup(c.id);
    const section=(label,value,context,source='')=>`<div><dt>${esc(label)}</dt><dd>${esc(value)}<small>${esc(context)}</small>${source}</dd></div>`;
    return [
      section('社區總棟數（名冊）',buildingText(c),'市府公寓大廈管理組織清冊登載的棟數。',link(c.sourceUrl,'市府名冊')),
      section('社區總戶數',projectText(c),project?project.note+' 此數為建案規劃戶數。':'名冊沒有全社區總戶數，現有證據不足以確認。',project?link(project.url,'建案戶數來源'):''),
      presale?section('預售備查規劃戶數',withCount(presale.count,'戶'),presale.caseName+' · '+presale.permit+' · '+presale.parcel+'。依預售備查時的規劃登載。',link(presale.sourceUrl,'內政部預售備查')):'',
      section('單張使用執照登載戶數',withCount(householdValue(c),'戶','使照資料待核'),permit?
        [permit.permitNumber,permit.permitDate,permit.permitLocation,permit.purpose].filter(Boolean).join(' · '):'尚無可唯一核對的使照戶數。',link(c.householdSourceUrl,c.householdSource||'市府使照資料')),
      section('歷年累計匹配成交（各用途）',totalSalesText(c),`自 ${BASELINE} 至 ${meta.asOf}，含住宅、店面與用途待核，依官方交易編號去重。此處僅涵蓋可配對紀錄。`+
        (matched.length?' 本案已用土地明細逐筆核對 '+num(matched.length)+' 個交易門牌。':'')),
      section('本條件可辨識成交戶別',identifiedText(c),categoryLabel()+' · '+periodLabel()+'。'+identityEvidence(c),
        stats(c).unitIdentityCoverage?.doorplateRows?link(meta.unitDoorplateSource?.url,'114 年臺南市門牌資料'):'')
    ].join('');
  }
  function quantityGlance(c) {
    const s=stats(c);
    const figures=[['名冊總棟數',buildingText(c)],['社區總戶數',projectText(c)],
      ['本條件成交',s.count?num(s.count)+' 筆':'無匹配紀錄'],['可辨識不同戶別',identifiedText(c)]];
    return `<section class="quantity-glance" aria-label="社區數字摘要"><div class="quantity-glance-grid">${figures.map(([label,value])=>`<div><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join('')}</div><p>${esc(categoryLabel())} · ${esc(periodLabel())}</p><button type="button" id="showQuantityEvidence">看數字依據 ↓</button></section>`;
  }
  const householdAvailable = communities.some(c=>valid(c.householdCount));
  const sortLabels={price:'均價 高→低',age:'成交樣本屋齡 低→高',households:'使照戶數 多→少',units:'已揭露成交戶別 多→少',samples:'可比樣本 多→少',name:'社區名稱'};
  const stableTie=(a,b)=>String(a.name||'').localeCompare(String(b.name||''),'zh-TW')||String(a.district||'').localeCompare(String(b.district||''),'zh-TW')||String(a.id).localeCompare(String(b.id));
  function compareCommunities(a,b){
    if(sort==='name')return stableTie(a,b);
    // Price sort: communities with >=5 comparable sales first, then limited samples, then missing.
    if(sort==='price'){const tier=c=>sufficient(c)?0:limited(c)?1:2,t=tier(a)-tier(b);if(t)return t;}
    const value=sort==='price'?priceValue:sort==='age'?ageValue:sort==='households'?householdValue:sort==='units'?unitValue:c=>Number(stats(c).eligibleCount)||null;
    const x=value(a),y=value(b);if(x===null&&y===null)return stableTie(a,b);if(x===null)return 1;if(y===null)return -1;return (sort==='age'?x-y:y-x)||stableTie(a,b);
  }
  const sortExplanation=()=>({price:'依所選類型與期間的真實成交均價排序；達 5 筆可比成交者優先，少量成交其次，缺值置後。',age:'依所選成交樣本的屋齡中位數排序，缺值置後；管理組織核准日不作屋齡。',households:'依使用執照登載戶數排序，缺值置後；不是目前社區住戶普查。',units:'只計本類型、本期間可辨識的不同成交戶別；不是社區總戶數，缺值置後。',samples:'依所選類型、期間的可比成交筆數排序。',name:'依社區名稱排序；無價、無屋齡的名冊同樣保留。'}[sort]);
  // Search: 臺/台, full-width, Chinese numerals before 段巷弄樓鄰, 之/-, spaces all normalized;
  // every space-separated term must hit the name, official aliases, registry addresses or 使照號.
  const CN={零:0,〇:0,一:1,二:2,兩:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9};
  const cnNum=s=>{const m=s.match(/^([一二兩三四五六七八九])?十([一二三四五六七八九])?$/);if(m)return (m[1]?CN[m[1]]:1)*10+(m[2]?CN[m[2]]:0);return [...s].map(ch=>CN[ch]??ch).join('');};
  const normSearch=s=>String(s??'').normalize('NFKC').toLocaleLowerCase().replace(/臺/g,'台').replace(/[零〇一二兩三四五六七八九十]+(?=[段巷弄樓鄰])/g,m=>String(cnNum(m))).replace(/之/g,'-').replace(/[\s,，、。．.()（）_]+/g,'');
  const searchIndex=new Map();
  const indexOf=c=>{let v=searchIndex.get(c.id);if(v===undefined){v=normSearch([c.name,c.district,c.address,c.apiAlias?.name,c.apiAlias?.address,c.buildingPermit,...(c.exactAddresses||[]),...(c.parcelMatchedAddresses||[]),...(c.officialAddressAliases||[]).map(a=>a.address),...(c.registrationAliases||[]).flatMap(a=>[a.name,a.address,a.buildingPermit])].filter(Boolean).join('|'));searchIndex.set(c.id,v);}return v;};
  let queryTerms=[];
  const matching = c => !query || queryTerms.every(t=>indexOf(c).includes(t));
  const listPool = () => (query?communities:(district?byDistrict.get(district)||[]:communities)).filter(c=>matching(c)&&(kind==='all'||c.kind===kind));
  const scopePool = () => district ? byDistrict.get(district)||[] : communities;
  const coverageOf = items => ({total:items.length,located:items.filter(located).length,priced:items.filter(sufficient).length,limited:items.filter(limited).length});
  const addressFor=c=>c.address?(/^(臺|台)南市/.test(c.address)?c.address:'臺南市'+c.address):'';
  function queryActions(c){return `<div class="row-actions"><a class="official-lvr-link" href="${OFFICIAL_LVR}" target="_blank" rel="noopener noreferrer" title="開啟官方查詢首頁，再貼上門牌搜尋">實價登錄 ↗</a><button class="copy-address" data-copy-id="${esc(c.id)}" ${c.address?'':'disabled'}>複製門牌</button><span class="copy-status" aria-live="polite"></span></div>`;}
  async function copyValue(value,button,message,description){
    if(!value)return;
    const status=button.parentElement.querySelector('.copy-status');let done=false;
    try{if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(value);done=true;}}catch{}
    if(!done){const field=document.createElement('textarea');field.value=value;field.setAttribute('aria-label','待複製'+description);field.style.cssText='position:fixed;left:0;top:0;opacity:0;';document.body.append(field);field.select();try{done=document.execCommand('copy');}catch{}field.remove();}
    if(done){button.textContent='✓ 已複製';status.textContent=message;}
    else{status.innerHTML=`<label>請選取${esc(description)}複製<input class="copy-fallback" readonly value="${esc(value)}"></label>`;status.querySelector('input')?.select();}
  }
  function copyAddress(c,button){return copyValue(addressFor(c),button,'已複製完整門牌，請貼到官方實價查詢。','門牌');}
  function bindQueryActions(root){root.querySelectorAll('.copy-address').forEach(el=>el.onclick=()=>copyAddress(byId.get(el.dataset.copyId),el));}
  function communityRow(c,cluster=false){
    const s=stats(c),enough=sufficient(c),few=limited(c);
    return `<article class="community-card ${String(selected)===String(c.id)?'active':''}" data-community-id="${esc(c.id)}"><button class="community-row ${cluster?'nearby-choice':''} ${String(selected)===String(c.id)?'active':''}" data-id="${esc(c.id)}"><span class="row-heading"><span class="mini-building mini-building-art ${valid(c.floors)&&+c.floors<=5?'low':valid(c.floors)&&+c.floors>=15?'high':'mid'}" aria-hidden="true"><svg viewBox="-40 -83 80 92" focusable="false">${buildingArt(c)}</svg></span><strong>${esc(c.name)}</strong><span class="row-arrow">↗</span></span><span class="row-address">${esc(c.address||'門牌待核')}</span><span class="row-meta">${esc(c.district)} · ${esc(kindLabels[c.kind]||c.kindLabel||'類型待核')}${located(c)?'':' · 待補座標'}</span><span class="row-price ${enough?'':few?'limited':'pending'}">${enough?`${fmt(s.mean)}<small> 萬／坪 · ${period==='all'?'歷史均價':'期間均價'}</small>`:few?`${fmt(s.sampleMean)}<small> 萬／坪 · 少量成交均價</small>`:'資料不足，不推估'}</span>${few?'<span class="sample-warning">樣本少，僅供個案參考</span>':''}<span class="row-sample">${esc(categoryLabel())} · ${esc(periodLabel())} · 可比 ${num(s.eligibleCount)} / 匹配 ${num(s.count)} 筆${s.latestDate?' · 最新 '+esc(s.latestDate):''}</span><span class="row-facts">${scopeFacts(c)}</span></button>${queryActions(c)}</article>`;
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
  const densityColor=n=>n>=300?'#3d8b90':n>=150?'#6ba9aa':n>=60?'#93c3bf':n>=15?'#b6d7d0':n>0?'#d4e6de':'#e8eee5';
  const districts=features.map(f=>({f,name:f.properties.name,path:pathOf(f),center:centroid(f),bounds:boundsOf(f),color:densityColor(counts(f.properties.name))}));
  const positions=new Map(communities.filter(located).map(c=>[String(c.id),project([c.lon,c.lat])]));
  function renderMap(){
    $('thickness').innerHTML=districts.map(d=>`<path data-name="${esc(d.name)}" d="${d.path}" fill="#427b80" stroke="#24565f" stroke-width=".8" vector-effect="non-scaling-stroke"/>`).join('');
    $('districts').innerHTML=districts.map(d=>`<path class="district" data-name="${esc(d.name)}" d="${d.path}" fill="${d.color}" fill-rule="evenodd" tabindex="0" role="button" aria-label="${esc(d.name)}，名冊 ${counts(d.name)} 個社區"><title>${esc(d.name)} · 名冊 ${counts(d.name)} 個社區</title></path>`).join('');
    $('districts').querySelectorAll('.district').forEach(el=>{el.onclick=()=>{if(!dragged)pickMapDistrict(el.dataset.name);};el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();pickMapDistrict(el.dataset.name);}};});
    if(!features.length)$('mapHint').textContent='行政區圖尚未載入，仍可使用名冊搜尋。';
  }
  function pixelScale(){return 1/($('mapSvg').getScreenCTM()?.a||1);}
  function syncCamera(){
    $('mapSvg').setAttribute('viewBox',camera.join(' '));const px=pixelScale();
    $('thickness').style.transform=`translate(${1.5*px}px,${10*px}px)`;
    document.querySelectorAll('.pin-scale,.cluster-scale,.badge-scale').forEach(el=>el.setAttribute('transform',`scale(${px})`));
    $('mapTooltip').hidden=true;
  }
  function renderDistrictBadges(){
    const px=pixelScale(),centerCamera=[camera[0]+camera[2]/2,camera[1]+camera[3]/2],compact=matchMedia('(max-width:900px)').matches&&!district,narrow=matchMedia('(max-width:480px)').matches&&!district,bw=narrow?39:compact?43:district?58:76,bh=narrow?21:compact?29:37;
    const stageRect=$('mapSvg').getBoundingClientRect(),matrix=$('mapSvg').getScreenCTM();
    if(!matrix)return;
    const inverse=matrix.inverse(),mapPoint=(point,m)=>[m.a*point[0]+m.c*point[1]+m.e,m.b*point[0]+m.d*point[1]+m.f];
    const ordered=[...districts].sort((a,b)=>((a.bounds[2]-a.bounds[0])*(a.bounds[3]-a.bounds[1]))-((b.bounds[2]-b.bounds[0])*(b.bounds[3]-b.bounds[1])));
    const labelPositions=new Map();
    if(!district){
      // Pack badges in viewport pixels; SVG letterboxing never changes their bounds or geographic anchors.
      const gap=compact?4:6,inset=8,screenWidth=(Math.abs(matrix.a)*bw+Math.abs(matrix.c)*bh)*px,screenHeight=(Math.abs(matrix.b)*bw+Math.abs(matrix.d)*bh)*px;
      const stepX=screenWidth+gap,stepY=screenHeight+gap,topReserve=compact?145:100,bottomReserve=compact?125:90;
      const makeSlots=(top,bottom)=>{
        const width=stageRect.width-inset*2,height=stageRect.height-top-bottom;
        const columns=Math.max(0,Math.floor((width+gap)/stepX)),rows=Math.max(0,Math.floor((height+gap)/stepY));
        const left=stageRect.left+stageRect.width/2-(columns-1)*stepX/2,firstY=stageRect.top+top+height/2-(rows-1)*stepY/2,slots=[];
        for(let row=0;row<rows;row++)for(let col=0;col<columns;col++)slots.push([left+col*stepX,firstY+row*stepY]);
        return slots;
      };
      let candidates=[];
      // Reserve the heading and controls first; expand into those margins only if the viewport needs it.
      for(const expansion of [0,.25,.5,.75,1]){
        candidates=makeSlots(topReserve-(topReserve-inset)*expansion,bottomReserve-(bottomReserve-inset)*expansion);
        if(candidates.length>=ordered.length)break;
      }
      for(const d of ordered){
        const center=mapPoint(d.center,matrix);
        let nearest=0,distance=Infinity;
        candidates.forEach((point,index)=>{const next=(point[0]-center[0])**2+(point[1]-center[1])**2;if(next<distance){distance=next;nearest=index;}});
        const point=candidates.splice(nearest,1)[0];
        if(point)labelPositions.set(d.name,mapPoint(point,inverse));
      }
    }
    $('districtLabels').innerHTML=ordered.map(d=>{
      if(district && d.name!==district)return '';
      const [x,y]=district?[centerCamera[0],camera[1]+92*px]:(labelPositions.get(d.name)||d.center);
      const original=mapPoint(d.center,matrix),placed=mapPoint([x,y],matrix),displaced=Math.hypot(placed[0]-original[0],placed[1]-original[1])>5;
      return `<g class="district-badge ${compact?'compact':''} ${narrow?'minimal':''} ${d.name==='善化區'?'featured':''}" data-name="${esc(d.name)}" role="button" tabindex="0" aria-label="${esc(d.name)}，名冊 ${counts(d.name)} 個社區">${!district&&displaced?`<path class="badge-leader" d="M${d.center.join(',')}L${x},${y}"/>`:''}<g transform="translate(${x} ${y})"><g class="badge-scale" transform="scale(${px})">${(()=>{const art=!compact&&!narrow&&!district,tx=art?11:0;return `<rect class="badge-depth" x="${-bw/2}" y="${-bh/2+3.5}" width="${bw}" height="${bh}" rx="${compact?7:10}"/><rect x="${-bw/2}" y="${-bh/2}" width="${bw}" height="${bh}" rx="${compact?7:10}"/>${art?`<g transform="translate(${-bw/2+15} 12) scale(1.1)">${districtIcon(counts(d.name))}</g>`:''}<text class="district-label" x="${tx}" y="${narrow?3:compact?-2:-3}" text-anchor="middle">${esc(d.name)}</text><text class="district-count" x="${tx}" y="${compact?9:11}" text-anchor="middle">${num(counts(d.name))}</text>`;})()}</g></g></g>`;
    }).join('');
    $('districtLabels').querySelectorAll('.district-badge').forEach(el=>{el.onclick=e=>{e.stopPropagation();if(!dragged)pickMapDistrict(el.dataset.name);};el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();pickMapDistrict(el.dataset.name);}};});
  }
  function fly(target){cancelAnimationFrame(animation);const from=[...camera],start=performance.now(),duration=matchMedia('(prefers-reduced-motion: reduce)').matches?0:430;const tick=now=>{const t=duration?Math.min(1,(now-start)/duration):1,e=1-(1-t)**3;camera=target.map((v,i)=>from[i]+(v-from[i])*e);syncCamera();if(t<1)animation=requestAnimationFrame(tick);else {renderPins();renderDistrictBadges();}};animation=requestAnimationFrame(tick);}
  function fitDistrict(name){const d=districts.find(d=>d.name===name);if(!d)return;const [x1,y1,x2,y2]=d.bounds,w=Math.max(42,(x2-x1)*1.48),h=Math.max(42,(y2-y1)*1.5),width=Math.max(w,h*1100/900);fly([(x1+x2)/2-width/2,(y1+y2)/2-width*900/1100/2,width,width*900/1100]);}
  // ---- Isometric art helpers (decorative illustrations; never encode measured data) ----
  const P=pts=>'M'+pts.map(p=>p.map(v=>+v.toFixed(2)).join(' ')).join('L')+'Z';
  // Box standing on front-bottom corner (x,y); w runs to the right-back, d to the left-back.
  function isoBox(x,y,w,d,h,c,opt={}){
    const R=[.866*w,-.5*w],L=[-.866*d,-.5*d],up=v=>[v[0],v[1]-h];
    const f=[x,y],r=[x+R[0],y+R[1]],l=[x+L[0],y+L[1]],b=[x+R[0]+L[0],y+R[1]+L[1]];
    let s=`<path d="${P([f,l,up(l),up(f)])}" fill="${c.left}"/><path d="${P([f,r,up(r),up(f)])}" fill="${c.right}"/><path d="${P([up(f),up(r),up(b),up(l)])}" fill="${c.top}"/>`;
    // window grid on both visible faces
    if(opt.rows){
      const win=(o,vec,len)=>{let out='';const cols=opt.cols||Math.max(1,Math.round(len/5)),gx=1/(cols+1),rowH=(h-4)/opt.rows;
        for(let i=0;i<opt.rows;i++)for(let j=1;j<=cols;j++){const t=j*gx,cx=o[0]+vec[0]*t,cy=o[1]+vec[1]*t-3-i*rowH,ww=Math.min(2.2,len*gx*.55),hh=Math.max(1.1,rowH*.5),dx=vec[0]/len*ww,dy=vec[1]/len*ww;
          out+=P([[cx-dx,cy-dy],[cx+dx,cy+dy],[cx+dx,cy+dy-hh],[cx-dx,cy-dy-hh]]);}
        return out;};
      s+=`<path d="${win(f,L,d)}" fill="${c.winL||'#3c7f8a'}"/><path d="${win(f,R,w)}" fill="${c.winR||'#cfe6e1'}" opacity=".9"/>`;
    }
    if(opt.cap)s+=`<path d="${P([up(f),up(r),[up(r)[0],up(r)[1]+1.4],[up(f)[0],up(f)[1]+1.4],[up(l)[0],up(l)[1]+1.4],up(l)])}" fill="${opt.cap}"/>`;
    return s;
  }
  // Pitched roof on a box footprint (x,y,w,d) sitting at height h.
  function isoRoof(x,y,w,d,h,rise,c){
    const R=[.866*w,-.5*w],L=[-.866*d,-.5*d],f=[x,y-h],r=[f[0]+R[0],f[1]+R[1]],l=[f[0]+L[0],f[1]+L[1]],b=[r[0]+L[0],r[1]+L[1]];
    const rf=[(f[0]+l[0])/2,(f[1]+l[1])/2-rise],rb=[(r[0]+b[0])/2,(r[1]+b[1])/2-rise];
    return `<path d="${P([f,r,rb,rf])}" fill="${c.front}"/><path d="${P([f,l,rf])}" fill="${c.side}"/><path d="${P([rf,rb])}" stroke="${c.ridge||'#f5efe3'}" stroke-width=".8" fill="none"/>`;
  }
  const isoTree=(x,y,s=1)=>`<path d="M${x} ${y}V${y-4*s}" stroke="#6b7f63" stroke-width="${1.1*s}"/><ellipse cx="${x}" cy="${y-6.5*s}" rx="${3.6*s}" ry="${4.2*s}" fill="#4f9478"/><ellipse cx="${x-1*s}" cy="${y-7.6*s}" rx="${1.8*s}" ry="${2*s}" fill="#7fbf9a" opacity=".8"/>`;
  const isoPlate=(x,y,w,d,c='#dfe7dc',edge='#a9c2bb')=>{const R=[.866*w,-.5*w],L=[-.866*d,-.5*d],f=[x,y],r=[x+R[0],y+R[1]],l=[x+L[0],y+L[1]],b=[x+R[0]+L[0],y+R[1]+L[1]];return `<path d="${P([f,r,[r[0],r[1]+2.2],[f[0],f[1]+2.2],[l[0],l[1]+2.2],l])}" fill="${edge}"/><path d="${P([f,r,b,l])}" fill="${c}"/>`;};
  const WALL={top:'#f5efe3',left:'#e6dcc6',right:'#a9cbc5'},GLASS={top:'#e9efe6',left:'#d7e7e2',right:'#0f7f84',winL:'#2f7584',winR:'#bfe4dd'},NAVY={top:'#e6ece4',left:'#cfdcd6',right:'#1d5466',winL:'#2c6f7e',winR:'#9fd2cc'};
  // District badge icon: type follows roster count (density hint, not a real building).
  function districtIcon(count){
    let s=isoPlate(0,4,11,11);
    if(count>=300)s+=isoBox(2,2,5,5,22,GLASS,{rows:6,cols:1,cap:'#caa65d'})+isoBox(-4,4,5,5,15,NAVY,{rows:4,cols:1})+isoTree(7,5,.7);
    else if(count>=50)s+=isoBox(1,3,7,6,15,NAVY,{rows:4,cols:1,cap:'#caa65d'})+isoTree(-6,3,.75)+isoTree(8,5,.6);
    else if(count>=1)s+=isoBox(0,3,8,6,7,WALL,{rows:1,cols:1})+isoRoof(0,3,8,6,7,5,{front:'#c86f4f',side:'#9e4f37'})+isoTree(7,5,.7);
    else s+=isoTree(-2,3,.9)+isoTree(4,5,.7)+`<path d="M-7 6L8 -2" stroke="#d9c58e" stroke-width="1.2"/>`;
    return `<g class="badge-icon" aria-hidden="true">${s}</g>`;
  }
  // Cluster: raised plinth with a small skyline.
  function clusterArt(count,radius){
    const w=radius*1.05;
    let s=`<ellipse cy="18" rx="${radius}" ry="${radius*.36}" fill="#12384b" opacity=".18"/>`;
    s+=isoPlate(0,14,w,w,'#1b6f78','#12384b');
    s+=`<path d="${P([[0,14],[.866*w,14-.5*w],[0,14-w],[-.866*w,14-.5*w]])}" fill="url(#clusterFill)" opacity=".55"/>`;
    const tall=count>=50?30:count>=10?24:18;
    s+=isoBox(-9,6,7,6,tall*.62,NAVY,{rows:3,cols:1});
    s+=isoBox(3,4,8,7,tall,GLASS,{rows:Math.round(tall/6),cols:1,cap:'#caa65d'});
    s+=isoBox(12,9,6,5,tall*.42,WALL,{rows:2,cols:1})+isoRoof(12,9,6,5,tall*.42,4,{front:'#c86f4f',side:'#9e4f37'});
    s+=isoTree(-16,12,.8)+isoTree(18,15,.7);
    return s;
  }
  // Life category scenes for 生活探索 cards.
  function lifeArt(cat){
    const base=isoPlate(0,40,30,30,'#e3ecdf','#b8cfc6');
    const scenes={
      daily: isoBox(-4,36,16,12,12,{top:'#f5efe3',left:'#efe3c8',right:'#9fc8c4'},{rows:1,cols:2})+`<path d="M-15 28L-1 21L14 28L0 35Z" fill="#d95f43"/><path d="M-15 28L0 35V38L-15 31Z" fill="#b84a33"/><path d="M-12 30L-8 32M-5 33.5L-1 35.5" stroke="#f5efe3" stroke-width="1.6"/>`+isoTree(16,42,1.1)+isoTree(-17,40,.9),
      scenery: `<path d="M-22 38Q0 46 24 36L26 42Q0 52 -24 44Z" fill="#7fb8c4"/><path d="M-20 40Q0 47 22 39" stroke="#e8f4f3" stroke-width=".8" fill="none"/>`+isoTree(-8,34,1.4)+isoTree(4,30,1.1)+isoTree(14,36,1.3)+`<circle cx="16" cy="6" r="5" fill="#f1c66a"/><path d="M-22 14Q-14 6 -6 14" stroke="#cfdcd6" stroke-width="2" fill="none" stroke-linecap="round"/>`,
      culture: isoBox(-2,38,18,12,13,{top:'#f2e6cf',left:'#e8d7b4',right:'#c9a46a'},{rows:1,cols:2,winL:'#8a4b32',winR:'#f5e8cc'})+isoRoof(-2,38,18,12,13,8,{front:'#b9402c',side:'#8f2f20',ridge:'#f1c66a'})+`<path d="M-16 40V30M-12 42V32" stroke="#8f2f20" stroke-width="1.6"/><path d="M-18 30L-10 33" stroke="#caa65d" stroke-width="2"/>`+isoTree(18,42,1),
      history: isoBox(0,38,16,14,11,{top:'#efe0c4',left:'#e2cfa8',right:'#b98f5a'},{rows:1,cols:2,winL:'#7a3f2a',winR:'#efd9b0'})+isoRoof(0,38,16,14,11,9,{front:'#a8382a',side:'#7d281d',ridge:'#f1c66a'})+`<path d="M-14 24Q-6 18 3 21" stroke="#f1c66a" stroke-width="1.2" fill="none"/><circle cx="-9" cy="35" r="1.6" fill="#f1c66a"/>`+isoTree(-17,42,.9),
      food: isoBox(-2,38,15,11,9,{top:'#f5efe3',left:'#efe3c8',right:'#cfa36a'},{rows:0})+`<path d="M-14 27L-2 21L12 28L0 34Z" fill="#2f7f84"/><path d="M-14 27L0 34V36L-14 29Z" fill="#1d5466"/><ellipse cx="2" cy="16" rx="6" ry="2.6" fill="#f5efe3" stroke="#caa65d"/><path d="M-4 16Q2 23 8 16" fill="#f5efe3" stroke="#caa65d"/><path d="M0 12Q-2 8 0 5M4 12Q2 8 4 5" stroke="#b9c7c3" stroke-width="1" fill="none"/>`+isoTree(16,42,.9),
      events: `<path d="M-14 38L-14 24L0 16L14 24V38" fill="none"/><path d="M-16 34L0 22L16 32L0 42Z" fill="#f5efe3"/><path d="M-16 34L0 42V38L-16 30Z" fill="#e6dcc6"/><path d="M-12 30L0 10L12 28L0 36Z" fill="#d95f43"/><path d="M-12 30L0 10L0 36Z" fill="#b84a33"/><path d="M0 10V5" stroke="#8f2f20"/>`+`<ellipse cx="-17" cy="16" rx="3.4" ry="4.2" fill="#e8553f"/><path d="M-17 11V12M-17 20.5V22" stroke="#caa65d" stroke-width="1"/><ellipse cx="18" cy="12" rx="3.4" ry="4.2" fill="#f1a33c"/><path d="M18 7V8M18 16.5V18" stroke="#caa65d" stroke-width="1"/><path d="M-20 9Q0 2 22 5" stroke="#8b7a5a" stroke-width=".6" fill="none"/>`
    };
    return `<svg viewBox="-30 -2 60 50" focusable="false" aria-hidden="true">${base}${scenes[cat]||scenes.daily}</svg>`;
  }
  function buildingArt(c){
    const floor=valid(c.floors)?+c.floors:null;
    // Four compact architectural illustrations; window bands are decorative, never measured floors.
    const ground=`<ellipse cy="1" rx="25" ry="6" fill="#12384b" opacity=".13"/><path d="M-25 -8L-3 -18L25 -8L3 4Z" fill="#d8ddd3"/><path d="M-25 -8L3 2L25 -8V-5L3 5L-25 -5Z" fill="#a9bfba"/>`;
    if(floor!==null&&floor<=5)return `${ground}<g filter="url(#pinShadow)"><path class="pin-face" d="M-22 -32L3 -22V-3L-22 -13Z" fill="#f5efe3"/><path d="M3 -22L22 -31V-12L3 -3Z" fill="#9fc8c4"/><path d="M-24 -33L-9 -43L24 -32L3 -21Z" fill="#12384b"/><path d="M-24 -33L-9 -43L1 -22Z" fill="#428d91"/><path d="M-13 -29L1 -39L11 -35L-3 -25ZM-2 -25L12 -35L24 -32L3 -21Z" fill="#087f82"/><path d="M-13 -29V-9M-4 -25V-6" fill="none" stroke="#cdbf9b" stroke-width="1.2"/><path d="M-19 -26L-15 -24V-19L-19 -21ZM-10 -22L-6 -20V-15L-10 -17ZM6 -19L11 -21.5V-16L6 -13.5ZM15 -23L19 -25V-20L15 -18Z" fill="#3f8a95"/><path d="M-19 -17L-15 -15V-10L-19 -12ZM-10 -13L-6 -11V-6L-10 -8Z" fill="#12384b"/><path d="M6 -11L11 -13V-7L6 -5Z" fill="#caa65d"/><path d="M-22 -17L3 -7L22 -16" fill="none" stroke="#e0d6b9" stroke-width="1.4"/><path d="M-7 -41V-46L-2 -48L3 -46V-42L-2 -40Z" fill="#d8e2dc"/><path d="M-2 -48L3 -46L-2 -44L-7 -46Z" fill="#f5efe3"/><path d="M17 -7V-12M-18 -7V-11" stroke="#627d66" stroke-width="1.5"/><path d="M13 -11Q12 -18 17 -18Q23 -17 21 -13Q20 -9 13 -11ZM-22 -11Q-24 -17 -19 -17Q-14 -16 -15 -12Q-17 -9 -22 -11Z" fill="#488c78"/></g>`;
    if(floor!==null&&floor>=15){
      const bands=[-60,-53,-46,-39,-32,-25,-18].map(y=>`M-12 ${y}L2 ${y+5.6}M5 ${y+4.5}L18 ${y-1.5}`).join('');
      return `${ground}<g filter="url(#pinShadow)"><path d="M-23 -15L0 -25L24 -16L3 -6Z" fill="#edf0e5"/><path d="M-23 -15L3 -6V1L-23 -8Z" fill="#d3dacc"/><path d="M3 -6L24 -16V-9L3 1Z" fill="#8eb5b0"/><path d="M-20 -12L-8 -8V-4L-20 -8ZM8 -6L20 -11V-8L8 -3Z" fill="#286a77"/><path class="pin-face" d="M-15 -65L3 -58V-9L-15 -16Z" fill="#f5efe3"/><path d="M3 -58L21 -66V-17L3 -9Z" fill="#087f82"/><path d="M-12 -62L1 -57V-12L-12 -17Z" fill="#84bfc1"/><path d="M6 -57L18 -62.5V-19L6 -13.5Z" fill="#236879"/><path d="M-12 -62L-7 -60V-16L-12 -18ZM9 -58.5L12 -60V-17L9 -15.5Z" fill="#cbe7e0" opacity=".6"/><path d="${bands}" fill="none" stroke="#ecf0df" stroke-width=".8" opacity=".8"/><path d="M-5 -59V-14M12 -60V-17" fill="none" stroke="#12384b" stroke-width=".7" opacity=".42"/><path d="M-15 -65L3 -73L21 -66L3 -58Z" fill="#edf0e5"/><path d="M-11 -65L3 -71L16 -66L3 -60Z" fill="#96c1ac"/><path d="M-15 -65L3 -58L21 -66V-63L3 -55L-15 -62Z" fill="#caa65d"/><path d="M-5 -69V-74L2 -77L10 -74V-69L3 -66Z" fill="#cbdad4"/><path d="M-5 -74L2 -77L10 -74L3 -71Z" fill="#f5efe3"/><path d="M3 -71L10 -74V-69L3 -66Z" fill="#91adaa"/><path d="M-10 -65L-4 -67L-1 -65L-7 -63ZM9 -63L14 -66L17 -64L12 -62Z" fill="#42816e"/><path d="M-20 -18L-16 -20L-10 -18L-14 -16ZM13 -14L18 -16L22 -14L17 -12Z" fill="#69a88b"/></g>`;
    }
    const h=floor===null?31:48,roof=floor===null?'#a9bdb8':'#87b6a0';
    const windows=[15,24,...(floor===null?[]:[33,42])].map(y=>`M-15 -${y}L-10 -${y-2}V-${y-6}L-15 -${y-4}ZM-6 -${y-3.5}L-1 -${y-5.5}V-${y-9.5}L-6 -${y-7.5}ZM7 -${y-2}L12 -${y+.4}V-${y-3.6}L7 -${y-6}ZM15 -${y+1.8}L19 -${y+3.7}V-${y-.3}L15 -${y-2.2}Z`).join('');
    return `${ground}<g filter="url(#pinShadow)"><path d="M-22 -13L1 -23L24 -14L3 -4Z" fill="#edf0e5"/><path d="M-22 -13L3 -4V2L-22 -7Z" fill="#d5dccf"/><path d="M3 -4L24 -14V-8L3 2Z" fill="#a5bfba"/><path class="pin-face" d="M-19 -${h}L3 -${h-9}V-4L-19 -13Z" fill="${floor===null?'#e4e8e1':'#f5efe3'}"/><path d="M3 -${h-9}L22 -${h}V-13L3 -4Z" fill="${floor===null?'#b7cbc5':'#96c5c2'}"/><path d="${windows}" fill="${floor===null?'#789e9f':'#397e8c'}"/><path d="M-19 -${h}L0 -${h+8}L22 -${h}L3 -${h-9}Z" fill="#e4ebdf"/><path d="M-15 -${h}L0 -${h+5}L17 -${h}L3 -${h-5}Z" fill="${roof}"/><path d="M-19 -${h}L3 -${h-9}L22 -${h}V-${h-3}L3 -${h-12}L-19 -${h-3}Z" fill="#caa65d"/><path d="M-8 -${h+1}V-${h+7}L-1 -${h+10}L7 -${h+7}V-${h+1}L0 -${h-2}Z" fill="#cedbd4"/><path d="M-8 -${h+7}L-1 -${h+10}L7 -${h+7}L0 -${h+4}Z" fill="#f5efe3"/><path d="M0 -${h+4}L7 -${h+7}V-${h+1}L0 -${h-2}Z" fill="#9eb7b2"/><path d="M-14 -${h}L-9 -${h+2}L-5 -${h}L-10 -${h-2}ZM9 -${h-1}L13 -${h+3}L17 -${h+1}L13 -${h-3}Z" fill="${floor===null?'#819a8e':'#3b846e'}"/><path d="M-8 -12L-1 -9V-4L-8 -7ZM8 -7L14 -10V-5L8 -2Z" fill="#12384b"/><path d="M-19 -15L3 -6L22 -15" fill="none" stroke="#f5efe3" stroke-width="1.4"/></g>`;
  }
  function showTooltip(c,e){const tip=$('mapTooltip');tip.innerHTML=`<strong>${esc(c.name)}</strong><span>${priceText(c)}</span><small>${positionLabel(c)} · ${esc(categoryLabel())} · 可比 ${num(stats(c).eligibleCount)} 筆<br>${esc(periodLabel())}</small>`;tip.hidden=false;const box=$('mapSvg').getBoundingClientRect();tip.style.left=`${Math.max(10,Math.min(e.clientX-box.left+15,box.width-235))}px`;tip.style.top=`${Math.max(85,Math.min(e.clientY-box.top-70,box.height-160))}px`;}
  function renderPins(){
    if(!district){$('pins').innerHTML='';return;}
    const items=(byDistrict.get(district)||[]).filter(c=>located(c)&&(kind==='all'||c.kind===kind)),px=pixelScale(),cell=matchMedia('(max-width:900px)').matches?66:62,bins=new Map();
    for(const c of items){const [x,y]=positions.get(String(c.id)),sx=(x-camera[0])/px,sy=(y-camera[1])/px,key=`${Math.floor(sx/cell)}:${Math.floor(sy/cell)}`;if(!bins.has(key))bins.set(key,[]);bins.get(key).push(c);}
    const clusters=[...bins.values()];
    const groupCenter=group=>group.reduce((a,c)=>{const p=positions.get(String(c.id));return [a[0]+p[0]/group.length,a[1]+p[1]/group.length];},[0,0]);
    // Merge adjacent bins whose screen symbols would overlap; every input remains represented.
    for(let i=0;i<clusters.length;i++){let center=groupCenter(clusters[i]);for(let j=i+1;j<clusters.length;j++){const next=groupCenter(clusters[j]);if(Math.hypot(center[0]-next[0],center[1]-next[1])<57*px){clusters[i].push(...clusters[j]);clusters.splice(j,1);center=groupCenter(clusters[i]);j=i;}}}
    $('pins').innerHTML=clusters.map((group,index)=>{
      if(group.length>1){const xy=group.reduce((a,c)=>{const p=positions.get(String(c.id));return [a[0]+p[0]/group.length,a[1]+p[1]/group.length];},[0,0]),radius=group.length>=100?27:group.length>=10?25:23;return `<g class="map-cluster" data-index="${index}" data-count="${group.length}" data-sample-count="${group.filter(c=>priceValue(c)!==null).length}" data-ids="${esc(group.map(c=>c.id).join(','))}" transform="translate(${xy.join(' ')})" tabindex="0" role="button" aria-label="此區共 ${group.length} 個社區，${group.filter(c=>priceValue(c)!==null).length} 個有本類型樣本，點選放大或查看全部"><g class="cluster-scale" transform="scale(${px})"><g aria-hidden="true" filter="url(#pinShadow)" transform="translate(0 -14)">${clusterArt(group.length,radius)}</g><rect x="${3-radius}" y="6" width="${2*radius-6}" height="27" rx="8" fill="#f5efe3" stroke="#caa65d" stroke-width=".7"/><text class="cluster-count" text-anchor="middle" y="17">${group.length}</text><text class="cluster-label" text-anchor="middle" y="28">${group.filter(c=>priceValue(c)!==null).length} 有樣本</text></g><title>此處 ${group.length} 個社區，點選查看全部與放大</title></g>`;}
      const c=group[0],p=positions.get(String(c.id));return `<g class="community-pin ${String(selected)===String(c.id)?'active':''} ${sufficient(c)?'priced':'unpriced'}" data-id="${esc(c.id)}" data-lon="${c.lon}" data-lat="${c.lat}" transform="translate(${p.join(' ')})" role="button" tabindex="0" aria-label="${esc(c.name)}，${positionLabel(c)}，${esc(priceText(c))}"><title>${esc(c.name)}｜${positionLabel(c)}｜${esc(priceText(c))}｜${esc(periodLabel())}</title><g class="pin-scale" transform="scale(${px})">${buildingArt(c)}<circle class="pin-anchor" r="3" fill="${sufficient(c)?'#087f82':'#8caaa8'}"/><rect x="-25" y="-78" width="52" height="85" fill="transparent"/></g></g>`;
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
    $('districtDescription').textContent=`名冊 ${num(cov.total)} · 可定位 ${num(cov.located)} · 有成交參考 ${num(cov.priced+cov.limited)} · 無可比成交 ${num(cov.total-cov.priced-cov.limited)}`;
    $('mapTitle').textContent=district?district+'社區地圖':cityController&&preferCityScene?'台南立體地圖':'台南行政區地圖';
    $('breadcrumb').textContent=district?`台南市 / ${district}`:'台灣 / 台南市';
    $('mapHint').textContent=district?'點建築查社區，點數字展開群組。':cityController&&preferCityScene?'拖曳旋轉，點行政區查社區。':'點選行政區，查看社區名冊。';
    $('mapStatus').innerHTML=isCity?`<strong>${num(cov.total)}</strong><span>筆社區名冊</span><small>${num(cov.located)} 筆有座標 · 37 個行政區</small>`:`<strong>${num(cov.located)}</strong><span>筆可定位名冊</span><small>${num(cov.total-cov.located)} 筆待補座標，仍列在名冊</small>`;
    $('legendText').textContent=district?'聚合大數為社區總數，小字為有樣本社區數':'數字為社區名冊數，顏色不是房價';
    $('readDistrictLife').textContent=`閱讀${district||'北區'}生活 ↗`;
    $('periodNote').textContent=`${categoryLabel()} · ${periodLabel()}${periodInfo().start?' · '+periodInfo().start+' ～ '+periodInfo().end:''}${period==='all'?'；跨期歷史統計，非目前行情。':'；依資料快照計算，非即時房價。'} ${batchDates()}`;
    $('atlasStats').innerHTML=`<strong>${num(communities.length)}<span>筆社區名冊</span></strong><strong>37<span>行政區可切換</span></strong><strong>${num(communities.filter(located).length)}<span>筆有座標</span></strong>`;
    guideMapCaption();
  }
  function guideMapCaption(){
    if(guide?.task==='population'){
      $('mapTitle').textContent='各區人口分布';
      $('mapHint').textContent='點行政區看人口、排名與占比。';
    }else if(guide?.task==='story' && district){
      $('mapTitle').textContent=district;
      $('mapHint').textContent='目前閱讀的故事所在行政區。';
    }else if(!district && ['fault','subsidence'].includes(cityController?.getLayer())){
      $('mapTitle').textContent=cityController.getLayer()==='fault'?'活動斷層敏感區':'地層下陷觀測';
      $('mapHint').textContent='點圖中標記或從圖例選取，查看公告與觀測資料。';
    }
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
  function closeDetail(){
    if(selected===null && $('detail').hidden) return;
    selected=null;$('detail').hidden=true;document.body.classList.remove('detail-open');
    document.querySelectorAll('.community-pin').forEach(el=>el.classList.remove('active'));
    renderList();
  }
  function pickMapDistrict(name){
    if (!guide?.pickDistrict(name)) chooseDistrict(name);
  }
  function chooseDistrict(name,keepDetail=false){
    guide?.rememberDistrict(name);
    clearTimeout(searchTimer);
    district=name;page=1;query='';$('search').value='';$('clearSearch').hidden=true;$('searchResults').hidden=true;category='all';
    document.body.classList.toggle('district-focused',!!name);$('districtSelect').value=name;closeLife();if(!keepDetail)closeDetail();
    document.querySelectorAll('.district').forEach(el=>{el.classList.toggle('selected',el.dataset.name===name);el.classList.toggle('muted',!!name&&el.dataset.name!==name);el.setAttribute('aria-pressed',String(el.dataset.name===name));});
    $('thickness').querySelectorAll('path').forEach(el=>el.style.opacity=name&&el.dataset.name!==name?'.15':'1');
    document.querySelectorAll('.shortcuts button').forEach(el=>el.classList.toggle('active',el.dataset.name===name));
    syncCityView();updateSummary();renderPins();renderDistrictBadges();renderList();
    if(viewMode==='life')renderLife();
    if(name)fitDistrict(name);else if(!cityController || !preferCityScene)fly([0,0,1100,900]);
    else {cancelAnimationFrame(animation);camera=[0,0,1100,900];syncCamera();}
  }
  function selectCommunity(id){
    const c=byId.get(String(id));if(!c)return;closeLife();if(district!==c.district)chooseDistrict(c.district,true);setMode('market');selected=c.id;$('searchResults').hidden=true;renderList();renderDetail();renderPins();track('community_open',c.id);
  }
  function openMarket(districtName='', text='', market='sale'){
    if(window.MapMarketLedger){
      window.MapMarketLedger.open({district:districtName,query:text,market});
    }else{
      openDialog('公開成交查詢',link(OFFICIAL_LVR,'內政部實價查詢')+'<p>市區成交查詢暫時無法載入，請重新整理或到官方查詢。</p>');
    }
  }
  function communityMarket(c){
    const addresses=c.primaryExactAddresses||[];
    const representative=addresses[0] || c.exactAddresses?.[0] || c.address || '';
    const local=String(representative).replace(/^(臺|台)南市/,'').replace(c.district,'').trim();
    const road=local.match(/^[^、，,\d]{1,15}?(?:大道|路|街)(?:[一二三四五六七八九十０-９0-9]+段)?/);
    openMarket(c.district,road ? road[0] : (local.match(/^[^、，,號]+號/)?.[0] || ''));
  }
  $('openMarket').onclick=()=>{
    const text=$('search').value.trim();
    openMarket(text?'':district,text);
  };
  function renderDetail(){
    const c=byId.get(String(selected));if(!c)return;const s=stats(c),enough=sufficient(c),few=limited(c),age=ageValue(c);
    $('detail').hidden=false;document.body.classList.add('detail-open');
    $('detail').innerHTML=`<div class="detail-toolbar"><span class="detail-identity"><strong>${esc(c.name)}</strong><small>${esc(c.district)}</small></span><button id="closeDetail" class="detail-close" aria-label="關閉社區資訊">關閉 ×</button></div><span class="detail-kicker">${esc(c.district)} / ${esc(kindLabels[c.kind]||c.kindLabel||'類型待核')}</span><div class="detail-art" aria-hidden="true"><svg viewBox="-40 -83 80 92">${buildingArt(c)}</svg></div><h2>${esc(c.name)}</h2><p class="address">${esc(c.address||'代表門牌待補')}</p>${quantityGlance(c)}${queryActions(c)}<p class="official-query-note">官方入口開啟查詢首頁；複製門牌後，在官方頁設定地址與條件。</p><button type="button" id="floorSales" class="primary full" aria-haspopup="dialog">樓層查價</button>${filterControls('detail',false)}<div class="building-facts"><span>${valid(c.floors)?esc(c.floors)+' 樓':'樓層待核'}</span><span>${positionLabel(c)}</span></div><div class="metric"><span class="metric-label">${esc(categoryLabel())}<br>${esc(periodLabel())} · ${few?'少量成交均價':'算術平均單價'}</span><div class="metric-value ${enough?'':few?'limited':'insufficient'}">${enough?fmt(s.mean)+'<small>萬元／坪</small>':few?fmt(s.sampleMean)+'<small>萬元／坪 · '+num(s.eligibleCount)+' 筆</small>':'資料不足，不推估'}</div><div class="metrics"><div><span>可比 / 本類型匹配成交</span><strong>${num(s.eligibleCount)} / ${num(s.count)}<small> 筆</small></strong></div><div><span>中位單價</span><strong>${enough?fmt(s.median):few?fmt(s.sampleMedian):'—'}<small> 萬／坪</small></strong></div></div><p class="help">${enough?'可比單價範圍 '+fmt(s.min)+'–'+fmt(s.max)+' 萬／坪':few?'樣本少，僅供個案參考。少量單價範圍 '+fmt(s.sampleMin)+'–'+fmt(s.sampleMax)+' 萬／坪；不視為完整社區行情。':'此類型、期間尚無可比成交或資料缺漏，保留名冊、不推估均價。'}<br>期間最新成交：${esc(s.latestDate||'尚無匹配紀錄')}${period==='all'?'<br><strong>此為 101/08/01 起跨期歷史均價，非當期市場行情。</strong>':''}</p></div><dl class="community-evidence"><div><dt>成交樣本屋齡</dt><dd>${age===null?'資料待補':fmt(age)+' 年'}<small>${age===null?'沒有可核對的完成日期':'中位數 · '+num(s.ageSampleCount)+' 筆有日期樣本；計至 '+esc(meta.asOf||'資料基準日')}${s.agePrecision==='month'||s.agePrecision==='mixed'?'；部分日期精確至月，屋齡為約數':''}</small></dd></div>${detailCounts(c)}</dl><button id="transactionsButton" class="primary full">查看 ${num(s.count)} 筆本類型成交明細 ↗</button><button id="addCompare" class="full">${compared.includes(c.id)?'✓ 已加入比較 · 點此移除':'＋ 加入比較（最多 3 個）'}</button><div class="detail-section"><h3>這份資料涵蓋什麼</h3><p>${esc(c.matchNote||'僅涵蓋可確定門牌配對的交易，不推定名冊外門牌或其他棟別。')}</p><p>${esc(categoryLabel())} · ${esc(periodInfo().start)} ～ ${esc(periodInfo().end)}<br>資料快照 ${esc(meta.asOf||'未提供')}</p>${c.approvalDate?'<p>名冊成立核准：'+esc(c.approvalDate)+'<br><span class="help">此日期不是建物完工年或屋齡。</span></p>':''}${(()=>{const aliases=[...new Set([c.apiAlias?.name,...(c.registrationAliases||[]).map(a=>a.name)].filter(n=>n&&n!==c.name))],addrs=[...new Set(c.exactAddresses||[])],gm=located(c)?`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(c.lat+','+c.lon)}`:'',sv=located(c)?`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${encodeURIComponent(c.lat+','+c.lon)}`:'';return `<div class="detail-more">${c.buildingPermit?'<p>使用執照：'+esc(c.buildingPermit)+'</p>':''}${aliases.length?'<p>名冊別名：'+aliases.map(esc).join('、')+'</p>':''}${addrs.length?'<p>名冊門牌：'+addrs.slice(0,6).map(esc).join('、')+(addrs.length>6?` 等 ${addrs.length} 筆`:'')+'</p>':''}${c.parcelMatchedAddresses?.length?'<p>土地明細逐筆核對的交易門牌：'+c.parcelMatchedAddresses.map(esc).join('、')+'</p>':''}<p>位置來源：${esc(c.positionQuality||'未提供')}</p>${gm?`<p class="map-links"><a class="source-link" href="${esc(gm)}" target="_blank" rel="noopener noreferrer">在 Google 地圖查看標示位置 ↗</a><a class="source-link" href="${esc(sv)}" target="_blank" rel="noopener noreferrer">查看附近街景 ↗</a></p>`:''}</div>`;})()}${link(c.sourceUrl,'次級來源：社區名冊')}<p class="help">${located(c)?positionLabel(c)+'（經度 '+esc(c.lon)+'、緯度 '+esc(c.lat)+'）'+'；輪廓依樓層分類示意，非實際外觀。':'來源缺少可信座標，保留在名冊、不臆測地圖位置。'}<br>成交條件仍須逐筆核對；不是銀行鑑價。</p></div><button id="communityFeedback" class="full">補充／回報這個社區</button>`;
    bindQueryActions($('detail'));bindFilterControls('detail',null,false);
    $('showQuantityEvidence').onclick=()=>{
      const evidence=$('detail').querySelector('.community-evidence');
      evidence.setAttribute('tabindex','-1');
      evidence.focus({preventScroll:true});
      evidence.scrollIntoView({block:'start'});
    };
    $('floorSales').onclick=()=>showFloorSales(c);
    $('detail').querySelector('.address').insertAdjacentHTML('afterend','<button type="button" class="gap-entry" id="openFloorGaps" aria-haspopup="dialog">比較樓層價差 <span aria-hidden="true">→</span></button>');
    $('openFloorGaps').insertAdjacentHTML('afterend','<button type="button" id="nearMarket" class="market-near" aria-haspopup="dialog">另查附近公開成交 ↗</button>');
    $('nearMarket').onclick=()=>communityMarket(c);
    $('openFloorGaps').onclick=()=>showBuilding(c,new URLSearchParams({panel:'gaps'}));
    $('floorSales').insertAdjacentHTML('beforebegin','<button id="exploreBuilding" type="button" class="full" aria-haspopup="dialog">開啟 3D 樓層看成交 ↗</button>');
    $('exploreBuilding').onclick=()=>showBuilding(c);
    $('floorSales').insertAdjacentHTML('afterend','<button id="environmentButton" type="button" aria-haspopup="dialog">日照與環境查詢</button>');
    $('environmentButton').onclick=()=>showEnvironment(c);
    $('closeDetail').onclick=closeDetail;$('communityFeedback').onclick=()=>feedback({district:c.district,communityId:c.id});$('transactionsButton').onclick=()=>showTransactions(c);
    $('addCompare').onclick=()=>{if(compared.includes(c.id))compared=compared.filter(id=>id!==c.id);else if(compared.length<3)compared.push(c.id);else{openDialog('已選滿 3 個社區','<p>請先移除一個社區，再加入新的比較對象。</p>');return;}renderCompare();renderDetail();};
  }
  let txRequestEpoch=0;
  $('infoDialog').addEventListener('close',()=>{
    if ($('infoDialog').open) return;
    txRequestEpoch++;
    if ($('buildingStudio')) $('exploreBuilding')?.focus({preventScroll:true});
    releaseBuilding();
    if ($('floorContents') && !$('detail').hidden) $('floorSales')?.focus({preventScroll:true});
    if ($('environmentPanel') && !$('detail').hidden) $('environmentButton')?.focus({preventScroll:true});
  });
  function releaseBuilding(){
    buildingController?.destroy();
    buildingController=null;
    $('infoDialog').classList.remove('building-studio');
  }
  function openDialog(title,html){releaseBuilding();txRequestEpoch++;$('dialogTitle').textContent=title;$('dialogBody').innerHTML=html;if(!$('infoDialog').open)$('infoDialog').showModal();$('infoDialog').scrollTop=0;}
  function txInPeriod(t){const p=periodInfo();return !!t.date&&t.date>=p.start&&t.date<=p.end;}
  function txInCategory(t){return marketCategory==='all'?t.propertyUse==='residential':t.category===marketCategory;}
  function drawFaultMap(root,c) {
    const zones = window.MapFaults?.outlines || [];
    if (!zones.length || !districts.length) {
      root.textContent = '圖形暫時無法載入，可開啟下方的官方圖台。';
      return;
    }
    const point = located(c) ? project([c.lon,c.lat]) : null;
    const areas = zones.map(z => ({
      name:z.name, path:pathOf({geometry:{type:'Polygon',coordinates:[z.ring]}}),
      box:boundsOf({geometry:{type:'Polygon',coordinates:[z.ring]}})
    }));
    root.innerHTML = `<label>圖面範圍<select aria-label="公告範圍示意圖檢視"><option value="">台南全市</option>${areas.map((a,i)=>`<option value="${i}">${esc(a.name)}</option>`).join('')}</select></label>
      <svg viewBox="100 45 900 800" role="img" aria-label="台南各行政區及四處公告活動斷層地質敏感區，橘色為公告面${point?'，圓點為社區位置':''}">
      ${districts.map(d=>`<path class="env-map-district" d="${d.path}" fill-rule="evenodd"/>`).join('')}
      ${areas.map(a=>`<path class="env-zone" d="${a.path}"><title>${esc(a.name)}</title></path>`).join('')}
      ${point?`<circle class="env-map-point" cx="${point[0]}" cy="${point[1]}" r="7"><title>${esc(c.name)} · ${esc(positionLabel(c))}</title></circle>`:''}</svg>
      <p class="env-note">橘色範圍為公告面${point?'，深色圓點為本社區'+esc(positionLabel(c)):'。社區缺少座標'}。選擇斷層可放大檢視。</p>`;
    const svg = root.querySelector('svg'), circle = root.querySelector('circle');
    root.querySelector('select').onchange = event => {
      let view = [100,45,900,800];
      if (event.target.value !== '') {
        const [x1,y1,x2,y2] = areas[Number(event.target.value)].box;
        const pad = Math.max(10,(y2-y1)*.12,(x2-x1)*.12);
        view = [x1-pad,y1-pad,x2-x1+2*pad,y2-y1+2*pad];
      }
      svg.setAttribute('viewBox',view.join(' '));
      if (circle) circle.setAttribute('r',Math.max(view[2],view[3])/120);
    };
  }
  function showEnvironment(c, params = new URLSearchParams()) {
    openDialog(c.name + '｜日照與環境查詢','<div id="environmentPanel"></div>');
    if (window.MapEnvironment) {
      window.MapEnvironment.mount($('environmentPanel'),c,{params,esc,link,positionLabel,located,copyValue,drawFaultMap,address:addressFor(c)});
    } else {
      $('environmentPanel').textContent='環境查詢工具暫時無法載入，請重新整理。';
    }
  }
  function floorLink(c) {
    const url = new URL(location.pathname, location.origin);
    url.searchParams.set('community', c.id);
    url.searchParams.set('view', 'floors');
    if (marketCategory !== 'all') url.searchParams.set('category', marketCategory);
    if (period !== 'all') url.searchParams.set('period', period);
    return url.href;
  }
  function showBuilding(c, params = new URLSearchParams()) {
    return withTransactions(c, () => {
      openDialog(c.name+'｜3D 樓層','<div id="buildingStudio"></div>');
      $('infoDialog').classList.add('building-studio');
      if (!window.StudioSales || !window.FloorSales) {
        $('buildingStudio').innerHTML='<p>立體查詢暫時無法載入。</p><button id="studioFallback">前往樓層查價</button>';
        $('studioFallback').onclick=()=>showFloorSales(c);
        return;
      }
      buildingController=window.StudioSales.mount($('buildingStudio'),c,{
        rows:c.transactions.filter(t=>txInPeriod(t)&&txInCategory(t)), asOf:meta.asOf, bounds:periodInfo(),
        filters:categoryLabel()+' · '+periodLabel(), shareBase:floorLink(c), params, esc, copyValue,
        coordinates:located(c)?{lat:Number(c.lat),lon:Number(c.lon)}:{},
        openFloors:()=>showFloorSales(c),openEnvironment:topic=>showEnvironment(c,new URLSearchParams(topic?{topic}:{}))
      });
    },'3D 樓層');
  }
  function showFloorSales(c) {
    return withTransactions(c, () => {
      const activeFilter = ['floorCategorySelect','floorPeriodSelect'].find(id => $(id) === document.activeElement);
      const bounds = periodInfo();
      const rows = c.transactions.filter(t => txInPeriod(t) && txInCategory(t));
      const mapAddress = c.primaryExactAddresses?.[0] || c.exactAddresses?.[0] || c.address;
      openDialog(c.name + '｜樓層查價', `
        ${filterControls('floor',false)}
        <p class="help">${esc(bounds.start)} ～ ${esc(bounds.end)} · 此條件共 ${num(rows.length)} 筆</p>
        <div class="row-actions" id="floorShareTools">
          <button type="button" id="copyFloorLink">複製社區查價連結</button>
          ${link('https://landmap.tainan.gov.tw/gis/?fun=3ds','府城南籍圈・官方 3D 圖台')}
          <span class="copy-status" role="status"></span>
        </div>
        <div id="floorContents"></div>
        <p class="help">進入官方 3D 圖台後選「門牌」定位，可查看市府已開放的測繪成果。${mapAddress?' 本社區名冊門牌可參考 '+esc(mapAddress)+'。':''}</p>`);
      if (window.FloorSales?.mount) {
        window.FloorSales.mount($('floorContents'), c, rows, {asOf:meta.asOf, period:bounds,
          openGaps:address=>showBuilding(c,new URLSearchParams(address?{panel:'gaps',address}:{panel:'gaps'}))});
      } else {
        $('floorContents').innerHTML = '<p role="alert">樓層查價元件未載入，仍可開啟逐筆明細。</p><button type="button" id="floorFallback">查看原始成交明細</button>';
        $('floorFallback').onclick = () => showTransactions(c);
      }
      bindFilterControls('floor', () => showFloorSales(c), false);
      $('copyFloorLink').onclick = e => copyValue(floorLink(c), e.currentTarget,'已複製這個社區、類型與期間的查價連結。','查價連結');
      if (activeFilter) $(activeFilter).focus();
    }, '樓層查價');
  }
  async function withTransactions(c,render,title='成交明細'){
    if(!Array.isArray(c.transactions)){
      openDialog(c.name+'｜'+title,'<p role="status">正在載入 '+esc(c.district)+' 的原始成交明細…</p>');
      const requestEpoch=txRequestEpoch;
      try{
        await window.ensureDistrictTransactions(c.district);
      }catch(error){
        if(requestEpoch!==txRequestEpoch||!$('infoDialog').open||selected!==c.id)return;
        openDialog(c.name+'｜明細暫時無法載入','<p role="alert">連線或資料檢查未完成，無法確認成交明細；這不代表沒有成交。</p><button id="retryTransactions" class="primary">重新載入明細</button>'+queryActions(c));
        $('retryTransactions').onclick=()=>withTransactions(c,render,title);bindQueryActions($('dialogBody'));return;
      }
      if(requestEpoch!==txRequestEpoch||!$('infoDialog').open||selected!==c.id)return;
    }
    render();
  }
  function showTransactions(c,txPage=1,allRows=false){return withTransactions(c,()=>renderTransactions(c,txPage,allRows));}
  function renderTransactions(c,txPage,allRows){
    const rows=(c.transactions||[]).filter(t=>allRows || (txInPeriod(t)&&txInCategory(t))).sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))||String(a.id||'').localeCompare(String(b.id||''))),pages=Math.max(1,Math.ceil(rows.length/TX_PAGE_SIZE));txPage=Math.max(1,Math.min(txPage,pages));const shown=rows.slice((txPage-1)*TX_PAGE_SIZE,txPage*TX_PAGE_SIZE);
    const rooms=t=>[valid(t.roomCount)?t.roomCount+' 房':null,valid(t.hallCount)?t.hallCount+' 廳':null,valid(t.bathCount)?t.bathCount+' 衛':null].filter(Boolean).join(' / ')||'格局未提供';
    const uses={residential:'住宅',shop:'店面',non_residential:'非住宅',unknown:'用途待核'};
    openDialog(c.name+'｜成交明細',`<label class="tx-all-rows"><input id="txAllRows" type="checkbox" ${allRows?'checked':''}> 顯示本社區全部已配對成交（${num(c.transactions.length)} 筆）</label>${allRows?'':filterControls('tx',false)}<p class="filter-context"><strong>${allRows?'全期、全部用途':esc(categoryLabel())+' · '+esc(periodLabel())}</strong><br>${allRows?'含已配對的店面、車位與待核紀錄':esc(periodInfo().start)+' ～ '+esc(periodInfo().end)} · 共 ${num(rows.length)} 筆。未納入統計的資料仍保留，每頁 ${TX_PAGE_SIZE} 筆。</p>${queryActions(c)}<p class="help">住宅與店面分開統計；套房依官方建物型態辨識，不以 1 房推定。屋齡依來源完成日期計算，部分只精確至月。成屋可比單價排除交易早於可確認完工日的案件；日期只有月份者，同月份保留原分類。各筆皆保留排除原因。</p><div class="table-scroll"><table class="transaction-table"><thead><tr><th>交易日期／原登錄地址</th><th>總價含車位<br>萬元</th><th>面積含車位<br>坪</th><th>可比單價<br>萬元／坪</th><th>用途／格局</th><th>完成日期／屋齡</th><th>樓層／車位</th><th>統計狀態／原始列</th></tr></thead><tbody>${shown.map(t=>`<tr><td>${esc(t.date||'日期待核')}<br><small>${esc(t.address||'原檔未揭露門牌')}<br>${esc(t.categoryLabel||marketCategories[t.category]||'分類待核')}</small></td><td>${fmt(t.priceWan)}</td><td>${fmt(t.areaPing)}</td><td>${fmt(t.unitWan)}</td><td>${esc(t.mainUse||uses[t.propertyUse]||'用途待核')}<br>${esc(rooms(t))}<br><small>${esc(t.buildingType||'建物型態未提供')}</small></td><td>${esc(t.buildingCompletionDate||t.buildingCompletionRaw||'完成日期未提供')}<br>${valid(t.ageYears)?fmt(t.ageYears)+' 年':'屋齡待補'}${t.completionPrecision==='month'?'<br><small>來源精確至月，屋齡約數</small>':''}</td><td>${esc(t.floor||'樓層未提供')}<br>${esc(t.address||'門牌待核')}<br>${esc(t.parkingMode||'車位待核')}${t.unitDoorplateRow114?'<br><small>戶別與 114 年市府門牌表第 '+num(t.unitDoorplateRow114)+' 列相符</small>':t.unitIdentity?'<br><small>原始成交列揭露樓室</small>':''}</td><td>${t.eligible===true?'納入可比統計':`<span class="badge">未納入：${esc(t.exclusionReason||'待核對')}</span>`}<br><small>${esc(t.notes||'')}<br>來源列 ${esc(t.sourceRow||t.id||'未提供')}${t.parcelMatch?'<br>同批土地明細 '+esc(t.parcelMatch.parcel)+' · 第 '+num(t.parcelMatch.landRow)+' 列 '+link(meta.parcelSaleSources?.[t.parcelMatch.season]?.url,'內政部土地明細')+(t.parcelMatch.officialPlateRow114?'<br>同門牌見 114 年市府門牌表第 '+num(t.parcelMatch.officialPlateRow114)+' 列 '+link(meta.unitDoorplateSource?.url,'市府門牌資料'):''):''}${Array.isArray(t.sourceRows)&&t.sourceRows.length>1?'<br>合併相同資料 '+t.sourceRows.length+' 個來源列':''}</small></td></tr>`).join('')||'<tr><td colspan="8">此類型、期間尚無可確定匹配紀錄，不使用其他類型或鄰近社區價格填補。</td></tr>'}</tbody></table></div><nav id="transactionsPager" class="pager"><button id="txPrev" ${txPage<=1?'disabled':''}>上一頁</button><span>第 ${txPage} / ${pages} 頁 · ${num(rows.length)} 筆</span><button id="txNext" ${txPage>=pages?'disabled':''}>下一頁</button></nav><p class="help">資料快照 ${esc(meta.asOf||'未提供')}。顯示範圍最早自 101/08/01 起，日期無法解析者不混入期間統計。原始批次與方法可從主頁「資料與方法」查閱。</p>`);
    if(!allRows)bindFilterControls('tx',()=>showTransactions(c,1),false);bindQueryActions($('dialogBody'));
    $('txAllRows').onchange=e=>showTransactions(c,1,e.target.checked);
    $('txPrev').onclick=()=>showTransactions(c,txPage-1,allRows);$('txNext').onclick=()=>showTransactions(c,txPage+1,allRows);
  }
  function showCompare(){
    const rows=compared.map(id=>byId.get(String(id))).filter(Boolean);if(rows.length<2)return;
    const age=c=>ageValue(c)===null?'待補':fmt(ageValue(c))+' 年（'+num(stats(c).ageSampleCount)+' 筆日期樣本）';
    openDialog('把社區，放在一起看',`${filterControls('compare',false)}<p class="filter-context">同一成交類型：<strong>${esc(categoryLabel())}</strong><br>同一期別：<strong>${esc(periodLabel())}</strong>，${esc(periodInfo().start)} ～ ${esc(periodInfo().end)}。不同樓層、車位及棟別條件仍須逐筆核對，這不是同質物件估價。</p><div class="table-scroll"><table class="compare-table"><thead><tr><th>指標</th>${rows.map(c=>`<th>${esc(c.name)}${queryActions(c)}</th>`).join('')}</tr></thead><tbody>${[['行政區',c=>esc(c.district)],['成交類型',()=>esc(categoryLabel())],['統計期間',()=>esc(periodInfo().start)+' ～ '+esc(periodInfo().end)],['平均單價（萬／坪）',c=>sufficient(c)?fmt(stats(c).mean):limited(c)?fmt(stats(c).sampleMean)+'（少量 '+num(stats(c).eligibleCount)+' 筆，僅供個案參考）':'資料不足，不推估'],['中位單價（萬／坪）',c=>sufficient(c)?fmt(stats(c).median):limited(c)?fmt(stats(c).sampleMedian)+'（少量參考）':'—'],['可比／本類型匹配筆數',c=>`${num(stats(c).eligibleCount)} / ${num(stats(c).count)}`],['成交樣本屋齡',age],['社區總棟數（名冊）',buildingText],['社區總戶數',projectText],['單張使照登載戶數',c=>withCount(householdValue(c),'戶')],['歷年累計匹配成交（各用途）',totalSalesText],['本條件可辨識成交戶別',identifiedText],['期間最新成交',c=>esc(stats(c).latestDate||'尚無匹配')],['匹配範圍',c=>esc(c.matchNote||'門牌依來源核對')]].map(([name,fn])=>`<tr><th>${name}</th>${rows.map(c=>`<td>${fn(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
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
    const districtTable=districts.map(d=>{const x=coverageOf(byDistrict.get(d.name)||[]);return `<tr><td>${esc(d.name)}</td><td>${num(x.total)}</td><td>${num(x.located)}</td><td>${num(x.priced)}</td><td>${num(x.limited)}</td><td>${num(x.total-x.priced-x.limited)}</td></tr>`;}).join('');
    openDialog('名冊的範圍，行情的依據',`<div class="method-intro"><strong>${num(communities.length)} 筆社區名冊 · 37 個行政區可查</strong><p>這是依目前取得來源整理的社區名冊，不是全市完整建築普查。低樓社區、用途待核及缺少行情的項目都保留；未收錄不代表不存在。</p></div><h3>資料覆蓋與缺口</h3><p>工務局清冊原始 ${valid(raw)?num(raw):'未提供'} 列，具名稱 ${num(cov.officialRegistryCount)} 列；核對重複後主目錄 ${num(communities.length)} 筆。<br>另保留舊圖台待核 ${num(legacyCommunities.length)} 筆，獨立查詢，不混入主目錄或行情統計。<br>清冊下載頁更新 ${esc(meta.registrySnapshot?.publishedAt||'2026-09-04')}；檔名標示資料截至 ${esc(meta.registrySnapshot?.fileAsOf||'2026-05-01')}。本次整理日期不表示清冊涵蓋當日全部建物。<br>可定位 ${num(current.located)} 筆；待補座標 ${num(current.total-current.located)} 筆。<br>${esc(periodLabel())}有可比行情 ${num(current.priced)} 筆（至少 5 筆可比成交）；另有 ${num(current.limited)} 筆名冊提供 1–4 筆少量成交參考，${num(current.total-current.priced-current.limited)} 筆名冊在此期間與類型下沒有可比成交。</p>${matchingCoverageText()}<p>未匹配資料不任意攤派給鄰近社區。名冊不是交易全量，交易配對也不等於社區全部棟別。</p><h3>交易批次與日期</h3><p>快照基準：${esc(meta.asOf||'未提供')}<br>${esc(batchDates())}<br>這批台南原始檔的最新交易日：${esc(latestBatch?.maxTransactionDate||'未提供')}<br>名冊住宅成交明細的最新交易日：${esc(latestMatched)}（含未納入均價的交易）。歷史統計從 ${esc(BASELINE)} 起算。<br>統計來源：${esc(meta.statisticalSource||'內政部公開實價資料')}<br>目前統計期別：${esc(periodLabel())}，${esc(periodInfo().start||'來源最早成交')} ～ ${esc(periodInfo().end||meta.asOf||'未提供')}。</p>${Array.isArray(meta.batches)?'<ul>'+meta.batches.map(b=>'<li>'+esc(typeof b==='string'?b:(b.label||b.file||JSON.stringify(b)))+'</li>').join('')+'</ul>':''}<h3>成交類型、時間與排序</h3><p>目前視角：${esc(categoryLabel())}；${esc(periodLabel())}，${esc(periodInfo().start)} ～ ${esc(periodInfo().end)}。主清單、聚合清單、明細與比較共用同一分類與期別。</p><p>全部住宅僅納入用途可確認為住宅的成交，包含格局未揭露的住宅，不混入店面；套房依官方套房型態辨識，1 房不直接當套房。其餘住宅按官方房數分為 1、2、3、4、5 房以上；「用途／格局待核」保留不確定資料並顯示原始用途。顯示與統計下限固定 101/08/01（2012-08-01），更早或無法解析日期者不混入本期統計。</p><p>均價由高到低、成交樣本屋齡由低到高、使照戶數與已揭露成交戶別由多到少；缺值一律置後，同值依名稱、行政區與來源識別碼穩定排序。使照戶數依官方使用執照登載資料，非現況普查；成交戶別按本類型、期間的完整門牌去重。部分案件另用 114 年市府門牌表與逐筆地號核對，明細會標明來源。歷年各用途成交按官方交易編號去重，含住宅、店面與用途待核。</p><h3>怎麼計算均價</h3><ol><li>依行政區、正式名冊門牌比對。交易只填街路時使用該筆官方行政區欄。已核對使照的個案可逐筆以交易編號連到土地明細，並驗證單一地號、建物、完工日及總樓層。</li><li>主值是可比成交單價的算術平均；中位數作輔助。均價不是總價合計除以總坪數。</li><li>車位缺漏、特殊交易及其他排除原因保留於逐筆明細；1–4 筆真實可比成交另標「少量成交均價」，樣本少，僅供個案參考；0 筆才顯示「資料不足，不推估」。少量參考不計入可比行情數。</li><li>近 12／36 月採固定快照日期往前計算；101/08/01 起歷史混合不同市況，明示非當期行情。</li></ol><h3>每個行政區都可以查</h3><div class="table-scroll"><table><thead><tr><th>行政區</th><th>名冊</th><th>可定位</th><th>至少 5 筆</th><th>1–4 筆</th><th>無可比成交</th></tr></thead><tbody>${districtTable}</tbody></table></div><h3>地圖與建築圖示</h3><p>37 區的範圍取自內政部「鄉鎮市區界線」，採 Taiwan Atlas 的簡化圖形。圖形供區域探索，地籍界址請以測量成果為準。${link('https://data.gov.tw/dataset/7441','內政部區界資料')}${link('https://cdn.jsdelivr.net/npm/taiwan-atlas@2020.9.20/towns-10t.json','對照圖檔')}<br>北向上投影，以 cos(23°) 校正經度比例。區塊顏色表示名冊數量密度，與房價無關。社區依圖台或門牌座標標示；採主門牌或鄰近門牌推估的位置會在資訊卡註明。建築依 1–5、6–14、15 樓以上示意不同輪廓；缺樓層採中性圖示，不代表實測外型、實際高度或社區範圍。聚合數字包含全部對應名冊，點選可分頁查看全部。</p><h3>生活內容與回饋</h3><p>${lifeCount()} 則地方內容及 ${directoryCount()} 個官方活動查詢入口，各篇附來源與查閱日期。官方活動入口不代表當期有活動；未有可信座標者不猜測位置。可使用社區或內容的「補充／回報」提供修正。</p><h3>來源與逐批日期區間</h3><p class="help">以下為來源批次原始日期範圍，可能含已排除的異常日期；不等同本產品可比統計範圍。</p><div class="table-scroll"><table><thead><tr><th>來源批次</th><th>原始最早日期</th><th>原始最新日期</th><th>用途</th></tr></thead><tbody>${(meta.sources||[]).map(s=>`<tr><td>${link(s.url,s.label||s.url)}</td><td>${esc(s.dateMin||'—')}</td><td>${esc(s.dateMax||'—')}</td><td>${s.usedForStatistics===true?'實價統計':s.usedForStatistics===false?'留存來源審計':'名冊來源'}</td></tr>`).join('')}</tbody></table></div><h3>使用紀錄</h3><p>此公開版本不啟用訪客事件收集，也不顯示累積人數。回饋可複製或下載，再由使用者自行前往安心城正式回饋入口送出。</p><p class="help">這是可查證的資料快照，非即時行情、銀行鑑價或估價報告；個別交易仍須核對原始申報與物件條件。</p>`);
  };
  $('closeDialog').onclick=()=>$('infoDialog').close();$('infoDialog').onclick=e=>{if(e.target===$('infoDialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();}};
  function updateSearch(){
    query=$('search').value.trim().toLocaleLowerCase();
    queryTerms=query.split(/\s+/).map(t=>normSearch(t).replace(/^台南市?/, '')).filter(Boolean);
    page=1;
    $('clearSearch').hidden=!query;
    if(viewMode!=='market') setMode('market'); else renderList();
    const box=$('searchResults');
    box.hidden=!query;
    if(!query){box.replaceChildren();return;}
    const matches=listPool().sort(compareCommunities);
    const life=lifeItems.filter(c=>(c.title+' '+c.district+' '+c.summary).toLocaleLowerCase().includes(query));
    box.innerHTML=matches.slice(0,3).map(c=>`<button type="button" data-quick-community="${esc(c.id)}"><strong>${esc(c.name)}</strong><small>${esc(c.district)} →</small></button>`).join('')+
      (matches.length?`<a href="#communityList">看全部 ${num(matches.length)} 個符合社區 ↓</a>`:'<p>社區名冊找不到這個名稱，可繼續查官方成交。</p>')+
      '<div class="search-official"><button type="button" id="searchMarket">查路段買賣成交 →</button><button type="button" id="searchPresale">找預售建案成交 →</button></div>'+
      life.slice(0,2).map(c=>`<button type="button" data-life="${esc(c.id)}">生活 · ${esc(c.title)}</button>`).join('');
    box.querySelectorAll('[data-quick-community]').forEach(b=>b.onclick=()=>selectCommunity(b.dataset.quickCommunity));
    $('searchMarket').onclick=()=>openMarket('',$('search').value.trim());
    $('searchPresale').onclick=()=>openMarket('',$('search').value.trim(),'presale');
    box.querySelectorAll('[data-life]').forEach(b=>b.onclick=()=>openLife(b.dataset.life));
  }
  $('search').oninput=()=>{clearTimeout(searchTimer);searchTimer=setTimeout(updateSearch,100);};$('search').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();clearTimeout(searchTimer);updateSearch();$('search').blur();}if(e.key==='Escape')$('searchResults').hidden=true;};$('clearSearch').onclick=()=>{$('search').value='';updateSearch();};
  $('periodSelect').onchange=e=>applyMarketFilter('period',e.target.value);$('categorySelect').onchange=e=>applyMarketFilter('category',e.target.value);
  $('kindSelect').onchange=e=>{kind=e.target.value;page=1;renderList();renderPins();};$('sortSelect').onchange=e=>applyMarketFilter('sort',e.target.value);$('sortSelect').querySelector('[value="households"]').disabled=!householdAvailable;
  [...districts].sort((a,b)=>a.name.localeCompare(b.name,'zh-TW')).forEach(d=>{const option=document.createElement('option');option.value=d.name;option.textContent=`${d.name} · 名冊 ${num(counts(d.name))}`;$('districtSelect').append(option);});
  $('districtSelect').onchange=e=>chooseDistrict(e.target.value);
  $('districtShortcuts').innerHTML=['善化區','安南區','永康區','東區','北區','安平區'].map(name=>`<button data-name="${name}" class="${name==='善化區'?'shanhua-shortcut':''}">${name==='善化區'?'先看善化':name}<span>${num(counts(name))}</span></button>`).join('');$('districtShortcuts').querySelectorAll('button').forEach(el=>el.onclick=()=>chooseDistrict(el.dataset.name));
  $('backToCity').onclick=()=>chooseDistrict('');document.querySelector('.brand').onclick=e=>{e.preventDefault();guide.select('price','');};
  $('modeButton').onclick=()=>{const flat=document.body.classList.toggle('flat');$('modeButton').textContent=flat?'平面圖示':'立體圖示';$('modeButton').setAttribute('aria-pressed',String(!flat));};
  function zoom(factor,at){cancelAnimationFrame(animation);const width=Math.max(.8,Math.min(1800,camera[2]*factor)),f=width/camera[2],p=at||[camera[0]+camera[2]/2,camera[1]+camera[3]/2];fly([p[0]-(p[0]-camera[0])*f,p[1]-(p[1]-camera[1])*f,width,camera[3]*f]);}
  $('zoomIn').onclick=()=>zoom(.62);$('zoomOut').onclick=()=>zoom(1.55);
  const svg=$('mapSvg'),mapPoint=e=>{const p=svg.createSVGPoint();p.x=e.clientX;p.y=e.clientY;return p.matrixTransform(svg.getScreenCTM().inverse());};
  svg.addEventListener('wheel',e=>{e.preventDefault();const p=mapPoint(e);zoom(e.deltaY>0?1.25:.8,[p.x,p.y]);},{passive:false});
  svg.addEventListener('pointerdown',e=>{if(e.button!==0||e.pointerType==='touch')return;cancelAnimationFrame(animation);drag={x:e.clientX,y:e.clientY,origin:[...camera]};dragged=false;});
  svg.addEventListener('pointermove',e=>{if(!drag)return;if(Math.abs(e.clientX-drag.x)+Math.abs(e.clientY-drag.y)>6){dragged=true;svg.setPointerCapture(e.pointerId);}if(dragged){const m=svg.getScreenCTM();camera=[drag.origin[0]-(e.clientX-drag.x)/m.a,drag.origin[1]-(e.clientY-drag.y)/m.d,drag.origin[2],drag.origin[3]];syncCamera();}});
  const endDrag=()=>{if(drag&&dragged){renderPins();renderDistrictBadges();}drag=null;setTimeout(()=>{dragged=false;},80);};svg.addEventListener('pointerup',endDrag);svg.addEventListener('pointercancel',endDrag);window.addEventListener('pointerup',endDrag);
  $('asOf').textContent=meta.asOf||'未提供';window.addEventListener('resize',()=>{clearTimeout(renderTimer);renderTimer=setTimeout(()=>{syncCamera();renderPins();renderDistrictBadges();},150);});
  function revealLife(){if(matchMedia('(max-width:900px)').matches)$('lifePanel').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth',block:'start'});else $('lifePanel').scrollIntoView({behavior:'smooth',block:'nearest'});}
  function feedback(context){if(window.MapFeedback?.open)window.MapFeedback.open(context);else openDialog('回饋暫時無法開啟','<p>回饋元件尚未載入，請重新整理後再試。</p>');}
  function closeLife(){$('lifeDetail').hidden=true;if($('detail').hidden)document.body.classList.remove('detail-open');}
  function setMode(mode){viewMode=mode;$('lifePanel').hidden=mode!=='life';$('marketPanel').hidden=mode!=='market';['life','market'].forEach(key=>{$(key+'Mode').classList.toggle('active',mode===key);$(key+'Mode').setAttribute('aria-pressed',String(mode===key));});if(mode==='life')closeDetail();else closeLife();renderList();}
  function taipeiToday() {const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());return ['year','month','day'].map(key=>parts.find(p=>p.type===key).value).join('-');}
  function eventPhase(item, today) {
    if (item.kind === 'event-directory') return 'directory';
    if (item.endDate && item.endDate < today) return 'past';
    if (item.startDate && item.startDate > today) return 'upcoming';
    return item.startDate && item.endDate ? 'current' : 'undated';
  }
  function eventStatus(item, today = taipeiToday()) {
    if (item.category !== 'events') return '';
    const registration = item.eventType === 'registration-window';
    return {
      current: registration ? '報名期間' : '進行中',
      upcoming: registration ? '尚未開放報名' : '尚未開始',
      directory: '官方活動查詢',
      undated: '活動日期待確認',
      past: registration ? '報名已截止' : '已結束'
    }[eventPhase(item, today)];
  }
  function sortEvents(items, today) {
    const order = ['current', 'upcoming', 'directory', 'undated', 'past'];
    items.sort((a, b) => {
      const phase = eventPhase(a, today);
      const priority = order.indexOf(phase) - order.indexOf(eventPhase(b, today));
      if (priority) return priority;
      if (phase === 'current') return a.endDate.localeCompare(b.endDate);
      if (phase === 'upcoming') return a.startDate.localeCompare(b.startDate);
      if (phase === 'past') return b.endDate.localeCompare(a.endDate);
      return 0;
    });
  }
  function sourceDates(item) {return [item.verifiedAt?'資料核對：'+esc(item.verifiedAt):'',item.sourceCheckedAt?'來源查閱：'+esc(item.sourceCheckedAt):''].filter(Boolean).join(' · ') || '來源查閱日期未提供';}
  function renderLife() {const pool=lifeItems.filter(item=>!district||item.district===district), shown=pool.filter(item=>category==='all'||item.category===category);
    const today = taipeiToday();
    if (category === 'events') sortEvents(shown, today);
    $('categoryChips').innerHTML=[['all','全部'],...Object.entries(categories)].map(([key,label])=>'<button class="category-chip '+(key===category?'active':'')+'" data-category="'+key+'" aria-pressed="'+(key===category)+'">'+label+'<span>'+(key==='all'?pool.length:pool.filter(i=>i.category===key).length)+'</span></button>').join('');$('categoryChips').querySelectorAll('button').forEach(el=>el.onclick=()=>{category=el.dataset.category;renderLife();});$('lifeList').innerHTML=(category==='events'?'<p class="event-counts">'+shown.filter(i=>i.kind==='event').length+' 則活動／報名紀錄 · '+shown.filter(i=>i.kind==='event-directory').length+' 個官方查詢入口</p>':'')+shown.map(item=>'<article class="life-card" data-id="'+esc(item.id)+'"><div class="life-art life-art-'+esc(item.category)+'">'+lifeArt(item.category)+'</div><div class="life-card-meta"><span>'+esc(item.district)+' / '+(categories[item.category]||'生活')+'</span>'+(eventStatus(item,today)?'<span class="event-status">'+eventStatus(item,today)+'</span>':'')+'</div><h3><button class="read-life" data-id="'+esc(item.id)+'">'+esc(item.title)+'</button></h3><p>'+esc(item.summary)+'</p><div class="life-card-source">'+link(item.sourceUrl,item.sourceLabel||'資料來源')+'<p class="source-date">'+sourceDates(item)+'</p></div><div class="life-card-actions"><button class="read-life" data-id="'+esc(item.id)+'">詳讀 ↗</button><button class="report-life" data-id="'+esc(item.id)+'">補充／回報</button></div></article>').join('') || '<p class="empty">本區這個分類尚待補充；可切換其他分類，或給我們回饋。</p>';$('lifeList').querySelectorAll('.read-life').forEach(el=>el.onclick=()=>openLife(el.dataset.id));$('lifeList').querySelectorAll('.report-life').forEach(el=>el.onclick=()=>{const item=lifeItems.find(i=>i.id===el.dataset.id);feedback({district:item.district,contentId:item.id});});}
  function openLife(id) {const item=lifeItems.find(i=>i.id===id);if(!item)return;if(district!==item.district)chooseDistrict(item.district);setMode('life');$('searchResults').hidden=true;$('lifeDetail').hidden=false;document.body.classList.add('detail-open');$('lifeDetail').innerHTML='<div class="detail-toolbar"><span>生活內容</span><button id="closeLife" class="detail-close" aria-label="關閉生活內容">關閉 ×</button></div><span class="detail-kicker">'+esc(item.district)+' / '+(categories[item.category]||'生活')+'</span><h2>'+esc(item.title)+'</h2>'+(eventStatus(item)?'<p class="event-status">'+eventStatus(item)+'</p>':'')+'<p class="life-reading">'+esc(item.summary)+'</p>'+(item.kind==='event'?'<p>'+esc(item.eventType==='registration-window'?'報名期間':(item.dateLabel||'活動日期'))+'：'+esc(item.startDate||'未提供')+' 至 '+esc(item.endDate||'未提供')+'<br><small>狀態判定基準：'+taipeiToday()+'</small></p>':'')+(item.kind==='event-directory'?'<p class="life-note">這是官方活動查詢入口，請開啟來源確認最新場次、日期及報名條件。</p>':'')+(item.caution?'<p class="life-note">'+esc(item.caution)+'</p>':'')+(item.verificationNote?'<p class="life-note">來源確認限制：'+esc(item.verificationNote)+'</p>':'')+'<section class="detail-section"><h3>沿著來源繼續讀</h3>'+link(item.sourceUrl,item.sourceLabel||'查看原始來源')+'<p>'+sourceDates(item)+'</p><p class="help">'+(located(item)?'內容附有資料座標；請以官方現場資訊確認出入口。':'這是一則區域生活內容，未以推測座標在地圖上標點。')+'</p></section><button id="lifeFeedback" class="full primary">補充／回報這篇內容</button>';$('closeLife').onclick=closeLife;$('lifeFeedback').onclick=()=>feedback({district:item.district,contentId:item.id});track('life_open',id);}
  function showLegacy(initialQuery=''){
    openDialog('舊圖台待核名冊｜獨立補充',`<p>共 ${num(legacyCommunities.length)} 筆尚未確認對應最新工務局清冊的來源紀錄。不列入 ${num(communities.length)} 筆主目錄，也不提供未核對行情；保留名稱、門牌與來源供補查。</p><input id="legacySearch" class="legacy-search" type="search" aria-label="搜尋舊圖台待核名冊" placeholder="搜尋舊名冊名稱、行政區、門牌" value="${esc(initialQuery)}"><div id="legacyList" class="nearby-list"></div><nav id="legacyPager" class="pager"></nav>`);
    let legacyPage=1;
    const paint=()=>{const q=$('legacySearch').value.trim().toLocaleLowerCase(),items=legacyCommunities.filter(c=>`${c.name} ${c.district} ${c.address}`.toLocaleLowerCase().includes(q)),pages=Math.max(1,Math.ceil(items.length/PAGE_SIZE));legacyPage=Math.min(legacyPage,pages);$('legacyList').innerHTML=items.slice((legacyPage-1)*PAGE_SIZE,legacyPage*PAGE_SIZE).map(c=>`<article class="life-card"><div class="life-card-meta">${esc(c.district)} · 舊圖台待核</div><h3>${esc(c.name)}</h3><p>${esc(c.address||'門牌待核')}</p><p class="legacy-note">${valid(c.floors)?esc(c.floors)+' 樓':'樓層待核'} · ${located(c)?'有來源座標':'待補座標'}<br>尚未確認與最新清冊的對應關係，不以相似名稱合併。</p>${link(c.sourceUrl,'查看原始名冊來源')}</article>`).join('')||'<p class="empty">這個關鍵字沒有待核名冊結果。</p>';$('legacyPager').innerHTML=`<button id="legacyPrev" ${legacyPage===1?'disabled':''}>上一頁</button><span>${num(items.length)} 筆 · 第 ${legacyPage} / ${pages} 頁</span><button id="legacyNext" ${legacyPage===pages?'disabled':''}>下一頁</button>`;$('legacyPrev').onclick=()=>{legacyPage--;paint();};$('legacyNext').onclick=()=>{legacyPage++;paint();};};
    $('legacySearch').oninput=()=>{legacyPage=1;paint();};paint();
  }
  $('legacyButton').textContent=`另查舊圖台待核名冊 ${num(legacyCommunities.length)} 筆 ↗`;$('legacyButton').onclick=()=>showLegacy(query);
  $('catalogNote').textContent=`名冊與交易分開呈現；本類型無樣本的社區仍完整保留。每頁 ${PAGE_SIZE} 筆，可翻頁查閱全部。實價登錄連結為官方首頁，複製門牌後自行查詢。`; 
  $('lifeMode').onclick=()=>{setMode('life');renderLife();};$('marketMode').onclick=()=>setMode('market');$('northStart').onclick=()=>{chooseDistrict('北區');setMode('life');revealLife();};$('readDistrictLife').onclick=()=>{if(!district)chooseDistrict('北區');setMode('life');revealLife();};$('feedbackButton').onclick=()=>feedback({district});
  if (window.CityScene && features.length) {
    $('cityScene').hidden=false;
    try {
      cityController=window.CityScene.mount($('cityScene'),{features,counts:Object.fromEntries([...byDistrict].map(([name,items])=>[name,items.length])),onDistrict:pickMapDistrict});
    } catch { $('cityScene').hidden=true; }
  }
  $('showCityScene').onclick=()=>{preferCityScene=true;syncCityView();updateSummary();};
  $('showPlanMap').onclick=()=>{preferCityScene=false;syncCityView();updateSummary();};
  guide=window.AtlasGuide.mount({
    districts:features.map(f=>f.properties.name),
    openPrices(name,keepLayer){
      if(district!==name) chooseDistrict(name);
      if(!keepLayer && cityController?.getLayer()!=='registry') cityController?.setLayer('registry');
      if(viewMode!=='market') setMode('market');
      updateSummary();
    },
    showCity(layer){
      preferCityScene=true;
      if(district) chooseDistrict(''); else syncCityView();
      cityController?.setLayer(layer);
    },
    mapDistrict(name){
      if(district!==name) chooseDistrict(name);
      if(!name && cityController?.getLayer()==='population')cityController.setLayer('registry');
      guideMapCaption();
    },
    highlightPopulation(name){cityController?.highlightDistrict?.(name);guideMapCaption();}
  });
  $('cityScene').addEventListener('city-layer-change',e=>{
    guide.layerChanged(e.detail.layer);
    updateSummary();
  });
  const menu=$('atlasMenu');
  function closeMenu(){menu.setAttribute('aria-expanded','false');}
  menu.onclick=()=>menu.setAttribute('aria-expanded',String(menu.getAttribute('aria-expanded')!=='true'));
  $('atlasActions').addEventListener('click',closeMenu);
  document.addEventListener('click',e=>{if(!e.target.closest('.masthead')) closeMenu();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape' && menu.getAttribute('aria-expanded')==='true'){closeMenu();menu.focus();}});
  const sample=byId.get('community-registry-1353');
  if(sample){
    $('studioSample').hidden=false;
    $('studioSample').querySelector('strong').textContent=sample.name+' ↗';
    $('studioSample').onclick=()=>{selectCommunity(sample.id);showBuilding(sample,new URLSearchParams({panel:'gaps'}));};
  }
  renderMap();chooseDistrict('');renderCompare();
  const entry = new URLSearchParams(location.search);
  const target = byId.get(entry.get('community'));
  if (target && ['floors','building'].includes(entry.get('view'))) {
    const categoryParam = entry.get('category');
    if (Object.hasOwn(marketCategories, categoryParam)) marketCategory = categoryParam;
    if (['12m','36m'].includes(entry.get('period'))) period = entry.get('period');
    $('categorySelect').value = marketCategory;
    $('periodSelect').value = period;
    selectCommunity(target.id);
    if(entry.get('view')==='building') showBuilding(target,entry);
    else showFloorSales(target);
  } else if (target && entry.get('view') === 'environment') {
    selectCommunity(target.id);
    showEnvironment(target,entry);
  } else if (target && !entry.has('view')) {
    selectCommunity(target.id);
  } else if (entry.get('view')==='market') {
    openMarket(entry.get('district')||'',entry.get('q')||'',entry.get('market')==='presale'?'presale':'sale');
  } else if (entry.get('layer')==='population' || entry.get('task')==='population') {
    guide.select('population',entry.get('district'));
  } else if (entry.get('topic')==='story') {
    guide.select('story',entry.get('district'));
  } else if (features.some(f=>f.properties.name===entry.get('district'))) {
    guide.select('price',entry.get('district'));
  }
})();

window.catalogLoaded();
}).catch(error=>window.catalogLoadFailed(error));
