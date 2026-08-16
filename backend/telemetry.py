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
    return {}
        
    
    

