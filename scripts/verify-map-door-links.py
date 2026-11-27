"""Validate the reviewed community door links against original official evidence."""
import argparse
from collections import Counter, defaultdict
import csv
import gzip
import hashlib
import json
from pathlib import Path
import re
import runpy

import map_door_review as doors
import map_resurvey_review
from map_parcel_review import DISTRICTS


def load(path):
    return json.loads(path.read_bytes())


def shard(public, entry):
    raw = (public/entry['json']).read_bytes()
    packed = (public/entry['gzip']).read_bytes()
    assert len(raw) == entry['bytes'] and len(packed) == entry['gzipBytes']
    assert hashlib.sha256(raw).hexdigest() == entry['sha256']
    assert hashlib.sha256(packed).hexdigest() == entry['gzipSha256'] and gzip.decompress(packed) == raw
    return json.loads(raw)


def read_at(path, required):
    with path.open(encoding='utf-8-sig', newline='') as stream:
        return {i:r for i,r in enumerate(csv.DictReader(stream),2) if i in required}


def main(args):
    public = args.map
    old, current = load(args.prior), load(public/'data-manifest.json')
    old_catalog = shard(args.prior_root,old['summary'])
    new_catalog = shard(public,current['summary'])
    by_id = {c['id']:c for c in new_catalog['communities']}
    previous = {c['id']:c for c in old_catalog['communities']}
    assert by_id.keys() == previous.keys()
    builder = runpy.run_path(str(args.batch/'build_catalog.py'))
    integer = builder['chinese_integer']
    resurvey = map_resurvey_review.checked(args.resurvey)
    for ambiguous in ('安定區管寮2-28號二樓', '安定區管寮28至36號二樓',
                      '安定區管寮28號、36號', '高雄市前鎮區中山路28號二樓'):
        assert not doors.options(ambiguous, '安定區', integer)
    alternatives = doors.options('佳里區佳里興112號二樓', '佳里區', integer)
    assert ('佳里區佳里興112號', '佳里區佳里興112號2樓', 2, '') in alternatives
    assert ('佳里區興112號', '佳里區興112號2樓', 2, '佳里') in alternatives
    register = {r['sourceId']:r for r in load(args.batch/'registry/current-register.json')}
    checks, evidence, changed, unique = [], defaultdict(set), set(), set()
    method = Counter()
    verified_old = old_excluded = fresh_eligible = 0
    for district, entry in current['districts'].items():
        before = shard(args.prior_root,old['districts'][district])
        after = shard(public,entry)
        assert before.keys() == after.keys()
        for cid, rows in after.items():
            existing = {r['transactionId']:r for r in before[cid]}
            added = []
            for t in rows:
                tid = t['transactionId']
                assert tid and tid not in unique
                unique.add(tid)
                if tid in existing:
                    assert t == existing.pop(tid), ('old transaction changed', tid)
                    verified_old += 1
                    old_excluded += not t['eligible']
                    continue
                added.append(tid)
                p = t['doorMatch']
                assert p['rule'] == 'single-building-door'
                c = by_id[cid]
                reg = register[p['registryId']]
                permit_file,permit_line = p['permitSourceRow'].split('/')[-1].split(':')
                original = args.batch/'raw'/p['sourceFile']
                if not original.is_file():
                    original = builder['INPUT_SALES_ROOT']/p['sourceFile']
                assert any(s.endswith('/'+p['sourceFile']+':'+str(p['sourceRow'])) for s in t['sourceRows'])
                evidence[original].add(p['sourceRow'])
                evidence[args.permits/permit_file].add(int(permit_line))
                evidence[args.doors].add(p['officialPlateRow114'])
                assert t['singleBuilding'] and c['buildingCount'] == 1 and reg['buildingCount'] == '1'
                assert doors.permit_key(p['permitNumber']) == doors.permit_key(reg['buildingPermit'])
                if 'registryAddress' in p:
                    assert reg['address'] == c['address'] == p['registryAddress']
                    evidence[args.doors].add(p['registryPlateRow114'])
                    method['registry'] += 1
                else:
                    anchors = [r for r in before[cid] if r['transactionId'] in p['parcelAnchorIds']]
                    assert len(anchors) == len(set(p['parcelAnchorIds'])) == 2
                    for anchor in anchors:
                        assert anchor['parcelMatch']['door'] == p['door'] and anchor['singleBuilding']
                        assert anchor['buildingCompletionRaw'] == t['buildingCompletionRaw']
                    method['previous-parcel-anchors'] += 1
                land = None
                if 'landSource' in p:
                    token = p['landSource']
                    land = (args.archive_land if token.startswith('moi-history-') else args.land)/(token+('-land' if token.startswith('moi-') else '')+'.csv')
                    evidence[land].update(p['landRows'])
                    method['with-land-rows'] += 1
                    if p.get('resurvey'):
                        method['with-resurvey-rows'] += 1
                checks.append((cid,t,original,args.permits/permit_file,int(permit_line),land))
                fresh_eligible += t['eligible']
            assert not existing
            if added:
                changed.add(cid)
                for category, periods in by_id[cid]['statsByCategory'].items():
                    for period, stats in periods.items():
                        actual = builder['stats'](builder['category_rows'](rows,category),period)
                        for key in ('count','eligibleCount','latestDate','median','mean','sampleMean','distinctTransactedUnitCount'):
                            assert actual[key] == stats[key],(cid, key)
            else:
                assert by_id[cid] == previous[cid],('unaffected community changed',cid)
    assert verified_old == old['transactionCount']
    assert len(unique) == current['transactionCount'] == verified_old + len(checks)
    assert new_catalog['meta']['coverage']['matchedTransactionCount'] == len(unique)
    originals = {path:read_at(path, lines) for path,lines in evidence.items()}
    district_codes = {f'670{n:02}00':d for n,d in enumerate(DISTRICTS,1)}
    for cid, t, raw_file, permit_file, permit_line, land in checks:
        c = by_id[cid]
        p = t['doorMatch']
        sale = originals[raw_file][p['sourceRow']]
        permit = originals[permit_file][permit_line]
        assert p['permitNumber'] == permit['執照號碼']
        assert sale['編號'] == t['transactionId'] and sale['土地位置建物門牌'] == t['address']
        completion = sale.get('建築完成年月', sale.get('建築完成日期'))
        assert completion == permit['發照日期'].replace('/','') == t['buildingCompletionRaw']
        assert sale['鄉鎮市區'] == c['district'] and int(permit['地上層數']) == c['floors']
        assert doors.FLOOR.fullmatch(doors.normalized(sale['總樓層數']))
        assert integer(doors.FLOOR.fullmatch(doors.normalized(sale['總樓層數']))[1]) == c['floors']
        assert re.fullmatch(r'土地\d+建物1車位\d+',sale['交易筆棟數'])
        for line, full, address in [(p['officialPlateRow114'],p['fullAddress'],t['address'])] + (
                [(p['registryPlateRow114'],p['registryFullAddress'],p['registryAddress'])] if 'registryAddress' in p else []):
            entry = originals[args.doors][line]
            d = district_codes[entry['地址-行政區域代碼']]
            actual = doors.parse_tail(doors.normalized(''.join(entry[k] for k in ('街路段','地區','巷','弄','號'))),d,integer)
            assert d == c['district'] and actual[:2] == (p['door'],full)
            expected = full
            if p.get('registryPlateIsOtherUnit') and line == p['registryPlateRow114']:
                assert p['landRows'] and full != p['fullAddress'] and line != p['officialPlateRow114']
                expected = p['door']
            assert any(opt[1] == expected and (not opt[3] or opt[3] == entry['村里']) for opt in doors.options(re.sub('等$','',address),d,integer))
        if land:
            lots = doors.permit_lots(c['householdEvidence'],c['district'])
            for number, key in zip(p['landRows'],p['parcels'],strict=True):
                row = originals[land][number]
                parcel = (row['土地位置'],row['地號'])
                if key in p.get('resurvey',{}):
                    original, source = resurvey[(c['district'],*parcel)]
                    assert source == p['resurvey'][key]
                    receipt = new_catalog['meta']['parcelResurveySources'][source]
                    assert receipt['new'][1:] == list(parcel) and receipt['old'][1:] == list(original)
                    assert receipt['url'] == map_resurvey_review.CASES[source]['url']
                    assert receipt['sha256'] == map_resurvey_review.CASES[source]['sha256']
                    parcel = original
                assert row['編號'] == t['transactionId'] and parcel in lots
                assert key == row['土地位置'] + ':' + row['地號']
    summary = dict(previous=verified_old,previousExcluded=old_excluded, additional=len(checks),
                   additionalComparable=fresh_eligible,additionalExcluded=len(checks)-fresh_eligible,
                   affectedCommunities=len(changed), newlyLinkedCommunities=sum(not previous[cid]['allUseHistoricalCount'] for cid in changed),
                   total=len(unique),methods=dict(method))
    print(json.dumps(summary,ensure_ascii=False))
    if args.output:
        args.output.write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf8')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('prior','prior-root','map','batch','doors','permits','land','archive-land'):
        parser.add_argument('--'+name,type=Path,required=True)
    parser.add_argument('--output',type=Path)
    parser.add_argument('--resurvey',type=Path)
    main(parser.parse_args())
