/**
 * Business level tests for the screen time session rules.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  closeSession,
  isSignificantSession,
  applySessionToPageStats,
  prependRecentSession,
  isResumableSession,
  MIN_SESSION_MS,
  MAX_RECENT_SESSIONS,
} from "../src/core/tracking.js";

const baseSession = {
  hostname: "example.com",
  url: "https://example.com/a",
  title: "Example",
  startedAt: 1000,
  endedAt: 61000,
  durationMs: 60000,
};

test("closing a session computes the duration and records the end reason", () => {
  const closed = closeSession({ hostname: "example.com", startedAt: 5000 }, 12000, "tab-removed");
  assert.equal(closed.durationMs, 7000);
  assert.equal(closed.reason, "tab-removed");
  // clock jumps must never produce a negative duration
  assert.equal(closeSession({ startedAt: 9000 }, 5000, "x").durationMs, 0);
});

test("sessions below two seconds are not significant", () => {
  assert.equal(isSignificantSession({ durationMs: MIN_SESSION_MS - 1 }), false);
  assert.equal(isSignificantSession({ durationMs: MIN_SESSION_MS }), true);
  assert.equal(isSignificantSession(null), false);
});

test("the first session of a domain creates its statistics entry", () => {
  const stats = applySessionToPageStats({}, baseSession);
  const entry = stats["example.com"];
  assert.equal(entry.totalMs, 60000);
  assert.equal(entry.visits, 1);
  assert.equal(entry.lastVisitAt, 61000);
  assert.equal(entry.lastUrl, "https://example.com/a");
  assert.equal(entry.lastTitle, "Example");
});

test("subsequent sessions accumulate total time and visits", () => {
  const first = applySessionToPageStats({}, baseSession);
  const second = applySessionToPageStats(first, {
    ...baseSession,
    startedAt: 70000,
    endedAt: 100000,
    durationMs: 30000,
    url: "https://example.com/b",
    title: "",
  });
  const entry = second["example.com"];
  assert.equal(entry.totalMs, 90000);
  assert.equal(entry.visits, 2);
  assert.equal(entry.lastVisitAt, 100000);
  assert.equal(entry.lastUrl, "https://example.com/b");
  // an empty title must not overwrite the last known title
  assert.equal(entry.lastTitle, "Example");
  // purity: the previous statistics stay untouched
  assert.equal(first["example.com"].visits, 1);
});

test("the history keeps newest first and is capped at 200 entries", () => {
  let recent = [];
  for (let i = 0; i < MAX_RECENT_SESSIONS + 10; i++) {
    recent = prependRecentSession(recent, { ...baseSession, startedAt: i });
  }
  assert.equal(recent.length, MAX_RECENT_SESSIONS);
  assert.equal(recent[0].startedAt, MAX_RECENT_SESSIONS + 9); // newest first
});

test("open sessions are only resumable for up to twelve hours", () => {
  const now = Date.now();
  const elevenHours = 11 * 60 * 60 * 1000;
  const thirteenHours = 13 * 60 * 60 * 1000;
  assert.equal(isResumableSession({ startedAt: now - elevenHours }, now), true);
  assert.equal(isResumableSession({ startedAt: now - thirteenHours }, now), false);
  assert.equal(isResumableSession(null, now), false);
});
