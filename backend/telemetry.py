def normalize(msg) -> dict:
    kind = msg.get_type()
    if kind == "GLOBAL_POSITION_INT":
        return {
            "schema": 1,
            "time_s": msg.time_boot_ms / 1000.0,
            "alt_m": msg.relative_alt / 1000.0,
            "lat_deg": msg.lat / 1e7,
            "lon_deg": msg.lon / 1e7,
            "hdg_deg": msg.hdg / 100.0,
        }
    elif kind == "SYS_STATUS":
        return {
            "battery_v": msg.voltage_battery / 1000.0,
            "battery_pct": msg.battery_remaining,
        }
    elif kind == "MISSION_CURRENT":
        return {
            "wp_seq": msg.seq,
        }
    elif kind == "NAV_CONTROLLER_OUTPUT":
        return {
            "wp_dist_m": msg.wp_dist,
        }
    elif kind == "VFR_HUD":
        return {
            "airspeed_mps": msg.airspeed,
            "groundspeed_mps": msg.groundspeed,
        }
    return {}
        
    
    

