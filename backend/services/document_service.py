import asyncio
import io

import tiktoken
from openai import AsyncOpenAI
from pypdf import PdfReader

from backend.config import get_settings
from backend.services import chroma_client as store

settings = get_settings()
_openai = AsyncOpenAI(api_key=settings.openai_api_key)
_enc = tiktoken.get_encoding("cl100k_base")

CHUNK_SIZE = 400
OVERLAP = 50
EMBED_BATCH = 100
EMBED_MODEL = "text-embedding-3-small"


def extract_text(file_bytes: bytes, filename: str) -> str:
    lower = filename.lower()
    if lower.endswith(".pdf"):
        reader = PdfReader(io.BytesIO(file_bytes))
        return "\n\n".join(
            page.extract_text() or "" for page in reader.pages
        ).strip()
    return file_bytes.decode("utf-8", errors="replace").strip()


def chunk_text(text: str, chunk_size: int = CHUNK_SIZE, overlap: int = OVERLAP) -> list[str]:
    tokens = _enc.encode(text)
    chunks = []
    start = 0
    while start < len(tokens):
        end = min(start + chunk_size, len(tokens))
        chunks.append(_enc.decode(tokens[start:end]))
        if end == len(tokens):
            break
        start += chunk_size - overlap
    return [c for c in chunks if c.strip()]


async def embed_chunks(chunks: list[str]) -> list[list[float]]:
    embeddings: list[list[float]] = []
    for i in range(0, len(chunks), EMBED_BATCH):
        batch = chunks[i : i + EMBED_BATCH]
        response = await _openai.embeddings.create(model=EMBED_MODEL, input=batch)
        embeddings.extend([item.embedding for item in response.data])
    return embeddings


async def store_document(user_id: int, doc_id: str, filename: str, chunks: list[str], embeddings: list[list[float]]):
    ids = [f"{doc_id}_chunk_{i}" for i in range(len(chunks))]
    metadatas = [{"doc_id": doc_id, "filename": filename, "chunk_index": i} for i in range(len(chunks))]
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(
        None, lambda: store.upsert(user_id, ids, chunks, embeddings, metadatas)
    )


async def retrieve_context(user_id: int, query: str, n: int = 8) -> list[str]:
    response = await _openai.embeddings.create(model=EMBED_MODEL, input=[query])
    query_embedding = response.data[0].embedding
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, lambda: store.query(user_id, query_embedding, n))


async def list_documents(user_id: int) -> list[dict]:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, lambda: store.list_docs(user_id))
