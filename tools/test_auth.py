"""CLI tool: register a test user, then log in and print the decoded JWT payload."""

import json
import sys
import time
import urllib.request
import urllib.error

BASE = "http://localhost:8000"
EMAIL = f"test_{int(time.time())}@example.com"
PASSWORD = "testpassword123"


def post(path, body):
    data = json.dumps(body).encode()
    req = urllib.request.Request(
        f"{BASE}{path}",
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read())


def decode_jwt(token):
    import base64
    parts = token.split(".")
    if len(parts) != 3:
        return None
    padding = 4 - len(parts[1]) % 4
    padded = parts[1] + "=" * padding
    return json.loads(base64.urlsafe_b64decode(padded))


def main():
    print(f"Registering {EMAIL}...")
    status, data = post("/api/auth/register", {"email": EMAIL, "password": PASSWORD})
    assert status == 200, f"Register failed: {status} {data}"
    token = data["access_token"]
    print(f"  JWT: {token[:40]}...")

    print("\nDecoding JWT payload:")
    payload = decode_jwt(token)
    print(f"  {json.dumps(payload, indent=2)}")

    print("\nLogging in...")
    status, data = post("/api/auth/login", {"email": EMAIL, "password": PASSWORD})
    assert status == 200, f"Login failed: {status} {data}"
    print(f"  JWT: {data['access_token'][:40]}...")

    print("\nTesting wrong password...")
    status, data = post("/api/auth/login", {"email": EMAIL, "password": "wrong"})
    assert status == 401, f"Expected 401, got {status}"
    print("  Correctly rejected invalid credentials.")

    print("\nAll auth tests passed.")


if __name__ == "__main__":
    main()
