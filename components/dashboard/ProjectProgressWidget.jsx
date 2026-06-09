"use client";

import Link from "next/link";
import DashboardCard, {
  CardLoading,
  CardError,
  CardEmpty,
} from "@/components/ui/DashboardCard";
import { api } from "@/lib/api";
import { useApi } from "@/lib/hooks/useApi";

const STATUS_TONE = {
  "In Progress": "text-blue-300 bg-blue-500/15",
  Planning: "text-yellow-300 bg-yellow-500/15",
  Completed: "text-green-300 bg-green-500/15",
  "On Hold": "text-zinc-300 bg-zinc-500/20",
};

function ProgressBar({ pct }) {
  const clamped = Math.min(100, Math.max(0, pct));
  const tone =
    clamped >= 100
      ? "bg-green-500"
      : clamped >= 60
        ? "bg-primary"
        : clamped > 0
          ? "bg-yellow-500"
          : "bg-zinc-700";
  return (
    <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-input">
      <div
        className={`h-full rounded-full transition-all duration-500 ${tone}`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

export default function ProjectProgressWidget() {
  const { data, error, loading } = useApi(api.dashboardProjectProgress);
  const items = data?.items ?? [];

  return (
    <DashboardCard
      title="Project Progress Overview"
      subtitle="Completion % per project, by tasks marked Done"
      action={
        <Link
           href="/projects"
          className="text-xs text-primary font-medium hover:underline"
        >
          View all
        </Link>
      }
    >
      {loading && <CardLoading label="Loading projects…" />}
      {error && <CardError error={error} />}
      {!loading && !error && items.length === 0 && (
        <CardEmpty message="No projects yet — create one to start tracking progress." />
      )}
      {!loading && !error && items.length > 0 && (
        <ul className="flex flex-col gap-3.5 max-h-72 overflow-y-auto pr-1">
          {items.slice(0, 8).map((p) => (
            <li key={p.id} className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground truncate">
                    {p.name}
                  </span>
                  <span
                    className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-md font-semibold ${
                      STATUS_TONE[p.status] ?? "bg-muted text-muted-foreground"
                    }`}
                  >
                    {p.status}
                  </span>
                </div>
                <div className="flex-shrink-0 text-xs text-muted-foreground">
                  <span className="text-foreground font-semibold">
                    {p.completion_pct}%
                  </span>
                  <span className="mx-1.5">·</span>
                  {p.done_tasks}/{p.total_tasks} done
                  {p.overdue_tasks > 0 && (
                    <span className="ml-2 text-red-300">
                      {p.overdue_tasks} overdue
                    </span>
                  )}
                </div>
              </div>
              <ProgressBar pct={p.completion_pct} />
            </li>
          ))}
        </ul>
      )}
    </DashboardCard>
  );
}
