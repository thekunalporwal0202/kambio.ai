-- Enum additions must land in their own migration: Postgres cannot use a
-- new enum value in the same transaction that adds it.
ALTER TYPE "DocumentType" ADD VALUE 'CHECKLIST';
ALTER TYPE "DocumentType" ADD VALUE 'SHIPPING_BILL';
ALTER TYPE "DocumentType" ADD VALUE 'FUMIGATION_CERT';
ALTER TYPE "DocumentType" ADD VALUE 'PHYTOSANITARY_CERT';
ALTER TYPE "DocumentType" ADD VALUE 'CERTIFICATE_OF_ORIGIN';
ALTER TYPE "DocumentType" ADD VALUE 'BL_DRAFT';
ALTER TYPE "DocumentType" ADD VALUE 'FINAL_DOC_SET';
ALTER TYPE "UserRole" ADD VALUE 'PARTNER';
