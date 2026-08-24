/** Heartbeats are telemetry only. Background tabs are routinely throttled by
 * browsers, so missing polls must never be interpreted as a disconnect. */
export function markStaleParticipants() {
  return false;
}
