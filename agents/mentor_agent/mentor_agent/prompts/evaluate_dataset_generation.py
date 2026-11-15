"""Generates mentor/user conversations from a document for the evaluation dataset."""

from __future__ import annotations

from mentor_agent.prompts.base import Prompt

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
