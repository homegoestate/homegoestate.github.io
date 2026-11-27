"""Verify additional community links from complete municipal doorplates and permits.

A link requires a named, single-building register entry, its unique use permit,
the exact construction date and storey count in the transaction, and one exact
municipal address row. For a door established through earlier lot matches, require
two distinct parcel-confirmed sales at that door. When a land attachment exists,
all transferred lots must be explicitly listed by the permit.
"""
from collections import Counter, defaultdict
import csv
import hashlib
import re
import unicodedata

from map_parcel_review import DISTRICTS, LOT, split_lots


FLOOR = re.compile(r'([一二三四五六七八九十百零〇兩\d]+)(?:樓|層|[Ff])(?:(?:之|-)(\d+))?')
CIVIC = re.compile(r'(.+?)(\d+(?:(?:之|-)\d+)?號(?:之\d+)?)(.*)')
VILLAGE = re.compile(r'^([^路街段巷弄號]{1,8}[里村])(?:\d+鄰)?(.+)$')
OTHER_PLACE = re.compile(r'^(?:台灣省|臺灣省|.{1,3}(?:市|縣).{1,4}(?:區|鄉|鎮|市))')
CITY = re.compile(r'^(?:臺|台)南(?:市|縣)')
TARGETS = {'建物', '房地(土地+建物)', '房地(土地+建物)+車位'}


def normalized(text):
    return unicodedata.normalize('NFKC', text or '').strip()


def permit_key(text):
    match = re.fullmatch(r'\(?(\d{2,3})\)?年?南工使字第?(\d+)號?', normalized(text).replace(' ', ''))
    return (int(match[1]), int(match[2])) if match else None


def permit_lots(evidence, district):
    location = normalized(evidence['permitLocation'])
    area, lots, complete = split_lots(location)
    if area == district and complete and all(sec for sec, _ in lots):
        return set(lots)
    # More recent municipal licence CSVs have a district prefix and end in 地號.
    body = CITY.sub('', location).replace('、', ',')
    if not body.startswith(district) or not body.endswith('地號'):
        return set()
    section = None
    result = set()
    for token in body[len(district):-2].split(','):
        match = LOT.fullmatch(token)
        if not match:
            return set()
        section = match[1] or section
        if not section:
            return set()
        result.add((section, f'{int(match[2]):04}{int(match[3] or 0):04}'))
    return result


def parse_tail(text, district, integer):
    # Reject lists, parcel descriptions, masked ranges, damaged characters and
    # arbitrary trailing text. Only a numerically descending hyphen in the house
    # number can denote a subnumber here; the city must use the corresponding
    # full number and the actual A row must independently agree with the permit.
    if not text or re.search(r'[\s、,;~～至到()（）?\uE000-\uF8FF]', text):
        return None
    match = CIVIC.fullmatch(text)
    if not match:
        return None
    street, house, suffix = match.groups()
    if re.search(r'[號—–-]', street):
        return None
    if '-' in house:
        pair = re.fullmatch(r'(\d+)-(\d+)號', house)
        if not pair or int(pair[1]) <= int(pair[2]):
            return None
        house = pair[1] + '之' + pair[2] + '號'
    street = re.sub(r'([一二三四五六七八九])段', lambda m: str(integer(m[1])) + '段', street)
    door = district + street + house
    floor = None
    if suffix:
        match = FLOOR.fullmatch(suffix)
        if not match:
            return None
        floor = integer(match[1])
        if not floor or floor <= 0:
            return None
        suffix = str(floor) + '樓' + ('之' + str(int(match[2])) if match[2] else '')
    return door, door + suffix, floor


def options(address, district, integer):
    text = CITY.sub('', normalized(address))
    if not district or district not in DISTRICTS:
        return []
    if text.startswith(district):
        text = text[len(district):]
    elif text.startswith(DISTRICTS) or OTHER_PLACE.match(text):
        return []
    # A locality may itself contain 里 (e.g. 佳里興). Stripping is validated
    # against the separate village and locality columns of the city doorplate.
    parts = [('', text)]
    village = VILLAGE.fullmatch(text)
    if village:
        parts.append(village.groups())
    elif re.match(r'^\d+鄰', text):
        parts.append(('', re.sub(r'^\d+鄰', '', text)))
    result = []
    for village, tail in parts:
        parsed = parse_tail(tail, district, integer)
        if parsed:
            result.append((*parsed, village))
    return result


