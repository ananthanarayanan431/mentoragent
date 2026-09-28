from pymongo import MongoClient
from loguru import logger
import click 
from mentoragents.core.config import settings

@click.command()
@click.option(
    "--collection-name",
    "-c",
    default = settings.MONGO_LONG_TERM_MEMORY_COLLECTION,
    help = "Name of the collection to delete"
)
@click.option(
    "--mongo-uri",
    "-m",
    default = settings.MONGO_URI,
    help = "MongoDB URI"
)
@click.option(
    "--db-name",
    "-d",
    default = settings.MONGO_DB_NAME,
    help = "Name of the database to delete"
)
def main(collection_name : str, mongo_uri : str, db_name : str) -> None:
    """Command line interface to delete MongoDB collection.
    
    Args:
        collection_name (str) : The name of the collection to delete.
        mongo_uri (str) : The URI of the MongoDB server.
        db_name (str) : The name of the database to delete.
    """

    # create mongoDB client 
    client = MongoClient(mongo_uri)

    # get the database
    db = client[db_name]
    
    # delete the collection if it exists
    if collection_name in db.list_collection_names():
        db.drop_collection(collection_name)
        logger.info(f"Collection {collection_name} deleted successfully")
    else:
        logger.info(f"Collection {collection_name} does not exist")

    # close the client 
    client.close()

if __name__ == "__main__":
    main()