"""Join Tainan's official presale filings to occupancy permits and the registry.

Use the MOI lvr_buildcasexml.zip (its supplementary permit table is required)
and Tainan occupancy CSVs saved under their resource UUID filenames. The map
catalog supplies the expected municipality CSV hashes and their source URLs.
--as-of is the download/check date, not the filing or completion date.
"""
import argparse
import csv
from collections import Counter, defaultdict
from datetime import date
import hashlib
import io
import json
from pathlib import Path
import re
import unicodedata
from xml.etree import ElementTree
from zipfile import ZipFile


SOURCE = 'https://data.gov.tw/dataset/176351'
ARCHIVE = 'https://plvr.land.moi.gov.tw/opendata/lvr_buildcasexml.zip'
PERMIT = re.compile(r'\(?(\d{2,3})\)?年?南工(使|造)字第?(\d{1,5})(?:[-之](\d+))?號?')
REGISTRY_SUFFIX = re.compile(r'(?:公寓大廈|管理委員會|管理負責人|社區|大樓|管委會)+$')


def clean(text):
    return ''.join(unicodedata.normalize('NFKC', text or '').split())


def permit_base(match):
    return int(match[1]), match[2], int(match[3])


def single_permit(text, kind):
    match = PERMIT.fullmatch(clean(text))
    return permit_base(match) if match and match[2] == kind and not match[4] else None


def project_name(text):
    return REGISTRY_SUFFIX.sub('', clean(text).strip('%'))


def fingerprints(text, kind):
    return {permit_base(m) for m in PERMIT.finditer(clean(text)) if m[2] == kind}


def has_parcel(district, sale_site, occupancy_site):
    """Match full section and parcel/subparcel, including zero-padded lot lists."""
    sale = re.fullmatch(r'(.+段)(\d+)(?:-(\d+))?地號', clean(sale_site))
    place = clean(occupancy_site).removeprefix('臺南市').removeprefix('台南市')
    if not sale or not place.startswith(district + sale[1]):
        return False
    lots = place.removeprefix(district + sale[1]).removesuffix('地號').split('、')
    expected = (int(sale[2]), int(sale[3] or 0))
    for lot in lots:
        m = re.fullmatch(r'(\d+)(?:-(\d+))?', lot)
        if m and (int(m[1]), int(m[2] or 0)) == expected:
            return True
    return False


def rows(archive, file):
    with archive.open('d_lvr_' + file + '.xml') as stream:
        return [{tag.tag: tag.text or '' for tag in data} for data in ElementTree.parse(stream).getroot().findall('data')]


