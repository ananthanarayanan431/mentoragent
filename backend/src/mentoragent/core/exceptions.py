from typing import Optional
from pydantic import ValidationError 

class PermissionException(Exception):
    """Exception raised when a user does not have a neccesaary permission to perform an action."""

    def __init__(
            self, 
            message : Optional[str] = "User does not have the right to perform this action",
    ):
        """Create a new PermissionException instance.

        Args:
        ----
            message (str, optional): The error message. Has default message.
        """
        self.message = message
        super().__init__(self.message)

class NotFoundException(Exception):
    """Exception raised when an object is not found."""
    def __init__(
            self, message : Optional[str] = "Object not found"
    ):
        """Create a new NotFoundException instance.

        Args:
        ----
            message (str, optional): The error message. Has default message.
        """
        self.message = message
        super().__init__(self.message)

def unpack_validation_error(exc : ValidationError) -> dict: 
    """Unpack a Pydantic validation error into a dictionary.

    Args:
    --- 
        exc (ValidationError): The Pydantic validation error.

    Returns:
    -------
        dict: The dictionary representation of the validation error.
    """
    error_messages = []
    for error in exc.errors():
        field = ".".join(str(loc) for loc in error["loc"])  
        message = error["msg"]
        error_messages.append({field: message})

    return {"errors": error_messages}


class MentorNameNotFoundException(Exception):
    """Esception raised when a mentor name is not found."""
    def __init__(self, mentor_id : str):
        self.message = f"Mentor name for id {mentor_id} not found."
        super().__init__(self.message) 
    
class MentorPerspectiveNotFoundException(Exception):
    """Exception raised when a mentor perspective is not found"""
    def __init__(self, mentor_id : str):
        self.message = f"Mentor perspective for id {mentor_id} not found."
        super().__init__(self.message)
    
class MentorStyleNotFoundException(Exception):
    """Exception raised when a mentor style is not found"""
    def __init__(self, mentor_id : str):
        self.message = f"Mentor style for id {mentor_id} not found."
        super().__init__(self.message)
    
class MentorExpertiseNotFoundException(Exception):
    """Exception raised when a mentor expertise is not found"""
    def __init__(self, mentor_id : str):
        self.message = f"Mentor expertise for id {mentor_id} not found."
        super().__init__(self.message)
    
class MentorNotFoundException(Exception):
    """Exception raised when a mentor is not found"""
    def __init__(self, mentor_id : str):
        self.message = f"Mentor for id {mentor_id} not found."