from mentoragent.models.evaluation import EvaluationDataset, EvaluationDatasetSample
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_groq import ChatGroq
from mentoragent.core.config import settings
from langchain_core.prompts import ChatPromptTemplate
from mentoragent.workflow.prompt import EVALUATE_DATASET_GENERATION_PROMPT
from mentoragent.rag.extractor import Extractor
from loguru import logger
import time

class EvaluationDatasetGenerator:
    """
    Generates an evaluation dataset for a mentor.
    """
    def __init__(self, temperature : float = 0.8, max_samples: int = 40) -> None:
        """
        Initializes the EvaluationDatasetGenerator.
        
        Args:
            temperature : The temperature for the LLM.
            max_samples : The maximum number of samples to generate.
        """
        self.temperature = temperature
        self.max_samples = max_samples
        self.extractor = Extractor()

        self.__chain = self.__build_chain()
        self.__splitter = self.__build_splitter()

    def __call__(self) -> EvaluationDataset:
        """
        Generates an evaluation dataset for a list of mentors.

        Args:
        Returns:
            EvaluationDataset : The evaluation dataset.
        """
        dataset_samples = [] 
        extraction_generator = self.extractor.get_extraction_generator(is_sample_data = True, sample_count = 1)

        for mentor, docs in extraction_generator:
            logger.info(f"Generating evaluation dataset for {mentor.id}")
            chunks = self.__splitter.split_documents(docs)
            for chunk in chunks:
                try:
                    dataset_sample = self.__chain.invoke(
                        {
                            "mentor" : mentor,
                            "document" : chunk.page_content,
                        }
                    )

                except Exception as e:
                    logger.error(f"Error generating dataset sample : {e}")
                    continue

                dataset_sample.mentor_id = mentor.id
                if self.__validate_sample(dataset_sample):
                    dataset_samples.append(dataset_sample)

                time.sleep(1)
                if len(dataset_samples) >= self.max_samples:
                    break

                logger.info(f"Generated evaluation sample(s) for {mentor.id}")

            if len(dataset_samples) >= self.max_samples:
                logger.warning(f"Reached maximum number of samples : ({self.max_samples}). Stopping")
                break

        assert len(dataset_samples) > 0, "Could not generate any evaluation samples"
        logger.info(f"Generated {len(dataset_samples)} evaluation sample(s).")
        evaluation_dataset = EvaluationDataset(
            samples = dataset_samples,
        )
        evaluation_dataset.save_to_json(file_path = settings.paths.EVALUATION_DATASET_FILE_PATH)
        return evaluation_dataset

    def __build_chain(self):
        """
        Builds the chain for the evaluation dataset generation.

        Returns:
            chain : The chain for the evaluation dataset generation.
        """
        model = ChatGroq(
            api_key = settings.groq.API_KEY,
            model_name = settings.groq.LLM_MODEL,
            temperature = self.temperature
        )

        model = model.with_structured_output(EvaluationDatasetSample)
        prompt = ChatPromptTemplate.from_messages(
            [
                ("system", EVALUATE_DATASET_GENERATION_PROMPT.prompt),
            ],
            template_format = "jinja2",
        )
        chain = prompt | model
        return chain

    def __build_splitter(self, max_token_limit : int = 6000) -> RecursiveCharacterTextSplitter:
        """
        Builds the splitter for the evaluation dataset generation.

        Args:
            max_token_limit : The maximum number of tokens to split the document into.

        Returns:
            RecursiveCharacterTextSplitter : The splitter for the evaluation dataset generation.
        """
        return RecursiveCharacterTextSplitter.from_tiktoken_encoder(
            encoding_name = "cl100k_base",
            chunk_size=int(max_token_limit * 0.25),
            chunk_overlap=0,
        )
    
    def __validate_sample(self, sample : EvaluationDatasetSample) -> bool:
        """
        Validates a sample for the evaluation dataset generation.

        Args:
            sample : The sample to validate.

        Returns:
            bool : True if the sample is valid, False otherwise.    
        """
        return (
            len(sample.messages) >= 2
            and sample.messages[-2].role == "user"
            and sample.messages[-1].role == "assistant"
        )