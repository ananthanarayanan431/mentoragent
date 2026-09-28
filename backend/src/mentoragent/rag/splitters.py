from langchain.text_splitter import RecursiveCharacterTextSplitter 
from loguru import logger 

class TextSplitter:
    """
    A class that splits text into chunks of a given size.
    """
    def __init__(self, chunk_size : int):
        """
        Initializes the TextSplitter with a given chunk size.
        """
        self.chunk_size = chunk_size 
        self.chunk_overlap = int(0.15 * chunk_size)

    def get_splitter(self) -> RecursiveCharacterTextSplitter:
        """
        Returns a RecursiveCharacterTextSplitter object that splits text into chunks of a given size.
        """
        logger.info(f"Initializing TextSplitter with chunk size: {self.chunk_size} and chunk overlap: {self.chunk_overlap}")
        return RecursiveCharacterTextSplitter.from_tiktoken_encoder(
            chunk_size = self.chunk_size,
            chunk_overlap = self.chunk_overlap,
            encoding_name = "cl100k_base",
        )