# UAS Ground Control Station

Ground control station for a fixed-wing UAS. Next.js frontend, FastAPI + pymavlink backend, ArduPilot SITL as the simulated vehicle.

## Stack

- **Frontend**: Next.js (App Router) + TypeScript + Tailwind — `frontend/`
- **Backend**: Python 3.12, FastAPI + pymavlink — `backend/`, venv at `backend/.venv`
- **Vehicle**: ArduPilot SITL (ArduPlane) in WSL2 Ubuntu 24.04
- **Links**: MAVLink over UDP `127.0.0.1:14550` (SITL → backend); WebSocket (backend → browser)

## Two modes

- **Live**: backend listens on UDP 14550, translates MAVLink into a normalized telemetry format, streams it to the browser over WebSocket.
- **Replay**: frontend plays a recorded telemetry log from static JSON already in the normalized format. Backend completely off.

The frontend consumes only the normalized telemetry format, never raw MAVLink. Both modes must produce identically shaped data.

## Hard constraints

1. **Replay mode must work with no backend running.** The most important constraint in the project. Never break it.
2. No new dependencies without asking first.
3. One vertical slice at a time. No scaffolding ahead.

## Working agreements

- User is strong in Next.js/TS/Tailwind; new to MAVLink, drone software, and Python backends. Explain the reasoning behind implementation choices, not just the code.
- Any manual action (installs, commands in a separate terminal, accounts, hardware): STOP, give exact numbered steps, wait for confirmation before continuing.
- The user writes these themselves, guided by a walkthrough — never produce them wholesale:
  1. MAVLink message decoding
  2. Payload release maths
- The user runs all git commits and pushes; supply commands and commit messages.
- Concise. No filler.
- CLAUDE.md and README stay purely technical — no applications, teams, or motivation.
- Log every problem + solution in NOTES.md with dates. Update CLAUDE.md whenever a stack or architecture decision lands.

## Dev environment

- SITL: WSL2 Ubuntu 24.04, ArduPilot source at `~/ardupilot`. Start with `sim_vehicle.py -v ArduPlane --out udp:127.0.0.1:14550` — the explicit `--out` is required: under mirrored networking, sim_vehicle's WSL2 host-IP auto-detection resolves to the LAN gateway and telemetry never reaches Windows (see NOTES.md 2026-08-16).
- WSL networking: mirrored mode (`%UserProfile%\.wslconfig`) so WSL2 and Windows share `127.0.0.1` — SITL's default UDP output on 14550 reaches Windows listeners directly. Fallback if it misbehaves: remove `.wslconfig` (back to NAT) and add `--out udp:<windows-ip>:14550` to `sim_vehicle.py`.
- Backend Python runs on native Windows (Python 3.12 via winget), venv at `backend/.venv`.

## Build order

- [x] 1. SITL running + terminal altitude readout — done 2026-08-16 (`backend/print_altitude.py`, capture 1 in docs/media)
- [x] 2. FastAPI + WebSocket bridge, one live telemetry value in the browser, unstyled — done 2026-08-16 (`backend/app.py` + user-written `backend/telemetry.py`, `frontend/app/page.tsx`, capture 2 in docs/media)
- [x] 3. Map track + altitude and battery time series — done 2026-08-17 (`FlightMap.tsx`, `TelemetryChart.tsx`, dark dashboard `page.tsx`, capture 3 in docs/media)
- [x] 4. Waypoint upload and mission monitoring — done 2026-08-17 (`backend/mission.py`, `POST /mission` in `app.py`, mission panel + waypoint markers in frontend, capture 4 in docs/media)
- [x] 5. Payload release point solver (airspeed, altitude, wind in; drop trigger point out) — done 2026-08-20 (user-written `frontend/app/lib/release.ts`, release panel + target/release markers, capture 5 in docs/media)
- [x] 6. Replay mode from a recorded log, then README with a GIF — done 2026-08-20 (recorder in `app.py`, `backend/make_replay.py`, `frontend/app/lib/replay.ts`, live/replay toggle + transport bar in `page.tsx`, README, capture 6 in docs/media)

## Media protocol

All captures go in `docs/media/`. GIFs 10–15 s, compressed for fast README loading. STOP at each capture point, specify what to record and the filename, wait for confirmation. **Warn before any change that would destroy a capture opportunity** (restyling, UI refactors, replacing placeholder data).

Capture points:
1. `01-sitl-altitude-terminal.png` — SITL + pymavlink terminal printing live altitude (still)
2. First live value in the browser, pre-CSS (short GIF) — unrecoverable once styled
3. Map track drawing during a SITL flight + telemetry panel updating (GIF, README hero)
4. Waypoint mission on the map (still)
5. Release solver inputs + computed drop point (still or GIF)
6. Replay mode with backend confirmed off (GIF)
7. Optional: SITL console + browser side by side, matching values

## Decision log

