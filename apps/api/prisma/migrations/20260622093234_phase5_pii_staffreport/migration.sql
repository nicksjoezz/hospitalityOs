-- AlterTable
ALTER TABLE "StaffReport" ADD COLUMN     "reporterIdEnc" TEXT,
ALTER COLUMN "reporterId" DROP NOT NULL;
