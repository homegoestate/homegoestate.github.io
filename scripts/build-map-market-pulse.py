"""Build the homepage market summary from official municipal data and the two MOI ledgers.

Run from any directory with Python 3. For an offline rebuild pass --raw <A and B
CSV directories> (repeat as needed). --download-missing also reads official MOI
quarter or archived release files. To adopt a newer release, verify catalogs,
update market-pulse/sources.json, then run with --refresh-official. The script
checks source months, announced coverage, ledger hashes and original CSV rows.
"""
import argparse
import csv
import hashlib
import html
import io
import json
import re
import statistics
import zipfile
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path
from urllib.request import Request, urlopen


PUBLIC = Path(__file__).resolve().parents[1] / 'tainan-map'
OUT = PUBLIC / 'market-pulse'
SOURCE = json.loads((OUT / 'sources.json').read_bytes())
PHASES = {'sale': 'market-ledger', 'presale': 'presale-ledger'}
APARTMENTS = {'公寓(5樓含以下無電梯)', '華廈(10層含以下有電梯)', '住宅大樓(11層含以上有電梯)'}
HOUSE_TARGETS = {'房地(土地+建物)', '房地(土地+建物)+車位'}
MIN_N = 5
ROC_DATE = r'(\d{2,3})年(\d{1,2})月(\d{1,2})日'


def digest(blob):
    return hashlib.sha256(blob).hexdigest()


def download(url):
    request = Request(url, headers={'User-Agent': 'Homego public property atlas'})
    with urlopen(request, timeout=90) as response:
        return response.read()


def plain(page):
    return html.unescape(re.sub(r'<[^>]+>', '', page))


def iso_roc(yy, mm, dd):
    return date(int(yy) + 1911, int(mm), int(dd)).isoformat()


def prev_month(month):
    return (date.fromisoformat(month+'-01') - timedelta(days=1)).isoformat()[:7]


def resource_url(item):
    return 'https://soa.tainan.gov.tw/Api/Service/Get/'+item['id']


def read_transfers(content, item):
    response = json.loads(content)
    y, m = item['period'].split('-')
    expected = f'{int(y) - 1911}{m}'
    result = {}
    if response['success'] is not True:
        raise ValueError('市府資料服務未成功傳回')
    for row in response['data']:
        district = row['行政區']
        if row['年月'] != expected or district in result or not district.endswith('區'):
            raise ValueError(f"買賣移轉期間或行政區不符：{item['period']} {district}")
        result[district] = int(row['建物件數'])
    if len(result) != 37 or min(result.values()) < 0:
        raise ValueError('買賣統計缺區或數量無效')
    result['全市'] = sum(result.values())
    return result


def extract_index(page):
    match = re.search(r'\d{2,3}年\s*\d{1,2}月臺南市住宅價格指數為[^。]+。', plain(page))
    published = re.search(r'日期：(\d{2,3})-(\d{2})-(\d{2})', plain(page))
    if not match or not published:
        raise ValueError('請核對官方住宅價格指數公告格式')
    if iso_roc(*published.groups()) != SOURCE['housingIndex']['published']:
        raise ValueError('住宅價格指數發布日不一致')
    return match[0]


def index_numbers(line):
    period = re.match(r'(\d+)年\s*(\d+)月', line)
    level = re.search(r'住宅價格指數為([\d.]+)', line)
    shifts = re.findall(r'(上升|上漲|下跌|下降|持平)\s*([\d.]+)?%?', line)
    if not period or not level or len(shifts) != 2 or '去年同期' not in line:
        raise ValueError('價格指數或變動率須核對')
    if iso_roc(*period.groups(), 1)[:7] != SOURCE['housingIndex']['period']:
        raise ValueError('價格指數期別錯誤')
    def signed(entry):
        word, magnitude = entry
        return 0 if word == '持平' else float(magnitude) * (-1 if word in ('下跌', '下降') else 1)
    return dict(value=float(level[1]), mom=signed(shifts[0]), yoy=signed(shifts[1]))


