"""CLI tool: register, upload a test PDF (or text file), and verify ChromaDB indexing."""

import json
import sys
import time
import urllib.request
import urllib.error
import os

BASE = "http://localhost:8000"
EMAIL = f"upload_test_{int(time.time())}@example.com"
PASSWORD = "testpassword123"


def post_json(path, body, token=None):
    data = json.dumps(body).encode()
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(f"{BASE}{path}", data=data, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read())


def post_file(path, filepath, token):
    import mimetypes, uuid
    boundary = uuid.uuid4().hex
    filename = os.path.basename(filepath)

    with open(filepath, "rb") as f:
        file_content = f.read()

    mime = mimetypes.guess_type(filepath)[0] or "application/octet-stream"

    body = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'
        f"Content-Type: {mime}\r\n\r\n"
    ).encode() + file_content + f"\r\n--{boundary}--\r\n".encode()

    req = urllib.request.Request(
        f"{BASE}{path}",
        data=body,
        headers={
            "Content-Type": f"multipart/form-data; boundary={boundary}",
            "Authorization": f"Bearer {token}",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read())


def get(path, token):
    req = urllib.request.Request(f"{BASE}{path}", headers={"Authorization": f"Bearer {token}"})
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read())


def main():
    # Create a sample text file for testing
    test_file = "/tmp/voice_tutor_test.txt"
    with open(test_file, "w") as f:
        f.write("""Introduction to Machine Learning

Machine learning is a subset of artificial intelligence that enables systems to learn from data.

Types of Machine Learning:
1. Supervised Learning: The model learns from labeled training data.
   Examples: linear regression, decision trees, neural networks.

2. Unsupervised Learning: The model finds patterns in unlabeled data.
   Examples: clustering, dimensionality reduction.

3. Reinforcement Learning: An agent learns by interacting with an environment.
   The agent receives rewards for correct actions and penalties for incorrect ones.

Key Concepts:
- Training data: The dataset used to teach the model.
- Features: Input variables used for prediction.
- Labels: Output variables the model learns to predict.
- Overfitting: When a model performs well on training data but poorly on new data.
- Underfitting: When a model is too simple to capture the underlying patterns.

Evaluation Metrics:
- Accuracy: Percentage of correct predictions.
- Precision: True positives / (True positives + False positives).
- Recall: True positives / (True positives + False negatives).
- F1 Score: Harmonic mean of precision and recall.
""")

    print(f"Registering {EMAIL}...")
    _, data = post_json("/api/auth/register", {"email": EMAIL, "password": PASSWORD})
    token = data["access_token"]
    print(f"  Token obtained.")

    print(f"\nUploading test file: {test_file}")
    status, data = post_file("/api/documents/upload", test_file, token)
    assert status == 200, f"Upload failed: {status} {data}"
    doc_id = data["doc_id"]
    chunk_count = data["chunk_count"]
    print(f"  doc_id: {doc_id}")
    print(f"  chunk_count: {chunk_count}")
    assert chunk_count > 0, "No chunks were created!"

    print("\nListing documents...")
    status, docs = get("/api/documents/", token)
    assert status == 200, f"List failed: {status} {docs}"
    assert any(d["doc_id"] == doc_id for d in docs), "Doc not found in list!"
    print(f"  Found {len(docs)} document(s).")

    print("\nAll upload tests passed.")
    os.remove(test_file)


if __name__ == "__main__":
    main()
