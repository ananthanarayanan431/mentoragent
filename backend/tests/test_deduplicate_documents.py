from __future__ import annotations

from langchain_core.documents import Document

from mentoragent.rag.deduplicate_documents import DeduplicateDocuments

LONG_TEXT = " ".join(f"word{i}" for i in range(60))


def test_keeps_longer_of_near_duplicates() -> None:
    docs = [
        Document(page_content=LONG_TEXT),
        Document(page_content=LONG_TEXT + " extra tail"),
        Document(page_content=" ".join(f"other{i}" for i in range(60))),
    ]
    kept = DeduplicateDocuments(num_perm=128).remove_duplicates(docs)
    assert [d.page_content for d in kept] == [docs[1].page_content, docs[2].page_content]


def test_short_distinct_documents_are_not_duplicates() -> None:
    # Fewer words than a shingle: previously these all hashed to an empty
    # signature and were reported as identical to each other.
    docs = [Document(page_content=t) for t in ("Great talk!", "So true", "Hello")]
    assert DeduplicateDocuments(num_perm=128).remove_duplicates(docs) == docs
