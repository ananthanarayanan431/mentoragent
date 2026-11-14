from __future__ import annotations

from types import SimpleNamespace
from typing import TYPE_CHECKING, Any
from unittest.mock import MagicMock, patch

from langchain_core.documents import Document

from mentor_agent.rag.extractors import (
    Source,
    extract_notes,
    extract_pdf_contents,
    extract_twitter_tweets,
    extract_websites,
    extract_wikipedia,
    extract_youtube_transcripts,
)
from mentor_agent.rag.extractors.extract_twitter_tweets import get_all_tweets

if TYPE_CHECKING:
    from mentor_agent.models.mentor_extract import MentorExtract

PDF_LOADER = "mentor_agent.rag.extractors.extract_pdf_contents.PyPDFLoader"
WEB_LOADER = "mentor_agent.rag.extractors.extract_websites.WebBaseLoader"
WIKI_LOADER = "mentor_agent.rag.extractors.extract_wikipedia.WikipediaLoader"
YT_LOADER = "mentor_agent.rag.extractors.extract_youtube_transcripts.YoutubeLoader"


def _loader(pages: list[str]) -> MagicMock:
    return MagicMock(load=MagicMock(return_value=[Document(page_content=p) for p in pages]))


def test_pdf_loads_every_pdf(mentor_extract: MentorExtract) -> None:
    loaders = {"a.pdf": _loader(["a1", "a2"]), "b.pdf": _loader(["b1"])}

    def loader(url: str, **_: Any) -> MagicMock:
        return loaders[url]

    with patch(PDF_LOADER, side_effect=loader):
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


def test_websites_load_each_page_and_skip_failures(mentor_extract: MentorExtract) -> None:
    sites = ["https://a.test", "https://broken.test", "https://empty.test"]

    def loader(web_paths: list[str], **_: Any) -> MagicMock:
        url = web_paths[0]
        if url == "https://broken.test":
            raise OSError("timeout")
        if url == "https://empty.test":
            return _loader(["  \n  "])
        return _loader(["Title\n\n\n\nBody text"])

    with patch(WEB_LOADER, side_effect=loader):
        docs = extract_websites(mentor_extract.model_copy(update={"websites": sites}))

    assert [d.page_content for d in docs] == ["Title\n\nBody text"]
    assert docs[0].metadata["source"] == Source.WEBSITE
    assert docs[0].metadata["source_url"] == "https://a.test"


class _Reader:
    def __init__(self, pages: dict[str, str]) -> None:
        self.pages = pages

    def read(self, url: str) -> str:
        return self.pages.get(url, "")


def test_websites_prefer_the_reader_and_fall_back_to_a_plain_fetch(
    mentor_extract: MentorExtract,
) -> None:
    sites = ["https://spa.test", "https://plain.test"]
    reader = _Reader({"https://spa.test": "Main content"})
    fetched: list[str] = []

    def loader(web_paths: list[str], **_: Any) -> MagicMock:
        fetched.extend(web_paths)
        return _loader(["Fetched text"])

    with patch(WEB_LOADER, side_effect=loader):
        docs = extract_websites(mentor_extract.model_copy(update={"websites": sites}), reader)

    assert [d.page_content for d in docs] == ["Main content", "Fetched text"]
    assert fetched == ["https://plain.test"]


def test_notes_become_documents_and_blank_ones_are_dropped(
    mentor_extract: MentorExtract,
) -> None:
    mentor = mentor_extract.model_copy(update={"notes": [" First post ", "   ", "Second"]})
    docs = extract_notes(mentor)
    assert [d.page_content for d in docs] == ["First post", "Second"]
    assert [d.metadata["source_url"] for d in docs] == ["note:1", "note:3"]
    assert docs[0].metadata["source"] == Source.NOTE


def test_wikipedia_is_skipped_when_turned_off(mentor_extract: MentorExtract) -> None:
    with patch(WIKI_LOADER) as loader:
        assert (
            extract_wikipedia(mentor_extract.model_copy(update={"search_wikipedia": False})) == []
        )
    loader.assert_not_called()
