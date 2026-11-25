(() => {
  'use strict';
  const floorLabel = n => n < 0 ? '地下 ' + Math.abs(n) + ' 樓' : n + ' 樓';
  const num = (n, digits = 2) => n != null && n !== '' && Number.isFinite(Number(n))
    ? Number(n).toLocaleString('zh-TW', {maximumFractionDigits:digits}) : '待補';

  function mount(root, community, options) {
    const {esc, params, rows} = options;
    const data = window.FloorSales.groupRows(rows, community, {asOf:options.asOf, period:options.bounds});
    const byDate = (a,b) => String(b.row.date).localeCompare(String(a.row.date));
    const records = data.records.filter(r => r.address.exact && r.row.singleBuilding === true &&
      r.floor.single && Number.isInteger(r.floor.number) && r.floor.number !== 0).sort(byDate);
    const byDoor = new Map();
    for (const record of records) {
      const label = record.address.label;
      if (!byDoor.has(label)) byDoor.set(label, []);
      byDoor.get(label).push(record);
    }
    for (const label of [...(community.primaryExactAddresses || []), ...(community.exactAddresses || [])]) {
      if (typeof label === 'string' && label && !byDoor.has(label)) byDoor.set(label, []);
    }
    const doors = [...byDoor.keys()];
    let door = byDoor.has(params.get('address')) ? params.get('address') : doors[0] || '';
    const nominal = Number(community.buildingCount) === 1 && Number.isInteger(Number(community.floors)) &&
      Number(community.floors) > 0 && Number(community.floors) <= 150 ? Number(community.floors) : null;
    let currentFloor = null, scene = null, limit = 3;
    let sun = {date:params.get('date'), time:params.get('time')};
    root.innerHTML = `<button type="button" class="studio-glance" aria-label="移至所選樓層成交"><span></span><strong></strong><i aria-hidden="true">↓</i></button>
      <div class="sales-studio-layout"><div class="studio-viewport"></div>
      <section class="studio-ledger" aria-label="門牌與樓層成交">
      <label class="studio-door-label">查詢門牌<select id="studioDoor"></select></label>
      <small class="studio-scope">${esc(options.filters)}</small>
      <div id="studioReadout" role="region" tabindex="-1" aria-live="polite" aria-label="所選樓層成交"></div>
      <div class="studio-actions"><button id="studioFloors" type="button">完整成交與兩筆比較 ↗</button>
      <button id="studioEnv" type="button">日照與環境查詢 ↗</button>
      <button id="studioCopy" type="button">分享門牌與樓層</button><span class="copy-status" role="status"></span></div>
      </section></div><footer class="studio-note">建物外觀、朝向及層高均為示意。太陽方向依社區座標試算，個戶採光須現場確認。
      <a href="https://landmap.tainan.gov.tw/gis/?fun=3ds" target="_blank" rel="noopener noreferrer">開啟台南市府 3D 圖台 ↗</a></footer>`;
    const el = selector => root.querySelector(selector);
    const select = el('#studioDoor');
    for (const label of doors) select.add(new Option(label, label));
    if (!doors.length) { select.add(new Option('精確門牌待補', '')); select.disabled = true; }
    select.value = door;
    function shareReset() {
      el('#studioCopy').textContent = '分享門牌與樓層';
      el('.copy-status').textContent = '';
    }
    function readout() {
      const matching = (byDoor.get(door) || []).filter(r => r.floor.number === currentFloor);
      const heading = currentFloor == null ? '選擇樓層' : floorLabel(currentFloor)+'成交';
      const latest = matching.find(r=>r.comparable);
      el('.studio-glance span').textContent = latest ? floorLabel(currentFloor)+' 最近一筆可比' : heading;
      el('.studio-glance strong').textContent = latest ? num(latest.row.unitWan)+' 萬／坪' : currentFloor==null?'查看樓層資料':matching.length+' 筆成交';
      const item = record => {
        const r = record.row;
        const value = record.comparable ? '<strong>'+num(r.unitWan)+'</strong><span> 萬元／坪</span>' : '<strong>未列入可比</strong>';
        const extra = [r.priceWan == null ? null : '總價 '+num(r.priceWan)+' 萬元', r.areaPing == null ? null : num(r.areaPing)+' 坪', r.parkingMode].filter(Boolean);
        return `<li><time>${esc(r.date)}</time><p class="studio-unit-price">${value}</p><p>${esc(r.unitIdentity || r.address)}</p><small>${esc(extra.join(' · '))}</small>${record.comparable?'':'<small>'+esc(record.price.label)+'</small>'}</li>`;
      };
      const empty = currentFloor == null ? '請點模型或從選單選擇樓層，查看當層資料。' : '目前條件下，沒有可對應到這個門牌與樓層的成交。';
      el('#studioReadout').innerHTML = `<div class="studio-readout-heading"><h3>${esc(heading)}</h3>${currentFloor==null?'':'<span>'+matching.length+' 筆</span>'}</div>` +
        (matching.length ? '<ul class="studio-trades">'+matching.slice(0,limit).map(item).join('')+'</ul>' : '<p class="studio-empty">'+empty+'</p>')+
        (matching.length > limit ? '<button id="studioMore" type="button">再看較早成交</button>' : '');
      if (el('#studioMore')) el('#studioMore').onclick=()=>{limit+=5;readout();};
    }
    function changeFloor(n) { currentFloor=n; limit=3; readout(); shareReset(); }
    function displayDoor(preferred, cleared = false) {
      if (scene) { sun=scene.getSun?.() || sun; scene.destroy(); scene=null; }
      const entries = byDoor.get(door) || [];
      const observed = [...new Set(entries.map(r=>r.floor.number))];
      const knownFloors = observed.some(n=>nominal && n>nominal) ? null : nominal;
      const valid = n => Number.isInteger(n) && n!==0 && (observed.includes(n) || (knownFloors && n>0 && n<=knownFloors));
      const initialFloor = valid(preferred) ? preferred : (entries.find(r=>r.comparable) || entries[0])?.floor.number ?? null;
      changeFloor(cleared ? null : initialFloor);
      const viewport = el('.studio-viewport');
      viewport.replaceChildren();
      if (window.BuildingScene) try {
        scene = window.BuildingScene.mount(viewport, {name:community.name, floors:knownFloors,
          ...options.coordinates, observedFloors:observed, selectedFloor:currentFloor, sun,
          onFloorSelect:changeFloor, onSunChange:value=>{sun=value;shareReset();}});
      } catch { scene=null; }
      if (!scene) {
        viewport.innerHTML='<label class="studio-door-label studio-basic">選擇樓層<select aria-label="樓層"></select></label>';
        const pick=viewport.querySelector('select');
        pick.add(new Option('選擇樓層',''));
        const levels=new Set(observed);
        for(let n=1;n<=knownFloors;n++)levels.add(n);
        [...levels].sort((a,b)=>b-a).forEach(n=>pick.add(new Option(floorLabel(n),String(n))));
        pick.value=currentFloor==null?'':String(currentFloor);
        pick.onchange=()=>changeFloor(pick.value?Number(pick.value):null);
      }
    }
    select.onchange=()=>{door=select.value;displayDoor(null);};
    el('.studio-glance').onclick=()=>{const readout=el('#studioReadout');readout.focus({preventScroll:true});readout.scrollIntoView({block:'start'});};
    el('#studioFloors').onclick=options.openFloors;
    el('#studioEnv').onclick=options.openEnvironment;
    el('#studioCopy').onclick=e=>{
      const url=new URL(options.shareBase);
      url.searchParams.set('view','building');
      if(door)url.searchParams.set('address',door);
      url.searchParams.set('floor',currentFloor==null?'all':String(currentFloor));
      const settings=scene?.getSun?.();
      if(settings?.date && settings?.time && options.coordinates.lat!=null){
        url.searchParams.set('date',settings.date);url.searchParams.set('time',settings.time);
      }
      options.copyValue(url.href,e.currentTarget,'已複製這個查詢畫面。','查詢連結');
    };
    displayDoor(params.has('floor') ? Number(params.get('floor')) : null,params.get('floor')==='all');
    return {destroy(){scene?.destroy();scene=null;}};
  }
  window.StudioSales={mount};
})();
