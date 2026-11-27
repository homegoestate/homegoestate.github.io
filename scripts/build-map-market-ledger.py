"""Build the district lookup from verified MOI Tainan sale A primary CSVs.

Supply --raw twice for the historical and current CSV directories, the reviewed
--source-manifest, --map public map directory, --last-quarter (e.g. 115S3)
and --batch-date (e.g. 20261121). Only the archived copy of past ten-day
releases is used. If an ID has inconsistent versions, stop for source review.
"""
import argparse
import csv
import gzip
import hashlib
import json
import re
from collections import Counter, defaultdict
from datetime import date, timedelta
from pathlib import Path


SOURCE_HOME = 'https://plvr.land.moi.gov.tw/DownloadOpenData'
TARGETS = {'建物', '房地(土地+建物)', '房地(土地+建物)+車位'}
OTHER_TARGETS = {'土地', '車位'}
NOTE_KEYWORDS = (
    ('特殊關係', r'親友|員工|共有人|特殊關係'),
    ('預售或分件登記', r'預售|分件登記|分次登記'),
    ('增建或未登記', r'增建|加蓋|外推|夾層|未登記建物'),
    ('持分或部分移轉', r'持分|部分移轉|部分面積'),
    ('合建', r'合建'),
    ('法院或買賣條件', r'法院|法拍|調解|債權|債務|急買|急賣|瑕疵'),
    ('租約', r'租約|租賃'),
    ('裝潢或家具', r'裝潢|家具|傢俱'),
)
NOTE_RULES = [(name, re.compile(pattern)) for name, pattern in NOTE_KEYWORDS]
FIELDS = ['date', 'address', 'buildingTypeIndex', 'floor', 'totalTwd', 'unitTwdPerM2',
          'buildingAreaM2', 'flagIndex', 'sourceIndex', 'csvRecord', 'projectName',
          'unit', 'inCommunityDetails', 'parkingTwd', 'parkingAreaM2', 'saleTarget',
          'singleBuildingEvidence']


def building_evidence(row, contract_date, latest):
    """Describe one apartment unit using independently reported source columns."""
    count = re.fullmatch(r'土地\d+建物1車位(\d+)', row['交易筆棟數'])
    if not count or not row['建物型態'].startswith(('公寓', '華廈', '住宅大樓', '套房')):
        return None
    completed = row_date(row['建築完成年月'], latest)
    levels = row['總樓層數'].strip()
    if completed.startswith('?') or not levels:
        return None
    parking_area = number(row.get('車位移轉總面積平方公尺', row.get('車位移轉總面積(平方公尺)')))
    parking_price = number(row['車位總價元'])
    if row['主要用途'].strip() not in ('住家用', '住家'):
        reason = '用途非明確住宅'
    elif contract_date.startswith('?') or contract_date < completed:
        reason = '成交日期待核或早於完工'
    elif row['備註'].strip():
        reason = '原檔有備註'
    elif not all((number(row[key]) or 0) > 0 for key in ('單價元平方公尺','建物移轉總面積平方公尺','總價元')):
        reason = '價格或面積待核'
    elif int(count[1]) > 0 and not (parking_price and parking_price > 0 and parking_area and 0 < parking_area < number(row['建物移轉總面積平方公尺']) and parking_price < number(row['總價元'])):
        reason = '車位價或面積未能拆分'
    elif int(count[1]) == 0 and (row['車位類別'].strip() not in ('', '無', '無車位') or parking_price or parking_area):
        reason = '車位欄位不一致'
    else:
        reason = '採計住宅單價'
    return levels, completed, reason


def sha(data):
    return hashlib.sha256(data).hexdigest()


def encoded(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':'), allow_nan=False).encode()


def month_after(year, month):
    return (year + 1, 1) if month == 12 else (year, month + 1)


def source_names(last_quarter, batch):
    end = re.fullmatch(r'(\d{3})S([1-4])', last_quarter)
    year_end, quarter_end = map(int, end.groups())
    for year in range(101, year_end + 1):
        for quarter in range(1, 5):
            if (101, 3) <= (year, quarter) <= (year_end, quarter_end):
                yield f'moi-season-{year}S{quarter}.csv', f'{year} 年第 {quarter} 季'
    year, month = month_after(year_end + 1911, quarter_end * 3)
    if batch.day not in (1, 11, 21) or batch < date(year, month, 1):
        raise ValueError('The last quarter and the supplied ten-day release do not align.')
    while date(year, month, 1) <= batch:
        for day in (1, 11, 21):
            release = date(year, month, day)
            if release <= batch:
                kind = 'current' if release == batch else 'history'
                yield f'moi-{kind}-{release:%Y%m%d}.csv', f'{release} 公告'
        year, month = month_after(year, month)