def extract_notice(page):
    for row in re.findall(r'<tr\b[^>]*>(.*?)</tr>', page, re.I | re.S):
        if 'date_bg' in row and '預售屋案件查詢及下載' in row:
            return plain(row).strip().split('查詢及下載')[0]
    raise ValueError('找不到內政部 A/B 旬公告')


def notice_periods(line):
    dates = re.findall(ROC_DATE, line)
    if len(dates) != 7 or '登記日期' not in line or '之買賣案件' not in line or '之預售屋案件' not in line:
        raise ValueError('請核對內政部旬公告的日期及市場')
    pub, a1, a2, _, _, b1, b2 = (iso_roc(*d) for d in dates)
    if pub != SOURCE['announcement']['published']:
        raise ValueError('官網最新公告與指定已覆核期別不同')
    return dict(published=pub, sale=[a1, a2], presale=[b1, b2])


def refresh_official():
    # Validate every payload before replacing any local source.
    changed = {}
    for item in SOURCE['transfers']:
        blob = download(resource_url(item))
        read_transfers(blob, item)
        changed['transfers-'+item['period']+'.json'] = blob
    headline = extract_index(download(SOURCE['housingIndex']['url']).decode('utf-8-sig'))
    index_numbers(headline)
    release = extract_notice(download(SOURCE['announcement']['url']).decode('utf-8-sig'))
    notice_periods(release)
    changed['housing-index.txt'] = (headline+'\n').encode()
    changed['moi-release.txt'] = (release+'\n').encode()
    for filename, blob in changed.items():
        (OUT / filename).write_bytes(blob)


def raw_rows(source, phase, args):
    kind = 'a' if phase == 'sale' else 'b'
    label = source.get('batchId') or source['label'].split(' ')[0].replace('-', '')
    name = source.get('file', label+'.csv')
    member = f'd_lvr_land_{kind}.csv'
    blob = None
    def unpack(payload):
        with zipfile.ZipFile(io.BytesIO(payload)) as archive:
            matches = [n for n in archive.namelist() if Path(n).name.lower() == member]
            if len(matches) != 1:
                raise ValueError('官方封存檔未含唯一臺南主表：'+member)
            return archive.read(matches[0])
    for folder in args.raw:
        path = folder / name
        archive = folder / f'moi-history-{label}.zip'
        if path.is_file():
            blob = path.read_bytes()
            break
        if archive.is_file():
            blob = unpack(archive.read_bytes())
            break
    if blob is None and args.download_missing:
        url = source['url']
        if '/Download?' in url and label.isdigit():
            url = 'https://plvr.land.moi.gov.tw/DownloadHistory?type=history&fileName='+label
        payload = download(url)
        blob = unpack(payload) if payload[:2] == b'PK' else payload
    if blob is None or digest(blob) != source['sha256']:
        raise ValueError('需要相同雜湊的內政部原檔：'+name)
    return list(csv.DictReader(io.StringIO(blob.decode('utf-8-sig'), newline='')))


def sample(row):
    style = row['建物型態']
    group = 'apartment' if style in APARTMENTS else 'house' if style == '透天厝' else None
    target = row['交易標的']
    if not group or target not in HOUSE_TARGETS or row['主要用途'] != '住家用' or row['備註'].strip():
        return None
    def number(key):
        return float(row[key] or 0)
    total, area = number('總價元'), number('建物移轉總面積平方公尺')
    parking, parking_area = number('車位總價元'), number('車位移轉總面積平方公尺')
    if target.endswith('+車位'):
        if not (0 < parking < total and 0 < parking_area < area):
            return None
    elif parking or parking_area or row['車位類別'].strip():
        return None
    unit = number('單價元平方公尺')
    if total <= 0 or area <= 0 or unit <= 0:
        return None
    return group, unit


