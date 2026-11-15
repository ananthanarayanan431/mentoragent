from __future__ import annotations

from typing import TYPE_CHECKING, Any, cast
from unittest.mock import AsyncMock, MagicMock

from mentor_agent.models.profile import Profile
from mentor_agent.services.profile import ProfileService

if TYPE_CHECKING:
    from collections.abc import Mapping

    from mentor_agent.db.client import AsyncMongoRepository


def _saved(_query: Mapping[str, Any], changes: Mapping[str, Any], **_options: bool) -> Profile:
    return Profile.model_validate(changes)


def _service(stored: Profile | None) -> tuple[ProfileService, MagicMock]:
    repository = MagicMock()
    repository.fetch_one = AsyncMock(return_value=stored)
    repository.update_one = AsyncMock(side_effect=_saved)
    return ProfileService(cast("AsyncMongoRepository[Profile]", repository)), repository


async def test_an_empty_profile_when_none_is_stored() -> None:
    service, _ = _service(None)
    assert (await service.get()).goal is None


async def test_setting_the_goal_upserts_the_one_profile() -> None:
    service, repository = _service(None)
    profile = await service.set_goal("Retire by 45")
    assert profile.goal == "Retire by 45"
    query, changes = repository.update_one.await_args.args
    assert query == {"key": "me"}
    assert changes["goal"] == "Retire by 45"
    assert changes["updated_at"] is not None
    assert repository.update_one.await_args.kwargs == {"upsert": True}
