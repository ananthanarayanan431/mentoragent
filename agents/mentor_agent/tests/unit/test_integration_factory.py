from __future__ import annotations

from pydantic import SecretStr

from mentor_agent.config import ArcadeSettings, ExaSettings, FirecrawlSettings, Settings
from mentor_agent.integrations import IntegrationFactory
from mentor_agent.integrations.arcade import ArcadeTweets
from mentor_agent.integrations.exa import ExaLeadFinder
from mentor_agent.integrations.firecrawl import FirecrawlReader


def _factory(**groups: object) -> IntegrationFactory:
    blank = {
        "exa": ExaSettings(API_KEY=None),
        "firecrawl": FirecrawlSettings(API_KEY=None),
        "arcade": ArcadeSettings(API_KEY=None, USER_ID=None),
    }
    return IntegrationFactory(Settings.model_validate({**blank, **groups}))


def test_every_integration_is_none_without_its_key() -> None:
    factory = _factory()
    assert factory.lead_finder() is None
    assert factory.page_reader() is None
    assert factory.tweet_source() is None


def test_arcade_needs_a_user_as_well_as_a_key() -> None:
    factory = _factory(arcade=ArcadeSettings(API_KEY=SecretStr("k"), USER_ID=None))
    assert factory.tweet_source() is None


def test_each_integration_is_built_from_its_settings() -> None:
    factory = _factory(
        exa=ExaSettings(API_KEY=SecretStr("exa"), RESULTS_PER_SEARCH=5),
        firecrawl=FirecrawlSettings(API_KEY=SecretStr("fc"), TIMEOUT_SECONDS=9),
        arcade=ArcadeSettings(API_KEY=SecretStr("arc"), USER_ID="me"),
    )

    finder = factory.lead_finder()
    assert isinstance(finder, ExaLeadFinder)
    assert finder.results_per_search == 5
    reader = factory.page_reader()
    assert isinstance(reader, FirecrawlReader)
    assert reader.timeout == 9
    tweets = factory.tweet_source()
    assert isinstance(tweets, ArcadeTweets)
    assert tweets.user_id == "me"
