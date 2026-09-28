from pydantic import BaseModel, Field

class Mentor(BaseModel):
    """A class representing a mentor"""
    id : str = Field(description = "Unique identifier for the mentor")
    mentor_name : str = Field(description = "Name of the mentor")
    mentor_expertise : str = Field(description = "Expertise of the mentor")
    mentor_perspective : str = Field(description = "Perspective of the mentor")
    mentor_style : str = Field(description = "Style of the mentor")