"""Ids for mentors you create yourself. Pure, so it is easy to test."""

from __future__ import annotations

import re
import unicodedata
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from collections.abc import Collection

_NON_WORD = re.compile(r"[^a-z0-9]+")
_MAX_SLUG = 48


def slugify(name: str) -> str:
    """``"José O'Brien"`` -> ``"jose_o_brien"``; ``"mentor"`` when nothing is left."""
    ascii_name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    slug = _NON_WORD.sub("_", ascii_name.lower()).strip("_")[:_MAX_SLUG].strip("_")
    return slug or "mentor"


def new_mentor_id(name: str, existing_ids: Collection[str]) -> str:
    """An id from the name that no mentor has yet: ``ada``, then ``ada_2``, ``ada_3``."""
    base = slugify(name)
    candidate, suffix = base, 2
    while candidate in existing_ids:
        candidate = f"{base}_{suffix}"
        suffix += 1
    return candidate
