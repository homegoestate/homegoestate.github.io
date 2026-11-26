"""Check both products against the latest Tainan household register.

python scripts/sync-map-population.py                  # check checkout and public Anxin City
python scripts/sync-map-population.py --public-map     # check both deployed copies
python scripts/sync-map-population.py --write          # refresh the map checkout
python scripts/sync-map-population.py --write --anxin-dir ../anxin-city

The last command updates both checkouts. Review and release through their normal
deployment processes. All downloads happen at maintenance time.
"""

import argparse
import datetime
import html
import json
import os
import re
import sys
import tempfile
from pathlib import Path
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
MAP = ROOT / 'tainan-map/population.js'
SITE = 'https://homegoestate.github.io'
CURRENT = 'https://bca.tainan.gov.tw/News_Population.aspx?Create=1&n=1131&sms=13853'
DISTRICTS = set('新營 鹽水 白河 柳營 後壁 東山 麻豆 下營 六甲 官田 大內 佳里 學甲 西港 七股 將軍 北門 新化 善化 新市 安定 山上 玉井 楠西 南化 左鎮 仁德 歸仁 關廟 龍崎 永康 東 南 北 安南 安平 中西'.split())
DISTRICTS = {name + '區' for name in DISTRICTS}
ROW = re.compile(r"\['([a-z-]+)', '([^']+區)', (\d+)\]")
MAP_PREFIX = '// 臺南市政府民政局現住人口統計；由 scripts/sync-map-population.py 產生。\nwindow.AtlasPopulation = '


def fetch(url):
    request = Request(url, headers={'User-Agent': 'Homego-population-maintenance/1.0'})
    with urlopen(request, timeout=35) as response:
        return response.read().decode('utf-8-sig')


def validate(rows, total):
    if set(rows) != DISTRICTS or any(type(n) is not int or n <= 0 for n in rows.values()):
        raise ValueError('缺少行政區、區名錯誤或人口值不完整')
    if sum(rows.values()) != total:
        raise ValueError('37 區人口合計與全市總計不符')


def official(source):
    plain = re.sub(r'\s+', '', html.unescape(re.sub(r'<[^>]+>', ' ', source)))
    match = re.search(r'臺南市(\d{2,3})年(\d{1,2})月份?各區現住人口數', plain)
    if not match:
        raise ValueError('民政局本期人口標題已變更')
    year, month = map(int, match.groups())
    if not 1 <= month <= 12:
        raise ValueError('官方統計月份無效')
    rows = {}
    for name, count in re.findall(r'(臺南市|[\u4e00-\u9fff]{1,2}區)[：:]\d[\d,]*里[，,]\d[\d,]*鄰[，,]\d[\d,]*戶[，,]([\d,]+)人', plain[match.end():]):
        if name in rows:
            raise ValueError('官方表格重複行政區 ' + name)
        rows[name] = int(count.replace(',', ''))
    total = rows.pop('臺南市')
    validate(rows, total)
    option = re.search(r'<option\s+value="(\d+)"[^>]*>\s*\*?\s*' + str(year) + r'\s*年\s*0?' + str(month) + r'\s*月\s*</option>', source)
    if not option:
        raise ValueError('找不到民政局本月公告網址')
    url = 'https://bca.tainan.gov.tw/News_Content.aspx?n=1131&s=' + option.group(1) + '&sms=13853'
    sorted_rows = sorted(rows.items(), key=lambda item: -item[1])
    districts = {name: {'population': n, 'rank': i} for i, (name, n) in enumerate(sorted_rows, 1)}
    return {'period': f'{year + 1911}-{month:02}', 'periodLabel': f'民國{year}年{month}月底',
            'total': total, 'districts': districts,
            'source': {'name': '臺南市政府民政局', 'url': url, 'dataUrl': None}}


def anxin_data(code):
    def field(key):
        match = re.search(r"^  " + key + r": '([^'\r\n]+)',", code, re.M)
        if not match:
            raise ValueError('安心城資料格式已變更：' + key)
        return match.group(1)
    rows = ROW.findall(code)
    total = int(re.search(r'^  total: (\d+),', code, re.M).group(1))
    if len(rows) != 37 or len({row[0] for row in rows}) != 37:
        raise ValueError('安心城 37 區資料有缺漏或重複')
    populations = {name: int(value) for _, name, value in rows}
    validate(populations, total)
    return field('period'), populations, total


def open_data(snapshot, source_urls, read_url):
    """Verify the period-specific city dataset already linked from either product."""
    resources = [re.fullmatch(r'https://data\.tainan\.gov\.tw/Resource/([0-9a-f-]{36})', url) for url in source_urls]
    resource = next((match.group(1) for match in resources if match), None)
    if not resource:
        return
    data_url = 'https://soa.tainan.gov.tw/Api/Service/Get/' + resource
    response = json.loads(read_url(data_url))
    records = response['data']
    if response.get('success') is not True or len(records) != 38:
        raise ValueError('市府開放資料未提供完整本期資料')
    rows = {r['區域別']: int(r['人口數總計']) for r in records}
    total = rows.pop('臺南市')
    validate(rows, total)
    values = {name: row['population'] for name, row in snapshot['districts'].items()}
    if rows != values or total != snapshot['total']:
        raise ValueError('市府開放資料與民政局逐區資料不符')
    snapshot['source'].update(url='https://data.tainan.gov.tw/Resource/' + resource, dataUrl=data_url)


