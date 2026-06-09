"use client";

import DashboardCard, {
  CardLoading,
  CardError,
  CardEmpty,
} from "@/components/ui/DashboardCard";
import { api } from "@/lib/api";
import { useApi } from "@/lib/hooks/useApi";

function initials(name) {
  return name
    .split(/\s+/)
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

// Stacked-bar row per assignee. Width is scaled to the busiest person on the
// team so the chart self-normalises — even with mostly-light loads, the most
// loaded person still fills the row.
function WorkloadBar({ todo, inProgress, done, overdue, peak }) {
  const total = todo + inProgress + done;
  const width = peak > 0 ? Math.max(8, Math.round((total / peak) * 100)) : 0;
  const seg = (n) => (total > 0 ? (n / total) * 100 : 0);
  return (
    <div className="relative h-2 w-full rounded-full bg-input overflow-hidden">
      <div
        className="absolute inset-y-0 left-0 flex"
        style={{ width: `${width}%` }}
      >
        <div
          className="h-full bg-zinc-500"
          style={{ width: `${seg(todo)}%` }}
          title={`To Do · ${todo}`}
        />
        <div
          className="h-full bg-primary"
          style={{ width: `${seg(inProgress)}%` }}
          title={`In Progress · ${inProgress}`}
        />
        <div
          className="h-full bg-green-500"
          style={{ width: `${seg(done)}%` }}
          title={`Done · ${done}`}
        />
      </div>
      {overdue > 0 && (
        <div
          className="absolute inset-y-0 right-1 flex items-center text-[9px] font-semibold text-red-300"
          aria-label={`${overdue} overdue`}
        >
          ●
        </div>
      )}
    </div>
  );
}

export default function TeamWorkloadWidget() {
  const { data, error, loading } = useApi(api.dashboardTeamWorkload);
  const items = data?.items ?? [];
  const peak = data?.peak ?? 0;

  return (
    <DashboardCard
      title="Team Workload Overview"
      subtitle="Open + completed tasks per teammate"
      action={
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-wide text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 bg-zinc-500 rounded-sm" /> To Do
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 bg-primary rounded-sm" /> WIP
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 bg-green-500 rounded-sm" /> Done
          </span>
        </div>
      }
    >
      {loading && <CardLoading label="Loading workload…" />}
      {error && <CardError error={error} />}
      {!loading && !error && items.length === 0 && (
        <CardEmpty message="No assignees yet — workload populates as tasks get assigned." />
      )}
      {!loading && !error && items.length > 0 && (
        <ul className="flex flex-col gap-3 max-h-72 overflow-y-auto pr-1">
          {items.map((u) => (
            <li key={u.id} className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-6 h-6 rounded-full bg-secondary flex items-center justify-center text-[10px] font-semibold text-secondary-foreground flex-shrink-0">
                    {initials(u.name)}
                  </div>
                  <span className="text-sm text-foreground truncate">
                    {u.name}
                  </span>
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    {u.role}
                  </span>
                </div>
                <div className="flex-shrink-0 text-xs text-muted-foreground">
                  <span className="text-foreground font-semibold">
                    {u.total}
                  </span>{" "}
                  total
                  {u.overdue > 0 && (
                    <span className="ml-2 text-red-300">
                      · {u.overdue} overdue
                    </span>
                  )}
                </div>
              </div>
              <WorkloadBar
                todo={u.todo}
                inProgress={u.in_progress}
                done={u.done}
                overdue={u.overdue}
                peak={peak}
              />
            </li>
          ))}
        </ul>
      )}
    </DashboardCard>
  );
}
