"""Build the Tainan pre-sale register from MOI's B files. Python 3, stdlib only.

Example: --last-quarter 115S3 --latest-batch 2026-11-21 --cache /tmp/verified-presales
Without --offline all sources are rechecked, including revised quarter files.
"""
import argparse
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
import csv
from datetime import date, timedelta
import hashlib
import io
import json
from pathlib import Path
import re
import time
from urllib.request import Request, urlopen
import zipfile


BASE = 'https://plvr.land.moi.gov.tw/'
NOTICE = 'https://lvr.land.moi.gov.tw/R11/jsp/index.jsp'
MEMBER = 'd_lvr_land_b.csv'
REQUIRED = {'編號', '鄉鎮市區', '交易年月日', '總價元', '土地位置建物門牌',
            '單價元平方公尺', '建物移轉總面積平方公尺', '移轉層次'}
ROOT = Path(__file__).resolve().parents[1]


def digest(data):
    return hashlib.sha256(data).hexdigest()


def encode(value):
    return (json.dumps(value, separators=(',', ':'), ensure_ascii=False, allow_nan=False)+'\n').encode()


def download(url):
    for attempt in range(3):
        try:
            with urlopen(Request(url, headers={'User-Agent':'Homego Tainan atlas'}), timeout=60) as response:
                return response.read()
        except OSError:
            if attempt == 2:
                raise
            time.sleep(2 ** attempt)


def notice_date():
    page = download(NOTICE).decode('utf-8')
    for row in re.findall(r'<tr\b[^>]*>(.*?)</tr>', page, flags=re.I | re.S):
        matched = re.search(r"class=['\"]date_bg['\"]>\s*(\d+)年(\d+)月(\d+)日", row)
        if matched and '預售屋' in row and '查詢及下載' in row:
            year, month, day = map(int, matched.groups())
            return date(year + 1911, month, day)
    raise ValueError('無法確認目前預售屋資料公告日')


def batches(last_quarter, latest):
    match = re.fullmatch(r'(\d{3})S([1-4])', last_quarter)
    if not match or latest.day not in (1, 11, 21):
        raise ValueError('期別應為民國季別及官方旬公告日')
    year, quarter = map(int, match.groups())
    if (year, quarter) < (101, 3):
        raise ValueError('季檔涵蓋時間有誤')
    next_quarter = date(1911 + year + (quarter == 4), 1 if quarter == 4 else quarter * 3 + 1, 1)
    if latest < next_quarter - timedelta(days=11):
        raise ValueError('季檔範圍超過指定最新旬')
    specs = []
    for yy in range(101, year + 1):
        for qq in range(1, 5):
            if (101, 3) <= (yy, qq) <= (year, quarter):
                period = f'{yy}S{qq}'
                specs.append((period, BASE+'DownloadSeason?season='+period+'&fileName='+MEMBER, 'quarter'))
    d = next_quarter
    while d <= latest:
        if d.day in (1,11,21):
            label = d.strftime('%Y%m%d')
            specs.append((label, BASE+'DownloadHistory?type=history&fileName='+label, 'batch'))
        d += timedelta(days=1)
    return specs


def archive_member(data):
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        names = archive.namelist()
        if not any(Path(name).name.lower() == 'd_lvr_land_a.csv' for name in names):
            raise ValueError('全國封存檔缺臺南買賣主表，無法判斷預售涵蓋')
        matches = [n for n in names if Path(n).name.lower() == MEMBER]
        if len(matches) > 1:
            raise ValueError('封存檔內有多個同名臺南預售主表')
        return archive.read(matches[0]) if matches else None


def acquire(spec, latest):
    label, url, kind = spec
    meta = {'label': label, 'url': url}
    data = download(url)
    if kind == 'quarter' and not data.lstrip(b'\xef\xbb\xbf').startswith('鄉鎮市區'.encode()):
        meta['url'] = BASE + 'DownloadSeason?season=' + label + '&type=zip&fileName=lvr_landcsv.zip'
        archive = download(meta['url'])
        meta.update(archiveSha256=digest(archive),member=MEMBER)
        data = archive_member(archive)
    elif kind == 'batch':
        if data[:2] == b'PK':
            meta.update(archiveSha256=digest(data),member=MEMBER)
            data = archive_member(data)
        elif label == latest.strftime('%Y%m%d') and notice_date() == latest:
            meta['url'] = BASE + 'Download?fileName=' + MEMBER
            data = download(meta['url'])
            if notice_date() != latest:
                raise ValueError('下載期間官方公告已切換，請重跑')
        else:
            raise ValueError('旬檔尚未取得：'+label)
    if data is not None:
        meta.update(file=label+'.csv',sha256=digest(data))
        first_line = data.decode('utf-8-sig').splitlines()[0]
        if not REQUIRED.issubset(next(csv.reader([first_line]))):
            raise ValueError('缺少臺南預售欄位：'+label)
    return meta, data


