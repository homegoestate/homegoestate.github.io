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
for (const file of ['atlas-guide.js','atlas-guide.css','population.js','floor-gaps.js','floor-gaps.css','district-stories.js','district-stories.css']) {
  mustHave('tainan-map/index.html',file+'?');
  assert.ok(existsSync(resolve(root,'tainan-map',file)));
}
for (const module of ['atlas-guide','population','floor-gaps','district-stories','district-boundaries']) {
  runInNewContext(read('tainan-map/'+module+'.js'),floorContext);
}
const {AtlasPopulation, AtlasStories, DISTRICT_GEOJSON} = floorContext.window;
const districtNames = Array.from(DISTRICT_GEOJSON.features,f=>f.properties.name).sort();
assert.equal(districtNames.length,37);
assert.deepEqual(Object.keys(AtlasPopulation.districts).sort(),districtNames);
const ranked = Object.values(AtlasPopulation.districts).sort((a,b)=>b.population-a.population);
assert(ranked.every((row,i)=>Number.isSafeInteger(row.population) && row.population>0 && row.rank===i+1));
assert.equal(ranked.reduce((sum,row)=>sum+row.population,0),AtlasPopulation.total);
assert.match(AtlasPopulation.period,/^\d{4}-(0[1-9]|1[0-2])$/);
assert.deepEqual(Array.from(AtlasStories.districts).sort(),districtNames);
assert(districtNames.every(name=>AtlasStories.stories.some(story=>story.districts.includes(name))));
for (const story of AtlasStories.stories) {
  assert(story.title && story.body.length && story.refs.length && story.map);
  assert([...story.refs,story.map].every(key=>AtlasStories.sources[key]));
}
for (const module of ['scene-city','scene-building','studio-sales']) {
  for (const extension of ['js','css']) {
    mustHave('tainan-map/index.html', module + '.' + extension + '?');
    assert.ok(existsSync(resolve(root,'tainan-map',module+'.'+extension)));
  }
  runInNewContext(read('tainan-map/'+module+'.js'), floorContext);
}
for (const api of ['CityScene','BuildingScene','StudioSales']) assert.equal(typeof floorContext.window[api].mount,'function');
for (const asset of ['ground-subsidence.js','city-geo-layers.js','community-ground.js','community-ground.css','detail-sheet.js']) {
  mustHave('tainan-map/index.html',asset+'?');
  assert.ok(existsSync(resolve(root,'tainan-map',asset)));
}
for (const module of ['ground-subsidence','city-geo-layers','community-ground'])
  runInNewContext(read('tainan-map/'+module+'.js'), floorContext);
mustHave('tainan-map/index.html','presale-units.js?');
runInNewContext(read('tainan-map/presale-units.js'),floorContext);
assert.equal(floorContext.window.PresaleUnits.lookup('community-registry-1279').count,30);
const sub=floorContext.window.MapSubsidence;
assert.equal(sub.lookup(null,null).status,'no_coordinates');
for (const kind of ['cumulative','rate','station']) {
  const feature=sub.features.find(f=>f.properties.kind===kind);
  assert.ok(feature?.properties.period && feature?.properties.sourceUrl,'Missing observation source for '+kind);
  const point=feature.geometry.type==='Point'?feature.geometry.coordinates:feature.geometry.coordinates[0];
  assert.equal(sub.lookup(point[1],point[0]).byKind[kind].distanceKm,0);
}
mustHave('tainan-map/index.html','id="studioSample"');
mustHave('tainan-map/index.html','id="showPlanMap"');
runInNewContext(read('tainan-map/floor-sales.js'), floorContext);
const floors = floorContext.window.FloorSales;
runInNewContext(read('tainan-map/address-floors.js'), floorContext);
const rawFloors = floorContext.window.AddressFloors;
const rawDoorRow = (address,level='五層',completed='1994-12-16') => {
  const row = Array(17).fill(null);
  row[1]=address; row[2]=1; row[3]=level; row[16]=['十三層',completed,0]; return row;
};
const rawDoor = address => rawFloors.identify(rawDoorRow(address), '安平區');
assert.equal(rawDoor('臺南市安平區慶平路３８８號五樓之３').key,rawDoor('慶平路388號五樓之2').key);
assert.notEqual(rawDoor('慶平路388號之2五樓').key,rawDoor('慶平路388號五樓之2').key);
for(const addr of ['東區慶平路388號','慶平路388至390號','慶平路388號、390號','慶平路388號六樓','慶平路388-390號','慶平路388號A棟'])
  assert.equal(rawDoor(addr),null,addr);
