const LINE_URL = "https://line.me/R/ti/p/@604gpqef?oat_content=url&ts=08151229";
const BOOKING_URL = "https://homegoestate.github.io/line-member-booking/";

const header = `
<a class="skip-link" href="#main">跳到主要內容</a>
<header class="site-header">
  <div class="header-inner">
    <a class="brand" href="index.html" aria-label="回首頁">
      <span class="brand-mark">HG</span>
      <span><strong>宏國地政｜易丞地政</strong><span>不動產整合專業團隊</span></span>
    </a>
    <button class="menu-toggle" type="button" aria-expanded="false" aria-controls="main-nav">選單</button>
    <nav class="main-nav" id="main-nav" aria-label="主要選單">
      <a href="about.html">關於我們</a>
      <a href="services.html">專業服務</a>
      <a href="documents.html">應備文件</a>
      <a href="news.html">房產新知</a>
      <a href="contact.html">聯絡我們</a>
      <a class="nav-cta" href="${BOOKING_URL}">付費諮詢</a>
    </nav>
  </div>
</header>`;

const footer = `
<footer class="site-footer">
  <div class="footer-grid">
    <section><h2>宏國地政｜易丞地政</h2><p>不只處理登記，更從交易安全、貸款、稅務、土地整合與財產傳承，協助客戶做出可長期安心的決策。</p><p class="footer-note">本網站內容為一般資訊，個案仍應依最新法規、契約與主管機關認定進行專業判斷。</p></section>
    <section><h3>快速聯絡</h3><p><a href="tel:062582589">電話：06-258-2589</a><br><a href="https://www.google.com/maps?q=台南市北區文賢路1080巷11號">台南市北區文賢路1080巷11號</a></p></section>
    <section><h3>官方社群</h3><p><a href="${LINE_URL}">LINE 官方帳號</a><br><a href="https://www.facebook.com/share/16axEpYNX7/?mibextid=wwXIfr">Facebook</a><br><a href="https://www.instagram.com/ycl_real_estate8888">Instagram</a></p></section>
  </div>
</footer>
<nav class="mobile-actions" aria-label="行動快捷列">
  <a href="tel:062582589">☎ 電話</a><a href="${LINE_URL}">LINE</a><a class="primary" href="${BOOKING_URL}">專人諮詢</a>
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
