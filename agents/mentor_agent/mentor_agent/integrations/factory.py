"""Builds the optional third-party integrations from settings.

Each method returns a ready client, or ``None`` when that integration's key is
not set, so callers can always ask and simply skip what is missing. Callers
depend on the protocols (:class:`LeadFinder`, :class:`PageReader`,
:class:`TweetSource`), never on a provider, so a provider can be swapped here.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from loguru import logger

from mentor_agent.integrations.arcade import ArcadeTweets
from mentor_agent.integrations.exa import ExaLeadFinder
from mentor_agent.integrations.firecrawl import FirecrawlReader

if TYPE_CHECKING:
    from mentor_agent.config import Settings
    from mentor_agent.integrations.arcade import TweetSource
    from mentor_agent.integrations.exa import LeadFinder
    from mentor_agent.integrations.firecrawl import PageReader


class IntegrationFactory:
    """Creates each integration from one :class:`Settings`.

    Building is cheap and touches no network, so make one where it is needed:
    ``IntegrationFactory(settings).page_reader()``.

    Args:
        config: The settings the keys and options are read from.
    """

    def __init__(self, config: Settings) -> None:
        self.config = config

    def lead_finder(self) -> LeadFinder | None:
        """Exa search for researching a mentor (``EXA_API_KEY``)."""
        exa = self.config.exa
        if exa.API_KEY is None:
            logger.info("EXA_API_KEY not set; researching with Claude web search only")
            return None
        return ExaLeadFinder(
            exa.API_KEY,
            base_url=exa.BASE_URL,
            timeout=exa.TIMEOUT_SECONDS,
            results_per_search=exa.RESULTS_PER_SEARCH,
        )

    def page_reader(self) -> PageReader | None:
        """Firecrawl for reading web pages into memory (``FIRECRAWL_API_KEY``)."""
        firecrawl = self.config.firecrawl
        if firecrawl.API_KEY is None:
            return None
        return FirecrawlReader(
            firecrawl.API_KEY, base_url=firecrawl.BASE_URL, timeout=firecrawl.TIMEOUT_SECONDS
        )

    def tweet_source(self) -> TweetSource | None:
        """Arcade for a mentor's recent tweets (``ARCADE_API_KEY`` and ``ARCADE_USER_ID``)."""
        arcade = self.config.arcade
        if arcade.API_KEY is None or not arcade.USER_ID:
            return None
        # Imported here: the Arcade SDK is only loaded when tweets are fetched.
        from arcadepy import Arcade

        return ArcadeTweets(Arcade(api_key=arcade.API_KEY.get_secret_value()), arcade.USER_ID)
