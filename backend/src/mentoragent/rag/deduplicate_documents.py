from __future__ import annotations

import re
from typing import TYPE_CHECKING

from datasketch import MinHash, MinHashLSH
from loguru import logger

from mentoragent.core.config import settings

if TYPE_CHECKING:
    from langchain_core.documents import Document

SHINGLE_SIZE = 3
_WORD_RE = re.compile(r"\w+")


class DeduplicateDocuments:
    """Remove near-duplicate documents using MinHash + LSH.

    Args:
        num_perm: MinHash permutations. Higher is more accurate but slower.
            Defaults to half of ``RAG_CHUNK_SIZE``.
    """

    def __init__(self, num_perm: int | None = None) -> None:
        self.num_perm = num_perm or max(int(settings.rag.CHUNK_SIZE * 0.5), 16)

    def remove_duplicates(
        self, documents: list[Document], threshold: float = 0.7
    ) -> list[Document]:
        """Remove documents whose content is near-identical to another's.

        Of each duplicate pair, the document with more content is kept.

        Args:
            documents: Documents to deduplicate.
            threshold: Jaccard similarity (0.0-1.0) at or above which two
                documents count as duplicates.

        Returns:
            The documents with duplicates removed, in their original order.
        """
        if not documents:
            return []

        duplicates = self.find_duplicates(documents, threshold)

        indices_to_remove: set[int] = set()
        for i, j, _ in duplicates:
            longer_i = len(documents[i].page_content) >= len(documents[j].page_content)
            indices_to_remove.add(j if longer_i else i)

        logger.info(
            "Removing {} near-duplicate documents out of {}", len(indices_to_remove), len(documents)
        )
        return [doc for i, doc in enumerate(documents) if i not in indices_to_remove]

    def find_duplicates(
        self, documents: list[Document], threshold: float = 0.7
    ) -> list[tuple[int, int, float]]:
        """Find near-duplicate document pairs.

        Builds a MinHash signature from each document's word 3-grams and uses
        Locality Sensitive Hashing to find candidate pairs efficiently.
        Documents shorter than one shingle have no signature and are never
        reported as duplicates.

        Args:
            documents: Documents to compare.
            threshold: Jaccard similarity (0.0-1.0) at or above which a pair
                is reported.

        Returns:
            ``(index_a, index_b, similarity)`` tuples with ``index_a < index_b``.
        """
        minhashes = [self._minhash(doc.page_content) for doc in documents]

        lsh = MinHashLSH(threshold=threshold, num_perm=self.num_perm)
        for i, minhash in enumerate(minhashes):
            if minhash is not None:
                lsh.insert(i, minhash)

        duplicates: dict[tuple[int, int], float] = {}
        for i, minhash in enumerate(minhashes):
            if minhash is None:
                continue
            for j in lsh.query(minhash):
                pair = (min(i, j), max(i, j))
                if i == j or pair in duplicates:
                    continue
                similarity = minhash.jaccard(minhashes[j])
                if similarity >= threshold:
                    duplicates[pair] = similarity

        return [(i, j, similarity) for (i, j), similarity in duplicates.items()]

    def _minhash(self, text: str) -> MinHash | None:
        words = _WORD_RE.findall(text.lower())
        if len(words) < SHINGLE_SIZE:
            return None

        minhash = MinHash(num_perm=self.num_perm)
        for i in range(len(words) - SHINGLE_SIZE + 1):
            minhash.update(" ".join(words[i : i + SHINGLE_SIZE]).encode("utf-8"))
        return minhash
