from __future__ import annotations

from types import SimpleNamespace
from typing import TYPE_CHECKING, Any
from unittest.mock import MagicMock, patch

from langchain_core.documents import Document

from mentoragent.rag.extractors import (
    Source,
    extract_pdf_contents,
    extract_twitter_tweets,
    extract_youtube_transcripts,
)
from mentoragent.rag.extractors.extract_twitter_tweets import get_all_tweets

if TYPE_CHECKING:
    from mentoragent.models.mentor_extract import MentorExtract

PDF_LOADER = "mentoragent.rag.extractors.extract_pdf_contents.PyPDFLoader"
YT_LOADER = "mentoragent.rag.extractors.extract_youtube_transcripts.YoutubeLoader"


def _loader(pages: list[str]) -> MagicMock:
    return MagicMock(load=MagicMock(return_value=[Document(page_content=p) for p in pages]))


def test_pdf_loads_every_pdf(mentor_extract: MentorExtract) -> None:
    loaders = {"a.pdf": _loader(["a1", "a2"]), "b.pdf": _loader(["b1"])}
    with patch(PDF_LOADER, side_effect=lambda url, **_: loaders[url]):
        docs = extract_pdf_contents(mentor_extract)

    assert [d.page_content for d in docs] == ["a1", "a2", "b1"]
    assert [d.metadata["source_url"] for d in docs] == ["a.pdf", "a.pdf", "b.pdf"]
    assert docs[0].metadata == {
        "mentor_id": "ada",
        "mentor_name": "Ada Lovelace",
        "source": Source.PDF,
        "source_url": "a.pdf",
    }


def test_pdf_skips_broken_pdf_and_handles_none(mentor_extract: MentorExtract) -> None:
    def loader(url: str, **_: Any) -> MagicMock:
        if url == "a.pdf":
            raise OSError("404")
        return _loader(["b1"])

    with patch(PDF_LOADER, side_effect=loader):
        assert [d.page_content for d in extract_pdf_contents(mentor_extract)] == ["b1"]

    assert extract_pdf_contents(mentor_extract.model_copy(update={"pdfs": []})) == []


def test_youtube_failure_keeps_other_transcripts(mentor_extract: MentorExtract) -> None:
    def from_url(url: str, **_: Any) -> MagicMock:
        if url.endswith("one"):
            raise RuntimeError("transcripts disabled")
        return _loader(["transcript two"])

    with patch(YT_LOADER) as loader_cls:
        loader_cls.from_youtube_url.side_effect = from_url
        docs = extract_youtube_transcripts(mentor_extract)

    assert [d.metadata["source_url"] for d in docs] == ["https://youtu.be/two"]


def _page(tweets: list[str], next_token: str | None) -> SimpleNamespace:
    meta = {"next_token": next_token} if next_token else {}
    data = [{"text": t, "tweet_url": f"https://x.test/{t}"} for t in tweets]
    return SimpleNamespace(output=SimpleNamespace(error=None, value={"data": data, "meta": meta}))


def test_twitter_follows_pagination_tokens() -> None:
    client = MagicMock()
    client.tools.execute.side_effect = [_page(["t1", "t2"], "p2"), _page(["t3"], None)]

    tweets = get_all_tweets(client, username="ada", user_id="u", max_tweets=10)

    assert [t["text"] for t in tweets] == ["t1", "t2", "t3"]
    second_call_input = client.tools.execute.call_args_list[1].kwargs["input"]
    assert second_call_input["next_token"] == "p2"


def test_twitter_stops_at_max_tweets() -> None:
    client = MagicMock()
    client.tools.execute.return_value = _page(["t1", "t2"], "more")

    tweets = get_all_tweets(client, username="ada", user_id="u", max_tweets=3)

    assert len(tweets) == 3
    assert client.tools.execute.call_count == 2


def test_twitter_tool_error_returns_no_documents(mentor_extract: MentorExtract) -> None:
    client = MagicMock()
    client.tools.execute.return_value = SimpleNamespace(
        output=SimpleNamespace(error=SimpleNamespace(message="quota"), value=None)
    )
    assert extract_twitter_tweets(mentor_extract, client=client) == []
