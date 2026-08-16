"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type ChartPoint = {
  time_s: number;
  alt_m?: number;
  battery_v?: number;
};

function formatClock(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

type Props = {
  title: string;
  unit: string;
  data: ChartPoint[];
  dataKey: "alt_m" | "battery_v";
  color: string;
  domain?: [number | "auto" | "dataMin", number | "auto" | "dataMax"];
};

export default function TelemetryChart({
  title,
  unit,
  data,
  dataKey,
  color,
  domain = ["auto", "auto"],
}: Props) {
  return (
    <div className="rounded-lg border border-white/10 bg-[#1a1a19] p-3">
      <div className="mb-1 flex items-center gap-2">
        <span
          className="inline-block h-[3px] w-4 rounded-full"
          style={{ backgroundColor: color }}
        />
        <span className="text-xs font-medium uppercase tracking-wider text-[#c3c2b7]">
          {title}
          <span className="ml-1 normal-case text-[#898781]">{unit}</span>
        </span>
      </div>
      <ResponsiveContainer width="100%" height={150}>
        <LineChart data={data} margin={{ top: 6, right: 6, bottom: 0, left: -12 }}>
          <CartesianGrid stroke="#2c2c2a" vertical={false} />
          <XAxis
            dataKey="time_s"
            type="number"
            domain={["dataMin", "dataMax"]}
            tickFormatter={formatClock}
            stroke="#383835"
            tick={{ fill: "#898781", fontSize: 11 }}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            domain={domain}
            stroke="#383835"
            tick={{ fill: "#898781", fontSize: 11 }}
            tickLine={false}
            width={46}
          />
          <Tooltip
            isAnimationActive={false}
            cursor={{ stroke: "#898781", strokeDasharray: "3 3" }}
            contentStyle={{
              backgroundColor: "#1a1a19",
              border: "1px solid rgba(255,255,255,0.10)",
              borderRadius: 6,
              color: "#ffffff",
              fontSize: 12,
            }}
            labelFormatter={(v) => `t ${formatClock(Number(v))}`}
            formatter={(value) => [`${Number(value).toFixed(1)} ${unit}`, null]}
          />
          <Line
            type="monotone"
            dataKey={dataKey}
            stroke={color}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
