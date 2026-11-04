(function () {
  const mount = document.querySelector("[data-facebook-feed]");
  if (!mount) return;

  // Read Make's daily posts from Supabase; if the table is empty or the project is unreachable,
  // fall back to the site's own news archive so the section never shows an error.
  const SUPABASE_ENABLED = true;
  const endpoint = "https://jteigfphgrspvrmkjaiz.supabase.co/rest/v1/facebook_posts" +
    "?select=title,message,post_url,image_url,published_at" +
    "&order=published_at.desc&limit=3";
  const publishableKey = "sb_publishable_MJUjfh4YJopPqSAib0mLrg_nFRkBlDJ";
  const facebookUrl = "https://www.facebook.com/062582589a/";
  const newsUrl = "news.html";

  const load = SUPABASE_ENABLED ? loadSupabase().catch(loadNews) : loadNews();
  load.then(render).catch(function () {
    mount.innerHTML = '<p class="fb-empty">暫時無法讀取最新內容，請稍後重試或直接前往 Facebook。</p>';
  });

  function loadSupabase() {
    return fetch(endpoint, { cache: "no-store", headers: { apikey: publishableKey } })
      .then(function (response) {
        if (!response.ok) throw new Error("feed unavailable");
        return response.json();
      })
      .then(function (posts) {
        if (!Array.isArray(posts) || !posts.length) throw new Error("feed empty");
        return posts.map(function (post) {
          const message = String(post.message || "").trim();
          return { title: post.title || firstLine(message), text: message, url: post.post_url || facebookUrl, date: formatDate(post.published_at) };
        });
      });
  }

  function loadNews() {
    return fetch("data/news.json", { cache: "no-cache" })
      .then(function (response) {
        if (!response.ok) throw new Error("news unavailable");
        return response.json();
      })
      .then(function (items) {
        if (!Array.isArray(items)) throw new Error("news invalid");
        return items
          .filter(function (item) { return item && item.title; })
          .sort(function (a, b) { return String(b.date || "").localeCompare(String(a.date || "")); })
          .slice(0, 3)
          .map(function (item) {
            return { title: item.title, text: cleanBody(item.body, item.title), url: newsUrl, date: item.date || "最新發布", internal: true };
          });
      });
  }

  function render(posts) {
    if (!posts.length) {
      mount.innerHTML = '<p class="fb-empty">最新內容整理中；您也可以先前往 Facebook 查看。</p>';
      return;
    }
    mount.innerHTML = posts.map(function (post) {
      const title = escapeHtml(post.title || "最新不動產觀點");
      const excerpt = escapeHtml(truncate(post.text, 120));
      const url = safeUrl(post.url);
      const target = post.internal ? "" : ' target="_blank" rel="noopener"';
      return '<article class="fb-post-card">' +
        '<small>' + escapeHtml(post.date) + '</small>' +
        '<h3>' + title + '</h3>' +
        '<p>' + excerpt + '</p>' +
        '<a href="' + url + '"' + target + '>閱讀完整內容 →</a>' +
        '</article>';
    }).join("");
  }

  // Archive bodies start with "YYYY.MM.DD分類" and repeat the title; keep only the article text.
  function cleanBody(body, title) {
    let text = String(body || "").replace(/^\d{4}\.\d{2}\.\d{2}/, "");
    const t = String(title || "").trim();
    if (t) {
      const first = text.indexOf(t);
      if (first >= 0 && first < 40) text = text.slice(first);
      text = text.split(t).join(" ");
    }
    return text.replace(/回列表頁\s*$/, "").replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
  }

  function truncate(value, max) {
    const s = String(value || "");
    return s.length > max ? s.slice(0, max).trim() + "…" : s;
  }

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
