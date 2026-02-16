"use client";

import {
  Bar,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  BarChart,
} from "recharts";

type Props = {
  data: Array<{
    date: string;
    plays: number;
    minutes: number;
  }>;
};

export function ListeningOverTimeChart({ data }: Props) {
  if (data.length === 0) {
    return <p className="text-sm text-zinc-400">No listening events in this range yet.</p>;
  }

  return (
    <div className="h-[280px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#232323" />
          <XAxis dataKey="date" tick={{ fill: "#8a8a8a", fontSize: 11 }} />
          <YAxis tick={{ fill: "#8a8a8a", fontSize: 11 }} />
          <Tooltip
            cursor={{ fill: "rgba(255,255,255,0.04)" }}
            contentStyle={{
              background: "#0f1110",
              border: "1px solid #2a2a2a",
              borderRadius: "10px",
              color: "#fff",
            }}
          />
          <Bar dataKey="plays" fill="#1DB954" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
