-- AlterTable
ALTER TABLE "user_addresses" ADD COLUMN     "geocodedAddress" TEXT,
ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION;
