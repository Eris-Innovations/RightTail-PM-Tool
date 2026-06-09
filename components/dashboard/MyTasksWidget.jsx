"use client";

import Link from "next/link";
import { CheckSquare, Circle, Clock, AlertCircle } from "lucide-react";
import DashboardCard, {
  CardLoading,
  CardError,
  CardEmpty,
} from "@/components/ui/DashboardCard";
import PriorityBadge from "@/components/ui/PriorityBadge";
import { api } from "@/lib/api";
import { useApi } from "@/lib/hooks/useApi";
import { formatDate } from "@/lib/formatters";

function MiniStat({ icon: Icon, label, value, tone = "text-foreground" }) {
  return (
    <div className="flex flex-col items-start gap-0.5 flex-1 min-w-0">
      <span className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
        <Icon className="w-3 h-3" strokeWidth={2.4} />
        {label}
      </span>
      <span className={`text-xl font-bold leading-none ${tone}`}>{value}</span>
    </div>
  );
}

export default function MyTasksWidget() {
  const { data, error, loading } = useApi(api.dashboardMyTasks);
  const summary = data?.summary;
  const upNext = data?.upNext ?? [];

  return (
    <DashboardCard
      title="My Tasks"
      subtitle="Your personal assignment summary"
      action={
        <Link
           href="/assignments"
          className="text-xs text-primary font-medium hover:underline"
        >
          See all
        </Link>
      }
    >
      {loading && <CardLoading label="Loading your tasks…" />}
      {error && <CardError error={error} />}
      {!loading && !error && summary && (
        <>
          <div className="flex items-stretch gap-3 mb-4 px-1">
            <MiniStat
              icon={Circle}
              label="To do"
              value={summary.todo}
            />
            <MiniStat
              icon={Clock}
              label="WIP"
              value={summary.in_progress}
              tone="text-blue-300"
            />
            <MiniStat
              icon={CheckSquare}
              label="Done"
              value={summary.done}
              tone="text-green-300"
            />
            <MiniStat
              icon={AlertCircle}
              label="Overdue"
              value={summary.overdue}
              tone={summary.overdue > 0 ? "text-red-300" : "text-foreground"}
            />
          </div>
          {upNext.length === 0 ? (
            <CardEmpty message="Nothing's assigned to you. Enjoy the calm." />
          ) : (
            <div className="border-t border-border pt-3">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-2">
                Up next ({upNext.length})
              </div>
              <ul className="flex flex-col divide-y divide-border">
                {upNext.map((t) => (
                  <li key={t.id} className="py-2 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-foreground truncate">
                        {t.title}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {t.project_name ?? "—"}
                        {t.due_date && (
                          <> · due {formatDate(t.due_date)}</>
                        )}
                      </div>
                    </div>
                    <PriorityBadge priority={t.priority} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </DashboardCard>
  );
}
