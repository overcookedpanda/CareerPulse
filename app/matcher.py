import json
import asyncio
import logging

logger = logging.getLogger(__name__)

SCORING_PROMPT = """You are a job matching assistant. Compare this resume against the job description.

RESUME:
{resume}

JOB DESCRIPTION:
{job_description}

Return ONLY valid JSON with this exact structure:
{{
    "score": <0-100 integer>,
    "reasons": ["reason 1", "reason 2"],
    "concerns": ["concern 1"],
    "keywords": ["keyword to emphasize"]
}}

Scoring criteria:
- Skills overlap (Linux, AWS, K8s, Python, Terraform, Ansible, Docker, CI/CD)
- Seniority alignment (candidate has 20+ years, look for senior/staff/lead roles)
- Salary fit (minimum $150k FTE or $95/hr contract)
- Remote compatibility
- AI/LLM relevance is a bonus differentiator
- Score 80+ = strong match, 60-79 = decent, below 60 = weak"""


class JobMatcher:
    def __init__(self, client, resume_text: str):
        self.client = client
        self.resume_text = resume_text

    async def score_job(self, job_description: str) -> dict:
        try:
            message = await self.client.messages.create(
                model="claude-sonnet-4-20250514",
                max_tokens=1024,
                messages=[{
                    "role": "user",
                    "content": SCORING_PROMPT.format(
                        resume=self.resume_text,
                        job_description=job_description
                    )
                }]
            )
            return json.loads(message.content[0].text)
        except json.JSONDecodeError as e:
            logger.error(f"JSON parse error in scoring: {e}")
            return {
                "score": 0,
                "reasons": [],
                "concerns": [f"Parse error: {e}"],
                "keywords": []
            }
        except Exception as e:
            logger.error(f"Scoring failed: {e}")
            return {
                "score": 0,
                "reasons": [],
                "concerns": [f"API error: {e}"],
                "keywords": []
            }

    async def batch_score(self, jobs: list[dict], delay: float = 2.0) -> list[dict]:
        results = []
        for job in jobs:
            result = await self.score_job(job["description"])
            result["job_id"] = job["id"]
            results.append(result)
            if job != jobs[-1] and delay > 0:
                await asyncio.sleep(delay)
        return results
