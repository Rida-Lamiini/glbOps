"""Lambert Maroc (Merchich) <-> WGS84 conversions.

Clarke 1880 (IGN) ellipsoid, Lambert Conformal Conic. Morocco is split in
two zones on ANCFCC documents: Nord (EPSG:26191, false origin at Ain Sebaa;
Casablanca, Rabat, Tanger...) and Sud (EPSG:26192; Marrakech, Agadir...).
The X/Y values look alike in both, so the zone has to be known — it cannot
be guessed from the numbers. Nord is the default.
"""

from pyproj import CRS, Transformer

ZONES = ("nord", "sud")

_LAMBERT = {
    "nord": (
        "+proj=lcc +lat_1=33.3 +lat_0=33.3 +lon_0=-5.4 +k_0=0.999625769 "
        "+x_0=500000 +y_0=300000 +a=6378249.2 +b=6356515 "
        "+towgs84=31,146,47,0,0,0,0 +units=m +no_defs"
    ),
    "sud": (
        "+proj=lcc +lat_1=29.7 +lat_0=29.7 +lon_0=-5.4 +k_0=0.999615596 "
        "+x_0=500000 +y_0=300000 +a=6378249.2 +b=6356515 "
        "+towgs84=31,146,47,0,0,0,0 +units=m +no_defs"
    ),
}
LAMBERT_NORD_MAROC = _LAMBERT["nord"]

_WGS84_CRS = CRS.from_epsg(4326)

# always_xy keeps both ends in (easting/lng, northing/lat) order, so neither
# call site has to care about the authority-defined axis order of EPSG:4326.
_TO_WGS84 = {z: Transformer.from_crs(CRS.from_proj4(p), _WGS84_CRS, always_xy=True) for z, p in _LAMBERT.items()}
_TO_LAMBERT = {z: Transformer.from_crs(_WGS84_CRS, CRS.from_proj4(p), always_xy=True) for z, p in _LAMBERT.items()}


def lambert_to_wgs84(x: float, y: float, zone: str = "nord") -> tuple[float, float]:
    """Convert a Lambert (Merchich) X,Y pair of the given zone to WGS84 (lat, lng)."""
    lng, lat = _TO_WGS84[zone].transform(x, y)
    return lat, lng


def wgs84_to_lambert(lat: float, lng: float, zone: str = "nord") -> tuple[float, float]:
    """Convert a WGS84 lat/lng back to Lambert (Merchich) X,Y of the given zone."""
    x, y = _TO_LAMBERT[zone].transform(lng, lat)
    return x, y
