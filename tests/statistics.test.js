/**
 * Business level tests for the screen time evaluation.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  aggregateSessions,
  buildDailySeries,
  sortPageStats,
  liveTotalMs,
  toDateStr,
} from "../src/core/statistics.js";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Fixed reference point: noon local time today. */
function noonToday() {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  return d.getTime();
}

test("today only counts sessions that started today", () => {
  const now = noonToday();
  const sessions = [
    { startedAt: now - 60 * 60 * 1000, durationMs: 1000 },      // this morning
    { startedAt: now - DAY_MS, durationMs: 2000 },              // yesterday
  ];
  const { todayMs } = aggregateSessions(sessions, now);
  assert.equal(todayMs, 1000);
});

test("the week covers the last seven calendar days including today", () => {
  const now = noonToday();
  const sessions = [
    { startedAt: now, durationMs: 100 },                         // today
    { startedAt: now - 6 * DAY_MS, durationMs: 200 },            // six days ago (inside)
    { startedAt: now - 8 * DAY_MS, durationMs: 400 },            // eight days ago (outside)
  ];
  const { weekMs } = aggregateSessions(sessions, now);
  assert.equal(weekMs, 300);
});

test("sessions without a start or duration are ignored", () => {
  const now = noonToday();
  const { todayMs, weekMs } = aggregateSessions(
    [{ startedAt: 0, durationMs: 500 }, { startedAt: now, durationMs: 0 }, {}],
    now
  );
  assert.equal(todayMs, 0);
  assert.equal(weekMs, 0);
});

test("the daily series has seven entries, oldest first, today marked", () => {
  const now = noonToday();
  const todayKey = toDateStr(new Date(now));
  const series = buildDailySeries({ [todayKey]: 5000 }, now);

  assert.equal(series.length, 7);
  assert.equal(series[6].isToday, true);
  assert.equal(series[6].label, "Heute");
  assert.equal(series[6].totalMs, 5000);
  // days without usage appear with zero
  assert.ok(series.slice(0, 6).every((d) => d.totalMs === 0 && !d.isToday));
});

test("top sites are sortable by time and visits in both directions", () => {
  const entries = [
    { hostname: "a.com", totalMs: 100, visits: 9 },
    { hostname: "b.com", totalMs: 300, visits: 1 },
    { hostname: "c.com", totalMs: 200, visits: 5 },
  ];
  assert.deepEqual(sortPageStats(entries, "totalMs", "desc").map((e) => e.hostname), ["b.com", "c.com", "a.com"]);
  assert.deepEqual(sortPageStats(entries, "totalMs", "asc").map((e) => e.hostname), ["a.com", "c.com", "b.com"]);
  assert.deepEqual(sortPageStats(entries, "visits", "desc").map((e) => e.hostname), ["a.com", "c.com", "b.com"]);
  // the input stays unchanged
  assert.equal(entries[0].hostname, "a.com");
});

test("live time adds the running session only for the matching domain", () => {
  const now = 100000;
  const active = { hostname: "example.com", startedAt: 40000 };
  assert.equal(liveTotalMs(5000, active, "example.com", now), 65000);
  assert.equal(liveTotalMs(5000, active, "other.com", now), 5000);
  assert.equal(liveTotalMs(5000, null, "example.com", now), 5000);
});
