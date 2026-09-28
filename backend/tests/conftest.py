from __future__ import annotations

import os

# Settings are validated when mentoragent.core.config is first imported, so the
# environment must be in place before any test module imports the package.
# Real environment variables take precedence over .env, which keeps the suite
# hermetic without needing a .env file.
_TEST_ENV = {
    "ENVIRONMENT": "test",
    "LOCAL_DEVELOPMENT": "false",
    "DEBUG": "false",
    "OPENROUTER_API_KEY": "test-openrouter-key",
    "ARCADE_API_KEY": "test-arcade-key",
    "ARCADE_USER_ID": "test-user",
    "LANGSMITH_TRACING": "false",
    "ADDITIONAL_CORS_ORIGINS": "http://allowed.test",
    "COMET_API_KEY": "",
    "API_KEY": "",
}
os.environ.update(_TEST_ENV)

import pytest  # noqa: E402

from mentoragent.models.mentor_extract import MentorExtract  # noqa: E402


@pytest.fixture
def mentor_extract() -> MentorExtract:
    return MentorExtract(
        id="ada",
        name="Ada Lovelace",
        expertise="Mathematics",
        perspective="Analytical",
        style="Precise",
        image_url="https://example.test/ada.png",
        twitter_handle="ada",
        pdfs=["a.pdf", "b.pdf"],
        youtube_videos=["https://youtu.be/one", "https://youtu.be/two"],
    )
