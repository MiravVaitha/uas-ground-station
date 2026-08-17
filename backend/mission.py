"""MAVLink mission upload.

Uploading a mission is a handshake driven by the autopilot:

    GCS:        MISSION_COUNT (n items)
    autopilot:  MISSION_REQUEST_INT seq=0
    GCS:        MISSION_ITEM_INT   seq=0
    autopilot:  MISSION_REQUEST_INT seq=1
    ...
    autopilot:  MISSION_ACK (accepted / error)

The autopilot pulls items one by one so it can re-request anything lost on
a radio link; it may also re-request a seq it already asked for, which is
why the loop below answers whatever seq the request names rather than
counting up itself.

Must be called from the thread that owns the MAVLink connection (the
reader thread in app.py) — the autopilot's requests arrive interleaved
with telemetry, and only one thread may recv from the link.
"""

from pymavlink import mavutil

# Older ArduPilot builds ask with MISSION_REQUEST, newer with
# MISSION_REQUEST_INT; both carry just a seq and are answered the same way.
_REQUEST_TYPES = ["MISSION_REQUEST", "MISSION_REQUEST_INT", "MISSION_ACK"]


def upload(conn, waypoints: list[dict]) -> None:
    """Upload waypoints as a fresh mission. Raises RuntimeError on failure.

    waypoints: [{"lat_deg": float, "lon_deg": float, "alt_m": float}, ...]
    Item 0 of an ArduPilot mission is reserved for home, so item k here
    becomes seq k+1 and the count is len(waypoints) + 1. We send a dummy
    item 0 — ArduPilot replaces it with the real home position.
    """
    count = len(waypoints) + 1
    conn.mav.mission_count_send(
        conn.target_system, conn.target_component, count
    )

    # Answer requests until the autopilot delivers its verdict. Don't count
    # answers: a request may be repeated, and only MISSION_ACK ends the
    # conversation.
    while True:
        msg = conn.recv_match(type=_REQUEST_TYPES, blocking=True, timeout=5)
        if msg is None:
            raise RuntimeError("mission upload timed out")
        if msg.get_type() == "MISSION_ACK":
            if msg.type == mavutil.mavlink.MAV_MISSION_ACCEPTED:
                return
            raise RuntimeError(f"mission rejected: {_ack_name(msg.type)}")

        seq = msg.seq
        if seq == 0:
            lat_e7, lon_e7, alt = 0, 0, 0.0  # dummy home, autopilot overwrites
        else:
            wp = waypoints[seq - 1]
            lat_e7 = int(wp["lat_deg"] * 1e7)
            lon_e7 = int(wp["lon_deg"] * 1e7)
            alt = float(wp["alt_m"])

        conn.mav.mission_item_int_send(
            conn.target_system,
            conn.target_component,
            seq,
            # Altitude measured relative to home, matching alt_m in the
            # normalized telemetry format.
            mavutil.mavlink.MAV_FRAME_GLOBAL_RELATIVE_ALT_INT,
            mavutil.mavlink.MAV_CMD_NAV_WAYPOINT,
            0,  # current: this is not the active item
            1,  # autocontinue to the next item
            0.0, 0.0, 0.0, 0.0,  # NAV_WAYPOINT params (hold, radius...) unused
            lat_e7,
            lon_e7,
            alt,
        )


def _ack_name(ack_type: int) -> str:
    entry = mavutil.mavlink.enums["MAV_MISSION_RESULT"].get(ack_type)
    return entry.name if entry else f"MAV_MISSION_RESULT {ack_type}"
