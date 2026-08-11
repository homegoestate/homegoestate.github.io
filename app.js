const LINE_URL = "https://line.me/R/ti/p/@604gpqef?oat_content=url&ts=08151229";
const BOOKING_URL = "https://homegoestate.github.io/line-member-booking/";

const header = `
<a class="skip-link" href="#main">跳到主要內容</a>
<header class="site-header">
  <div class="header-inner">
    <a class="brand" href="index.html" aria-label="宏國地政與易丞地政首頁">
      <span class="brand-mark">HG</span>
      <span><strong>宏國地政｜易丞地政</strong><span>不動產整合顧問</span></span>
    </a>
    <button class="menu-toggle" type="button" aria-expanded="false" aria-controls="main-nav">選單</button>
    <nav class="main-nav" id="main-nav" aria-label="主要選單">
      <a href="index.html">首頁</a>
      <a class="nav-highlight" href="documents.html">應備文件</a>
      <a href="services.html">專業服務</a>
      <a href="news.html">最新消息</a>
      <a href="about.html">關於我們</a>
      <a href="contact.html">聯絡我們</a>
      <a class="nav-cta" href="${BOOKING_URL}">專人諮詢</a>
    </nav>
  </div>
</header>`;

const footer = `
<footer class="site-footer">
  <div class="footer-grid">
    <section><div class="footer-brand">HG</div><h2>宏國地政｜易丞地政</h2><p>深耕台南超過 30 年，整合交易安全、地政登記、稅務、貸款、土地開發與財產傳承。</p><p class="footer-note">網站資訊為一般說明，個案仍須依最新法令、事實資料與承辦人員正式確認。</p></section>
    <section><h3>快速資訊</h3><p><a href="documents.html">簽約應備文件</a><br><a href="services.html">專業服務</a><br><a href="news.html">最新消息</a><br><a href="https://homegoestate.github.io/line-member-booking/">付費專人諮詢</a></p></section>
    <section><h3>聯絡方式</h3><p><a href="tel:062582589">06-258-2589</a><br><a href="https://www.google.com/maps?q=台南市北區文賢路1080巷11號">台南市北區文賢路1080巷11號</a><br><a href="mailto:homegoestate@gmail.com">homegoestate@gmail.com</a></p><div class="social-row"><a href="${LINE_URL}">LINE</a><a href="https://www.facebook.com/share/16axEpYNX7/?mibextid=wwXIfr">Facebook</a><a href="https://www.instagram.com/ycl_real_estate8888">Instagram</a></div></section>
  </div>
  <div class="footer-bottom"><span>© 宏國地政｜易丞地政</span><span>專業・誠信・責任</span></div>
</footer>
<nav class="mobile-actions" aria-label="行動版快速聯絡">
  <a href="tel:062582589"><span aria-hidden="true">☎</span>電話</a><a href="${LINE_URL}"><span aria-hidden="true">LINE</span>詢問</a><a class="primary" href="${BOOKING_URL}"><span aria-hidden="true">日</span>諮詢</a>
</nav>`;

document.body.insertAdjacentHTML("afterbegin", header);
document.body.insertAdjacentHTML("beforeend", footer);
const menuButton = document.querySelector(".menu-toggle");
const nav = document.querySelector(".main-nav");
menuButton?.addEventListener("click", () => {
  const open = nav.classList.toggle("open");
  menuButton.setAttribute("aria-expanded", String(open));
});

const current = location.pathname.split("/").pop() || "index.html";
document.querySelectorAll(".main-nav a").forEach(link => {
  if (link.getAttribute("href") === current) link.setAttribute("aria-current", "page");
});
