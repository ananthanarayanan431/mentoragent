"""Optional third-party services, one module per provider.

- ``exa``: web search for researching a mentor (LinkedIn profiles, personal sites).
- ``firecrawl``: reads web pages as main-content markdown for a mentor's memory.
- ``arcade``: a mentor's recent X posts.

Build them with :class:`IntegrationFactory`; each is ``None`` without its key.
"""

from __future__ import annotations

from mentor_agent.integrations.arcade import TweetSource
from mentor_agent.integrations.exa import LeadFinder
from mentor_agent.integrations.factory import IntegrationFactory
from mentor_agent.integrations.firecrawl import PageReader

__all__ = ["IntegrationFactory", "LeadFinder", "PageReader", "TweetSource"]
