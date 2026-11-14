from __future__ import annotations

from typing import TYPE_CHECKING, Any, Self, TypeVar, cast

from anthropic import AsyncAnthropic
from pydantic import BaseModel

from mentor_agent.config import settings
from mentor_agent.config.llm import thinking_off

if TYPE_CHECKING:
    from collections.abc import AsyncIterator
    from types import TracebackType

    from anthropic.types import Message, MessageParam

SchemaT = TypeVar("SchemaT", bound=BaseModel)


class Models:
    """
    Async chat model client backed by the Anthropic API (Claude Haiku / Sonnet).
    """

    def __init__(self, model_name: str | None = None) -> None:
        """
        Initialize the Anthropic client.

        Args:
            model_name: Claude model id, e.g. ``"claude-haiku-5-5"``.
                Defaults to ``settings.anthropic.LLM_MODEL``.
        """
        config = settings.anthropic
        self.model_name = model_name or config.LLM_MODEL
        self.max_tokens = config.MAX_TOKENS
        self.client = AsyncAnthropic(
            api_key=config.require_api_key().get_secret_value(),
            timeout=config.TIMEOUT_SECONDS,
            max_retries=config.MAX_RETRIES,
        )

    def _request(self, messages: list[MessageParam], kwargs: dict[str, Any]) -> dict[str, Any]:
        """Common request arguments; ``kwargs`` (e.g. ``system``) override the defaults."""
        return {
            "model": self.model_name,
            "max_tokens": self.max_tokens,
            "thinking": thinking_off(self.model_name),
            "messages": messages,
            **kwargs,
        }

    async def generate(self, messages: list[MessageParam], **kwargs: Any) -> str:
        """
        Get a single message.

        Args:
            messages: Anthropic-format messages (``user`` / ``assistant`` turns).
            **kwargs: Extra ``messages.create`` arguments (e.g. ``system``, ``max_tokens``).

        Returns:
            The text of the reply.
        """
        # Spreading the request hides which create() overload applies; without
        # stream=True it is always the non-streaming one.
        response = cast(
            "Message", await self.client.messages.create(**self._request(messages, kwargs))
        )
        return "".join(block.text for block in response.content if block.type == "text")

    async def generate_structured(
        self,
        messages: list[MessageParam],
        response_schema: type[SchemaT],
        **kwargs: Any,
    ) -> SchemaT:
        """
        Get a message parsed into a Pydantic model, using structured outputs.

        Args:
            messages: Anthropic-format messages.
            response_schema: Pydantic model describing the expected response.
            **kwargs: Extra ``messages.parse`` arguments.

        Returns:
            An instance of ``response_schema``.

        Raises:
            ValueError: If the model refused or returned no parsable content.
        """
        response = await self.client.messages.parse(
            **self._request(messages, kwargs), output_format=response_schema
        )
        if response.parsed_output is None:
            msg = (
                f"Model returned no parsable {response_schema.__name__} "
                f"(stop_reason={response.stop_reason})"
            )
            raise ValueError(msg)
        return response.parsed_output

    async def stream(self, messages: list[MessageParam], **kwargs: Any) -> AsyncIterator[str]:
        """
        Stream a message token by token.

        Args:
            messages: Anthropic-format messages.
            **kwargs: Extra ``messages.stream`` arguments.

        Yields:
            Text deltas as they arrive.
        """
        async with self.client.messages.stream(**self._request(messages, kwargs)) as stream:
            async for text in stream.text_stream:
                yield text

    async def close(self) -> None:
        """
        Close the underlying HTTP client.
        """
        await self.client.close()

    async def __aenter__(self) -> Self:
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: TracebackType | None,
    ) -> None:
        await self.close()
