"""Prompt templates (Jinja2).

Templates are plain local strings, so importing this module has no side
effects. :func:`register_prompts` versions them in Opik when Comet is
configured; the application calls it once at start-up.
"""

from __future__ import annotations

from dataclasses import dataclass

from loguru import logger


@dataclass(frozen=True, slots=True)
class Prompt:
    """A named prompt template.

    Attributes:
        name: Stable identifier, also used as the Opik prompt name.
        prompt: The Jinja2 template text.
    """

    name: str
    prompt: str

    def __str__(self) -> str:
        return self.prompt


# ---- Mentor ----

MENTOR_CHARACTER_PROMPT = Prompt(
    name="mentor_character_prompt",
    prompt="""\
Let's roleplay. You are {{ mentor_name }}, a real person talking with someone who has come \
to you for advice. Explain your ideas in short, concise sentences that are educational and \
engaging, and stay true to your own views.

---

Mentor name: {{ mentor_name }}
Mentor expertise: {{ mentor_expertise }}
Mentor perspective: {{ mentor_perspective }}
Mentor talking style: {{ mentor_style }}
{% if mentor_context %}
Additional context: {{ mentor_context }}
{% endif %}
---

You must always follow these rules:
- Never mention that you are an AI or a virtual assistant.
- If this is the first message from the user, introduce yourself.
- When the user asks about your life, work, background or specific views, call the \
retrieve_mentor_context tool and ground your answer in what it returns. If it returns \
nothing relevant, say you don't know rather than inventing facts.
- Reply in plain text, without formatting markers or meta-commentary.
- Keep every reply under 100 words.
{% if summary %}
---

Summary of the conversation so far between {{ mentor_name }} and the user: {{ summary }}
{% endif %}
---

The conversation between {{ mentor_name }} and the user starts now.""",
)

# ---- Summaries ----

SUMMARY_PROMPT = Prompt(
    name="summary_prompt",
    prompt="""\
Create a summary of the conversation above between {{ mentor_name }} and the user. The \
summary must be short, but capture every relevant piece of information shared between \
{{ mentor_name }} and the user.""",
)

EXTEND_SUMMARY_PROMPT = Prompt(
    name="extend_summary_prompt",
    prompt="""\
This is a summary of the conversation to date between {{ mentor_name }} and the user:

{{ summary }}

Extend the summary by taking into account the new messages above.""",
)

CONTEXT_SUMMARY_PROMPT = Prompt(
    name="context_summary_prompt",
    prompt="""\
Summarize the following information in fewer than 50 words. Return only the summary, \
with no other text:

{{ context }}""",
)

# ---- Evaluation dataset generation ----

EVALUATE_DATASET_GENERATION_PROMPT = Prompt(
    name="evaluate_dataset_generation_prompt",
    prompt="""\
Generate a conversation between a mentor and a user based on the provided document. The \
mentor answers the user's questions by referencing the document. If a question is not \
related to the document, the mentor answers "I don't know".

Generate between 2 and 4 question-answer pairs. The mentor's answers must accurately \
reflect the content of the document. The conversation must alternate user and assistant \
messages, and end with an assistant message.

Mentor: {{ mentor }}
Document: {{ document }}

Rules:
- The user opens by introducing themselves (e.g. "Hi, my name is Sophia") and then asks a \
question related to the mentor's expertise and perspective.
- The user speaks directly to the mentor, using "you" and "your", as in a real-time \
conversation.
- The user asks about the document and the mentor's profile; the mentor answers from the \
document.
- If a question is not related to the document, the mentor says they don't know.""",
)

ALL_PROMPTS: tuple[Prompt, ...] = (
    MENTOR_CHARACTER_PROMPT,
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
        except Exception:
            logger.opt(exception=True).warning("Could not version prompt {} in Opik", prompt.name)
