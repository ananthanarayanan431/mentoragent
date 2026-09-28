from .embeddings import Embeddings
from langchain_mongodb import MongoDBAtlasVectorSearch
from langchain_mongodb.retrievers import (
    MongoDBAtlasHybridSearchRetriever,
)
from loguru import logger  
from mentoragents.core.config import settings 

class Retriever:
    """
    A class that retrieves documents from the MongoDB Atlas vector search.
    """
    def __init__(self, embedding_model_id : str, k : int = 3, device : str = "cpu") -> None:
        """
        Initializes the Retriever with an embedding model and a k value.
        """
        self.k = k
        self.embedding_model_id = embedding_model_id
        self.embeddings_model = Embeddings(embedding_model_id, device).get_hf_model()

    def get_hybrid_search_mongodb_retriever(self) -> MongoDBAtlasHybridSearchRetriever:
        """
        Returns a MongoDBAtlasVectorSearchRetriever object that retrieves documents from the MongoDB Atlas vector search.
        """
        logger.info(f"Initializing MongoDBAtlasVectorSearchRetriever with embedding model: {self.embedding_model_id} and k: {self.k}")
        vector_store = MongoDBAtlasVectorSearch.from_connection_string(
            connection_string=settings.MONGO_URI,
            embedding=self.embeddings_model,
            namespace=f"{settings.MONGO_DB_NAME}.{settings.MONGO_LONG_TERM_MEMORY_COLLECTION}",
            text_key="chunk",
            embedding_key="embedding",
            relevance_score_fn="dotProduct",
        )

        retriever = MongoDBAtlasHybridSearchRetriever(
            vectorstore=vector_store,
            search_index_name="hybrid_search_index",
            top_k=self.k,
            vector_penalty=50,
            fulltext_penalty=50,
        )
        
        return retriever