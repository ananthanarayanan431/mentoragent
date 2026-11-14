"""Fetches a person's recent X posts through Arcade's tool-calling API.

Optional: without ``ARCADE_API_KEY`` and ``ARCADE_USER_ID`` tweets are skipped.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Protocol, cast

if TYPE_CHECKING:
    from arcadepy import Arcade

SEARCH_TWEETS_TOOL = "X.SearchRecentTweetsByUsername"
# The X API caps a single page at 100 results.
MAX_PAGE_SIZE = 100


class TweetSource(Protocol):
    """Returns a user's recent tweets (dicts with ``text`` and ``tweet_url``).

    Raises on failure; the caller decides what a failed fetch means.
    """

    def recent_tweets(self, username: str, max_tweets: int) -> list[dict[str, Any]]: ...


class ArcadeTweets:
    """Recent tweets through Arcade, acting as one Arcade user.

    Args:
        client: The Arcade client.
        user_id: The Arcade user the tool acts on behalf of.
    """

    def __init__(self, client: Arcade, user_id: str) -> None:
        self.client = client
        self.user_id = user_id

    def recent_tweets(self, username: str, max_tweets: int) -> list[dict[str, Any]]:
        return get_all_tweets(self.client, username, self.user_id, max_tweets)


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
            msg = f"{tool_name} failed: {output.error.message}"
            raise RuntimeError(msg)

        value = output.value if output is not None else None
        if not isinstance(value, dict):
            break

        page = cast("dict[str, Any]", value)
        tweets.extend(page.get("data") or [])
        meta: dict[str, Any] = page.get("meta") or {}
        next_token = meta.get("next_token")
        if not next_token:
            break

    return tweets[:max_tweets]
