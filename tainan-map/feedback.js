(()=>{
  'use strict';

  const MAX_DRAFT_LENGTH=2000;
  const HANDOFF_NOTE='尚未送出給團隊；請至安心城「選單→使用回饋」貼上並提交。';
  const districts='全市 中西區 東區 南區 北區 安平區 安南區 永康區 歸仁區 新化區 左鎮區 玉井區 楠西區 南化區 仁德區 關廟區 龍崎區 官田區 麻豆區 佳里區 西港區 七股區 將軍區 學甲區 北門區 新營區 後壁區 白河區 東山區 六甲區 下營區 柳營區 鹽水區 善化區 大內區 山上區 新市區 安定區'.split(' ');
  const categoryLabels={suggestion:'功能建議',bug:'無法使用',content:'內容勘誤',experience:'操作體驗'};
  const dialog=document.createElement('dialog');
  dialog.id='feedbackDialog';
  dialog.setAttribute('aria-labelledby','feedbackTitle');
  dialog.innerHTML=`<style>#feedbackDialog{width:min(92vw,560px);max-height:85vh;overflow:auto;border:1px solid #b9c5c2;border-radius:18px;padding:24px;background:#fff;color:#193b36}#feedbackDialog::backdrop{background:#172e3388}#feedbackDialog label{display:block;margin:14px 0}#feedbackDialog select,#feedbackDialog textarea{display:block;width:100%;box-sizing:border-box;padding:10px;font:inherit}#feedbackDialog button,#feedbackDialog a{margin:6px 6px 6px 0}#feedbackDialog fieldset{border:0;padding:0}#feedbackDialog [role=status]{white-space:pre-wrap;overflow-wrap:anywhere}#feedbackDialog .feedback-handoff{margin:14px 0;padding:12px 14px;border:1px solid #caa65d;border-radius:12px;background:#fcf8ed}#feedbackDialog .draft-limit{margin:6px 0;color:#526560;font-size:.92em}#feedbackDialog .draft-limit.over-limit{color:#9b3027;font-weight:700}</style><div class="feedback-toolbar"><h2 id="feedbackTitle">幫台南地圖更好用</h2><button type="button" data-close aria-label="關閉回饋">關閉 ×</button></div><p>僅供網站改善，請勿填寫姓名、電話、地址或案件資料；不是案件委任或預約。</p><p><a href="https://homegoestate.github.io/anxin-city/?view=city" target="_blank" rel="noopener noreferrer">開啟安心城正式收件 ↗</a></p><p class="feedback-handoff"><strong>交接步驟：</strong>先複製回饋文字；再開啟安心城，點右上角「選單」→「使用回饋」，貼上並按送出。此頁只產生草稿，下載只是備份，尚未送出給團隊。</p><p data-context></p><form><fieldset><label>回饋種類<select name="category" required><option value="">請選擇</option><option value="suggestion">功能建議</option><option value="bug">無法使用</option><option value="content">內容勘誤</option><option value="experience">操作體驗</option></select></label><label>行政區<select name="district" required>${districts.map(x=>`<option>${x}</option>`).join('')}</select></label><label>內容（至少 10 字；貼上安心城前含前綴總計不超過 2,000 字）<textarea name="message" rows="5" minlength="10" required></textarea></label><p class="draft-limit" data-length aria-live="polite"></p><label><input name="consent" type="checkbox" required> 我知道這頁只產生草稿，正式保存要到安心城送出</label></fieldset><p>草稿只保留在目前頁面；關閉或重整前請下載備份。</p><button type="submit" data-submit>下載回饋草稿（尚未送出）</button><button type="button" data-copy>複製回饋文字</button><p role="status" aria-live="polite">尚未送出給團隊。</p><textarea data-copy-fallback hidden readonly aria-label="請手動複製回饋文字"></textarea></form>`;
  document.body.append(dialog);

  const form=dialog.querySelector('form');
  const status=form.querySelector('[role=status]');
  const lengthNote=form.querySelector('[data-length]');
  const val=name=>form.elements.namedItem(name);
  let context={};

  function draftText(message=val('message').value){
    const lines=[
      `[台南地圖V5｜${val('district').value}]`,
      `種類：${categoryLabels[val('category').value]||'尚未選擇'}`,
      context.communityId?`社區：${context.communityId}`:'',
      context.contentId?`內容：${context.contentId}`:'',
      String(message),
    ];
    return lines.filter(Boolean).join('\n');
  }

  function draftLength(){return draftText().length;}

  function updateDraftMetrics(){
    const length=draftLength();
    const over=length>MAX_DRAFT_LENGTH;
    lengthNote.textContent=`貼上後總字數：${length.toLocaleString('zh-TW')} / ${MAX_DRAFT_LENGTH.toLocaleString('zh-TW')}${over?'（超過上限，請縮短；不會自動截斷）':''}`;
    lengthNote.classList.toggle('over-limit',over);
  }

  function safeDraft(){
    const text=draftText();
    if(text.length>MAX_DRAFT_LENGTH){
      status.textContent=`貼上安心城前共 ${text.length.toLocaleString('zh-TW')} 字，超過 2,000 字；未複製或下載，請縮短內容後再試。`;
      return null;
    }
    return text;
  }

  function download(text=safeDraft()){
    if(!text)return false;
    const downloadText=`${text}\n\n---\n${HANDOFF_NOTE}`;
    const url=URL.createObjectURL(new Blob([downloadText],{type:'text/plain;charset=utf-8'}));
    const a=document.createElement('a');
    a.href=url;
    a.download='台南地圖回饋-尚未送出.txt';
    a.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
    status.textContent='已開啟下載。若未出現檔案，請使用「複製回饋文字」。草稿尚未送出給團隊。';
    return true;
  }

  val('message').addEventListener('input',updateDraftMetrics);
  val('category').addEventListener('change',updateDraftMetrics);
  val('district').addEventListener('change',updateDraftMetrics);
  form.querySelector('[data-copy]').onclick=async()=>{
    const text=safeDraft();
    if(!text)return;
    try{
      await navigator.clipboard.writeText(text);
      status.textContent='回饋文字已複製；尚未送出給團隊。請開啟安心城正式收件，貼上後按送出。';
    }catch{
      const t=form.querySelector('[data-copy-fallback]');
      t.hidden=false;
      t.value=text;
      t.focus();
      t.select();
      status.textContent='請手動複製下方回饋草稿；尚未送出給團隊。';
    }
  };
  dialog.querySelector('[data-close]').onclick=()=>dialog.close();
  form.onsubmit=e=>{
    e.preventDefault();
    const text=safeDraft();
    if(!text||!form.reportValidity())return;
    download(text);
  };

  window.MapFeedback={open(input={}){
    if(!val('message').value){
      context={};
      for(const key of ['communityId','contentId']){
        if(typeof input[key]==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(input[key]))context[key]=input[key];
      }
      val('district').value=districts.includes(input.district)?input.district:'全市';
    }
    dialog.querySelector('[data-context]').textContent='目前回饋：'+val('district').value+(context.communityId?'｜社區 '+context.communityId:'')+(context.contentId?'｜內容 '+context.contentId:'');
    updateDraftMetrics();
    if(!dialog.open){dialog.showModal();dialog.scrollTop=0;}
  }};

  updateDraftMetrics();
})();
