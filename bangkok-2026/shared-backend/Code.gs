/**
 * Bangkok, Your Way — 選配同步後端（Google Apps Script）
 * 使用方式：建立一份新的 Google 試算表 → 擴充功能 → Apps Script → 貼上本檔 → 執行 setup()
 * 部署為「網頁應用程式」：以本人身分執行，存取者「所有人」；將 /exec 網址貼到前端 config.js。
 * 警告：讀取列表為所有知道網站／API URL 者可讀，僅收團員暱稱與一般行程偏好。
 * 不收護照、電話、公司資料、健康資訊或大麻相關資訊。
 */
const BKK_SETTINGS = Object.freeze({
  people: 14,
  sheetMembers: 'Members',
  sheetRSVP: 'RSVP',
  maxParam: 1500
});
function setup(){
  const ss=SpreadsheetApp.getActiveSpreadsheet();
  if(!ss)throw Error('請從一份 Google 試算表的「擴充功能 → Apps Script」建立專案。');
  let m=ss.getSheetByName(BKK_SETTINGS.sheetMembers);
  if(!m){m=ss.insertSheet(BKK_SETTINGS.sheetMembers);m.getRange(1,1,1,3).setValues([['成員編號','個人登記碼','發給誰（自行記錄）']]);m.getRange(2,1,14,2).setNumberFormat('@');
    const rows=Array.from({length:14},(_,i)=>[String(i+1).padStart(2,'0'),Utilities.getUuid().replace(/-/g,'').slice(0,20)]);
    m.getRange(2,1,14,2).setValues(rows);
    m.setFrozenRows(1);m.autoResizeColumns(1,3);
  }
  let r=ss.getSheetByName(BKK_SETTINGS.sheetRSVP);
  if(!r){r=ss.insertSheet(BKK_SETTINGS.sheetRSVP);r.getRange(1,1,1,12).setValues([['成員編號','暱稱','12/2路線','12/3路線','12/4路線','侏羅紀','Thainosaur','晚宴','飲食／休息偏好','備註','更新時間','版本']]);r.getRange('A:A').setNumberFormat('@');r.setFrozenRows(1);r.autoResizeColumns(1,12);}
  Logger.log('建立完畢。請在 Members 分別將 14 組編號＋登記碼傳給對應團員；不要公開整張 Members 工作表。');
}
function doGet(e){
 const p=(e&&e.parameter)||{};
 const cb=String(p.callback||'');
 if(!/^__bkk_jsonp_\d+_\d+$/.test(cb))return ContentService.createTextOutput('invalid callback').setMimeType(ContentService.MimeType.TEXT);
 let output;
 try{
  if(p.op==='list')output={ok:true,members:getMembers_()};
  else if(p.op==='save')output=saveMember_(p.p);
  else if(p.op==='ping')output={ok:true,version:'BKK_SYNC_V1'};
  else output={ok:false,error:'Unsupported action'};
 }catch(err){output={ok:false,error:String(err&&err.message||'處理失敗').slice(0,150)};}
 return ContentService.createTextOutput(cb+'('+JSON.stringify(output)+');').setMimeType(ContentService.MimeType.JAVASCRIPT);
}
function sheets_(){const s=SpreadsheetApp.getActiveSpreadsheet();if(!s)throw Error('找不到試算表');const memberSheet=s.getSheetByName(BKK_SETTINGS.sheetMembers),rsvpSheet=s.getSheetByName(BKK_SETTINGS.sheetRSVP);if(!memberSheet||!rsvpSheet)throw Error('請主揪先執行 setup()');return {memberSheet,rsvpSheet}}
function getMembers_(){
 const {rsvpSheet}=sheets_(),n=rsvpSheet.getLastRow();if(n<2)return [];
 return rsvpSheet.getRange(2,1,n-1,12).getValues().filter(r=>r[0]&&r[1]).slice(0,14).map(r=>({
  n:String(r[0]).padStart(2,'0'),name:String(r[1]).slice(0,18),d2:String(r[2]||''),d3:String(r[3]||''),d4:String(r[4]||''),j:String(r[5]||''),t:String(r[6]||''),dn:String(r[7]||''),prefs:String(r[8]||'').split('、').filter(Boolean).slice(0,8),updated:r[10] instanceof Date?r[10].toISOString():String(r[10]||'')
 }));
}
function clean_(x,max){let s=String(x||'').replace(/[\x00-\x1F\x7F]/g,' ').trim().slice(0,max);if(/^[=+@-]/.test(s))s="'"+s;return s}
function saveMember_(raw){
 if(typeof raw!=='string'||raw.length>BKK_SETTINGS.maxParam)throw Error('登記內容過長');
 const x=JSON.parse(raw);
 const n=String(x.n||''),code=String(x.code||''),name=clean_(x.name,18);
 if(!/^(0[1-9]|1[0-4])$/.test(n))throw Error('成員編號必須是01–14');
 if(!/^[a-zA-Z0-9]{20}$/.test(code))throw Error('登記碼格式不正確');
 if(name.length<1)throw Error('暱稱不能空白');
 const allowed2=['','2A','2B','2C','2D','2E'],allowed3=['','3A','3B','3C','3D','3E'],allowed4=['','4A','4B','4C','4D','4E'];
 if(!allowed2.includes(x.d2)||!allowed3.includes(x.d3)||!allowed4.includes(x.d4))throw Error('分組值不在合法選項');
 if(!['yes','maybe','no'].includes(x.j)||!['yes','no'].includes(x.t)||!['open','benjarong','nahm','sritrat','saffron','none'].includes(x.dn))throw Error('登記值有誤');
 const {memberSheet,rsvpSheet}=sheets_();
 const rows=memberSheet.getLastRow()>1?memberSheet.getRange(2,1,memberSheet.getLastRow()-1,2).getDisplayValues():[];
 const entry=rows.find(r=>String(r[0]).padStart(2,'0')===n);
 if(!entry||entry[1]!==code)throw Error('編號或登記碼有誤；請向主揪確認');
 const validPrefs=['泰菜','麵食','不吃牛','咖啡甜點','酒吧調酒','無酒精飲料','需要休息','指定吸菸處休息'];
 const prefs=Array.isArray(x.prefs)?x.prefs.filter(z=>validPrefs.includes(z)).slice(0,8):[];
 const values=[n,name,x.d2,x.d3,x.d4,x.j,x.t,x.dn,prefs.join('、'),clean_(x.note,80),new Date(),'1.0'];
 const lock=LockService.getScriptLock();lock.waitLock(20000);
 try{
  let target=0,last=rsvpSheet.getLastRow();if(last>1){let codes=rsvpSheet.getRange(2,1,last-1,1).getDisplayValues();let idx=codes.findIndex(r=>String(r[0]).padStart(2,'0')===n);if(idx>=0)target=idx+2;}
  if(!target)target=last+1;
  rsvpSheet.getRange(target,1,1,values.length).setValues([values]);
  SpreadsheetApp.flush();
  return {ok:true,n,updatedAt:new Date().toISOString()};
 }finally{lock.releaseLock()}
}
