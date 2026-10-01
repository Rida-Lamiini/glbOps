"""Parser tuned to the ANCFCC "Calcul de Contenances" layout.

These documents are almost always scanned image PDFs (no text layer), so
this runs against OCR output as often as it runs against a real text layer -
it has to tolerate misread characters, scrambled column spacing, and OCR'd
French diacritics, not just clean text. It never assumes a parsed value is
correct: bornes get outlier-checked on X/Y (check_borne_outliers) and
cross-checked against the sketch's radiating distances from the first borne
when those OCR cleanly (check_distances_from_reference), and the caller
always surfaces titre_foncier for manual confirmation, since it is typically
handwritten on the source document.
"""

import math
import re
import statistics
from dataclasses import dataclass, field

from ..geo.calculations import planar_distance_m


@dataclass
class ParsedHeader:
    propriete_dite: str | None = None
    nature_affaire: str | None = None
    titre_foncier: str | None = None
    lot: str | None = None
    systeme: str | None = None
    surface_calculee_m2: float | None = None
    correction_lambert_m2: float | None = None
    surface_corrigee_m2: float | None = None
    contenance_adoptee_m2: float | None = None
    date: str | None = None
    geometre: str | None = None


@dataclass
class ParsedBorne:
    name: str
    sequence: int
    x: float
    y: float
    flagged: bool = False
    flag_reason: str | None = None


@dataclass
class ParsedDocument:
    header: ParsedHeader = field(default_factory=ParsedHeader)
    bornes: list[ParsedBorne] = field(default_factory=list)


# French-format decimal: comma separator, optional space as thousands
# separator. Deliberately [ \t] and not \s - \s matches newlines, which would
# let a number bleed across a line break and concatenate with trailing digits
# from the previous row (e.g. "...P 56" + "\n300602,65" parsing as one bogus
# "56300602,65" number).
NUMBER = r"\d{1,3}(?:[ \t]?\d{3})*,\d{2,4}"
# Loose borne token: any single alnum lead char (OCR often misreads "B"),
# 3-5 digits, an optional single stray character (OCR noise - e.g. "B345t
# bis"), then optional bis/ter. The stray-char allowance means garbled
# suffixes still get captured (and then fail STRICT_BORNE_NAME and get
# flagged) instead of silently vanishing from the output entirely.
BORNE_TOKEN = r"[A-Za-z0-9]\d{3,5}[A-Za-z]?(?:bis|ter)?"
STRICT_BORNE_NAME = re.compile(r"^B\d{3,5}(?:bis|ter)?$", re.I)

# [ \t]+ between captures, not \s+ - keeps a row's X/borne/Y from matching
# across a line break.
BORNE_LINE = re.compile(rf"({NUMBER})[ \t]+({BORNE_TOKEN})[ \t]+({NUMBER})", re.I)


def parse_french_number(raw: str) -> float | None:
    cleaned = re.sub(r"[\s ]", "", raw).replace(",", ".")
    try:
        value = float(cleaned)
    except ValueError:
        return None
    return value if math.isfinite(value) else None


def _clean_value(raw: str) -> str:
    """Strips trailing OCR noise (stray table-border pipes etc.) that a greedy capture picks up."""
    return re.sub(r"[\s|_~`]+$", "", raw.strip()).strip()


def _match_first(text: str, pattern: str) -> str | None:
    match = re.search(pattern, text, re.I)
    if not match or not match.group(1):
        return None
    return _clean_value(match.group(1)) or None