def source_index(catalog, groups, integer):
    claimed = defaultdict(set)
    registered = defaultdict(list)
    anchored = defaultdict(list)
    permits = defaultdict(set)
    for c in catalog:
        cid, district = c['id'], c['district']
        for entry in [c, *c.get('registrationAliases', []), *c.get('officialAddressAliases', [])]:
            pk = permit_key(entry.get('buildingPermit'))
            if pk:
                permits[pk].add(cid)
            raw = re.sub('等$', '', normalized(entry.get('address')))
            for door, full, _, village in options(raw, district, integer):
                claimed[door].add(cid)
                if entry is c:
                    registered[door].append((cid, full, village))
        for door in c['exactAddresses'] + c.get('parcelMatchedAddresses', []):
            claimed[door].add(cid)
    for group in groups:
        for cid, rows in group.items():
            for t in rows:
                ref = t.get('parcelMatch')
                if ref and t['singleBuilding']:
                    anchored[(cid,ref['door'])].append(t)
    return claimed, registered, anchored, permits


def canonical_sources(manifest):
    sources = {name: info for name, info in manifest.items()
               if re.fullmatch(r'moi-(?:season-\d{3}S[1-4]|(?:history|current)-\d{8})\.csv', name)}
    # Archived versions supersede the same dated current download.
    names = [n for n in sources if not ('-current-' in n and n.replace('-current-', '-history-') in sources)]
    return [(n,sources[n]) for n in sorted(names)]


def csv_rows(path):
    with path.open(encoding='utf-8-sig', newline='') as stream:
        yield from enumerate(csv.DictReader(stream), 2)


def plate_lookup(path, target_doors, integer):
    found = defaultdict(list)
    children = defaultdict(set)
    for n, row in csv_rows(path):
        code = row['地址-行政區域代碼']
        if not re.fullmatch(r'670(?:0[1-9]|[12]\d|3[0-7])00', code):
            continue
        d = DISTRICTS[int(code[3:5])-1]
        text = ''.join(row[x] for x in ('街路段', '地區', '巷', '弄', '號'))
        parsed = parse_tail(normalized(text), d, integer)
        if parsed and parsed[0] in target_doors:
            found[parsed[1]].append((n, normalized(row['村里'])))
            if parsed[2]:
                children[parsed[0]].add(parsed[1])
    return found, children