def join(catalog, csv_dir, archive_path, as_of):
    meta = catalog['meta']['householdDataset']
    registry = defaultdict(set)
    for c in catalog['communities']:
        for use in fingerprints(c.get('buildingPermit'), '使'):
            registry[use].add(c['id'])
    catalog_by_id = {c['id']: c for c in catalog['communities']}
    occupancy = defaultdict(set)
    construction = defaultdict(set)
    for source in meta['sourceFiles']:
        data = (csv_dir / Path(source['file']).name).read_bytes()
        if hashlib.sha256(data).hexdigest() != source['sha256']:
            raise ValueError('Occupancy file hash mismatch: ' + source['file'])
        reader = csv.DictReader(io.StringIO(data.decode('utf-8-sig').lstrip('\ufeff')))
        for r in reader:
            use_text = clean(r['執照號碼'])
            build_text = clean(r['原領執照字號'])
            fields = (use_text, build_text, r['建築地點'], clean(r['戶數']), source['resourceUrl'])
            for use in fingerprints(use_text, '使'):
                occupancy[use].add(fields)
            for build in fingerprints(build_text, '造'):
                construction[build].add((use_text, build_text))

    with ZipFile(archive_path) as z:
        filings = rows(z, 'buildcase')
        additional = rows(z, 'buildingpermit')
    # The same construction number can occur as a secondary permit for an
    # entirely different filing. Reserve all mentions, even unusable rows.
    by_permit = defaultdict(set)
    extensions = defaultdict(set)
    filing_ids = Counter(row['編號'] for row in filings if row['編號'])
    for index, row in enumerate(filings):
        for build in fingerprints(row['建造執照'], '造'):
            by_permit[build].add(('main', index))
    for row in additional:
        extensions[row['編號']].add(clean(row['建造執照']))
        for build in fingerprints(row['建造執照'], '造'):
            by_permit[build].add(('additional', row['編號']))

    accepted = {}
    for use, ids in registry.items():
        if len(ids) != 1 or len(occupancy[use]) != 1:
            continue
        c = catalog_by_id[next(iter(ids))]
        use_text, build_text, site, permit_count, city_url = next(iter(occupancy[use]))
        build = single_permit(build_text, '造')
        if not build or single_permit(c.get('buildingPermit'), '使') != use or single_permit(use_text, '使') != use:
            continue
        if len(construction[build]) != 1 or len(by_permit[build]) != 1:
            continue
        where, index = next(iter(by_permit[build]))
        if where != 'main':
            continue
        row = filings[index]
        case_id = row['編號']
        if not case_id or filing_ids[case_id] != 1 or extensions[case_id]:
            continue
        if single_permit(row['建造執照'], '造') != build:
            continue
        district = c['district']
        if district != row['鄉鎮市區'] or project_name(c['name']) != project_name(row['建案名稱']):
            continue
        if not has_parcel(district, row['坐落基地'], site):
            continue
        units = clean(row['層棟戶數'])
        if not re.fullmatch('[1-9][0-9]*', units) or units != permit_count:
            continue
        roc = row['申報備查日期']
        declared = date(int(roc[:3])+1911, int(roc[3:5]), int(roc[5:])).isoformat() if re.fullmatch(r'\d{7}', roc) else None
        accepted[c['id']] = {
            'label': '預售備查規劃戶數', 'count': int(units), 'caseName': row['建案名稱'],
            'permit': row['建造執照'], 'occupancyPermit': use_text, 'parcel': row['坐落基地'],
            'filingId': case_id, 'declaredOn': declared, 'sourceUrl': SOURCE,
            'occupancySourceUrl': city_url, 'asOf': as_of
        }
    provenance = {'archiveUrl': ARCHIVE, 'archiveSha256': hashlib.sha256(archive_path.read_bytes()).hexdigest(),
                  'asOf': as_of, 'tainanFilings': len(filings), 'sourceCoverage': meta['sourceCoverage']}
    return accepted, provenance


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--map', type=Path, required=True)
    parser.add_argument('--sources', type=Path, required=True)
    parser.add_argument('--presale-zip', type=Path, required=True)
    parser.add_argument('--as-of', type=date.fromisoformat, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    manifest = json.loads((args.map/'data-manifest.json').read_bytes())
    catalog_bytes = (args.map/manifest['summary']['json']).read_bytes()
    if hashlib.sha256(catalog_bytes).hexdigest() != manifest['summary']['sha256']:
        raise ValueError('Catalog hash mismatch')
    accepted, provenance = join(json.loads(catalog_bytes), args.sources, args.presale_zip, args.as_of.isoformat())
    if not accepted:
        raise SystemExit('No verified matches. No artifact produced.')
    js = ("/* MOI presale filings and Tainan occupancy permits. Government Open Data License v1. */\n"
          "(() => {\n  'use strict';\n  const records = new Map(" +
          json.dumps(sorted(accepted.items()), ensure_ascii=False, indent=2) + ");\n  const source = " +
          json.dumps(provenance, ensure_ascii=False, indent=2) + ";\n"
          "  window.PresaleUnits = { lookup: id => records.get(String(id)) || null, source };\n})();\n")
    args.output.write_text(js, encoding='utf-8')
    print(f"{len(accepted)} accepted / {provenance['tainanFilings']} Tainan filings")
    for cid, record in sorted(accepted.items()):
        print(cid, record['caseName'], record['count'], record['permit'], record['occupancyPermit'])


if __name__ == '__main__':
    main()
