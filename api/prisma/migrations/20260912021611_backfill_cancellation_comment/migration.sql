-- matches.cancellationComment was added after cancelling was already possible, so recover the
-- reason for existing cancellations from the event log. Takes the most recent cancel event per
-- match; matches cancelled without a comment stay NULL.
UPDATE "matches" m
SET "cancellationComment" = e.comment
FROM (
  SELECT DISTINCT ON ("matchId") "matchId", comment
  FROM "match_events"
  WHERE type IN ('CANCELLED', 'ADMIN_CANCELLED')
  ORDER BY "matchId", "createdAt" DESC
) e
WHERE e."matchId" = m.id
  AND m."cancellationComment" IS NULL
  AND e.comment IS NOT NULL;
