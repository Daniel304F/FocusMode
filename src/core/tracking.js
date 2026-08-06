/**
 * Domain module for screen time tracking: session rules and aggregation
 * into the per site statistics.
 *
 * Pure functions; the current time is always passed in as a parameter so
 * every rule stays deterministic and testable.
 */

/** Sessions shorter than this are considered noise and are discarded. */
export const MIN_SESSION_MS = 2000;
/** Upper bound of the locally kept session history. */
export const MAX_RECENT_SESSIONS = 200;
/** Upper bound of the queue for the optional tracker server. */
export const MAX_PENDING_SESSIONS = 500;
/** Sessions older than this are treated as orphaned after a restart. */
export const MAX_RESUMABLE_SESSION_AGE_MS = 12 * 60 * 60 * 1000;

/**
 * Closes an active session and computes its duration. The reason documents
 * why the session ended (tab switch, window blur, ...).
 */
export function closeSession(activeSession, endedAt, reason) {
  return {
    ...activeSession,
    endedAt,
    durationMs: Math.max(0, endedAt - activeSession.startedAt),
    reason,
  };
}

/** Only sessions of at least the minimum duration count towards statistics. */
export function isSignificantSession(session) {
  return Number(session?.durationMs || 0) >= MIN_SESSION_MS;
}

/**
 * Applies a finished session to the per site statistics map. Returns a new
 * map; the input stays untouched.
 */
export function applySessionToPageStats(pageStats, session) {
  const existing = pageStats[session.hostname] || {
    hostname: session.hostname,
    totalMs: 0,
    visits: 0,
    lastVisitAt: 0,
    lastUrl: session.url,
    lastTitle: session.title || session.hostname,
  };

  return {
    ...pageStats,
    [session.hostname]: {
      ...existing,
      totalMs: existing.totalMs + session.durationMs,
      visits: existing.visits + 1,
      lastVisitAt: session.endedAt,
      lastUrl: session.url,
      lastTitle: session.title || existing.lastTitle,
    },
  };
}

/** Prepends a session to the history (newest first, capped at max entries). */
export function prependRecentSession(recent, session, max = MAX_RECENT_SESSIONS) {
  const entry = {
    hostname: session.hostname,
    url: session.url,
    title: session.title || session.hostname,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    durationMs: session.durationMs,
  };
  return [entry, ...(recent || [])].slice(0, max);
}

/**
 * Decides after a restart whether a stored open session may be resumed or
 * has to be discarded as orphaned.
 */
export function isResumableSession(session, now, maxAgeMs = MAX_RESUMABLE_SESSION_AGE_MS) {
  if (!session || !session.startedAt) return false;
  return now - session.startedAt <= maxAgeMs;
}
