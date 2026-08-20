# Notes

Every problem hit and how it was solved, newest first.

Format:

```
## YYYY-MM-DD — Title
**Problem:** what broke or blocked progress
**Solution:** what fixed it, and why it worked
```

---

## 2026-08-20 — Capture region kept "not fitting": high-DPI display, not bad framing
**Problem:** No ScreenToGif region would contain the whole dashboard at a readable size. The display reports 1152×720 CSS pixels at devicePixelRatio 3.125 (2.5 base scaling × 125% page zoom), so the dashboard spans ~2880 *physical* pixels. A 1502 px capture region was cropping to roughly half the layout, not shrinking it. Shrinking the browser window instead made the layout ugly, because the fixed 360 px sidebar then ate ~39% of the width.
**Solution:** Two independent fixes. Page zoom to 75% gives the layout ~1535 CSS px so the whole sidebar fits without scrolling (the sidebar drops to 23% of the width). Then capture the full window at its native ~2880 px and **downscale the GIF to ~1500 px wide in ScreenToGif's editor before saving** — downscaling a high-DPI capture supersamples, so text comes out sharper than a native 1500 px capture. Note the Claude-in-Chrome extension's screenshots do not account for page zoom: at 75% they arrive with a black border and the click coordinate space no longer matches, so browser automation is unreliable unless zoom is 100%.

## 2026-08-20 — Recording looked empty: Windows reports a stale size for an open file
**Problem:** The new telemetry recorder appeared to write nothing — `Get-ChildItem` showed the `.jsonl` at 0 bytes twelve minutes into a flight, while the WebSocket was clearly delivering frames. Running the recorder coroutine in isolation against a simulated snapshot wrote fine, so the logic was correct.
**Solution:** Nothing was broken. Windows does not update a file's directory-entry size while a handle is open, even after `flush()` — the file actually held ~1 MB and reported its true size once the process exited. **Check an open file by reading its contents, not its listed size.** A real (separate) issue surfaced during the hunt: two `uvicorn` processes had been started, and since only one can bind UDP 14550, the other had no telemetry at all; both also derived the same filename from the same start-second and opened it with `"w"`. Fixed by putting the PID in the recording filename and printing `[recorder] telemetry flowing` on the first frame plus a count every 250, so a process receiving nothing is obvious immediately.

## 2026-08-16 — Map rendered background only: Turbopack broke MapLibre's Web Worker
**Problem:** MapLibre map showed only the style's flat background color (controls and attribution rendered, zero tile data). No failing tile requests in the Network tab — the style/sprite/TileJSON all loaded. Console had the real clue: `Failed to load module script: … MIME type of "text/html"`. MapLibre downloads/parses tiles in a Web Worker; Turbopack (Next 16's dev bundler) mangled the module-worker URL so the dev server answered with an HTML 404 — no worker, so nothing ever requested tiles, and nothing errored loudly on the main thread.
**Solution:** Serve MapLibre's own worker build outside the bundler: copied `maplibre-gl-worker.mjs` + `maplibre-gl-shared.mjs` (its relative import) from `node_modules/maplibre-gl/dist/` into `frontend/public/`, and call `setWorkerUrl("/maplibre-gl-worker.mjs")` (named export — maplibre-gl v6 has no default export) before the map mounts. Re-copy both files whenever maplibre-gl is upgraded.

## 2026-08-16 — SITL telemetry never reached Windows: sim_vehicle.py sent it to the router
**Problem:** `print_altitude.py` hung forever at `wait_heartbeat()` — no MAVLink packets arrived on `127.0.0.1:14550`. MAVProxy's process line showed `--out 192.168.1.1:14550`: `sim_vehicle.py` auto-detects WSL2 and derives "the Windows host IP" a way that is only valid in NAT networking; under mirrored networking it resolves to the LAN default gateway, so telemetry streamed to the home router.
**Solution:** Live fix without restart: `output add 127.0.0.1:14550` in the MAVProxy console. Permanent fix: always launch with `sim_vehicle.py -v ArduPlane --out udp:127.0.0.1:14550` (adds an explicit output; the bogus auto-detected one is harmless). Diagnosed by binding a raw UDP socket on Windows (timeout = nothing arriving) then reading the MAVProxy command line via `pgrep -af`.

## 2026-08-14 — Store stub still shadowed real Python after install
**Problem:** Windows ships fake `python.exe`/`python3.exe` stubs ("App Execution Aliases") that open the Microsoft Store. Even after installing real Python 3.12 via winget, typing `python` in a new terminal still hit the stub, because its folder (`%LOCALAPPDATA%\Microsoft\WindowsApps`) came earlier in PATH than the real install.
**Solution:** Settings → Apps → Advanced app settings → App execution aliases → toggled off `python.exe` and `python3.exe`. Command lookup then falls through to the real interpreter (`python --version` → 3.12.10).