def summarize_phase(phase, month_keys, districts, notice, args):
    ledger_dir = PUBLIC / PHASES[phase]
    manifest_data = (ledger_dir / 'manifest.json').read_bytes()
    manifest = json.loads(manifest_data)
    if manifest['latestBatch'] != notice['published']:
        raise ValueError('A/B 交易資料與內政部公告不同期')
    references = defaultdict(list)
    for district, info in manifest['districts'].items():
        for part in info['parts']:
            blob = (ledger_dir / part['file']).read_bytes()
            if digest(blob) != part['sha256']:
                raise ValueError('交易分片雜湊不符：'+part['file'])
            for rec in json.loads(blob):
                if rec[0][:7] in month_keys:
                    references[rec[8]].append((district, rec[0], rec[9]))
    counts = defaultdict(int)
    prices = defaultdict(list)
    for source_id, items in references.items():
        originals = raw_rows(manifest['sources'][source_id], phase, args)
        for district, contract, line in items:
            row = originals[line - 2]
            raw_date = row['交易年月日']
            if (row['鄉鎮市區'].strip() or '行政區未載') != district or contract != iso_roc(raw_date[:-4], raw_date[-4:-2], raw_date[-2:]):
                raise ValueError(f'分片與原始列對照失敗：{phase} {source_id}:{line}')
            if phase == 'presale' and row.get('解約情形', '').strip():
                continue
            if phase == 'sale' and row['交易標的'] not in HOUSE_TARGETS | {'建物'}:
                continue
            qualifying = sample(row)
            for scope in ('全市', district):
                key = (scope, contract[:7])
                counts[key] += 1
                if qualifying:
                    group, unit = qualifying
                    prices[key + (group,)].append(unit)
    result = {}
    for district in districts:
        periods = []
        for month in month_keys:
            value = {'disclosed': counts[district, month]}
            for group in ('apartment', 'house'):
                units = prices[district, month, group]
                value[group] = {'n': len(units), 'median': round(statistics.median(units)/0.3025/10000, 2) if len(units) >= MIN_N else None}
            periods.append(value)
        result[district] = periods
    return result, digest(manifest_data)


def build(args):
    if args.refresh_official:
        refresh_official()
    volumes = SOURCE['transfers']
    if len(volumes) != 2 or prev_month(volumes[1]['period']) != volumes[0]['period']:
        raise ValueError('需提供相鄰兩月的市府買賣移轉統計')
    transfers = [read_transfers((OUT / ('transfers-'+item['period']+'.json')).read_bytes(), item) for item in volumes]
    if transfers[0].keys() != transfers[1].keys():
        raise ValueError('兩期移轉行政區不同')
    notice = notice_periods((OUT / 'moi-release.txt').read_text(encoding='utf-8'))
    stats = index_numbers((OUT / 'housing-index.txt').read_text(encoding='utf-8'))
    # Last month for which the B announcement has reached the last calendar day.
    end = date.fromisoformat(notice['presale'][1])
    period = end.isoformat()[:7] if (end+timedelta(days=1)).day == 1 else prev_month(end.isoformat()[:7])
    periods = sorted({period, prev_month(period), end.isoformat()[:7], notice['published'][:7]})
    districts = list(transfers[1])
    data = {district: {'transfers': [month[district] for month in transfers]} for district in districts}
    sha = {}
    for phase in PHASES:
        results, sha[phase] = summarize_phase(phase, periods, districts, notice, args)
        for district in districts:
            data[district][phase] = results[district]
    out = dict(schema=1, checkedOn=SOURCE['verifiedOn'], notice=notice, pricePeriod=period,
               periods=periods, minN=MIN_N, transferPeriods=[item['period'] for item in volumes],
               transferPublished=volumes[-1]['published'], transferCatalog=SOURCE['transferCatalog'],
               index={**SOURCE['housingIndex'], **stats}, moiUrl=SOURCE['announcement']['url'],
               ledgerHashes=sha, areas=data)
    return (json.dumps(out, ensure_ascii=False, separators=(',', ':'), allow_nan=False)+'\n').encode()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--raw', action='append', type=Path, default=[])
    parser.add_argument('--download-missing', action='store_true')
    parser.add_argument('--refresh-official', action='store_true')
    parser.add_argument('--check', action='store_true', help='Compare a complete rebuild with the shipped snapshot')
    args = parser.parse_args()
    result = build(args)
    path = OUT / 'summary.json'
    if args.check:
        if path.read_bytes() != result:
            raise SystemExit('市況快照與原件重算不符')
    else:
        path.write_bytes(result)
    print(f'{path.name} SHA-256 {digest(result)}')