- **2026-08-14 — SITL runs in WSL2 Ubuntu 24.04, not Docker.** WSL2 is ArduPilot's supported Windows path; SITL is flown interactively from the MAVProxy console; there is no official maintained SITL runtime image (Docker would mean owning a Dockerfile plus UDP port-mapping quirks); Docker Desktop runs on WSL2 anyway, so it adds a layer without removing one.
- **2026-08-14 — Backend on native Windows, WSL2 in mirrored networking mode.** Shared `127.0.0.1` lets SITL's default 14550 output reach a Windows listener with zero forwarding, and the terminal altitude script proves the exact UDP path the FastAPI bridge will later use.
- **2026-08-14 — Normalized telemetry format.** The frontend never sees raw MAVLink: live mode translates, replay mode is pre-recorded in the same shape. Forced by the replay-without-backend constraint; keeps the UI decoupled from any one telemetry transport.
- **2026-08-16 — Normalized telemetry v1: `{"schema": 1, "time_s": float, "alt_m": float}`.** Flat JSON, SI units, unit suffix in every field name; conversions happen once, in `backend/telemetry.py`. The format grows by adding fields, never renaming or re-scaling — replay logs recorded to disk must stay playable forever; `schema` stamps the version for future readers.
- **2026-08-17 — Map: MapLibre GL (react-map-gl/maplibre) with OpenFreeMap `fiord` style; charts: Recharts.** GPU vector map, no API key, dark GCS look; telemetry format v1 grew additively (lat_deg, lon_deg, hdg_deg, battery_v, battery_pct). MapLibre's Web Worker must be served from `frontend/public/` (`setWorkerUrl`) because Turbopack breaks its module worker — see NOTES.md 2026-08-16; re-copy the two .mjs files on maplibre-gl upgrades.
- **2026-08-20 — Replay: always-on recorder, static JSON asset, explicit mode toggle, one fold into the UI.** The recorder is a second consumer of the same `latest` snapshot at the same 5 Hz the WebSocket uses, so a recording is byte-identical to what the browser saw — this is the payoff of the slice-2 snapshot design, which supports N independent consumers where a queue would have to be split. JSONL while recording (a killed backend still leaves a valid file), a JSON array for playback (one `fetch`); `backend/make_replay.py` trims one flight into `frontend/public/replay/flight.json`, which **is committed** — replay must work for anyone who clones the repo. `time_s` is the vehicle boot clock and resets on vehicle restart, so the script splits a recording into flights and defaults to the longest. Mode is an explicit header toggle, never an automatic fallback on WebSocket failure: auto-magic would leave the viewer unsure which mode is on screen. Both modes fold frames through one pure `appendFrame(view, frame)` in `page.tsx` — live folds each WebSocket message, replay folds `frames.slice(0, playhead)` — so the two modes cannot drift apart and seeking backwards is a shorter fold rather than a second code path.
- **2026-08-20 — Release solver is a pure frontend function, not a backend endpoint.** `frontend/app/lib/release.ts` exports `solveRelease(ReleaseInputs) → ReleaseSolution`: fall time `√(2h/g)`, forward carry `groundspeed × t` along the heading, wind drift `windspeed × t` toward `wind_from + 180`, each decomposed to north/east (compass convention: north = cos, east = sin) and negated to give the release point relative to the target. It is planning, not vehicle communication, so a network hop would buy nothing; being pure it recomputes instantly on every input change and keeps working with the backend off, which slice 6's replay mode inherits. First-order model — no drag on the carry, payload assumed to couple to the wind instantly; state this wherever the numbers are presented. Metre offsets convert to lat/lon in `page.tsx` via a local flat-earth approximation (111,320 m per degree latitude, longitude scaled by cos(lat)). Telemetry grew additively again: `VFR_HUD` → `airspeed_mps`, `groundspeed_mps` (schema still 1) — the solver needs groundspeed, since what the payload inherits at release is motion over the ground.
- **2026-08-17 — Vehicle commands over HTTP POST; mission upload runs inside the reader thread.** First browser→vehicle path. `POST /mission` because an upload is a request/response action — the WebSocket stays a one-way telemetry stream; CORS middleware became necessary (browsers CORS-check `fetch`, not WebSockets). The MAVLink mission upload is an autopilot-driven handshake (MISSION_COUNT → MISSION_REQUEST_INT per item → MISSION_ITEM_INT → MISSION_ACK) arriving on the same UDP link as telemetry, so it must run on the thread that owns the connection: HTTP handlers enqueue jobs on a `queue.Queue`, the reader loop services them between messages, handlers wait on a `threading.Event` with timeout. ArduPilot reserves mission seq 0 for home — UI waypoint k uploads as seq k+1, and `wp_seq`/`wp_dist_m` grew the telemetry format additively (schema still 1).
- **2026-08-16 — Backend concurrency: reader thread + latest-frame snapshot.** Blocking pymavlink can't run on FastAPI's event loop, so a daemon thread owns the MAVLink connection and swaps each normalized frame into a shared `latest` reference (atomic under the GIL); WebSocket handlers sample it at 5 Hz. Snapshot instead of a queue because a live display only wants the newest state — recording (slice 6) has different requirements and will get its own structure.
