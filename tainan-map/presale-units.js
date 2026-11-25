/* MOI presale filings and Tainan occupancy permits. Government Open Data License v1. */
(() => {
  'use strict';
  const records = new Map([
  [
    "community-registry-1279",
    {
      "label": "預售備查規劃戶數",
      "count": 30,
      "caseName": "家薪2",
      "permit": "(110)南工造字第03428號",
      "occupancyPermit": "(112)南工使字第01215號",
      "parcel": "竹橋段32地號",
      "filingId": "RPQNMLNKIIGGFDD67CG",
      "declaredOn": "2021-10-13",
      "sourceUrl": "https://data.gov.tw/dataset/176351",
      "occupancySourceUrl": "https://data.tainan.gov.tw/Resource/cfeba698-1892-4edc-adaa-20cf1574deac",
      "asOf": "2026-11-25"
    }
  ],
  [
    "community-registry-1705",
    {
      "label": "預售備查規劃戶數",
      "count": 20,
      "caseName": "德善101",
      "permit": "(110)南工造字第04292號",
      "occupancyPermit": "(111)南工使字第03467號",
      "parcel": "德南段101地號",
      "filingId": "QPQNMLPLJHHGFDD08DG",
      "declaredOn": "2022-01-25",
      "sourceUrl": "https://data.gov.tw/dataset/176351",
      "occupancySourceUrl": "https://data.tainan.gov.tw/Resource/db8f4c78-fea6-4ea5-91cc-ae27802bd1d7",
      "asOf": "2026-11-25"
    }
  ]
]);
  const source = {
  "archiveUrl": "https://plvr.land.moi.gov.tw/opendata/lvr_buildcasexml.zip",
  "archiveSha256": "220a1ca2899de47cb03e220ebb7b6abc800a210618c61ee6bbe86c797d5ab55a",
  "asOf": "2026-11-25",
  "tainanFilings": 993,
  "sourceCoverage": "民國100年至112年4月底；官方標示暫無資料更新"
};
  window.PresaleUnits = { lookup: id => records.get(String(id)) || null, source };
})();
