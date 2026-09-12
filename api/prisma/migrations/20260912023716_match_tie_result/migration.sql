-- AlterEnum
ALTER TYPE "ResultOutcome" ADD VALUE 'TIED';

-- AlterTable
ALTER TABLE "matches" ADD COLUMN     "isTie" BOOLEAN NOT NULL DEFAULT false;
