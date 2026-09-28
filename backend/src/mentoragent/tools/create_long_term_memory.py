from mentoragents.rag.memory.long_term_memory_creator import LongTermMemoryCreator

def main() -> None:
    """CLI command to create long-term memory for financial mentors.
    
    Args:
        metadata_file : Path to the mentor extraction metadata JSON file.
    """
    long_term_memory_creator = LongTermMemoryCreator.build()
    long_term_memory_creator()

if __name__ == "__main__":
    main()