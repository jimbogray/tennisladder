-- Records that a user's personal data has been erased, as opposed to the user merely being removed
-- from the team (`removedAt`). See the User model and playerDataService.erasePersonalData.

-- AlterTable
ALTER TABLE "users" ADD COLUMN "personalDataErasedAt" TIMESTAMP(3);
