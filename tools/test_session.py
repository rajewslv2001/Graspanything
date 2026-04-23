"""CLI tool: register, upload a test file, and verify ephemeral token creation."""

import json
import os
import sys
import time
import urllib.request
import urllib.error
import uuid

BASE = "http://localhost:8000"
EMAIL = f"session_test_{int(time.time())}@example.com"
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
    boundary = uuid.uuid4().hex
    filename = os.path.basename(filepath)
    with open(filepath, "rb") as f:
        file_content = f.read()
    body = (
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{filename}\"\r\n"
        f"Content-Type: text/plain\r\n\r\n"
    ).encode() + file_content + f"\r\n--{boundary}--\r\n".encode()
    req = urllib.request.Request(
        f"{BASE}{path}",
        data=body,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}", "Authorization": f"Bearer {token}"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read())


def main():
    test_file = "/tmp/session_test_doc.txt"
    with open(test_file, "w") as f:
        f.write("Photosynthesis is the process by which plants use sunlight, water, and carbon dioxide to produce oxygen and energy in the form of glucose.\n\n"
                "The light-dependent reactions occur in the thylakoid membranes and convert light energy into chemical energy (ATP and NADPH).\n\n"
                "The Calvin cycle (light-independent reactions) occurs in the stroma and uses ATP and NADPH to fix carbon dioxide into glucose.\n\n"
                "Chlorophyll is the primary pigment responsible for absorbing light energy, primarily in the blue and red wavelengths.\n\n"
                "Overall equation: 6CO2 + 6H2O + light energy -> C6H12O6 + 6O2\n")

    print(f"Registering {EMAIL}...")
    _, data = post_json("/api/auth/register", {"email": EMAIL, "password": PASSWORD})
    token = data["access_token"]

    print("Uploading test document...")
    status, data = post_file("/api/documents/upload", test_file, token)
    assert status == 200, f"Upload failed: {status} {data}"
    doc_id = data["doc_id"]
    print(f"  doc_id: {doc_id}, chunks: {data['chunk_count']}")

    print("\nStarting session...")
    status, data = post_json("/api/session/start", {"doc_id": doc_id}, token)

    if status != 200:
        print(f"  Session start returned {status}: {data}")
        if "OPENAI_API_KEY" not in os.environ and not os.path.exists(".env"):
            print("  Note: Make sure OPENAI_API_KEY is set in .env")
        sys.exit(1)

    ephemeral_token = data.get("ephemeral_token", "")
    session_id = data.get("session_id", "")
    model = data.get("model", "")

    print(f"  session_id: {session_id}")
    print(f"  model: {model}")
    print(f"  ephemeral_token: {ephemeral_token[:12]}...")
    assert ephemeral_token.startswith("ek_"), f"Expected token starting with 'ek_', got: {ephemeral_token[:20]}"

    print("\nAll session tests passed. Ephemeral token looks valid.")
    os.remove(test_file)


if __name__ == "__main__":
    main()
