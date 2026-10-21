-- Séries canceladas "daqui em diante" antes do campo recurrenceUntil ser usado
-- como fim: a última ocorrência gerada está CANCELED e não há fim gravado.
-- Sem isto, a extensão automática voltaria a gerar ocorrências dessas séries.
-- O fim passa a ser logo depois da última ocorrência não cancelada.
UPDATE "Appointment" AS a
SET "recurrenceUntil" = s.until
FROM (
  SELECT
    "seriesId",
    COALESCE(
      MAX("startsAt") FILTER (WHERE "status" <> 'CANCELED'),
      MIN("startsAt") - INTERVAL '1 second'
    ) + INTERVAL '1 second' AS until
  FROM "Appointment"
  WHERE "seriesId" IS NOT NULL AND "recurrenceUntil" IS NULL
  GROUP BY "seriesId"
  HAVING (ARRAY_AGG("status" ORDER BY "startsAt" DESC))[1] = 'CANCELED'
) AS s
WHERE a."seriesId" = s."seriesId";
