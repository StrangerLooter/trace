from fastapi import APIRouter
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/v1", tags=["feedback"])


class FeedbackRequest(BaseModel):
    topic: str = Field(min_length=2, max_length=64)
    email: str | None = Field(default=None, max_length=254)
    message: str = Field(min_length=5, max_length=4000)


@router.post("/feedback")
def submit_feedback(payload: FeedbackRequest) -> dict:
    """Validate optional user feedback / format request without logging sensitive content."""
    return {
        "accepted": True,
        "topic": payload.topic,
        "message": "Feedback received by TRACE API.",
    }
