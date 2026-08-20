"use client";

import { setWorkerUrl } from "maplibre-gl";
import Map, {
  Layer,
  Marker,
  Source,
  type MapLayerMouseEvent,
} from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";

// MapLibre parses tiles in a Web Worker. Turbopack can't bundle MapLibre's
// module worker (it serves HTML for the worker URL, killing tile loading),
// so we serve the stock worker files from /public and point MapLibre there.
// The two .mjs files in public/ are copied from node_modules/maplibre-gl/dist
// and must be re-copied if maplibre-gl is upgraded.
setWorkerUrl("/maplibre-gl-worker.mjs");

// SITL home: CMAC field near Canberra.
const HOME = { longitude: 149.165237, latitude: -35.363262 };

export type PlannedWaypoint = {
  lat_deg: number;
  lon_deg: number;
  alt_m: number;
};

export type MapPoint = { lat_deg: number; lon_deg: number };

type Props = {
  track: [number, number][]; // [lon, lat] pairs, oldest first
  position: { lon: number; lat: number; hdg: number } | null;
  waypoints: PlannedWaypoint[];
  activeSeq: number | null; // mission seq in flight; waypoint k is seq k+1
  target: MapPoint | null;
  releasePoint: MapPoint | null;
  onMapClick: (lat_deg: number, lon_deg: number) => void;
};

export default function FlightMap({
  track,
  position,
  waypoints,
  activeSeq,
  target,
  releasePoint,
  onMapClick,
}: Props) {
  const trackFeature = {
    type: "Feature" as const,
    geometry: { type: "LineString" as const, coordinates: track },
    properties: {},
  };

  const routeFeature = {
    type: "Feature" as const,
    geometry: {
      type: "LineString" as const,
      coordinates: waypoints.map((wp) => [wp.lon_deg, wp.lat_deg]),
    },
    properties: {},
  };

  function handleClick(e: MapLayerMouseEvent) {
    onMapClick(e.lngLat.lat, e.lngLat.lng);
  }

  const releaseLineFeature =
    target && releasePoint
      ? {
          type: "Feature" as const,
          geometry: {
            type: "LineString" as const,
            coordinates: [
              [releasePoint.lon_deg, releasePoint.lat_deg],
              [target.lon_deg, target.lat_deg],
            ],
          },
          properties: {},
        }
      : null;

  return (
    <Map
      initialViewState={{ ...HOME, zoom: 14.5 }}
      mapStyle="https://tiles.openfreemap.org/styles/fiord"
      style={{ width: "100%", height: "100%" }}
      onClick={handleClick}
      cursor="crosshair"
    >
      <Source id="route" type="geojson" data={routeFeature}>
        <Layer
          id="route-line"
          type="line"
          paint={{
            "line-color": "#898781",
            "line-width": 2,
            "line-dasharray": [2, 2],
          }}
        />
      </Source>
      <Source id="track" type="geojson" data={trackFeature}>
        <Layer
          id="track-line"
          type="line"
          paint={{
            "line-color": "#3987e5",
            "line-width": 3,
          }}
          layout={{ "line-cap": "round", "line-join": "round" }}
        />
      </Source>
      {waypoints.map((wp, i) => {
        const active = activeSeq !== null && activeSeq === i + 1;
        return (
          <Marker
            key={i}
            longitude={wp.lon_deg}
            latitude={wp.lat_deg}
            anchor="center"
          >
            <div
              className={`flex h-6 w-6 items-center justify-center rounded-full border-2 text-[11px] font-semibold ${
                active
                  ? "border-[#3987e5] bg-[#3987e5] text-white ring-4 ring-[#3987e5]/30"
                  : "border-[#898781] bg-[#1a1a19] text-[#c3c2b7]"
              }`}
            >
              {i + 1}
            </div>
          </Marker>
        );
      })}
      {releaseLineFeature && (
        <Source id="release-line" type="geojson" data={releaseLineFeature}>
          <Layer
            id="release-line-layer"
            type="line"
            paint={{
              "line-color": "#d95926",
              "line-width": 2,
              "line-dasharray": [1.5, 1.5],
            }}
          />
        </Source>
      )}
      {target && (
        <Marker
          longitude={target.lon_deg}
          latitude={target.lat_deg}
          anchor="center"
        >
          {/* Target: crosshair */}
          <svg width="26" height="26" viewBox="0 0 26 26">
            <circle
              cx="13"
              cy="13"
              r="8"
              fill="none"
              stroke="#ffffff"
              strokeWidth="2"
            />
            <circle cx="13" cy="13" r="2" fill="#ffffff" />
            <path
              d="M13 1 V6 M13 20 V25 M1 13 H6 M20 13 H25"
              stroke="#ffffff"
              strokeWidth="2"
            />
          </svg>
        </Marker>
      )}
      {releasePoint && (
        <Marker
          longitude={releasePoint.lon_deg}
          latitude={releasePoint.lat_deg}
          anchor="center"
        >
          {/* Release point: ring + drop cross in series-2 orange */}
          <svg width="22" height="22" viewBox="0 0 22 22">
            <circle
              cx="11"
              cy="11"
              r="8"
              fill="rgba(217,89,38,0.25)"
              stroke="#d95926"
              strokeWidth="2.5"
            />
            <path
              d="M11 6 V16 M6 11 H16"
              stroke="#d95926"
              strokeWidth="2"
            />
          </svg>
        </Marker>
      )}
      {position && (
        <Marker
          longitude={position.lon}
          latitude={position.lat}
          rotation={position.hdg}
          rotationAlignment="map"
        >
          {/* Dart glyph pointing north at rotation 0 */}
          <svg width="26" height="26" viewBox="0 0 24 24">
            <path
              d="M12 2 L19 21 L12 17 L5 21 Z"
              fill="#ffffff"
              stroke="#0d0d0d"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          </svg>
        </Marker>
      )}
    </Map>
  );
}
