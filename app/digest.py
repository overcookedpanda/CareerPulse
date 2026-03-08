import json
from datetime import datetime, timezone, timedelta


async def generate_digest(db, min_score: int = 60, hours: int = 24) -> dict:
    """Generate a digest of new high-scoring jobs from the last N hours."""
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()

    cursor = await db.db.execute("""
        SELECT j.*, js.match_score, js.match_reasons
        FROM jobs j
        JOIN job_scores js ON j.id = js.job_id
        WHERE js.match_score >= ? AND j.created_at >= ? AND j.dismissed = 0
        ORDER BY js.match_score DESC
        LIMIT 20
    """, (min_score, cutoff))
    rows = await cursor.fetchall()
    jobs = []
    for row in rows:
        d = dict(row)
        if d.get("match_reasons"):
            d["match_reasons"] = json.loads(d["match_reasons"])
        jobs.append(d)

    subject = f"CareerPulse: {len(jobs)} new match{'es' if len(jobs) != 1 else ''}"

    plain = f"CareerPulse Daily Digest\n"
    plain += f"{len(jobs)} new job match{'es' if len(jobs) != 1 else ''} in the last {hours} hours\n\n"

    for j in jobs:
        score = j.get("match_score", "?")
        plain += f"[{score}/100] {j['title']} at {j['company']}\n"
        loc = j.get("location", "")
        if loc:
            plain += f"  Location: {loc}\n"
        sal_min = j.get("salary_min")
        sal_max = j.get("salary_max")
        if sal_min and sal_max:
            plain += f"  Salary: ${sal_min:,} - ${sal_max:,}\n"
        plain += f"  {j['url']}\n\n"

    return {
        "subject": subject,
        "body": plain,
        "job_count": len(jobs),
        "jobs": [{
            "id": j["id"],
            "title": j["title"],
            "company": j["company"],
            "location": j.get("location", ""),
            "match_score": j.get("match_score"),
            "url": j["url"],
        } for j in jobs],
    }