def source_index(args):
    specs = batches(args.last_quarter, args.latest_batch)
    cache = args.cache
    cache.mkdir(exist_ok=True, parents=True)
    index_path = cache / 'verified-sources.json'
    if args.offline:
        index = json.loads(index_path.read_bytes())
        if [s['label'] for s in index] != [s[0] for s in specs]:
            raise ValueError('留存檔與要求期別不同')
        return index
    with ThreadPoolExecutor(max_workers=4) as pool:
        results = pool.map(lambda spec:acquire(spec,args.latest_batch), specs)
        index = []
        for meta, content in results:
            if content is not None:
                dest = cache / meta['file']
                dest.write_bytes(content)
            index.append(meta)
    index_path.write_bytes(encode(index))
    return index


def amount(value):
    value = (value or '').strip()
    if not value:
        return None
    number = float(value.replace(',',''))
    return int(number) if number.is_integer() else number


def iso_date(raw):
    digits = raw.strip().zfill(7)
    try:
        return date(1911+int(digits[:-4]),int(digits[-4:-2]),int(digits[-2:])).isoformat()
    except ValueError:
        return '?'+raw


def flags(row):
    cancellation = (row.get('解約情形') or '').strip()
    if cancellation:
        statements = {part.strip() for part in re.split('[;；]',cancellation) if part.strip()}
        result = re.fullmatch(r'(\d{6,7})(全部解約|部分解約)', next(iter(statements))) if len(statements)==1 else None
        return (result[2]+' · '+iso_date(result[1])) if result else '有解約登載 · 請核官方原列'
    return '原檔另有備註' if row.get('備註','').strip() else '—'