def _parse_surface_value(raw: str) -> float | None:
    """Parses a "1 ha 04 a 98,5310 ca" style value (or a plain m2 number) into total m2."""
    ha = re.search(r"(\d+)\s*ha", raw, re.I)
    a = re.search(r"(\d+)\s*a\b", raw, re.I)
    # Tesseract used to emit "?" for a character it couldn't read with any
    # confidence at all - kept defensively (harmless no-op if the current OCR
    # engine never produces it) so a single uncertain trailing digit doesn't
    # lose the whole value; treated as 0, a few-cm2 imprecision that's
    # negligible next to what's gained: this value still feeds the
    # correction-Lambert cross-check below.
    ca = re.search(r"([\d\s]+(?:[.,][\d?]+)?)\s*ca", raw, re.I)
    if ha or a or ca:
        ha_val = int(ha.group(1)) if ha else 0
        a_val = int(a.group(1)) if a else 0
        ca_val = (parse_french_number(ca.group(1).strip().replace("?", "0")) or 0) if ca else 0
        return ha_val * 10000 + a_val * 100 + ca_val
    # Fall back to a plain "10 506,00" / "10506.00 m2" style number.
    plain = re.search(NUMBER, raw)
    return parse_french_number(plain.group(0)) if plain else None


def _match_surface_label(text: str, label_pattern: str) -> float | None:
    # Separator is optional and unconstrained, not required to be ":"/"=" -
    # different OCR engines misread the "=" sign as different stray characters
    # (seen for real: Tesseract dropped it silently, PaddleOCR read it as a CJK
    # glyph), or a reconstructed line may drop it entirely. _parse_surface_value
    # finds the actual ha/a/ca or plain-number pattern anywhere in the captured
    # tail regardless.
    match = re.search(rf"{label_pattern}\s*[^\n\d]*([^\n]+)", text, re.I)
    return _parse_surface_value(match.group(1)) if match else None


FRENCH_MONTHS = (
    r"janvier|f[ée]vrier|mars|avril|mai|juin|juillet|"
    r"ao[ûu]t|septembre|octobre|novembre|d[ée]cembre"
)


def parse_header(text: str) -> ParsedHeader:
    propriete_dite = _match_first(text, r"propr?i?[ée]t?[ée]\s+dite\s*:?\s*([^\n]+)")
    nature_affaire = _match_first(text, r"nature\s+de\s+l['’]?affaire\s*:?\s*([^\n]+)")
    # Titre is typically handwritten - always surfaced for manual confirmation
    # by the caller regardless of whether this matches, so a loose match here
    # is fine (better a wrong guess to correct than nothing to start from).
    # "titre" -> "tire" covers the OCR dropping the middle "t" (Tesseract) or
    # vowels swapped into "Taure" (PaddleOCR) - different engines mangle this
    # specific word differently, and it is handwritten on the source document in
    # the first place, so chasing every OCR variant of "titre" itself is a
    # losing game. More robust: anchor on "Requisition", the stable printed
    # label directly above/before it, and take whatever digit run follows -
    # regardless of what garbled word sits in between.
    titre_foncier = _match_first(
        text, r"tit?re\s*(?:foncier)?\s*(?:n[°o]?)?\s*:?\s*(\S+)"
    ) or _match_first(text, r"r[ée]qu?isition\s*:?\s*[^\n\d]*(\d{4,6})")
    lot = _match_first(text, r"\blot\s*(?:n[°o]?)?\s*:?\s*(\d+)")
    systeme = _match_first(text, r"syst[èe]me\s*:?\s*(\S+)")
    # Month/year separator seen as both a space and a hyphen
    # ("Novembre-2005") on real scans.
    date = _match_first(text, rf"((?:{FRENCH_MONTHS})[-\s]+\d{{4}})")

    # "S =" is a single generic letter, frequently misread outright (e.g. "S"
    # -> "8"), and the "=" itself gets misread into all sorts of things (seen
    # for real: PaddleOCR read it as a CJK glyph). Tolerate common confusables
    # for the letter and do not require any particular separator, anchored to
    # line start so it does not match a stray "s" anywhere else in the text.
    surface_calculee_match = re.search(r"(?:^|\n)\s*[S8$]\b\s*([^\n]+)", text, re.I)
    surface_calculee_m2 = (
        _parse_surface_value(surface_calculee_match.group(1)) if surface_calculee_match else None
    )

    # The signatory (geometre/cabinet) is often its own unlabeled line right
    # after the date, not behind a "Geometre:" label - prefer that when a date
    # was found, falling back to a label search otherwise.
    geometre = _match_first(text, r"(?:g[ée]om[èe]tre|cabinet)\s*:?\s*([^\n]+)")
    if date:
        date_index = text.lower().find(date.lower())
        if date_index >= 0:
            after = text[date_index + len(date) :].split("\n")
            next_line = next(
                (line for line in (_clean_value(raw) for raw in after) if len(line) > 3), None
            )
            if next_line:
                geometre = next_line

    surface_corrigee_m2 = _match_surface_label(text, r"SURFACE\s+CORRIG[EÉ]E")
    parsed_correction = _match_surface_label(text, r"CORRECTION\s+LAMBERT")

    # "Correction Lambert" is usually a small value (a few m2) buried in a
    # single OCR'd ha/a/ca triplet - the most fragile of the three surface
    # figures in practice (confirmed against a real scan: "00 a" misread as
    # "06 a", corrupting 7.75 m2 into 607.75 m2). S and Surface corrigee are
    # independently parsed and S + correction = surface corrigee by
    # construction, so when we have both of those and the parsed correction
    # does not reconcile, the arithmetic cross-check is more trustworthy than
    # the single fragile label match.
    correction_lambert_m2 = parsed_correction
    if surface_calculee_m2 is not None and surface_corrigee_m2 is not None:
        cross_check = round((surface_corrigee_m2 - surface_calculee_m2) * 10000) / 10000
        if parsed_correction is None or abs(parsed_correction - cross_check) > 1:
            correction_lambert_m2 = cross_check

    return ParsedHeader(
        propriete_dite=propriete_dite,
        nature_affaire=nature_affaire,
        titre_foncier=titre_foncier,
        lot=lot,
        systeme=systeme,
        surface_calculee_m2=surface_calculee_m2,
        correction_lambert_m2=correction_lambert_m2,
        surface_corrigee_m2=surface_corrigee_m2,
        contenance_adoptee_m2=_match_surface_label(text, r"CONTENANCE\s+ADOPT[EÉ]E"),
        date=date,
        geometre=geometre,
    )


