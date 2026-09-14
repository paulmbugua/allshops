-- Modern least-privilege POS roles and corrected cashier scope.
UPDATE "roles" SET "name" = 'Owner' WHERE "organizationId" IS NULL AND "code" = 'OWNER';
UPDATE "roles" SET "name" = 'Administrator' WHERE "organizationId" IS NULL AND "code" = 'ADMIN';
UPDATE "roles" SET "name" = 'Business Manager' WHERE "organizationId" IS NULL AND "code" = 'MANAGER';
UPDATE "roles" SET "name" = 'Inventory Manager' WHERE "organizationId" IS NULL AND "code" = 'INVENTORY_MANAGER';
UPDATE "roles" SET "name" = 'Service Staff' WHERE "organizationId" IS NULL AND "code" = 'SERVICE_STAFF';

INSERT INTO "roles" ("id", "name", "code", "isSystemRole", "createdAt", "updatedAt")
SELECT gen_random_uuid(), 'Branch Manager', 'BRANCH_MANAGER', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "roles" WHERE "organizationId" IS NULL AND "code" = 'BRANCH_MANAGER');

INSERT INTO "roles" ("id", "name", "code", "isSystemRole", "createdAt", "updatedAt")
SELECT gen_random_uuid(), 'POS Supervisor', 'POS_SUPERVISOR', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "roles" WHERE "organizationId" IS NULL AND "code" = 'POS_SUPERVISOR');

-- Manager user-management actions were previously impossible because the
-- controller also requires role.assign. Grant the complete audited set.
INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "roles" r CROSS JOIN "permissions" p
WHERE r."organizationId" IS NULL AND r."code" = 'MANAGER'
  AND p."code" IN ('role.assign', 'user.remove')
ON CONFLICT DO NOTHING;

-- A branch manager has the manager capability set; mandatory branch assignment
-- in the API makes every query and mutation branch-scoped.
INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT target."id", rp."permissionId"
FROM "roles" target
JOIN "roles" source ON source."organizationId" IS NULL AND source."code" = 'MANAGER'
JOIN "role_permissions" rp ON rp."roleId" = source."id"
WHERE target."organizationId" IS NULL AND target."code" = 'BRANCH_MANAGER'
ON CONFLICT DO NOTHING;

-- Organization-level configuration stays with business managers and above.
-- A branch manager may update the assigned branch, but cannot create branches
-- or alter organization-wide settings.
DELETE FROM "role_permissions" rp
USING "roles" r, "permissions" p
WHERE rp."roleId" = r."id" AND rp."permissionId" = p."id"
  AND r."organizationId" IS NULL AND r."code" = 'BRANCH_MANAGER'
  AND p."code" IN ('branch.create', 'settings.update');

-- Cashiers get selling essentials only. Remove historical settings, user,
-- inventory-management and role visibility inherited from the old readOnly set.
DELETE FROM "role_permissions" rp
USING "roles" r, "permissions" p
WHERE rp."roleId" = r."id" AND rp."permissionId" = p."id"
  AND r."organizationId" IS NULL AND r."code" = 'CASHIER'
  AND p."code" NOT IN (
    'organization.read', 'branch.read', 'catalogue.read', 'sale.read',
    'sale.create', 'sale.hold', 'sale.cancel_draft', 'payment.record',
    'receipt.print', 'customer.read', 'customer.create', 'device.register',
    'sync.read', 'sync.execute'
  );

INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id" FROM "roles" r CROSS JOIN "permissions" p
WHERE r."organizationId" IS NULL AND r."code" = 'CASHIER'
  AND p."code" IN (
    'organization.read', 'branch.read', 'catalogue.read', 'sale.read',
    'sale.create', 'sale.hold', 'sale.cancel_draft', 'payment.record',
    'receipt.print', 'customer.read', 'customer.create', 'device.register',
    'sync.read', 'sync.execute'
  )
ON CONFLICT DO NOTHING;

-- Supervisors can perform cashier work plus controlled exception handling,
-- discounts, customer credit collection and offline conflict recovery.
INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id" FROM "roles" r CROSS JOIN "permissions" p
WHERE r."organizationId" IS NULL AND r."code" = 'POS_SUPERVISOR'
  AND p."code" IN (
    'organization.read', 'branch.read', 'catalogue.read', 'sale.read',
    'sale.create', 'sale.hold', 'sale.cancel_draft', 'sale.discount',
    'sale.credit', 'payment.record', 'receipt.print', 'customer.read',
    'customer.create', 'customer.update', 'customer_balance.read',
    'customer_payment.read', 'customer_payment.create', 'device.register',
    'device.read', 'sync.read', 'sync.execute', 'sync.conflict.read',
    'sync.conflict.resolve', 'report.dashboard', 'report.sales',
    'report.payments', 'staff.read', 'staff_availability.read',
    'appointment.read', 'appointment.read_all', 'appointment.create',
    'appointment.checkout'
  )
ON CONFLICT DO NOTHING;
