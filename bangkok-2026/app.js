/* Bangkok, Your Way — GitHub Pages 版。無框架、無追蹤碼、不需 API key。 */
(() => {
'use strict';
const D=window.BKK_DATA;
if(!D){document.getElementById('app').textContent='資料載入失敗：請確認 data.js 已與 index.html 放在同一層。';return;}
const $=(s)=>document.querySelector(s);
const $$=(s)=>Array.from(document.querySelectorAll(s));
const esc=(x)=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=(n)=>Number(n||0).toLocaleString('en-US');
const poiMap=new Map(D.pois.map(x=>[x.id,x]));
const zoneMap=D.zones;
const appKey='bkk_2026_personal_v7';
const groupKey='bkk_2026_my_group_v7';
let state={version:7,name:'',plan:[],custom:{},day:'2',plannerDay:'2',filter:{day:'2',zone:'all',cat:'all',period:'all',q:''}};
let localGroup={n:'01',name:'',d2:'',d3:'',d4:'',j:'maybe',t:'no',dn:'open',prefs:[],note:''};
let remoteRecords=[];
let remoteReady=false, mapInstance=null, mapMarkers=null, toastTimer=0, jsonpSeq=0;
const groupUrl=(window.BKK_CONFIG&&window.BKK_CONFIG.syncEndpoint||'').trim();
const dayOf=id=>D.days.find(x=>x.id===String(id));
const duration=p=>String(p.duration||'30–60 分');
const price=p=>p.min===0&&p.max===0?'免費／不含消費':(p.min===p.max?`฿${fmt(p.min)}`:`฿${fmt(p.min)}–${fmt(p.max)}`);
const gsearch=q=>'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(q);
const gdir=(origin, destination, mode='driving')=>'https://www.google.com/maps/dir/?api=1&'+new URLSearchParams({api:'1',origin,destination,travelmode:mode}).toString();
const sameDay=x=>String(x.day||'')===String(state.plannerDay);
function safeStore(key,obj){try{localStorage.setItem(key,JSON.stringify(obj));}catch(e){toast('瀏覽器無法儲存，建議匯出 JSON 備份。');}}
function restore(){
 try{let s=JSON.parse(localStorage.getItem(appKey)||'null'); if(s&&s.version===7){state={...state,...s,filter:{...state.filter,...s.filter},plan:Array.isArray(s.plan)?s.plan.slice(0,150):[],custom:s.custom&&typeof s.custom==='object'?s.custom:{}};}}catch(e){}
 try{let g=JSON.parse(localStorage.getItem(groupKey)||'null');if(g&&typeof g==='object'){localGroup={...localGroup,...g}}}catch(e){}
}
function save(){safeStore(appKey,state);$('#nav-count').textContent=String(state.plan.length);}
function saveGroup(){safeStore(groupKey,localGroup)}
function toast(msg){const el=$('#toast');el.textContent=msg;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),3300)}
function switchView(view){
 if(!['overview','days','explore','planner','group','map'].includes(view))return;
 $$('.view').forEach(x=>x.classList.toggle('active',x.id==='view-'+view));
 $$('[data-nav]').filter(x=>x.classList.contains('nav-btn')).forEach(x=>x.classList.toggle('active',x.dataset.nav===view));
 if(view==='overview')renderOverview();
 if(view==='days')renderDays();
 if(view==='explore')renderExplore();
 if(view==='planner')renderPlanner();
 if(view==='group')renderGroup();
 if(view==='map')renderMap();
 window.scrollTo({top:0,behavior:'smooth'});
}
function openDay(day){state.day=String(day);save();switchView('days')}
function exploreZone(zone,day='all',cat='all'){
 state.filter={...state.filter,day:String(day),zone,cat,period:'all',q:''};save();
 switchView('explore');syncFilterInputs();renderExplore();
}
function initOverview(){
 const metrics=[['14','位成人，自主選擇'],['5','天 4 夜'],['2','間住宿基地'],[String(D.packages.length),'條分流半日路線'],[String(D.pois.length),'個吃喝遊玩選項']];
 $('#overview-metrics').innerHTML=metrics.map(([num,lab])=>`<div class="metric"><strong>${esc(num)}</strong><small>${esc(lab)}</small></div>`).join('');
}
function renderOverview(){
 $('#overview-days').innerHTML=D.days.map(d=>{
 const strs=d.events.slice(0,5).map(e=>`<li><b>${esc(e[0])}</b> ${esc(e[1])}</li>`).join('');
 return `<article class="overview-day"><div class="day-top"><span>DAY 0${d.id} · ${esc(d.date)}</span><h3>${esc(d.title)}</h3></div><div class="day-body"><p>${esc(d.tag)}</p><ul>${strs}</ul></div><div class="day-foot"><button class="btn btn--small btn--outline" data-action="day" data-day="${d.id}">看這天怎麼玩 →</button></div></article>`;
 }).join('');
}
function dayButton(d,active){return `<button class="${d.id===active?'active':''}" data-action="daySelect" data-day="${d.id}"><b>12/${d.id}</b><span>${['二','三','四','五','六'][Number(d.id)-1]} · DAY 0${d.id}</span></button>`}
function renderDays(){
 $('#day-switch').innerHTML=D.days.map(d=>dayButton(d,state.day)).join('');
 const d=dayOf(state.day), pkgs=D.packages.filter(p=>p.day===d.id), nearby=[...new Set([d.zone,...pkgs.map(x=>x.zone)])];
 const timeline=d.events.map(e=>`<div class="timeline-item"><span class="timeline-time">${esc(e[0])}</span><span class="timeline-dot"></span><div><b>${esc(e[1])}</b><small>${esc(e[2])} · <span class="loc">${esc(zoneMap[e[3]]?.label||'')}</span></small></div></div>`).join('');
 let packages='';
 if(pkgs.length){packages=`<div class="area-block"><div class="area-block-head"><h3>下午怎麼分流？${pkgs.length} 條路線自由選</h3><span class="counter-label">任選 / 不必全參加</span></div><div class="package-grid">${pkgs.map(p=>{
 return `<article class="package"><div class="package__top"><span class="package__id">${esc(p.id)} 路線</span><span class="package__window">${esc(p.window)}</span></div><h3>${esc(p.name)}</h3><p>${esc(p.detail)}</p><p><b>集合：</b>${esc(p.meet)}</p><p class="package__cost">${esc(p.budget)}</p><div class="package-footer"><button class="btn btn--small btn--dark" data-action="addPackage" data-pkg="${p.id}">＋加入這條線</button><button class="btn btn--small btn--outline" data-action="openZone" data-zone="${p.zone}" data-day="${d.id}">看附近店家</button></div></article>`}).join('')}</div></div>`}
 const areas=nearby.map(z=>{const items=D.pois.filter(p=>p.day===d.id&&p.zone===z).slice(0,3);if(!items.length)return '';return `<div class="area-block"><div class="area-block-head"><h3>${esc(zoneMap[z].label)} · 附近可選</h3><button class="text-button" data-action="openZone" data-zone="${z}" data-day="${d.id}">這區全部選項 →</button></div><div class="area-picks">${items.map(p=>`<div class="small-pick"><b>${esc(p.name)}</b><small>${esc(p.category)} · ${price(p)} · ${esc(duration(p))}</small><button data-action="add" data-id="${p.id}" data-day="${d.id}">＋加入個人行程</button></div>`).join('')}</div></div>`}).join('');
 $('#day-content').innerHTML=`<div class="day-layout"><div class="day-panel"><p class="eyebrow">DAY 0${d.id} · ${esc(d.date)}</p><h2 class="day-hero-title">${esc(d.title)}</h2><p class="subtitle">${esc(d.tag)}</p><div class="timeline">${timeline}</div><div class="day-warning"><b>重要提醒</b>${esc(d.warning)}</div></div><aside><div class="aside-card"><p class="eyebrow">MEETING / 會合方式</p><h3>什麼時候要一起？</h3><p>${esc(d.meet)}</p><p class="microcopy">需精確指定的車輛、入口與聯絡窗口，仍待主揪在群組正式公告。</p></div><div class="aside-card"><p class="eyebrow">HOTEL / 住宿</p><h3>${esc(d.hotel)}</h3><a class="subtle-link" href="${esc(gsearch(d.hotel+' Bangkok'))}" target="_blank" rel="noopener">Google Maps 飯店導航 ↗</a></div><div class="aside-card"><p class="eyebrow">FLEXIBILITY</p><h3>不想走大部隊？</h3><p>只要知道接送窗口與晚上是否需要集合，就能改走附近的支線。不喜歡的行程不用勉強參加。</p><button class="btn btn--small btn--outline" data-action="openZone" data-zone="${d.zone}" data-day="${d.id}">從這區開始找玩法</button></div></aside></div>${packages}${areas}`;
}
function filterOptions(){
 $('#filter-day').innerHTML='<option value="all">所有日期</option>'+D.days.map(d=>`<option value="${d.id}">${esc(d.date)} · DAY ${d.id}</option>`).join('');
 $('#filter-zone').innerHTML='<option value="all">所有區域</option>'+Object.entries(zoneMap).map(([k,z])=>`<option value="${k}">${esc(z.label)}</option>`).join('');
 const cats=[...new Set(D.pois.map(x=>x.category))].sort((a,b)=>a.localeCompare(b,'zh-Hant'));
 $('#filter-cat').innerHTML='<option value="all">所有興趣</option>'+cats.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join('');
 const periods=['上午','午餐','下午','晚餐','夜間'];
 $('#filter-period').innerHTML='<option value="all">全天時段</option>'+periods.map(x=>`<option value="${x}">${x}</option>`).join('');
 syncFilterInputs();
}
function syncFilterInputs(){
 $('#filter-day').value=state.filter.day||'all';$('#filter-zone').value=state.filter.zone||'all';$('#filter-cat').value=state.filter.cat||'all';$('#filter-period').value=state.filter.period||'all';$('#filter-search').value=state.filter.q||'';
}
function poiCard(p){
 const already=state.plan.some(s=>s.day===p.day&&s.poiId===p.id);
 const q=zoneMap[p.zone]?.near||'Bangkok';
 const link=gdir(q,p.query);
 return `<article class="poi-card" id="poi-${p.id}"><div class="poi-meta"><span class="pill">${esc(p.category)}</span><span class="pill pill--gold">12/${p.day} · ${esc(p.period)}</span><span class="pill pill--gray">${esc(zoneMap[p.zone]?.label||p.zone)}</span></div><h3>${esc(p.name)}</h3><p class="description">${esc(p.description)}</p><dl class="facts"><div><dt>預估／官方票價</dt><dd><b>${price(p)}</b> <small>${esc(p.priceType)}</small></dd></div><div><dt>建議停留</dt><dd>${esc(duration(p))}</dd></div><div><dt>移動與附近關係</dt><dd>${esc(p.travel)}</dd></div>${p.time?`<div><dt>建議時間</dt><dd>${esc(p.time)}</dd></div>`:''}</dl><div class="poi-actions"><button class="btn ${already?'btn--light':'btn--dark'}" data-action="${already?'removePoi':'add'}" data-id="${p.id}" data-day="${p.day}">${already?'✓ 已加入／移除':'＋ 加入我的行程'}</button><a class="btn btn--outline" href="${esc(link)}" target="_blank" rel="noopener">Google 導航 ↗</a></div><div class="stop-footer"><button class="text-button" data-action="openZone" data-zone="${p.zone}" data-day="${p.day}">查看這區其他玩法</button>${p.official?`<a class="subtle-link" href="${esc(p.official)}" target="_blank" rel="noopener">官方資訊 ↗</a>`:''}</div></article>`;
}
function renderExplore(){
 const f=state.filter;
 let matches=D.pois.filter(p=> (f.day==='all'||p.day===f.day)&&(f.zone==='all'||p.zone===f.zone)&&(f.cat==='all'||p.category===f.cat)&&(f.period==='all'||p.period===f.period)&&(!f.q||[p.name,p.description,p.category,zoneMap[p.zone]?.label].join(' ').toLowerCase().includes(f.q.toLowerCase())));
 matches.sort((a,b)=>Number(a.day)-Number(b.day)||b.rank-a.rank||a.name.localeCompare(b.name,'zh-Hant'));
 $('#explore-total').textContent=`找到 ${matches.length} 個選項`;
 $('#explore-cards').innerHTML=matches.map(poiCard).join('');
 $('#explore-empty').hidden=matches.length!==0;
 const zone=f.zone!=='all'?zoneMap[f.zone]:null;
 $('#zone-context').hidden=!zone;
 if(zone)$('#zone-context').innerHTML=`<strong>${esc(zone.label)}：${esc(zone.sub)}</strong><p>${esc(zone.tip)} 從其他區域來此請預留足夠車程；精確路線請按個別 Google Maps 導航。</p>`;
}
function guessTime(p){if(p.time&&/^\d{2}:\d{2}$/.test(p.time))return p.time;return {'上午':'09:30','午餐':'12:30','下午':'14:30','晚餐':'18:30','夜間':'21:00'}[p.period]||'14:30'}
function addPoi(id,day){
 const p=poiMap.get(id);if(!p)return;
 const d=String(day||p.day);
 if(state.plan.some(s=>s.poiId===id&&s.day===d)){toast('這個景點已在這一天的個人行程內。');return;}
 state.plan.push({uid:'p'+Date.now().toString(36)+Math.random().toString(36).slice(2,6),poiId:id,day:d,time:guessTime(p),note:''});save();toast(`已加入 12/${d}：${p.name}`);
 if($('#view-explore').classList.contains('active'))renderExplore();if($('#view-planner').classList.contains('active'))renderPlanner();
}
function removePoi(id,day){let i=state.plan.findIndex(s=>s.poiId===id&&s.day===String(day));if(i>=0){state.plan.splice(i,1);save();toast('已從個人行程移除');if($('#view-explore').classList.contains('active'))renderExplore();if($('#view-planner').classList.contains('active'))renderPlanner();}}
function addPackage(id){let p=D.packages.find(x=>x.id===id);if(!p)return;let added=0;for(let pid of p.items){if(!state.plan.some(s=>s.day===p.day&&s.poiId===pid)){let item=poiMap.get(pid);if(!item)continue;state.plan.push({uid:'p'+Date.now().toString(36)+Math.random().toString(36).slice(2,6),poiId:pid,day:p.day,time:guessTime(item),note:''});added++}}state.plannerDay=p.day;save();toast(`已加入「${p.name}」${added} 個景點；可在我的行程調整時間。`);switchView('planner')}
function resolveStop(s){const p=poiMap.get(s.poiId)||state.custom[s.poiId];return p?{...p,...s}:null;}
function getDayStops(day){return state.plan.filter(s=>s.day===String(day)).map(resolveStop).filter(Boolean)}
function calcBudget(stops){let min=0,max=0;stops.forEach(x=>{min+=Number(x.min||0);max+=Number(x.max||0)});return [min,max]}
function rearrange(uid,delta){let index=state.plan.findIndex(s=>s.uid===uid);if(index<0)return;let current=state.plan[index], list=state.plan.filter(s=>s.day===current.day);let pos=list.findIndex(s=>s.uid===uid),next=list[pos+delta];if(!next)return;let other=state.plan.indexOf(next);[state.plan[index],state.plan[other]]=[state.plan[other],state.plan[index]];save();renderPlanner()}
function removeStop(uid){state.plan=state.plan.filter(s=>s.uid!==uid);save();renderPlanner();}
function routeUrls(stops,day){
 const d=dayOf(day),hotel=(day==='1'||day==='2'||day==='3')?'Craftsman Bangkok':'Ascott Thonglor Bangkok';
 const queries=stops.map(x=>x.query||x.name).filter(Boolean);
 if(!queries.length)return [];
 const urls=[];
 // Google Maps URL on mobile should have at most 3 waypoints, so segment at most 4 destinations.
 let origin=hotel;
 for(let i=0;i<queries.length;i+=4){let chunk=queries.slice(i,i+4),dest=chunk[chunk.length-1],params={api:'1',origin,destination:dest,travelmode:'driving'};if(chunk.length>1)params.waypoints=chunk.slice(0,-1).join('|');urls.push('https://www.google.com/maps/dir/?'+new URLSearchParams(params).toString());origin=dest;}
 return urls;
}
function renderPlanner(){
 $('#planner-switch').innerHTML=D.days.map(d=>`<button data-action="plannerDay" data-day="${d.id}" class="${d.id===state.plannerDay?'active':''}"><b>12/${d.id}</b><span>已選 ${getDayStops(d.id).length} 個</span></button>`).join('');
 $('#planner-name').value=state.name;
 const stops=getDayStops(state.plannerDay);
 const content=stops.length?stops.map((p,i)=>`<article class="selected-stop"><div class="stop-order">${i+1}</div><div><h3>${esc(p.name)}</h3><p>${esc(zoneMap[p.zone]?.label||'自訂地點')} · ${price(p)} · ${esc(p.duration||'自訂')}</p><div class="stop-fields"><label>時間<input type="time" data-stop-time="${esc(p.uid)}" value="${esc(p.time||'14:30')}"></label><label>個人備註<input data-stop-note="${esc(p.uid)}" type="text" maxlength="120" value="${esc(p.note||'')}" placeholder="例如：不吃辣、和 03 同行"></label></div><div class="stop-footer"><a class="subtle-link" href="${esc(gsearch(p.query||p.name))}" target="_blank" rel="noopener">地點導航 ↗</a><span class="microcopy">${esc(p.travel||'自行導航')}</span></div></div><div class="stop-actions"><button class="icon-btn" data-action="move" data-uid="${p.uid}" data-delta="-1" title="往上移動" aria-label="往上移動">↑</button><button class="icon-btn" data-action="move" data-uid="${p.uid}" data-delta="1" title="往下移動" aria-label="往下移動">↓</button><button class="icon-btn danger" data-action="removeStop" data-uid="${p.uid}" title="移除" aria-label="移除">×</button></div></article>`).join(''):`<div class="placeholder"><h3>12/${state.plannerDay} 還沒有個人景點</h3><p>先去「附近有什麼」挑活動，也可以直接加入今天的半日路線。</p><button class="btn btn--dark" data-action="exploreDay" data-day="${state.plannerDay}">挑選這天的玩法 →</button></div>`;
 $('#planner-stops').innerHTML=content;
 const [min,max]=calcBudget(state.plan.map(resolveStop).filter(Boolean));
 $('#planner-budget').textContent=`฿${fmt(min)}–${fmt(max)}`;
 $('#planner-total').textContent=`目前共 ${state.plan.length} 個選項`;
 const routes=routeUrls(stops,state.plannerDay);
 $('#planner-map-links').innerHTML=routes.length?routes.map((url,i)=>`<a class="map-link" href="${esc(url)}" target="_blank" rel="noopener">🧭 12/${state.plannerDay} 第 ${i+1} 段導航 ↗</a>`).join(''):'<p class="microcopy">當天選擇景點後會出現路線導航。</p>';
}
function extractText(){
 const title=state.name.trim()||'我的曼谷自由行';
 let text=`🇹🇭 ${title}｜2026/12/1–12/5\n14 位成人旅行・大部隊主線＋個人選配\n版本日期：2026/11/03\n`;
 for(let d of D.days){
 text+=`\n━━━━━━━━━━━━━━━━\n【12/${d.id} ${d.title}】\n🏨 ${d.hotel}\n📍 集合：${d.meet}\n\n【大部隊參考時間】\n`;
 d.events.forEach(e=>{text+=`${e[0]}｜${e[1]}（${e[2]}）\n`});
 const s=getDayStops(d.id);text+='\n【我的選配】\n';
 if(!s.length){text+='（尚未安排，可當天自由決定）\n';}else{
 s.forEach((p,i)=>{text+=`${i+1}. ${p.time||'待定'}｜${p.name}\n   地區：${zoneMap[p.zone]?.label||'自訂'}；預算：${price(p)}；停留：${p.duration||'自訂'}\n   導航：${gsearch(p.query||p.name)}\n   ${p.note?'備註：'+p.note+'\n':''}`});
 const [lo,hi]=calcBudget(s);text+=`   本日選配參考小計：฿${fmt(lo)}–${fmt(hi)}／人\n`;
 const links=routeUrls(s,d.id);links.forEach((u,i)=>text+=`   Google Maps 第${i+1}段路線：${u}\n`);
 }
 }
 const [lo,hi]=calcBudget(state.plan.map(resolveStop).filter(Boolean));
 text+=`\n━━━━━━━━━━━━━━━━\n選配消費合計：約 ฿${fmt(lo)}–${fmt(hi)}／人（不含住宿、機票、包車、購物）\n注意：票價和車程僅供規劃，必須出發前再次確認。\n`;
 return text;
}
function showText(){let el=$('#text-export-box');el.hidden=false;$('#text-export').value=extractText();el.scrollIntoView({behavior:'smooth',block:'start'});}
async function copyText(text){
 try{if(navigator.clipboard&&window.isSecureContext){await navigator.clipboard.writeText(text);toast('已複製，可貼到 LINE。');return true;}}
 catch(e){}
 const t=$('#text-export');t.value=text;t.focus();t.select();try{const ok=document.execCommand('copy');if(ok){toast('已複製，可貼到 LINE。');return true;}}catch(e){}
 toast('瀏覽器未允許自動複製。請在文字框按 Ctrl+A、Ctrl+C。');return false;
}
function downloadFile(name,text,mime){const blob=new Blob([text],{type:mime}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000)}
function exportBackup(){return {app:'BKK_PERSONAL_PLAN_V7',name:state.name,plan:state.plan,custom:state.custom,exportedAt:new Date().toISOString()}}
function importBackup(obj){
 if(!obj||obj.app!=='BKK_PERSONAL_PLAN_V7'||!Array.isArray(obj.plan))throw Error('不是這個網站匯出的 V7 備份。');
 const custom=obj.custom&&typeof obj.custom==='object'?obj.custom:{};
 const good=obj.plan.slice(0,100).filter(x=>x&&typeof x.uid==='string'&&typeof x.poiId==='string'&&/^[1-5]$/.test(String(x.day))&&(poiMap.has(x.poiId)||custom[x.poiId])).map(x=>({uid:x.uid.slice(0,50),poiId:x.poiId.slice(0,100),day:String(x.day),time:/^\d\d:\d\d$/.test(x.time||'')?x.time:'14:30',note:String(x.note||'').slice(0,120)}));
 const cleaned={};for(const [k,v] of Object.entries(custom).slice(0,100)){if(k.startsWith('custom_')&&v&&typeof v.name==='string'){cleaned[k]={...v,name:v.name.slice(0,80),query:String(v.query||v.name).slice(0,120),min:Math.max(0,Math.min(30000,Number(v.min)||0)),max:Math.max(0,Math.min(30000,Number(v.max)||0))}}}
 state.name=String(obj.name||'').slice(0,24);state.custom=cleaned;state.plan=good.filter(x=>poiMap.has(x.poiId)||cleaned[x.poiId]);state.plannerDay='2';save();renderPlanner();toast('個人行程備份已匯入。');
}
function addCustom(form){
 const f=new FormData(form),name=String(f.get('name')||'').trim().slice(0,80);if(!name)return;
 const query=String(f.get('query')||name+' Bangkok').trim().slice(0,120), cost=Math.min(30000,Math.max(0,Number(f.get('cost'))||0)),time=String(f.get('time')||'15:00');
 const id='custom_'+Date.now().toString(36)+Math.random().toString(36).slice(2,8);
 state.custom[id]={id,day:state.plannerDay,name,query,zone:'',category:'自訂',period:'下午',min:cost,max:cost,priceType:'自行預估',duration:'自行安排',travel:'開啟 Google Maps 查路線'};
 state.plan.push({uid:'p'+Date.now().toString(36),poiId:id,day:state.plannerDay,time,note:''});save();form.reset();renderPlanner();toast(`已加入：${name}`);
}
function initializeGroup(){
 $('#group-number').innerHTML=Array.from({length:14},(_,i)=>`<option value="${String(i+1).padStart(2,'0')}">${String(i+1).padStart(2,'0')}</option>`).join('');
 for(const d of ['2','3','4']){$(`#group-d${d}`).innerHTML='<option value="">尚未決定／不參加</option>'+D.packages.filter(p=>p.day===d).map(p=>`<option value="${p.id}">${p.id}｜${p.name}</option>`).join('')}
 $('#group-number').value=localGroup.n;$('#group-nickname').value=localGroup.name;$('#group-d2').value=localGroup.d2;$('#group-d3').value=localGroup.d3;$('#group-d4').value=localGroup.d4;$('#group-jurassic').value=localGroup.j;$('#group-thainosaur').value=localGroup.t;$('#group-dinner').value=localGroup.dn;$('#group-note').value=localGroup.note;
 $$('#group-prefs input[type="checkbox"]').forEach(x=>x.checked=(localGroup.prefs||[]).includes(x.value));
 $('#top-sync-tag').textContent=groupUrl?'可使用共用登記':'個人行程本機儲存';
 if(groupUrl){$('#group-sync-state').textContent='共用來源已設定';$('#group-sync-state').classList.add('online');$('#sync-notice').textContent='共用來源已設定。填寫後需按「儲存我的登記」並收到成功回覆，才代表已送進共用表。';$('#sync-notice').classList.add('live');}
 else{$('#group-sync-state').textContent='尚未連接共用表';$('#sync-notice').innerHTML='目前是<strong>單機測試模式</strong>：每位團員儲存的選擇只留在自己的瀏覽器，其他人看不到。請主揪依 README 部署 Apps Script 並在 <code>config.js</code> 填寫網址，才會有真正的 14 人統一統計。';}
}
function collectGroup(){const prefs=$$('#group-prefs input:checked').map(x=>x.value);return {n:$('#group-number').value,name:$('#group-nickname').value.trim().slice(0,18),d2:$('#group-d2').value,d3:$('#group-d3').value,d4:$('#group-d4').value,j:$('#group-jurassic').value,t:$('#group-thainosaur').value,dn:$('#group-dinner').value,prefs,note:$('#group-note').value.trim().slice(0,80)};}
function renderGroup(){
 const records=(groupUrl?remoteRecords:localGroup.name?[localGroup]:[]);
 const num=(type,value)=>records.filter(r=>r[type]===value).length;
 $('#jurassic-yes').textContent=groupUrl&&!remoteReady?'—':num('j','yes');
 $('#jurassic-maybe').textContent=groupUrl&&!remoteReady?'—':num('j','maybe');
 $('#thainosaur-yes').textContent=groupUrl&&!remoteReady?'—':num('t','yes');
 $('#registered-count').textContent=groupUrl&&!remoteReady?'尚未載入':`已登記 ${records.length} / 14 人`;
 $('#group-summary-note').textContent=groupUrl?'共用資料僅顯示團員暱稱及一般活動意願，不包含登記碼。':'此處僅顯示本裝置登記的個人資料，尚未跨裝置同步。';
 const labels=(k)=>D.packages.find(p=>p.id===k)?.name||'尚未決定';
 $('#members-table').innerHTML=records.length?`<table><thead><tr><th>編號</th><th>暱稱</th><th>12/2 路線</th><th>12/3 路線</th><th>12/4 路線</th><th>侏羅紀</th><th>晚宴</th></tr></thead><tbody>${records.sort((a,b)=>String(a.n).localeCompare(String(b.n))).map(r=>`<tr><td>${esc(r.n)}</td><td>${esc(r.name)}</td><td>${esc(labels(r.d2))}</td><td>${esc(labels(r.d3))}</td><td>${esc(labels(r.d4))}</td><td>${esc({'yes':'想參加','maybe':'有興趣','no':'不參加'}[r.j]||'')}</td><td>${esc({'open':'待定','benjarong':'Benjarong','nahm':'nahm','sritrat':'Sri Trat','saffron':'Saffron','none':'不參加'}[r.dn]||'')}</td></tr>`).join('')}</tbody></table>`:'<p class="microcopy">尚未有團員完成登記。</p>';
 const pkgs=D.packages.filter(p=>['2','3','4'].includes(p.day));
 let stats=[];for(const day of ['2','3','4']){let groupPkgs=pkgs.filter(p=>p.day===day);let leading=groupPkgs.map(p=>({...p,n:records.filter(r=>r['d'+day]===p.id).length})).sort((a,b)=>b.n-a.n).slice(0,3);stats.push(`<h4 style="margin:16px 0 5px">12/${day} 下午分流</h4>`);stats.push(leading.map(p=>`<div class="summary-bar"><div class="summary-bar-head"><span>${esc(p.id)} ${esc(p.name)}</span><b>${p.n} 人</b></div><div class="bar-track"><div class="bar-fill" style="width:${Math.min(100,p.n/14*100)}%"></div></div></div>`).join(''))}
 $('#group-choice-summary').innerHTML=stats.join('');
}
function jsonp(op,data={}){
 if(!groupUrl)return Promise.reject(new Error('尚未設定共用後端網址。'));
 return new Promise((resolve,reject)=>{
  const cb='__bkk_jsonp_'+Date.now()+'_'+(++jsonpSeq),s=document.createElement('script');let done=false;
  const cleanup=()=>{if(done)return;done=true;clearTimeout(timer);delete window[cb];s.remove()};
  window[cb]=result=>{cleanup();resolve(result)};
  const timer=setTimeout(()=>{cleanup();reject(new Error('連線逾時；請確認 Apps Script 部署設定與網路。'))},16000);
  s.onerror=()=>{cleanup();reject(new Error('無法連接 Google Apps Script；請確認 /exec URL 與公開存取設定。'))};
  let url;try{url=new URL(groupUrl)}catch(e){cleanup();reject(new Error('共用網址格式不正確。'));return;}
  if(url.protocol!=='https:'){cleanup();reject(new Error('共用來源必須使用 HTTPS。'));return;}
  url.searchParams.set('op',op);url.searchParams.set('callback',cb);
  Object.entries(data).forEach(([k,v])=>url.searchParams.set(k,String(v)));
  s.src=url.toString();s.async=true;document.head.appendChild(s);
 });
}
async function loadGroup(showNotice=false){
 if(!groupUrl){remoteReady=false;renderGroup();if(showNotice)toast('目前未啟用共用來源，只有本機記錄。');return;}
 $('#group-result').className='group-result';$('#group-result').textContent='載入團員共用登記中…';
 try{let r=await jsonp('list');if(!r.ok)throw Error(r.error||'資料讀取失敗');remoteRecords=Array.isArray(r.members)?r.members:[];remoteReady=true;$('#group-result').textContent='共用登記已更新。';$('#group-result').className='group-result good';renderGroup();}
 catch(e){remoteReady=false;$('#group-result').textContent='共用登記讀取失敗：'+e.message;$('#group-result').className='group-result bad';renderGroup();}
}
async function sendGroup(e){
 e.preventDefault();const g=collectGroup();if(!g.name){toast('請填寫暱稱。');return;}
 if(g.j==='yes'&&g.d2&&g.d2!=='2B'){const yes=confirm('你已選擇 12/2 的其他下午路線，但又想參加 15:30 侏羅紀。這兩個時段很可能衝突。要將 12/2 主路線改成 2B 恐龍組嗎？');if(!yes){toast('請先調整 12/2 路線或侏羅紀意願。');return;}g.d2='2B';$('#group-d2').value='2B';}
 localGroup=g;saveGroup();$('#group-result').className='group-result';
 if(!groupUrl){$('#group-result').textContent='已存在這台電腦；尚未接入共用表，其他團員看不到這筆登記。';toast('已儲存在此瀏覽器，尚未同步給其他人。');renderGroup();return;}
 const code=$('#group-code').value.trim();if(!code){$('#group-result').textContent='請輸入主揪提供的個人登記碼，才能送出至共用表。';$('#group-result').className='group-result bad';return;}
 $('#group-result').textContent='正在送出共用登記…';
 try{const payload=JSON.stringify({...g,code});if(payload.length>1300)throw Error('登記內容過長');const r=await jsonp('save',{p:payload});if(!r.ok)throw Error(r.error||'儲存失敗');$('#group-result').textContent=`共用表已確認儲存 ${g.n} 號 ${g.name} 的意願，現在重新讀取統計。`;$('#group-result').className='group-result good';await loadGroup();toast('登記已同步到共用表。');}
 catch(e){$('#group-result').textContent='儲存在本機，但共用表未確認成功：'+e.message;$('#group-result').className='group-result bad';toast('共用登記未確認成功，請檢查網址或登記碼。');}
}
function mapsForZone(z){let k=zoneMap[z];return k?gsearch(k.near):'#'}
function makeStaticMap(zones){
 // Dynamically scale verified approximate area centres. Do not draw fictional streets or rivers.
 const all=zones.map(z=>zoneMap[z]).filter(Boolean);
 if(!all.length)return '';
 const minX=Math.min(...all.map(x=>x.lng))-.013,maxX=Math.max(...all.map(x=>x.lng))+.013;
 const minY=Math.min(...all.map(x=>x.lat))-.011,maxY=Math.max(...all.map(x=>x.lat))+.011;
 const w=790,h=335,scale=Math.min(w/(maxX-minX),h/(maxY-minY));
 const cx=(minX+maxX)/2,cy=(minY+maxY)/2;
 const pins=zones.map((z,i)=>{let v=zoneMap[z],x=450+(v.lng-cx)*scale,y=245-(v.lat-cy)*scale;
  const label=v.label.split('・')[0],px=x<680?x+13:x-13,anchor=x<680?'start':'end',color=z==='Asiatique'?'#c47b50':'#167b78';
  return `<g><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="10" fill="${color}" stroke="white" stroke-width="3"/><text x="${px.toFixed(1)}" y="${(y-9).toFixed(1)}" text-anchor="${anchor}" font-size="13" font-weight="700" fill="#234656" paint-order="stroke" stroke="#f0f5f2" stroke-width="4">${esc(label)}</text></g>`;
 }).join('');
 return `<svg class="fallback-svg" viewBox="0 0 900 480" role="img" aria-label="依各商圈概略中心座標繪製的相對位置圖；不是精確景點地圖"><rect width="900" height="480" fill="#edf3ee"/><g stroke="#d4e2d8" stroke-width="1"><path d="M0 80H900M0 160H900M0 240H900M0 320H900M0 400H900M120 0V480M300 0V480M480 0V480M660 0V480M840 0V480"/></g>${pins}<text x="28" y="33" font-size="18" font-weight="800" fill="#153a4b">曼谷商圈 · 相對方位</text><text x="28" y="57" font-size="12" fill="#516b73">按座標比例顯示概略中心位置｜不含道路與即時交通</text><text x="838" y="44" font-size="25" font-weight="700" fill="#286475">↑</text><text x="839" y="62" font-size="10" font-weight="700" fill="#286475">N</text><text x="28" y="462" font-size="12" fill="#526d74">店家地址與路線仍以旁邊 Google Maps 導航為準</text></svg>`;
}
function dayMapPlaces(day){
 const base=day==='all'?D.pois:D.pois.filter(x=>x.day===day);
 const venues=base.map(p=>({id:p.id,name:p.name,query:p.query||p.name,zone:p.zone,category:p.category,period:p.period,day:p.day,isPoi:true}));
 const hotels=D.trip.hotels.map((h,i)=>({id:'hotel'+i,name:'🏨 '+h.name,query:h.query,category:'住宿',zone:i===0?'Ari':'Thonglor',period:'全天',day:i===0?'1':'4',isPoi:false}));
 return [...hotels.filter(x=>day==='all'||(day==='5'?x.day==='4':['1','2','3'].includes(day)?x.day==='1':x.day===day)),...venues];
}
function mapShowPlace(id){
 const d=$('#map-day').value||'2',points=dayMapPlaces(d),p=points.find(x=>x.id===id)||points[0];if(!p)return;
 const target=(p.query||p.name)+' Bangkok Thailand';
 const iframe=$('#google-map-frame'),mapUrl='https://maps.google.com/maps?q='+encodeURIComponent(target)+'&output=embed';
 if(iframe.dataset.target!==target){iframe.src=mapUrl;iframe.dataset.target=target;}
 $('#map-place-name').textContent=p.name+'｜'+(zoneMap[p.zone]?.label||'曼谷');
 $('#map-open-google').href=gsearch(target);
 $('#map-place').value=p.id;
 $$('#map-place-list .map-venue').forEach(b=>b.classList.toggle('selected',b.dataset.poi===p.id));
}
let mapTileFailed=false;
function renderMap(){
 const daySelect=$('#map-day'),priorMapDay=daySelect.value||'2',priorPlace=$('#map-place').value;
 daySelect.innerHTML='<option value="all">全部五天</option>'+D.days.map(d=>`<option value="${d.id}">${esc(d.date)}・DAY ${d.id}</option>`).join('');
 daySelect.value=priorMapDay;const day=daySelect.value;
 const pkgs=day==='all'?[]:D.packages.filter(p=>p.day===day);
 const routeUrl=pkg=>{
  const queries=pkg.items.map(id=>poiMap.get(id)).filter(Boolean).map(p=>p.query||p.name).slice(0,5);
  if(queries.length<2)return queries.length?gsearch(queries[0]):gsearch(zoneMap[pkg.zone]?.near||'Bangkok');
  const args={api:'1',origin:queries[0],destination:queries.at(-1),travelmode:pkg.zone==='SongWat'?'walking':'driving'};
  if(queries.length>2)args.waypoints=queries.slice(1,-1).join('|');
  return 'https://www.google.com/maps/dir/?'+new URLSearchParams(args);
 };
 $('#map-package-links').innerHTML=pkgs.length?`<div class="map-packages-head"><h3>12/${day} 可以直接選的半日路線</h3><small>依各路線景點順序開啟 Google Maps；車程依當時路況計算</small></div><div class="map-package-cards">${pkgs.map(p=>`<a target="_blank" rel="noopener" href="${esc(routeUrl(p))}"><b>${esc(p.id)} · ${esc(p.name)}</b><span>${esc(p.window)} · ${esc(p.budget)}</span><strong>查看整段路線 ↗</strong></a>`).join('')}</div>`:'<p class="microcopy">選擇 12/2、12/3 或 12/4，即可查看半日分流路線的 Google Maps 導航。</p>';
 const points=dayMapPlaces(day);
 $('#map-place').innerHTML=points.map(p=>`<option value="${esc(p.id)}">${esc(p.name)} · ${esc(zoneMap[p.zone]?.label||'')}</option>`).join('');
 const placeList=points.map(p=>`<div class="map-venue${p.id===priorPlace?' selected':''}" data-poi="${esc(p.id)}"><div class="map-venue-top"><span class="pill">${esc(p.category||'自由')}</span><b>${esc(p.name)}</b></div><small>${esc(zoneMap[p.zone]?.label||'')}・${esc(p.period||'全天')}</small><div class="map-venue-actions"><button data-action="mapPlace" data-id="${esc(p.id)}">地圖顯示</button><a href="${esc(gsearch((p.query||p.name)+' Bangkok Thailand'))}" target="_blank" rel="noopener">Google 導航 ↗</a>${p.isPoi?`<button data-action="add" data-id="${esc(p.id)}" data-day="${p.day}">＋加入行程</button>`:''}</div></div>`).join('');
 $('#map-place-list').innerHTML=placeList;
 mapShowPlace(priorPlace);
 const zones=day==='all'?Object.keys(zoneMap):[...new Set([dayOf(day).zone,...D.packages.filter(p=>p.day===day).map(p=>p.zone),...D.pois.filter(p=>p.day===day).map(p=>p.zone)])];
 $('#map-zone-list').innerHTML=zones.map(z=>`<div class="zone-tile"><div><strong>${esc(zoneMap[z].label)}</strong><p>${esc(zoneMap[z].sub)}</p></div><div style="display:flex;flex-direction:column;gap:6px"><button data-action="openZone" data-zone="${z}" data-day="${day}">附近玩法</button><a class="subtle-link" href="${esc(mapsForZone(z))}" target="_blank" rel="noopener">導航 ↗</a></div></div>`).join('');
 const fallback=$('#map-fallback');
 const showFallback=()=>{fallback.hidden=false;fallback.innerHTML='<strong>地圖圖磚載入失敗，改顯示區域示意圖。</strong>'+makeStaticMap(zones);$('#leaflet-map').style.display='none';};
 if(window.L&&!mapTileFailed){
   if(!mapInstance){
     mapInstance=L.map('leaflet-map',{scrollWheelZoom:false}).setView([13.739,100.535],11);
     const tiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18,attribution:'© OpenStreetMap contributors',crossOrigin:true});
     let errs=0;tiles.on('tileerror',()=>{if(++errs>=4){mapTileFailed=true;showFallback()}});
     tiles.addTo(mapInstance);mapMarkers=L.layerGroup().addTo(mapInstance);
   }
   mapMarkers.clearLayers();const bounds=[];
   zones.forEach(z=>{let p=zoneMap[z],m=L.circleMarker([p.lat,p.lng],{radius:9,weight:2,color:'#fff',fillColor:z==='Asiatique'?'#bb7b49':'#186c74',fillOpacity:.93});m.bindPopup(`<strong>${esc(p.label)}（區域中心）</strong><br>${esc(p.sub)}<br><a href="${esc(mapsForZone(z))}" target="_blank" rel="noopener">Google Maps 查地點 ↗</a>`);m.addTo(mapMarkers);bounds.push([p.lat,p.lng])});
   if(bounds.length)mapInstance.fitBounds(bounds,{padding:[32,32],maxZoom:13});$('#leaflet-map').style.display='block';fallback.hidden=true;
   setTimeout(()=>mapInstance.invalidateSize(),220);
 }else showFallback();
 $('#source-list').innerHTML=D.sources.map(([name,url])=>`<a href="${esc(url)}" target="_blank" rel="noopener">${esc(name)} ↗</a>`).join('');
}
function tryLoadSharedHash(){
 const m=(location.hash||'').match(/^#share=([A-Za-z0-9_-]+)$/);if(!m)return;
 try{
  const b64=m[1].replace(/-/g,'+').replace(/_/g,'/'),raw=atob(b64),bytes=Uint8Array.from(raw,c=>c.charCodeAt(0)),text=new TextDecoder().decode(bytes),d=JSON.parse(text);
  if(!d||d.app!=='BKK_PERSONAL_PLAN_V7')throw Error('格式不正確');
  if(confirm('收到一份曼谷個人行程分享。要載入到自己的行程嗎？（會取代本機原有行程；若要保留請先匯出 JSON）')){importBackup(d);switchView('planner');}
  history.replaceState(null,'',location.pathname+location.search);
 }catch(e){console.warn('Cannot decode share link',e);}
}
function wire(){
 document.addEventListener('click',e=>{
  const nav=e.target.closest('[data-nav]');if(nav){switchView(nav.dataset.nav);return;}
  const b=e.target.closest('[data-action]');if(!b)return;
  const act=b.dataset.action;
  if(act==='day')openDay(b.dataset.day);
  if(act==='daySelect'){state.day=b.dataset.day;save();renderDays();}
  if(act==='plannerDay'){state.plannerDay=b.dataset.day;save();renderPlanner();}
  if(act==='exploreDay'){state.filter={day:b.dataset.day,zone:'all',cat:'all',period:'all',q:''};save();switchView('explore');syncFilterInputs();renderExplore();}
  if(act==='openZone')exploreZone(b.dataset.zone,b.dataset.day||'all');
  if(act==='add')addPoi(b.dataset.id,b.dataset.day);
  if(act==='removePoi')removePoi(b.dataset.id,b.dataset.day);
  if(act==='addPackage')addPackage(b.dataset.pkg);
  if(act==='removeStop')removeStop(b.dataset.uid);
  if(act==='move')rearrange(b.dataset.uid,Number(b.dataset.delta));
  if(act==='mapPlace')mapShowPlace(b.dataset.id);
  if(act==='jurassic'){state.day='2';state.filter={day:'2',zone:'Asiatique',cat:'恐龍',period:'all',q:''};save();switchView('explore');syncFilterInputs();renderExplore()}
 });
 ['day','zone','cat','period'].forEach(k=>$('#filter-'+k).addEventListener('change',e=>{state.filter[k]=e.target.value;save();renderExplore()}));
 $('#filter-search').addEventListener('input',e=>{state.filter.q=e.target.value.trim();save();renderExplore()});
 $('#filter-reset').addEventListener('click',()=>{state.filter={day:'all',zone:'all',cat:'all',period:'all',q:''};save();syncFilterInputs();renderExplore()});
 $('#planner-name').addEventListener('input',e=>{state.name=e.target.value.slice(0,24);save()});
 $('#planner-stops').addEventListener('change',e=>{let uid=e.target.dataset.stopTime||e.target.dataset.stopNote;if(!uid)return;let p=state.plan.find(s=>s.uid===uid);if(!p)return;if(e.target.dataset.stopTime)p.time=e.target.value;if(e.target.dataset.stopNote)p.note=e.target.value.slice(0,120);save()});
 $('#custom-stop-form').addEventListener('submit',e=>{e.preventDefault();addCustom(e.target)});
 $('#export-text').addEventListener('click',showText);
 $('#close-export').addEventListener('click',()=>$('#text-export-box').hidden=true);
 $('#copy-export').addEventListener('click',()=>copyText($('#text-export').value));
 $('#save-export').addEventListener('click',()=>downloadFile('Bangkok_2026_My_Plan.txt',extractText(),'text/plain;charset=utf-8'));
 $('#print-export').addEventListener('click',()=>{showText();window.print()});
 $('#export-json').addEventListener('click',()=>downloadFile('Bangkok_2026_Plan_Backup.json',JSON.stringify(exportBackup(),null,2),'application/json'));
 $('#import-json-btn').addEventListener('click',()=>$('#import-json').click());
 $('#import-json').addEventListener('change',async e=>{const f=e.target.files?.[0];if(!f)return;try{const text=await f.text();const obj=JSON.parse(text);if(state.plan.length&&!confirm('匯入會取代現在的個人行程，確定？'))return;importBackup(obj)}catch(err){toast('匯入失敗：'+err.message)}finally{e.target.value=''}});
 $('#share-export').addEventListener('click',async()=>{try{let json=JSON.stringify(exportBackup()),utf8=new TextEncoder().encode(json),raw=Array.from(utf8,b=>String.fromCharCode(b)).join(''),b64=btoa(raw).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');if(b64.length>3000){toast('選項較多，分享連結過長。請改用 JSON 備份或文字行程。');return;}let base=location.href.split('#')[0];if(base.startsWith('file:')){toast('本機 file:// 連結無法跨裝置分享。請先部署到 GitHub Pages，再用這個功能。');return;}await copyText(base+'#share='+b64);}catch(err){toast('產生分享連結失敗：'+err.message)}});
 $('#group-form').addEventListener('submit',sendGroup);
 $('#group-refresh').addEventListener('click',()=>loadGroup(true));
 $('#map-day').addEventListener('change',renderMap);
 $('#map-place').addEventListener('change',e=>mapShowPlace(e.target.value));
 $('.overview-map-panel').addEventListener('toggle',e=>{if(e.target.open&&mapInstance){setTimeout(()=>mapInstance.invalidateSize(),200);}});
}
function init(){restore();initOverview();filterOptions();initializeGroup();wire();save();renderOverview();renderDays();renderExplore();renderPlanner();renderGroup();tryLoadSharedHash();if(groupUrl)loadGroup();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
