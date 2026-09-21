import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";
import { Prisma } from "@prisma/client";
import {
  accountFieldsFor,
  accountTypeFor,
  generateRegistrationCode,
  redeemRegistrationCode,
  RegistrationCodeError,
} from "../src/services/registrationCodeService.js";
import { createRegistrationCode, createUser, prisma, resetDatabase } from "./helpers/db.js";

beforeEach(resetDatabase);
after(() => prisma.$disconnect());

const HOUR = 60 * 60 * 1000;

describe("redeeming a code", () => {
  it("marks the code used and returns it", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const code = await createRegistrationCode(admin.id, { code: "123456" });

    const redeemed = await redeemRegistrationCode("123456", "new.player@example.test");

    assert.equal(redeemed.id, code.id);
    assert.notEqual(redeemed.usedAt, null);
  });

  it("refuses a code that has already been used", async () => {
    const admin = await createUser({ role: "ADMIN" });
    await createRegistrationCode(admin.id, { code: "222222" });

    await redeemRegistrationCode("222222", "first@example.test");

    await assert.rejects(
      redeemRegistrationCode("222222", "second@example.test"),
      (err: unknown) =>
        err instanceof RegistrationCodeError && /Invalid or already-used/.test(err.message),
    );
  });

  it("refuses a code that doesn't exist", async () => {
    await assert.rejects(
      redeemRegistrationCode("000000", "nobody@example.test"),
      /Invalid or already-used/,
    );
  });

  it("refuses an expired code and leaves it unused", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const code = await createRegistrationCode(admin.id, {
      code: "333333",
      expiresAt: new Date(Date.now() - HOUR),
    });

    await assert.rejects(redeemRegistrationCode("333333", "late@example.test"), /has expired/);

    // Spending an expired code would be worse than refusing it: the admin can extend or reissue.
    assert.equal(
      (await prisma.registrationCode.findUniqueOrThrow({ where: { id: code.id } })).usedAt,
      null,
    );
  });
});

describe("an invite bound to one email address", () => {
  it("refuses a different address and leaves the code redeemable", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const code = await createRegistrationCode(admin.id, {
      code: "444444",
      invitedEmail: "invited@example.test",
    });

    await assert.rejects(
      redeemRegistrationCode("444444", "forwarded@example.test"),
      /sent to a different email address/,
    );

    // The check runs inside the transaction, so the intended recipient can still use it.
    assert.equal(
      (await prisma.registrationCode.findUniqueOrThrow({ where: { id: code.id } })).usedAt,
      null,
    );
    const redeemed = await redeemRegistrationCode("444444", "invited@example.test");
    assert.notEqual(redeemed.usedAt, null);
  });

  it("matches the invited address regardless of case and surrounding space", async () => {
    const admin = await createUser({ role: "ADMIN" });
    await createRegistrationCode(admin.id, { code: "555555", invitedEmail: "invited@example.test" });

    const redeemed = await redeemRegistrationCode("555555", "  Invited@Example.Test  ");

    assert.notEqual(redeemed.usedAt, null);
  });

  it("lets anyone redeem a code issued for manual handout", async () => {
    const admin = await createUser({ role: "ADMIN" });
    await createRegistrationCode(admin.id, { code: "666666" });

    const redeemed = await redeemRegistrationCode("666666", "walk.up@example.test");

    assert.notEqual(redeemed.usedAt, null);
  });
});

describe("redeeming inside a caller's transaction", () => {
  it("leaves the code unused when the caller's transaction rolls back", async () => {
    const admin = await createUser({ role: "ADMIN" });
    await createRegistrationCode(admin.id, { code: "121212" });

    // What registration does: redeem, then write the account. If the write fails, the invite has
    // to come back, or its holder is left with a code that no longer works and no account.
    await assert.rejects(
      prisma.$transaction(async (tx) => {
        await redeemRegistrationCode("121212", "rolled.back@example.test", tx);
        throw new Error("the account write failed");
      }),
      /the account write failed/,
    );

    const code = await prisma.registrationCode.findFirstOrThrow({ where: { code: "121212" } });
    assert.equal(code.usedAt, null);
    // And it's still redeemable, not merely unmarked.
    const redeemed = await redeemRegistrationCode("121212", "rolled.back@example.test");
    assert.notEqual(redeemed.usedAt, null);
  });

  it("marks the code used when the caller's transaction commits", async () => {
    const admin = await createUser({ role: "ADMIN" });
    await createRegistrationCode(admin.id, { code: "131313" });

    await prisma.$transaction(async (tx) => {
      await redeemRegistrationCode("131313", "committed@example.test", tx);
    });

    const code = await prisma.registrationCode.findFirstOrThrow({ where: { code: "131313" } });
    assert.notEqual(code.usedAt, null);
  });
});

describe("active-code uniqueness", () => {
  it("is enforced by the partial unique index, so two active codes can't share a value", async () => {
    const admin = await createUser({ role: "ADMIN" });
    await createRegistrationCode(admin.id, { code: "777777" });

    await assert.rejects(
      createRegistrationCode(admin.id, { code: "777777" }),
      (err: unknown) =>
        err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002",
      "registration_codes needs its WHERE \"usedAt\" IS NULL partial unique index",
    );
  });

  it("frees the value again once the code has been used", async () => {
    const admin = await createUser({ role: "ADMIN" });
    await createRegistrationCode(admin.id, { code: "888888" });
    await redeemRegistrationCode("888888", "first@example.test");

    // The index only covers active codes, so the same six digits can come round again.
    const reissued = await createRegistrationCode(admin.id, { code: "888888" });
    assert.equal(reissued.usedAt, null);
  });

  it("generates a six-digit code that redeems", async () => {
    const admin = await createUser({ role: "ADMIN" });

    const code = await generateRegistrationCode(admin.id, { accountType: "PLAYER_ADMIN" });

    assert.match(code.code, /^\d{6}$/);
    assert.equal(code.accountType, "PLAYER_ADMIN");
    assert.equal(code.usedAt, null);
    assert.ok(code.expiresAt > new Date());
    await redeemRegistrationCode(code.code, "generated@example.test");
  });
});

describe("what an invite's account type grants", () => {
  it("maps each account type onto role and ladder participation", () => {
    assert.deepEqual(accountFieldsFor("PLAYER"), { role: "PLAYER", participatesInLadder: true });
    // A coach-admin: full admin rights, never on the ladder.
    assert.deepEqual(accountFieldsFor("ADMIN"), { role: "ADMIN", participatesInLadder: false });
    assert.deepEqual(accountFieldsFor("PLAYER_ADMIN"), { role: "ADMIN", participatesInLadder: true });
  });

  it("reads back the account type of an existing user", () => {
    assert.equal(accountTypeFor({ role: "PLAYER", participatesInLadder: true }), "PLAYER");
    assert.equal(accountTypeFor({ role: "ADMIN", participatesInLadder: false }), "ADMIN");
    assert.equal(accountTypeFor({ role: "ADMIN", participatesInLadder: true }), "PLAYER_ADMIN");
    // A player who has left the ladder isn't something an invite can create; it reads as PLAYER.
    assert.equal(accountTypeFor({ role: "PLAYER", participatesInLadder: false }), "PLAYER");
  });
});
