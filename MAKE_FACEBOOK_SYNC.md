# Make 同步 Facebook 貼文到官網

官網會讀取 `data/facebook-posts.json`。在 Make 原本的 Facebook 發文流程完成後，加一個 GitHub「Create or update a file」步驟，更新此檔案即可，不要把 GitHub Token 寫進公開網站。

JSON 格式：

```json
{
  "updatedAt": "2026-08-11T09:00:00+08:00",
  "posts": [
    {
      "title": "貼文標題",
      "excerpt": "建議 60 至 100 字摘要",
      "url": "Facebook 貼文網址",
      "publishedAt": "2026-08-11"
    }
  ]
}
```

最多保留最近 10 筆，官網首頁顯示前 3 筆。GitHub Repository 為 `homegoestate/homegoestate.github.io`，Branch 為 `main`，File path 為 `data/facebook-posts.json`。
