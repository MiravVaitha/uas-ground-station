"""Turn a recorded JSONL flight log into the replay asset the frontend loads.

The recorder writes line-delimited JSON so an interrupted backend still leaves
a valid file; the browser wants a single JSON array it can fetch in one go.
This script trims a chosen recording to an interesting window and writes it to
frontend/public/replay/flight.json, which IS committed — replay must work for
anyone who clones the repo with no SITL and no backend.

    python make_replay.py recordings/20260820-114500.jsonl --start 30 --duration 90
"""

import argparse
import json
from pathlib import Path

DEFAULT_OUT = (
    Path(__file__).parent.parent / "frontend" / "public" / "replay" / "flight.json"
)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path, help="recorded .jsonl log")
    parser.add_argument(
        "--start", type=float, default=0.0,
        help="seconds into the recording to start from (default 0)",
    )
    parser.add_argument(
        "--duration", type=float, default=None,
        help="seconds to keep from --start (default: to the end)",
    )
    parser.add_argument(
        "--segment", type=int, default=None,
        help="which flight to use (default: the longest)",
    )
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = parser.parse_args()

    with args.input.open(encoding="utf-8") as f:
        frames = [json.loads(line) for line in f if line.strip()]
    if not frames:
        raise SystemExit(f"{args.input} contains no frames")

    # time_s is the vehicle's boot clock, which restarts when the vehicle does,
    # so one recording can span several flights. Split on the clock going
    # backwards and work within a single flight.
    runs: list[list[dict]] = [[frames[0]]]
    for f in frames[1:]:
        (runs.append([f]) if f["time_s"] < runs[-1][-1]["time_s"]
         else runs[-1].append(f))
    if len(runs) > 1:
        print(f"{len(runs)} flights in this recording:")
        for i, run in enumerate(runs):
            span = run[-1]["time_s"] - run[0]["time_s"]
            print(f"  [{i}] {len(run)} frames, {span:.0f} s")
    frames = runs[args.segment] if args.segment is not None else max(runs, key=len)

    # Window relative to the start of the chosen flight.
    t0 = frames[0]["time_s"]
    begin = t0 + args.start
    end = begin + args.duration if args.duration is not None else float("inf")
    kept = [f for f in frames if begin <= f["time_s"] <= end]
    if not kept:
        raise SystemExit("that --start/--duration window contains no frames")

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(kept), encoding="utf-8")

    span = kept[-1]["time_s"] - kept[0]["time_s"]
    fields = sorted({k for f in kept for k in f})
    print(f"wrote {args.out}")
    print(f"  {len(kept)} frames, {span:.1f} s, {args.out.stat().st_size / 1024:.0f} KB")
    print(f"  fields: {', '.join(fields)}")


if __name__ == "__main__":
    main()
