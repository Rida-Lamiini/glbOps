"""Finding a misread coordinate from the sheet's own total.

A "Calcul de contenances" prints its total (2S, twice the surface) next to the table, and the table is easy to
misread: a handwritten 2 looks like a 7, a 6 like an 8. Because 2S is a sum over every borne, one wrong digit
makes it miss by an amount that depends only on that digit's place and the neighbouring bornes. So: recompute 2S
from the bornes as read; if it misses, try every single-digit substitution of every coordinate and keep those
that reproduce the printed total. A total printed to two decimals is a strong checksum — a substitution that hits
it is almost never a coincidence.
"""

TOLERANCE = 0.02  # the sheet prints 2S with 2 decimals


def twice_area(points):
    """|2S| by the shoelace formula for [(x, y), ...] (closed implicitly)."""
    n = len(points)
    total = 0.0
    for i in range(n):
        x1, y1 = points[i]
        x2, y2 = points[(i + 1) % n]
        total += x1 * y2 - x2 * y1
    return abs(total)


def _signed_twice_area(points):
    n = len(points)
    return sum(points[i][0] * points[(i + 1) % n][1] - points[(i + 1) % n][0] * points[i][1] for i in range(n))


def find_single_digit_fixes(points, target_two_s, tolerance=TOLERANCE, max_results=8):
    """Single-digit substitutions that make 2S equal ``target_two_s``.

    ``points`` is [(x, y), ...] in table order. Returns a list of
    ``{"index", "axis", "from", "to", "digit_place", "error"}`` ordered by how well they hit the total (ties: the
    least significant digit first, since a slip there is the commonest). Empty when the bornes already match, or
    when no single digit explains the difference.
    """
    n = len(points)
    if n < 3:
        return []
    base = _signed_twice_area(points)
    sign = 1.0 if base >= 0 else -1.0
    target = sign * target_two_s  # compare in the polygon's own orientation
    if abs(abs(base) - target_two_s) <= tolerance:
        return []

    results = []
    for i in range(n):
        prev_x, prev_y = points[(i - 1) % n]
        next_x, next_y = points[(i + 1) % n]
        x0, y0 = points[i]
        # 2S is linear in each coordinate: d(2S)/dx_i = y_{i+1} - y_{i-1};  d(2S)/dy_i = x_{i-1} - x_{i+1}
        slopes = ((next_y - prev_y), (prev_x - next_x))
        for axis, value in ((0, x0), (1, y0)):
            slope = slopes[axis]
            if abs(slope) < 1e-9:
                continue
            text = f"{value:.2f}"
            neg = text.startswith("-")
            digits = text.lstrip("-")
            for pos, ch in enumerate(digits):
                if ch == ".":
                    continue
                place = len(digits.split(".")[0]) - 1 - pos if pos < digits.index(".") else -(pos - digits.index("."))
                for d in "0123456789":
                    if d == ch:
                        continue
                    new_text = digits[:pos] + d + digits[pos + 1:]
                    new_value = float(new_text) * (-1 if neg else 1)
                    new_two_s = base + slope * (new_value - value)
                    error = abs(new_two_s - target)
                    if error <= tolerance:
                        results.append({"index": i, "axis": "xy"[axis], "from": round(value, 2), "to": round(new_value, 2), "digit_place": place, "error": round(error, 4)})
    results.sort(key=lambda r: (round(r["error"], 2), r["digit_place"] if r["digit_place"] >= 0 else -r["digit_place"] + 100))
    return results[:max_results]
