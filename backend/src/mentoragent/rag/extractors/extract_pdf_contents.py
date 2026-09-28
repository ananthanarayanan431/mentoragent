from langchain_community.document_loaders import PyPDFLoader
from langchain_core.documents import Document
from mentoragent.models.mentor_extract import MentorExtract
from loguru import logger

def extract_pdf_contents(mentor_extract : MentorExtract) -> list[Document]:
    logger.info(f"Extracting PDF contents for {mentor_extract.id}")
    documents : list[Document] = list[Document]()
    try:   
        for pdf_url in mentor_extract.pdfs:
            loader = PyPDFLoader(
                pdf_url,
                mode="page",
            )
            docs : list[Document] = loader.load()

            for doc in docs:
                document = Document(
                    page_content = doc.page_content,
                    metadata = {
                        "mentor_id": mentor_extract.id,
                        "mentor_name": mentor_extract.name,
                        "source": "pdf",
                        "source_url": pdf_url
                    }
                )
                documents.append(document)
            
        logger.info(f"Extracted {len(documents)} pdf documents for {mentor_extract.id}")
        return documents
    except Exception as e:
        logger.error(f"Error extracting PDF contents for {mentor_extract.id} : {e}")
        return []