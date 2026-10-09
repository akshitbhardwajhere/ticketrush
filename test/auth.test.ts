import test from "node:test";
import assert from "node:assert/strict";
import { authInternals } from "../src/services/auth-service.js";

test("password hashes verify and do not equal the source password", async () => {
  const hash = await authInternals.hashPassword("correct horse battery staple");
  assert.notEqual(hash, "correct horse battery staple");
  assert.equal(
    await authInternals.verifyPassword("correct horse battery staple", hash),
    true,
  );
  assert.equal(
    await authInternals.verifyPassword("wrong password", hash),
    false,
  );
});

test("session token hashes are deterministic and one-way", () => {
  const token = "test-token";
  assert.equal(authInternals.hashToken(token), authInternals.hashToken(token));
  assert.notEqual(authInternals.hashToken(token), token);
});
