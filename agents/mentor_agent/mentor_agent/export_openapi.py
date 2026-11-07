"""Print the API's OpenAPI document, the contract the web app is typed from.

    uv run python -m mentor_agent.export_openapi > ../../libs/mentor-agent-contracts/openapi.json

(or ``make openapi``, which also regenerates the TypeScript types). CI exports it
again and fails if the committed snapshot differs, so an API change cannot land
without the web contract following it.
"""

from __future__ import annotations

import json
import sys
from importlib.metadata import version

from mentor_agent.server import create_app


def openapi_document() -> dict[str, object]:
    """The OpenAPI document, independent of the local environment.

    ``info`` is fixed here instead of read from settings, so the export is the
    same on every machine whatever ``PROJECT_NAME`` or ``APP_VERSION`` say.
    """
    document = create_app().openapi()
    document["info"] = {"title": "MentorAgents mentor agent", "version": version("mentor-agent")}
    return document


def main() -> None:
    sys.stdout.write(json.dumps(openapi_document(), indent=2, sort_keys=True) + "\n")


if __name__ == "__main__":
    main()
