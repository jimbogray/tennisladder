-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('PLAYER', 'ADMIN', 'PLAYER_ADMIN');

-- AlterTable
ALTER TABLE "registration_codes" ADD COLUMN     "accountType" "AccountType" NOT NULL DEFAULT 'PLAYER';
