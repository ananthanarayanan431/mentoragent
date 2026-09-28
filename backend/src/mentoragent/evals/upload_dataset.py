from __future__ import annotations

from typing import TYPE_CHECKING

from loguru import logger

from mentoragent.infra.opik_utils import create_opik_dataset
from mentoragent.models.evaluation import EvaluationDataset

if TYPE_CHECKING:
    from pathlib import Path

    import opik


def upload_dataset(name: str, data_path: Path) -> opik.Dataset:
    """Upload a local evaluation dataset JSON file to Opik, replacing any
    dataset with the same name.

    Args:
        name: Opik dataset name.
        data_path: JSON file written by the dataset generator.
    """
    dataset = EvaluationDataset.model_validate_json(data_path.read_text(encoding="utf-8"))
    opik_dataset = create_opik_dataset(
        name=name,
        description="Mentor conversations generated from the mentors' sources",
        items=[sample.model_dump() for sample in dataset.samples],
    )
    logger.info("Uploaded {} samples to Opik dataset {}", len(dataset.samples), name)
    return opik_dataset
