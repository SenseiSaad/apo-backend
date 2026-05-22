import sys
import json
import os
import warnings

# Suppress warnings that might corrupt JSON output
warnings.filterwarnings("ignore")
os.environ["TOKENIZERS_PARALLELISM"] = "false"

try:
    from langchain_huggingface import HuggingFaceEmbeddings
    from langchain_community.vectorstores import FAISS
except ImportError:
    print(json.dumps({"success": False, "error": "Missing required packages. Run pip install -r requirements.txt"}))
    sys.exit(1)

def query_faiss(query: str):
    try:
        # Resolve path to vectorstore
        script_dir = os.path.dirname(os.path.abspath(__file__))
        db_path = os.path.join(script_dir, "vectorstore", "db_faiss")
        
        if not os.path.exists(db_path):
            print(json.dumps({"success": False, "error": f"Vectorstore path not found at {db_path}"}))
            return

        # Load embedding model and db
        embedding_model = HuggingFaceEmbeddings(model_name='sentence-transformers/all-MiniLM-L6-v2')
        db = FAISS.load_local(db_path, embedding_model, allow_dangerous_deserialization=True)
        
        # Search for top 5 matches
        docs = db.similarity_search(query, k=5)
        
        # Output as JSON
        results = [{"content": doc.page_content, "metadata": doc.metadata} for doc in docs]
        print(json.dumps({"success": True, "data": results}))
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))

def run_daemon():
    # Resolve path to vectorstore
    script_dir = os.path.dirname(os.path.abspath(__file__))
    db_path = os.path.join(script_dir, "vectorstore", "db_faiss")
    
    if not os.path.exists(db_path):
        print(json.dumps({"success": False, "error": f"Vectorstore path not found at {db_path}"}))
        sys.stdout.flush()
        return
        
    try:
        # Load embedding model and db ONCE
        embedding_model = HuggingFaceEmbeddings(model_name='sentence-transformers/all-MiniLM-L6-v2')
        db = FAISS.load_local(db_path, embedding_model, allow_dangerous_deserialization=True)
        # Signal that the daemon is ready
        print(json.dumps({"status": "ready"}))
        sys.stdout.flush()
    except Exception as e:
        print(json.dumps({"success": False, "error": f"Init error: {str(e)}"}))
        sys.stdout.flush()
        return

    # Loop indefinitely, reading from stdin
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
            query_id = req.get("id")
            query_text = req.get("query")
            
            if query_text:
                docs = db.similarity_search(query_text, k=5)
                results = [{"content": doc.page_content, "metadata": doc.metadata} for doc in docs]
                print(json.dumps({"id": query_id, "success": True, "data": results}))
            else:
                print(json.dumps({"id": query_id, "success": False, "error": "Empty query"}))
        except Exception as e:
            print(json.dumps({"id": req.get("id", "unknown"), "success": False, "error": str(e)}))
        sys.stdout.flush()

if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--daemon":
        run_daemon()
    elif len(sys.argv) > 1:
        query = " ".join(sys.argv[1:])
        query_faiss(query)
    else:
        print(json.dumps({"success": False, "error": "No query provided"}))
