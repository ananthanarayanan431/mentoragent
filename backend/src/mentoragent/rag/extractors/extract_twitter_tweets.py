from __future__ import annotations

from typing import TYPE_CHECKING, Any

from arcadepy import Arcade
from loguru import logger

from mentoragent.core.config import settings
from mentoragent.rag.extractors.base import Source, make_document

if TYPE_CHECKING:
    from langchain_core.documents import Document

    from mentoragent.models.mentor_extract import MentorExtract

SEARCH_TWEETS_TOOL = "X.SearchRecentTweetsByUsername"
# The X API caps a single page at 100 results.
MAX_PAGE_SIZE = 100


def extract_twitter_tweets(
    mentor_extract: MentorExtract,
    max_tweets: int = 100,
    client: Arcade | None = None,
) -> list[Document]:
    """Fetch the mentor's recent tweets through Arcade.

    Args:
        mentor_extract: The mentor whose ``twitter_handle`` is searched.
        max_tweets: Upper bound on the number of tweets fetched.
        client: Arcade client; one is created from settings when omitted.

    Returns:
        One document per tweet, or an empty list if the fetch fails.
    """
    log = logger.bind(mentor_id=mentor_extract.id, source=Source.TWITTER)
    handle = mentor_extract.twitter_handle
    if not handle:
        return []
    if client is None:
        if not settings.arcade.is_configured or settings.arcade.API_KEY is None:
            log.warning("Arcade is not configured; skipping tweets for @{}", handle)
            return []
        client = Arcade(api_key=settings.arcade.API_KEY.get_secret_value())

    try:
        tweets = get_all_tweets(
            client,
            username=handle,
            user_id=settings.arcade.USER_ID or "",
            max_tweets=max_tweets,
        )
    except Exception:
        log.exception("Failed to fetch tweets for @{}", handle)
        return []

    documents = [
        make_document(mentor_extract, tweet["text"], Source.TWITTER, tweet["tweet_url"])
        for tweet in tweets
    ]
    log.info("Extracted {} tweets", len(documents))
    return documents


def get_all_tweets(
    client: Arcade,
    username: str,
    user_id: str,
    max_tweets: int = 100,
    tool_name: str = SEARCH_TWEETS_TOOL,
) -> list[dict[str, Any]]:
    """Page through a user's recent tweets until ``max_tweets`` or the last page.

    Args:
        client: Arcade client.
        username: X username, without the ``@``.
        user_id: Arcade user the tool acts on behalf of.
        max_tweets: Upper bound on the number of tweets returned.
        tool_name: Arcade tool used for the search.

    Returns:
        The collected tweets, at most ``max_tweets`` of them.
    """
    tweets: list[dict[str, Any]] = []
    next_token: str | None = None

    while len(tweets) < max_tweets:
        inputs: dict[str, object] = {
            "username": username,
            "max_results": min(MAX_PAGE_SIZE, max_tweets - len(tweets)),
        }
        if next_token:
            inputs["next_token"] = next_token

        response = client.tools.execute(tool_name=tool_name, input=inputs, user_id=user_id)
        output = response.output
        if output is not None and output.error is not None:
            raise RuntimeError(f"{tool_name} failed: {output.error.message}")

        value = output.value if output is not None else None
        if not isinstance(value, dict):
            break

        tweets.extend(value.get("data") or [])
        next_token = (value.get("meta") or {}).get("next_token")
        if not next_token:
            break

    return tweets[:max_tweets]
