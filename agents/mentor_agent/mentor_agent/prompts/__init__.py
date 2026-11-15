"""Every prompt the agent sends to a model, one module per prompt.

Templates are plain local strings, so importing this package has no side
effects. :func:`register_prompts` versions the Jinja2 templates in Opik when
Comet is configured; the application calls it once at start-up.
"""

from __future__ import annotations

from loguru import logger

from mentor_agent.prompts.base import Prompt
from mentor_agent.prompts.context_summary import CONTEXT_SUMMARY_PROMPT
from mentor_agent.prompts.evaluate_dataset_generation import EVALUATE_DATASET_GENERATION_PROMPT
from mentor_agent.prompts.extend_summary import EXTEND_SUMMARY_PROMPT
from mentor_agent.prompts.ledger import LEDGER_SYSTEM_PROMPT
from mentor_agent.prompts.mentor_character import MENTOR_CHARACTER_PROMPT
from mentor_agent.prompts.opener import OPENER_INSTRUCTION
from mentor_agent.prompts.persona import PERSONA_SYSTEM_PROMPT
from mentor_agent.prompts.research_extract import RESEARCH_EXTRACT_PROMPT
from mentor_agent.prompts.research_system import RESEARCH_SYSTEM_PROMPT
from mentor_agent.prompts.summary import SUMMARY_PROMPT

__all__ = [
    "ALL_PROMPTS",
    "CONTEXT_SUMMARY_PROMPT",
    "EVALUATE_DATASET_GENERATION_PROMPT",
    "EXTEND_SUMMARY_PROMPT",
    "LEDGER_SYSTEM_PROMPT",
    "MENTOR_CHARACTER_PROMPT",
    "OPENER_INSTRUCTION",
    "PERSONA_SYSTEM_PROMPT",
    "RESEARCH_EXTRACT_PROMPT",
    "RESEARCH_SYSTEM_PROMPT",
    "SUMMARY_PROMPT",
    "Prompt",
    "register_prompts",
]

#: The templates versioned in Opik.
ALL_PROMPTS: tuple[Prompt, ...] = (
    MENTOR_CHARACTER_PROMPT,
    OPENER_INSTRUCTION,
    SUMMARY_PROMPT,
    EXTEND_SUMMARY_PROMPT,
    CONTEXT_SUMMARY_PROMPT,
    EVALUATE_DATASET_GENERATION_PROMPT,
)


def register_prompts() -> None:
    """Version every prompt in Opik. Requires Opik to be configured.

    Failures are logged, never raised: prompt versioning must not stop the app.
    """
    import opik

    for prompt in ALL_PROMPTS:
        try:
            opik.Prompt(name=prompt.name, prompt=prompt.prompt)
        except Exception:  # noqa: BLE001 - prompt versioning is best effort
            logger.opt(exception=True).warning("Could not version prompt {} in Opik", prompt.name)