def community_refs(public):
    manifest = json.loads((public / 'data-manifest.json').read_bytes())
    references = {}
    for district, entry in manifest['districts'].items():
        content = (public / entry['json']).read_bytes()
        if sha(content) != entry['sha256']:
            raise ValueError(f'Community shard digest differs: {district}')
        for rows in json.loads(content).values():
            for row in rows:
                for ref in row['sourceRows']:
                    name, no = ref.rsplit('/', 1)[-1].rsplit(':', 1)
                    references[(name, int(no))] = row['transactionId']
    return references, manifest['version']


def row_date(raw, latest):
    if re.fullmatch(r'\d{6,7}', raw):
        try:
            when = date(int(raw[:-4]) + 1911, int(raw[-4:-2]), int(raw[-2:]))
            if 1950 <= when.year and when <= latest:
                return when.isoformat()
        except ValueError:
            pass
    return '?' + raw


def number(raw):
    if raw == '':
        return None
    return float(raw) if '.' in raw else int(raw)


def note_flag(note):
    if not note.strip():
        return '原檔無備註'
    tags = [name for name, rule in NOTE_RULES if rule.search(note)]
    return '備註關鍵詞：' + '、'.join(tags) if tags else '有其他備註，請見原檔'


def paths_for(name, dirs):
    paths = [folder/name for folder in dirs if (folder/name).is_file()]
    if not paths:
        raise FileNotFoundError(name)
    return paths[0]


