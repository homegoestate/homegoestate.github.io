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
  const limits = {days:183, ping:2, fraction:0.08};
  const uses = {residential:'住宅', shop:'店面', unknown:'其他或用途待核'};
  const wholeCents = n => Math.round(n * 100);
  const profileKey = row => JSON.stringify([row.propertyUse, row.category, row.mainUse, row.buildingType,
    row.roomCount, row.hallCount, row.bathCount, row.parkingMode]);
  const nearCriteria = '成交日相距 183 天內，移轉總坪數相差 2 坪內，且差幅在較小一戶的 8% 內';

  function tradeId(row) {
    if (row.transactionId) return 'tx:' + row.transactionId;
    if (row.id) return 'id:' + row.id;
    if (row.sourceRow) return 'source:' + row.sourceRow;
    return 'row:' + JSON.stringify([row.address, row.floor, row.date, row.priceWan, row.areaPing, row.unitWan]);
  }

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
    return {n, entries, cents:wholeCents(median), count:entries.length,
      low:wholeCents(ordered[0]), high:wholeCents(ordered.at(-1)), from:dates[0], through:dates.at(-1)};
  }

  // Start with FloorSales' exact registry matches and the existing audited unit price.
  // Skip ambiguous raw doorplate ranges, multiple units and named building suffixes.
  function locatable(record, district) {
    const row = record.row;
    if (!record.current || !record.address.exact || row.singleBuilding !== true ||
        !record.floor.single || !Number.isInteger(record.floor.number) || record.floor.number === 0) return false;
    if (record.address.source === 'verified-door' || record.address.source === 'parcel') return true;
    const raw = String(row.address || '').normalize('NFKC').trim();
    // Each record must independently name one doorplate. An inferred unit ID alone is insufficient.
    if (!sameReportedDoor(raw, record.address.label, district) || (raw.match(/號/g) || []).length !== 1) return false;
    const doorEnd = raw.indexOf('號');
    if (/[\d一二兩三四五六七八九十][~～至、,及][\d一二兩三四五六七八九十]+$/.test(raw.slice(0, doorEnd))) return false;
    const suffix = raw.slice(doorEnd + 1).replace(/\s/g, '');
    const unit = suffix.match(/^(?:之[\d零〇一二兩三四五六七八九十百千]+)?(?:((?:地下)?[\d零〇一二兩三四五六七八九十百千]+)[樓層](?:之[\d零〇一二兩三四五六七八九十百千]+)?)?$/);
    return !!unit && (!unit[1] || host.FloorSales.floorInfo(unit[1] + '層').number === record.floor.number);
  }

  function hasPrice(record) {
    const row = record.row;
    return record.comparable && ['residential', 'shop'].includes(row.propertyUse) && Number.isFinite(row.unitWan) && row.unitWan > 0;
  }

  function hasProfile(record) {
    const row = record.row;
    return hasPrice(record) && Number.isFinite(row.areaPing) && row.areaPing > 0 && row.category && row.category !== 'unknown' &&
      Object.hasOwn(parkingLabels, row.parkingMode) && row.mainUse && row.buildingType &&
      [row.roomCount, row.hallCount, row.bathCount].every(n => Number.isFinite(n) && n >= 0);
  }

  function overview(records) {
    const sections = new Map();
    for (const record of records) {
      const use = Object.hasOwn(uses, record.row.propertyUse) ? record.row.propertyUse : 'unknown';
      if (!sections.has(use)) sections.set(use, new Map());
      const floors = sections.get(use), floor = record.floor.number;
      if (!floors.has(floor)) floors.set(floor, []);
      floors.get(floor).push(record);
    }
    return [...sections].map(([use, floors]) => ({
      use, floors:[...floors].sort(([a], [b]) => a - b).map(([n, entries]) => {
        entries.sort((a, b) => b.row.date.localeCompare(a.row.date));
        const priced = entries.filter(hasPrice).map(r => r.row);
        return {n, records:entries, stats:priced.length ? summarizeFloor(n, priced) : null,
          from:entries.at(-1).row.date, through:entries[0].row.date};
      })
    }));
  }

  // Group profiles before comparing individual records. Distances use the reported days
  // and unrounded areas. Only compare records on different floors of the selected door.
  function nearPairs(records) {
    const profiles = new Map(), pairs = [];
    for (const record of records.filter(hasProfile)) {
      const key = profileKey(record.row);
      if (!profiles.has(key)) profiles.set(key, []);
      profiles.get(key).push(record);
    }
    let nearestMiss;
    for (const entries of profiles.values()) {
      const dated = entries.map(r => ({r, id:tradeId(r.row), day:Date.parse(r.row.date + 'T00:00:00Z') / 86400000}));
      for (let i = 0; i < dated.length; i++) for (let j = 0; j < i; j++) {
        const a = dated[i], b = dated[j];
        if (!Number.isFinite(a.day) || !Number.isFinite(b.day) || a.id === b.id || a.r.floor.number === b.r.floor.number) continue;
        const days = Math.abs(a.day - b.day), ping = Math.abs(a.r.row.areaPing - b.r.row.areaPing);
        const fraction = ping / Math.min(a.r.row.areaPing, b.r.row.areaPing);
        const [lower, higher] = a.r.floor.number < b.r.floor.number ? [a.r, b.r] : [b.r, a.r];
        const pair = {lower, higher, days, ping, fraction, latest:Math.max(a.day, b.day)};
        // Subtracting two published area values can add one floating-point unit at the cutoff.
        const smallerArea = Math.min(a.r.row.areaPing, b.r.row.areaPing);
        const areaLimit = Math.min(limits.ping, smallerArea * limits.fraction);
        const rounding = Number.EPSILON * Math.max(a.r.row.areaPing, b.r.row.areaPing);
        if (days <= limits.days && ping <= areaLimit + rounding) pairs.push(pair);
        else {
          const distance = Math.max(days / limits.days, ping / limits.ping, fraction / limits.fraction);
          if (!nearestMiss || distance < nearestMiss.distance) nearestMiss = {...pair, distance};
        }
      }
    }
    pairs.sort((a,b) => b.latest - a.latest || a.days - b.days || a.ping - b.ping);
    return {pairs, nearestMiss};
  }

  // The caller supplies qualified, individual sale pairs. Anchor the window to the selected
  // sales (rather than today), including the anniversary and clipping Feb 29 to Feb 28.
  function independentPairs(anchor, pairs) {
    const end = [anchor.lower.row.date, anchor.higher.row.date].sort()[1];
    const [year, month, day] = end.split('-').map(Number);
    const lastDay = new Date(Date.UTC(year-2, month, 0)).getUTCDate();
    const start = new Date(Date.UTC(year-2, month-1, Math.min(day, lastDay))).toISOString().slice(0,10);
    const profile = profileKey(anchor.lower.row), door = anchor.lower.address.label;
    const inScope = (record, floor) => record.floor.number === floor && record.address.label === door &&
      record.row.date >= start && record.row.date <= end && profileKey(record.row) === profile;
    const ranked = pairs.filter(p => p !== anchor && inScope(p.lower, anchor.lower.floor.number) && inScope(p.higher, anchor.higher.floor.number))
      .map(p => ({p, lowId:tradeId(p.lower.row), highId:tradeId(p.higher.row)}));
    const byText = (a,b) => a < b ? -1 : a > b ? 1 : 0;
    ranked.sort((a,b) => a.p.days-b.p.days || a.p.ping-b.p.ping || b.p.latest-a.p.latest ||
      byText(a.lowId,b.lowId) || byText(a.highId,b.highId) ||
      byText(String(a.p.lower.row.sourceRow),String(b.p.lower.row.sourceRow)) ||
      byText(String(a.p.higher.row.sourceRow),String(b.p.higher.row.sourceRow)));
    const selected = [anchor], used = new Set([tradeId(anchor.lower.row),tradeId(anchor.higher.row)]);
    for (const {p,lowId,highId} of ranked) {
      if (lowId === highId || used.has(lowId) || used.has(highId)) continue;
      used.add(lowId);
      used.add(highId);
      selected.push(p);
    }
    const deltas = selected.map(p => wholeCents(p.higher.row.unitWan) - wholeCents(p.lower.row.unitWan)).sort((a,b)=>a-b);
    const n = deltas.length, up = deltas.filter(x=>x>0).length, down = deltas.filter(x=>x<0).length;
    return {start, end, selected, up, down, flat:n-up-down, min:deltas[0], max:deltas[n-1],
      median:(deltas[Math.floor((n-1)/2)]+deltas[Math.floor(n/2)])/2};
  }

  function signedDelta(cents) {
    const digits = Number.isInteger(cents) ? 2 : 3;
    return (cents > 0 ? '+' : cents < 0 ? '−' : '') + (Math.abs(cents)/100).toFixed(digits);
  }

  function supportMarkup(p, available) {
    const evidence = independentPairs(p, available), count = evidence.selected.length;
    if (count === 1) return '<p class="fg-note fg-support-single" data-gap-support-count="1">目前查詢範圍內，回溯 24 個月只有所選這 1 組可對照。</p>';
    const rows = evidence.selected.map((pair,i) => {
      const delta = wholeCents(pair.higher.row.unitWan) - wholeCents(pair.lower.row.unitWan);
      const side = record => {
        const row = record.row;
        return `<span>${level(record.floor.number)} · ${esc(row.date)} · ${price(wholeCents(row.unitWan))} 萬／坪</span>
          <small>${esc(row.address)}${row.transactionId ? ' · '+esc(row.transactionId) : ''}</small>${host.FloorSales.resurveyMarkup(row,record.resurveySources)}`;
      };
      return `<li data-gap-support-pair><strong>${i === 0 ? '所選配對' : '配對 '+(i+1)} · ${signedDelta(delta)} 萬／坪</strong>${side(pair.lower)}${side(pair.higher)}</li>`;
    }).join('');
    return `<section class="fg-support" data-gap-support-count="${count}">
      <h4>這兩層有 ${count} 組配對，來自 ${2*count} 筆不同成交</h4>
      <p>以每坪單價比較，<strong>高樓較貴 ${evidence.up} 組、較便宜 ${evidence.down} 組、持平 ${evidence.flat} 組</strong>。</p>
      <p data-gap-support-stats>高樓減低樓，每坪差額中位數 <strong>${signedDelta(evidence.median)} 萬元</strong>，範圍 ${signedDelta(evidence.min)} ～ ${signedDelta(evidence.max)} 萬元。</p>
      <details class="fg-records" data-gap-support-evidence><summary>核對這 ${count} 組成交</summary>
      <p class="fg-note">在目前查詢期間內，回看 ${evidence.start} ～ ${evidence.end}。每一組皆符合相同門牌、兩個樓層、格局、用途、建物型態與車位拆算條件。</p><ul>${rows}</ul></details></section>`;
  }

  function exactDoors(model, community) {
    const doors = new Map();
    function addDoor(label) {
      if (!doors.has(label)) doors.set(label, {label, samples:[], records:[], reported:0});
      return doors.get(label);
    }
    for (const label of host.FloorSales.doorOptions(community)) {
      if (label) addDoor(label);
    }
    for (const record of model.records) {
      if (!record.address.exact || !record.current) continue;
      const door = addDoor(record.address.label);
      door.reported++;
      if (locatable(record, community.district)) door.records.push(record);
    }
    return doors;
  }

  function group(model, community) {
    const doors = exactDoors(model, community);
    const groups = new Map();
    for (const {label, records} of doors.values()) for (const record of records) {
      const row = record.row;
      if (!hasProfile(record)) continue;
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
    for (const door of doors.values()) {
      door.samples.sort(rank);
      door.overview = overview(door.records);
      Object.assign(door, nearPairs(door.records));
    }
    return [...doors.values()].sort((a, b) => Number(!!b.pairs.length) - Number(!!a.pairs.length) ||
      (a.samples.length && b.samples.length ? rank(a.samples[0], b.samples[0]) : Number(!!b.samples.length) - Number(!!a.samples.length)) ||
      b.records.length - a.records.length);
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

  function recordMarkup(record, marker = 'data-gap-record') {
    const r = record.row;
    const layout = [r.roomCount,r.hallCount,r.bathCount].every(n => Number.isFinite(n)) ? roomLayout(r) : '格局待核';
    const terms = [r.mainUse || '用途待核', layout, r.parkingMode || '車位待核'];
    if (Number.isFinite(r.areaPing)) terms.push(`移轉總坪數 ${area(r.areaPing)} 坪`);
    if (Number.isFinite(r.priceWan)) terms.push(`總價 ${area(r.priceWan)} 萬元`);
    if (record.address.source === 'verified-door') terms.push(`使照 ${r.doorMatch.permitNumber} · 114 年市府門牌第 ${r.doorMatch.officialPlateRow114} 列`);
    if (record.address.source === 'parcel') terms.push(`使照基地：${r.parcelMatch.parcel} · 同批土地明細第 ${r.parcelMatch.landRow} 列`);
    return `<li ${marker}="${esc(record.key)}"><strong>${level(record.floor.number)} · ${esc(r.date)} · ${hasPrice(record) ? price(wholeCents(r.unitWan))+' 萬／坪' : '未列入單價統計'}</strong>
      <span>${esc(r.address)}</span><small>${esc(terms.join(' · '))}</small>
      ${!hasPrice(record) ? `<small>${esc(r.exclusionReason || record.price.label || '用途或價格待核')}</small>` : ''}
      ${r.transactionId ? `<small>實價登錄編號 ${esc(r.transactionId)}</small>` : ''}
      ${r.sourceRow ? `<small>來源 ${esc(String(r.sourceRow).split(/[\\/]/).pop())}</small>` : ''}${host.FloorSales.resurveyMarkup(r,record.resurveySources)}</li>`;
  }

  function overviewMarkup(door) {
    if (!door?.records.length) return '';
    const sections = door.overview.map(section => {
      const rows = section.floors.map(f => {
        const {stats} = f;
        const count = f.records.length, priced = stats?.count || 0;
        const distribution = priced > 1 ? `最低 ${price(stats.low)} ～ 最高 ${price(stats.high)}` : priced === 1 ? '僅一筆可比單價' : '無可比單價';
        return `<tr data-gap-overview-floor="${f.n}"><th scope="row">${level(f.n)}</th><td><strong>${priced ? price(stats.cents) : '—'}</strong><small>${distribution}</small></td>
          <td>${count} 筆<small>${priced} 筆可比</small></td><td>${f.from === f.through ? f.from : `${f.from}<br>～ ${f.through}`}</td></tr>
          <tr class="fg-evidence-row"><td colspan="4"><details class="fg-records" data-gap-overview-evidence="${f.n}"><summary>核對 ${level(f.n)}的 ${count} 筆成交</summary><ul>${f.records.map(r => recordMarkup(r)).join('')}</ul></details></td></tr>`;
      }).join('');
      return `<table class="fg-table fg-overview-table" data-gap-use="${section.use}"><caption>${uses[section.use]} · ${section.floors.length} 個樓層</caption>
        <thead><tr><th scope="col">樓層</th><th scope="col">中位單價<br><small>萬元／坪</small></th><th scope="col">成交數</th><th scope="col">成交日期</th></tr></thead><tbody>${rows}</tbody></table>`;
    }).join('');
    const omitted = door.reported - door.records.length;
    return `<section class="fg-overview" data-gap-overview><h4>這個門牌各樓層賣多少？</h4>
      <p class="fg-note">目前條件共 ${door.records.length} 筆可定位到單一樓層。每層的格局、坪數與成交年份可能不同。${omitted ? `另有 ${omitted} 筆門牌有對應，但樓層、棟數或原始地址待核。` : ''}</p>${sections}</section>`;
  }

  // The catalog can establish a continuous run of above-ground floors only for a
  // single registered building. Otherwise use individual floors seen at this door,
  // including verified transactions outside the selected filters.
  function floorLedger(community, door, include) {
    const buckets = new Map();
    for (const record of door.records) {
      const n = record.floor.number;
      if (!buckets.has(n)) buckets.set(n, []);
      if (include(record.row)) buckets.get(n).push(record);
    }
    const top = Number(community.floors);
    const knownHeight = Number(community.buildingCount) === 1 && Number.isInteger(top) && top > 0 && top <= 150 &&
      ![...buckets.keys()].some(n => n > top);
    if (knownHeight) for (let n = 1; n <= top; n++) if (!buckets.has(n)) buckets.set(n, []);
    const floors = [...buckets].sort(([a], [b]) => b-a).map(([n, records]) => {
      records.sort((a,b) => b.row.date.localeCompare(a.row.date));
      const priced = records.filter(hasPrice).map(r => r.row);
      return {n, records, stats:priced.length ? summarizeFloor(n, priced) : null};
    });
    const byLevel = new Map(floors.map(f => [f.n, f]));
    for (const floor of floors) {
      floor.lower = byLevel.get(floor.n === 1 ? -1 : floor.n-1);
      floor.delta = floor.stats && floor.lower?.stats ? floor.stats.cents - floor.lower.stats.cents : null;
    }
    return {knownHeight, floors};
  }

  function mountCard(root, community, model, options) {
    const doors = [...exactDoors(model, community).values()];
    const inView = record => options.include(record.row);
    // Start at a door with current records when possible. A selector keeps the
    // other registered doors accessible even when they have no transactions.
    const countInView = door => door.records.filter(inView).length;
    const ranked = doors.map(d => ({d, count:countInView(d)})).sort((a,b) =>
      b.count-a.count || b.d.records.length-a.d.records.length).map(item => item.d);
    let door = ranked.find(d => d.label === options.address) || ranked[0];
    root.innerHTML = `<h3>各樓層成交 <small>萬元／坪</small></h3><p class="fl-scope">${esc(options.filters)}<br>${esc(options.period.start)} ～ ${esc(options.period.end)}</p>
      <div data-fl-address></div><div data-fl-ledger></div>`;
    const address = root.querySelector('[data-fl-address]');
    const ledger = root.querySelector('[data-fl-ledger]');
    if (!door) {
      ledger.innerHTML = '<p class="fl-empty">名冊缺精確門牌，尚無法把成交分到各樓層。</p>';
      return;
    }
    if (ranked.length > 1) {
      address.innerHTML = '<label>查詢門牌<select data-fl-door></select></label>';
      const select = address.querySelector('select');
      for (const d of ranked) select.add(new Option(d.label, d.label));
      select.value = door.label;
      select.onchange = () => { door = ranked.find(d => d.label === select.value); draw(); };
    } else address.textContent = door.label;

    function floorEvidence(floor, floors, knownHeight) {
      const lower = floor.lower;
      const upperN = floor.n === -1 ? 1 : floor.n+1, lowerN = floor.n === 1 ? -1 : floor.n-1;
      function adjacent(direction, n) {
        const other = floors.find(f => f.n === n);
        if (!other && knownHeight && n > Number(community.floors)) return `樓上：本層為名冊地上最高層。`;
        const title = `本層對${direction} ${level(n)}`;
        if (other?.stats && floor.stats) {
          const diff = floor.stats.cents-other.stats.cents;
          return diff ? `${title}：每坪${diff > 0 ? '高' : '低'} ${price(Math.abs(diff))} 萬元。` : `${title}：顯示的中位單價相同。`;
        }
        const missing = f => f.records.length ? '缺可比單價' : '本期未揭露成交';
        const reasons = [];
        if (!floor.stats) reasons.push('本層'+missing(floor));
        if (!other) reasons.push(level(n)+'的樓層資料待核');
        else if (!other.stats) reasons.push(level(n)+missing(other));
        return title+'：'+reasons.join('、')+'。';
      }
      const neighbors = `<p class="fl-neighbors" data-fl-neighbors><strong>本層中位單價比較</strong><span>${adjacent('樓上',upperN)}</span><span>${adjacent('樓下',lowerN)}</span></p>`;
      const sampleText = f => `${level(f.n)}有 ${f.stats.count} 筆可比，成交於 ${f.stats.from}${f.stats.from !== f.stats.through ? ' ～ '+f.stats.through : ''}`;
      let comparison = '';
      if (floor.delta !== null) {
        const pair = nearPairs([...floor.records, ...lower.records]).pairs[0];
        comparison = `<p>${sampleText(floor)}。${sampleText(lower)}。</p>`;
        if (pair) {
          const diff = wholeCents(pair.higher.row.unitWan) - wholeCents(pair.lower.row.unitWan);
          comparison += `<details class="fl-pair"><summary>核對 ${level(floor.n)}、${level(lower.n)} 的一組相近成交</summary><p>${nearCriteria}，且用途、格局、型態及車位拆算方式相同。這兩筆實際相差 ${signedDelta(diff)} 萬元／坪。</p>
            <ul>${recordMarkup(pair.higher, 'data-fl-pair-record')}${recordMarkup(pair.lower, 'data-fl-pair-record')}</ul></details>`;
        } else comparison += `<p class="fl-no-pair">${level(floor.n)}、${level(lower.n)} 缺少條件相近的配對成交。</p>`;
      }
      const evidence = floor.records.length
        ? `<p><strong>${level(floor.n)}成交明細 · ${floor.records.length} 筆</strong></p><ul>${floor.records.map(r => recordMarkup(r, 'data-fl-record')).join('')}</ul>`
        : '<p>這個門牌在所選類型及期間沒有可定位到本層的成交。</p>';
      return neighbors+comparison+evidence;
    }
    function draw() {
      const {knownHeight, floors} = floorLedger(community, door, options.include);
      const reported = (model.addresses.find(a => a.exact && a.label === door.label)?.records || []).filter(r => r.current && inView(r)).length;
      const assigned = countInView(door);
      const qualifier = knownHeight ? `名冊地上 ${community.floors} 層` : '總層數待核，僅列歷來已核對樓層';
      const omitted = reported > assigned ? `另有 ${reported-assigned} 筆單一門牌、棟數或樓層待核。` : '';
      const unknownAddress = model.records.filter(r => r.current && !r.address.exact && inView(r)).length;
      const unassigned = unknownAddress ? `社區另有 ${unknownAddress} 筆未核定門牌。` : '';
      if (!floors.length) {
        ledger.innerHTML = `<p class="fl-empty">這個門牌尚無可核對的樓層成交。${esc(omitted+unassigned)}</p>`;
        return;
      }
      const rows = floors.map(f => {
        const count = f.records.length, priced = f.stats?.count || 0;
        const lowerLabel = f.n === 1 ? 'B1' : (f.n < 0 ? 'B'+(-f.n+1) : (f.n-1)+'樓');
        const gap = f.delta !== null ? signedDelta(f.delta) : '—';
        return `<details class="fl-row" data-fl-floor="${f.n}">
          <summary><span>${f.n < 0 ? 'B'+(-f.n) : f.n+'樓'}</span><span>${count} 筆<small>${count ? '可比 '+priced : '未揭露'}</small></span>
            <strong>${priced ? price(f.stats.cents) : '—'}${count && !priced ? '<small>無可比價</small>' : ''}</strong>
            <span class="fl-delta">${gap}<small>${f.delta !== null ? '對 '+lowerLabel : !priced ? '本層缺價' : '下一層缺價'}</small></span></summary>
          <div class="fl-evidence" data-fl-evidence></div></details>`;
      }).join('');
      ledger.innerHTML = `<p class="fl-totals">${esc(qualifier)} · 本期 ${assigned} 筆</p>
        <div class="fl-labels" aria-hidden="true"><span>樓層</span><span>成交</span><span>中位單價</span><span>比下一層</span></div>
        <div class="fl-rows">${rows}</div><button type="button" class="fl-more" hidden></button>
        <p class="fl-note">點樓層核對逐筆成交與配對。只有一筆可比時顯示該筆單價。各層的格局、坪數與成交年份可能不同。${esc(omitted+unassigned)}</p>`;
      const elements = [...ledger.querySelectorAll('[data-fl-floor]')];
      elements.forEach((row, i) => {
        row.querySelector('summary').setAttribute('aria-label', level(floors[i].n)+'，'+floors[i].records.length+' 筆成交，'+
          (floors[i].stats ? '中位單價每坪 '+price(floors[i].stats.cents)+' 萬元' : '無可比單價')+
          (floors[i].delta !== null ? '，比下一層每坪 '+signedDelta(floors[i].delta)+' 萬元' : '')+'，查看明細');
        row.addEventListener('toggle', () => {
          const target = row.querySelector('[data-fl-evidence]');
          if (row.open && !target.firstChild) target.innerHTML = floorEvidence(floors[i], floors, knownHeight);
        });
      });
      if (floors.length > 6) {
        // Show a contiguous slice containing comparable adjacent levels when available.
        let center = floors.findIndex(f => f.delta !== null);
        if (center < 0) center = Math.max(0, floors.findIndex(f => f.records.length));
        const start = Math.min(Math.max(0, center-1), floors.length-5);
        const more = ledger.querySelector('.fl-more');
        const display = expanded => {
          elements.forEach((el,i) => { el.hidden = !expanded && (i < start || i >= start+5); });
          more.textContent = expanded ? '收合樓層表' : `顯示全部 ${floors.length} 個樓層`;
          more.setAttribute('aria-expanded', String(expanded));
        };
        more.hidden = false;
        more.onclick = () => display(more.getAttribute('aria-expanded') !== 'true');
        display(false);
      }
    }
    draw();
    return {get address() { return door.label; }};
  }

  function emptyReason(door, model) {
    const current = model.records.filter(r => r.current);
    if (!current.length) return '這個社區在目前選定的用途與期間，沒有可核對的成交紀錄。';
    if (current.every(r => r.row.singleBuilding === false)) return `社區在此範圍的 ${current.length} 筆成交均合併多個建物或未載明單一建物，無法拆分到單一門牌樓層。`;
    if (!door) return '社區名冊沒有可核對的精確門牌。';
    if (!door.reported) return '這個門牌在目前查詢範圍內沒有可核對的成交。';
    if (model.records.filter(r => r.current && r.address.label === door.label).every(r => r.row.singleBuilding === false))
      return `目前 ${door.reported} 筆成交均合併多個建物或未載明單一建物。`;
    return `門牌有 ${door.reported} 筆紀錄，原始門牌、單一建物及單一移轉樓層無法同時核對。`;
  }

  function nearView(root, door, model) {
    const pairs = door?.pairs || [];
    if (!pairs.length) {
      let reason = '', headline = '目前沒有可對照的跨樓層成交';
      if (!door?.records.length) reason = emptyReason(door, model);
      else {
        const floors = [...new Set(door.records.map(r => r.floor.number))];
        const count = door.records.filter(hasProfile).length;
        if (floors.length === 1) {
          headline = `只有 ${level(floors[0])}有可定位的成交`;
          reason = `共 ${door.records.length} 筆，還缺另一樓層的相近成交。`;
        } else if (!count) reason = `${floors.length} 個樓層有成交；可比單價及完整配對條件尚未同時具備。`;
        else if (door.nearestMiss) {
          const p = door.nearestMiss;
          reason = `例如 ${level(p.lower.floor.number)}（${p.lower.row.date}）和 ${level(p.higher.floor.number)}（${p.higher.row.date}）格局、用途及車位拆算相同，但兩筆相距 ${p.days} 天、移轉坪數相差 ${area(p.ping)} 坪（${(100*p.fraction).toFixed(1)}%），超出配對範圍。`;
        } else reason = `${floors.length} 個樓層有成交，${count} 筆具備配對資料。不同樓層尚未找到用途、建物型態、格局及車位拆算方式皆相同的兩筆。`;
      }
      root.innerHTML = `<div class="fg-empty" data-gap-empty><strong>${headline}</strong><p>${esc(reason)}</p></div>`;
      return;
    }
    root.innerHTML = `<div data-gap-near-result></div>
      <div class="fg-fields fg-near-levels"><label>較低樓層<select data-gap-lower></select></label><label>較高樓層<select data-gap-higher></select></label></div>
      <div class="fg-fields fg-near-pick"><label><span data-gap-pair-count></span><select data-gap-near-pair></select></label></div><button type="button" data-gap-more hidden>顯示較早配對</button>`;
    const select = root.querySelector('[data-gap-near-pair]'), result = root.querySelector('[data-gap-near-result]');
    const lowerPick = root.querySelector('[data-gap-lower]'), higherPick = root.querySelector('[data-gap-higher]');
    const more = root.querySelector('[data-gap-more]');
    const floorChoices = numbers => [...new Set(numbers)].sort((a,b)=>a-b).map(n=>[n,level(n)]);
    let available = [], visible = 40;
    function show() {
      const p = available[Number(select.value)], a = p.lower.row, b = p.higher.row;
      const lower = level(p.lower.floor.number), higher = level(p.higher.floor.number);
      const ac = wholeCents(a.unitWan), bc = wholeCents(b.unitWan), diff = bc-ac;
      const difference = diff ? `${higher}這筆比${lower}這筆每坪${diff > 0 ? '高' : '低'} ${price(Math.abs(diff))} 萬元` : `兩筆顯示的單價相同，都是 ${price(ac)} 萬元／坪`;
      const terms = [a.mainUse, a.buildingType, roomLayout(a), parkingLabels[a.parkingMode]].join(' · ');
      result.innerHTML = `<div class="fg-answer"><div data-gap-difference role="status">${difference}</div>
        <p data-gap-formula>${higher} ${price(bc)} − ${lower} ${price(ac)} ＝ ${diff < 0 ? '−' : ''}${price(Math.abs(diff))} 萬元／坪</p>
        <p data-gap-distances>成交相距 ${p.days} 天 · 移轉總坪數相差 ${area(p.ping)} 坪（${(100*p.fraction).toFixed(1)}%）</p></div>
        <p class="fg-note">${esc(terms)}。每層各取一筆，屋況、座向與成交時點也會影響差額。</p>
        <details class="fg-records" data-gap-near-evidence><summary>核對這兩筆成交</summary><ul>${recordMarkup(p.lower)}${recordMarkup(p.higher)}</ul></details>
        ${supportMarkup(p, available)}`;
    }
    function showList(index = 0) {
      root.querySelector('[data-gap-pair-count]').textContent = `選擇兩筆成交（這兩層共 ${available.length} 組）`;
      optionList(select, available.slice(0,visible).map((p,i) => [i, `${level(p.lower.floor.number)} ${p.lower.row.date} ／ ${level(p.higher.floor.number)} ${p.higher.row.date} · 差 ${p.days} 天、${area(p.ping)} 坪`]), index);
      more.hidden = visible >= available.length;
      show();
    }
    function showMatches() {
      available = pairs.filter(p => p.lower.floor.number === Number(lowerPick.value) && p.higher.floor.number === Number(higherPick.value));
      visible = 40;
      showList();
    }
    function showHigher() {
      const matches = pairs.filter(p => p.lower.floor.number === Number(lowerPick.value));
      optionList(higherPick, floorChoices(matches.map(p => p.higher.floor.number)), matches[0].higher.floor.number);
      showMatches();
    }
    optionList(lowerPick, floorChoices(pairs.map(p => p.lower.floor.number)), pairs[0].lower.floor.number);
    lowerPick.onchange = showHigher;
    higherPick.onchange = showMatches;
    more.onclick = () => { visible += 40; showList(Number(select.value)); };
    select.onchange = show;
    showHigher();
  }

  function mount(root, community, model, options = {}) {
    const doors = group(model, community);
    let door, sample, baseline, target;
    root.innerHTML = `<section class="floor-gaps" data-floor-gaps aria-label="同棟樓層價差">
      <header><p class="fg-place"></p><h3>${Number(community.buildingCount) > 1 ? '同門牌樓層價差' : '同棟樓層價差'}</h3></header>
      <div class="fg-fields">
        <label>查詢門牌<select data-gap-door></select></label>
        <label>比較方式<select data-gap-mode><option value="near">條件相近的兩筆成交</option><option value="group">同半年、同坪數組的中位數</option></select></label>
        <label hidden data-gap-period-field>成交期間<select data-gap-period></select></label>
        <label hidden data-gap-profile-field>房型、坪數與車位<select data-gap-profile></select></label>
      </div>
      <p class="fg-scope"></p>
      <p class="fg-note" data-gap-criteria>同用途、格局、型態及車位拆算方式；${nearCriteria}。</p>
      <div data-gap-results></div>
      <div data-gap-market></div>
      ${typeof options.openFloors === 'function' ? '<button type="button" data-gap-all-records>查看目前條件的全部成交紀錄 ↗</button>' : ''}
      <details class="fg-method"><summary>這些價格怎麼比？</summary><p data-gap-bounds></p>
      <p>先核對名冊門牌、單一建物與原始移轉樓層，再比對用途、建物型態、房廳衛數和車位拆算方式。「條件相近」採用本站的篩選門檻：${nearCriteria}。選單以最近一筆成交日期排序，同日優先列出成交時點較接近的一對。同一筆可能出現在多組。</p>
      <p>「同半年、同坪數組」採同一曆年上半年或下半年，按建物移轉總坪數每 2 坪分組後計算各層中位單價。兩種比較都沿用實價登錄的可比單價，差額取畫面上的兩個單價相減。已拆算車位的單價扣除車位價款及面積，移轉總坪數仍包含車位；車位數量與型式須核對原件。</p>
      <p>核對多組成交時，從所選兩筆中較晚的交易日往前 24 個月，兩筆都須落在期間內。先保留所選配對，再從相同兩層及條件的候選中，依成交日相距較短、坪數差較小、成交較新依序選取，仍相同則依低樓、高樓的交易識別碼排序。每筆交易最多用一次；更換所選配對，組數也可能改變。</p>
      <p>樓層概覽依用途分列，只有一筆可比時顯示該筆單價。未納入單價的成交仍可展開查看原因。屋況、裝修、座向、戶別與時點都會影響價格，單一配對無法推估每升一樓的固定加價。</p>
      <a href="https://lvr.land.moi.gov.tw/" target="_blank" rel="noopener noreferrer">內政部實價登錄查詢 ↗</a></details>
      </section>`;
    const find = selector => root.querySelector(selector);
    const doorPick = find('[data-gap-door]'), modePick = find('[data-gap-mode]');
    const periodPick = find('[data-gap-period]'), profilePick = find('[data-gap-profile]');
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
        const reason = door?.records.length ? '可定位的樓層見下方概覽，完整房型、面積、車位及可比單價尚未同時具備。' : emptyReason(door, model);
        results.innerHTML = `<div class="fg-empty" data-gap-empty><strong>目前無法比較樓層價差</strong><p>${esc(reason)}</p></div>`;
        return;
      }
      const {floors} = sample;
      const selected = closestPair(floors);
      [baseline, target] = selected;
      const floorRows = floors.map(f => `<tr data-gap-floor="${f.n}"><th scope="row">${level(f.n)}</th><td><strong>${price(f.cents)}</strong></td><td>${f.count}</td><td>${f.from}${f.from === f.through ? '' : '<br>至 '+f.through}</td></tr>`).join('');
      const transactions = floors.flatMap(f => f.entries.map(row => ({floor:f.n, row}))).sort((a, b) => b.row.date.localeCompare(a.row.date));
      const item = ({floor, row}) => `<li><strong>${level(floor)} · ${price(Math.round(row.unitWan * 100))} 萬／坪</strong><span>${esc(row.date)} · 移轉 ${area(row.areaPing)} 坪</span><small>${esc(row.address)}</small>${host.FloorSales.resurveyMarkup(row,options.parcelResurveySources)}</li>`;
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
    function showMode() {
      const samples = door?.samples || [];
      const grouped = modePick.value === 'group';
      find('[data-gap-criteria]').hidden = grouped;
      find('[data-gap-period-field]').hidden = !grouped || !samples.length;
      find('[data-gap-profile-field]').hidden = !grouped || !samples.length;
      if (!grouped) {
        nearView(results, door, model);
        return;
      }
      const periods = [...new Set(samples.map(s => s.period))].sort().reverse();
      const paired = new Set(samples.filter(s => s.floors.length >= 2).map(s => s.period));
      optionList(periodPick, periods.map(p => [p, halfYear(p) + (paired.has(p) ? ' · 可比樓層' : ' · 各組僅一層')]), samples[0]?.period || '');
      showPeriod();
    }
    function showDoor() {
      door = doors.find(d => d.label === doorPick.value);
      find('[data-gap-market]').innerHTML = overviewMarkup(door);
      showMode();
    }
    doorPick.onchange = showDoor;
    modePick.onchange = showMode;
    periodPick.onchange = showPeriod;
    if (options.openFloors) find('[data-gap-all-records]').onclick = options.openFloors;
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
  host.FloorGaps = {group, independentPairs, locatable, mount, mountCard, floorLedger};
})();
