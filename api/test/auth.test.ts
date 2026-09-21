import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { signAccessToken, type AccessTokenPayload } from "../src/auth/authConfig.js";
import { hashPassword } from "../src/auth/passwordUtils.js";
import { createRegistrationCode, createUser, prisma, resetDatabase } from "./helpers/db.js";
import { apiBaseUrl, apiClient, stopApi } from "./helpers/http.js";

before(apiBaseUrl);
beforeEach(resetDatabase);
after(async () => {
  await stopApi();
  await prisma.$disconnect();
});

const PASSWORD = "correct-horse-battery";

/** A registered player who can sign in, with the password hashing done once per test. */
async function playerWithPassword(email: string) {
  return createUser({ email, passwordHash: await hashPassword(PASSWORD) });
}

describe("registering with an invite code", () => {
  it("creates the account the invite describes and opens a session", async () => {
    const admin = await createUser({ role: "ADMIN" });
    await createRegistrationCode(admin.id, { code: "101010", accountType: "PLAYER_ADMIN" });
    const client = apiClient();

    const response = await client.post("/api/auth/register", {
      firstName: "Nina",
      lastName: "Patel",
      email: "Nina@Example.Test",
      password: PASSWORD,
      ustaRating: "3.5",
      registrationCode: "101010",
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.user.email, "nina@example.test");
    assert.ok(response.body.accessToken);
    assert.equal(client.hasCookie("refreshToken"), true);

    // The invite, not the registrant, decides what the account is.
    const user = await prisma.user.findUniqueOrThrow({ where: { email: "nina@example.test" } });
    assert.equal(user.role, "ADMIN");
    assert.equal(user.participatesInLadder, true);
    // Redeeming a code is what "finished signing up" means.
    assert.notEqual(user.profileCompletedAt, null);

    const code = await prisma.registrationCode.findFirstOrThrow({ where: { code: "101010" } });
    assert.notEqual(code.usedAt, null);
  });

  it("refuses an unknown code without creating an account", async () => {
    const client = apiClient();

    const response = await client.post("/api/auth/register", {
      firstName: "Nina",
      lastName: "Patel",
      email: "nina@example.test",
      password: PASSWORD,
      registrationCode: "999999",
    });

    assert.equal(response.status, 400);
    assert.match(response.body.error, /Invalid or already-used/);
    assert.equal(await prisma.user.count(), 0);
    assert.equal(client.hasCookie("refreshToken"), false);
  });
});

describe("signing in", () => {
  it("issues an access token and a refresh cookie", async () => {
    await playerWithPassword("signin@example.test");
    const client = apiClient();

    const response = await client.post("/api/auth/login", {
      email: "signin@example.test",
      password: PASSWORD,
    });

    assert.equal(response.status, 200);
    assert.ok(response.body.accessToken);
    assert.equal(client.hasCookie("refreshToken"), true);
    assert.equal(await prisma.refreshToken.count(), 1);
  });

  it("refuses the wrong password, and says nothing about a removed account", async () => {
    const user = await playerWithPassword("removed@example.test");
    await prisma.user.update({ where: { id: user.id }, data: { removedAt: new Date() } });
    const client = apiClient();

    const wrongPassword = await client.post("/api/auth/login", {
      email: "removed@example.test",
      password: "not-the-password",
    });
    // The same 401 a live account gets: the removal is only disclosed to someone who knows the
    // password already.
    assert.equal(wrongPassword.status, 401);

    const rightPassword = await client.post("/api/auth/login", {
      email: "removed@example.test",
      password: PASSWORD,
    });
    assert.equal(rightPassword.status, 403);
    assert.equal(client.hasCookie("refreshToken"), false);
  });
});

describe("the refresh token", () => {
  async function signedIn(email: string) {
    const user = await playerWithPassword(email);
    const client = apiClient();
    const login = await client.post("/api/auth/login", { email, password: PASSWORD });
    assert.equal(login.status, 200);
    return { user, client };
  }

  it("is not rotated, so concurrent refreshes don't race each other into a 401", async () => {
    const { client } = await signedIn("refresh@example.test");
    const original = client.cookie("refreshToken");

    // Two calls with the same cookie, as the SPA makes on mount under React StrictMode.
    const [first, second] = await Promise.all([
      client.post("/api/auth/refresh"),
      client.post("/api/auth/refresh"),
    ]);

    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.ok(first.body.accessToken);
    // Same token still in the cookie, and still the only row: rotation was tried and reverted.
    assert.equal(client.cookie("refreshToken"), original);
    assert.equal(await prisma.refreshToken.count(), 1);

    const third = await client.post("/api/auth/refresh");
    assert.equal(third.status, 200);
  });

  it("mints a distinct token per sign-in, so two sessions don't collide on the hash", async () => {
    const user = await playerWithPassword("twice@example.test");
    const one = apiClient();
    const two = apiClient();

    await one.post("/api/auth/login", { email: "twice@example.test", password: PASSWORD });
    await two.post("/api/auth/login", { email: "twice@example.test", password: PASSWORD });

    // Without the jti, two tokens minted for the same user in the same second would be identical
    // JWTs and hit the refresh_tokens.tokenHash unique constraint.
    assert.notEqual(one.cookie("refreshToken"), two.cookie("refreshToken"));
    assert.equal(await prisma.refreshToken.count({ where: { userId: user.id } }), 2);
  });

  it("stops working after logout", async () => {
    const { client } = await signedIn("logout@example.test");
    const accessToken = (await client.post("/api/auth/refresh")).body.accessToken;
    const stale = client.cookie("refreshToken") as string;

    const logout = await client.post("/api/auth/logout", undefined, { accessToken });
    assert.equal(logout.status, 204);
    assert.equal(client.hasCookie("refreshToken"), false);

    // The browser dropped the cookie; a copy of it kept elsewhere is revoked too.
    client.setCookie("refreshToken", stale);
    const response = await client.post("/api/auth/refresh");
    assert.equal(response.status, 401);
  });

  it("stops working once the account is removed", async () => {
    const { user, client } = await signedIn("gone@example.test");

    await prisma.user.update({ where: { id: user.id }, data: { removedAt: new Date() } });

    const response = await client.post("/api/auth/refresh");
    assert.equal(response.status, 401);
    assert.equal(client.hasCookie("refreshToken"), false);
  });

  it("refuses a request with no cookie, and one whose row was never stored", async () => {
    const withoutCookie = apiClient();
    assert.equal((await withoutCookie.post("/api/auth/refresh")).status, 401);

    const { client } = await signedIn("forged@example.test");
    const real = client.cookie("refreshToken") as string;
    // Signature still valid, but the refresh_tokens row is gone — a revoked or pruned session.
    await prisma.refreshToken.deleteMany({});
    client.setCookie("refreshToken", real);
    assert.equal((await client.post("/api/auth/refresh")).status, 401);
  });
});

describe("profileComplete gating", () => {
  function tokenFor(user: { id: string }, overrides: Partial<AccessTokenPayload> = {}) {
    return signAccessToken({
      sub: user.id,
      role: "PLAYER",
      participatesInLadder: true,
      profileComplete: true,
      ...overrides,
    });
  }

  it("blocks a half-finished signup from the app but lets it reach its own session", async () => {
    // A Google-first signup that hasn't redeemed an invite code yet.
    const user = await createUser({ profileCompletedAt: null });
    const accessToken = tokenFor(user, { profileComplete: false });
    const client = apiClient();

    const ladder = await client.get("/api/players", { accessToken });
    assert.equal(ladder.status, 403);
    assert.equal(ladder.body.code, "PROFILE_INCOMPLETE");

    // The three endpoints such an account still has to reach.
    const session = await client.get("/api/auth/session", { accessToken });
    assert.equal(session.status, 200);
    assert.equal(session.body.user.id, user.id);
  });

  it("lets a completed profile through", async () => {
    const user = await createUser();
    const client = apiClient();

    const ladder = await client.get("/api/players", { accessToken: tokenFor(user) });
    assert.equal(ladder.status, 200);
  });

  it("treats a token minted before the claim existed as complete", async () => {
    const user = await createUser();
    // Tokens issued before profileComplete was added carry no opinion; only an explicit false
    // means incomplete, or every signed-in player would be locked out by a deploy.
    const legacyToken = signAccessToken({
      sub: user.id,
      role: "PLAYER",
      participatesInLadder: true,
    } as AccessTokenPayload);
    const client = apiClient();

    assert.equal((await client.get("/api/players", { accessToken: legacyToken })).status, 200);
  });

  it("refuses a missing or unparseable bearer token", async () => {
    const client = apiClient();

    assert.equal((await client.get("/api/players")).status, 401);
    assert.equal((await client.get("/api/players", { accessToken: "nonsense" })).status, 401);
  });
});
