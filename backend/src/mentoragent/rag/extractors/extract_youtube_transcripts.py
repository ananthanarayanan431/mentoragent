from mentoragent.models.mentor_extract import MentorExtract
from langchain_community.document_loaders import YoutubeLoader
from langchain_core.documents import Document
from loguru import logger

def extract_youtube_transcripts(mentor_extract: MentorExtract) -> list[Document]:
    """
    Extracts the transcripts from a YouTube video.
    
    Args:
        mentor_extract : MentorExtract object containing mentor details.

    Returns:
        list[Document] : List of documents extracted from YouTube videos.
    """
    logger.info(f"Extracting transcripts from YouTube videos: {mentor_extract.youtube_videos}")
    documents : list[Document] = []

    for youtube_url in mentor_extract.youtube_videos:
        try:
            loader = YoutubeLoader.from_youtube_url(
                youtube_url,
                add_video_info=False,
                language=["en"],
            )
            transcript = loader.load()
        except Exception as e:
            logger.error(f"Error extracting transcript from {youtube_url} : {e}")
            continue

        if not transcript:
            continue

        document = Document(
            page_content=transcript[0].page_content,
            metadata={
                "source" : "youtube",
                "source_url": youtube_url,
                "mentor_id": mentor_extract.id,
                "mentor_name": mentor_extract.name,
            }
        )
        documents.append(document)
    logger.info(f"Extracted {len(documents)} documents from YouTube videos")
    return documents