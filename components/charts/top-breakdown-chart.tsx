"use client";

import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

type Row = {
  name: string;
  playCount: number;
};

const COLORS = ["#1DB954", "#1ed760", "#16a34a", "#14532d", "#22c55e"];

export function TopBreakdownChart({ data }: { data: Row[] }) {
  if (data.length === 0) {
    return <p className="text-sm text-zinc-400">No data to visualize.</p>;
  }

  return (
    <div className="h-[260px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="playCount"
            nameKey="name"
            innerRadius={50}
            outerRadius={90}
            paddingAngle={4}
          >
            {data.map((entry, index) => (
              <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              background: "#0f1110",
              border: "1px solid #2a2a2a",
              borderRadius: "10px",
              color: "#fff",
            }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
