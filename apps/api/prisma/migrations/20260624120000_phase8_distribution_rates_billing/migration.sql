-- CreateEnum
CREATE TYPE "RatePlanKind" AS ENUM ('BAR', 'NON_REFUNDABLE', 'CORPORATE', 'PACKAGE');

-- CreateEnum
CREATE TYPE "PromoType" AS ENUM ('PERCENT', 'FIXED');

-- CreateEnum
CREATE TYPE "TaxKind" AS ENUM ('VAT', 'SERVICE', 'OCCUPANCY', 'OTHER');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'PAID', 'VOID');

-- CreateEnum
CREATE TYPE "ChannelType" AS ENUM ('BOOKING_COM', 'EXPEDIA', 'AIRBNB', 'GENERIC');

-- CreateEnum
CREATE TYPE "ScheduleFrequency" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('ACTIVE', 'IN_REPAIR', 'RETIRED');

-- AlterTable
ALTER TABLE "Hotel" ADD COLUMN     "businessDate" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Reservation" ADD COLUMN     "ratePlanId" TEXT,
ADD COLUMN     "roomChargesPostedThrough" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Review" ADD COLUMN     "externalId" TEXT;

-- CreateTable
CREATE TABLE "RatePlan" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "roomTypeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "kind" "RatePlanKind" NOT NULL DEFAULT 'BAR',
    "adjustmentType" TEXT NOT NULL DEFAULT 'PERCENT',
    "adjustmentValue" INTEGER NOT NULL DEFAULT 0,
    "refundable" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RatePlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyRate" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "roomTypeId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "price" INTEGER NOT NULL,
    "minStay" INTEGER,
    "maxStay" INTEGER,
    "closedToArrival" BOOLEAN NOT NULL DEFAULT false,
    "stopSell" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromoCode" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" "PromoType" NOT NULL DEFAULT 'PERCENT',
    "value" INTEGER NOT NULL,
    "validFrom" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "maxUses" INTEGER,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromoCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GiftCard" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GiftCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxRate" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "TaxKind" NOT NULL DEFAULT 'VAT',
    "percentBps" INTEGER NOT NULL,
    "inclusive" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "TaxRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyAccount" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contact" TEXT,
    "creditLimit" INTEGER NOT NULL DEFAULT 0,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "reservationId" TEXT,
    "companyAccountId" TEXT,
    "number" TEXT NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'ISSUED',
    "subtotal" INTEGER NOT NULL,
    "taxTotal" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "billToName" TEXT,
    "billToCompany" TEXT,
    "lineItems" JSONB NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChannelConnection" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "channel" "ChannelType" NOT NULL,
    "name" TEXT NOT NULL,
    "credentials" JSONB NOT NULL DEFAULT '{}',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChannelConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChannelReservation" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "channel" "ChannelType" NOT NULL,
    "externalId" TEXT NOT NULL,
    "reservationId" TEXT,
    "raw" JSONB NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChannelReservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaintenanceSchedule" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" "MaintCategory" NOT NULL DEFAULT 'OTHER',
    "roomId" TEXT,
    "areaId" TEXT,
    "frequency" "ScheduleFrequency" NOT NULL DEFAULT 'MONTHLY',
    "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "nextRunAt" TIMESTAMP(3) NOT NULL,
    "lastRunAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaintenanceSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "location" TEXT,
    "serial" TEXT,
    "purchaseDate" TIMESTAMP(3),
    "warrantyUntil" TIMESTAMP(3),
    "status" "AssetStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NightAuditRun" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "businessDate" TIMESTAMP(3) NOT NULL,
    "summary" JSONB NOT NULL,
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NightAuditRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RatePlan_hotelId_roomTypeId_idx" ON "RatePlan"("hotelId", "roomTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "RatePlan_hotelId_code_key" ON "RatePlan"("hotelId", "code");

-- CreateIndex
CREATE INDEX "DailyRate_hotelId_date_idx" ON "DailyRate"("hotelId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "DailyRate_hotelId_roomTypeId_date_key" ON "DailyRate"("hotelId", "roomTypeId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "PromoCode_hotelId_code_key" ON "PromoCode"("hotelId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "GiftCard_hotelId_code_key" ON "GiftCard"("hotelId", "code");

-- CreateIndex
CREATE INDEX "TaxRate_hotelId_idx" ON "TaxRate"("hotelId");

-- CreateIndex
CREATE INDEX "CompanyAccount_hotelId_idx" ON "CompanyAccount"("hotelId");

-- CreateIndex
CREATE INDEX "Invoice_hotelId_status_idx" ON "Invoice"("hotelId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_hotelId_number_key" ON "Invoice"("hotelId", "number");

-- CreateIndex
CREATE INDEX "ChannelConnection_hotelId_idx" ON "ChannelConnection"("hotelId");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelReservation_hotelId_channel_externalId_key" ON "ChannelReservation"("hotelId", "channel", "externalId");

-- CreateIndex
CREATE INDEX "MaintenanceSchedule_hotelId_active_idx" ON "MaintenanceSchedule"("hotelId", "active");

-- CreateIndex
CREATE INDEX "Asset_hotelId_idx" ON "Asset"("hotelId");

-- CreateIndex
CREATE INDEX "NightAuditRun_hotelId_runAt_idx" ON "NightAuditRun"("hotelId", "runAt");

-- CreateIndex
CREATE UNIQUE INDEX "Review_hotelId_source_externalId_key" ON "Review"("hotelId", "source", "externalId");