def build(args):
    sources, absent = [], []
    records = {}
    revisions = 0
    for meta in source_index(args):
        meta = dict(meta)
        if 'file' not in meta:
            absent.append(meta)
            continue
        blob = (args.cache / meta.pop('file')).read_bytes()
        if digest(blob) != meta['sha256']:
            raise ValueError('快取雜湊不符：'+meta['label'])
        reader = csv.DictReader(io.StringIO(blob.decode('utf-8-sig'),newline=''))
        if not REQUIRED.issubset(reader.fieldnames or []):
            raise ValueError('必要欄位缺漏：'+meta['label'])
        source_id = len(sources)
        count = 0
        period_ids = set()
        for line, row in enumerate(reader,2):
            if line == 2 and row['鄉鎮市區'].lower().startswith('the villages'):
                continue
            serial = row['編號'].strip()
            if not serial:
                raise ValueError(f"缺少編號：{meta['label']} #{line}")
            if serial in period_ids:
                raise ValueError(f"同批內編號重複，需核對：{meta['label']} #{line}")
            period_ids.add(serial)
            count += 1
            revisions += serial in records
            record = [iso_date(row['交易年月日']),row['土地位置建物門牌'],row['建物型態'] or row['交易標的'],
                      row['移轉層次'],amount(row['總價元']),amount(row['單價元平方公尺']),amount(row['建物移轉總面積平方公尺']),
                      flags(row),source_id,line,row.get('建案名稱') or '',row.get('棟及號') or '',None,
                      amount(row['車位總價元']),amount(row['車位移轉總面積平方公尺'])]
            records[serial] = (row['鄉鎮市區'].strip() or '行政區未載',record)
        meta['rows'] = count
        batch_id = meta['label']
        meta['batchId'] = batch_id
        meta['label'] = (batch_id.replace('S',' 年第 ')+' 季') if 'S' in batch_id else (date.fromisoformat(batch_id).isoformat()+' 公告')
        sources.append(meta)

    flags_table = sorted({rec[7] for _, rec in records.values()})
    type_table = sorted({rec[2] for _, rec in records.values()})
    flag_idx = {v:i for i,v in enumerate(flags_table)}
    type_idx = {v:i for i,v in enumerate(type_table)}
    buckets = defaultdict(list)
    projects = defaultdict(set)
    cancelled = 0
    for district,rec in records.values():
        cancelled += '解約' in rec[7]
        if rec[10].strip():
            projects[rec[10].strip()].add(district)
        rec[2],rec[7] = type_idx[rec[2]],flag_idx[rec[7]]
        buckets[district].append(rec)
    out = args.output
    out.mkdir(exist_ok=True,parents=True)
    previous_manifest = out/'manifest.json'
    previous_files = set()
    if previous_manifest.is_file():
        old = json.loads(previous_manifest.read_bytes())
        if old.get('market') != 'presale':
            raise ValueError('輸出位置已有其他市場資料')
        previous_files = {part['file'] for entry in old['districts'].values() for part in entry['parts']}
    index = {}
    for seq,(name,rows) in enumerate(sorted(buckets.items())):
        rows.sort(key=lambda r:(r[0].startswith('?'),-int(r[0].replace('-','')) if not r[0].startswith('?') else 0, r[1],r[8],r[9]))
        parts = []
        for i in range(0,len(rows),3500):
            batch = rows[i:i+3500]
            data = encode(batch)
            h = digest(data)
            filename = f'p{seq:02}-{i//3500}-{h[:12]}.json'
            (out / filename).write_bytes(data)
            parts.append({'file':filename,'count':len(batch),'bytes':len(data),'sha256':h})
        index[name] = {'count':len(rows),'parts':parts}
    boundary_js = (ROOT/'tainan-map/district-boundaries.js').read_text(encoding='utf-8')
    geo = json.loads(boundary_js.split('window.DISTRICT_GEOJSON=',1)[1].strip().removesuffix(';'))
    city_districts = {feature['properties']['name'] for feature in geo['features']}
    if len(city_districts) != 37:
        raise ValueError('無法辨識臺南市 37 區')
    if set(index)-set(city_districts)-{'行政區未載'}:
        raise ValueError('原檔含未識別的行政區，請核對來源')
    for name in sorted(city_districts):
        index.setdefault(name,{'count':0,'parts':[]})
    manifest = {'schema':1,'market':'presale','count':len(records),'latestBatch':args.latest_batch.isoformat(),
                'coverage':f'民國 101 年第 3 季至 {args.last_quarter.replace("S"," 年第 ")} 季公開季檔及後續至 {args.latest_batch} 旬檔。以臺南預售屋 B 檔內實際揭露為準。',
                'note':f'按官方案件編號去重，保留解約登載 {cancelled:,} 筆。早期揭露制度不同，部分季檔未收錄臺南預售主表，部分紀錄未揭露建案名。',
                'sourceHome':BASE+'DownloadOpenData','sources':sources,'districts':index,'labels':{'types':type_table,'flags':flags_table},
                'projectDistricts':{name:sorted(districts) for name,districts in sorted(projects.items())},
                'cancellations':cancelled,'superseded':revisions,'missingQuarterTables':absent}
    tmp = out/'manifest.tmp'
    tmp.write_bytes(encode(manifest))
    tmp.replace(out/'manifest.json')
    published_files = {part['file'] for entry in index.values() for part in entry['parts']}
    for filename in previous_files-published_files:
        file = (out/filename).resolve()
        if re.fullmatch(r'p\d+-\d+-[a-f0-9]{12}\.json',filename) and file.parent==out.resolve():
            file.unlink(missing_ok=True)
    print('預售 B 檔',len(sources),'未列臺南 B 主表的封存檔',len(absent),'去重後',len(records),'解約登載',cancelled,'分片',sum(len(v['parts']) for v in index.values()))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--last-quarter',required=True)
    parser.add_argument('--latest-batch',required=True,type=date.fromisoformat)
    parser.add_argument('--cache',required=True,type=Path)
    parser.add_argument('--offline',action='store_true')
    parser.add_argument('--output',type=Path,default=ROOT/'tainan-map/presale-ledger')
    build(parser.parse_args())
