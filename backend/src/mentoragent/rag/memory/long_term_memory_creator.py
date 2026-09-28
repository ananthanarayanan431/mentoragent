from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_mongodb.retrievers import MongoDBAtlasHybridSearchRetriever
from mentoragent.rag.retrievers import Retriever
from mentoragent.rag.splitters import TextSplitter
from mentoragent.core.config import settings
from loguru import logger
from mentoragent.db.client import MongoClientWrapper
from mentoragent.rag.extractor import Extractor
from mentoragent.rag.deduplicate_documents import DeduplicateDocuments
from mentoragent.db.indexes import MongoIndex

class LongTermMemoryCreator:
    def __init__(self, retriever : MongoDBAtlasHybridSearchRetriever, splitter : RecursiveCharacterTextSplitter) -> None:
        self.retriever = retriever
        self.splitter = splitter
        self.deduplicate_documents = DeduplicateDocuments()
        self.extractor = Extractor()
        self.mongo_client_wrapper = MongoClientWrapper(
            model = Document, 
            collection_name = settings.mongo.LONG_TERM_MEMORY_COLLECTION,
            database_name = settings.mongo.DB_NAME,
            mongodb_uri = settings.mongo.URI
        )

    @classmethod
    def build(cls) -> "LongTermMemoryCreator":
        retriever = Retriever(
            embedding_model_id = settings.rag.TEXT_EMBEDDING_MODEL_ID,
            k = settings.rag.TOP_K,
            device = settings.rag.DEVICE
        ).get_hybrid_search_mongodb_retriever()

        splitter = TextSplitter(
            chunk_size = settings.rag.CHUNK_SIZE,
        ).get_splitter()

        return cls(retriever, splitter)
    
    def __call__(self) -> None:
        # First clear the long term memory collection to avoid duplicates
        logger.info("Clearing long term memory collection")
        self.mongo_client_wrapper.clear_collection()
        logger.info("Long term memory collection cleared")

        # Extract documents from sources
        logger.info("Extracting documents from sources")
        extraction_generator = self.extractor.get_extraction_generator()
        logger.info("Documents extracted from sources")

        # Ingest documents into the long term memory collection
        logger.info("Ingesting documents into the long term memory collection")
        for _, docs in extraction_generator:
            chunked_docs = self.splitter.split_documents(docs)
            chunked_docs = self.deduplicate_documents.remove_duplicates(chunked_docs)
            self.retriever.vectorstore.add_documents(chunked_docs)
        logger.info("Documents ingested into the long term memory collection")

        # Create index
        logger.info("Creating index")
        self.__create_index()
        logger.info("Index created")

    def __create_index(self) -> None:
        with self.mongo_client_wrapper as client:
            self.index = MongoIndex(
                retriever = self.retriever,
                client = client
            )
            self.index.create(
                is_hybrid = True,
                embedding_dim = settings.rag.TEXT_EMBEDDING_MODEL_DIM
            )