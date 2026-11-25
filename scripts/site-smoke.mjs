import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve, dirname, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { runInNewContext } from "node:vm";

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
for (const file of ['index.html','app.js','styles.css','data-loader.js','data-manifest.json','district-boundaries.js','life-data.js','feedback.js','analytics-client.js','floor-sales.js','floor-sales.css'])
  assert.ok(existsSync(resolve(root, 'tainan-map', file)), `Missing map resource: ${file}`);
mustHave('tainan-map/index.html', 'src="floor-sales.js');
mustHave('tainan-map/index.html', 'href="floor-sales.css');
const floorContext = {window:{}};
runInNewContext(read('tainan-map/floor-sales.js'), floorContext);
const floors = floorContext.window.FloorSales;
for (const asset of ['environment.js','environment.css','environment-sun.js','environment-fault.js','environment-records.js']) {
  mustHave('tainan-map/index.html', asset + '?');
  assert.ok(existsSync(resolve(root,'tainan-map',asset)));
}
for (const asset of ['environment-sun.js','environment-fault.js','environment-records.js']) {
  runInNewContext(read('tainan-map/' + asset), floorContext);
}
const {MapSun, MapFaults, MapRecords} = floorContext.window;
assert.equal(MapSun.day(22.9933,120.205,'2026-11-25').sunrise, '06:19');
assert.equal(MapSun.day(22.9933,120.205,'2026-11-25').sunset, '17:13');
assert.equal(MapSun.exposure(23,120.2,'2026-11-25','',''), null);
assert.equal(MapSun.day(null,null,'2026-11-25'), null);
assert.equal(MapSun.day(23,120.2,'2026-02-29'), null);
const westWindow = angle => MapSun.exposure(23,120.2,'2026-11-25',270,angle).directMinutes;
assert.ok(westWindow(0) > westWindow(20) && westWindow(20) > westWindow(90));
assert.equal(westWindow(90),0);
assert.equal(MapFaults.lookup({}).status,'no_coordinates');
assert.equal(MapFaults.lookup({lat:23,lon:120.2,positionEstimated:'nearby'}).status,'approximate');
assert.equal(typeof MapRecords.render,'function');
const soil = JSON.parse(read('tainan-map/environment-soil.json'));
const soilClasses = new Set(['high','medium','low','edge','unpublished','outside','disputed']);
assert.match(soil.serviceSha256,/^[a-f0-9]{64}$/);
assert.ok(Object.keys(soil.locations).length > 0 && Object.values(soil.locations).every(x => soilClasses.has(x)));
assert.equal(soil.boundaryMetres,25);
assert.equal(typeof floors.mount, 'function');
const firstAddress = '善化區測試路17號';
const adjacentAddress = '善化區測試路17之1號';
const community = {district:'善化區', exactAddresses:[firstAddress, adjacentAddress]};
const sample = {date:'2026-01-21', singleBuilding:true, eligible:true, unitWan:22.65, floor:'五層', address:firstAddress+'五樓之6'};
const expectedRows = [
  sample,
  {...sample, floor:'５層'},
  {...sample, address:adjacentAddress+'五樓'},
  {...sample, floor:'三層，四層', eligible:false, unitWan:null, exclusionReason:'多層交易'},
  {...sample, floor:'全', eligible:false, unitWan:null},
  {...sample, address:'善化區新測試路17號五樓'},
  {...sample, address:firstAddress+'五樓、'+adjacentAddress+'五樓'},
  {...sample, address:firstAddress+'五樓、'+adjacentAddress+'六樓'}
];
const floorModel = floors.groupRows(expectedRows, community, {asOf:'2026-01-22'});
assert.equal(floorModel.records.length, expectedRows.length);
assert.equal(floorModel.records[0].floor.key, floorModel.records[1].floor.key, 'Numeric and Chinese forms of one floor must agree');
assert.ok(floorModel.records[0].address.exact && floorModel.records[2].address.exact);
assert.notEqual(floorModel.records[0].address.key, floorModel.records[2].address.key, 'Distinct doorplates must stay separate');
assert.ok(floorModel.records[3].floorLocated === false && floorModel.records[4].floorLocated === false);
assert.equal(floorModel.records[3].comparable, false);
assert.equal(floorModel.records[5].address.exact, false, 'A similarly named road cannot establish a doorplate match');
assert.equal(floorModel.records[6].address.exact, false);
assert.notEqual(floorModel.records[6].address.key, floorModel.records[7].address.key, 'Mixed-door transactions must retain individual unresolved groups');
assert.equal(floorModel.records[0].row.unitWan, 22.65);
mustHave('tainan-map/analytics-client.js', 'publicStatsEnabled:false');
mustHave('tainan-map/feedback.js', 'https://homegoestate.github.io/anxin-city/?view=city');
const manifest = JSON.parse(read('tainan-map/data-manifest.json'));
assert.equal(manifest.catalogCount, 3813);
function verifiedJson(entry) {
  const data = readFileSync(resolve(root, 'tainan-map', entry.json));
  const gzip = readFileSync(resolve(root, 'tainan-map', entry.gzip));
  assert.equal(createHash('sha256').update(data).digest('hex'), entry.sha256, entry.json);
  assert.equal(createHash('sha256').update(gzip).digest('hex'), entry.gzipSha256, entry.gzip);
  assert.ok(gunzipSync(gzip).equals(data), entry.gzip);
  return JSON.parse(data);
}
const catalog = verifiedJson(manifest.summary);
runInNewContext(read('tainan-map/estimated-positions.js'), floorContext);
for (const community of catalog.communities) {
  const estimate = floorContext.window.ESTIMATED_POSITIONS[community.id];
  const point = community.lon && community.lat ? community : (estimate?.tier === 'exact' ? estimate : null);
  if (point) {
    const coordinate = Number(point.lon).toFixed(7) + ',' + Number(point.lat).toFixed(7);
    assert.ok(Object.hasOwn(soil.locations,coordinate),'Refresh soil overlay for ' + community.id);
  }
}
assert.equal(catalog.meta.asOf, manifest.asOf);
assert.equal(catalog.communities.length, manifest.catalogCount);
const registry = new Map(catalog.communities.map(community => [community.id, community]));
let transactionCount = 0;
for (const [district, entry] of Object.entries(manifest.districts)) {
  const data = verifiedJson(entry);
  const expected = catalog.communities.filter(c => c.district === district).map(c => c.id);
  assert.deepEqual(Object.keys(data).sort(), expected.sort(), district);
  for (const [id, rows] of Object.entries(data)) {
    transactionCount += rows.length;
    const view = floors.groupRows(rows, registry.get(id), {asOf:manifest.asOf, period:catalog.meta.periods.all});
    const displayed = view.addresses.flatMap(address => address.floors.flatMap(floor => floor.records));
    assert.equal(displayed.length, rows.length, id + ' floor explorer count');
    const displayedRows = new Set(displayed.map(record => record.row));
    assert.ok(rows.every(row => displayedRows.has(row)), id + ' missing original floor explorer row');
  }
}
assert.equal(Object.keys(manifest.districts).length, new Set(catalog.communities.map(c => c.district)).size);
assert.equal(transactionCount, manifest.transactionCount);
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
