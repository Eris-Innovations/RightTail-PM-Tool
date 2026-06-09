"use client";

import Link from "next/link";
import { CalendarClock } from "lucide-react";
import DashboardCard, {
  CardLoading,
  CardError,
  CardEmpty,
} from "@/components/ui/DashboardCard";
import PriorityBadge from "@/components/ui/PriorityBadge";
import { api } from "@/lib/api";
import { useApi } from "@/lib/hooks/useApi";
import { formatDate } from "@/lib/formatters";

function relativeDue(daysOut) {
  if (daysOut < 0) return { label: `${Math.abs(daysOut)}d overdue`, tone: "text-red-300 bg-red-500/15" };
  if (daysOut === 0) return { label: "Today", tone: "text-yellow-300 bg-yellow-500/15" };
  if (daysOut === 1) return { label: "Tomorrow", tone: "text-yellow-300 bg-yellow-500/15" };
  if (daysOut <= 3) return { label: `In ${daysOut}d`, tone: "text-yellow-200 bg-yellow-500/10" };
  if (daysOut <= 7) return { label: `In ${daysOut}d`, tone: "text-foreground bg-input" };
  return { label: `In ${daysOut}d`, tone: "text-muted-foreground bg-input" };
}

export default function UpcomingDeadlinesWidget() {
  const { data, error, loading } = useApi(api.dashboardUpcomingDeadlines);
  const items = data?.items ?? [];
  const horizon = data?.horizonDays ?? 14;

  return (
    <DashboardCard
      title="Upcoming Deadlines"
      subtitle={`Tasks due in the next ${horizon} days`}
      action={
        <Link
           href="/tasks"
          className="text-xs text-primary font-medium hover:underline"
        >
          View tasks
        </Link>
      }
    >
      {loading && <CardLoading label="Loading deadlines…" />}
      {error && <CardError error={error} />}
      {!loading && !error && items.length === 0 && (
        <div className="py-8 flex flex-col items-center gap-2 text-center">
          <CalendarClock className="w-6 h-6 text-muted-foreground" strokeWidth={1.8} />
          <p className="text-xs text-muted-foreground">
            Nothing on the radar — no open tasks due in the next {horizon} days.
          </p>
        </div>
      )}
      {!loading && !error && items.length > 0 && (
        <ul className="flex flex-col divide-y divide-border max-h-72 overflow-y-auto -mt-1">
          {items.map((t) => {
            const due = relativeDue(t.due_in_days);
            return (
              <li key={t.id} className="py-2.5 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-foreground truncate">
                    {t.title}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {t.project_name ?? "—"} ·{" "}
                    {t.assignee_name ?? "Unassigned"} · due{" "}
                    {formatDate(t.due_date)}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <PriorityBadge priority={t.priority} />
                  <span
                    className={`text-[11px] font-medium px-2 py-0.5 rounded-md ${due.tone}`}
                  >
                    {due.label}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </DashboardCard>
  );
}
