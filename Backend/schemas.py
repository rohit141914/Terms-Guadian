from pydantic import BaseModel, Field


class PolicyLink(BaseModel):
    label: str
    url: str


class SummarizeRequest(BaseModel):
    content: str = Field(..., min_length=1, max_length=50000)
    domain: str | None = None
    links: list[PolicyLink] = []


class IdentifyLinksRequest(BaseModel):
    links: list[PolicyLink]
    domain: str | None = None


class IdentifyLinksResponse(BaseModel):
    links: list[PolicyLink]


class FlaggedClause(BaseModel):
    text: str
    risk: str
    reason: str


class SummarizeResponse(BaseModel):
    summary: str
    risk_level: str
    clauses: list[FlaggedClause]
