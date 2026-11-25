/*
 * Floor-level transaction viewer.
 *
 * The caller supplies the already loaded community and the rows for the
 * active category/period.  There is no fetch, catalog lookup, analytics, or
 * app.js dependency here.  Excluded rows stay visible for audit and no
 * doorplate or floor is inferred.
 *
 * Integration: window.FloorSales.mount(root, community, rows)
 * Pure helper: window.FloorSales.groupRows(rows, community)
 * QA hooks: [data-floor-sales-root], [data-floor-sales-address-select],
 * [data-floor-sales-address], [data-floor-sales-floor],
 * [data-floor-sales-record], [data-floor-sales-compare],
 * [data-floor-sales-clear].
 */
(() => {
  'use strict';

  const host = typeof window !== 'undefined' ? window : globalThis;
  const VERSION = '2026-11-25.2';
  const TODAY = () => new Date().toISOString().slice(0, 10);
  const FLOOR_TOKEN = /(?:地下)?([0-9零〇一二兩三四五六七八九十百千]+)層/g;
  const FLOOR_ONLY = /^[0-9零〇一二兩三四五六七八九十百千]+層$/;
  const CN = Object.freeze({ 零: 0, 〇: 0, 一: 1, 二: 2, 兩: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 });
  const SELECTORS = Object.freeze({
    root: '[data-floor-sales-root]',
    addressSelect: '[data-floor-sales-address-select]',
    address: '[data-floor-sales-address]',
    floor: '[data-floor-sales-floor]',
    record: '[data-floor-sales-record]',
    compare: '[data-floor-sales-compare]',
    clear: '[data-floor-sales-clear]'
  });
  const CLASS_NAMES = Object.freeze({
    root: 'floor-sales',
    address: 'floor-sales__address',
    floor: 'floor-sales__floor',
    record: 'floor-sales__record',
    compare: 'floor-sales__compare'
  });

  const isFiniteNumber = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
  const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[character]));
  const normalize = value => String(value ?? '').normalize('NFKC').trim();
  const compact = value => normalize(value).replace(/[\s,，、。．.]+/g, '');

  function numberText(value, digits = 2) {
    return isFiniteNumber(value) ? Number(value).toLocaleString('zh-TW', { minimumFractionDigits: 0, maximumFractionDigits: digits }) : '待補';
  }
  function dateText(value) { return normalize(value) || '日期待核'; }

  function toChineseNumber(value) {
    const source = normalize(value);
    if (!source) return null;
    if (/^\d+$/.test(source)) return Number(source);
    if (Object.hasOwn(CN, source)) return CN[source];
    const tens = source.match(/^([一二兩三四五六七八九]?)十([一二三四五六七八九]?)$/);
    if (tens) return (CN[tens[1]] ?? 1) * 10 + (CN[tens[2]] ?? 0);
    return null;
  }

  function floorInfo(value) {
    const raw = normalize(value);
    if (!raw || raw === '全' || raw === '全棟') {
      return {
        key: raw ? `unresolved:${raw}` : 'missing',
        label: raw ? '全棟／樓層未細分' : '樓層待核', raw, single: false,
        reason: raw ? '原始資料標示為全棟，不能定位至單一樓層' : '原始資料沒有樓層'
      };
    }
    const basement = raw.match(/^B([0-9]+)$/i);
    if (basement) return { key: `floor:B${Number(basement[1])}`, label: raw, raw, token: `B${Number(basement[1])}`, number: -Number(basement[1]), single: true, reason: '' };
    const underground = raw.match(/^地下([0-9零〇一二兩三四五六七八九十百千]+)層$/);
    if (underground) {
      const basementNumber = toChineseNumber(underground[1]);
      if (Number.isFinite(basementNumber)) return { key: `floor:B${basementNumber}`, label: raw, raw, token: `B${basementNumber}`, number: -basementNumber, single: true, reason: '' };
    }
    const matches = [...raw.matchAll(FLOOR_TOKEN)];
    if (matches.length === 1 && FLOOR_ONLY.test(raw)) {
      const number = toChineseNumber(matches[0][1]);
      const token = Number.isFinite(number) ? `${number}層` : `${matches[0][1]}層`;
      return { key: `floor:${token}`, label: Number.isFinite(number) ? `${number}樓` : raw, raw, token, number, single: true, reason: '' };
    }
    return {
      key: `unresolved:${raw}`, label: raw, raw, single: false,
      reason: matches.length > 1 || underground
        ? '原始資料包含多個樓層或地下層，不能定位至單一樓層'
        : '原始樓層格式待核，不能定位至單一樓層'
    };
  }

  function stripCity(value) { return compact(value).replace(/^(?:臺|台)南市/, ''); }
  function addressBase(value) {
    const source = stripCity(value);
    if (!source) return '';
    // Only parse a floor marker after an explicit `號` or `號之X` doorplate.
    // This preserves road names such as `二樓路` and ambiguous `號B1`
    // building/unit suffixes.
    const doorplate = source.match(/號(?:之[0-9零〇一二兩三四五六七八九十百千]+)?/);
    if (!doorplate) return source;
    const doorplateEnd = doorplate.index + doorplate[0].length;
    const suffix = source.slice(doorplateEnd);
    const floor = suffix.match(/^(?:地下)?[0-9零〇一二兩三四五六七八九十百千]+(?:樓|層)/);
    return floor ? source.slice(0, doorplateEnd) : source;
  }
  function addressMatches(value, exact) {
    const source = stripCity(value), target = stripCity(exact);
    if (!source || !target) return false;
    const sourceBase = addressBase(source), targetBase = addressBase(target);
    if (sourceBase === targetBase) return true;
    // Some transaction rows include a village/neighbourhood prefix omitted
    // from the official exact address. Permit only that administrative
    // prefix; do not accept an arbitrary road substring.
    const sourceDistrict = sourceBase.match(/^(.+?區)(.*)$/), targetDistrict = targetBase.match(/^(.+?區)(.*)$/);
    if (!sourceDistrict || !targetDistrict || sourceDistrict[1] !== targetDistrict[1]) return false;
    const sourceTail = sourceDistrict[2], targetTail = targetDistrict[2];
    if (!sourceTail.endsWith(targetTail)) return false;
    const prefix = sourceTail.slice(0, -targetTail.length);
    return /(?:里|鄰)$/.test(prefix);
  }
  function officialAddresses(community) {
    const values = [
      ...(Array.isArray(community?.primaryExactAddresses) ? community.primaryExactAddresses : []),
      ...(Array.isArray(community?.exactAddresses) ? community.exactAddresses : [])
    ].map(normalize).filter(Boolean);
    return [...new Map(values.map(value => [compact(value), value])).values()]
      .sort((a, b) => compact(b).length - compact(a).length);
  }
  function hasMultipleDoorplates(value) {
    const source = compact(value);
    return (source.match(/號/g) || []).length > 1 || /號[、,，]/.test(source);
  }
  function addressInfo(row, community, rowKey) {
    const rawAddress = normalize(row?.address), rawUnit = normalize(row?.unitIdentity);
    const candidates = [rawUnit, rawAddress].filter(Boolean);
    const multiple = candidates.some(hasMultipleDoorplates);
    if (multiple) {
      const raw = candidates.find(hasMultipleDoorplates);
      return { key: `multiple:${rowKey}`, label: `多門牌待核：${raw}`, exact: false, source: 'transaction', raw,
        reason: '本列登載多個門牌，須核對各門牌對應的戶別' };
    }
    const exact = officialAddresses(community).find(address => candidates.some(value => addressMatches(value, address)));
    if (exact) return { key: `official:${compact(exact)}`, label: exact, exact: true, source: 'official', raw: rawUnit || rawAddress, reason: '' };
    const base = addressBase(rawUnit || rawAddress);
    if (base) return {
      key: `raw:${base}`, label: `門牌待核：${base}`, exact: false, source: 'transaction', raw: rawUnit || rawAddress,
      reason: '本列門牌有待與社區名冊核對，依成交原始門牌分組'
    };
    return {
      key: `missing:${rowKey}`, label: '門牌待核（本列沒有可用門牌，不與其他列合併）', exact: false, source: 'missing', raw: '',
      reason: '本列沒有可用門牌，不能定位至同一棟或同一戶別'
    };
  }

  function stableHash(value) {
    let hash = 2166136261;
    for (const character of String(value)) { hash ^= character.charCodeAt(0); hash = Math.imul(hash, 16777619); }
    return (hash >>> 0).toString(36);
  }
  function rowKey(row, index) {
    return `tx-${index}-${stableHash([
      row?.id, row?.transactionId, row?.date, row?.address, row?.unitIdentity, row?.floor, row?.priceWan, index
    ].map(value => String(value ?? '')).join('|'))}`;
  }

  function periodStatus(row, options) {
    const date = normalize(row?.date), start = normalize(options?.period?.start), end = normalize(options?.period?.end);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { key: 'missing', label: '日期待核', inPeriod: false, future: false };
    if (start && date < start) return { key: 'before', label: '期間前', inPeriod: false, future: false };
    if (end && date > end) {
      const future = date > normalize(options?.asOf || TODAY());
      return { key: future ? 'future' : 'after', label: future ? '未來資料' : '期間後', inPeriod: false, future };
    }
    const future = date > normalize(options?.asOf || TODAY());
    return { key: future ? 'future' : 'current', label: future ? '未來資料' : '所選期間', inPeriod: !future, future };
  }
  function comparableStatus(row, period) {
    if (period.future) return { key: 'future', label: '日期在資料基準日後，不能作目前比較' };
    if (!period.inPeriod && period.key !== 'current') return { key: 'outside-period', label: `${period.label}，不列入目前比較` };
    if (row?.eligible !== true) return { key: 'excluded', label: `排除：${normalize(row?.exclusionReason) || '原始資料未納入可比統計'}` };
    if (!isFiniteNumber(row?.unitWan)) return { key: 'missing-price', label: '原列標記可比，但可比單價欄位待補' };
    return { key: 'eligible', label: '納入可比統計（沿用原始可比單價）' };
  }

  /** Pure, DOM-free grouping.  It keeps excluded rows in every floor group. */
  function groupRows(rows, community = {}, options = {}) {
    const source = Array.isArray(rows) ? rows : [];
    const addresses = new Map();
    const records = source.map((row, index) => {
      const key = rowKey(row, index), address = addressInfo(row, community, key), floor = floorInfo(row?.floor);
      const period = periodStatus(row, options), price = comparableStatus(row, period);
      const record = { key, row, address, floor, period, price, current: period.inPeriod, future: period.future,
        floorLocated: floor.single, doorplateLocated: address.exact, comparable: price.key === 'eligible', singleBuilding: row?.singleBuilding !== false };
      if (!addresses.has(address.key)) addresses.set(address.key, { key: address.key, label: address.label, exact: address.exact,
        source: address.source, reason: address.reason, records: [], floors: new Map() });
      const group = addresses.get(address.key); group.records.push(record);
      const floorKey = floor.key === 'missing' ? `${floor.key}:${key}` : floor.key;
      if (!group.floors.has(floorKey)) group.floors.set(floorKey, { key: floorKey, label: floor.label, number: floor.number, rawLabels: new Set(), single: floor.single, reason: floor.reason, records: [] });
      const floorGroup = group.floors.get(floorKey); floorGroup.rawLabels.add(floor.raw || floor.label); floorGroup.records.push(record);
      return record;
    });
    const addressList = [...addresses.values()].map(group => ({
      key: group.key, label: group.label, exact: group.exact, source: group.source, reason: group.reason, records: group.records,
      floors: [...group.floors.values()].map(floor => ({ key: floor.key, label: floor.label, number: floor.number, rawLabels: [...floor.rawLabels].filter(Boolean), single: floor.single, reason: floor.reason, records: floor.records })).sort(floorSort)
    })).sort((a, b) => Number(b.exact) - Number(a.exact) || String(a.label).localeCompare(String(b.label), 'zh-TW'));
    const stats = records.reduce((result, record) => {
      result.total += 1; if (record.current) result.current += 1; if (record.future) result.future += 1;
      if (record.comparable) result.comparable += 1; if (record.price.key === 'excluded') result.excluded += 1;
      if (!record.floorLocated) result.unresolvedFloor += 1; if (!record.doorplateLocated) result.unresolvedAddress += 1;
      return result;
    }, { total: 0, current: 0, future: 0, comparable: 0, excluded: 0, unresolvedFloor: 0, unresolvedAddress: 0 });
    return { version: VERSION, communityId: community?.id ?? null, addresses: addressList, records,
      stats: { ...stats, addressCount: addressList.length, floorCount: addressList.reduce((sum, address) => sum + address.floors.length, 0) } };
  }

  function recordPriceText(record) {
    const row = record?.row || {};
    const total = isFiniteNumber(row?.priceWan) ? `${numberText(row.priceWan, 1)} 萬` : '總價待補';
    const unit = record?.price?.key === 'eligible' && isFiniteNumber(row?.unitWan)
      ? `${numberText(row.unitWan, 2)} 萬／坪`
      : record?.price?.key === 'missing-price' ? '可比單價待補' : '未列入可比單價';
    return `${total} · ${unit}`;
  }
  function recordRoomText(row) {
    const values = [];
    if (isFiniteNumber(row?.roomCount)) values.push(`${numberText(row.roomCount, 0)} 房`);
    if (isFiniteNumber(row?.hallCount)) values.push(`${numberText(row.hallCount, 0)} 廳`);
    if (isFiniteNumber(row?.bathCount)) values.push(`${numberText(row.bathCount, 0)} 衛`);
    return values.join('／') || '格局待核';
  }
  function recordStatusText(record) {
    const parts = [record.price.label];
    if (!record.current && record.period.label) parts.push(record.period.label);
    if (!record.floorLocated) parts.push(record.floor.reason || '無法定位至單樓');
    if (!record.doorplateLocated) parts.push('門牌待核，未與其他門牌合併');
    if (record.row?.singleBuilding === false) parts.push('來源標示非單一棟；不暗示獨立一戶');
    return parts.join('；');
  }
  function recordClass(record) {
    const classes = [CLASS_NAMES.record, `is-${record.price.key}`];
    if (!record.current) classes.push('is-outside-period');
    if (record.future) classes.push('is-future');
    if (!record.floorLocated) classes.push('is-unresolved-floor');
    if (!record.doorplateLocated) classes.push('is-unresolved-address');
    return classes.join(' ');
  }
  function recordSort(a, b) {
    return String(b.row?.date || '').localeCompare(String(a.row?.date || '')) || String(a.key).localeCompare(String(b.key));
  }
  function floorSort(a, b) {
    if (a.single && b.single) {
      const byNumber = (Number.isFinite(b.number) ? b.number : -Infinity) - (Number.isFinite(a.number) ? a.number : -Infinity);
      return byNumber || String(a.label).localeCompare(String(b.label), 'zh-TW');
    }
    if (a.single) return -1;
    if (b.single) return 1;
    return String(a.label).localeCompare(String(b.label), 'zh-TW');
  }

  function recordMarkup(record, selected) {
    const row = record.row || {};
    const rowId = `floor-sales-record-${record.key}`;
    const checked = selected.includes(record.key);
    const parking = normalize(row.parkingMode) || '車位待核';
    const source = normalize(row.unitIdentity || row.address);
    const sourceRow = normalize(row.sourceRow || row.transactionId || row.id);
    return `<li class="${recordClass(record)}" data-floor-sales-record data-record-key="${esc(record.key)}" data-status="${esc(record.price.key)}">
      <details class="floor-sales__record-details">
        <summary class="floor-sales__record-summary"><span class="floor-sales__record-date">${esc(dateText(row.date))}</span><span class="floor-sales__record-price">${esc(recordPriceText(record))}</span><span class="floor-sales__record-floor">${esc(record.floor.label)}</span></summary>
        <div class="floor-sales__record-body">
          <label class="floor-sales__compare-toggle" for="${esc(rowId)}"><input id="${esc(rowId)}" type="checkbox" data-floor-sales-compare value="${esc(record.key)}" ${checked ? 'checked' : ''}>選取作兩筆對照</label>
          <dl class="floor-sales__record-fields">
            <div><dt>交易日期</dt><dd>${esc(dateText(row.date))}</dd></div>
            <div><dt>樓層原值</dt><dd>${esc(normalize(row.floor) || '樓層待核')}</dd></div>
            <div><dt>總價</dt><dd>${esc(isFiniteNumber(row.priceWan) ? `${numberText(row.priceWan, 1)} 萬元` : '待補')}</dd></div>
            <div><dt>面積</dt><dd>${esc(isFiniteNumber(row.areaPing) ? `${numberText(row.areaPing, 2)} 坪` : '待補')}</dd></div>
            <div><dt>可比單價</dt><dd>${esc(record.price.key === 'eligible' && isFiniteNumber(row.unitWan) ? `${numberText(row.unitWan, 2)} 萬元／坪` : record.price.key === 'missing-price' ? '可比單價待補' : '未列入可比單價')}</dd></div>
            <div><dt>用途／格局</dt><dd>${esc(normalize(row.categoryLabel || row.category) || '分類待核')} · ${esc(recordRoomText(row))}</dd></div>
            <div><dt>車位</dt><dd>${esc(parking)}</dd></div>
            <div><dt>門牌／戶別</dt><dd>${esc(source || '門牌待核')}</dd></div>
            <div><dt>統計狀態</dt><dd class="floor-sales__status floor-sales__status--${esc(record.price.key)}">${esc(recordStatusText(record))}</dd></div>
          </dl>
          ${normalize(row.exclusionReason) ? `<p class="floor-sales__record-note"><strong>排除原因：</strong>${esc(row.exclusionReason)}</p>` : ''}
          ${normalize(row.notes) ? `<p class="floor-sales__record-note"><strong>原始備註：</strong>${esc(row.notes)}</p>` : ''}
          ${sourceRow ? `<p class="floor-sales__source"><small>來源列：${esc(sourceRow)}</small></p>` : ''}
        </div>
      </details>
    </li>`;
  }

  function floorMarkup(floor, selected, isOpen) {
    const records = [...floor.records].sort(recordSort);
    const comparable = records.filter(record => record.comparable && record.current && record.floorLocated && record.doorplateLocated).length;
    const labels = floor.rawLabels.filter(Boolean);
    const qualifier = labels.length > 1 ? `（原始標示：${labels.join('、')}）` : '';
    return `<details class="${CLASS_NAMES.floor} ${floor.single ? 'is-single-floor' : 'is-unresolved-floor'}" data-floor-sales-floor data-floor-key="${esc(floor.key)}" ${isOpen ? 'open' : ''}>
      <summary class="floor-sales__floor-summary"><span class="floor-sales__floor-name">${esc(floor.label)}</span><span class="floor-sales__floor-qualifier">${esc(qualifier)}</span><span class="floor-sales__floor-count">${records.length} 筆 · 可比 ${comparable} 筆</span></summary>
      <div class="floor-sales__floor-body">
        ${floor.empty ? '<p class="floor-sales__notice" role="status">本條件無揭露成交；不以其他樓層、鄰近門牌或其他社區價格補值。</p>' : ''}
        ${floor.single ? '' : `<p class="floor-sales__notice floor-sales__notice--warning" role="status">${esc(floor.reason || '本列不能定位至單一樓層；保留逐筆資料，不分派到其他樓層。')}</p>`}
        ${records.length ? `<ul class="floor-sales__record-list">${records.map(record => recordMarkup(record, selected)).join('')}</ul>` : ''}
      </div>
    </details>`;
  }

  function addressMarkup(address, selected) {
    const current = address.records.filter(record => record.current).length;
    const hasMultiBuildingRows = address.records.some(record => record.row?.singleBuilding === false);
    const floors = [...address.floors].sort(floorSort);
    const firstWithRows = floors.findIndex(floor => floor.records.length > 0);
    return `<section class="${CLASS_NAMES.address} ${address.exact ? 'is-official' : 'is-unresolved'}" data-floor-sales-address data-address-key="${esc(address.key)}">
      <header class="floor-sales__address-heading"><h4>${esc(address.label)}</h4><span class="floor-sales__address-badge">${address.exact ? '正式門牌核對' : '門牌待核，未合併'}${hasMultiBuildingRows ? ' · 含多棟來源列' : ''}</span><p>逐筆成交依樓層分開顯示</p></header>
      ${address.reason ? `<p class="floor-sales__notice floor-sales__notice--warning" role="status">${esc(address.reason)}</p>` : ''}
      ${hasMultiBuildingRows ? '<p class="floor-sales__notice floor-sales__notice--warning" role="status">部分來源列標示非單一棟；此處只保留原始門牌與樓層，不暗示獨立一戶。</p>' : ''}
      <div class="floor-sales__floors">${floors.map((floor, index) => floorMarkup(floor, selected, index === firstWithRows)).join('')}</div>
    </section>`;
  }

  function displayAddress(address, community) {
    const buildingCount = Number(community?.buildingCount);
    const totalFloors = Number(community?.floors);
    if (!address.exact || buildingCount !== 1 || !Number.isInteger(totalFloors) || totalFloors < 1 || totalFloors > 100) return address;
    const floors = [...address.floors];
    const known = new Set(floors.filter(floor => floor.single && Number.isInteger(floor.number) && floor.number > 0).map(floor => floor.number));
    for (let number = 1; number <= totalFloors; number += 1) {
      if (!known.has(number)) floors.push({ key: `empty:${number}`, label: `${number}樓`, number, rawLabels: [], single: true, empty: true, reason: '本條件無揭露', records: [] });
    }
    return { ...address, floors };
  }

  function unitDelta(records) {
    if (records.length !== 2) return null;
    const first = records[0], second = records[1];
    if (first.price.key !== 'eligible' || second.price.key !== 'eligible') return null;
    if (!isFiniteNumber(first.row?.unitWan) || !isFiniteNumber(second.row?.unitWan)) return null;
    return Number(second.row.unitWan) - Number(first.row.unitWan);
  }
  function compareMarkup(records) {
    if (!records.length) return '';
    const heading = records.length === 1 ? '已選 1 筆，請再選 1 筆' : '兩筆成交對照';
    const caution = records.length === 2 && records[0].address.key !== records[1].address.key
      ? '兩筆不是同一個可核對門牌；只並列原始欄位，不作同門牌比較。'
      : records.some(record => record.row?.singleBuilding === false)
        ? '至少一筆來源標示非單一棟；只並列原始欄位，不暗示獨立一戶。'
        : '只並列原始欄位，不計算或推論樓層價差；日期、戶別、車位及交易條件仍須個案核對。';
    const delta = unitDelta(records);
    const deltaText = delta === null ? '' : `<p class="floor-sales__compare-delta" data-floor-sales-unit-delta>第二筆－第一筆可比單價：<strong>${delta >= 0 ? '+' : ''}${esc(numberText(delta, 2))} 萬元／坪</strong><small>僅為資料差值，與成交日期及車位一起看，不解讀為樓層加價。</small></p>`;
    return `<section class="${CLASS_NAMES.compare}" data-floor-sales-compare aria-labelledby="floor-sales-compare-title">
      <div class="floor-sales__compare-heading"><h3 id="floor-sales-compare-title">${esc(heading)}</h3><button type="button" class="floor-sales__clear" data-floor-sales-clear>清除對照</button></div>
      <p class="floor-sales__notice" role="status">${esc(caution)}</p>${deltaText}
      <div class="floor-sales__compare-grid">${records.map(record => {
        const row = record.row || {};
        const comparablePrice = record.price.key === 'eligible' && isFiniteNumber(row.unitWan)
          ? `${numberText(row.unitWan, 2)} 萬元／坪` : record.price.key === 'missing-price' ? '可比單價待補' : '未列入可比單價';
        return `<article class="floor-sales__compare-record" data-compare-record-key="${esc(record.key)}"><h4>${esc(dateText(row.date))} · ${esc(record.floor.label)}</h4><dl><div><dt>門牌／戶別</dt><dd>${esc(normalize(row.unitIdentity || row.address) || '門牌待核')}</dd></div><div><dt>總價</dt><dd>${esc(isFiniteNumber(row.priceWan) ? `${numberText(row.priceWan, 1)} 萬元` : '待補')}</dd></div><div><dt>面積</dt><dd>${esc(isFiniteNumber(row.areaPing) ? `${numberText(row.areaPing, 2)} 坪` : '待補')}</dd></div><div><dt>可比單價</dt><dd>${esc(comparablePrice)}</dd></div><div><dt>房數／車位</dt><dd>${esc(recordRoomText(row))} · ${esc(normalize(row.parkingMode) || '車位待核')}</dd></div><div><dt>狀態</dt><dd>${esc(recordStatusText(record))}</dd></div></dl></article>`;
      }).join('')}</div>
    </section>`;
  }

  function modelAddresses(model, selectedAddressKey) {
    if (!selectedAddressKey || selectedAddressKey === 'all') return model.addresses;
    return model.addresses.filter(address => address.key === selectedAddressKey);
  }
  function resolveRoot(root) {
    if (typeof root === 'string') return document.querySelector(root);
    return root;
  }

  function captureUi(root) {
    if (!root) return null;
    const openFloors = [...root.querySelectorAll('[data-floor-sales-floor][open]')].map(node => node.dataset.floorKey).filter(Boolean);
    const openRecords = [...root.querySelectorAll('[data-floor-sales-record] details[open]')].map(node => node.closest('[data-floor-sales-record]')?.dataset.recordKey).filter(Boolean);
    const active = typeof document !== 'undefined' && root.contains(document.activeElement) ? document.activeElement : null;
    return {
      openFloors,
      openRecords,
      activeRecord: active?.closest?.('[data-floor-sales-record]')?.dataset.recordKey || '',
      activeCompare: active?.matches?.('[data-floor-sales-compare]') ? active.value : ''
    };
  }
  function restoreUi(root, snapshot) {
    if (!root || !snapshot) return;
    const openFloors = new Set(snapshot.openFloors || []);
    const openRecords = new Set(snapshot.openRecords || []);
    root.querySelectorAll('[data-floor-sales-floor]').forEach(node => { node.open = openFloors.has(node.dataset.floorKey); });
    root.querySelectorAll('[data-floor-sales-record]').forEach(node => {
      const key = node.dataset.recordKey;
      const details = node.querySelector('details');
      if (details) details.open = openRecords.has(key);
    });
    if (snapshot.activeRecord) {
      const row = [...root.querySelectorAll('[data-floor-sales-record]')].find(node => node.dataset.recordKey === snapshot.activeRecord);
      row?.querySelector('[data-floor-sales-compare]')?.focus({ preventScroll: true });
    } else if (snapshot.activeCompare) {
      const input = [...root.querySelectorAll('[data-floor-sales-compare]')].find(node => node.value === snapshot.activeCompare);
      input?.focus({ preventScroll: true });
    }
  }

  function renderState(state, uiSnapshot = null) {
    const { root, community, model, selectedAddressKey, selectedKeys } = state;
    const selectedRecords = selectedKeys.map(key => model.records.find(record => record.key === key)).filter(Boolean);
    const addresses = modelAddresses(model, selectedAddressKey).map(address => displayAddress(address, community));
    const buildingCount = Number(community?.buildingCount);
    const positionCaution = /鄰近|推估/.test(`${community?.positionQuality || ''}${community?.positionEstimated || ''}`)
      ? '位置若為鄰近門牌推估，僅供地圖定位；本元件不以位置推估或合併成交門牌。' : '';
    const multiBuildingRows = model.records.some(record => record.row?.singleBuilding === false);
    const noRows = !model.records.length;
    root.classList.add(CLASS_NAMES.root);
    root.dataset.floorSalesRoot = 'true';
    if (community?.id !== undefined) root.dataset.communityId = String(community.id);
    root.innerHTML = `<div class="floor-sales__header">
      <h3 class="floor-sales__title">門牌與樓層成交</h3>
      <p class="floor-sales__summary" data-floor-sales-summary>${noRows ? '目前載入範圍沒有成交列。' : `本次載入 ${model.stats.total} 筆成交，其中 ${model.stats.comparable} 筆價格適合列入可比統計。`}</p>
      ${model.addresses.length > 1 ? `<div class="floor-sales__controls"><label for="floor-sales-address-select">同門牌篩選</label><select id="floor-sales-address-select" data-floor-sales-address-select aria-label="同門牌篩選"><option value="all" ${selectedAddressKey === 'all' ? 'selected' : ''}>全部門牌（分開顯示，不合併）</option>${model.addresses.map(address => `<option value="${esc(address.key)}" ${selectedAddressKey === address.key ? 'selected' : ''}>${esc(address.label)}${address.exact ? '（正式核對）' : '（待核）'}</option>`).join('')}</select></div>` : ''}
      ${Number.isInteger(buildingCount) && buildingCount > 1 ? `<p class="floor-sales__notice floor-sales__notice--warning" role="status">名冊列載 ${esc(buildingCount)} 棟；不同棟別依可核對門牌分開，不跨門牌合併。</p>` : ''}
      ${multiBuildingRows ? '<p class="floor-sales__notice floor-sales__notice--warning" role="status">部分來源列標示非單一棟；本元件不把該列當成單一棟獨立戶別。</p>' : ''}
      ${positionCaution ? `<p class="floor-sales__notice floor-sales__notice--warning" role="status">${esc(positionCaution)}</p>` : ''}
      ${noRows ? '<p class="floor-sales__notice" role="status">不以鄰近門牌、其他樓層或其他社區價格填補。若要查看其他期間，請由外層重新載入條件。</p>' : ''}
      ${state.lastNotice ? `<p class="floor-sales__notice floor-sales__notice--warning" role="alert">${esc(state.lastNotice)}</p>` : ''}
    </div>
    <div class="floor-sales__addresses" data-floor-sales-addresses>${addresses.length ? addresses.map(address => addressMarkup(address, selectedKeys)).join('') : ''}</div>
    ${compareMarkup(selectedRecords)}
    <p class="floor-sales__footnote">價格沿用資料原欄位；納入／排除、特殊交易、車位與門牌待核狀態逐筆保留，不代表銀行鑑價或樓層純效果。</p>`;
    const selector = root.querySelector(SELECTORS.addressSelect);
    if (selector) selector.addEventListener('change', event => {
      state.selectedAddressKey = event.target.value || 'all';
      state.lastNotice = '';
      renderState(state);
    }, { once: true });
    restoreUi(root, uiSnapshot);
  }

  function attachEvents(state) {
    const { root } = state;
    state.onChange = event => {
      const input = event.target.closest?.(SELECTORS.compare);
      if (!input) return;
      const uiSnapshot = captureUi(root);
      const key = input.value;
      state.lastNotice = '';
      if (input.checked) {
        if (state.selectedKeys.length >= 2) {
          input.checked = false;
          state.lastNotice = '最多只能選兩筆成交對照。';
          renderState(state, uiSnapshot);
          return;
        }
        state.selectedKeys.push(key);
      } else {
        state.selectedKeys = state.selectedKeys.filter(selectedKey => selectedKey !== key);
      }
      if (typeof state.options.onCompareChange === 'function') state.options.onCompareChange(state.selectedKeys.map(selectedKey => state.model.records.find(record => record.key === selectedKey)).filter(Boolean));
      renderState(state, uiSnapshot);
    };
    state.onClick = event => {
      const clear = event.target.closest?.(SELECTORS.clear);
      if (!clear) return;
      const uiSnapshot = captureUi(root);
      state.selectedKeys = [];
      state.lastNotice = '';
      if (typeof state.options.onCompareChange === 'function') state.options.onCompareChange([]);
      renderState(state, uiSnapshot);
    };
    root.addEventListener('change', state.onChange);
    root.addEventListener('click', state.onClick);
  }

  function mount(root, community = {}, rows = [], options = {}) {
    const element = resolveRoot(root);
    if (!element || typeof element.addEventListener !== 'function') throw new TypeError('FloorSales.mount 需要有效的 DOM 容器');
    if (element.__floorSalesController) element.__floorSalesController.destroy();
    const state = {
      root: element, community: community || {}, rows: Array.isArray(rows) ? rows : [], options: options || {},
      model: groupRows(rows, community || {}, options || {}), selectedAddressKey: 'all', selectedKeys: [], lastNotice: ''
    };
    const controller = {
      version: VERSION,
      root: element,
      get model() { return state.model; },
      get selected() { return state.selectedKeys.map(key => state.model.records.find(record => record.key === key)).filter(Boolean); },
      render() { renderState(state); return controller; },
      update(nextCommunity = state.community, nextRows = state.rows, nextOptions = state.options) {
        state.community = nextCommunity || {};
        state.rows = Array.isArray(nextRows) ? nextRows : [];
        state.options = nextOptions || {};
        state.model = groupRows(state.rows, state.community, state.options);
        state.selectedKeys = state.selectedKeys.filter(key => state.model.records.some(record => record.key === key));
        renderState(state);
        return controller;
      },
      open() { element.hidden = false; return controller; },
      close() { element.hidden = true; return controller; },
      destroy() {
        element.removeEventListener('change', state.onChange);
        element.removeEventListener('click', state.onClick);
        element.innerHTML = '';
        delete element.__floorSalesController;
      }
    };
    element.__floorSalesController = controller;
    attachEvents(state);
    renderState(state);
    return controller;
  }

  host.FloorSales = Object.freeze({ version: VERSION, selectors: SELECTORS, classNames: CLASS_NAMES,
    groupRows, groupTransactions: groupRows, mount });
})();
