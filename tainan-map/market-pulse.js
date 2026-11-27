(() => {
  'use strict';
  const root = document.getElementById('market-pulse');
  if (!root) return;
  let data;
  let area = '全市';
  let product = 'apartment';
  const count = value => value.toLocaleString('zh-TW');
  const month = value => Number(value.slice(5)) + ' 月';
  const yearMonth = value => value.slice(0, 4) + ' 年 ' + month(value);
  const change = value => (value > 0 ? '+' : '') + value.toFixed(2) + '%';
  const text = (tag, content, cls) => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (content !== undefined) el.textContent = content;
    return el;
  };
  const link = (label, url) => {
    const el = text('a', label);
    el.href = url;
    el.target = '_blank';
    el.rel = 'noopener';
    return el;
  };
  const panel = text('details', undefined, 'mp-panel');
  const opener = text('summary');
  const title = text('strong', '近期市況');
  const preview = text('span', '正在讀取市況…', 'mp-preview');
  const content = text('div', undefined, 'mp-content');
  const controls = text('div', undefined, 'mp-controls');
  const areaSelect = document.createElement('select');
  const typeSelect = document.createElement('select');
  const results = text('div', undefined, 'mp-results');
  results.setAttribute('aria-live', 'polite');
  const methods = document.createElement('details');
  const sources = text('div', undefined, 'mp-sources');
  methods.append(text('summary', '統計方法與原始資料'), sources);
  opener.append(title, preview);
  panel.append(opener, content);
  root.replaceChildren(panel);
  function openSharedView() {
    if (location.hash === '#market-pulse') panel.open = true;
  }
  openSharedView();
  window.addEventListener('hashchange', openSharedView);

  function selectControl(label, input) {
    const wrapper = text('label', label);
    wrapper.append(input);
    return wrapper;
  }

  function option(input, value, label) {
    const el = text('option', label);
    el.value = value;
    input.append(el);
  }

  function stat(label, reading, comparison) {
    const el = text('section', undefined, 'mp-stat');
    el.append(text('h3', label), text('strong', reading), text('p', comparison));
    return el;
  }

  function priceCell(value) {
    const cell = document.createElement('td');
    const reading = value.median === null ? '樣本不足' : value.median.toFixed(2);
    cell.append(text('strong', reading), text('small', count(value.n) + ' 筆樣本'));
    return cell;
  }

  function priceTable(record, current) {
    const table = document.createElement('table');
    table.append(text('caption', yearMonth(data.pricePeriod) + '住宅成交單價中位數（萬元／坪）'));
    const header = table.createTHead().insertRow();
    for (const title of ['市場', month(data.periods[current]), month(data.periods[current - 1])]) {
      const cell = text('th', title);
      cell.scope = 'col';
      header.append(cell);
    }
    const body = table.createTBody();
    for (const [phase, label] of [['sale', '買賣 A'], ['presale', '預售 B']]) {
      const row = body.insertRow();
      const heading = text('th', label);
      heading.scope = 'row';
      row.append(heading, priceCell(record[phase][current][product]), priceCell(record[phase][current - 1][product]));
    }
    return table;
  }

  function render() {
    if (!data) return;
    const record = data.areas[area];
    const [before, now] = record.transfers;
    const [previous, latest] = data.transferPeriods;
    const diff = now - before;
    const comparison = diff === 0 ? '持平' : (diff > 0 ? '增加 ' : '減少 ') + count(Math.abs(diff)) + ' 棟';
    const rate = before ? '（' + change(diff / before * 100) + '）' : '';
    const current = data.periods.indexOf(data.pricePeriod);
    preview.textContent = area + ' · ' + yearMonth(latest) + '買賣移轉 ' + count(now) + ' 棟';
    const incomplete = text('div', undefined, 'mp-disclosures');
    incomplete.append(text('h3', '按契約月看已揭露筆數'));
    const listing = text('ul');
    data.periods.forEach((period, i) => {
      const a = count(record.sale[i].disclosed) + ' 筆';
      const b = period > data.notice.presale[1].slice(0, 7) ? '尚未進入公告範圍' : count(record.presale[i].disclosed) + ' 筆';
      const item = text('li');
      item.append(text('b', month(period)), text('span', '買賣 ' + a + '、預售 ' + b));
      listing.prepend(item);
    });
    incomplete.append(listing, text('small', '實價資料至 ' + data.notice.published + ' 公告。近期契約仍會陸續揭露，各月的成交組成也會影響單價。'));
    const official = text('div', undefined, 'mp-official');
    official.append(stat(yearMonth(latest) + ' ' + area + '建物買賣移轉', count(now) + ' 棟', '較 ' + month(previous) + comparison + rate),
      stat(yearMonth(data.index.period) + ' 全市住宅價格指數', data.index.value.toFixed(2), '月變動 ' + change(data.index.mom) + '、年變動 ' + change(data.index.yoy)));
    results.replaceChildren(official, priceTable(record, current), incomplete);
  }

  function populate() {
    areaSelect.replaceChildren();
    option(areaSelect, '全市', '台南全市');
    Object.keys(data.areas).filter(name => name !== '全市').forEach(name => option(areaSelect, name, name));
    if (!data.areas[area]) area = '全市';
    areaSelect.value = area;
    option(typeSelect, 'apartment', '公寓、華廈、大樓');
    option(typeSelect, 'house', '透天厝');
    controls.append(selectControl('行政區', areaSelect), selectControl('單價樣本類型', typeSelect));
    areaSelect.onchange = () => {
      area = areaSelect.value;
      render();
    };
    typeSelect.onchange = () => {
      product = typeSelect.value;
      render();
    };
    const [a1, a2] = data.notice.sale;
    const [b1, b2] = data.notice.presale;
    const note = (copy, label, url) => {
      const p = text('p', copy + ' ');
      p.append(link(label, url));
      sources.append(p);
    };
    note('建物移轉依登記月計棟，涵蓋各類建物。全市值加總 37 區，資料發布於 ' + data.transferPublished + '。', '市府各區買賣統計 ↗', data.transferCatalog);
    note('住宅價格指數採市府公布的全市數值與變動率，本期發布於 ' + data.index.published + '。', '市府住宅價格公告 ↗', data.index.url);
    note('買賣 A 依契約月統計房地及僅建物案件。預售 B 按契約月及案件編號統計，排除含部分或全部解約註記的案件。同一住宅可能先後辦理預售簽約和買賣登記，兩欄分別計算。本批買賣登記日 ' + a1 + ' 至 ' + a2 + '，預售契約日 ' + b1 + ' 至 ' + b2 + '。', '內政部實價公告 ↗', data.moiUrl);
    sources.append(text('p', '單價樣本取主要用途為住家用、無交易備註、面積及價格為正的房地交易。含車位須有獨立的車位價格與面積。以原檔每平方公尺單價換算每坪後取中位數，每個市場及類型至少 ' + data.minN + ' 筆才顯示價格。'));
    const archive = text('p', '核對日期 ' + data.checkedOn + '。歷史來源可查 ');
    archive.append(link('買賣 A 來源清單', 'market-ledger/manifest.json'), '、', link('預售 B 來源清單', 'presale-ledger/manifest.json'), '、', link('本期市府 37 區原表', 'market-pulse/transfers-' + data.transferPeriods[1] + '.json'), '、', link('內政部該旬公告摘錄', 'market-pulse/moi-release.txt'), '。');
    sources.append(archive);
    content.replaceChildren(controls, results, methods);
    render();
  }

  async function load() {
    try {
      const response = await fetch('market-pulse/summary.json', {cache: 'no-cache'});
      if (!response.ok) throw new Error('市況資料下載失敗');
      const snapshot = await response.json();
      if (!snapshot.areas?.['全市'] || snapshot.schema !== 1) throw new Error('市況資料格式有誤');
      data = snapshot;
      populate();
    } catch {
      preview.textContent = '暫時無法讀取市況';
      const retry = text('button', '重新載入市況');
      retry.type = 'button';
      retry.onclick = load;
      content.replaceChildren(retry);
    }
  }

  window.MarketPulse = {
    setDistrict(name) {
      area = name || '全市';
      if (!data) return;
      if (!data.areas[area]) area = '全市';
      areaSelect.value = area;
      render();
    }
  };
  load();
})();
