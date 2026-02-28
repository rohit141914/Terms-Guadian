from pydantic import BaseModel, Field


class SummarizeRequest(BaseModel):
    content: str = Field(..., min_length=1, max_length=50000)
    domain: str | None = None


class FlaggedClause(BaseModel):
    text: str
    risk: str
    reason: str


class SummarizeResponse(BaseModel):
    summary: str
    risk_level: str
    clauses: list[FlaggedClause]
