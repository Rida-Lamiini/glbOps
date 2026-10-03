"""The "opération" of a lot: the shortcut(s) of what the survey was done for (MT, MEC, COPRO…).

Stored on ``Lot.operation`` as comma-separated upper-case shortcuts ("MEC,COPRO"), written for
humans as "MEC + COPRO". A lot can carry several (one file "MEC et COPRO").
"""

import re

KNOWN = ("MT", "MEC", "COPRO")  # shortcuts recognised in file names; other shortcuts can still be typed
_TOKEN = re.compile(r"^[A-Z0-9-]{1,12}$")
_SPLIT = re.compile(r"\s*(?:[,;+/&]|\bet\b|\band\b)\s*|\s+", re.IGNORECASE)
_STOP = {"ET", "AND", ""}


def normalize(text) -> str:
    """"mec et copro", "MEC + COPRO", "MEC,COPRO" -> "MEC,COPRO" (upper-cased, de-duplicated, order kept)."""
    seen = []
    for raw in _SPLIT.split(str(text or "").strip()):
        token = raw.strip().upper()
        if token in _STOP or not _TOKEN.match(token) or token in seen:
            continue
        seen.append(token)
    return ",".join(seen)


def display(operation: str) -> str:
    return " + ".join(t for t in (operation or "").split(",") if t)


def from_filename(name: str) -> str:
    """"127_TF5608_64 MEC _COPRO.pdf" -> "MEC,COPRO". Only the known shortcuts are read from a file name."""
    stem = re.sub(r"\.[A-Za-z0-9]{2,4}$", "", str(name or "").replace("\\", "/").rsplit("/", 1)[-1])
    tokens = [t.upper() for t in re.split(r"[\s_()\-.]+", stem)]
    found = []
    for token in tokens:
        if token in KNOWN and token not in found:
            found.append(token)
    return ",".join(found)
