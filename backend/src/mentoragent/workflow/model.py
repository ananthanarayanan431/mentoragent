from __future__ import annotations

from typing import TYPE_CHECKING, Any, Self, TypeVar

from openai import AsyncOpenAI
from pydantic import BaseModel

from mentoragent.core.config import settings

if TYPE_CHECKING:
    from collections.abc import AsyncIterator
    from types import TracebackType

    from openai.types.chat import ChatCompletionMessageParam

SchemaT = TypeVar("SchemaT", bound=BaseModel)


class Models:
    """
    Async chat model client backed by OpenRouter's OpenAI-compatible API.
    """

    def __init__(
        self,
        model_name: str | None = None,
        temperature: float | None = None,
    ) -> None:
        """
        Initialize the OpenRouter client.

        Args:
            model_name: OpenRouter model slug, e.g. ``"openai/gpt-4o-mini"``.
                Defaults to ``settings.openrouter.LLM_MODEL``.
            temperature: Sampling temperature. Defaults to
                ``settings.openrouter.TEMPERATURE``.
        """
        config = settings.openrouter
        self.model_name = model_name or config.LLM_MODEL
        self.temperature = config.TEMPERATURE if temperature is None else temperature

        headers: dict[str, str] = {}
        if config.APP_URL:
            headers["HTTP-Referer"] = config.APP_URL
        if config.APP_NAME:
            headers["X-Title"] = config.APP_NAME

        self.client = AsyncOpenAI(
            api_key=config.API_KEY.get_secret_value(),
            base_url=config.BASE_URL,
            default_headers=headers,
        )

    async def generate(
        self,
        messages: list[ChatCompletionMessageParam],
        **kwargs: Any,
    ) -> str:
        """
        Get a single chat completion.

        Args:
            messages: OpenAI-format chat messages.
            **kwargs: Extra ``chat.completions.create`` arguments
                (e.g. ``max_tokens``, ``tools``, ``response_format``).

        Returns:
            The assistant message content.
        """
        response = await self.client.chat.completions.create(
            model=self.model_name,
            messages=messages,
            temperature=self.temperature,
            **kwargs,
        )
        return response.choices[0].message.content or ""

    async def generate_structured(
        self,
        messages: list[ChatCompletionMessageParam],
        response_schema: type[SchemaT],
        **kwargs: Any,
    ) -> SchemaT:
        """
        Get a chat completion parsed into a Pydantic model.

        The schema is sent as a strict ``json_schema`` response format, so the
        chosen OpenRouter model must support structured outputs.

        Args:
            messages: OpenAI-format chat messages.
            response_schema: Pydantic model describing the expected response.
            **kwargs: Extra ``chat.completions.parse`` arguments.

        Returns:
            An instance of ``response_schema``.

        Raises:
            ValueError: If the model refused or returned no parsable content.
        """
        response = await self.client.chat.completions.parse(
            model=self.model_name,
            messages=messages,
            temperature=self.temperature,
            response_format=response_schema,
            **kwargs,
        )
        message = response.choices[0].message
        if message.parsed is None:
            raise ValueError(
                f"Model returned no parsable {response_schema.__name__}: "
                f"{message.refusal or message.content!r}"
            )
        return message.parsed

    async def stream(
        self,
        messages: list[ChatCompletionMessageParam],
        **kwargs: Any,
    ) -> AsyncIterator[str]:
        """
        Stream a chat completion token by token.

        Args:
            messages: OpenAI-format chat messages.
            **kwargs: Extra ``chat.completions.create`` arguments.

        Yields:
            Content deltas as they arrive.
        """
        response = await self.client.chat.completions.create(
            model=self.model_name,
            messages=messages,
            temperature=self.temperature,
            stream=True,
            **kwargs,
        )
        async for chunk in response:
            if chunk.choices and chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content

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
