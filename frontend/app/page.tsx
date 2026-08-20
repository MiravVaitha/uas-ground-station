"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import type { MapPoint, PlannedWaypoint } from "./components/FlightMap";
import TelemetryChart, { ChartPoint } from "./components/TelemetryChart";
import { solveRelease, type ReleaseInputs } from "./lib/release";

// MapLibre touches window/WebGL, so the map must never render on the server.
const FlightMap = dynamic(() => import("./components/FlightMap"), {
  ssr: false,
});

type TelemetryFrame = {
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

const CHART_WINDOW_S = 120;
const DEFAULT_WP_ALT_M = 100;

// Local flat-earth approximation: fine over the few hundred metres a release
// solution spans. Longitude degrees shrink towards the poles, hence the cos.
const M_PER_DEG_LAT = 111320;

function offsetToLatLon(
  origin: MapPoint,
  north_m: number,
  east_m: number
): MapPoint {
  const mPerDegLon = M_PER_DEG_LAT * Math.cos(origin.lat_deg * (Math.PI / 180));
  return {
    lat_deg: origin.lat_deg + north_m / M_PER_DEG_LAT,
    lon_deg: origin.lon_deg + east_m / mPerDegLon,
  };
}

// Adding zero turns JavaScript's -0 back into 0 so readouts never show "-0.0".
function fmt(value: number, digits = 1): string {
  return (value + 0).toFixed(digits);
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-[#1a1a19] px-3 py-2">
      <div className="text-[11px] font-medium uppercase tracking-wider text-[#898781]">
        {label}
      </div>
      <div className="text-2xl font-semibold tabular-nums text-white">
        {value}
      </div>
    </div>
  );
}

function NumField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-2 text-xs text-[#898781]">
      <span>{label}</span>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-16 rounded border border-white/10 bg-[#0d0d0d] px-1 py-0.5 text-right text-xs tabular-nums text-white"
      />
    </label>
  );
}

export default function Home() {
  const [frame, setFrame] = useState<TelemetryFrame | null>(null);
  const [connected, setConnected] = useState(false);
  const [history, setHistory] = useState<ChartPoint[]>([]);
  const [track, setTrack] = useState<[number, number][]>([]);
  const [waypoints, setWaypoints] = useState<PlannedWaypoint[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<{
    tone: "ok" | "err";
    text: string;
  } | null>(null);
  const [target, setTarget] = useState<MapPoint | null>(null);
  const [settingTarget, setSettingTarget] = useState(false);
  const [release, setRelease] = useState<ReleaseInputs>({
    groundspeed_mps: 20,
    altitude_m: 100,
    heading_deg: 0,
    wind_speed_mps: 0,
    wind_from_deg: 270,
  });

  useEffect(() => {
    let ws: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let unmounted = false;

    function connect() {
      ws = new WebSocket("ws://127.0.0.1:8000/ws");
      ws.onopen = () => setConnected(true);
      ws.onmessage = (event) => {
        const f: TelemetryFrame = JSON.parse(event.data);
        setFrame(f);
        setHistory((prev) => {
          if (prev.length > 0 && prev[prev.length - 1].time_s === f.time_s) {
            return prev; // no new position frame since last snapshot
          }
          const cutoff = f.time_s - CHART_WINDOW_S;
          return [
            ...prev.filter((p) => p.time_s >= cutoff),
            { time_s: f.time_s, alt_m: f.alt_m, battery_v: f.battery_v },
          ];
        });
        if (f.lat_deg !== undefined && f.lon_deg !== undefined) {
          setTrack((prev) => {
            const last = prev[prev.length - 1];
            if (last && last[0] === f.lon_deg && last[1] === f.lat_deg) {
              return prev;
            }
            return [...prev, [f.lon_deg!, f.lat_deg!]];
          });
        }
      };
      ws.onclose = () => {
        setConnected(false);
        if (!unmounted) retry = setTimeout(connect, 2000);
      };
    }
    connect();

    return () => {
      unmounted = true;
      clearTimeout(retry);
      ws?.close();
    };
  }, []);

  // One map click means either "drop a target" or "add a waypoint", depending
  // on whether the target button is armed.
  function handleMapClick(lat_deg: number, lon_deg: number) {
    if (settingTarget) {
      setTarget({ lat_deg, lon_deg });
      setSettingTarget(false);
      return;
    }
    setWaypoints((prev) => [
      ...prev,
      { lat_deg, lon_deg, alt_m: DEFAULT_WP_ALT_M },
    ]);
    setUploadMsg(null);
  }

  function useLiveConditions() {
    if (!frame) return;
    // Round on the way in: raw telemetry floats overflow the input boxes, and
    // sub-decimetre precision is meaningless against this model's accuracy.
    setRelease((prev) => ({
      ...prev,
      groundspeed_mps:
        Math.round((frame.groundspeed_mps ?? prev.groundspeed_mps) * 10) / 10,
      altitude_m: Math.round(frame.alt_m * 10) / 10,
      heading_deg: Math.round(frame.hdg_deg ?? prev.heading_deg),
    }));
  }

  function setWaypointAlt(index: number, alt_m: number) {
    setWaypoints((prev) =>
      prev.map((wp, i) => (i === index ? { ...wp, alt_m } : wp))
    );
  }

  function removeWaypoint(index: number) {
    setWaypoints((prev) => prev.filter((_, i) => i !== index));
    setUploadMsg(null);
  }

  async function uploadMission() {
    setUploading(true);
    setUploadMsg(null);
    try {
      const res = await fetch("http://127.0.0.1:8000/mission", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ waypoints }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(
          typeof body?.detail === "string" ? body.detail : `HTTP ${res.status}`
        );
      }
      setUploadMsg({ tone: "ok", text: `Uploaded ${waypoints.length} waypoints` });
    } catch (err) {
      setUploadMsg({
        tone: "err",
        text: err instanceof Error ? err.message : "Upload failed",
      });
    } finally {
      setUploading(false);
    }
  }

  const position =
    frame && frame.lat_deg !== undefined && frame.lon_deg !== undefined
      ? { lon: frame.lon_deg, lat: frame.lat_deg, hdg: frame.hdg_deg ?? 0 }
      : null;

  // seq 0 is home in ArduPilot, so an active mission reports wp_seq >= 1.
  const activeSeq =
    frame?.wp_seq !== undefined && frame.wp_seq >= 1 ? frame.wp_seq : null;

  const solution = release.altitude_m > 0 ? solveRelease(release) : null;
  const releasePoint =
    target && solution
      ? offsetToLatLon(target, solution.offset_north_m, solution.offset_east_m)
      : null;
  const releaseDist_m = solution
    ? Math.hypot(solution.offset_north_m, solution.offset_east_m)
    : 0;

  return (
    <div className="flex h-screen flex-col bg-[#0d0d0d] font-sans text-white">
      <header className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
        <h1 className="text-sm font-semibold uppercase tracking-widest">
          UAS Ground Station
        </h1>
        <div className="flex items-center gap-2 text-xs font-medium">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: connected ? "#0ca30c" : "#d03b3b" }}
          />
          <span className={connected ? "text-[#0ca30c]" : "text-[#d03b3b]"}>
            {connected ? "LINK OK" : "LINK DOWN"}
          </span>
        </div>
      </header>

      <main className="flex min-h-0 flex-1">
        <section className="min-w-0 flex-1">
          <FlightMap
            track={track}
            position={position}
            waypoints={waypoints}
            activeSeq={activeSeq}
            target={target}
            releasePoint={releasePoint}
            onMapClick={handleMapClick}
          />
        </section>

        <aside className="flex w-[360px] shrink-0 flex-col gap-3 overflow-y-auto border-l border-white/10 p-3">
          <div className="grid grid-cols-2 gap-3">
            <StatTile
              label="Altitude"
              value={frame ? `${frame.alt_m.toFixed(1)} m` : "—"}
            />
            <StatTile
              label="Heading"
              value={
                frame?.hdg_deg !== undefined
                  ? `${frame.hdg_deg.toFixed(0)}°`
                  : "—"
              }
            />
            <StatTile
              label="Battery"
              value={
                frame?.battery_v !== undefined
                  ? `${frame.battery_v.toFixed(2)} V`
                  : "—"
              }
            />
            <StatTile
              label="Charge"
              value={
                frame?.battery_pct !== undefined ? `${frame.battery_pct}%` : "—"
              }
            />
            <StatTile
              label="Airspeed"
              value={
                frame?.airspeed_mps !== undefined
                  ? `${fmt(frame.airspeed_mps)} m/s`
                  : "—"
              }
            />
            <StatTile
              label="Gnd speed"
              value={
                frame?.groundspeed_mps !== undefined
                  ? `${fmt(frame.groundspeed_mps)} m/s`
                  : "—"
              }
            />
          </div>

          <div className="rounded-lg border border-white/10 bg-[#1a1a19] p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-[#c3c2b7]">
                Mission
              </span>
              {waypoints.length > 0 && (
                <button
                  onClick={() => {
                    setWaypoints([]);
                    setUploadMsg(null);
                  }}
                  className="text-[11px] text-[#898781] hover:text-white"
                >
                  Clear
                </button>
              )}
            </div>

            {waypoints.length === 0 ? (
              <p className="text-xs text-[#898781]">
                Click the map to add waypoints.
              </p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {waypoints.map((wp, i) => {
                  const active = activeSeq === i + 1;
                  return (
                    <li
                      key={i}
                      className={`flex items-center gap-2 rounded px-1.5 py-1 text-xs tabular-nums ${
                        active ? "bg-[#3987e5]/15" : ""
                      }`}
                    >
                      <span
                        className={`w-4 text-center font-semibold ${
                          active ? "text-[#3987e5]" : "text-[#898781]"
                        }`}
                      >
                        {i + 1}
                      </span>
                      <span className="flex-1 text-[#c3c2b7]">
                        {wp.lat_deg.toFixed(5)}, {wp.lon_deg.toFixed(5)}
                      </span>
                      <input
                        type="number"
                        value={wp.alt_m}
                        onChange={(e) =>
                          setWaypointAlt(i, Number(e.target.value))
                        }
                        className="w-14 rounded border border-white/10 bg-[#0d0d0d] px-1 py-0.5 text-right text-xs text-white"
                      />
                      <span className="text-[#898781]">m</span>
                      <button
                        onClick={() => removeWaypoint(i)}
                        className="px-0.5 text-[#898781] hover:text-[#d03b3b]"
                        aria-label={`Remove waypoint ${i + 1}`}
                      >
                        ×
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            <button
              onClick={uploadMission}
              disabled={!connected || uploading || waypoints.length === 0}
              className="mt-2 w-full rounded bg-[#3987e5] py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#4a94ea] disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-[#898781]"
            >
              {uploading ? "Uploading…" : "Upload mission"}
            </button>

            {uploadMsg && (
              <p
                className={`mt-1.5 text-[11px] ${
                  uploadMsg.tone === "ok" ? "text-[#0ca30c]" : "text-[#d03b3b]"
                }`}
              >
                {uploadMsg.text}
              </p>
            )}

            {activeSeq !== null && (
              <p className="mt-1.5 text-[11px] text-[#c3c2b7]">
                En route to WP {activeSeq}
                {frame?.wp_dist_m !== undefined &&
                  ` — ${frame.wp_dist_m.toFixed(0)} m`}
              </p>
            )}
          </div>

          <div className="rounded-lg border border-white/10 bg-[#1a1a19] p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-[#c3c2b7]">
                Payload release
              </span>
              <button
                onClick={() => setSettingTarget((v) => !v)}
                className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${
                  settingTarget
                    ? "bg-[#d95926] text-white"
                    : "text-[#898781] hover:text-white"
                }`}
              >
                {settingTarget ? "Click the map…" : "Set target"}
              </button>
            </div>

            {target ? (
              <p className="mb-2 text-[11px] tabular-nums text-[#898781]">
                Target {target.lat_deg.toFixed(5)}, {target.lon_deg.toFixed(5)}
              </p>
            ) : (
              <p className="mb-2 text-xs text-[#898781]">
                Set a target to see the release point.
              </p>
            )}

            <div className="flex flex-col gap-1.5">
              <NumField
                label="Gnd speed m/s"
                value={release.groundspeed_mps}
                onChange={(v) =>
                  setRelease((p) => ({ ...p, groundspeed_mps: v }))
                }
              />
              <NumField
                label="Altitude m"
                value={release.altitude_m}
                onChange={(v) => setRelease((p) => ({ ...p, altitude_m: v }))}
              />
              <NumField
                label="Heading °"
                value={release.heading_deg}
                onChange={(v) => setRelease((p) => ({ ...p, heading_deg: v }))}
              />
              <NumField
                label="Wind m/s"
                value={release.wind_speed_mps}
                onChange={(v) =>
                  setRelease((p) => ({ ...p, wind_speed_mps: v }))
                }
              />
              <NumField
                label="Wind from °"
                value={release.wind_from_deg}
                onChange={(v) => setRelease((p) => ({ ...p, wind_from_deg: v }))}
              />
            </div>

            <button
              onClick={useLiveConditions}
              disabled={!frame}
              className="mt-2 w-full rounded border border-white/10 py-1 text-[11px] font-medium text-[#c3c2b7] hover:border-white/25 hover:text-white disabled:cursor-not-allowed disabled:text-[#898781] disabled:hover:border-white/10"
            >
              Use live conditions
            </button>

            {solution && (
              <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 border-t border-white/10 pt-2 text-[11px] tabular-nums">
                <dt className="text-[#898781]">Fall time</dt>
                <dd className="text-right text-white">
                  {fmt(solution.fall_time_s, 2)} s
                </dd>
                <dt className="text-[#898781]">Forward carry</dt>
                <dd className="text-right text-white">
                  {fmt(solution.forward_carry_m)} m
                </dd>
                <dt className="text-[#898781]">Wind drift</dt>
                <dd className="text-right text-white">
                  {fmt(solution.wind_drift_m)} m
                </dd>
                <dt className="text-[#d95926]">Release before</dt>
                <dd className="text-right font-semibold text-[#d95926]">
                  {fmt(releaseDist_m)} m
                </dd>
              </dl>
            )}
          </div>

          <TelemetryChart
            title="Altitude"
            unit="m"
            data={history}
            dataKey="alt_m"
            color="#3987e5"
            domain={[0, "auto"]}
          />
          <TelemetryChart
            title="Battery"
            unit="V"
            data={history}
            dataKey="battery_v"
            color="#d95926"
          />
        </aside>
      </main>
    </div>
  );
}
