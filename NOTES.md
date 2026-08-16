# Notes

Every problem hit and how it was solved, newest first.

Format:

```
## YYYY-MM-DD — Title
**Problem:** what broke or blocked progress
**Solution:** what fixed it, and why it worked
```

---

## 2026-08-16 — SITL telemetry never reached Windows: sim_vehicle.py sent it to the router
**Problem:** `print_altitude.py` hung forever at `wait_heartbeat()` — no MAVLink packets arrived on `127.0.0.1:14550`. MAVProxy's process line showed `--out 192.168.1.1:14550`: `sim_vehicle.py` auto-detects WSL2 and derives "the Windows host IP" a way that is only valid in NAT networking; under mirrored networking it resolves to the LAN default gateway, so telemetry streamed to the home router.
**Solution:** Live fix without restart: `output add 127.0.0.1:14550` in the MAVProxy console. Permanent fix: always launch with `sim_vehicle.py -v ArduPlane --out udp:127.0.0.1:14550` (adds an explicit output; the bogus auto-detected one is harmless). Diagnosed by binding a raw UDP socket on Windows (timeout = nothing arriving) then reading the MAVProxy command line via `pgrep -af`.

## 2026-08-14 — Store stub still shadowed real Python after install
**Problem:** Windows ships fake `python.exe`/`python3.exe` stubs ("App Execution Aliases") that open the Microsoft Store. Even after installing real Python 3.12 via winget, typing `python` in a new terminal still hit the stub, because its folder (`%LOCALAPPDATA%\Microsoft\WindowsApps`) came earlier in PATH than the real install.
**Solution:** Settings → Apps → Advanced app settings → App execution aliases → toggled off `python.exe` and `python3.exe`. Command lookup then falls through to the real interpreter (`python --version` → 3.12.10).
