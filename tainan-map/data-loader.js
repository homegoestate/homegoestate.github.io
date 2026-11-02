/* Same V5 evidence, loaded in parts. No analytics, credentials or external API. */
(() => {
  'use strict';
  const base = new URL('.', document.currentScript.src);
  const inFlight = new Map();
  const loaded = new Set();
  let manifest;
  const hex = bytes => [...new Uint8Array(bytes)].map(x => x.toString(16).padStart(2, '0')).join('');
  async function fetchBytes(path) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);
    try {
      const response = await fetch(new URL(path, base), { signal: controller.signal, credentials: 'omit' });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return await response.arrayBuffer();
    } finally { clearTimeout(timeout); }
  }
  async function decode(entry) {
    const compressed = typeof DecompressionStream !== 'undefined';
    const bytes = await fetchBytes(compressed ? entry.gzip : entry.json);
    const expected = compressed ? entry.gzipSha256 : entry.sha256;
    if (crypto.subtle && hex(await crypto.subtle.digest('SHA-256', bytes)) !== expected) throw new Error('資料完整性檢查未通過');
    const text = compressed
      ? await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text()
      : new TextDecoder().decode(bytes);
    return JSON.parse(text);
  }
  window.catalogLoadFailed = () => {
    document.body.classList.add('catalog-loading');
    const status = document.getElementById('catalogLoadStatus');
    status.hidden = false;
    status.setAttribute('role', 'alert');
    status.querySelector('strong').textContent = '地圖資料暫時無法載入';
    status.querySelector('p').textContent = '請確認網路後重試。資料尚未載入，不代表本區沒有社區或成交。';
    const retry = document.getElementById('catalogRetry');
    retry.hidden = false; retry.onclick = () => location.reload();
  };
  window.catalogLoaded = () => {
    document.body.classList.remove('catalog-loading');
    document.getElementById('catalogLoadStatus').hidden = true;
  };
  window.CATALOG_READY = (async () => {
    manifest = JSON.parse(new TextDecoder().decode(await fetchBytes('data-manifest.json?v=20261102')));
    const data = await decode(manifest.summary);
    if (data.communities.length !== 3813 || data.meta.periods.all.start !== '2012-08-01') throw new Error('資料版本不符');
    window.PILOT_DATA = data;
    window.CATALOG_MANIFEST = manifest;
  })();
  // Attach immediately to avoid an unhandled rejection on very fast failure.
  window.CATALOG_READY.catch(window.catalogLoadFailed);
  window.ensureDistrictTransactions = async district => {
    await window.CATALOG_READY;
    if (loaded.has(district)) return;
    if (!inFlight.has(district)) {
      inFlight.set(district, (async () => {
        const entry = manifest.districts[district];
        if (!entry) throw new Error('行政區資料索引未提供');
        const rows = await decode(entry);
        const communities = window.PILOT_DATA.communities.filter(c => c.district === district);
        if (!communities.every(c => Array.isArray(rows[c.id]))) throw new Error('行政區明細不完整');
        for (const c of communities) c.transactions = rows[c.id];
        loaded.add(district);
      })().finally(() => inFlight.delete(district)));
    }
    return inFlight.get(district);
  };
})();
