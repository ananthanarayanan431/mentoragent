from langchain_core.documents import Document
from langchain_community.document_loaders import WikipediaLoader
from loguru import logger
from mentoragent.models.mentor_extract import MentorExtract

def extract_wikipedia(mentor_extract : MentorExtract) -> list[Document]:
        """Extract documents from  Wikipredia for a given mentor.

        Args:
            mentor : Mentor object containing mentor details.

        Returns:
            list[Document] : List of documents extracted from Wikipedia.
        """
        logger.info(f"Extracting docs from Wikipedia for {mentor_extract.id}")

        try:
            documents : list[Document] = list[Document]()
            data_loader = WikipediaLoader(
                query = mentor_extract.name,
                lang = "en",
                load_max_docs = 10,
                doc_content_chars_max = 1000000,
            )

            docs = data_loader.load()
            for doc in docs:
                document = Document(
                    page_content = doc.page_content,
                    metadata = {
                        "mentor_id" : mentor_extract.id,
                        "mentor_name" : mentor_extract.name,
                        "source_url" : doc.metadata["source"],
                        "source" : "wikipedia"
                    }
                )
                documents.append(document)
            logger.info(f"Extracted {len(documents)} docs from Wikipedia for {mentor_extract.id}")
            return documents 
        except Exception as e:
            logger.error(f"Error extracting docs from Wikipedia for {mentor_extract.id} : {e}")
            return []