# UAS Ground Control Station

Ground control station for a fixed-wing UAS. Next.js frontend, FastAPI + pymavlink backend, ArduPilot SITL as the simulated vehicle.

## Stack

- **Frontend**: Next.js (App Router) + TypeScript + Tailwind — `frontend/` (created in build step 2)
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
- [ ] 2. FastAPI + WebSocket bridge, one live telemetry value in the browser, unstyled
- [ ] 3. Map track + altitude and battery time series
- [ ] 4. Waypoint upload and mission monitoring
- [ ] 5. Payload release point solver (airspeed, altitude, wind in; drop trigger point out)
- [ ] 6. Replay mode from a recorded log, then README with a GIF

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
