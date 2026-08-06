/**
 * Domain module for the pomodoro timer, modeled as a state machine.
 *
 * The state is a plain data object:
 *   { phase, startedAt, duration, paused, pausedRemainingMs, session, settings }
 * All transitions are pure functions (time is passed in). Alarms,
 * notifications and persistence are handled by the adapter (background.js).
 */

/** Default settings in minutes. */
export const POMODORO_DEFAULTS = { work: 25, shortBreak: 5, longBreak: 15, longBreakAfter: 4 };

/** Allowed value ranges for the settings (minutes or count). */
const SETTING_LIMITS = {
  work: { min: 1, max: 120 },
  shortBreak: { min: 1, max: 60 },
  longBreak: { min: 1, max: 120 },
  longBreakAfter: { min: 1, max: 10 },
};

/** Clamps settings into their ranges; invalid values fall back to defaults. */
export function sanitizeSettings(raw) {
  const out = {};
  for (const [key, { min, max }] of Object.entries(SETTING_LIMITS)) {
    const n = parseInt(raw?.[key], 10);
    out[key] = Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : POMODORO_DEFAULTS[key];
  }
  return out;
}

/** Duration of a phase in milliseconds; unknown phases count as work. */
export function phaseDurationMs(phase, settings) {
  const s = { ...POMODORO_DEFAULTS, ...(settings || {}) };
  const minutes = { work: s.work, "short-break": s.shortBreak, "long-break": s.longBreak }[phase] ?? s.work;
  return minutes * 60 * 1000;
}

/**
 * Initial state without a running timer. A session value of 0 means no work
 * phase has been completed yet, so the first work phase gets number 1. The
 * UI displays 0 as 1.
 */
export function idleState(settings = POMODORO_DEFAULTS, session = 0) {
  return {
    phase: "idle",
    startedAt: 0,
    duration: 0,
    paused: false,
    pausedRemainingMs: 0,
    session,
    settings: sanitizeSettings(settings),
  };
}

/**
 * Starts a phase. Work phases advance the session counter cyclically
 * (1 up to longBreakAfter, then back to 1); breaks leave it unchanged.
 */
export function start(prevState, phase, settings, now) {
  const s = sanitizeSettings({ ...(prevState?.settings || {}), ...(settings || {}) });
  const effectivePhase = phase || "work";
  const session =
    effectivePhase === "work"
      ? (((prevState?.session || 0) % s.longBreakAfter) + 1)
      : (prevState?.session || 1);

  return {
    phase: effectivePhase,
    startedAt: now,
    duration: phaseDurationMs(effectivePhase, s),
    paused: false,
    pausedRemainingMs: 0,
    session,
    settings: s,
  };
}

/** Freezes the remaining time. A no op while idle or already paused. */
export function pause(state, now) {
  if (!state || state.phase === "idle" || state.paused) return state;
  return {
    ...state,
    paused: true,
    pausedRemainingMs: Math.max(0, state.duration - (now - state.startedAt)),
  };
}

/**
 * Resumes with exactly the frozen remaining time. startedAt is backdated so
 * that the remaining time continues unchanged.
 */
export function resume(state, now) {
  if (!state || !state.paused || !state.pausedRemainingMs) return state;
  return {
    ...state,
    startedAt: now - (state.duration - state.pausedRemainingMs),
    paused: false,
    pausedRemainingMs: 0,
  };
}

/** Stops the timer; session counter and settings are preserved. */
export function stop(state) {
  return idleState(state?.settings || POMODORO_DEFAULTS, state?.session ?? 0);
}

/** Phase completion: the timer returns to idle (notification is adapter work). */
export function complete(state) {
  return { ...state, phase: "idle", paused: false, pausedRemainingMs: 0 };
}

/**
 * Remaining time, never negative. While idle the configured work duration
 * is shown as a preview.
 */
export function remainingMs(state, now) {
  if (!state || state.phase === "idle") {
    return phaseDurationMs("work", state?.settings);
  }
  if (state.paused) return state.pausedRemainingMs || 0;
  return Math.max(0, state.duration - (now - state.startedAt));
}