def screen(summary, groups, builder, primary, land_sources, permits_folder, plates_file, resurvey=None):
    catalog = summary['communities']
    by_id = {c['id']: c for c in catalog}
    integer = builder['chinese_integer']
    claimed, registered, anchored, permits = source_index(catalog, groups, integer)
    fingerprints = {}
    owners = {}
    for group in groups:
        for cid, rows in group.items():
            for r in rows:
                if not r.get('doorMatch'):
                    owners[r['transactionId']] = cid
    expected_plate_sha = summary['meta']['unitDoorplateSource']['sha256']
    if hashlib.sha256(plates_file.read_bytes()).hexdigest() != expected_plate_sha:
        raise ValueError('Municipal doorplate source changed; review it before linking')
    for s in summary['meta']['householdDataset']['sourceFiles']:
        name = s['file'].split('/')[-1]
        if hashlib.sha256((permits_folder/name).read_bytes()).hexdigest() != s['sha256']:
            raise ValueError('Municipal permit source changed: ' + name)
    plates, children = plate_lookup(plates_file, set(claimed), integer)
    choices, reasons, record_ids = [], Counter(), set()
    land_sources = {p.name: (token, land) for token, p, land in land_sources}
    for filename, source in canonical_sources(builder['source_manifest']()):
        path = primary(filename)
        if hashlib.sha256(path.read_bytes()).hexdigest() != source['sha256']:
            raise ValueError('Official A source differs from review: ' + filename)
        batch = []
        for line, row in builder['csv_rows'](path):
            if row['交易標的'] not in TARGETS:
                continue
            tid, d = row['編號'], row['鄉鎮市區']
            if not tid or tid in record_ids:
                raise ValueError('Missing/repeated official A ID: ' + filename + ':' + str(line))
            record_ids.add(tid)
            if tid in owners:
                continue
            addr = row['土地區段位置或建物區門牌']
            opts = options(addr, d, integer)
            if not opts:
                reasons['行政區缺漏、門牌不完整或格式待核'] += 1
                continue
            matches = [(door, full, fl, village, cid) for door,full,fl,village in opts for cid in claimed.get(door,())]
            if not matches:
                reasons['完整門牌未見於可核對的社區門牌'] += 1
                continue
            resolved = [(door,full,fl,village,cid) for door,full,fl,village,cid in matches
                        if len(plates[full]) == 1 and (not village or plates[full][0][1] == village)]
            if not resolved:
                reasons['市府完整成交門牌未唯一相符'] += 1
                continue
            if len(resolved) != 1:
                reasons['門牌可指向多個社區或地址解析'] += 1
                continue
            door, full, floor, village, cid = resolved[0]
            c = by_id[cid]
            h = c.get('householdEvidence') or {}
            key = permit_key(c['buildingPermit'])
            if not key or permits[key] != {cid} or not h or key != permit_key(h['permitNumber']) or c['buildingCount'] != 1:
                reasons['名冊單棟與唯一使照未能確認'] += 1
                continue
            floors = FLOOR.fullmatch(normalized(row['總樓層數']))
            transfer = FLOOR.fullmatch(normalized(row['移轉層次']))
            counts = re.fullmatch(r'土地(\d+)建物1車位\d+', row['交易筆棟數'])
            if (not counts or not floor or not transfer or transfer[2] or integer(transfer[1]) != floor
                    or not floors or floors[2] or integer(floors[1]) != c['floors'] or h['floor'] != c['floors']
                    or row['建築完成年月'] != h['permitDate'].replace('/', '') or floor > h['floor']
                    or not re.search(r'華廈|華夏|住宅大樓|公寓|套房',row['建物型態'])):
                reasons['交易建物、樓層、完工日或型態證據不足'] += 1
                continue
            target = [item for item in registered.get(door,()) if item[0] == cid]
            anchors = sorted({t['transactionId'] for t in anchored[(cid,door)]
                              if t['buildingCompletionRaw'] == row['建築完成年月']})
            if not target and len(anchors) < 2:
                reasons['缺名冊原門牌或兩筆已核地號的門牌佐證'] += 1
                continue
            proof = dict(door=door, fullAddress=full, permitNumber=h['permitNumber'], registryId=c['registrySourceId'],
                         permitSourceRow=h['sourceRow'], sourceFile=filename, sourceRow=line)
            if target:
                proof['registryAddress'] = c['address']
            else:
                proof['parcelAnchorIds'] = anchors[:2]
            batch.append((tid, cid, proof, target, village, int(counts[1]), builder['digest'](row)))
        if filename in land_sources and batch:
            token, lp = land_sources[filename]
            wanted = {item[0] for item in batch}
            parcels = defaultdict(list)
            for n, line in csv_rows(lp):
                if line['編號'] in wanted:
                    parcels[line['編號']].append((line['土地位置'], line['地號'], n))
            for item in batch:
                tid, cid, proof, target, village, number, fingerprint = item
                lots = permit_lots(by_id[cid]['householdEvidence'], by_id[cid]['district'])
                rows = parcels[tid]
                changed = {}
                permit_rows = set()
                for section,lot,_ in rows:
                    if (section,lot) in lots:
                        permit_rows.add((section,lot))
                    else:
                        historical, ref = (resurvey or {}).get((by_id[cid]['district'],section,lot),(None,None))
                        if historical in lots:
                            changed[(section,lot)] = ref
                            permit_rows.add(historical)
                if not lots or not rows or len(rows) != number or len(permit_rows) != number:
                    reasons['同批土地附件與使照基地未能逐筆一致'] += 1
                    continue
                proof.update(landSource=token, landRows=[r[2] for r in rows], parcels=[s+':'+l for s,l,_ in rows])
                if changed:
                    proof['resurvey'] = {s+':'+l:ref for (s,l),ref in changed.items()}
                choices.append(item)
        else:
            choices.extend(batch)
    confirmed = defaultdict(dict)
    for tid, cid, proof, target, village, _, fingerprint in choices:
        plate = plates[proof['fullAddress']]
        if len(plate) != 1 or (village and village != plate[0][1]):
            reasons['市府完整成交門牌未唯一相符'] += 1
            continue
        if target:
            valid = [(full,plates[full][0][0]) for _,full,v in target if len(plates[full]) == 1 and (not v or v == plates[full][0][1])]
            # For a register listing only a house number, city directories may
            # enumerate the units without a separate undivided base address.
            # Require a second, distinct unit of precisely that civic number
            # as well as the sale's full address and the verified transfer lot.
            if not valid and len(target) == 1 and target[0][1] == proof['door'] and 'landRows' in proof:
                other = sorted((full,plates[full][0][0]) for full in children[proof['door']]
                               if full != proof['fullAddress'] and len(plates[full]) == 1
                               and (not target[0][2] or plates[full][0][1] == target[0][2]))
                if other:
                    valid = [other[0]]
                    proof['registryPlateIsOtherUnit'] = True
            if len(valid) != 1:
                reasons['名冊記載的完整門牌未獲市府門牌佐證'] += 1
                continue
            proof['registryPlateRow114'] = valid[0][1]
            proof['registryFullAddress'] = valid[0][0]
        proof['officialPlateRow114'] = plate[0][0]
        proof['rule'] = 'single-building-door'
        confirmed[proof['sourceFile']][tid] = (cid, proof)
        fingerprints[tid] = (fingerprint, proof['door'])
    matched = sum(len(v) for v in confirmed.values())
    if matched + sum(reasons.values()) != len(record_ids - owners.keys()):
        raise ValueError('Unlinked A audit does not reconcile')
    return confirmed, fingerprints, dict(officialRows=len(record_ids), previousLinked=len(record_ids & owners.keys()),
                                         additional=matched, remaining=sum(reasons.values()), residualReasons=dict(reasons))