def build(args):
    public = args.map
    out = args.output or public / 'market-ledger'
    out.mkdir(parents=True, exist_ok=True)
    reviewed = {x['filename']: x for x in json.loads(args.source_manifest.read_bytes())['files']}
    mapped, community_version = community_refs(public)
    seen, sources, grouped, totals = {}, [], defaultdict(list), Counter()
    labels = {'types': {}, 'flags': {}, 'floorPrice': {}}
    special_cache = {}
    last = date.fromisoformat(args.batch_date)
    unknown = '行政區未載'
    for index, (name, label) in enumerate(source_names(args.last_quarter, last)):
        source = reviewed[name]
        path = paths_for(name, args.raw)
        if sha(path.read_bytes()) != source['sha256']:
            raise ValueError('Original CSV differs from reviewed SHA-256: ' + name)
        accepted = 0
        with path.open(encoding='utf-8-sig', newline='') as stream:
            records = csv.DictReader(stream)
            if next(records)['交易年月日'].lower() != 'transaction year month and day':
                raise ValueError('Missing English header in ' + name)
            for line, row in enumerate(records, 3):
                target = row['交易標的']
                totals[target] += 1
                if target in OTHER_TARGETS:
                    continue
                if target not in TARGETS:
                    raise ValueError(f'Unreviewed transaction target at {name}:{line}')
                serial = row['編號']
                if not serial or serial in seen:
                    raise ValueError(f'Empty or repeated identifier requiring review at {name}:{line}')
                seen[serial] = (index, line)
                district = row['鄉鎮市區'] or unknown
                raw_date = row_date(row['交易年月日'], last)
                address = row['土地位置建物門牌']
                use = row['建物型態'] or '型態未載'
                use_idx = labels['types'].setdefault(use, len(labels['types']))
                note = row['備註']
                if note not in special_cache:
                    special_cache[note] = note_flag(note)
                flag = special_cache[note]
                flag_idx = labels['flags'].setdefault(flag, len(labels['flags']))
                mapped_serial = mapped.get((name, line))
                if mapped_serial and mapped_serial != serial:
                    raise ValueError(f'Community source row points to different record: {name}:{line}')
                rec = [raw_date, address, use_idx, row['移轉層次'], number(row['總價元']),
                       number(row['單價元平方公尺']), number(row['建物移轉總面積平方公尺']),
                       flag_idx, index, line, '', '', int(bool(mapped_serial)), number(row['車位總價元']),
                       number(row.get('車位移轉總面積平方公尺', row.get('車位移轉總面積(平方公尺)'))), target]
                evidence = building_evidence(row, raw_date, last)
                if evidence:
                    levels, completed, status = evidence
                    status_index = labels['floorPrice'].setdefault(status, len(labels['floorPrice']))
                    rec.append([levels, completed, status_index])
                else:
                    rec.append(None)
                grouped[district].append(rec)
                accepted += 1
                totals['dateReview'] += raw_date.startswith('?')
                totals['matched'] += bool(mapped_serial)
            if line - 2 != source['rows']:
                raise ValueError('Original row count mismatch for ' + name)
        sources.append(dict(label=label, url=source['sourceUrl'], sha256=source['sha256'],
                            file=name, rows=source['rows'], included=accepted))
    districts = {}
    unmatched_types = Counter()
    for district_idx, (district, rows) in enumerate(sorted(grouped.items()), 1):
        # A source anomaly remains searchable, sorted behind dated public records.
        rows.sort(key=lambda r: (not r[0].startswith('?'), r[0], r[8], r[9]), reverse=True)
        parts = []
        for start in range(0, len(rows), 6000):
            subset = rows[start:start+6000]
            raw = encoded(subset)
            digest = sha(raw)
            name = f'{district_idx:02d}-{start//6000+1:02d}-{digest[:12]}.json'
            compressed = gzip.compress(raw, compresslevel=9, mtime=0)
            (out/name).write_bytes(raw)
            (out/(name + '.gz')).write_bytes(compressed)
            parts.append(dict(file=name, count=len(subset), bytes=len(raw), sha256=digest,
                              gzip=name+'.gz', gzipBytes=len(compressed)))
        unmatched = Counter(r[2] for r in rows if not r[12])
        unmatched_types.update(unmatched)
        districts[district] = dict(count=len(rows), communityRows=len(rows)-sum(unmatched.values()),
                                   unlinkedByType=dict(sorted(unmatched.items())), parts=parts)
    # Announcement registration windows are offset from transaction dates.
    before = last - timedelta(days=1)
    start = before.replace(day=1 if last.day == 21 else 11 if last.day == 1 else 21)
    if last.day == 11:
        last_month = last.replace(day=1) - timedelta(days=1)
        start, before = last_month.replace(day=21), last_month
    elif last.day == 21:
        before = before.replace(day=10)
    else:
        before = before.replace(day=20)
    note = (f'最新公告涵蓋登記日 {start:%Y-%m-%d} 至 {before:%Y-%m-%d}。'
            '成交日期依各筆契約。含房地與僅建物買賣，土地單獨交易、單獨車位與租賃未納入。'
            '部分買賣備註含預售或分件登記，兩個市場的筆數請勿相加。當期下載網址會隨公告更新。')
    manifest = dict(schema=1, market='sale', latestBatch=str(last), count=len(seen),
                    coverage=f'內政部臺南買賣 A 檔，自 101 年第 3 季至 {args.last_quarter[:3]} 年第 {args.last_quarter[-1]} 季，續接旬檔至 {last} 公告。',
                    note=note, fields=FIELDS, sourceHome=SOURCE_HOME, sources=sources,
                    labels={k:list(v) for k,v in labels.items()}, districts=districts,
                    communityVersion=community_version, communityRows=totals['matched'],
                    unlinkedRows=len(seen)-totals['matched'], unlinkedByType=dict(sorted(unmatched_types.items())),
                    unknownDistrict=len(grouped.get(unknown, [])),
                    dateReview=totals['dateReview'], originalTargets={t:totals[t] for t in sorted(TARGETS|OTHER_TARGETS)})
    catalog_manifest = json.loads((public / 'data-manifest.json').read_bytes())
    review = catalog_manifest.get('doorReview')
    if review:
        if review['officialRows'] != manifest['count'] or review['remaining'] != manifest['unlinkedRows'] or sum(review['residualReasons'].values()) != review['remaining']:
            raise ValueError('The community reconciliation report does not describe this market snapshot.')
        manifest['doorReview'] = review
        catalog = json.loads((public / catalog_manifest['summary']['json']).read_bytes())
        snapshot = catalog['meta']['registrySnapshot']
        manifest['registrySnapshot'] = {k:snapshot[k] for k in ('fileAsOf','publishedAt')}
    manifest_bytes = encoded(manifest)
    temp = out / 'manifest.json.tmp'
    temp.write_bytes(manifest_bytes)
    temp.replace(out / 'manifest.json')
    print(json.dumps({key: manifest[key] for key in ('count','communityRows','unlinkedRows','unknownDistrict','dateReview','originalTargets')}, ensure_ascii=False))


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--source-manifest', type=Path, required=True)
    p.add_argument('--raw', action='append', type=Path, required=True)
    p.add_argument('--map', type=Path, required=True)
    p.add_argument('--output', type=Path, help='Build into a separate directory for verification before release.')
    p.add_argument('--last-quarter', required=True)
    p.add_argument('--batch-date', required=True)
    build(p.parse_args())
