(() => {
  'use strict';
  const scriptUrl = new URL(document.currentScript.src);
  const base = new URL('.', scriptUrl);
  const directories = {sale:'market-ledger/', presale:'presale-ledger/'};
  const cachedManifests = new Map(), cachedDistricts = new Map();
  const pageSize = 20, number = new Intl.NumberFormat('zh-TW', {maximumFractionDigits:4});
  const unitNumber = new Intl.NumberFormat('zh-TW', {maximumFractionDigits:2});
  let dialog, elements, opener, activeMarket, manifest, rows, results, page, request = 0;
  let fixedDistrict = false, projectAreas = [];

  function normalized(value) {
    const digits = '〇一二三四五六七八九';
    return String(value || '').normalize('NFKC').toLowerCase().replace(/臺/g, '台').replace(/^台南[市縣]/,'')
      .replace(/[‐‑–—－]/g, '-').replace(/([一二三四五六七八九])段/g, (_, n) => digits.indexOf(n) + '段')
      .replace(/\s/g, '');
  }
  function create(tag, className, value) {
    const item = document.createElement(tag);
    if (className) item.className = className;
    if (value !== undefined) item.textContent = value;
    return item;
  }
  function formatDate(value) {
    return /^\d{4}-\d\d-\d\d$/.test(value) ? value.replaceAll('-', '/') :
      '交易日期待核' + (String(value || '').slice(1) ? '（原值 ' + value.slice(1) + '）' : '');
  }
  async function responseFor(url) {
    const response = await fetch(url, {credentials:'omit'});
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return response;
  }
  function getManifest(market) {
    if (!cachedManifests.has(market)) {
      const url = new URL(directories[market] + 'manifest.json', base);
      url.search = scriptUrl.search;
      const pending = responseFor(url).then(response => response.json()).then(data => {
        if (data.schema !== 1 || data.market !== market || !data.districts || !data.sources?.length)
          throw new Error('Invalid market manifest');
        return data;
      }).catch(error => { cachedManifests.delete(market); throw error; });
      cachedManifests.set(market, pending);
    }
    return cachedManifests.get(market);
  }
  async function readPart(root, part) {
    let content;
    if (part.gzip && typeof DecompressionStream === 'function') {
      const packed = await (await responseFor(new URL(part.gzip, root))).arrayBuffer();
      const signature = new Uint8Array(packed, 0, 2);
      content = signature[0] === 31 && signature[1] === 139 ?
        await new Response(new Blob([packed]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer() : packed;
    } else {
      content = await (await responseFor(new URL(part.file, root))).arrayBuffer();
    }
    if (content.byteLength !== part.bytes) throw new Error('Wrong shard length');
    if (crypto.subtle && part.sha256) {
      const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', content)),
        n => n.toString(16).padStart(2, '0')).join('');
      if (digest !== part.sha256) throw new Error('Wrong shard digest');
    }
    const data = JSON.parse(new TextDecoder().decode(content));
    if (!Array.isArray(data) || data.length !== part.count) throw new Error('Wrong shard count');
    return data;
  }
  function getDistrict(market, district, entry) {
    const key = market + '/' + district;
    if (!cachedDistricts.has(key)) {
      const root = new URL(directories[market], base);
      const pending = Promise.all(entry.parts.map(part => readPart(root, part))).then(parts => {
        const combined = parts.flat();
        if (combined.length !== entry.count) throw new Error('Wrong district count');
        return combined.map(row => {
          const address = normalized(row[1]);
          const qualified = address.startsWith(district) ? address : district + address;
          return {row, key:[qualified,normalized(row[10]),normalized(row[11])].join('|')};
        });
      }).catch(error => { cachedDistricts.delete(key); throw error; });
      if (cachedDistricts.size >= 3) cachedDistricts.delete(cachedDistricts.keys().next().value);
      cachedDistricts.set(key, pending);
    }
    return cachedDistricts.get(key);
  }

  function makeDialog() {
    dialog = create('dialog', 'market-ledger');
    dialog.setAttribute('aria-labelledby', 'ledger-title');
    dialog.innerHTML = `
      <div class="ledger-frame">
        <header class="ledger-header"><h2 id="ledger-title">查實價登錄</h2>
          <button class="ledger-close" type="button" aria-label="關閉實價登錄查詢">關閉 ×</button></header>
        <div class="ledger-body">
          <div class="ledger-switch" role="group" aria-label="市場">
            <button type="button" data-ledger-market="sale">建物買賣</button>
            <button type="button" data-ledger-market="presale">預售屋成交</button></div>
          <p class="ledger-coverage"></p>
          <div class="ledger-fields">
            <label>行政區<select class="ledger-district"></select></label>
            <label><span class="ledger-search-label">路名或門牌</span><input class="ledger-query" type="search" autocomplete="off" enterkeyhint="search"></label>
          </div>
          <label class="ledger-unlinked"><input type="checkbox">只看未連到社區明細的買賣</label>
          <details class="ledger-source"><summary>資料範圍與價格口徑</summary><p class="ledger-source-note"></p>
            <p>每筆保留官方總價，單價依官方公布的每平方公尺換算為每坪。官方未列單價時留白。各筆是否拆算車位，請核對原始資料。</p>
            <p class="ledger-method"></p>
            <p class="ledger-link-note" hidden></p>
            <details class="ledger-link-audit" hidden><summary>全市還有哪些成交無法確認社區？</summary><p></p><ul></ul></details>
            <a href="https://plvr.land.moi.gov.tw/DownloadOpenData" target="_blank" rel="noopener">內政部批次資料 ↗</a> ·
            <a href="https://lvr.land.moi.gov.tw/" target="_blank" rel="noopener">官方即時查詢 ↗</a></details>
          <section class="ledger-results" aria-label="成交明細">
            <p class="ledger-status" role="status" aria-live="polite"></p>
            <button type="button" class="ledger-retry" hidden>重新載入</button>
            <div class="ledger-rows"></div>
            <nav class="ledger-pages" aria-label="查詢結果分頁" hidden>
              <button type="button" class="ledger-prev">上一頁</button>
              <span class="ledger-page"></span>
              <button type="button" class="ledger-next">下一頁</button></nav>
          </section>
        </div></div>`;
    document.body.append(dialog);
    const pick = cls => dialog.querySelector('.ledger-' + cls);
    elements = Object.fromEntries(['district','query','unlinked','source','coverage','method',
      'source-note','link-note','link-audit','search-label','status','retry','rows','pages','prev','next','page','body','results']
      .map(key => [key,pick(key)]));
    elements.unlinkedInput = elements.unlinked.querySelector('input');
    pick('close').addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => {
      if (dialog.open) return;
      request++;
      document.body.classList.remove('market-ledger-open');
      opener?.focus?.({preventScroll:true});
    });
    dialog.addEventListener('click', event => {
      if (event.target === dialog) dialog.close();
      const market = event.target.closest('[data-ledger-market]')?.dataset.ledgerMarket;
      if (market && market !== activeMarket) changeMarket(market, elements.district.value);
    });
    elements.district.addEventListener('change', () => {
      fixedDistrict = Boolean(elements.district.value);
      loadSelected();
    });
    elements.query.addEventListener('input', () => {
      if (!fixedDistrict && manifest) {
        const area = districtFromInput();
        if (!area || area !== elements.district.value) {
          elements.district.value = area;
          loadSelected();
          return;
        }
      }
      filter();
    });
    elements.unlinkedInput.addEventListener('change', filter);
    elements.retry.addEventListener('click', () => manifest ? loadSelected() : changeMarket(activeMarket, elements.district.value));
    elements.prev.addEventListener('click', () => turnPage(-1));
    elements.next.addEventListener('click', () => turnPage(1));
  }

  function resetResults(message) {
    rows = null;
    results = [];
    page = 0;
    elements.status.textContent = message;
    elements.rows.replaceChildren();
    elements.pages.hidden = true;
    elements.retry.hidden = true;
  }
  function failed() {
    elements.status.textContent = '資料載入失敗，請重新載入。';
    elements.retry.hidden = false;
  }
  async function changeMarket(market, preferred) {
    const token = ++request;
    activeMarket = market;
    manifest = null;
    const sale = market === 'sale';
    dialog.querySelectorAll('[data-ledger-market]').forEach(b =>
      b.setAttribute('aria-pressed', String(b.dataset.ledgerMarket === market)));
    elements.unlinked.hidden = !sale;
    elements['search-label'].textContent = sale ? '路名或門牌' : '建案、路名或棟樓';
    elements.query.placeholder = sale ? '例如：永華路二段' : '輸入案名、路名或棟樓編號';
    elements.coverage.textContent = '';
    elements['source-note'].textContent = '';
    elements['link-note'].hidden = true;
    elements['link-audit'].hidden = true;
    elements['link-audit'].open = false;
    elements.method.textContent = sale ?
      '「連到社區明細」須同時對到既有明細的官方檔名、原始紀錄序號與編號。地址依原檔呈現。備註標籤取自原文關鍵詞，原檔無備註也不能判定為一般交易。' :
      '本頁列出內政部公開預售實價登錄。建案、棟樓與解約註記依原檔，與預售屋買賣定型化契約備查分列。';
    elements.district.replaceChildren(new Option('請選行政區', ''));
    elements.district.disabled = true;
    resetResults('正在讀取行政區清單…');
    try {
      const data = await getManifest(market);
      if (token !== request) return;
      manifest = data;
      const audit = elements['link-audit'];
      if (sale && data.doorReview) {
        const review = data.doorReview;
        audit.querySelector('p').textContent = '透過完整門牌與單棟使照等證據，已補對 ' + number.format(review.additional) +
          ' 筆買賣。' + (data.registrySnapshot ? '社區名冊收錄至 '+data.registrySnapshot.fileAsOf+'，市府發布於 '+data.registrySnapshot.publishedAt+'。' : '') +
          '尚待確認的每筆交易，依核對時遇到的第一項缺口計一次。';
        audit.querySelector('ul').replaceChildren(...Object.entries(review.residualReasons).sort((a,b)=>b[1]-a[1])
          .map(([reason,n])=>create('li','',reason + ' · ' + number.format(n) + ' 筆')));
        audit.hidden = false;
      }
      elements.coverage.textContent = (sale ? '含建物買賣' : '預售屋成交登錄') + ' ' +
        number.format(data.count) + ' 筆 · 公告至 ' + data.latestBatch.replaceAll('-', '/');
      elements['source-note'].textContent = [data.coverage,data.note].filter(Boolean).join(' ');
      Object.keys(data.districts).sort((a,b) => a.localeCompare(b,'zh-Hant')).forEach(d =>
        elements.district.add(new Option(d + ' · ' + number.format(data.districts[d].count) + ' 筆', d)));
      fixedDistrict = Object.hasOwn(data.districts, preferred);
      elements.district.value = fixedDistrict ? preferred : districtFromInput();
      elements.district.disabled = false;
      await loadSelected();
    } catch { if (token === request) failed(); }
  }
  function districtFromInput() {
    const text = normalized(elements.query.value);
    projectAreas = [];
    const prefix = Object.keys(manifest.districts).find(d => text.startsWith(d));
    if (prefix || !text || !manifest.projectDistricts) return prefix || '';
    const entries = Object.entries(manifest.projectDistricts);
    const exact = entries.find(([name]) => normalized(name) === text);
    const candidates = exact ? [exact] : entries.filter(([name]) => {
      const key = normalized(name);
      return key && (key.includes(text) || text.includes(key));
    });
    projectAreas = [...new Set(candidates.flatMap(([, districts]) => districts))];
    return projectAreas.length === 1 ? projectAreas[0] : '';
  }
  async function loadSelected() {
    const district = elements.district.value, token = ++request;
    const note = elements['link-note'];
    note.hidden = activeMarket !== 'sale' || !manifest;
    if (!note.hidden) {
      const scope = manifest.districts[district] || manifest;
      if (Number.isInteger(scope.communityRows)) {
        const unmatched = scope.count - scope.communityRows;
        const groups = Object.entries(scope.unlinkedByType || {}).sort((a,b)=>b[1]-a[1]).slice(0,3)
          .map(([i,n]) => manifest.labels.types[i].split('(')[0] + ' ' + number.format(n) + ' 筆');
        note.textContent = (district || '全市') + '已連到社區 ' + number.format(scope.communityRows) + ' 筆，尚未連到社區 ' +
          number.format(unmatched) + ' 筆，均可在此查詢。' + (groups.length ? '未連結案件中數量最多的類型為' + groups.join('、') + '。' : '') +
          '原始資料含透天厝及其他建物，一筆交易也可能是同一戶再次移轉。';
      } else note.hidden = true;
    }
    resetResults(district ? '正在載入' + district + '成交資料…' : projectAreas.length > 1 ?
      '符合的建案涵蓋' + projectAreas.join('、') + '，請選擇其中一區。' : elements.query.value.trim() ?
      '請選擇行政區，接著會依目前的關鍵字搜尋該區。' : '選擇行政區後即可查詢該區全部期間的成交。');
    if (!district || !manifest) return;
    try {
      const records = await getDistrict(activeMarket, district, manifest.districts[district]);
      if (token !== request) return;
      rows = records;
      filter();
    } catch { if (token === request) failed(); }
  }
  function filter() {
    if (!rows) return;
    const terms = elements.query.value.trim().split(/\s+/).map(normalized).filter(Boolean);
    const onlyUnlinked = activeMarket === 'sale' && elements.unlinkedInput.checked;
    results = rows.filter(item => (!onlyUnlinked || item.row[12] === 0) &&
      terms.every(term => item.key.includes(term)));
    page = 0;
    paint();
  }
  function detailLine(box, name, text) {
    box.append(create('dt','',name), create('dd','',text));
  }
  function amount(value, divisor, suffix) {
    return value == null ? '未提供' : number.format(value/divisor) + suffix;
  }
  function resultCard(row, openBuilding) {
    const sale = activeMarket === 'sale', flag = manifest.labels.flags[row[7]];
    const card = create('article','ledger-card');
    const first = create('div','ledger-card-top'), heading = create('h3','',sale ?
      (row[1] || '地址未載') : (row[10] || row[1] || '案名未載'));
    first.append(heading,create('time','ledger-date',formatDate(row[0])));
    card.append(first);
    const context = [sale ? '' : row[1], sale ? '' : row[11], manifest.labels.types[row[2]], row[3]].filter(Boolean);
    if (context.length) card.append(create('p','ledger-context',context.join(' · ')));
    if (!sale && flag && flag !== '—') {
      const canceled = /全部解約|部分解約|有解約登載/.test(flag);
      card.append(create('span',canceled ? 'ledger-cancelled' : 'ledger-flag',flag));
    }
    const prices = create('div','ledger-prices');
    prices.append(create('b','',row[4] == null ? '總價未提供' : amount(row[4],10000,' 萬元')),
      create('span','',row[5] == null || row[5] <= 0 ? '單價未提供' :
        unitNumber.format(row[5] * 3.305785124 / 10000) + ' 萬元／坪'));
    card.append(prices);
    if (sale && flag) card.append(create('p','ledger-flag',flag));
    if (sale && window.AddressFloors) {
      const floors = window.AddressFloors.attach(card, row, elements.district.value, rows, manifest);
      if (floors && openBuilding) floors.open = true;
    }
    const details = create('details','ledger-record'), dl = create('dl');
    details.append(create('summary','','面積、車位與原始紀錄'));
    if (row[15] && sale) detailLine(dl,'交易標的',row[15]);
    detailLine(dl,'建物移轉面積',amount(row[6],1,' 平方公尺'));
    detailLine(dl,'車位總價',amount(row[13],10000,' 萬元'));
    detailLine(dl,'車位移轉面積',amount(row[14],1,' 平方公尺'));
    if (sale) detailLine(dl,'社區明細',row[12] ? '已連到社區明細' : '未連到社區明細');
    const src = manifest.sources[row[8]], source = create('a','ledger-source-link',src.label + ' · CSV 第 ' + number.format(row[9]) + ' 筆紀錄 ↗');
    source.href = src.url; source.target = '_blank'; source.rel = 'noopener';
    details.append(dl,source);
    if (src.url.includes('DownloadHistory') || src.member) {
      details.append(create('small','ledger-file-note','開啟封存 ZIP 後讀取 '+(sale?'d_lvr_land_a.csv':'d_lvr_land_b.csv')+'。'));
    } else if (src.url.includes('/Download?')) {
      details.append(create('small','ledger-file-note','當期下載網址會隨公告換檔，可依上方日期到內政部歷史批次查閱。'));
    }
    card.append(details);
    return card;
  }
  function paint() {
    const count = results.length, pages = Math.ceil(count/pageSize), start = page*pageSize;
    elements.status.textContent = count ? elements.district.value + '共 ' + number.format(count) +
      ' 筆符合，顯示第 ' + number.format(start+1) + '–' + number.format(Math.min(start+pageSize,count)) + ' 筆。' :
      manifest.districts[elements.district.value]?.count === 0 ?
      '本次收錄的官方檔案中，沒有標在本區的成交。行政區未揭露的資料另列於「行政區未載」。' :
      '本區在目前條件下查無成交，可縮短關鍵字或調整條件。';
    const district = elements.district.value, term = normalized(elements.query.value);
    const firstBuilding = activeMarket === 'sale' && !start && term.endsWith('號') && results.length
      ? window.AddressFloors?.identify(results[0].row, district) : null;
    const exactDoor = firstBuilding && [district+term,term].includes(normalized(firstBuilding.door)) &&
      results.every(item => window.AddressFloors.identify(item.row,district)?.key === firstBuilding.key);
    elements.rows.replaceChildren(...results.slice(start,start+pageSize).map((item, i) => resultCard(item.row, i === 0 && exactDoor)));
    elements.pages.hidden = pages <= 1;
    elements.page.textContent = (page+1) + ' / ' + pages;
    elements.prev.disabled = !page;
    elements.next.disabled = page+1 >= pages;
  }
  function turnPage(direction) {
    const next = page + direction;
    if (next < 0 || next*pageSize >= results.length) return;
    page = next;
    paint();
    elements.results.scrollIntoView({block:'start'});
    elements.status.tabIndex = -1;
    elements.status.focus({preventScroll:true});
  }
  function open(options = {}) {
    if (!dialog) makeDialog();
    if (!dialog.open) {
      opener = document.activeElement;
      dialog.showModal();
      document.body.classList.add('market-ledger-open');
    }
    elements.body.scrollTop = 0;
    elements.query.value = options.query || '';
    elements.unlinkedInput.checked = Boolean(options.unlinked);
    elements.source.open = false;
    changeMarket(options.market === 'presale' ? 'presale' : 'sale', options.district || '');
  }
  document.addEventListener('click', event => {
    const trigger = event.target.closest('[data-open-market-ledger]');
    if (!trigger) return;
    event.preventDefault();
    open(trigger.dataset);
  });
  window.MapMarketLedger = {open};
})();
