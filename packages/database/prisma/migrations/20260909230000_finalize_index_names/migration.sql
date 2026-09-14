-- Phase 8 can be applied before the feature migrations that create these indexes
-- on a brand-new database. Repeat the idempotent renames after every prerequisite
-- migration so fresh installs and historically upgraded databases converge.
ALTER INDEX IF EXISTS "appointment_services_appointmentId_staffProfileId_serviceProduc" RENAME TO "appointment_services_appointmentId_staffProfileId_servicePr_idx";
ALTER INDEX IF EXISTS "appointments_organizationId_primaryStaffProfileId_status_startA" RENAME TO "appointments_organizationId_primaryStaffProfileId_status_st_idx";
ALTER INDEX IF EXISTS "commission_rules_organizationId_staffProfileId_serviceProductId" RENAME TO "commission_rules_organizationId_staffProfileId_serviceProdu_idx";
ALTER INDEX IF EXISTS "offline_transactions_organizationId_deviceId_status_createdAt_i" RENAME TO "offline_transactions_organizationId_deviceId_status_created_idx";
ALTER INDEX IF EXISTS "staff_availability_organizationId_staffProfileId_branchId_dayOf" RENAME TO "staff_availability_organizationId_staffProfileId_branchId_d_idx";
