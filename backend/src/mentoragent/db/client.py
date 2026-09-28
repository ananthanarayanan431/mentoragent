
from typing import Generic, Type, TypeVar
from pydantic import BaseModel
from bson import ObjectId
from pymongo import MongoClient, errors
from mentoragents.core.config import settings
from loguru import logger
from pymongo.server_api import ServerApi

T = TypeVar("T", bound = BaseModel)

class MongoClientWrapper(Generic[T]):
    """Service class for MongoDB operations, supporting ingestion quering and validation.
    
    This class provides methods to interact with MongoDB colections including document ingestion, querying and validation operations.

    Args:
        model (Type[T]) : The Pydantic model class to use for document serialization. 
        collection_name (str) : Name of the MongoDB collection to use. 
        database_name (str, optional) : Name of the MongoDB database to use. 
        mongodb_uri (str, optional) : URI for connecting to MongoDB instance. 

    Attributes:
        model (Type[T]) : The Pydantic model class used for document serialization. 
        collection_name (str) : Name of the MongoDB colleciton. 
        database_name (str) : Name of the MongoDB database.
        mongodb_uri (str) : MongoDB connection URI.
        client (MongoClient) : MongoDB client instance. 
        database (Database) : MongoDB database instance. 
        collection (Collection) : MongoDB collection instance.
     """
    def __init__(
        self,
        model : Type[T],
        collection_name : str,
        database_name : str = settings.MONGO_DB_NAME,
        mongodb_uri : str = settings.MONGO_URI
    ) -> None:
        """Initialize a connection to the MongoDB collection.
        
        Args: 
            model (Type[T]) : The Pydantic model class to use for document serialization.
            collection_name (str) : Name of the MongoDB collection to use. 
            database_name (str, optional) : Name of the MongoDB database.
                Defaults to value from settings.
            mongodb_uri (str, optional) : URI for connecting to MongoDB instance. 
                Defaults to value from settings.
        
        Raises:
            Exception : If connection to MongoDB fails.
        """
        self.model = model 
        self.collection_name = collection_name 
        self.database_name = database_name
        self.mongodb_uri = mongodb_uri 

        try:
            self.client = MongoClient(self.mongodb_uri, server_api=ServerApi('1'))
            self.client.admin.command("ping")
        except Exception as e:
            logger.error(f"Failed to initialize MongoDB client: {e}")


        self.database = self.client[database_name]
        self.collection = self.database[collection_name]

        logger.info(f"Connected to MongoDB instance : \n  URI : {mongodb_uri} \n Database : {database_name} \n  Collection : {collection_name} \n")
        
    def __enter__(self) -> "MongoClientWrapper":
        """
        Enable context manager support. 

        Returns:
            MongoDBService : The current instance. 
        """
        return self

    def __exit__(self, exc_type, exc_value, traceback) -> None:
        """
        Close the MongoDB client connection. 
        """
        self.close()

    def clear_collection(self) -> None:
        """
        Remove all documents from the collection. 

        This method deletes all documents in the collection to avoid duplicates during ingestion. 

        Raises:
            errors.PyMongoError : If the collection is not found. 
        """
        try:
            result = self.collection.delete_many({})
            logger.debug(
                f"Cleared colleciton. Delete {result.deleted_count} documents."
            )

        except errors.PyMongoError as e:
            logger.error(f"Error clearing the collection : {e}")
    
    def ingest_documents(self, documents : list[T]) -> None:
        """
        Ingest multiple documents into the collection. 

        Args : 
            documents (list[T]) : List of Pydantic model instances to ingest. 
        
        Raises:
            ValueError : If documents is empty or contains non-Pydantic model items.
            errors.PyMongoError : If the ingestion fails.
        """
        try:
            if not documents:
                raise ValueError("No documents to ingest.")
        
            if not all(isinstance(doc, BaseModel) for doc in documents):
                raise ValueError("Documents must be instances of Pydantic models.")
            
            dict_documents = [doc.model_dump() for doc in documents] 

            for doc in dict_documents:
                doc.pop("_id", None)

            self.collection.insert_many(dict_documents)
            logger.debug(
                f"Inserted {len(dict_documents)} documents into MongoDB collection."
            )

        except errors.PyMongoError as e:
            logger.error(f"Error ingesting documents : {e}")
            raise 

    def fetch_documents(self, query : dict, limit : int | None = 2) -> list[T]:
        """
        Retrieve documents from the collection based on the query and limit.

        Args:
            query (dict) : MongoDB query filter to apply. 
            limit (int | None) : Maximum number of documents to retrieve. If None, all documents are retrieved.

        Returns:
            list[T] : List of Pydantic model instances matching the query criteria. 

        Raise: 
            errors.PyMongoError: If the query operation fails.
        """
        try:
            if limit is not None:
                documents = self.collection.find(query).limit(limit)
            else:
                documents = self.collection.find(query)
            # logger.debug(f"Fetched {len(documents)} documents with query: {query}")
            return self.__parse_documents(documents)
        except errors.PyMongoError as e:
            logger.error(f"Error fetching documents : {e}")
            raise 
        
    def __parse_documents(self, documents : list[dict]) -> list[T]:
        """Convert MongoDB documents to Pydantic model instances. 
        
        Converts MongoDB objectId fields to strings and transforms the document structure to match the Pydantic model. 

        Args:
            documents (list[dict]) : List of MongoDB documents to parse.
        
        Returns:
            list[T] : List of validated Pydantic model instances. 
        """
        parsed_documents = []
        for doc in documents:
            parsed_doc = self.__parse_single_document(doc)
            parsed_documents.append(parsed_doc)
        
        return parsed_documents
     
    def __parse_single_document(self, document : dict) -> T:
        """Parse a single MongoDB document to a Pydantic model instance.
        
        Args:
            document (dict) : MongoDB document to parse.

        Returns:
            T : Pydantic model instance.
        """        
        for key, value in document.items(): 
            if isinstance(value, ObjectId):
                document[key] = str(value)

        # _id = document.pop("_id", None)
        # document["_id"] = _id 
        return self.model.model_validate(document)

    def get_collection_count(self) -> int:
        """
        Get the number of documents in the collection.

        Returns:
            int : The number of documents in the collection. 

        Raised:
            errors.PyMongoError : If the count operation fails.
        """
        try: 
            return self.collection.count_documents({})
        except errors.PyMongoError as e:
            logger.error(f"Error getting collection count : {e}")
            raise 
    
    def close(self) -> None:
        """
        Close the MongoDB client collection.

        This method should be called when the service is no longer needed to properly release resources, unless using the context manager.
        """
        self.client.close()
        logger.debug("MongoDB client connection closed.")