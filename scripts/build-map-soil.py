"""Match community reference points to Tainan Public Works' soil liquefaction layer.

Run with the official SHP ZIP and the municipal map service GeoJSON in WGS84.
Requires pyshp, shapely >= 2 and pyproj. See docs/TAINAN_MAP_V5.md.
"""
import argparse
import hashlib
import io
import json
import zipfile
from collections import Counter
from pathlib import Path

import shapefile
import shapely
from pyproj import Transformer
from shapely.geometry import shape
from shapely.ops import transform

SITE = Path(__file__).resolve().parents[1] / "tainan-map"
CLASSES = {"高潛勢": "high", "中潛勢": "medium", "低潛勢": "low", "未公開": "unpublished"}
BOUNDARY_METRES = 25


def polygons(source):
    project = Transformer.from_crs(4326, 3826, always_xy=True).transform
    with zipfile.ZipFile(source) as archive:
        parts = {Path(name).suffix.lower(): name for name in archive.namelist()}
        db = shapefile.Reader(**{ext: io.BytesIO(archive.read(parts["." + ext])) for ext in ["shp", "dbf", "shx"]})
        xmin, ymin, xmax, ymax = db.bbox
        if not (119 < xmin < xmax < 122 and 21 < ymin < ymax < 25):
            raise ValueError("Unexpected coordinate units or extent")
        result = {}
        for row in db.iterShapeRecords():
            key = CLASSES[row.record["Name"].strip()]
            if key in result:
                raise ValueError("Review changed layer schema before publishing")
            polygon = transform(project, shape(row.shape.__geo_interface__))
            if not polygon.is_valid:
                polygon = shapely.make_valid(polygon)
            result[key] = polygon
        if set(result) != set(CLASSES.values()):
            raise ValueError("Missing survey class")
        return result, project


def query_labels(areas, test_points):
    labels = [[] for _ in test_points]
    near_edge = set()
    for key, area in areas.items():
        for i in shapely.covers(area, test_points).nonzero()[0]:
            labels[i].append(key)
        edge = shapely.buffer(shapely.boundary(area), BOUNDARY_METRES)
        for i in shapely.covers(edge, test_points).nonzero()[0]:
            near_edge.add(i)
    return labels, near_edge


def build(source, reference, target, source_date, checked):
    areas, project = polygons(source)
    service = json.loads(reference.read_text(encoding='utf-8-sig'))
    codes = {"1":"high", "2":"medium", "3":"low", "4":"unpublished"}
    service_areas = {}
    for feature in service["features"]:
        code = codes[str(feature["properties"]["class"])]
        if code in service_areas:
            raise ValueError("Duplicate municipal service class, review geometry")
        geo = shape(feature["geometry"])
        xmin, ymin, xmax, ymax = geo.bounds
        if not (119 < xmin < xmax < 122 and 21 < ymin < ymax < 25):
            raise ValueError("Request GeoJSON with outSR=4326")
        service_areas[code] = shapely.make_valid(transform(project, geo))
    if set(service_areas) != set(areas):
        raise ValueError("Missing municipal service class")
    catalog_file = json.loads((SITE / "data-manifest.json").read_text())["summary"]["json"]
    catalog = json.loads((SITE / catalog_file).read_text(encoding="utf8"))
    estimates_js = (SITE / "estimated-positions.js").read_text(encoding="utf8")
    estimates = json.loads(estimates_js.split("window.ESTIMATED_POSITIONS=", 1)[1].strip().removesuffix(";"))
    points = {}
    for c in catalog["communities"]:
        lon, lat = c.get("lon"), c.get("lat")
        if not lon or not lat:
            estimate = estimates.get(c["id"], {})
            if estimate.get("tier") != "exact":
                continue
            lon, lat = estimate["lon"], estimate["lat"]
        points[(float(lon), float(lat))] = None
    points_list = list(points)
    east, north = project(*zip(*points_list))
    test_points = shapely.points(east, north)
    labels, near_edge = query_labels(areas, test_points)
    service_labels, service_edges = query_labels(service_areas, test_points)
    lookups = {}
    for i, ((lon, lat), matches) in enumerate(zip(points_list, labels)):
        if set(matches) != set(service_labels[i]):
            code = "disputed"
        elif i in near_edge or i in service_edges or len(matches) > 1:
            code = "edge"
        else:
            code = matches[0] if matches else "outside"
        key = f"{lon:.7f},{lat:.7f}"
        if key in lookups and lookups[key] != code:
            raise ValueError("Conflicting rounded locations")
        lookups[key] = code
    data = {"source": "https://data.gov.tw/dataset/122721", "sourceDate": source_date,
            "sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
            "service": "https://gis.liquid.net.tw/arcgis/rest/services/P04032/Soil_tainan/MapServer/0",
            "serviceChecked": checked, "serviceSha256": hashlib.sha256(reference.read_bytes()).hexdigest(),
            "boundaryMetres": BOUNDARY_METRES, "locations": lookups}
    target.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf8")
    print(dict(Counter(lookups.values())))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("--reference", required=True, type=Path, help="Municipal MapServer layer 0, all features, GeoJSON in EPSG:4326")
    parser.add_argument("--checked", required=True, help="Date both sources were verified (YYYY-MM-DD)")
    parser.add_argument("--source-date", required=True, help="Municipal resource update date (YYYY-MM-DD)")
    parser.add_argument("--output", type=Path, default=SITE / "environment-soil.json")
    args = parser.parse_args()
    build(args.source, args.reference, args.output, args.source_date, args.checked)
