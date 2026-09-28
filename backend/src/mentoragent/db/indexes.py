from mentoragents.db.client import MongoClientWrapper
from langchain_mongodb.index import create_fulltext_search_index, create_vector_search_index
from mentoragents.rag.retrievers import MongoDBAtlasHybridSearchRetriever

class MongoIndex:
    """
    A class that creates indexes for MongoDB.
    """
    def __init__(
        self,
        retriever : MongoDBAtlasHybridSearchRetriever, 
        client : MongoClientWrapper,
    ) -> None:
        """
        Initializes the MongoDB index with a retriever and a client.

        Args:
            retriever (Retriever) : The retriever to create the index for.
            client (MongoClientWrapper) : The client to use to create the index.
        """
        self.retriever = retriever
        self.client = client

    def create(
        self,
        embedding_dim : int, 
        is_hybrid : bool = False,
    ) -> None:
        """
        Creates an index for the MongoDB collection.

        Args:
            embedding_dim (int) : The dimension of the embedding.
            is_hybrid (bool) : Whether to create a hybrid index.
        """
        vectorstore = self.retriever.vectorstore
        vectorstore.create_vector_search_index(
            dimensions=embedding_dim
        )
        # create_vector_search_index(
        #     dimensions=embedding_dim,
        #     collection = self.client.collection,
        #     index_name = self.retriever.search_index_name,
        #     path = self.retriever.vectorstore._text_key,
        #     similarity = self.retriever.vectorstore._relevance_score_fn,
        # )
        if is_hybrid:
            create_fulltext_search_index(
                collection=self.client.collection,
                field=vectorstore._text_key,
                index_name=self.retriever.search_index_name,
            )