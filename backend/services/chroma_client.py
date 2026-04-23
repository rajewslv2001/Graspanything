"""
Simple JSON + numpy vector store replacing ChromaDB.
Stores embeddings and text chunks as JSON files on disk.
"""
import json
import os
from pathlib import Path
from typing import Optional

import numpy as np

from backend.config import get_settings


def _store_dir() -> Path:
    settings = get_settings()
    path = Path(settings.chroma_persist_dir)
    path.mkdir(parents=True, exist_ok=True)
    return path


def _collection_path(user_id: int) -> Path:
    return _store_dir() / f"user_{user_id}.json"


def _load(user_id: int) -> dict:
    path = _collection_path(user_id)
    if path.exists():
        with open(path) as f:
            return json.load(f)
    return {"ids": [], "documents": [], "embeddings": [], "metadatas": []}


def _save(user_id: int, data: dict):
    path = _collection_path(user_id)
    with open(path, "w") as f:
        json.dump(data, f)


def upsert(user_id: int, ids: list, documents: list, embeddings: list, metadatas: list):
    data = _load(user_id)
    existing_ids = data["ids"]
    for i, item_id in enumerate(ids):
        if item_id in existing_ids:
            idx = existing_ids.index(item_id)
            data["documents"][idx] = documents[i]
            data["embeddings"][idx] = embeddings[i]
            data["metadatas"][idx] = metadatas[i]
        else:
            data["ids"].append(item_id)
            data["documents"].append(documents[i])
            data["embeddings"].append(embeddings[i])
            data["metadatas"].append(metadatas[i])
    _save(user_id, data)


def query(user_id: int, query_embedding: list, n_results: int = 8) -> list[str]:
    data = _load(user_id)
    if not data["embeddings"]:
        return []

    stored = np.array(data["embeddings"], dtype=np.float32)
    qvec = np.array(query_embedding, dtype=np.float32)

    # Cosine similarity
    norms = np.linalg.norm(stored, axis=1) * np.linalg.norm(qvec)
    norms = np.where(norms == 0, 1e-9, norms)
    scores = (stored @ qvec) / norms

    top_k = min(n_results, len(scores))
    top_indices = np.argsort(scores)[::-1][:top_k]
    return [data["documents"][i] for i in top_indices]


def list_docs(user_id: int) -> list[dict]:
    data = _load(user_id)
    seen: dict[str, dict] = {}
    for meta in data["metadatas"]:
        doc_id = meta.get("doc_id", "")
        if doc_id and doc_id not in seen:
            seen[doc_id] = {"doc_id": doc_id, "filename": meta.get("filename", "")}
    return list(seen.values())


def delete_doc(user_id: int, doc_id: str):
    data = _load(user_id)
    keep = [i for i, m in enumerate(data["metadatas"]) if m.get("doc_id") != doc_id]
    data["ids"] = [data["ids"][i] for i in keep]
    data["documents"] = [data["documents"][i] for i in keep]
    data["embeddings"] = [data["embeddings"][i] for i in keep]
    data["metadatas"] = [data["metadatas"][i] for i in keep]
    _save(user_id, data)