assert.notEqual(rawDoor('慶平路388號').key,rawFloors.identify(rawDoorRow('慶平路388號','五層','1999-12-16'),'安平區').key);
assert.deepEqual(Array.from(floors.groupRows(['十層','十一層','二十層','地下十層'].map(floor=>({floor}))).records, r=>r.floor.number),[10,11,20,-10]);
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
const officialSaleIds=new Set();
for (const [district, entry] of Object.entries(manifest.districts)) {
  const data = verifiedJson(entry);
  const expected = catalog.communities.filter(c => c.district === district).map(c => c.id);
  assert.deepEqual(Object.keys(data).sort(), expected.sort(), district);
  for (const [id, rows] of Object.entries(data)) {
    transactionCount += rows.length;
    for(const row of rows){
      assert.ok(row.transactionId && !officialSaleIds.has(row.transactionId),'Duplicate or missing transaction ID: '+id);
      officialSaleIds.add(row.transactionId);
      if(row.eligible && row.singleBuilding && row.completionPrecision==='day' && row.buildingCompletionDate && row.date) {
        assert.ok(row.date>=row.buildingCompletionDate,id+' includes a sale before completion in a comparable price');
      }
    }
    const view = floors.groupRows(rows, registry.get(id), {asOf:manifest.asOf, period:catalog.meta.periods.all});
    const displayed = view.addresses.flatMap(address => address.floors.flatMap(floor => floor.records));
    assert.equal(displayed.length, rows.length, id + ' floor explorer count');
    const displayedRows = new Set(displayed.map(record => record.row));
    assert.ok(rows.every(row => displayedRows.has(row)), id + ' missing original floor explorer row');
  }
}
assert.equal(Object.keys(manifest.districts).length, new Set(catalog.communities.map(c => c.district)).size);
assert.equal(transactionCount, manifest.transactionCount);
for (const resource of ['market-ledger.js','market-ledger.css','address-floors.js','market-pulse.js','market-pulse.css']) {
  mustHave('tainan-map/index.html',resource+'?');
  assert.ok(existsSync(resolve(root,'tainan-map',resource)));
}
for (const [folder,market] of [['market-ledger','sale'],['presale-ledger','presale']]) {
  const directory = 'tainan-map/'+folder+'/';
  const register = JSON.parse(read(directory+'manifest.json'));
  assert.equal(register.schema,1);
  assert.equal(register.market,market);
  assert.match(register.latestBatch,/^\d{4}-\d{2}-\d{2}$/);
  let count=0, cancelled=0, linked=0;
  const seen=new Set();
  for (const [district,entry] of Object.entries(register.districts)) {
    let districtCount=0;
    for (const part of entry.parts) {
      const bytes=readFileSync(resolve(root,directory,part.file));
      assert.equal(bytes.length,part.bytes);
      assert.equal(createHash('sha256').update(bytes).digest('hex'),part.sha256);
      const items=JSON.parse(bytes);
      assert.equal(items.length,part.count);
      if(part.gzip) assert.ok(gunzipSync(readFileSync(resolve(root,directory,part.gzip))).equals(bytes));
      for (const row of items) {
        const source=register.sources[row[8]];
        assert.ok(source?.url && row[9]>=3 && row[9]<=source.rows+2, district+' source record');
        const key=row[8]+':'+row[9];
        assert.ok(!seen.has(key),'Source row repeated '+key);
        seen.add(key);
        assert.equal(typeof register.labels.types[row[2]],'string');
        const flag=register.labels.flags[row[7]];
        assert.equal(typeof flag,'string');
        if (market==='presale') {
          if (row[10]) assert.ok(register.projectDistricts[row[10].trim()]?.includes(district));
          if (flag.includes('解約')) cancelled++;
        } else {
          assert.ok(row[12]===0 || row[12]===1);
          assert.equal(row.length,17);
          if (row[16]) {
            assert.equal(row[16].length,3);
            assert.match(row[16][1],/^\d{4}-\d{2}-\d{2}$/);
            assert.ok(register.labels.floorPrice[row[16][2]]);
          }
          linked+=row[12];
        }
      }
      districtCount+=items.length;
    }
    assert.equal(districtCount,entry.count);
    count+=districtCount;
  }
  assert.equal(count,register.count);
  if(market==='presale') assert.equal(cancelled,register.cancellations);
  if(market==='sale'){
    assert.equal(register.communityVersion,manifest.version);
    assert.equal(linked,register.communityRows);
    assert.equal(count-linked,register.unlinkedRows);
    assert.equal(Object.values(register.unlinkedByType).reduce((a,b)=>a+b,0),register.unlinkedRows);
    assert.equal(Object.values(register.districts).reduce((n,d)=>n+d.communityRows,0),linked);
    assert.deepEqual(register.doorReview,manifest.doorReview);
    assert.equal(Object.values(register.doorReview.residualReasons).reduce((a,b)=>a+b,0),register.unlinkedRows);
  }
}
const marketPulse = JSON.parse(read('tainan-map/market-pulse/summary.json'));
assert.equal(Object.keys(marketPulse.areas).length,38);
const allCity = marketPulse.areas['全市'];
for(const phase of ['sale','presale']){
  const file='tainan-map/'+(phase==='sale'?'market-ledger':'presale-ledger')+'/manifest.json';
  assert.equal(marketPulse.ledgerHashes[phase],createHash('sha256').update(readFileSync(resolve(root,file))).digest('hex'));
}
for(const i of [0,1]) {
  const districtSum=Object.entries(marketPulse.areas).filter(([name])=>name!=='全市').reduce((sum,[,area])=>sum+area.transfers[i],0);
  assert.equal(districtSum,allCity.transfers[i]);
}
for (const [id,units] of [['community-3424',191],['community-3287',27]]) {
  const c=registry.get(id);
  assert.equal(c.projectUnits.count,units);
  assert.equal(c.householdCount,units);
  assert.equal(c.buildingCount,1);
  assert.ok(c.allUseHistoricalCount >= c.stats.count && c.stats.count >= c.stats.distinctTransactedUnitCount);
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
