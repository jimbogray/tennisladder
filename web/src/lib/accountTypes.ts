import { AccountType } from "@tennisladder/shared";

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  PLAYER: "Player",
  ADMIN: "Admin",
  PLAYER_ADMIN: "Player and Admin",
};

export const ACCOUNT_TYPES: AccountType[] = [AccountType.PLAYER, AccountType.ADMIN, AccountType.PLAYER_ADMIN];
