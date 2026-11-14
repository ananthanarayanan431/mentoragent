from __future__ import annotations

from typing import TYPE_CHECKING

from loguru import logger

from mentor_agent.config import settings
from mentor_agent.integrations.factory import IntegrationFactory
from mentor_agent.rag.extractors.base import Source, make_document

if TYPE_CHECKING:
    from langchain_core.documents import Document

    from mentor_agent.integrations.arcade import TweetSource
    from mentor_agent.models.mentor_extract import MentorExtract


def extract_twitter_tweets(
    mentor_extract: MentorExtract,
    max_tweets: int = 100,
    tweets: TweetSource | None = None,
) -> list[Document]:
    """Fetch the mentor's recent tweets through Arcade.

    Args:
        mentor_extract: The mentor whose ``twitter_handle`` is searched.
        max_tweets: Upper bound on the number of tweets fetched.
        tweets: Where tweets come from; Arcade from settings when omitted.

    Returns:
        One document per tweet, or an empty list if the fetch fails.
    """
    log = logger.bind(mentor_id=mentor_extract.id, source=Source.TWITTER)
    handle = mentor_extract.twitter_handle
    if not handle:
        return []
    source = tweets or IntegrationFactory(settings).tweet_source()
    if source is None:
        log.warning("Arcade is not configured; skipping tweets for @{}", handle)
        return []

    try:
        found = source.recent_tweets(handle, max_tweets)
    except Exception:
        log.exception("Failed to fetch tweets for @{}", handle)
        return []

    documents = [
        make_document(mentor_extract, tweet["text"], Source.TWITTER, tweet["tweet_url"])
        for tweet in found
    ]
    log.info("Extracted {} tweets", len(documents))
    return documents
