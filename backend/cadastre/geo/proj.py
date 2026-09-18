"""Lambert Nord Maroc (Merchich, EPSG:26191) <-> WGS84 conversions.

Clarke 1880 (IGN) ellipsoid, Lambert Conformal Conic, false origin at Ain
Sebaa. This is the projection used on ANCFCC "Calcul de Contenances"
documents for lots north of the Merchich datum's southern boundary.
"""

from pyproj import CRS, Transformer

LAMBERT_NORD_MAROC = (
    "+proj=lcc +lat_1=33.3 +lat_0=33.3 +lon_0=-5.4 +k_0=0.999625769 "
    "+x_0=500000 +y_0=300000 +a=6378249.2 +b=6356515 "
    "+towgs84=31,146,47,0,0,0,0 +units=m +no_defs"
)

_LAMBERT_CRS = CRS.from_proj4(LAMBERT_NORD_MAROC)
_WGS84_CRS = CRS.from_epsg(4326)

# always_xy keeps both ends in (easting/lng, northing/lat) order, so neither
# call site has to care about the authority-defined axis order of EPSG:4326.
_TO_WGS84 = Transformer.from_crs(_LAMBERT_CRS, _WGS84_CRS, always_xy=True)
_TO_LAMBERT = Transformer.from_crs(_WGS84_CRS, _LAMBERT_CRS, always_xy=True)


def lambert_to_wgs84(x: float, y: float) -> tuple[float, float]:
    """Convert a Lambert Nord Maroc (Merchich) X,Y pair to WGS84 (lat, lng)."""
    lng, lat = _TO_WGS84.transform(x, y)
    return lat, lng


def wgs84_to_lambert(lat: float, lng: float) -> tuple[float, float]:
    """Convert a WGS84 lat/lng back to Lambert Nord Maroc (Merchich) X,Y."""
    x, y = _TO_LAMBERT.transform(lng, lat)
    return x, y
