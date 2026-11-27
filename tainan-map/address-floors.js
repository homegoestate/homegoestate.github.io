(() => {
  'use strict';
  const host = typeof window === 'undefined' ? globalThis : window;
  const priceFormat = new Intl.NumberFormat('zh-TW', {maximumFractionDigits: 2});
  const byDistrict = new WeakMap();
  function floorNumber(value) {
    return host.FloorSales.floorInfo(String(value).replace(/樓/g, '層')).number;
  }
  function identify(row, district) {
    const evidence = row[16];
    if (!evidence || !district || district === '行政區未載') return null;
    const level = floorNumber(row[3]), height = floorNumber(evidence[0]);
    if (!Number.isInteger(height) || height < 1 || height > 100 ||
        !Number.isInteger(level) || !level || level < -20 || level > height) return null;
    let raw = String(row[1]).normalize('NFKC').replace(/\s/g, '').replace(/臺/g, '台');
    raw = raw.replace(/^台南[市縣]/, '');
    if (raw.includes('區') && !raw.startsWith(district)) return null;
    if (!raw.startsWith(district)) raw = district + raw;
    if (/[~～至、,，;；\/／及&()（）‐–—－-]/.test(raw) || (raw.match(/號/g) || []).length !== 1) return null;
    // A suffix before the floor is part of the doorplate. A suffix after the floor is the unit.
    const match = raw.match(/^(.+(?:路|街|道|巷|弄|段)[\p{Script=Han}\d]*?\d+號(?:之\d+)?)(?:((?:地下)?[\d零〇一二兩三四五六七八九十]+)[樓層](?:之[\d零〇一二兩三四五六七八九十]+)?)?$/u);
    if (!match || (match[2] && floorNumber(match[2] + '層') !== level)) return null;
    const door = match[1].replace(/([路街道])([一二三四五六七八九十]+)段/g,
      (original, road, numeral) => road + floorNumber(numeral + '層') + '段');
    return {door, level, height, completed:evidence[1], key:JSON.stringify([door, evidence[1], height, row[2]])};
  }
  function forBuilding(items, district, building) {
    let index = byDistrict.get(items);
    if (!index) {
      index = new Map();
      for (const item of items) {
        const match = identify(item.row, district);
        if (!match) continue;
        if (!index.has(match.key)) index.set(match.key, []);
        index.get(match.key).push({row:item.row, level:match.level});
      }
      byDistrict.set(items, index);
    }
    return index.get(building.key) || [];
  }
  function summarize(entries, manifest, since) {
    const floors = new Map();
    for (const entry of entries) {
      const row = entry.row;
      if (since && (row[0] < since || row[0] > manifest.latestBatch)) continue;
      if (!floors.has(entry.level)) floors.set(entry.level, {records:[], prices:[]});
      const group = floors.get(entry.level);
      group.records.push(row);
      if (manifest.labels.floorPrice[row[16][2]] === '採計住宅單價' && row[5] > 0)
        group.prices.push(row[5] * 3.305785124 / 10000);
    }
    for (const group of floors.values()) {
      group.prices.sort((a,b) => a-b);
      const n = group.prices.length;
      if (n) group.median = (group.prices[Math.floor((n-1)/2)] + group.prices[Math.floor(n/2)])/2;
    }
    return floors;
  }
  function element(tag, text, className) {
    const el = document.createElement(tag);
    if (text !== undefined) el.textContent = text;
    if (className) el.className = className;
    return el;
  }
  const fName = n => n < 0 ? 'B' + (-n) : n + ' 樓';
  function against(floors, level, other) {
    const here = floors.get(level)?.median, there = floors.get(other)?.median;
    if (here == null) return '本層缺可比單價，無法與 '+fName(other)+' 計算';
    if (there == null) return fName(other)+' 缺可比單價';
    const delta = here-there;
    if (Math.abs(delta)<.005) return '與 '+fName(other)+' 每坪持平';
    return '比 '+fName(other)+(delta>0?' 每坪高 ':' 每坪低 ')+priceFormat.format(Math.abs(delta))+' 萬';
  }
  function attach(card, row, district, items, manifest) {
    const building = identify(row, district);
    if (!building) return;
    const panel = element('details', undefined, 'address-floors');
    panel.append(element('summary','看這個門牌的各樓層成交'));
    panel.addEventListener('toggle', () => {
      if (!panel.open || panel.children.length > 1) return;
      const entries = forBuilding(items, district, building);
      const title = element('h4', building.door);
      const period = element('select');
      period.setAttribute('aria-label','同門牌成交期間');
      period.add(new Option('全部期間','all')); period.add(new Option('近 3 年','3y'));
      const table = element('div', undefined, 'address-floor-table');
      const info = element('p', undefined, 'address-floor-caption');
      const note = element('p', '0 筆表示本次公開資料中沒有可定位到該門牌與樓層的成交。按原門牌、完工日、建物型態與總樓層分組。單價採用途明確、無備註且車位價格可區分的住宅。差額為本層中位數減下一層中位數，各層成交時點及格局可能不同。');
      panel.append(title, period, info, table, note);
      function render() {
        const start = new Date(manifest.latestBatch + 'T00:00:00Z');
        start.setUTCFullYear(start.getUTCFullYear()-3);
        const since = period.value === '3y' ? start.toISOString().slice(0,10) : '';
        const floors = summarize(entries, manifest, since);
        const count = [...floors.values()].reduce((n,g) => n + g.records.length,0);
        info.textContent = '完工 ' + building.completed + ' · 地上 ' + building.height + ' 層 · ' +
          (since ? since + ' 起' : '全部收錄期間') + ' · ' + count + ' 筆。單位為萬元／坪。';
        const header = element('div', undefined, 'address-floor-line address-floor-head');
        ['樓層','成交','中位單價','比下一層'].forEach(v=>header.append(element('span',v)));
        table.replaceChildren(header);
        const bottom = Math.min(1,...floors.keys());
        for (let n = building.height; n >= bottom; n--) {
          if (!n) continue;
          const group = floors.get(n), below = floors.get(n === 1 ? -1 : n-1);
          const line = element(group ? 'summary' : 'div', undefined, 'address-floor-line');
          const diff = group?.median != null && below?.median != null ? group.median - below.median : null;
          const d = diff == null ? '—' : Math.abs(diff) < .005 ? '0' : (diff>0 ? '+' : '−') + priceFormat.format(Math.abs(diff));
          [fName(n), group ? group.records.length + ' 筆' : '0 筆', group?.median == null ? '—' : priceFormat.format(group.median), d].forEach(v=>line.append(element('span',v)));
          if (!group) { table.append(line); continue; }
          const detail = element('details', undefined, 'address-floor-detail');
          detail.append(line);
          detail.addEventListener('toggle', () => {
            if (!detail.open || detail.children.length > 1) return;
            const adjacent = [];
            if (n < building.height) adjacent.push(against(floors,n,n === -1 ? 1 : n+1));
            if (n > bottom) adjacent.push(against(floors,n,n === 1 ? -1 : n-1));
            if (adjacent.length) detail.append(element('p', fName(n)+'中位單價 · '+adjacent.join('，')+'。'));
            detail.append(element('p','採計單價 ' + group.prices.length + ' 筆／本層 ' + group.records.length + ' 筆。'));
            for (const record of group.records) {
              const src = manifest.sources[record[8]];
              const link = element('a',record[0] + ' · ' + (record[5] > 0 ? priceFormat.format(record[5]*3.305785124/10000) + ' 萬／坪' : '單價未載') +
                ' · ' + manifest.labels.floorPrice[record[16][2]] + ' · ' + src.label + ' 第 ' + record[9] + ' 筆 ↗');
              link.href = src.url; link.target = '_blank'; link.rel = 'noopener'; detail.append(link);
            }
          });
          table.append(detail);
        }
      }
      period.addEventListener('change', render);
      render();
    });
    card.append(panel);
    return panel;
  }
  host.AddressFloors = {identify, forBuilding, summarize, attach};
})();
