"""Cross-check additional single-building, single-parcel permits against official records."""
from collections import defaultdict
import csv
import re
import unicodedata


DISTRICTS = '新營 鹽水 白河 柳營 後壁 東山 麻豆 下營 六甲 官田 大內 佳里 學甲 西港 七股 將軍 北門 新化 善化 新市 安定 山上 玉井 楠西 南化 左鎮 仁德 歸仁 關廟 龍崎 永康 東 南 北 安南 安平 中西'.split()
DISTRICTS = tuple(d + '區' for d in DISTRICTS)
LOT = re.compile(r'(?:([^\d,]+?段(?:[^\d,]+?小段)?))?(\d+)(?:-(\d+))?')
DATE = re.compile(r'\d{3}/\d{2}/\d{2}')


def split_lots(location):
    s = unicodedata.normalize('NFKC', location).replace(' ', '').replace('、', ',')
    district = next((d for d in DISTRICTS if s.startswith(d)), '')
    if not district:
        return '', [], False
    body = re.fullmatch(r'(.+),共計(\d+)筆地號', s[len(district):])
    if not body:
        return district, [], False
    lots = []
    section = None
    for token in body[1].split(','):
        m = LOT.fullmatch(token)
        if not m:
            return district, lots, False
        section = m[1] or section
        lots.append((section, f'{int(m[2]):04}{int(m[3] or 0):04}'))
    return district, lots, len(lots) == int(body[2])


def unique_permits(folder, communities):
    """Exclude any other use permit on a listed site, including shared parcels.
    Within the district, missing sections block the same lot number. Incomplete
    parcel lists block competing permits with the same date and floor count.
    """
    permits, incomplete = defaultdict(set), defaultdict(set)
    bld_permits = defaultdict(set)
    for path in sorted(folder.glob('*.csv')):
        with path.open(encoding='utf-8-sig', newline='') as stream:
            for row in csv.DictReader(stream):
                permit = row['執照號碼'].strip()
                district, lots, complete = split_lots(row['建築地點'])
                if not complete:
                    incomplete[(district, row['發照日期'], row['地上層數'])].add(permit)
                for section, key in lots:
                    permits[(district, section, key)].add(permit)
                original = unicodedata.normalize('NFKC',row['原領執照字號'].strip())
                family = re.sub(r'-\d+(?=號?$)','',original)
                bld_permits[family].add(permit)
    shared_original = {permit for values in bld_permits.values() if len(values)>1 for permit in values}
    keys = defaultdict(list)
    for c in communities:
        e = c.get('householdEvidence') or {}
        if (c['buildingCount'] != 1 or not e.get('floor') or not c['exactAddresses'] or
                re.search(r'第?[零一二三四五六七八九十\d]+(?:期|區)|[A-Z][區棟]',c['name'])):
            continue
        district, lots, complete = split_lots(e['permitLocation'])
        if not complete or len(lots) != 1 or not DATE.fullmatch(e['permitDate']):
            continue
        section, lot = lots[0]
        if not section or permits[(district,section,lot)] != {e['permitNumber']} or permits.get((district,None,lot)):
            continue
        if incomplete.get((district,e['permitDate'],str(e['floor'])),set()) - {e['permitNumber']}:
            continue
        # A common original construction licence may cover several phases.
        if e['permitNumber'] in shared_original:
            continue
        keys[(district,section,lot,e['permitDate'].replace('/',''),e['floor'])].append(c)
    return {k: values[0] for k,values in keys.items() if len(values)==1}


def normalized_plate(address, district, builder, relative):
    qualified = relative(address,district,builder['DISTRICTS'])
    full = builder['address_base'](qualified,district)
    door = builder['one_address'](qualified,district)
    if not full or not door:
        return None,None
    remaining = full[len(door):]
    part = re.fullmatch(r'([零〇一二兩三四五六七八九十\d]+)[樓層Ff](?:(?:之|-)([0-9]+))?',remaining)
    if not part:
        return (door,door) if not remaining else (None,None)
    floor=builder['chinese_integer'](part[1])
    return (door,door+str(floor)+'樓'+('之'+str(int(part[2])) if part[2] else '')) if floor else (None,None)


def screen(folder, catalog, builder, relative, sources, doors_file, baseline_groups, explicit):
    keys=unique_permits(folder,catalog)
    source_lots={(k[1],k[2]) for k in keys}
    owners={t['transactionId']:cid for group in baseline_groups for cid,rows in group.items() for t in rows}
    eligible=defaultdict(list);known=set()
    for token, main_path, land_path in sources:
        first,ambiguous={},set()
        evidence={}
        with land_path.open(encoding='utf-8-sig',newline='') as stream:
            for line,r in enumerate(csv.DictReader(stream),2):
                tid=r['編號']; fingerprint=tuple(r.values())
                if tid in first and first[tid]!=fingerprint:
                    ambiguous.add(tid)
                first[tid]=fingerprint
                if (r['土地位置'],r['地號']) in source_lots and tid not in evidence:
                    evidence[tid]=(r['土地位置'],r['地號'],line)
        for _,r in builder['csv_rows'](main_path):
            tid=r['編號']
            if tid not in evidence or tid in ambiguous or not re.fullmatch(r'土地1建物1車位\d+',r['交易筆棟數']):
                continue
            sec,lot,line=evidence[tid];district=r['鄉鎮市區']
            floors=re.fullmatch(r'(.+?)[層樓]',r['總樓層數'])
            floor_count=builder['chinese_integer'](floors[1]) if floors else None
            c=keys.get((district,sec,lot,r['建築完成年月'],floor_count))
            if not c or c['id'] in explicit:
                continue
            door,full=normalized_plate(r['土地區段位置或建物區門牌'],district,builder,relative)
            if not door: continue
            cid=c['id']
            if door in c['exactAddresses'] and owners.get(tid,cid)==cid:
                known.add(cid)
            if tid in owners or door in c['exactAddresses']:
                continue
            eligible[cid].append((tid,door,full,token,line,sec,lot,main_path.name))
    target={full for rows in eligible.values() for _,_,full,*_ in rows}
    plates=defaultdict(list)
    with doors_file.open(encoding='utf-8-sig',newline='') as stream:
        for n,r in enumerate(csv.DictReader(stream),2):
            code=r['地址-行政區域代碼']
            if not re.fullmatch(r'670\d{2}00',code):continue
            district=DISTRICTS[int(code[3:5])-1]
            addr=district+''.join(r[k] for k in ('街路段','地區','巷','弄','號'))
            _,full=normalized_plate(addr,district,builder,relative)
            if full in target:plates[full].append(n)
    reviewed=defaultdict(dict)
    for cid,rows in eligible.items():
        if cid not in known: continue
        door_ids=defaultdict(set)
        for tid,door,full,*_ in rows:
            if len(plates[full])==1:door_ids[door].add(tid)
        for tid,door,full,token,line,sec,lot,main_name in rows:
            if len(plates[full])!=1 or len(door_ids[door])<2:continue
            reviewed[main_name][tid]=(cid,{'season':token,'landRow':line,'parcel':sec+str(int(lot[:4]))+'-'+str(int(lot[4:])),
                                            'door':door,'officialPlateRow114':plates[full][0]})
    return reviewed
