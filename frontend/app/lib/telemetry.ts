/**
 * The normalized telemetry format, v1 — the only shape the UI ever sees.
 *
 * Live mode gets these frames over the WebSocket (translated from MAVLink by
 * backend/telemetry.py); replay mode reads them from a recorded JSON log. The
 * format only ever grows by adding optional fields, never by renaming or
 * re-scaling one, so logs recorded today stay playable.
 */
export type TelemetryFrame = {
  schema: number;
  time_s: number;
  alt_m: number;
  lat_deg?: number;
  lon_deg?: number;
  hdg_deg?: number;
  battery_v?: number;
  battery_pct?: number;
  wp_seq?: number;
  wp_dist_m?: number;
  airspeed_mps?: number;
  groundspeed_mps?: number;
};
