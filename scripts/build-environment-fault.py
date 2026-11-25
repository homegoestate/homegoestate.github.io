"""Regenerate the embedded Tainan active-fault sensitivity polygons.

Requires Python, pyproj, pyshp and libarchive's bsdtar (Windows tar.exe).
An optional argument names a directory containing the four original archives.
Re-check the authority's SHP index for new notices before updating the snapshot.
"""

import hashlib
import io
import json
import subprocess
import sys
import tempfile
import urllib.request
from pathlib import Path

import shapefile
from pyproj import Transformer


# The SHP index identifies all four coordinate systems as TWD97 TM2, meridian 121.
# The Liujia archive has no .prj. Its CRS is given in that index.
INDEX = "https://www.gsmma.gov.tw/nss/p/H001d2"
ORIGIN = "https://www.gsmma.gov.tw/uploads/"
SOURCES = [
    ("F0006", "新化斷層", "2015-12-04", "1695430864879YJQhLBTT.rar",
     "fb6631320c4c2cd71c646db46de0842dc5d196c90787a26346c7ed3eef8ac2e5"),
    ("F0017", "六甲斷層", "2017-12-15", "1695431942748BWW8Lkt9.rar",
     "4a6a3dbfd6313abcd1511d4fc9cf705ee0cce04629cdc72552e6efe0ed9d2e07"),
    ("F0025", "口宵里斷層", "2024-12-17", "1734410796802pN3IeHp2.rar",
     "6a0d0fc76524218c513c0d8e1413c6498f0a950633d631309df1e8ba2080292a"),
    ("F0016", "木屐寮斷層", "2026-01-30", "1769675916029CTsrvtgR.zip",
     "7e147e9978f9e3d6004755a1321ab95dcc52dd1a720f276489d7e24789427a8f"),
]

TRANSFORM = Transformer.from_crs(3826, 4326, always_xy=True)
TARGET = Path(__file__).resolve().parents[1] / "tainan-map" / "environment-fault.js"
START = "  // BEGIN official polygon data\n"
END = "  // END official polygon data"


def zone_data(entry, directory):
    code, name, date, filename, expected_hash = entry
    archive = directory / filename
    if not archive.exists():
        with urllib.request.urlopen(ORIGIN + filename, timeout=45) as response:
            archive.write_bytes(response.read())
    if hashlib.sha256(archive.read_bytes()).hexdigest() != expected_hash:
        raise ValueError(f"{code} archive changed. Review the new source before importing.")
    raw_shp = subprocess.check_output(["tar", "-xOf", str(archive), "*.shp"])
    with shapefile.Reader(shp=io.BytesIO(raw_shp)) as reader:
        shapes = list(reader.iterShapes())
    # Each pinned source is one polygon with one closed outer ring.
    # Changed topology must receive an explicit review and must preserve holes.
    if (len(shapes) != 1 or shapes[0].shapeType not in (5, 15)
            or list(shapes[0].parts) != [0]):
        raise ValueError(f"{code} has unexpected geometry")
    ring = []
    for point in shapes[0].points:
        lon, lat = TRANSFORM.transform(*point[:2])
        if not (120.0 < lon < 120.7 and 22.8 < lat < 23.5):
            raise ValueError(f"{code} projected outside expected Tainan bounds")
        ring.append([round(lon, 6), round(lat, 6)])
    if ring[0] != ring[-1] or len(ring) < 4:
        raise ValueError(f"{code} is not a closed polygon")
    return {"code": code, "name": name, "date": date, "ring": ring}


def build(directory):
    records = [zone_data(entry, directory) for entry in SOURCES]
    rows = ",\n".join("    " + json.dumps(row, ensure_ascii=False, separators=(",", ":"))
                      for row in records)
    new_section = "  const zones = [\n" + rows + "\n  ];\n"
    template = TARGET.read_text(encoding="utf-8")
    if template.count(START) != 1 or template.count(END) != 1:
        raise ValueError("Missing polygon data markers")
    left, right = template.split(START)
    _, right = right.split(END)
    TARGET.write_text(left + START + new_section + END + right, encoding="utf-8", newline="\n")
    print(f"{len(records)} source polygons from {INDEX}, {sum(len(z['ring']) for z in records)} vertices")


if __name__ == "__main__":
    if len(sys.argv) > 1:
        build(Path(sys.argv[1]))
    else:
        with tempfile.TemporaryDirectory() as scratch:
            build(Path(scratch))
