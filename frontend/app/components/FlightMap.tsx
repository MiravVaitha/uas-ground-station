"use client";

import { setWorkerUrl } from "maplibre-gl";
import Map, { Layer, Marker, Source } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";

// MapLibre parses tiles in a Web Worker. Turbopack can't bundle MapLibre's
// module worker (it serves HTML for the worker URL, killing tile loading),
// so we serve the stock worker files from /public and point MapLibre there.
// The two .mjs files in public/ are copied from node_modules/maplibre-gl/dist
// and must be re-copied if maplibre-gl is upgraded.
setWorkerUrl("/maplibre-gl-worker.mjs");

// SITL home: CMAC field near Canberra.
const HOME = { longitude: 149.165237, latitude: -35.363262 };

type Props = {
  track: [number, number][]; // [lon, lat] pairs, oldest first
  position: { lon: number; lat: number; hdg: number } | null;
};

export default function FlightMap({ track, position }: Props) {
  const trackFeature = {
    type: "Feature" as const,
    geometry: { type: "LineString" as const, coordinates: track },
    properties: {},
  };

  return (
    <Map
      initialViewState={{ ...HOME, zoom: 14.5 }}
      mapStyle="https://tiles.openfreemap.org/styles/fiord"
      style={{ width: "100%", height: "100%" }}
    >
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
