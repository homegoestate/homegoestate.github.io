# 官網 P0／P1 增量優化與驗收紀錄（2026-10-20）

## 1. 基準與回復方式（P0）
- 儲存庫：`homegoestate/homegoestate.github.io`
- 唯一正式基準：`main`，基準提交 `d268d9f6e8ba85dd1ba333fedb51b9d783795837`。
- 修改分支：`review/p0-p1-website-20261020`。此分支建立自以上固定提交；未直接更新 `main`。
- 基準 Git 樹：107 項（含資料夾），原版可直接由上述提交檢視或還原。不另複製大量文章、客戶資料或圖檔。
- 本 PR 未搬移、刪除或重新命名正式網站既有路徑；正式環境以合併／部署批准為準。
- 如需退出：停止 PR 審查或關閉 PR，保留 `main` 原狀即可。請勿在 PR 未驗收前合併。

## 2. 原有資產、連結及功能保留清單
- 既有網站：`index.html`、`documents.html`、`services.html`、`news.html`、`about.html`、`contact.html`、`tools.html`、`404.html`。
- 試算工具：`loan-forecast.html`、`property-tax.html`、`holding-tax.html`、`repurchase-refund.html`。
- 資料：`data/news.json`、`data/legacy-pages.json`、`data/migration-manifest.json`；圖片與 assets 保留。
- 社群：`facebook-feed.js` 與 Supabase、Make 流程不修改；`news.html` 彈窗及搜尋、`documents.html` 清單與搜尋不修改。
- 聯絡：原 LINE、電話、Facebook、Instagram、付費諮詢預約網址不修改。
- 已有 Sitemap、robots、公開工具頁網址本階段不修改，SEO 大改留待 P2。

## 3. P1 變更
1. `app.js`：主選單及頁尾增加「免費試算」入口；保留所有既有連結；行動選單增加開啟／關閉 ARIA 名稱，點選連結或 Escape 後可關閉；頁尾揭露兩位地政士各自獨立執業。
2. `index.html`：首頁描述聚焦交易風險、登記與高價值服務，移除僅供內部寫稿的網站文案；增加可直達現有工具的入口、建商／地主／傳承三類既有服務錨點。
3. `about.html`：增加執業主體說明，明確區分品牌與各自獨立的法定委任、收費、收據及業務紀錄。
4. `services.html`：在稅務與貸款服務資訊旁導入既有試算功能。
5. `contact.html`：在諮詢前提醒受任主體及收據應分開確認。
6. `styles.css`：增加新增頁面區塊的桌機／平板／手機樣式，改善約 981～1190px 導覽壓縮、手機選單滾動與安全區。
7. `scripts/site-smoke.mjs` 與 GitHub Actions：新增可重複執行的靜態連結與基礎功能守門檢查。

## 4. 自動檢查
- `node --check app.js`
- `node --check facebook-feed.js`
- `node scripts/site-smoke.mjs`
- GitHub Actions 在 PR 開啟／更新時自動執行，查看 PR Checks 結果。
- 靜態檢查不等於手機實機、銀行試算正確性、LINE 成功接待、社群同步或付費預約真正完成。

## 5. 必須由人工完成的驗收
- [ ] 以 Chrome 桌機 1440、1024、980px 確認導覽沒有橫向溢出，所有選單均可點擊。
- [ ] 以 iPhone Safari 390px、Android Chrome 360px 確認手機選單完整顯示、可用 Escape（實體鍵盤）關閉、點連結後選單收起、底部電話／LINE／諮詢不受遮擋。
- [ ] 首頁三項免費工具入口、建商／地主／傳承入口均到正確原頁面及區塊。
- [ ] 八類應備文件：搜尋、切換、頁內錨點、大字與展開功能正常。
- [ ] 四項試算工具仍能輸入、計算、顯示結果；重要試算邏輯另由專業人員確認。
- [ ] 新聞搜尋、排序、翻頁、點擊彈窗、關閉、圖片載入正常。
- [ ] Facebook 最新貼文能成功從 Supabase 顯示；失敗時有既有備援提示。
- [ ] LINE、電話、FB、IG 及付費諮詢跳轉正確。不要在測試時觸發實際付費或正式預約。
- [ ] 法定執業主體與兩人對外名稱、正式證照／聯絡資訊、收費收據文字由公司核對。
- [ ] 原站「30+ 年」及「每月約 40–50 件案件」有正式統計證據、適用期間及統計口徑；本 PR 不擅自改動該數字。
- [ ] 對外公開前確認新青安工具名稱／內容是否符合主管機關當期制度及適用條件。
- [ ] 待取得明確批准，再決定是否合併至正式 `main`。

## 6. 本階段刻意不做
- 不重建官網、不替換 Logo、不更動舊文章、圖片、原有工具試算邏輯、付款或 Google 行事曆流程。
- 不觸碰 Firebase／CRM／人事系統；不把內部業務資料放上公開網站。
- 不做 P2 每篇新聞獨立頁、進階 SEO、自動化發布；不建立新的正式部署。
