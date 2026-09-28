from pydantic import BaseModel, Field
from typing import List
from pathlib import Path
import json

class Message(BaseModel):
    """A message in a concersation between a user and a assistant.

    Attributes:
        role : The role of the message sender ('user' or 'assistant')
        content : The content of the message.
    
    """
    role : str = Field(description = "Role of the message")
    content : str = Field(description = "Content of the message")
   

class EvaluationDatasetSample(BaseModel):
    """A sample conversation for evaluation purposes.

    Contains a list of messages exchanged between a user and an assistant. 

    Attributes:
        mentor_id : The ID of the mentor associated with this sample.
        messages : A list of messages objects representing thje conversation. 
    """
    mentor_id : str | None = None 
    messages : List[Message] 

class EvaluationDataset(BaseModel):
    """A collection of EvaluationDatasetSample objects.

    Attributes:
        samples : A list of EvaluationDatasetSample objects.
    """
    samples : List[EvaluationDatasetSample]

    def save_to_json(self, file_path : Path) -> None:
        """Saves the evaluation dataset to a JSON file.

        Args:
            file_path : The path where the JSON file will be saved.
        
        Returns:
            None
        
        Raises:
            IOError: If there's an error writing to the file
        """
        file_path.parent.mkdir(parents=True, exist_ok=True)
        file_path.write_text(
            json.dumps(
                self.model_dump(), indent = 4, ensure_ascii = False),
                encoding = "utf-8"
            )