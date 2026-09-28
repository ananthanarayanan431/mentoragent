from pymongo import MongoClient
from mentoragents.core.config import settings
from loguru import logger

async def reset_conversation_state() -> dict:
    """
    Deletes all conversation state data from short-term memory MongoDB.

    This function removes all stored conversation checkpoints and writes from the MongoDB.

    Returns:
        dict: Status message indicating success or failure with details about which collections were affected.

    Raises:
        Exception : If there's an error deleting the conversations.
    """

    try:
        client = MongoClient(settings.MONGO_URI)
        db = client[settings.MONGO_DB_NAME]

        collections_deleted = []

        if settings.MONGO_STATE_CHECKPOINT_COLLECTION in db.list_collection_names():
            db.drop_collection(settings.MONGO_STATE_CHECKPOINT_COLLECTION)
            collections_deleted.append(settings.MONGO_STATE_CHECKPOINT_COLLECTION)
            logger.info(f"Deleted collection: {settings.MONGO_STATE_CHECKPOINT_COLLECTION}")

        if settings.MONGO_STATE_WRITES_COLLECTION in db.list_collection_names():
            db.drop_collection(settings.MONGO_STATE_WRITES_COLLECTION)
            collections_deleted.append(settings.MONGO_STATE_WRITES_COLLECTION)
            logger.info(f"Deleted collection: {settings.MONGO_STATE_WRITES_COLLECTION}")

        if collections_deleted:
            return {
                "status" : "success",
                "message" : f"Successfully deleted collections: {', '.join(collections_deleted)}"
            }
        else:
            return {
                "status" : "success",
                "message" : "No collections needed to be deleted"
            }
        
    except Exception as e:
        logger.error(f"Error resetting conversation state: {str(e)}")
        raise Exception(f"Error resetting conversation state: {str(e)}") from e 