import os
import requests
import json
from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_community.vectorstores import FAISS

def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    vectorstore_dir = os.path.join(script_dir, "vectorstore")
    pdf_path = os.path.join(vectorstore_dir, "mhGAP.pdf")
    db_path = os.path.join(vectorstore_dir, "db_faiss")
    
    os.makedirs(vectorstore_dir, exist_ok=True)
    
    # Download BC Guidelines for Depression (Public Clinical Resource)
    url = "https://www2.gov.bc.ca/assets/gov/health/practitioner-pro/bc-guidelines/depression_full_guideline.pdf"
    if not os.path.exists(pdf_path):
        print(f"Downloading {url} to {pdf_path}...")
        response = requests.get(url, headers={'User-Agent': 'Mozilla/5.0'})
        response.raise_for_status()
        with open(pdf_path, 'wb') as f:
            f.write(response.content)
        print("Download complete.")
    else:
        print("PDF already exists locally. Skipping download.")
        
    print("Loading PDF into LangChain...")
    loader = PyPDFLoader(pdf_path)
    documents = loader.load()
    
    print(f"Loaded {len(documents)} pages. Splitting text...")
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=1000,
        chunk_overlap=200,
        length_function=len
    )
    docs = text_splitter.split_documents(documents)
    
    print(f"Split into {len(docs)} chunks. Generating embeddings...")
    embedding_model = HuggingFaceEmbeddings(model_name='sentence-transformers/all-MiniLM-L6-v2')
    
    print("Building FAISS VectorStore...")
    db = FAISS.from_documents(docs, embedding_model)
    
    print(f"Saving FAISS database to {db_path}...")
    db.save_local(db_path)
    
    print("Ingestion complete!")

if __name__ == "__main__":
    main()
