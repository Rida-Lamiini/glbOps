"""Manual placement of a lot on the map: a rigid move of its document coordinates.

Some old plans carry local coordinates, so the office drops the lot where it really is and, if needed, turns it
to match the ground. The document X/Y are never touched: the placement is a rotation about a pivot (a document
point, fixed when the placement is made) followed by a translation, applied only when projecting to the map.
"""

import math


def _rotate(x, y, pivot, degrees):
    t = math.radians(degrees)
    c, s = math.cos(t), math.sin(t)
    dx, dy = x - pivot[0], y - pivot[1]
    return pivot[0] + dx * c - dy * s, pivot[1] + dx * s + dy * c


def place(x, y, offset=(0.0, 0.0), rotation_deg=0.0, pivot=(0.0, 0.0)):
    """Document X/Y -> the Lambert point the lot occupies on the map."""
    if rotation_deg:
        x, y = _rotate(x, y, pivot, rotation_deg)
    return x + offset[0], y + offset[1]


def unplace(x, y, offset=(0.0, 0.0), rotation_deg=0.0, pivot=(0.0, 0.0)):
    """Inverse of :func:`place`: a Lambert point on the map -> document X/Y."""
    x, y = x - offset[0], y - offset[1]
    if rotation_deg:
        x, y = _rotate(x, y, pivot, -rotation_deg)
    return x, y
