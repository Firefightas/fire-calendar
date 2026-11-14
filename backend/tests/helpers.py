import h3

CELL = h3.latlng_to_cell(-39.3, -65.6, 7)
LAT, LON = h3.cell_to_latlng(CELL)


def square(lon=LON, lat=LAT, size=0.025):
    return {"type": "Polygon", "coordinates": [[
        [lon - size, lat - size], [lon + size, lat - size],
        [lon + size, lat + size], [lon - size, lat + size], [lon - size, lat - size],
    ]]}


def body(**kwargs):
    return {"region_id": "rio_negro", "polygon": square(), "start": "2001-01", "end": "2026-11", **kwargs}
