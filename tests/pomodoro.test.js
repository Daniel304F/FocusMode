/**
 * Business level tests for the pomodoro state machine.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  POMODORO_DEFAULTS,
  sanitizeSettings,
  phaseDurationMs,
  idleState,
  start,
  pause,
  resume,
  stop,
  complete,
  remainingMs,
} from "../src/core/pomodoro.js";

const MIN = 60 * 1000;

test("defaults: 25/5/15 minutes and a long break after four units", () => {
  assert.deepEqual(POMODORO_DEFAULTS, { work: 25, shortBreak: 5, longBreak: 15, longBreakAfter: 4 });
  assert.equal(phaseDurationMs("work", POMODORO_DEFAULTS), 25 * MIN);
  assert.equal(phaseDurationMs("short-break", POMODORO_DEFAULTS), 5 * MIN);
  assert.equal(phaseDurationMs("long-break", POMODORO_DEFAULTS), 15 * MIN);
  // an unknown phase counts as work
  assert.equal(phaseDurationMs("unknown", POMODORO_DEFAULTS), 25 * MIN);
});

test("settings are clamped into their ranges, invalid values fall back to defaults", () => {
  assert.deepEqual(
    sanitizeSettings({ work: 999, shortBreak: 0, longBreak: "abc", longBreakAfter: 7 }),
    { work: 120, shortBreak: 1, longBreak: 15, longBreakAfter: 7 }
  );
  assert.deepEqual(sanitizeSettings(undefined), POMODORO_DEFAULTS);
});

test("work phases advance the session counter cyclically", () => {
  let s = idleState();
  const sessions = [];
  for (let i = 0; i < 6; i++) {
    s = start(s, "work", undefined, 0);
    sessions.push(s.session);
  }
  // longBreakAfter is 4, so the sequence wraps around
  assert.deepEqual(sessions, [1, 2, 3, 4, 1, 2]);
});

test("breaks do not change the session counter", () => {
  let s = start(idleState(), "work", undefined, 0);
  s = start(s, "work", undefined, 0);
  assert.equal(s.session, 2);
  const brk = start(s, "short-break", undefined, 0);
  assert.equal(brk.session, 2);
  assert.equal(brk.phase, "short-break");
});

test("pausing freezes the remaining time exactly, resuming continues with it", () => {
  const t0 = 1_000_000;
  let s = start(idleState(), "work", undefined, t0);

  const t1 = t0 + 10 * MIN;
  s = pause(s, t1);
  assert.equal(s.paused, true);
  assert.equal(s.pausedRemainingMs, 15 * MIN);
  // time passes while paused, the remaining time stays frozen
  assert.equal(remainingMs(s, t1 + 60 * MIN), 15 * MIN);

  const t2 = t1 + 60 * MIN;
  s = resume(s, t2);
  assert.equal(s.paused, false);
  assert.equal(remainingMs(s, t2), 15 * MIN);
  assert.equal(remainingMs(s, t2 + 5 * MIN), 10 * MIN);
});

test("pausing while idle and duplicate transitions are no ops", () => {
  const idle = idleState();
  assert.equal(pause(idle, 1000), idle);

  const t0 = 0;
  const running = start(idleState(), "work", undefined, t0);
  const paused = pause(running, 5 * MIN);
  assert.equal(pause(paused, 6 * MIN), paused);   // pausing twice
  assert.equal(resume(running, 6 * MIN), running); // resuming without a pause
});

test("stopping resets to idle but keeps counter and settings", () => {
  const settings = { work: 50, shortBreak: 10, longBreak: 20, longBreakAfter: 2 };
  let s = start(idleState(settings), "work", settings, 0);
  s = start(s, "work", settings, 0);
  const stopped = stop(s);
  assert.equal(stopped.phase, "idle");
  assert.equal(stopped.session, 2);
  assert.deepEqual(stopped.settings, settings);
});

test("phase completion returns the timer to idle", () => {
  const s = start(idleState(), "work", undefined, 0);
  const done = complete(s);
  assert.equal(done.phase, "idle");
  assert.equal(done.paused, false);
  assert.equal(done.pausedRemainingMs, 0);
});

test("remaining time is never negative; while idle it previews the work duration", () => {
  const s = start(idleState(), "work", undefined, 0);
  assert.equal(remainingMs(s, 26 * MIN), 0); // expired means zero, never negative

  const custom = idleState({ work: 50, shortBreak: 5, longBreak: 15, longBreakAfter: 4 });
  assert.equal(remainingMs(custom, 123456), 50 * MIN);
  assert.equal(remainingMs(null, 0), 25 * MIN);
});
