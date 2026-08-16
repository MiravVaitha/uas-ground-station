from pymavlink import mavutil

mav = mavutil.mavlink_connection('udpin:127.0.0.1:14550') 
mav.wait_heartbeat()
print(mav.target_system, mav.target_component)

while True:
    msg = mav.recv_match(type='GLOBAL_POSITION_INT', blocking=True)
    print(f"alt: {msg.relative_alt / 1000.0:6.1f} m", end="\r", flush=True)



