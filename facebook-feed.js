(function () {
  const mount = document.querySelector("[data-facebook-feed]");
  if (!mount) return;

  const endpoint = "https://jteigfphgrspvrmkjaiz.supabase.co/rest/v1/facebook_posts" +
    "?select=title,message,post_url,image_url,published_at" +
    "&order=published_at.desc&limit=3";
  const publishableKey = "sb_publishable_MJUjfh4YJopPqSAib0mLrg_nFRkBlDJ";
  const facebookUrl = "https://www.facebook.com/062582589a/";

  fetch(endpoint, {
    cache: "no-store",
    headers: { apikey: publishableKey }
  })
    .then(function (response) {
      if (!response.ok) throw new Error("feed unavailable");
      return response.json();
    })
    .then(function (posts) {
      if (!Array.isArray(posts) || !posts.length) {
        mount.innerHTML = '<p class="fb-empty">最新內容將於下一次每日發文後自動出現；您也可以先前往 Facebook 查看。</p>';
        return;
      }

      mount.innerHTML = posts.map(function (post) {
        const message = String(post.message || "").trim();
        const title = escapeHtml(post.title || firstLine(message) || "最新不動產觀點");
        const excerpt = escapeHtml(message);
        const url = safeUrl(post.post_url || facebookUrl);
        const date = escapeHtml(formatDate(post.published_at));
        return '<article class="fb-post-card">' +
          '<small>' + date + '</small>' +
          '<h3>' + title + '</h3>' +
          '<p>' + excerpt + '</p>' +
          '<a href="' + url + '" target="_blank" rel="noopener">閱讀完整內容 →</a>' +
          '</article>';
      }).join("");
    })
    .catch(function () {
      mount.innerHTML = '<p class="fb-empty">暫時無法讀取最新內容，請稍後重試或直接前往 Facebook。</p>';
    });

  function firstLine(value) {
    return value.split(/\r?\n/).find(function (line) { return line.trim(); }) || "";
  }

  function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "最新發布";
    return new Intl.DateTimeFormat("zh-TW", {
      timeZone: "Asia/Taipei",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(date);
  }

  function escapeHtml(value) {
    const div = document.createElement("div");
    div.textContent = String(value);
    return div.innerHTML;
  }

  function safeUrl(value) {
    try {
      const url = new URL(value, location.href);
      return ["http:", "https:"].includes(url.protocol) ? url.href : facebookUrl;
    } catch (_) {
      return facebookUrl;
    }
  }
})();