# Below this, the OCR engine itself is telling us it was not sure what it read
# - a different kind of signal than the geometric checks (character-level
# uncertainty vs. downstream arithmetic consequences), so it catches different
# mistakes. Originally calibrated against a Tesseract scan of this document
# (the two rows already flagged by name-format sat at confidences 19 and 60;
# correct values were reliably in the high 70s-90s) - kept as the threshold
# after moving to PaddleOCR, which reports confidence on the same 0-100 scale
# and, on the same document, put every genuinely correct value above 90. It
# will NOT catch every wrong value on any engine - a misread digit the OCR is
# confident about (seen for real with Tesseract: "9"->"6" at 87% confidence)
# looks exactly like a correct one by this measure alone.
LOW_CONFIDENCE_THRESHOLD = 70


def _check_token_confidence(
    word_confidence: dict[str, int], tokens: list[tuple[str, str]], threshold: int
) -> str | None:
    for label, text in tokens:
        confidence = word_confidence.get(text.strip())
        if confidence is not None and confidence < threshold:
            return (
                f'Confiance OCR faible sur la valeur {label} ("{text}", '
                f"confiance {confidence}%) — vérifiez contre le document."
            )
    return None


def parse_borne_rows(text: str, word_confidence: dict[str, int] | None = None) -> list[ParsedBorne]:
    bornes: list[ParsedBorne] = []
    sequence = 0
    for match in BORNE_LINE.finditer(text):
        x = parse_french_number(match.group(1))
        y = parse_french_number(match.group(3))
        if x is None or y is None:
            continue
        name = match.group(2)
        borne = ParsedBorne(name=name, sequence=sequence, x=x, y=y)
        sequence += 1
        if not STRICT_BORNE_NAME.match(name):
            borne.flagged = True
            borne.flag_reason = f'Nom de borne suspect (lecture OCR) : "{name}"'
        elif word_confidence:
            reason = _check_token_confidence(
                word_confidence,
                [("X", match.group(1)), ("nom", match.group(2)), ("Y", match.group(3))],
                LOW_CONFIDENCE_THRESHOLD,
            )
            if reason:
                borne.flagged = True
                borne.flag_reason = reason
        bornes.append(borne)
    return bornes


