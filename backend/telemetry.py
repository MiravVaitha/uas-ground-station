def normalize(msg) -> dict:
    return {
        "schema": 1,
        "time_s": msg.time_boot_ms / 1000.0,
        "alt_m": msg.relative_alt / 1000.0
}
