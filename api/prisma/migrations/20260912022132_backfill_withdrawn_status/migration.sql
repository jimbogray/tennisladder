-- Withdrawals were originally recorded as CANCELLED because WITHDRAWN wasn't a status yet.
-- Reclassify those: a match whose most recent event is WITHDRAWN was withdrawn, not cancelled.
UPDATE "matches" m
SET status = 'WITHDRAWN'
WHERE m.status = 'CANCELLED'
  AND (
    SELECT e.type FROM "match_events" e
    WHERE e."matchId" = m.id
    ORDER BY e."createdAt" DESC
    LIMIT 1
  ) = 'WITHDRAWN';
