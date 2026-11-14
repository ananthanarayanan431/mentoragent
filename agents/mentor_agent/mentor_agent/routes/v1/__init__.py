"""Version 1 of the API: every route lives under ``API_V1_PREFIX``.

``router`` holds the HTTP routes, which require the API key. ``websocket_router``
holds the chat socket, which checks the key itself (browsers cannot set headers
on a WebSocket).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends

from mentor_agent.config import API_V1_PREFIX
from mentor_agent.core.dependencies import require_api_key
from mentor_agent.routes.v1 import admin, chat, mentors

router = APIRouter(prefix=API_V1_PREFIX, dependencies=[Depends(require_api_key)])
router.include_router(mentors.router)
router.include_router(chat.router)
router.include_router(admin.router)

websocket_router = APIRouter(prefix=API_V1_PREFIX)
websocket_router.include_router(chat.websocket_router)
