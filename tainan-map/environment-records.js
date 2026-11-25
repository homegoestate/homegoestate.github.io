(() => {
  'use strict';

  // These are official landing pages or datasets.  Do not turn a missing row
  // into a "safe" conclusion: each source has its own scope and snapshot date.
  const source = Object.freeze({
    redYellowDataset: 'https://data.tainan.gov.tw/DataSet/Detail/3eb5e9c8-253c-4296-878a-56a07f272678?handler=Download',
    yellowList: 'https://data.tainan.gov.tw/Resource/b8c895f9-70bc-4026-aec8-f0f002b2af2a',
    redList: 'https://data.tainan.gov.tw/Resource/30c2eeb2-08af-4e4c-b3c6-28ac06f13070',
    unresolvedList: 'https://data.tainan.gov.tw/Resource/4e72525c-37e5-4fb8-84c7-4c0d45d285f5',
    safetyList: 'https://w3fs.tainan.gov.tw/Download.ashx?icon=.pdf&n=MTEz5bm05bu656%2BJ54mp5YWs5YWx5a6J5YWo5qqi5p%2Bl5LiN5ZCI5qC85ZCN5ZauLnBkZg%3D%3D&u=LzAwMS9VcGxvYWQvMTU4L3JlbGZpbGUvMC80NDE5Ny84YTFhY2JiYi0yMDU5LTQ1ZjMtYTVjZS1mOTU2MjdjNmU4OWUucGRm',
    safetyDeclaration: 'https://cloudbm.nlma.gov.tw/DECAD/DECQuery.do',
    seismicDeclaration: 'https://cloudbm.nlma.gov.tw/CPTL/cpt0301m.do',
    controlledBuildings: 'https://building.nlma.gov.tw/decbm/cpa',
    redYellowMeaning: 'https://www.tainan.gov.tw/News_Content.aspx?n=44024&s=8725655',
    reassessment: 'https://publicworks.tainan.gov.tw/cl.aspx?n=44045',
    permitSearch: 'https://blis.tainan.gov.tw/BuildingSearch.aspx',
    tainanMap: 'https://landmap.tainan.gov.tw/gis/',
    tainanMap3d: 'https://landmap.tainan.gov.tw/gis/?fun=3ds',
    namrReport: 'https://www.namr.gov.tw/filedownload?file=research%2F202212061548280.pdf&filedisplay=%E3%80%8CNAMR111006+%E5%8F%B0%E6%B1%9F%E5%85%A7%E6%B5%B7%E5%8F%8A%E5%A4%A7%E5%93%A1%E6%B5%B7%E6%B4%8B%E6%96%87%E5%8C%96%E7%99%BC%E5%B1%95%E7%A9%BA%E9%96%93%E8%B3%87%E6%96%99%E6%9E%B6%E6%A7%8B%E8%A6%8F%E5%8A%83%E3%80%8D%E7%B5%90%E6%A1%88%E5%A0%B1%E5%91%8A%E6%9B%B8.pdf&flag=doc',
    nlscLayers: 'https://maps.nlsc.gov.tw/pro/get_map_message.jsp',
    nlscMap: 'https://maps.nlsc.gov.tw/T09/mapshow.action?In_type=web',
    sinicaHistorical: 'https://gissrv4.sinica.edu.tw/gis/twhgis/',
    agricultureAnping: 'https://gis.ardswc.gov.tw/themes/landform/51',
    yuguangCase: 'https://www.tainan.gov.tw/News_Content.aspx?n=13370&s=7935017'
  });

  const escapeHtml = value => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  const text = (value, fallback = '') => {
    const result = String(value ?? '').trim();
    return result || fallback;
  };

  function link(href, label) {
    // Keep this renderer limited to the reviewed, external HTTPS sources.
    if (typeof href !== 'string' || !/^https:\/\//i.test(href)) return '';
    return `<a class="source-link" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)} ↗</a>`;
  }

  const links = (...items) => `<div class="env-links">${items.filter(Boolean).join('')}</div>`;

  function permitValue(community) {
    const value = community && typeof community.buildingPermit === 'string'
      ? community.buildingPermit.trim()
      : '';
    return value;
  }

  function building(community) {
    const permit = permitValue(community);
    return [
      `<section class="env-card"><h3>建物安全：按資料類型查</h3><p>紅／黃單、公安不合格與耐震評估各有查核入口，買方可依門牌逐項核對。</p>${links(link(source.redYellowMeaning, '台南市紅黃單定義'))}</section>`,
      `<section class="env-card"><h3>紅／黃單：2016 年 0206 災後快照</h3><p>資料源自 2016 年 0206 地震後列管，記錄當時地址、行政區、座標及初勘資料；資源頁另有發布／更新日。現況要再查最新公安與耐震紀錄。</p>${links(link(source.yellowList, '黃單危樓列表（CSV／JSON）'), link(source.redList, '紅單危樓列表（CSV／JSON）'), link(source.unresolvedList, '紅黃單未解列列表'), link(source.redYellowDataset, '完整 0206 資料集'))}</section>`,
      `<section class="env-card"><h3>年度公安不合格場所</h3><p>工務局「113 年度」清冊提供場所名稱、使用類組與地址，可查公共場所申報狀態；買方另應索取最新改善或複查文件。</p>${links(link(source.safetyList, '工務局公安清冊入口'))}</section>`,
      `<section class="env-card"><h3>個案查詢：貼門牌再核對</h3><p>把上方門牌貼到官方系統，分別查公安申報、耐震評估與列管場所；部分功能需登入或憑證。</p>${links(link(source.safetyDeclaration, '公共安全檢查申報'), link(source.seismicDeclaration, '公安耐震評估'), link(source.controlledBuildings, '列管場所查詢'), link(source.reassessment, '2025 大埔地震複評／解除列管程序'))}</section>`,
      permit
        ? `<section class="env-card"><h3>使用執照：回官方查編號</h3><p>${escapeHtml(permit)}。BLIS 目前依行政區、地段、地號與驗證碼查詢；使照是識別資料，不是現況安全結論。</p>${links(link(source.permitSearch, '台南市建築執照查詢 BLIS'), link(source.tainanMap3d, '台南地政 3D 建物圖台'))}</section>`
        : `<section class="env-card"><h3>使用執照：目前待核</h3><p>名冊沒有可顯示的正式使照編號；請向賣方索取，再依行政區、地段、地號回查。</p>${links(link(source.permitSearch, '台南市建築執照查詢 BLIS'), link(source.tainanMap3d, '台南地政 3D 建物圖台'))}</section>`
    ].join('');
  }

  function coast(community) {
    const district = text(community?.district, '本行政區');
    return [
      `<section class="env-card"><h3>歷史海岸線：先看年代與工具</h3><p>國家海洋研究院報告整理 17 至 20 世紀台江內海海岸線，附來源、年代、WGS84 與套合說明；中研院百年歷史地圖可操作查看歷史圖資。</p>${links(link(source.namrReport, 'NAMR 歷史海岸線報告'), link(source.sinicaHistorical, '中研院百年歷史地圖'))}</section>`,
      `<section class="env-card"><h3>海埔新生地：再查地籍類別</h3><p>國土測繪中心段籍圖的灰色類別包含河川新生地、海岸地測量及海埔新生地。先用地段、地號回查，再把歷史圖當成背景。</p>${links(link(source.nlscLayers, '國土測繪中心圖層說明'), link(source.nlscMap, '國土測繪中心圖台'))}</section>`,
      `<section class="env-card"><h3>固定案例：南區安平工業區</h3><p>安平工業區位於台南市南區；農業部圖台可滑動 1975／2025 航照，供全市訪客觀察固定區域變化。另有漁光島人工養灘／填築的市府說明，兩者都是區域案例。</p>${links(link(source.agricultureAnping, '農業部安平工業區歷史航照'), link(source.yuguangCase, '台南市漁光島官方說明'))}</section>`,
      `<section class="env-card"><h3>${escapeHtml(district)}：個案操作順序</h3><p>把門牌或座標貼到台南地政 GIS，加入歷史圖資，再用完整地段、地號核對地籍沿革。區域圖只作背景，個案以地號資料為準。</p>${links(link(source.tainanMap, '台南地政 GIS'), link(source.sinicaHistorical, '中研院百年歷史地圖'), link(source.nlscMap, '國土測繪中心圖台'))}</section>`
    ].join('');
  }

  function render(topic, community) {
    const c = community && typeof community === 'object' ? community : {};
    if (topic === 'building') return building(c);
    if (topic === 'coast') return coast(c);
    return '<section class="env-card"><h3>官方環境資料</h3><p>請選擇建物安全或海埔與舊海岸。</p></section>';
  }

  window.MapRecords = Object.freeze({render});
})();
