(function environmentExplorer() {
  'use strict';
  const topics = {sun:'日照試算', ground:'斷層、下陷與液化', building:'建物安全', coast:'海埔與舊海岸'};
  const directions = ['北','東北','東','東南','南','西南','西','西北'];
  const soilLabels = {high:'高潛勢', medium:'中潛勢', low:'低潛勢', unpublished:'市府資料標為未公開／未調查', outside:'參考點在這份圖層涵蓋範圍外', edge:'參考點接近分區邊界，請核對原圖', disputed:'市府下載檔與線上圖層的分區不同，請核對原圖'};
  const soilUrl = new URL('environment-soil.json?v=20261125', document.currentScript.src);
  let soilRequest;
  function loadSoil() {
    if (!soilRequest) {
      soilRequest = fetch(soilUrl, {credentials:'omit'}).then(response => {
        if (!response.ok) throw Error('soil data');
        return response.json();
      }).then(data => {
        if (!data.locations || !data.sourceDate) throw Error('soil format');
        return data;
      }).catch(error => { soilRequest = undefined; throw error; });
    }
    return soilRequest;
  }

  function mount(root, c, options) {
    const {params, esc, link, positionLabel, located, copyValue, address} = options;
    const find = id => root.querySelector('#' + id);
    const usable = located(c);
    const precise = usable && !['main','nearby'].includes(c.positionEstimated);
    const sun = window.MapSun;
    const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && value >= '1901-01-01' && value <= '2099-12-31' && !!sun?.day(23,120.2,value);
    const urlDate = params.get('date') || '';
    const requestedFacing = params.get('facing') || '';
    const requestedHorizon = params.get('horizon') ?? '';
    const validHorizon = value => /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value) && Number(value) <= 90;
    const validFacing = value => directions.some((_, i) => String(i*45) === value);
    const state = {
      topic:Object.hasOwn(topics, params.get('topic')) ? params.get('topic') : 'sun',
      date:params.has('date') ? (validDate(urlDate) ? urlDate : '') : (sun?.today() || ''),
      facing:validFacing(requestedFacing) ? requestedFacing : '',
      horizon:validHorizon(requestedHorizon) ? String(Number(requestedHorizon)) : ''
    };
    const label = positionLabel(c);
    const coordinates = usable ? `${Number(c.lat).toFixed(6)}, ${Number(c.lon).toFixed(6)}` : '';
    const when = minutes => `${Math.floor(minutes / 60)} 小時 ${minutes % 60} 分`;
    const links = (...items) => '<div class="env-links">'+items.join('')+'</div>';
    root.innerHTML = `<header class="env-place"><p>${esc(address || c.district || '門牌待核')}<br><small>${esc(label)}${usable ? ' · '+esc(coordinates) : ''}</small></p>
      <div class="env-tools">${address ? '<button id="copyEnvAddress" type="button">複製門牌</button>' : ''}${usable ? '<button id="copyEnvPoint" type="button">複製座標</button>' : ''}<button id="copyEnvironmentLink" type="button">分享此查詢</button><span class="copy-status" role="status"></span></div></header>
      <nav class="env-nav" aria-label="環境查詢項目">${Object.entries(topics).map(([key,name])=>`<button type="button" data-env-topic="${key}" aria-controls="envTopicBody">${name}</button>`).join('')}</nav><div id="envTopicBody"></div>`;
    if (address) find('copyEnvAddress').onclick = event => copyValue(address,event.currentTarget,'已複製門牌，可貼至官方圖台。','門牌');
    if (usable) find('copyEnvPoint').onclick = event => copyValue(coordinates,event.currentTarget,'已複製緯度、經度。','座標');
    find('copyEnvironmentLink').onclick = event => {
      const url = new URL(location.pathname,location.origin);
      url.searchParams.set('community', c.id);
      url.searchParams.set('view','environment');
      url.searchParams.set('topic',state.topic);
      if (state.topic === 'sun' && usable && validDate(state.date)) {
        url.searchParams.set('date', state.date);
        if (validFacing(state.facing)) url.searchParams.set('facing',state.facing);
        if (validHorizon(state.horizon)) url.searchParams.set('horizon',String(Number(state.horizon)));
      }
      copyValue(url.href,event.currentTarget,'已複製目前的查詢連結。','查詢連結');
    };

    function showSun(body) {
      const attribution = links(link('https://www.cwa.gov.tw/V8/C/K/astronomy_day.html','中央氣象署日出日沒時刻'),link('https://landmap.tainan.gov.tw/gis/?fun=3ds','府城南籍圈 3D 建物'));
      if (!usable || !sun) {
        body.innerHTML = `<section class="env-card"><h3>日照試算</h3><p>${usable ? '日照計算工具暫時無法載入，請重新整理或查氣象署時刻。' : '社區缺少可用座標，待補位置後才能計算日出、日落與窗面直曬時段。'}</p>${attribution}</section>`;
        return;
      }
      body.innerHTML = `<section class="env-card env-sky"><div class="env-heading"><h3>這一天的太陽</h3><label>台灣日期<input id="envDate" type="date" min="1901-01-01" max="2099-12-31"></label></div>
        <div id="envDay" aria-live="polite"></div><p class="env-note">以${esc(label)}和平坦地平線估算，時間為台灣時間。</p></section>
        <section class="env-card"><h3>這扇窗可能曬到多久？</h3><p>站在窗邊面向戶外，選窗向，再填前方遮蔽物頂端高出水平線的角度。前方空曠可填 0°。</p>
        <div class="env-inputs"><label>窗戶朝向<select id="envFacing"><option value="">請選窗向</option>${directions.map((d,i)=>`<option value="${i*45}">${d}（${i*45}°）</option>`).join('')}</select></label>
        <label>遮蔽仰角（0° 至 90°）<input id="envHorizon" type="number" inputmode="decimal" min="0" max="90" step="any" placeholder="請填角度"></label></div>
        <div id="envExposure" role="status"></div><p class="env-note">以晴天、垂直窗面和前方同一遮蔽角計算。實際直曬還受陽台深度、左右鄰棟、樹木與雲量影響。</p></section>${attribution}`;
      const date = find('envDate'), facing = find('envFacing'), horizon = find('envHorizon');
      date.value = state.date; facing.value = state.facing; horizon.value = state.horizon;
      function paint() {
        state.date = date.value; state.facing = facing.value; state.horizon = horizon.value;
        const day = date.validity.valid && validDate(state.date) && sun.day(c.lat,c.lon,state.date);
        const metric = (name, val, note) => `<div><dt>${name}</dt><dd>${val}</dd><small>${note}</small></div>`;
        find('envDay').innerHTML = day ? `<dl class="env-metrics">${metric('日出',day.sunrise,'方位 '+Math.round(day.sunriseAzimuth)+'°')}${metric('日落',day.sunset,'方位 '+Math.round(day.sunsetAzimuth)+'°')}${metric('白晝',when(day.daylightMinutes),'太陽過中天 '+day.solarNoon)}</dl>` : '<p>請選擇 1901 至 2099 年內的有效日期。</p>';
        const result = day && sun.exposure(c.lat,c.lon,state.date,state.facing,state.horizon);
        if (!result) {
          find('envExposure').textContent = state.horizon && !validHorizon(state.horizon) ? '遮蔽仰角請填 0 至 90 度。' : '日期、窗向與仰角填妥後，這裡會列出預估直曬時段。';
          return;
        }
        const percent = Number(result.percent.toFixed(1));
        find('envExposure').innerHTML = `<strong>${when(result.directMinutes)}</strong> · 占當日白晝 ${percent}%<meter min="0" max="100" value="${percent}" aria-label="預估窗面直曬占白晝比例"></meter><span>${result.intervals.length ? result.intervals.map(i=>i.start+'–'+i.end).join('、') : '依這組條件，當天沒有直曬時段。'}</span>`;
      }
      date.oninput = facing.onchange = horizon.oninput = paint;
      paint();
    }

    function showGround(body) {
      const fault = window.MapFaults?.lookup(c);
      const subsidence = precise && window.MapSubsidence?.lookup(Number(c.lat),Number(c.lon));
      const geolink = new URL(location.pathname,location.origin);
      geolink.searchParams.set('community',c.id);geolink.searchParams.set('view','building');geolink.searchParams.set('layer','subsidence');
      body.innerHTML = `<section class="env-card"><h3>活動斷層地質敏感區</h3><div id="envFault"><strong>${esc(fault?.label || '公告圖層暫時無法載入')}</strong><p>${esc(fault?.detail || '請至經濟部地質敏感區圖台，以地段、地號核對公告範圍。')}</p></div>
        <details id="envFaultOverview"><summary>看全市公告範圍與社區位置</summary><div class="env-map-view"></div></details>
        <p class="env-note">來源為經濟部地質調查及礦業管理中心，圖資核對 ${esc(window.MapFaults?.source?.checked || '日期待核')}。${fault?.noticeDate ? ' 本區公告日期 '+esc(fault.noticeDate)+'。' : ''}</p>
        ${links(link('https://gsa.gsmma.gov.tw/gwh/gsb97-1/sys_2014b_pg/index.cfm','公告敏感區與地號查詢'),link('https://faultgis.gsmma.gov.tw/gis/','全臺活動斷層圖'),fault?.districtNote ? link(fault.districtSourceUrl,'市府行政區斷層資料') : '')}</section>
        <section class="env-card"><h3>地層下陷觀測</h3><p id="envSubsidence">${esc(subsidence?.summary || (precise?'水利署觀測圖層尚待載入。':'可先看全市觀測範圍，社區精確位置待核。'))}</p>
        ${links(link(geolink.href,'在社區地質圖查看下陷線及測站'),link('https://www.wra.gov.tw/cp.aspx?n=3679','水利署地層下陷現況'))}</section>
        <section class="env-card"><h3>土壤液化潛勢</h3><div id="envSoil" role="status"></div><p class="env-note">區域土層調查可供看屋初查。個別基地請核對鑽探、地下水位與基礎設計。</p>
        ${links(link('https://www.liquid.net.tw/TainanMAP/Web/Map.aspx','台南市門牌查詢'),link('https://data.gov.tw/dataset/122721','市府開放圖資'))}</section>`;
      const overview = find('envFaultOverview');
      overview.ontoggle = () => {
        const view = overview.querySelector('.env-map-view');
        if (overview.open && !view.hasChildNodes()) options.drawFaultMap(view,c);
      };
      const box = find('envSoil');
      if (!precise) {
        box.textContent = usable ? '位置由主號或鄰近門牌推估，請改以完整門牌或地號查原圖。' : '社區缺少可用座標，可至市府圖台輸入門牌。';
        return;
      }
      function fillSoil() {
        box.textContent = '正在核對市府圖層…';
        loadSoil().then(data => {
          if (!box.isConnected) return;
          const key = `${Number(c.lon).toFixed(7)},${Number(c.lat).toFixed(7)}`;
          const code = data.locations[key];
          box.innerHTML = `<strong>${esc(soilLabels[code] || '這個座標尚待比對')}</strong><p>套疊社區參考點，並交叉比對工務局下載檔與線上圖層。${code === 'edge' ? '距其中一份圖的界線 '+Number(data.boundaryMetres)+' 公尺內或分區重疊，保留待核。' : ''}下載圖資更新 ${esc(data.sourceDate)}，兩份來源核對於 ${esc(data.serviceChecked)}。</p>`;
        }).catch(() => {
          if (!box.isConnected) return;
          box.innerHTML = '<p>土壤圖資暫時無法載入。</p><button type="button">重試土壤圖資</button>';
          box.querySelector('button').onclick = fillSoil;
        });
      }
      fillSoil();
    }

    function renderTopic() {
      root.querySelectorAll('[data-env-topic]').forEach(button => {
        button.setAttribute('aria-pressed',String(button.dataset.envTopic === state.topic));
        button.onclick = () => { state.topic = button.dataset.envTopic; renderTopic(); };
      });
      const body = find('envTopicBody');
      if (state.topic === 'sun') showSun(body);
      else if (state.topic === 'ground') showGround(body);
      else body.innerHTML = window.MapRecords?.render(state.topic,c) || '<p>來源說明暫時無法載入，請重新整理。</p>';
    }
    renderTopic();
  }
  window.MapEnvironment = Object.freeze({mount});
})();