def read_map(code):
    assignment = code.split('window.AtlasPopulation = ', 1)
    if len(assignment) != 2:
        raise ValueError('房產地圖人口檔格式已變更')
    return json.loads(assignment[1].strip().removesuffix(';'))


def same_map(local, snapshot):
    return local is not None and all(local.get(k) == snapshot[k] for k in ('period', 'total', 'districts'))


def replace_once(pattern, replacement, text):
    result, count = re.subn(pattern, lambda _: replacement, text, flags=re.M)
    if count != 1:
        raise ValueError('安心城檔案結構已變更，請核對 ' + pattern)
    return result


def render_anxin(data, view, snapshot):
    period, label = snapshot['period'], snapshot['periodLabel'].removeprefix('民國')
    source = snapshot['source']
    today = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8))).date().isoformat()
    data = replace_once(r'^// 臺南市政府民政局[^\n]*', '// 臺南市政府民政局 ' + label + '戶籍人口。', data)
    for key, value in {'period': period, 'periodLabel': label, 'total': snapshot['total'],
                       'checkedAt': today, 'sourceUrl': source['url'], 'jsonUrl': source['dataUrl']}.items():
        literal = str(value) if isinstance(value, int) else ('null' if value is None else "'" + value + "'")
        data = replace_once(r'^  ' + key + r': [^\n]*', f'  {key}: {literal},', data)
    data = ROW.sub(lambda m: "['%s', '%s', %d]" % (m[1], m[2], snapshot['districts'][m[2]]['population']), data)
    if '${populationMeta.periodLabel}現住人口統計' not in view:
        view = replace_once(r'\d+\s*年\s*\d+\s*月現住人口統計表', '${populationMeta.periodLabel}現住人口統計', view)
    return data, view


def run(args, read_url=fetch):
    snapshot = official(read_url(CURRENT))
    anxin_path = args.anxin_dir / 'population-data.js' if args.anxin_dir else None
    anxin_code = anxin_path.read_text(encoding='utf-8') if anxin_path else read_url(SITE + '/anxin-city/population-data.js')
    anxin_period, anxin_rows, anxin_total = anxin_data(anxin_code)
    if anxin_period > snapshot['period']:
        raise ValueError('安心城月份較新，請核對民政局更新狀態')
    official_rows = {name: row['population'] for name, row in snapshot['districts'].items()}
    anxin_ok = (anxin_period, anxin_total, anxin_rows) == (snapshot['period'], snapshot['total'], official_rows)
    if args.public_map:
        map_data = read_map(read_url(SITE + '/tainan-map/population.js'))
    else:
        map_data = read_map(MAP.read_text(encoding='utf-8')) if MAP.exists() else None
    if map_data and map_data['period'] > snapshot['period']:
        raise ValueError('房產地圖月份較新，請核對民政局更新狀態')
    source_urls = []
    if anxin_period == snapshot['period']:
        source_urls.extend(re.findall(r"^  sourceUrl: '([^']+)',", anxin_code, re.M))
    if map_data and map_data['period'] == snapshot['period']:
        source_urls.append(map_data.get('source', {}).get('url', ''))
    open_data(snapshot, source_urls, read_url)
    map_ok = same_map(map_data, snapshot)
    if args.write:
        if anxin_path and not anxin_ok:
            view_path = args.anxin_dir / 'population.js'
            view_code = view_path.read_text(encoding='utf-8')
            data, view = render_anxin(anxin_code, view_code, snapshot)
            if anxin_data(data) != (snapshot['period'], official_rows, snapshot['total']):
                raise ValueError('安心城候選檔驗證失敗')
            # Changing the data last keeps a retried update safe after a partial write.
            if view != view_code:
                write_file(view_path, view)
            write_file(anxin_path, data)
            anxin_ok = True
        if not map_ok or map_data['source'] != snapshot['source']:
            write_file(MAP, MAP_PREFIX + json.dumps(snapshot, ensure_ascii=False, indent=2) + ';\n')
            map_ok = same_map(read_map(MAP.read_text(encoding='utf-8')), snapshot)
    report = {'period': snapshot['period'], 'cityTotal': snapshot['total'], 'districtCount': len(official_rows),
              'source': snapshot['source'], 'mapMatches': map_ok, 'anxinMatches': anxin_ok}
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if map_ok and anxin_ok else 1


def write_file(path, content):
    fd, filename = tempfile.mkstemp(dir=path.parent)
    temp = Path(filename)
    try:
        with os.fdopen(fd, 'w', encoding='utf-8', newline='\n') as tmp:
            tmp.write(content)
        temp.replace(path)
    finally:
        temp.unlink(missing_ok=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--anxin-dir', type=Path, help='安心城 checkout 的根目錄')
    group = parser.add_mutually_exclusive_group()
    group.add_argument('--public-map', action='store_true', help='唯讀比對已發布的房產地圖和安心城')
    group.add_argument('--write', action='store_true', help='只更新指定的本機 checkout')
    try:
        sys.exit(run(parser.parse_args()))
    except (OSError, ValueError, KeyError, AttributeError) as err:
        sys.exit('人口同步失敗：' + str(err))
