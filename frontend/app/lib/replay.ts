import type { TelemetryFrame } from "./telemetry";

/**
 * Replay mode: a recorded flight served as a static file from public/, so it
 * plays with no backend, no SITL and no network beyond the page itself. This
 * is the project's hard constraint, and keeping the log static is what
 * guarantees it.
 */
export const REPLAY_URL = "/replay/flight.json";

export async function loadReplay(): Promise<TelemetryFrame[]> {
  const res = await fetch(REPLAY_URL);
  if (!res.ok) {
    throw new Error(`no replay log at ${REPLAY_URL} (HTTP ${res.status})`);
  }
  const frames: unknown = await res.json();
  if (!Array.isArray(frames) || frames.length === 0) {
    throw new Error("replay log is empty");
  }
  return frames as TelemetryFrame[];
}

/** Recorded wall-clock span, from the vehicle's own boot clock. */
export function replayDuration(frames: TelemetryFrame[]): number {
  if (frames.length === 0) return 0;
  return frames[frames.length - 1].time_s - frames[0].time_s;
}
