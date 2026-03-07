import pytest
import json
from unittest.mock import AsyncMock, MagicMock
from app.matcher import JobMatcher

SAMPLE_RESUME = """Senior Linux and Infrastructure Engineer with 20+ years...
AWS, Kubernetes, Terraform, Ansible, Python, Docker...
Salesforce Lead Infra Engineer, CVS Health Senior Infra Engineer..."""

SAMPLE_JOB_DESC = """Senior DevOps Engineer - Remote
Requirements: AWS, Kubernetes, Terraform, CI/CD, Python
Salary: $180,000 - $220,000"""

MOCK_CLAUDE_RESPONSE = {
    "score": 88,
    "reasons": ["Strong AWS and K8s match", "20+ years seniority aligns"],
    "concerns": ["No Go experience mentioned"],
    "keywords": ["kubernetes", "terraform", "CI/CD"]
}

@pytest.mark.asyncio
async def test_matcher_scores_job():
    mock_client = MagicMock()
    mock_message = MagicMock()
    mock_message.content = [MagicMock(text=json.dumps(MOCK_CLAUDE_RESPONSE))]
    mock_client.messages.create = AsyncMock(return_value=mock_message)

    matcher = JobMatcher(client=mock_client, resume_text=SAMPLE_RESUME)
    result = await matcher.score_job(SAMPLE_JOB_DESC)
    assert result["score"] == 88
    assert len(result["reasons"]) > 0
    assert "concerns" in result
    assert "keywords" in result

@pytest.mark.asyncio
async def test_matcher_handles_bad_json():
    mock_client = MagicMock()
    mock_message = MagicMock()
    mock_message.content = [MagicMock(text="not json")]
    mock_client.messages.create = AsyncMock(return_value=mock_message)

    matcher = JobMatcher(client=mock_client, resume_text=SAMPLE_RESUME)
    result = await matcher.score_job(SAMPLE_JOB_DESC)
    assert result["score"] == 0
    assert "parse error" in result["concerns"][0].lower()

@pytest.mark.asyncio
async def test_matcher_handles_api_error():
    mock_client = MagicMock()
    mock_client.messages.create = AsyncMock(side_effect=Exception("API down"))

    matcher = JobMatcher(client=mock_client, resume_text=SAMPLE_RESUME)
    result = await matcher.score_job(SAMPLE_JOB_DESC)
    assert result["score"] == 0

@pytest.mark.asyncio
async def test_matcher_batch_score():
    mock_client = MagicMock()
    mock_message = MagicMock()
    mock_message.content = [MagicMock(text=json.dumps(MOCK_CLAUDE_RESPONSE))]
    mock_client.messages.create = AsyncMock(return_value=mock_message)

    matcher = JobMatcher(client=mock_client, resume_text=SAMPLE_RESUME)
    jobs = [{"id": 1, "description": "job 1"}, {"id": 2, "description": "job 2"}]
    results = await matcher.batch_score(jobs, delay=0)
    assert len(results) == 2
    assert all(r["score"] == 88 for r in results)
    assert results[0]["job_id"] == 1
    assert results[1]["job_id"] == 2
