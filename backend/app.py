import asyncio
import threading
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from pymavlink import mavutil

import telemetry

# Latest normalized telemetry frame. Written by the reader thread, read by
# WebSocket handlers. A whole-reference swap is atomic under the GIL, so no
# lock is needed as long as neither side mutates the dict in place.
latest: dict | None = None


def mavlink_reader() -> None:
    global latest
    conn = mavutil.mavlink_connection("udpin:127.0.0.1:14550")
    conn.wait_heartbeat()
    while True:
        msg = conn.recv_match(type="GLOBAL_POSITION_INT", blocking=True)
        latest = telemetry.normalize(msg)


@asynccontextmanager
async def lifespan(app: FastAPI):
    threading.Thread(target=mavlink_reader, daemon=True).start()
    yield


app = FastAPI(lifespan=lifespan)


@app.websocket("/ws")
async def telemetry_stream(ws: WebSocket) -> None:
    await ws.accept()
    try:
        while True:
            if latest is not None:
                await ws.send_json(latest)
            await asyncio.sleep(0.2)
    except WebSocketDisconnect:
        pass
