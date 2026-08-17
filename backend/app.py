import asyncio
import queue
import threading
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from pymavlink import mavutil

import mission
import telemetry

# Latest normalized telemetry frame. Written by the reader thread, read by
# WebSocket handlers. A whole-reference swap is atomic under the GIL, so no
# lock is needed as long as neither side mutates the dict in place.
latest: dict | None = None


class Waypoint(BaseModel):
    lat_deg: float
    lon_deg: float
    alt_m: float


class MissionRequest(BaseModel):
    waypoints: list[Waypoint] = Field(min_length=1)


class MissionJob:
    """A mission upload handed from the HTTP handler to the reader thread."""

    def __init__(self, waypoints: list[dict]):
        self.waypoints = waypoints
        self.done = threading.Event()
        self.error: str | None = None


# Only the reader thread may touch the MAVLink connection (the upload
# handshake receives from the same link as telemetry), so HTTP handlers
# enqueue jobs here and the reader loop services them between messages.
mission_jobs: "queue.Queue[MissionJob]" = queue.Queue()


def mavlink_reader() -> None:
    global latest
    conn = mavutil.mavlink_connection("udpin:127.0.0.1:14550")
    conn.wait_heartbeat()
    state: dict = {}
    while True:
        try:
            job = mission_jobs.get_nowait()
        except queue.Empty:
            pass
        else:
            try:
                mission.upload(conn, job.waypoints)
            except RuntimeError as exc:
                job.error = str(exc)
            job.done.set()

        # timeout (not pure blocking) so queued uploads are still serviced
        # if telemetry ever stalls.
        msg = conn.recv_match(
            type=[
                "GLOBAL_POSITION_INT",
                "SYS_STATUS",
                "MISSION_CURRENT",
                "NAV_CONTROLLER_OUTPUT",
            ],
            blocking=True,
            timeout=1,
        )
        if msg is None:
            continue
        # Merge into a fresh dict rather than mutating: `latest` must only
        # ever be swapped whole (see note on `latest` above).
        state = {**state, **telemetry.normalize(msg)}
        latest = state


@asynccontextmanager
async def lifespan(app: FastAPI):
    threading.Thread(target=mavlink_reader, daemon=True).start()
    yield


app = FastAPI(lifespan=lifespan)

# The browser enforces CORS on fetch() but not on WebSockets, which is why
# slice 2 worked without this. Next.js dev server origins only.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


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


@app.post("/mission")
async def upload_mission(req: MissionRequest) -> dict:
    job = MissionJob([wp.model_dump() for wp in req.waypoints])
    mission_jobs.put(job)
    # The wait happens in a worker thread so the event loop (and the
    # telemetry WebSocket) keeps running during the upload.
    finished = await asyncio.to_thread(job.done.wait, 15)
    if not finished:
        raise HTTPException(504, "upload not started — is SITL connected?")
    if job.error is not None:
        raise HTTPException(502, job.error)
    return {"ok": True, "count": len(req.waypoints)}
