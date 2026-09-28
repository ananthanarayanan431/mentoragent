import click
from pathlib import Path
from mentoragents.core.config import settings
from mentoragents.models.mentor_extract import MentorExtract
from loguru import logger
from mentoragents.db.client import MongoClientWrapper

@click.command()
@click.option(
    "--metadata-file",
    type=click.Path(exists=True, path_type=Path),
    default=settings.EXTRACTION_METADATA_FILE_PATH,
    help="Path to the financial mentors extraction metadata JSON file.",
)

def main(metadata_file : Path) -> None:
    """
    CLI command to save mentors into MongoDB.

    Args:
        metadata_file : Path to the financial mentors extraction metadata JSON file.
    """
    mentor_extracts = MentorExtract.from_json(metadata_file)

    if len(mentor_extracts) == 0:
        logger.warning("No mentors to save. Exiting...")
        return
    
    mongo_client_wrapper = MongoClientWrapper(
        model = MentorExtract,
        collection_name = settings.MONGO_MENTORS_COLLECTION,
        database_name = settings.MONGO_DB_NAME,
        mongodb_uri = settings.MONGO_URI
    )

    logger.info(f"Saving {len(mentor_extracts)} mentors into MongoDB")
    mongo_client_wrapper.ingest_documents(mentor_extracts)
    logger.info("Mentors saved into MongoDB")
    mongo_client_wrapper.close()

if __name__ == "__main__":
    main()