from __future__ import annotations

import time
from typing import TYPE_CHECKING

from langchain_core.prompts import ChatPromptTemplate
from langchain_text_splitters import RecursiveCharacterTextSplitter
from loguru import logger

from mentoragent.core.config import settings
from mentoragent.models.evaluation import EvaluationDataset, EvaluationDatasetSample
from mentoragent.rag.extractor import Extractor
from mentoragent.workflow.llm import build_chat_model
from mentoragent.workflow.prompt import EVALUATE_DATASET_GENERATION_PROMPT

if TYPE_CHECKING:
    from langchain_core.runnables import Runnable


class EvaluationDatasetGenerator:
    """Generate synthetic evaluation conversations from the mentors' documents.

    Args:
        temperature: Sampling temperature of the generating LLM.
        max_samples: Stop once this many valid samples exist.
        request_interval: Seconds to wait between LLM calls (rate limiting).
    """

    def __init__(
        self,
        temperature: float = 0.8,
        max_samples: int = 40,
        request_interval: float = 1.0,
    ) -> None:
        self.temperature = temperature
        self.max_samples = max_samples
        self.request_interval = request_interval
        self.extractor = Extractor()

        self._chain = self._build_chain()
        self._splitter = self._build_splitter()

    def __call__(self) -> EvaluationDataset:
        """Generate the dataset and save it to ``EVALUATION_DATASET_FILE_PATH``.

        Raises:
            RuntimeError: If no valid sample could be generated.
        """
        dataset_samples: list[EvaluationDatasetSample] = []
        extraction_generator = self.extractor.get_extraction_generator(
            is_sample_data=True, sample_count=1
        )

        for mentor, docs in extraction_generator:
            logger.info("Generating evaluation dataset for {}", mentor.id)
            chunks = self._splitter.split_documents(docs)
            for chunk in chunks:
                try:
                    dataset_sample = self._chain.invoke(
                        {"mentor": mentor, "document": chunk.page_content}
                    )

                except Exception:
                    logger.exception("Error generating dataset sample for {}", mentor.id)
                    continue

                dataset_sample.mentor_id = mentor.id
                if self._validate_sample(dataset_sample):
                    dataset_samples.append(dataset_sample)

                time.sleep(self.request_interval)
                if len(dataset_samples) >= self.max_samples:
                    break

                logger.debug("Generated evaluation sample for {}", mentor.id)

            if len(dataset_samples) >= self.max_samples:
                logger.warning("Reached maximum number of samples ({}). Stopping", self.max_samples)
                break

        if not dataset_samples:
            raise RuntimeError("Could not generate any evaluation samples")

        logger.info("Generated {} evaluation samples", len(dataset_samples))
        evaluation_dataset = EvaluationDataset(samples=dataset_samples)
        evaluation_dataset.save_to_json(file_path=settings.paths.EVALUATION_DATASET_FILE_PATH)
        return evaluation_dataset

    def _build_chain(self) -> Runnable[dict[str, object], EvaluationDatasetSample]:
        """Build the prompt -> LLM chain that emits one structured sample."""
        model = build_chat_model(temperature=self.temperature)

        prompt = ChatPromptTemplate.from_messages(
            [("system", EVALUATE_DATASET_GENERATION_PROMPT.prompt)],
            template_format="jinja2",
        )
        return prompt | model.with_structured_output(EvaluationDatasetSample)  # type: ignore[return-value]

    @staticmethod
    def _build_splitter(max_token_limit: int = 6000) -> RecursiveCharacterTextSplitter:
        """Split documents into chunks of a quarter of ``max_token_limit`` tokens."""
        return RecursiveCharacterTextSplitter.from_tiktoken_encoder(
            encoding_name="cl100k_base",
            chunk_size=int(max_token_limit * 0.25),
            chunk_overlap=0,
        )

    @staticmethod
    def _validate_sample(sample: EvaluationDatasetSample) -> bool:
        """A sample is usable if it ends with a user turn answered by the assistant."""
        return (
            len(sample.messages) >= 2
            and sample.messages[-2].role == "user"
            and sample.messages[-1].role == "assistant"
        )
