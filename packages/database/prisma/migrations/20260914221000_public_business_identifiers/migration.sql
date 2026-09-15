ALTER TABLE "organizations"
ADD COLUMN "employeePrefix" TEXT NOT NULL DEFAULT 'EMP',
ADD COLUMN "nextEmployeeNumber" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "nextBranchNumber" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "organization_users"
ADD COLUMN "employeeNumber" TEXT;

UPDATE "organizations" AS organization
SET "employeePrefix" = COALESCE(
  NULLIF(
    (
      SELECT string_agg(upper(left(word, 1)), '' ORDER BY position)
      FROM (
        SELECT word, position
        FROM regexp_split_to_table(organization.name, '[^A-Za-z0-9]+') WITH ORDINALITY AS parts(word, position)
        WHERE word <> ''
        ORDER BY position
        LIMIT 3
      ) AS initials
    ),
    ''
  ),
  'EMP'
);

WITH ranked_memberships AS (
  SELECT
    membership.id,
    organization."employeePrefix" AS prefix,
    row_number() OVER (
      PARTITION BY membership."organizationId"
      ORDER BY membership."createdAt", membership.id
    ) AS sequence
  FROM "organization_users" AS membership
  JOIN "organizations" AS organization
    ON organization.id = membership."organizationId"
)
UPDATE "organization_users" AS membership
SET "employeeNumber" = ranked.prefix || '-' || lpad(ranked.sequence::text, 4, '0')
FROM ranked_memberships AS ranked
WHERE membership.id = ranked.id;

ALTER TABLE "organization_users"
ALTER COLUMN "employeeNumber" SET NOT NULL;

CREATE UNIQUE INDEX "organization_users_organizationId_employeeNumber_key"
ON "organization_users"("organizationId", "employeeNumber");

UPDATE "organizations" AS organization
SET "nextEmployeeNumber" = counts.next_number
FROM (
  SELECT "organizationId", count(*)::integer + 1 AS next_number
  FROM "organization_users"
  GROUP BY "organizationId"
) AS counts
WHERE organization.id = counts."organizationId";

WITH ranked_branches AS (
  SELECT
    branch.id,
    branch."organizationId",
    left(
      trim(both '-' from regexp_replace(initcap(branch.name), '[^A-Za-z0-9]+', '-', 'g')),
      30
    ) AS label,
    row_number() OVER (
      PARTITION BY branch."organizationId"
      ORDER BY branch."createdAt", branch.id
    ) AS sequence
  FROM branches AS branch
)
UPDATE branches AS branch
SET code = COALESCE(NULLIF(ranked.label, ''), 'Branch') || '-' || lpad(ranked.sequence::text, 3, '0')
FROM ranked_branches AS ranked
WHERE branch.id = ranked.id;

UPDATE "organizations" AS organization
SET "nextBranchNumber" = counts.next_number
FROM (
  SELECT "organizationId", count(*)::integer + 1 AS next_number
  FROM branches
  GROUP BY "organizationId"
) AS counts
WHERE organization.id = counts."organizationId";
