import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
import asyncio

from backend.middleware.auth_middleware import get_current_user
from backend.models import DocumentResponse
from backend.services import chroma_client as store
from backend.services.document_service import (
    embed_chunks,
    extract_text,
    chunk_text,
    list_documents,
    store_document,
)

router = APIRouter(prefix="/api/documents", tags=["documents"])


@router.post("/upload", response_model=DocumentResponse)
async def upload_document(
    file: UploadFile = File(...),
    user_id: int = Depends(get_current_user),
):
    file_bytes = await file.read()
    filename = file.filename or "document"

    text = extract_text(file_bytes, filename)
    chunks = chunk_text(text)
    embeddings = await embed_chunks(chunks)

    doc_id = str(uuid.uuid4())
    await store_document(user_id, doc_id, filename, chunks, embeddings)

    return DocumentResponse(doc_id=doc_id, filename=filename, chunk_count=len(chunks))


@router.get("/")
async def get_documents(user_id: int = Depends(get_current_user)):
    return await list_documents(user_id)


@router.delete("/{doc_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(doc_id: str, user_id: int = Depends(get_current_user)):
    docs = await list_documents(user_id)
    if not any(d["doc_id"] == doc_id for d in docs):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, lambda: store.delete_doc(user_id, doc_id))