OUTLIER_FACTOR = 50
MIN_SPREAD_M = 0.5  # floor so a tight cluster of legitimately-close values does not over-flag


def check_borne_outliers(bornes: list[ParsedBorne]) -> None:
    """Flags bornes whose X or Y deviates from the median by more than
    OUTLIER_FACTOR times the median absolute deviation of the others - catches
    OCR digit-insertion errors (e.g. 313952,15 misread as 3193952,15, off by
    ~10x) without needing a hard-coded valid range.
    """
    if len(bornes) < 3:
        return

    xs = [b.x for b in bornes]
    ys = [b.y for b in bornes]
    med_x = statistics.median(xs)
    med_y = statistics.median(ys)
    mad_x = max(statistics.median([abs(x - med_x) for x in xs]), MIN_SPREAD_M)
    mad_y = max(statistics.median([abs(y - med_y) for y in ys]), MIN_SPREAD_M)

    for borne in bornes:
        dev_x = abs(borne.x - med_x)
        dev_y = abs(borne.y - med_y)
        if dev_x > OUTLIER_FACTOR * mad_x:
            borne.flagged = True
            borne.flag_reason = (
                f"X = {borne.x} très éloigné de la médiane des autres bornes "
                "— vérifiez un chiffre inséré/mal lu par l'OCR."
            )
        elif dev_y > OUTLIER_FACTOR * mad_y:
            borne.flagged = True
            borne.flag_reason = (
                f"Y = {borne.y} très éloigné de la médiane des autres bornes "
                "— vérifiez un chiffre inséré/mal lu par l'OCR."
            )


# These documents sketch a fan of straight-line distances from the first borne
# to each other borne (e.g. "156.1", "165.2", "164.1" - see the diagram below
# the table), each labeled in meters along the line. Those labels are OCR gold
# when they come through: they are an independent measurement of each borne's
# position relative to the first, so a borne whose *computed* distance from the
# first borne does not match any sketch label is suspect even when its X/Y are
# individually unremarkable (no single-axis outlier, but wrong all the same -
# median/MAD on X/Y alone can miss this). How much of the diagram actually
# comes through depends heavily on the OCR engine - Tesseract recovered 2 of 6
# real sketch labels on this document's diagram (the rest lost to its rotated,
# hand-placed text), PaddleOCR recovered all 6 - so this only adds flags when
# there is enough coverage to trust the pairing (see MIN_CANDIDATE_COVERAGE); on
# a page where too little came through cleanly, it is a no-op, never a false
# accusation.
DISTANCE_CANDIDATE = re.compile(r"\b\d{1,3}[.,]\d{1,2}\b")
DISTANCE_TOLERANCE_FACTOR = 0.05  # 5%
DISTANCE_TOLERANCE_MIN_M = 2
# A diagram can contain numbers that are not "distance from the first borne" at
# all - a cross-diagonal between two other bornes, a scale marking, OCR noise -
# and with decent candidate coverage the greedy matcher will still force one of
# these onto whichever borne has no better option left, even though it is a bad
# fit in absolute terms (confirmed against a real scan: a stray "46.5" got
# assigned to a borne whose real distance was 65.0 m - 28% off - purely because
# it was the least-bad leftover). Past this diff, do not trust the pairing enough
# to assert a mismatch at all; leave that borne unassessed by this check instead.
MAX_PLAUSIBLE_PAIRING_DIFF_M = 12
MAX_PLAUSIBLE_PAIRING_FACTOR = 0.2  # 20%
# Below this fraction of recovered labels, a greedy match starts forcing bornes
# onto leftover candidates that do not actually belong to them (confirmed against
# a real scan: with only 2/8 sketch distances recovered, a genuinely correct
# borne got paired with someone else's mismatched label and false-flagged).
# Below the threshold this check sits out entirely rather than risk a wrong
# accusation.
MIN_CANDIDATE_COVERAGE = 0.6


