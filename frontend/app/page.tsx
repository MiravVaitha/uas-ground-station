"use client";

import { useEffect, useState } from "react";

type TelemetryFrame = {
  schema: number;
  time_s: number;
  alt_m: number;
};

export default function Home() {
  const [frame, setFrame] = useState<TelemetryFrame | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let unmounted = false;

    function connect() {
      ws = new WebSocket("ws://127.0.0.1:8000/ws");
      ws.onopen = () => setConnected(true);
      ws.onmessage = (event) => setFrame(JSON.parse(event.data));
      ws.onclose = () => {
        setConnected(false);
        if (!unmounted) retry = setTimeout(connect, 2000);
      };
    }
    connect();

    return () => {
      unmounted = true;
      clearTimeout(retry);
      ws?.close();
    };
  }, []);

  return (
    <main>
      <h1>UAS Ground Station</h1>
      <p>link: {connected ? "connected" : "disconnected"}</p>
      <p>altitude: {frame ? `${frame.alt_m.toFixed(1)} m` : "—"}</p>
      <p>flight time: {frame ? `${frame.time_s.toFixed(1)} s` : "—"}</p>
    </main>
  );
}
