"""Rebuild the map from a reviewed V5 batch, retaining its price and revision rules.

Run with --batch (reviewed builder + raw, registry, acquisition), --land (saved
official quarter land CSVs), --scratch (new work directory), and --map (public
asset directory). Quarter land CSVs are named 107S1.csv etc. Their public URL
is recorded with a SHA-256 for every source. --archives holds the original
moi-history-YYYYMMDD.zip files for the reviewed sale batches (default: the
parent of --batch). Each archive must contain the reviewed primary CSV and
the matching land member. --package-only reuses the local
catalog build. The public manifest is written after the verified new assets.
"""
import argparse
from collections import Counter, defaultdict
import csv
import gzip
import hashlib
import json
from pathlib import Path
import re
import shutil
import unicodedata
from zipfile import ZipFile
import map_parcel_review


def load(path):
    return json.loads(path.read_bytes())


def digest(content):
    return hashlib.sha256(content).hexdigest()


def save(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')


# The current/opening project count requires an independent first-party source.
# The permit date, floor, parcel and project address were checked independently.
CASES = {
    'community-3424': {
        'permit': '(107)南工使字第02921號', 'section': '新南段', 'parcel': '00780006',
        'rocDate': '1070921', 'floors': 29, 'total': 191,
        'note': '龍騰建設完工建案資料列有 189 戶住家與 2 戶店面。',
        'url': 'https://www.long-terng.com.tw/projects/鑫市政-菁英特區/'},
    'community-3287': {
        'permit': '(108)南工使字第03910號', 'section': '金城段', 'parcel': '00660004',
        'rocDate': '1081125', 'floors': 19, 'total': 27,
        'note': '尚暘建築的建案作品資料列有地上 19 層、全案 27 戶。',
        'url': 'https://sunleader.tw/products/尚暘綠意'},
}
STREET = re.compile(r'^(?:[^縣市區鄉鎮路街段巷弄號\d]{1,8}[里村](?:\d+鄰)?)?(?:\d+鄰)?[\u4e00-\u9fff\d]{1,20}(?:路|街|大道)')
OTHER_LOCALITY = re.compile(r'^(?:臺灣省|台灣省|.{1,4}[縣市].{0,4}[區鄉鎮市]|.{1,4}[區鄉鎮])')
LAND_URL = 'https://plvr.land.moi.gov.tw/DownloadSeason?season={}&fileName=d_lvr_land_a_land.csv'


def relative_address(address, district, districts):
    """Use a separate official district only for a relative street address."""
    text = unicodedata.normalize('NFKC', str(address or '')).strip()
    if district not in districts or text.startswith(tuple(districts)) or OTHER_LOCALITY.match(text):
        return address
    if text.startswith(('臺南市', '台南市', '臺南縣', '台南縣')) or not STREET.match(text):
        return address
    return district + text


def archived_land_sources(folder, builder, batch, scratch):
    manifest = builder['source_manifest']()
    paths, refs = [], {}
    archive_dir = scratch / 'archive-land'
    archive_dir.mkdir(exist_ok=True)
    for name, evidence in sorted(manifest.items()):
        match = re.fullmatch(r'moi-history-(\d{8})\.csv', name)
        if not match:
            continue
        token = name[:-4]
        original = primary_file(name, batch, builder)
        archive = folder / (token + '.zip')
        with ZipFile(archive) as z:
            main = z.read('d_lvr_land_a.csv')
            land = z.read('d_lvr_land_a_land.csv')
        main_sha = digest(main)
        if main_sha != evidence['sha256'] or original.read_bytes() != main:
            raise ValueError('Archived primary does not match the reviewed sale batch: ' + name)
        url = 'https://plvr.land.moi.gov.tw/DownloadHistory?type=history&fileName=' + match[1]
        if evidence['sourceUrl'] != url:
            raise ValueError('Unexpected archive URL: ' + name)
        path = archive_dir / (token + '-land.csv')
        path.write_bytes(land)
        paths.append((token, name, path, url))
        refs[token] = {'archiveSha256': digest(archive.read_bytes()), 'primarySha256': main_sha,
                       'member': 'd_lvr_land_a_land.csv', 'primaryMember': 'd_lvr_land_a.csv'}
    return paths, refs


def primary_file(name, batch, builder):
    paths = [p / name for p in (batch / 'raw', builder['INPUT_SALES_ROOT']) if (p / name).is_file()]
    if not paths or any(p.read_bytes() != paths[0].read_bytes() for p in paths[1:]):
        raise ValueError('Missing or conflicting primary file: ' + name)
    return paths[0]


def read_land(land_dir, batch_date, batch, builder, archives, scratch):
    cases_by_parcel = {(x['section'], x['parcel']): cid for cid, x in CASES.items()}
    files, references = {}, {}
    end_year = int(batch_date[:4]) - 1911
    inputs = []
    for year in range(107, end_year + 1):
        for season in range(1, 5):
            key = f'{year}S{season}'
            path = land_dir / (key + '.csv')
            if not path.exists():
                if key <= '115S3':
                    raise FileNotFoundError(path)
                continue
            inputs.append((key, 'moi-season-' + key + '.csv', path, LAND_URL.format(key)))
    for path in sorted(land_dir.glob('moi-current-*-land.csv')):
        key = path.stem.removesuffix('-land')
        primary = batch/'raw'/(key+'.csv')
        if (land_dir/'official-current-verify.csv').read_bytes() != primary.read_bytes():
            raise ValueError('Current primary and archived review batch differ: '+key)
        inputs.append((key, primary.name, path, 'https://plvr.land.moi.gov.tw/Download?fileName=d_lvr_land_a_land.csv'))
    archive_inputs, archive_refs = archived_land_sources(archives, builder, batch, scratch)
    inputs.extend(archive_inputs)
    for key, name, path, url in inputs:
        relevant, first, ambiguous = {}, {}, set()
        with path.open(encoding='utf-8-sig', newline='') as stream:
            r = csv.DictReader(stream)
            assert {'編號', '土地位置', '地號'} <= set(r.fieldnames)
            for line, item in enumerate(r, 2):
                tid = item['編號']
                fingerprint = tuple(item.values())
                if tid in first and first[tid] != fingerprint:
                    ambiguous.add(tid)
                first[tid] = fingerprint
                cid = cases_by_parcel.get((item['土地位置'], item['地號']))
                if cid and tid not in relevant:
                    relevant[tid] = (cid, line)
        files[name] = {tid: value for tid, value in relevant.items() if tid not in ambiguous}
        references[key] = {'url': url, 'sha256': digest(path.read_bytes()), **archive_refs.get(key, {})}
    sources = [(key, primary_file(name, batch, builder), path) for key, name, path, _ in inputs]
    return files, references, sources


def identical_current_rows(additional, files, sources, builder, batch):
    # The reviewed builder sees the saved current version before its same-day
    # archive. Attach archive evidence to that first occurrence only when the
    # entire normalized sale row is identical in both versions.
    for token, original, _ in sources:
        if not token.startswith('moi-history-'):
            continue
        ids = files[original.name].keys() | additional.get(original.name, {}).keys()
        if not ids:
            continue
        current_name = original.name.replace('moi-history-', 'moi-current-')
        if not any((p / current_name).exists() for p in (batch/'raw', builder['INPUT_SALES_ROOT'])):
            continue
        archived = defaultdict(list)
        for n, row in builder['csv_rows'](original):
            if row['編號'] in ids:
                archived[row['編號']].append((n, row))
        current = defaultdict(list)
        for _, row in builder['csv_rows'](primary_file(current_name, batch, builder)):
            if row['編號'] in ids:
                current[row['編號']].append(row)
        for tid, rows in current.items():
            if len(rows) == len(archived[tid]) == 1 and rows[0] == archived[tid][0][1]:
                row = rows[0]
                door = builder['sale_door'](row, row['鄉鎮市區'])
                cid, ref = builder['parcel_match'](original.name, row, door, None)
                if cid:
                    additional.setdefault(current_name, {})[tid] = (cid, {**ref, 'archiveMainRow': archived[tid][0][0]})


def pre_completion(t):
    if not (t.get('singleBuilding') and t.get('date') and t.get('completionStatus') == 'valid'):
        return False
    date = t.get('buildingCompletionDate') or ''
    precision = t.get('completionPrecision')
    if precision == 'day' and re.fullmatch(r'\d{4}-\d{2}-\d{2}', date):
        return t['date'] < date
    return bool(precision == 'month' and re.fullmatch(r'\d{4}-\d{2}', date) and t['date'][:7] < date)


def install_builder(batch, scratch, land_sources, additional):
    """Apply narrow hooks to the reviewed source version, and fail on drift."""
    for folder in ('raw', 'registry', 'acquisition'):
        dest = scratch / folder
        if not dest.exists():
            shutil.copytree(batch / folder, dest)
    source = (batch / 'build_catalog.py').read_text(encoding='utf-8')
    old_key = "            key = one_address(row.get('土地區段位置或建物區門牌'), district)"
    old_id = "            if not master_id and not is_supported_property(row):"
    old_tx = "            transactions_by_fingerprint[fingerprint] = tx"
    replacements = {
        old_key: "            key = sale_door(row, district)",
        old_id: """            parcel_id, parcel_ref = parcel_match(path.name, row, key, master_id)
            master_id = master_id or parcel_id
""" + old_id,
        old_tx: """            if parcel_ref:
                tx['parcelMatch'] = parcel_ref
""" + old_tx,
    }
    for before, after in replacements.items():
        if source.count(before) != 1:
            raise ValueError('Reviewed builder has changed at ' + before)
        source = source.replace(before, after)
    ctx = {'__file__': str(scratch / 'build_catalog.py'), '__name__': 'map_counts_builder'}
    exec(compile(source, str(batch / 'build_catalog.py'), 'exec'), ctx)
    original_unit = ctx['unit_identity']
    raw_transaction = ctx['transaction']
    def transaction(row, source, date):
        t = raw_transaction(row, source, date)
        if pre_completion(t) and t['eligible']:
            ctx['exclude'](t,'交易早於確定完工日期，交易階段待核')
        return t
    def qualified(row, district):
        address = row.get('土地區段位置或建物區門牌')
        return relative_address(address, district, ctx['DISTRICTS'])
    def sale_door(row, district):
        return ctx['one_address'](qualified(row, district), district)
    def unit_identity(row):
        return original_unit({**row, '土地區段位置或建物區門牌': qualified(row, row.get('鄉鎮市區', ''))})
    def parcel_match(source_name, row, door, owner):
        verified = additional.get(source_name, {}).get(row.get('編號'))
        if verified and door == verified[1]['door'] and owner in (verified[0], None):
            return verified
        match = land_sources.get(source_name, {}).get(row.get('編號'))
        if not match or not door or row.get('鄉鎮市區') != '安平區':
            return None, None
        cid, line = match
        case = CASES[cid]
        count = re.fullmatch(r'土地1建物1車位\d+', row.get('交易筆棟數', ''))
        floors = re.fullmatch(r'(.+?)[層樓]', row.get('總樓層數', ''))
        if not count or not floors or ctx['chinese_integer'](floors[1]) != case['floors']:
            return None, None
        if row.get('建築完成年月') != case['rocDate'] or (owner and owner != cid):
            return None, None
        return cid, {'season': source_name.removeprefix('moi-season-').removesuffix('.csv'), 'landRow': line, 'parcel': case['section'] + str(int(case['parcel'][:4])) + '-' + str(int(case['parcel'][4:])), 'door': door}
    ctx.update(sale_door=sale_door, parcel_match=parcel_match, unit_identity=unit_identity, transaction=transaction)
    return ctx


def pack(root, stem, data):
    raw = json.dumps(data, ensure_ascii=False, separators=(',', ':'), allow_nan=False).encode()
    path = 'data/' + stem + '-' + digest(raw)[:12] + '.json'
    compressed = gzip.compress(raw, compresslevel=9, mtime=0)
    for target, content in ((root/path, raw), (root/(path+'.gz'), compressed)):
        if target.exists():
            stored = target.read_bytes()
            if stored != content and (target.suffix != '.gz' or gzip.decompress(stored) != raw):
                raise ValueError('Existing asset differs: ' + str(target))
            if target.suffix == '.gz':
                compressed = stored
        else:
            target.write_bytes(content)
    return {'json': path, 'gzip': path+'.gz', 'sha256': digest(raw), 'gzipSha256': digest(compressed),
            'bytes': len(raw), 'gzipBytes': len(compressed)}


DOOR_URL = 'https://data.tainan.gov.tw/Resource/af44f904-2f4c-49b2-aaf8-1a64dce09bd4'
FLOOR = re.compile(r'^([一二三四五六七八九十零〇兩\d]+)(?:樓|層|[Ff])(.*)$')


def floor_address(builder, address):
    district = '安平區'
    district_address = relative_address(address, district, builder['DISTRICTS'])
    full = builder['address_base'](district_address, district)
    door = builder['one_address'](district_address, district)
    if full and door:
        floor = FLOOR.fullmatch(full[len(door):])
        if floor and floor[2] is not None:
            n = builder['chinese_integer'](floor[1])
            return (door, n, floor[2]) if n and n > 0 else None
    return None


def read_doorplates(path, builder, observed_doors):
    # The 114 file is a point directory with full household mailing addresses.
    # Use only its address column. Neither proximity nor coordinates identify a unit.
    exact, siblings = defaultdict(list), set()
    with path.open(encoding='utf-8-sig', newline='') as stream:
        for line, r in enumerate(csv.DictReader(stream), 2):
            if r['地址-行政區域代碼'] != '6703600':
                continue
            full = '安平區' + ''.join(r[k] for k in ('街路段', '地區', '巷', '弄', '號'))
            parts = floor_address(builder, full)
            if parts and parts[0] in observed_doors:
                door, floor, suffix = parts
                if suffix:
                    siblings.add((door, floor))
                else:
                    exact[(door, floor)].append(line)
    return {k: v[0] for k, v in exact.items() if k not in siblings and len(v) == 1}


def identify_units(community, rows, builder, single_plates):
    # Require the actual transaction's lot, permit completion date, total floors,
    # single building and single matching transfer floor. Reject subunit ambiguity
    # observed in either source and leave every original address untouched.
    observed_children = set()
    for t in rows:
        parts = floor_address(builder, t.get('address'))
        if parts and parts[2]:
            observed_children.add(parts[:2])
    for t in rows:
        if t.get('unitIdentity') or not t.get('parcelMatch') or not t['singleBuilding']:
            continue
        parts = floor_address(builder, t['address'])
        transfer = FLOOR.fullmatch(unicodedata.normalize('NFKC', t['floor'] or ''))
        if not parts or parts[2] or not transfer or transfer[2] or parts[:2] in observed_children:
            continue
        door, floor, _ = parts
        line = single_plates.get((door, floor))
        if line and builder['chinese_integer'](transfer[1]) == floor:
            t['unitIdentity'] = door + str(floor) + '樓'
            t['unitDoorplateRow114'] = line
    for category, periods in community['statsByCategory'].items():
        selected = builder['category_rows'](rows, category)
        for period, old in periods.items():
            new = builder['stats'](selected, period)
            new.pop('sourceRows', None)
            assert all(new[k] == old[k] for k in ('count', 'eligibleCount', 'mean', 'median', 'latestDate'))
            counts = new['unitIdentityCoverage']
            counts['doorplateRows'] = sum(bool(t.get('unitDoorplateRow114')) for t in selected
                if t['date'] and new['startDate'] <= t['date'] <= new['endDate'])
            counts['directRows'] = counts['identifiedRows'] - counts['doorplateRows']
            periods[period] = new
            if category == 'all':
                community['statsByPeriod'][period] = new
    s = community['statsByCategory']['all']['all']
    community['stats'] = s
    community['distinctTransactedUnitCount'] = s['distinctTransactedUnitCount']
    community['distinctTransactedUnitNote'] = '成交揭露樓室或與114年市府完整樓層門牌逐筆對照。同門牌再成交只計一次。'
    community['ageSummary'].update(medianYears=s['ageYearsMedian'], minYears=s['ageYearsMin'],
        maxYears=s['ageYearsMax'], sampleCount=s['ageSampleCount'])


def package(args, land_refs, baseline, builder, initial_manifest):
    raw = (args.scratch/'dist/data.js').read_bytes()
    data = json.loads(raw[raw.index(b'{'):raw.rindex(b'}') + 1])
    as_of = data['meta']['asOf']
    assert baseline['asOf'] == as_of
    data['meta']['parcelSaleSources'] = land_refs
    data['meta']['unitDoorplateSource'] = {'year': 114, 'url': DOOR_URL, 'sha256': digest(args.doors.read_bytes())}
    observed_doors = {t['parcelMatch']['door'] for c in data['communities'] if c['id'] in CASES
                      for t in c['transactions'] if t.get('parcelMatch')}
    single_plates = read_doorplates(args.doors, builder, observed_doors)
    previous_catalog = {c['id']: c for c in load(args.map/baseline['summary']['json'])['communities']}
    districts, audit = {}, {'before': baseline['transactionCount'], 'after': 0, 'changedCommunities': 0, 'cases': {}}
    owners, official_ids = {}, defaultdict(set)
    past_owners = {}
    for district, entry in baseline['districts'].items():
        districts[district] = load(args.map/entry['json'])
        for cid, rows in districts[district].items():
            for row in rows:
                past_owners[row['id']] = cid
    for c in data['communities']:
        cid, rows = c['id'], c.pop('transactions')
        original = districts[c['district']][cid]
        old_ids = {t['id'] for t in original}
        assert old_ids <= {t['id'] for t in rows}, ('lost existing record', cid)
        assert len(rows) == len({t['id'] for t in rows})
        for t in rows:
            assert past_owners.get(t['id'], cid) == cid
            assert t['id'] not in owners, ('assigned twice', t['id'])
            owners[t['id']] = cid
            if t['transactionId']:
                official_ids[t['transactionId']].add(cid)
        if len(original) != len(rows):
            audit['changedCommunities'] += 1
        districts[c['district']][cid] = rows
        audit['after'] += len(rows)
        ids = [t['transactionId'] for t in rows if t['date'] and '2012-08-01' <= t['date'] <= as_of]
        assert all(ids)
        c['allUseHistoricalCount'] = len(set(ids))
        if cid not in CASES:
            for t in rows:
                if (t.get('parcelMatch') or {}).get('door') in c['exactAddresses']:
                    t.pop('parcelMatch',None)
        land_rows = [t for t in rows if t.get('parcelMatch')]
        if land_rows:
            c['parcelMatchedAddresses'] = sorted({t['parcelMatch']['door'] for t in land_rows})
            c['matchNote'] = '除名冊門牌外，本案另逐筆核對實價登錄的行政區、交易編號、唯一基地地號、單一建物、完工日及總樓層。'
        if cid in CASES:
            case = CASES[cid]
            e = c['householdEvidence']
            assert c['buildingPermit'] == e['permitNumber'] == case['permit']
            assert c['householdCount'] == case['total'] and e['floor'] == case['floors']
            assert e['permitDate'].replace('/', '') == case['rocDate']
            expected_location = '安平區' + case['section'] + str(int(case['parcel'][:4])) + '-' + str(int(case['parcel'][4:]))
            assert e['permitLocation'].startswith(expected_location + '，共計1筆地號')
            c['projectUnits'] = {'count': case['total'], 'note': case['note'], 'url': case['url'], 'verified': '2026-11-25'}
            evidence = land_rows
            identify_units(c, rows, builder, single_plates)
            c['parcelMatchedAddresses'] = sorted({t['parcelMatch']['door'] for t in evidence})
            assert evidence, ('no parcel matches', cid)
            c['matchNote'] = '依名冊精確門牌配對。另以同季內政部買賣編號連到土地明細，限唯一地號、單建物、行政區、完工日與總樓層均符合本案的紀錄。'
            audit['cases'][cid] = {'oldAll': len(original), 'newAll': len(rows), 'parcelRows': len(evidence),
                                   'doors': c['parcelMatchedAddresses'], 'stats': c['statsByCategory']['all']['all']}
    assert previous_catalog.keys() == {c['id'] for c in data['communities']}
    assert audit['after'] == data['meta']['coverage']['matchedTransactionCount']
    conflicting = {k: sorted(v) for k, v in official_ids.items() if len(v) > 1}
    assert not conflicting, ('unresolved cross-community transaction IDs', conflicting)
    audit['uniqueOfficialTransactionIds'] = len(official_ids)
    audit['crossCommunityOfficialTransactionIds'] = len(conflicting)
    # Persist exactly the joined source whose digest is announced in the manifest.
    for c in data['communities']:
        c['transactions'] = districts[c['district']][c['id']]
    full = ('window.PILOT_DATA = ' + json.dumps(data, ensure_ascii=False, separators=(',', ':'), allow_nan=False) + ';\n').encode()
    (args.scratch/'verified-data.js').write_bytes(full)
    for c in data['communities']:
        c.pop('transactions')
    manifest = dict(baseline, version='V5-' + as_of.replace('-', '') + '-land-archives',
                    sourceDataSha256=digest(full), transactionCount=audit['after'],
                    summary=pack(args.map, 'catalog', data), districts={})
    for i, (d, values) in enumerate(sorted(districts.items()), 1):
        manifest['districts'][d] = pack(args.map, f'transactions-{i:02d}', values)
    assert load(args.map/'data-manifest.json') == initial_manifest
    save(args.scratch/'counts-audit.json', audit)
    save(args.map/'data-manifest.json', manifest)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for flag in ('batch', 'land', 'doors', 'permits', 'scratch', 'map'):
        parser.add_argument('--' + flag, type=Path, required=True)
    parser.add_argument('--archives', type=Path, help='Directory containing the official dated ZIPs')
    parser.add_argument('--package-only', action='store_true')
    parser.add_argument('--expected-manifest-sha', help='Reviewed hash when replacing a prior staged build')
    args = parser.parse_args()
    args.scratch.mkdir(exist_ok=True, parents=True)
    base_path = args.scratch/'prior-manifest.json'
    if not base_path.exists():
        shutil.copyfile(args.map/'data-manifest.json', base_path)
    base = load(base_path)
    live = args.map/'data-manifest.json'
    initial_manifest = load(live)
    if initial_manifest != base and digest(live.read_bytes()) != args.expected_manifest_sha:
        raise ValueError('Check the current manifest before replacing an earlier candidate')
    files = {}
    additional = {}
    builder = install_builder(args.batch.resolve(), args.scratch.resolve(), files, additional)
    archive_dir = args.archives or args.batch.parent
    reviewed_files, urls, sources = read_land(args.land, base['asOf'], args.batch, builder, archive_dir, args.scratch)
    files.update(reviewed_files)
    baseline_catalog = load(args.map/base['summary']['json'])
    for token, previous in baseline_catalog['meta'].get('parcelSaleSources', {}).items():
        if token not in urls or any(urls[token].get(k) != v for k, v in previous.items()):
            raise ValueError('Previously published land source changed or is missing: ' + token)
    input_receipt = args.scratch/'parcel-source-receipt.json'
    if args.package_only and (not input_receipt.is_file() or load(input_receipt) != urls):
        raise ValueError('Full build required for the current parcel sources')
    if not args.package_only:
        catalog = baseline_catalog['communities']
        groups = [load(args.map/e['json']) for e in base['districts'].values()]
        additional.update(map_parcel_review.screen(args.permits,catalog,builder,relative_address,sources,args.doors,groups,CASES))
        identical_current_rows(additional, files, sources, builder, args.batch)
        save(args.scratch/'parcel-reviewed-rows.json',additional)
        assert relative_address('健康路三段７００號', '安平區', builder['DISTRICTS']) == '安平區健康路三段700號'
        assert relative_address('東區健康路1號', '安平區', builder['DISTRICTS']) == '東區健康路1號'
        assert relative_address('高雄市三民區大順路1號', '安平區', builder['DISTRICTS']) == '高雄市三民區大順路1號'
        sample={'date':'2018-09-20','singleBuilding':True,'completionStatus':'valid','completionPrecision':'day','buildingCompletionDate':'2018-09-21'}
        assert pre_completion(sample) and not pre_completion(dict(sample,date='2018-09-21'))
        month=dict(sample,completionPrecision='month',buildingCompletionDate='2018-09')
        assert pre_completion(dict(month,date='2018-08-31')) and not pre_completion(month)
        assert not pre_completion(dict(sample,completionStatus='missing')) and not pre_completion(dict(sample,singleBuilding=False))
        row={'鄉鎮市區':'安平區','土地區段位置或建物區門牌':'健康路三段700號','總價元':'10000000','建物移轉總面積平方公尺':'100',
             '交易筆棟數':'土地1建物1車位0','建築完成年月':'1070921','建物型態':'住宅大樓','主要用途':'住家用','建物現況格局-房':'2','備註':'預售屋'}
        tx=builder['transaction'](row,'test:1',builder['date_of']('1070920'))
        assert not tx['eligible'] and '預售屋' in tx['exclusionReason']
        builder['main']()
        save(input_receipt, urls)
    package(args, urls, base, builder, initial_manifest)


if __name__ == '__main__':
    main()
