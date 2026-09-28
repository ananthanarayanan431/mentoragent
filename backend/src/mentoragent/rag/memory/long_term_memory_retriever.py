from mentoragent.rag.retrievers import Retriever
from mentoragent.core.config import settings
from langchain_core.documents import Document
from langchain_mongodb.retrievers import (
    MongoDBAtlasHybridSearchRetriever,
)

class LongTermMemoryRetriever:
    def __init__(self, retriever : MongoDBAtlasHybridSearchRetriever) -> None:
        self.retriever = retriever

    @classmethod
    def build(cls) -> "LongTermMemoryRetriever":
        retriever = Retriever(
            embedding_model_id = settings.rag.TEXT_EMBEDDING_MODEL_ID,
            k = settings.rag.TOP_K,
            device = settings.rag.DEVICE
        ).get_hybrid_search_mongodb_retriever()
        return cls(retriever)
    
    def __call__(self, query : str) -> list[Document]:
        return self.retriever.invoke(query)