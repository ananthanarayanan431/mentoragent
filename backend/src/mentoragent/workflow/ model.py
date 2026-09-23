from langchain_openai import ChatOpenAI
from langchain_groq import ChatGroq
from mentoragent.core.config import settings

class Models:
    """
    A class that contains the models defined in the workflow.
    """
    def __init__(self, model_name: str):
        """
        Initialize the models.
        """
        self.groq_model = ChatGroq(
            api_key=settings.groq.API_KEY,
            model_name=model_name,
            temperature=0.7,
        )

        self.openai_model = ChatOpenAI(
            api_key=settings.openai.API_KEY,
            model_name=model_name,
            temperature=0.7,
        )

    def get_groq_model(self):
        """
        Get the groq model.
        """
        return self.groq_model
    
    def get_openai_model(self):
        """
        Get the openai model.
        """
        return self.openai_model