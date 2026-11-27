"""Check reviewed one-to-one parcel renumberings in complete municipal CSVs.

Download each source's CSV to --resurvey using the corresponding filename.
All non-target parcels must continue through the normal exact parcel checks.
Municipal district-to-section-code lists used to check the two old/new pairs:
https://data.tainan.gov.tw/Resource/8a1db5ab-04d8-43b9-9d5c-85e47c6f4386
https://data.tainan.gov.tw/Resource/78adb31f-4440-48c3-a609-77bee59e8751
"""
from collections import Counter
import csv
import hashlib

DATASET = 'https://data.gov.tw/dataset/161392'
BASE = 'https://data.tainan.gov.tw/Resource/'
CASES = {
    'xinhua': dict(filename='xinhua.csv', district='安定區', old=('6744','港口段','03460016'),
                   new=('6838','光榮段','03260000'), row=70235, seq='70234',
                   url=BASE+'f57606d0-c3c3-4f7b-951f-1efbe51fe895',
                   sha256='44b6682a0d4d38335d9357d19c6c99ac7b00731f5c53a34ff3152169b2f30964'),
    'jiali': dict(filename='jiali.csv', district='佳里區', old=('5003','新宅段','04530002'),
                  new=('5072','同安寮段','04570000'), row=90120, seq='90119',
                  url=BASE+'61214af6-50c7-4e3e-b10f-ae47a67b6734',
                  sha256='932fa291006e8c2a3c3a96fd29508107b93e063fea2bdd29d61e8b4ed50e8ef0'),
}


def checked(folder):
    if folder is None:
        return {}
    result = {}
    for key, source in CASES.items():
        path = folder / source['filename']
        if hashlib.sha256(path.read_bytes()).hexdigest() != source['sha256']:
            raise ValueError('Resurvey CSV has changed; review before use: ' + str(path))
        hits = Counter()
        with path.open(encoding='utf-8-sig', newline='') as stream:
            for n, r in enumerate(csv.DictReader(stream), 2):
                old = (r['舊地段代碼'],r['舊地段名'],r['舊地號'])
                new = (r['新地段代碼'],r['新地段名'],r['新地號'])
                # Require uniqueness by section code and by section name, since
                # the national A attachment supplies names and not codes.
                for desc, actual, want in [('old',old,source['old']),('new',new,source['new'])]:
                    if actual[1:] == want[1:]:
                        hits[desc+'Name'] += 1
                    if (actual[0],actual[2]) == (want[0],want[2]):
                        hits[desc+'Code'] += 1
                if n == source['row'] and r['Seq'] == source['seq'] and old == source['old'] and new == source['new']:
                    hits['exact'] += 1
        if hits != {k:1 for k in ('oldName','newName','oldCode','newCode','exact')}:
            raise ValueError('Parcel change is absent, ambiguous or not one-to-one: ' + str(source))
        result[(source['district'],*source['new'][1:])] = (source['old'][1:],key)
    return result
