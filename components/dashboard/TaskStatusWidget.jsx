"use client";

import DashboardCard, {
  CardLoading,
  CardError,
  CardEmpty,
} from "@/components/ui/DashboardCard";
import { api } from "@/lib/api";
import { useApi } from "@/lib/hooks/useApi";

const STATUS_COLOR = {
  "To Do": "#a1a1aa", // muted
  "In Progress": "#3b82f6", // primary
  Done: "#22c55e", // success
};

// Inline SVG donut — keeps the bundle lean (no chart library) and renders
// crisp on any DPI. The center label shows the total task count.
function Donut({ items, total }) {
  const size = 140;
  const stroke = 18;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  let offset = 0;
  const arcs = items.map((it) => {
    const portion = total > 0 ? it.count / total : 0;
    const length = portion * circumference;
    const arc = (
      <circle
        key={it.status}
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={STATUS_COLOR[it.status] ?? "#52525b"}
        strokeWidth={stroke}
        strokeDasharray={`${length} ${circumference - length}`}
        strokeDashoffset={-offset}
        strokeLinecap="butt"
      />
    );
    offset += length;
    return arc;
  });

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width={size}
      height={size}
      className="-rotate-90"
      role="img"
      aria-label="Task status distribution"
    >
      {/* track */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="#27272a"
        strokeWidth={stroke}
      />
      {total > 0 && arcs}
      <g transform={`rotate(90 ${size / 2} ${size / 2})`}>
        <text
          x="50%"
          y="48%"
          textAnchor="middle"
          dominantBaseline="middle"
          className="fill-foreground"
          style={{ fontSize: 22, fontWeight: 700 }}
        >
          {total}
        </text>
        <text
          x="50%"
          y="62%"
          textAnchor="middle"
          dominantBaseline="middle"
          className="fill-zinc-400"
          style={{ fontSize: 9, letterSpacing: 2, textTransform: "uppercase" }}
        >
          Total
        </text>
      </g>
    </svg>
  );
}

export default function TaskStatusWidget() {
  const { data, error, loading } = useApi(api.dashboardTaskStatus);
  const items = data?.items ?? [];
  const total = data?.total ?? 0;

  return (
    <DashboardCard
      title="Task Status Overview"
      subtitle="How tasks are distributed across statuses"
    >
      {loading && <CardLoading label="Loading task mix…" />}
      {error && <CardError error={error} />}
      {!loading && !error && total === 0 && (
        <CardEmpty message="No tasks yet — once tasks exist their status mix shows here." />
      )}
      {!loading && !error && total > 0 && (
        <div className="flex flex-col sm:flex-row items-center sm:items-stretch gap-5">
          <div className="flex-shrink-0">
            <Donut items={items} total={total} />
          </div>
          <ul className="flex-1 flex flex-col justify-center gap-2.5 min-w-0 w-full">
            {items.map((it) => (
              <li
                key={it.status}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span className="flex items-center gap-2 min-w-0">
                  <span
                    className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                    style={{ backgroundColor: STATUS_COLOR[it.status] }}
                  />
                  <span className="text-foreground truncate">{it.status}</span>
                </span>
                <span className="flex-shrink-0 text-muted-foreground">
                  <span className="text-foreground font-semibold">
                    {it.count}
                  </span>
                  <span className="ml-1.5 text-xs">({it.percent}%)</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </DashboardCard>
  );
}
