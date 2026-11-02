import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve, dirname, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const files = [
  "index.html", "about.html", "services.html", "contact.html", "documents.html",
  "news.html", "tools.html", "404.html", "app.js", "facebook-feed.js",
  "styles.css", "robots.txt", "sitemap.xml", ".nojekyll",
  "loan-forecast.html", "property-tax.html", "holding-tax.html",
  "repurchase-refund.html", "data/news.json", "data/legacy-pages.json",
  "data/migration-manifest.json", "assets/homego-og-v2.png",
  "assets/legacy/about_pic01-d8ae5ea3.png"
];
const read = (path) => readFileSync(resolve(root, path), "utf8");
const mustHave = (path, phrase) => {
  assert.ok(read(path).includes(phrase), `Missing expected feature in ${path}: ${phrase}`);
};
const problems = [];
let linksChecked = 0;
for (const file of files) assert.ok(existsSync(resolve(root, file)), `Missing legacy resource: ${file}`);
for (const file of ["index.html", "about.html", "services.html", "contact.html", "documents.html", "news.html", "tools.html"]) {
  const html = read(file);
  const links = html.matchAll(/\b(?:href|src)\s*=\s*["']([^"']+)["']/g);
  for (const [, raw] of links) {
    if (/^(?:https?:|mailto:|tel:|data:|javascript:|\/\/|\$\{)/i.test(raw) || raw.startsWith("#")) continue;
    const [pathAndQuery, fragment] = raw.split("#", 2);
    const pathname = pathAndQuery.split("?")[0];
    if (!pathname) continue;
    const target = resolve(root, pathname.replace(/^\//, ""));
    if (!target.startsWith(root + sep) && target !== root) { problems.push(`${file}: path outside root: ${raw}`); continue; }
    if (!existsSync(target)) { problems.push(`${file}: missing ${raw}`); continue; }
    linksChecked++;
    if (fragment && extname(target) === ".html") {
      const content = readFileSync(target, "utf8");
      const id = decodeURIComponent(fragment);
      if (!content.includes(`id="${id}"`) && !content.includes(`name="${id}"`))
        problems.push(`${file}: missing #${id} target in ${pathname}`);
    }
  }
}
mustHave("app.js", 'href="tools.html"');
mustHave("app.js", "aria-expanded");
mustHave("app.js", "closeMobileMenu");
mustHave("app.js", "about.html#practice-disclosure");
mustHave("index.html", "data-facebook-feed");
mustHave("index.html", 'href="https://yangceo-taiwan.github.io/loan-forecast/"');
mustHave("index.html", 'href="https://homegoestate.github.io/test-Property-tax/"');
mustHave("index.html", 'href="tainan-map/"');
mustHave("app.js", 'const TAINAN_MAP_URL = "tainan-map/"');
mustHave("app.js", 'href="${TAINAN_MAP_URL}"');
mustHave("sitemap.xml", 'https://homegoestate.github.io/tainan-map/');
for (const file of ['index.html','app.js','styles.css','data-loader.js','data-manifest.json','district-boundaries.js','life-data.js','feedback.js','analytics-client.js'])
  assert.ok(existsSync(resolve(root, 'tainan-map', file)), `Missing map resource: ${file}`);
mustHave('tainan-map/analytics-client.js', 'publicStatsEnabled:false');
mustHave('tainan-map/feedback.js', 'const local=false');
const manifest = JSON.parse(read('tainan-map/data-manifest.json'));
assert.equal(manifest.catalogCount, 3813);
assert.equal(manifest.transactionCount, 41957);
for (const entry of [manifest.summary, ...Object.values(manifest.districts)]) {
  assert.ok(existsSync(resolve(root, 'tainan-map', entry.gzip)));
  assert.ok(existsSync(resolve(root, 'tainan-map', entry.json)));
}
mustHave("index.html", 'href="services.html#builder"');
mustHave("index.html", 'href="services.html#land"');
mustHave("index.html", 'href="services.html#inheritance"');
mustHave("about.html", 'id="practice-disclosure"');
mustHave("about.html", "各自獨立執業");
mustHave("contact.html", "正式受任地政士");
mustHave("news.html", "data/news.json");
mustHave("documents.html", "doc-search");
mustHave("facebook-feed.js", "supabase.co");
mustHave("styles.css", "@media (max-width: 700px)");
mustHave("styles.css", ".home-tool-grid");
assert.deepEqual(problems, [], problems.join("\n"));
console.log(`PASS: ${files.length} baseline resources present; ${linksChecked} internal asset/page/anchor references checked; critical entry points retained.`);
