"""Rebuild Tainan's WRA subsidence contours and GNSS station (Python + pyproj).

Use an optional directory holding the original files, or download the reviewed
release. For a newer release, verify periods and Tainan coverage in the WRA
catalogues first (https://data.gov.tw/dataset/58361 and /58362). County summary
figures, contours, station heights and regulatory boundaries use different units
or represent different observations. They must not be substituted for one another.
"""

import hashlib
import json
import sys
import tempfile
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

from pyproj import Transformer


TARGET = Path(__file__).resolve().parents[1] / "tainan-map" / "ground-subsidence.js"
BEGIN = "  // BEGIN official WRA data\n"
END = "  // END official WRA data"
GIC = "https://gic.wra.gov.tw/gis/gic/API/Google/DownLoad.aspx?fname="
DATA = "https://opendata.wra.gov.tw/api/v2/"
STATION = "A130600LSJHES"
SOURCES = {
    "CUMTN.kml": (GIC + "CUMTN&filetype=KML",
                  "7788c4e48c5e6330ff42ab6f86c3a906a5a9225a1f9a394a6991859d421ac5d4"),
    "AVG2023.kml": (GIC + "AVG2023&filetype=KML",
                    "61a8381afece9a85af70502ea79c52a86fac3fb1806942bdcff0deba23708f33"),
    "AVG2024.kml": (GIC + "AVG2024&filetype=KML",
                    "f8d4c7dcdc30e2e060ad3b6893abe7989763ab2bcbf2a11aa6314efb2fa82123"),
    "AVG2025.kml": (GIC + "AVG2025&filetype=KML",
                    "60cacd55871dba84d51ad204f95462614d4f6c5e24e987fc6a724e2dadc15e5a"),
    "gnss-stations.json": (DATA + "ad87c3f0-4594-4b5b-859a-beaa6016464c?format=JSON&sort=_importdate+asc",
                           "da6f8b8d536a26622e5d88a8a381a1d3f5e7bb1e053d89ea1b09ba3d5f641699"),
    "gnss-JHES.json": (DATA + "d98a5c3b-7e65-4aa2-996c-97215c6074bf?format=JSON"
                       "&filters=observatoryidentifier,eq,A130600LSJHES&sort=observationttime+desc&size=400",
                       "b5a792d87c5fb046f41bc88ac70bd329eb66f30364a8129530061a99fa2807d9"),
}


def read_source(directory, key):
    url, sha256 = SOURCES[key]
    file = directory / ("wra-" + key)
    if not file.exists():
        with urllib.request.urlopen(url, timeout=45) as response:
            file.write_bytes(response.read())
    data = file.read_bytes()
    if hashlib.sha256(data).hexdigest() != sha256:
        raise ValueError(f"{key} has changed. Review the official file and dates before rebuilding.")
    return data


def extract_contours(data, kind, years=None):
    rows = []
    for placemark in ET.fromstring(data).findall(".//{*}Placemark"):
        fields = {tag.get("name"): tag.text for tag in placemark.findall(".//{*}SimpleData")}
        if kind == "rate" and fields["區域"] != "臺南市":
            continue
        if (fields["年份(起"], fields["年份(迄"]) != years:
            raise ValueError("Review the new Tainan measurement period")
        value = float(fields["ELEV(cm)"])
        if value > 0 or not value.is_integer():
            raise ValueError("Review unit and direction before changing the contour legend")
        for part, segment in enumerate(placemark.findall(".//{*}LineString/{*}coordinates")):
            coords = []
            for point in segment.text.split():
                lon, lat = map(float, point.split(",")[:2])
                if not (119.98 < lon < 120.68 and 22.84 < lat < 23.45):
                    raise ValueError("Contour outside the expected Tainan survey bounds")
                coords.append([round(lon, 6), round(lat, 6)])
            if len(coords) < 2:
                raise ValueError("Incomplete contour")
            rows.append([kind, f"{kind}-{fields['ID']}-{part}", int(value), coords])
    return rows


def read_station(stations, observations):
    # Older WRA county codes differ between the station table and measurements.
    # Join on the permanent station identifier and check its actual address.
    matches = [s for s in json.loads(stations) if s["observatoryidentifier"] == STATION]
    if len(matches) != 1 or "臺南市北門區" not in matches[0]["address"]:
        raise ValueError("Unexpected station metadata")
    station = matches[0]
    transform = Transformer.from_crs(3826, 4326, always_xy=True)
    lon, lat = transform.transform(float(station["x_3826"]), float(station["y_3826"]))
    # The supplied geographic coordinates only have two decimal places.
    if (round(lon, 2), round(lat, 2)) != (float(station["longitude_4326"]), float(station["latitude_4326"])):
        raise ValueError("Projected station coordinates conflict with the geographic coordinates")
    rows = json.loads(observations)
    if not rows or any(r["observatoryidentifier"] != STATION or r["countycode"] != "67000" for r in rows):
        raise ValueError("Wrong station in the official observations")
    latest = max(rows, key=lambda r: r["observationttime"])
    return {"id": STATION, "name": station["observatoryname"], "coordinates": [round(lon, 6), round(lat, 6)],
            "date": latest["observationttime"][:10], "height": float(latest["height"])}


def build(directory):
    lines = extract_contours(read_source(directory, "CUMTN.kml"), "cumulative", ("2001", "2023"))
    rates = extract_contours(read_source(directory, "AVG2023.kml"), "rate", ("2019", "2023"))
    # The next two national releases contain other survey regions, not a local zero.
    for year in (2024, 2025):
        extract_contours(read_source(directory, f"AVG{year}.kml"), "rate")
    if len(lines) != 32 or len(rates) != 12:
        raise ValueError("Unexpected number of line parts")
    station = read_station(read_source(directory, "gnss-stations.json"), read_source(directory, "gnss-JHES.json"))
    template = TARGET.read_text(encoding="utf-8")
    if template.count(BEGIN) != 1 or template.count(END) != 1:
        raise ValueError("Could not locate the embedded data")
    left, right = template.split(BEGIN)
    _, right = right.split(END)
    rows = [json.dumps(r, ensure_ascii=False, separators=(",", ":")) for r in lines + rates]
    body = "  const contourRows = [\n    " + ",\n    ".join(rows) + "\n  ];\n"
    body += "  const stationRow = " + json.dumps(station, ensure_ascii=False, separators=(",", ":")) + ";\n"
    TARGET.write_text(left + BEGIN + body + END + right, encoding="utf-8", newline="\n")
    print(f"{len(lines)} cumulative and {len(rates)} rate contours; station observation {station['date']}.")


if __name__ == "__main__":
    if len(sys.argv) > 1:
        build(Path(sys.argv[1]))
    else:
        with tempfile.TemporaryDirectory() as scratch:
            build(Path(scratch))