def extract_distance_candidates(text: str) -> list[float]:
    """Numbers left over once the borne table rows themselves are stripped out."""
    without_borne_rows = BORNE_LINE.sub(" ", text)
    candidates = []
    for match in DISTANCE_CANDIDATE.finditer(without_borne_rows):
        value = parse_french_number(match.group(0))
        if value is not None and 1 < value < 2000:
            candidates.append(value)
    return candidates


def check_distances_from_reference(bornes: list[ParsedBorne], candidates: list[float]) -> None:
    """Pairs each borne's computed distance-from-the-first-borne with a candidate
    sketch distance and flags a borne whose paired match is still outside
    tolerance. Assignment is global smallest-difference-first (across every
    borne/candidate pair, not processed in table order) - with only a handful of
    candidates usually recovered, matching bornes in table order would let an
    early borne grab a candidate that actually belongs to a later one,
    misassigning the whole rest of the list. Only adds a flag to a borne that
    is not already flagged, so it complements check_borne_outliers rather than
    overriding its (more specific) reason.
    """
    if len(bornes) < 2 or not candidates:
        return

    reference = bornes[0]
    # A borne already flagged (e.g. by check_borne_outliers) has a
    # known-unreliable computed distance - letting it compete for a candidate
    # match can steal the right pairing away from an otherwise-clean borne and
    # produce a false positive on *that* one instead.
    others = [
        (borne, planar_distance_m((reference.x, reference.y), (borne.x, borne.y)))
        for borne in bornes[1:]
        if not borne.flagged
    ]

    if not others or len(candidates) < len(others) * MIN_CANDIDATE_COVERAGE:
        return

    pairs = [
        (abs(computed - candidate), other_index, candidate_index)
        for other_index, (_, computed) in enumerate(others)
        for candidate_index, candidate in enumerate(candidates)
    ]
    pairs.sort(key=lambda p: p[0])

    used_other: set[int] = set()
    used_candidate: set[int] = set()
    for diff, other_index, candidate_index in pairs:
        if other_index in used_other or candidate_index in used_candidate:
            continue

        borne, computed = others[other_index]
        matched = candidates[candidate_index]

        # Not a trustworthy pairing either way - leave both borne and candidate
        # free rather than consuming them, so each still gets a chance to pair
        # with something else below.
        plausibility_cap = max(MAX_PLAUSIBLE_PAIRING_DIFF_M, matched * MAX_PLAUSIBLE_PAIRING_FACTOR)
        if diff > plausibility_cap:
            continue

        used_other.add(other_index)
        used_candidate.add(candidate_index)

        tolerance = max(DISTANCE_TOLERANCE_MIN_M, matched * DISTANCE_TOLERANCE_FACTOR)
        if diff > tolerance and not borne.flagged:
            borne.flagged = True
            borne.flag_reason = (
                f"Distance depuis {reference.name} ({computed:.1f} m calculés) ne "
                f"correspond à aucune cote du croquis (plus proche : {matched} m, "
                f"écart {diff:.1f} m) — vérifiez les coordonnées."
            )


def parse_calcul_de_contenances(
    text: str, word_confidence: dict[str, int] | None = None
) -> ParsedDocument:
    """
    :param word_confidence: OCR engine's per-line/word confidence (0-100), keyed
        by exact text - only available for the OCR path, not the PDF text-layer
        path (which has no comparable per-token confidence signal).
    """
    header = parse_header(text)
    bornes = parse_borne_rows(text, word_confidence)
    check_borne_outliers(bornes)
    check_distances_from_reference(bornes, extract_distance_candidates(text))
    return ParsedDocument(header=header, bornes=bornes)
