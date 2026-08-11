(function () {
  const mount = document.querySelector("[data-facebook-feed]");
  if (!mount) return;
  fetch("data/facebook-posts.json", { cache: "no-store" })
    .then((response) => response.ok ? response.json() : Promise.reject(new Error("feed unavailable")))
    .then((data) => {
      const posts = Array.isArray(data.posts) ? data.posts.slice(0, 3) : [];
      if (!posts.length) {
        mount.innerHTML = '<p class="fb-empty">最新內容正在整理中，您也可以直接前往 Facebook 查看。</p>';
        return;
      }
      mount.innerHTML = posts.map((post) => {
        const title = escapeHtml(post.title || "最新不動產知識");
        const excerpt = escapeHtml(post.excerpt || "");
        const url = safeUrl(post.url);
        const date = escapeHtml(post.publishedAt || "");
        return `<article class="fb-post-card"><small>${date}</small><h3>${title}</h3><p>${excerpt}</p><a href="${url}" target="_blank" rel="noopener">閱讀完整貼文 →</a></article>`;
      }).join("");
    })
    .catch(() => { mount.innerHTML = '<p class="fb-empty">暫時無法載入最新貼文，請稍後再試。</p>'; });

  function escapeHtml(value) {
    const div = document.createElement("div");
    div.textContent = String(value);
    return div.innerHTML;
  }
  function safeUrl(value) {
    try {
      const url = new URL(value, location.href);
      return ["http:", "https:"].includes(url.protocol) ? url.href : "https://www.facebook.com/062582589a/";
    } catch (_) {
      return "https://www.facebook.com/062582589a/";
    }
  }
})();
