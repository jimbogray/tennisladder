-- A player's postal address is no longer stored. It is geocoded while the row is being saved and
-- then thrown away, so only the coordinates remain (see the UserAddress model and addressService).
--
-- Rows written before this migration keep whatever coordinates the old lazy geocoding cache had
-- already filled in; the rest are left with both columns null. Those can no longer plan a journey,
-- and the app tells their owner to remove and re-add them. They are deliberately NOT deleted here:
-- dropping the address is the point of the change, losing the label the player chose is not.

-- DropColumn
ALTER TABLE "user_addresses" DROP COLUMN "address",
DROP COLUMN "geocodedAddress";
