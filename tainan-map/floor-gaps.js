(() => {
  'use strict';

  const host = typeof window === 'undefined' ? globalThis : window;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c =>
    ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
  const price = cents => (cents / 100).toLocaleString('zh-TW', {minimumFractionDigits:2, maximumFractionDigits:2});
  const level = n => n < 0 ? `地下 ${-n} 樓` : `${n} 樓`;
  const area = n => n.toLocaleString('zh-TW', {minimumFractionDigits:2, maximumFractionDigits:2});
  const roomLayout = row => `${row.roomCount}房${row.hallCount}廳${row.bathCount}衛`;
  const halfYear = key => key.slice(0, 4) + ' 年' + (key.endsWith('1') ? '上半年' : '下半年');
  const parkingLabels = {'無車位':'無車位', '車位價與面積均扣除':'已拆算車位'};

  function normalizedSection(address) {
    return address.replace(/([路街道])([一二兩三四五六七八九十]+)段/g, (raw, road, value) => {
      const number = host.FloorSales.floorInfo(value + '層').number;
      return Number.isInteger(number) ? road + number + '段' : raw;
    });
  }

  function sameReportedDoor(raw, label, district) {
    // Older MOI batches store the district in its own CSV column and omit it from the address.
    const street = raw.replace(/^(?:台|臺)南市/, '');
    const exact = label.normalize('NFKC').replace(/^(?:台|臺)南市/, '');
    if (!district || !exact.startsWith(district) || /^[街路巷弄段號]/.test(exact.slice(district.length))) return false;
    const full = !street.includes('區') ? district + street : street;
    return host.FloorSales.addressMatches(normalizedSection(full), normalizedSection(exact));
  }

  function summarizeFloor(n, entries) {
    const ordered = entries.map(r => r.unitWan).sort((a, b) => a - b);
    const mid = Math.floor(ordered.length / 2);
    const median = ordered.length % 2 ? ordered[mid] : (ordered[mid - 1] + ordered[mid]) / 2;
    const dates = entries.map(row => row.date).sort();
    return {n, entries, cents:Math.round(median * 100), count:entries.length,
      from:dates[0], through:dates.at(-1)};
  }

  // Start with FloorSales' exact registry matches and the existing audited unit price.
  // Skip ambiguous raw doorplate ranges, multiple units and named building suffixes.
  function qualified(record, district) {
    const row = record.row;
    if (!record.comparable || !record.address.exact || row.singleBuilding !== true ||
        !record.floor.single || !Number.isInteger(record.floor.number) || record.floor.number === 0 ||
        !Number.isFinite(row.unitWan) || row.unitWan <= 0 || !Number.isFinite(row.areaPing) || row.areaPing <= 0) return false;
    if (!['residential', 'shop'].includes(row.propertyUse) || !row.category || row.category === 'unknown' ||
        !Object.hasOwn(parkingLabels, row.parkingMode) || !row.mainUse || !row.buildingType ||
        ![row.roomCount, row.hallCount, row.bathCount].every(n => Number.isFinite(n) && n >= 0)) return false;
    const raw = String(row.address || '').normalize('NFKC').trim();
    // Each record must independently name one doorplate. An inferred unit ID alone is insufficient.
    if (!sameReportedDoor(raw, record.address.label, district) || (raw.match(/號/g) || []).length !== 1) return false;
    const doorEnd = raw.indexOf('號');
    if (/[\d一二兩三四五六七八九十][~～至、,及][\d一二兩三四五六七八九十]+$/.test(raw.slice(0, doorEnd))) return false;
    const suffix = raw.slice(doorEnd + 1).replace(/\s/g, '');
    const unit = suffix.match(/^(?:之[\d零〇一二兩三四五六七八九十百千]+)?(?:((?:地下)?[\d零〇一二兩三四五六七八九十百千]+)[樓層](?:之[\d零〇一二兩三四五六七八九十百千]+)?)?$/);
    return !!unit && (!unit[1] || host.FloorSales.floorInfo(unit[1] + '層').number === record.floor.number);
  }

  function group(model, community) {
    const doors = new Map();
    for (const label of [...(community.primaryExactAddresses || []), ...(community.exactAddresses || [])]) {
      if (label && !doors.has(label)) doors.set(label, {label, samples:[]});
    }
    const groups = new Map();
    for (const record of model.records) {
      if (!qualified(record, community.district)) continue;
      const row = record.row, label = record.address.label;
      if (!doors.has(label)) doors.set(label, {label, samples:[]});
      const period = row.date.slice(0, 4) + (row.date.slice(5, 7) < '07' ? '-1' : '-2');
      const size = Math.floor(row.areaPing / 2) * 2;
      const profile = [row.propertyUse, row.category, row.mainUse, row.buildingType, roomLayout(row), row.parkingMode, size];
      const key = JSON.stringify([label, period, ...profile]);
      if (!groups.has(key)) {
        const sample = {period, size, row, byFloor:new Map(), count:0, latest:''};
        groups.set(key, sample);
        doors.get(label).samples.push(sample);
      }
      const sample = groups.get(key), n = record.floor.number;
      if (!sample.byFloor.has(n)) sample.byFloor.set(n, []);
      sample.byFloor.get(n).push(row);
      sample.count++;
      if (row.date > sample.latest) sample.latest = row.date;
    }
    for (const sample of groups.values()) {
      sample.floors = [...sample.byFloor].map(([n, entries]) => summarizeFloor(n, entries)).sort((a, b) => a.n - b.n);
      delete sample.byFloor;
    }
    const rank = (a, b) => Number(b.floors.length > 1) - Number(a.floors.length > 1) ||
      b.period.localeCompare(a.period) || b.floors.length - a.floors.length || b.count - a.count || b.latest.localeCompare(a.latest);
    for (const door of doors.values()) door.samples.sort(rank);
    return [...doors.values()].sort((a, b) => a.samples.length && b.samples.length ? rank(a.samples[0], b.samples[0]) :
      Number(Boolean(b.samples.length)) - Number(Boolean(a.samples.length)));
  }

  function closestPair(floors) {
    let pair = floors.slice(0, 2);
    for (let i = 1; i < floors.length; i++) {
      if (floors[i].n - floors[i-1].n < pair[1].n - pair[0].n) pair = [floors[i-1], floors[i]];
    }
    return pair.map(floor => floor.n);
  }
  function optionList(select, list, chosen) {
    select.replaceChildren(...list.map(([value, label]) => new Option(label, String(value))));
    select.value = String(chosen);
    select.disabled = list.length <= 1;
  }

  function mount(root, community, model, options = {}) {
    const doors = group(model, community);
    let door, sample, baseline, target;
    root.innerHTML = `<section class="floor-gaps" data-floor-gaps aria-label="同棟樓層價差">
      <header><p class="fg-place"></p><h3>${Number(community.buildingCount) > 1 ? '同門牌樓層價差' : '同棟樓層價差'}</h3></header>
      <div class="fg-fields">
        <label>查詢門牌<select data-gap-door></select></label>
        <label data-gap-period-field>成交期間<select data-gap-period></select></label>
        <label class="fg-profile" data-gap-profile-field>房型、坪數與車位<select data-gap-profile></select></label>
      </div>
      <p class="fg-scope"></p>
      <div data-gap-results></div>
      <details class="fg-method"><summary>這些價格怎麼比？</summary><p data-gap-bounds></p>
      <p>只比較名冊可核對的同一門牌、單一建物及單一移轉樓層。交易須在同一曆年上半年或下半年，並且用途、建物型態、房廳衛數及車位拆算方式相同。建物移轉總坪數每 2 坪分一組，含車位時這個坪數也含車位面積。</p>
      <p>每層用實價登錄可比單價的中位數，差額以畫面上的兩個單價相減。屋況、座向、裝修和成交月份也會影響價格，不能把這個差額當作每升一樓的固定加價。</p>
      <a href="https://lvr.land.moi.gov.tw/" target="_blank" rel="noopener noreferrer">內政部實價登錄查詢 ↗</a></details>
      </section>`;
    const find = selector => root.querySelector(selector);
    const doorPick = find('[data-gap-door]'), periodPick = find('[data-gap-period]'), profilePick = find('[data-gap-profile]');
    const results = find('[data-gap-results]');
    find('.fg-place').textContent = [community.district, community.name].filter(Boolean).join(' · ');
    const scope = [];
    if (options.filters) scope.push(options.filters);
    if (options.period?.start && options.period?.end) {
      find('[data-gap-bounds]').textContent = `本次查詢範圍為 ${options.period.start} 至 ${options.period.end}。`;
    }
    if (Number(community.buildingCount) > 1) scope.push(`名冊共 ${Number(community.buildingCount)} 棟，依門牌分開核算，實際棟別須再核對。`);
    find('.fg-scope').textContent = scope.join(' · ');
    const selectedDoor = doors.find(item => item.label === options.address) || doors[0];
    optionList(doorPick, doors.length ? doors.map(item => [item.label, item.label]) : [['', '沒有可核對門牌']], selectedDoor?.label || '');

    function comparison() {
      const a = sample.floors.find(f => f.n === baseline), b = sample.floors.find(f => f.n === target);
      const diff = b.cents - a.cents;
      const result = find('[data-gap-difference]');
      const summary = a.n === b.n ? '請選擇兩個不同樓層' : diff === 0 ?
        `${level(b.n)}與${level(a.n)}顯示的中位單價相同` : `${level(b.n)}比${level(a.n)}每坪${diff > 0 ? '高' : '低'} ${price(Math.abs(diff))} 萬元`;
      result.textContent = summary;
      find('[data-gap-formula]').textContent = a.n === b.n ? '' : `${level(b.n)} ${price(b.cents)} − ${level(a.n)} ${price(a.cents)} ＝ ${diff < 0 ? '−' : ''}${price(Math.abs(diff))} 萬元／坪`;
    }

    function showSample() {
      if (!sample) {
        const entries = model.records.filter(r => r.address.exact && r.address.label === door?.label).length;
        let reason = '目前成交缺少符合比較條件的單一門牌、樓層、格局或可比價格。';
        if (!model.records.length) reason = '這個社區在目前選定的用途與期間，沒有可核對的成交紀錄。';
        else if (model.records.every(record => record.row.singleBuilding === false)) reason = '目前成交均合併多個建物或未載明單一建物，無法歸到一棟的單一樓層。';
        else if (!door) reason = '這個社區目前沒有可核對的精確門牌。';
        else if (!entries) reason = '這個門牌在目前查詢範圍內沒有可核對的成交。';
        results.innerHTML = `<div class="fg-empty" data-gap-empty><strong>目前無法比較樓層價差</strong><p>${reason}</p></div>`;
        return;
      }
      const {floors} = sample;
      const selected = closestPair(floors);
      [baseline, target] = selected;
      const floorRows = floors.map(f => `<tr data-gap-floor="${f.n}"><th scope="row">${level(f.n)}</th><td><strong>${price(f.cents)}</strong></td><td>${f.count}</td><td>${f.from}${f.from === f.through ? '' : '<br>至 '+f.through}</td></tr>`).join('');
      const transactions = floors.flatMap(f => f.entries.map(row => ({floor:f.n, row}))).sort((a, b) => b.row.date.localeCompare(a.row.date));
      const item = ({floor, row}) => `<li><strong>${level(floor)} · ${price(Math.round(row.unitWan * 100))} 萬／坪</strong><span>${esc(row.date)} · 移轉 ${area(row.areaPing)} 坪</span><small>${esc(row.address)}</small></li>`;
      const single = floors.length === 1;
      results.innerHTML = `<div class="fg-answer">${single ?
        `<strong data-gap-empty>只有 ${level(floors[0].n)}有符合條件的成交</strong><p>同組還需要另一個樓層的紀錄，才能算價差。</p>` :
        `<div data-gap-difference role="status"></div><p data-gap-formula></p>
        <div class="fg-pair"><label>基準樓層<select data-gap-base></select></label><label>比較樓層<select data-gap-target></select></label></div>`}</div>
        <p class="fg-note">${esc(sample.row.mainUse)} · ${esc(roomLayout(sample.row))} · ${sample.size} 至未滿 ${sample.size+2} 坪 · ${esc(parkingLabels[sample.row.parkingMode])}</p>
        <table class="fg-table"><caption>各樓層成交 · ${sample.count} 筆</caption><thead><tr><th scope="col">樓層</th><th scope="col">中位單價<br><small>萬元／坪</small></th><th scope="col">筆數</th><th scope="col">成交日期</th></tr></thead><tbody>${floorRows}</tbody></table>
        <p class="fg-note">${floors.some(f => f.count === 1) ? '只有 1 筆的樓層顯示該筆單價。' : ''}成交價差也受屋況、座向與時間影響。</p>
        <details class="fg-records"><summary>核對這組逐筆成交（${sample.count} 筆）</summary><ul>${transactions.map(item).join('')}</ul></details>`;
      if (single) return;
      const choices = floors.map(f => [f.n, level(f.n)]);
      const basePick = find('[data-gap-base]'), targetPick = find('[data-gap-target]');
      optionList(basePick, choices, baseline);
      optionList(targetPick, choices, target);
      basePick.onchange = () => { baseline = Number(basePick.value); comparison(); };
      targetPick.onchange = () => { target = Number(targetPick.value); comparison(); };
      comparison();
    }
    function showPeriod() {
      const samples = (door?.samples || []).filter(s => s.period === periodPick.value);
      sample = samples[0];
      optionList(profilePick, samples.map((s, i) => [i, `${s.row.mainUse} · ${roomLayout(s.row)} · ${s.size} 至未滿 ${s.size+2} 坪 · ${parkingLabels[s.row.parkingMode]} · ${s.row.buildingType}（${s.floors.length} 個樓層）`]), 0);
      profilePick.onchange = () => { sample = samples[Number(profilePick.value)]; showSample(); };
      showSample();
    }
    function showDoor() {
      door = doors.find(d => d.label === doorPick.value);
      const samples = door?.samples || [];
      const periods = [...new Set(samples.map(s => s.period))].sort().reverse();
      const paired = new Set(samples.filter(s => s.floors.length >= 2).map(s => s.period));
      optionList(periodPick, periods.map(p => [p, halfYear(p) + (paired.has(p) ? ' · 可比樓層' : ' · 各組僅一層')]), samples[0]?.period || '');
      find('[data-gap-period-field]').hidden = !samples.length;
      find('[data-gap-profile-field]').hidden = !samples.length;
      showPeriod();
    }
    doorPick.onchange = showDoor;
    periodPick.onchange = showPeriod;
    showDoor();
    return {
      get address() { return door?.label || ''; },
      selectDoor(label) {
        if (label !== door?.label && doors.some(d => d.label === label)) {
          doorPick.value = label;
          showDoor();
        }
      }
    };
  }
  host.FloorGaps = {group, mount};
})();
