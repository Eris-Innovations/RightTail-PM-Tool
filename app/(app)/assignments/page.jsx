"use client";

import { useMemo, useState } from "react";
import {
  Plus,
  RefreshCw,
  Trash2,
  SlidersHorizontal,
  User,
  ChevronDown,
  ClipboardList,
} from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import SearchInput from "@/components/ui/SearchInput";
import FilterChip from "@/components/ui/FilterChip";
import StatusBadge from "@/components/ui/StatusBadge";
import PriorityBadge from "@/components/ui/PriorityBadge";
import Pagination from "@/components/ui/Pagination";
import EmptyState from "@/components/ui/EmptyState";
import { api } from "@/lib/api";
import { useApi } from "@/lib/hooks/useApi";
import { usePagination } from "@/lib/hooks/usePagination";
import { formatDate } from "@/lib/formatters";

const filters = ["All", "To Do", "In Progress", "Done"];

const summaryStyle = {
  "To Do": "bg-muted-foreground/40",
  "In Progress": "bg-yellow-400",
  Done: "bg-green-400",
};

export default function TaskAssignments() {
  const [active, setActive] = useState("All");
  const [query, setQuery] = useState("");

  const { data, error, loading } = useApi(api.assignments);
  const items = data?.items ?? [];
  const summary = data?.summary ?? [];

  const filtered = useMemo(() => {
    return items.filter((a) => {
      const statusMatch = active === "All" ? true : a.status === active;
      const queryMatch = query
        ? `${a.title} ${a.project_name ?? ""} ${a.assignee_name ?? ""} ${a.id}`
            .toLowerCase()
            .includes(query.toLowerCase())
        : true;
      return statusMatch && queryMatch;
    });
  }, [items, active, query]);

  const { page, setPage, totalPages, paged, start, end } = usePagination(
    filtered,
    10,
    `${active}|${query}`
  );

  return (
    <>
      <PageHeader
        title="Task Assignments"
        subtitle="Assign tasks to team members, reassign, and track progress."
      >
        <button
          type="button"
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
        >
          <Plus className="w-3.5 h-3.5" strokeWidth={3} />
          Assign Task
        </button>
      </PageHeader>

      <div className="px-8 py-6 flex flex-col gap-5">
        <div className="flex items-center gap-3 flex-wrap">
          <SearchInput
            placeholder="Search assignments..."
            className="flex-1 max-w-xs"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="flex items-center gap-2 flex-wrap">
            {filters.map((f) => (
              <FilterChip
                key={f}
                active={active === f}
                onClick={() => setActive(f)}
              >
                {f}
              </FilterChip>
            ))}
          </div>
          <button
            type="button"
            className="flex items-center gap-2 border border-border rounded-md px-3 py-2 text-sm text-muted-foreground bg-input hover:text-foreground transition-colors"
          >
            <User className="w-3.5 h-3.5" strokeWidth={2.4} />
            All Assignees
            <ChevronDown className="w-3 h-3" strokeWidth={2.6} />
          </button>
          <button
            type="button"
            className="ml-auto flex items-center gap-2 border border-border rounded-md px-3 py-2 text-sm text-muted-foreground bg-input hover:text-foreground transition-colors"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" strokeWidth={2.4} />
            Filter
          </button>
        </div>

        <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
          <span className="font-medium text-foreground">
            {items.length} assignments total
          </span>
          {summary.map((s) => (
            <span key={s.status} className="flex items-center gap-1.5">
              <span
                className={`w-2 h-2 rounded-full inline-block ${
                  summaryStyle[s.status] ?? "bg-muted-foreground/40"
                }`}
              />
              {s.count} {s.status}
            </span>
          ))}
        </div>

        {error && (
          <div className="p-4 rounded-md border border-red-500/30 bg-red-500/10 text-sm text-red-300">
            <div className="font-semibold mb-1">
              Couldn&apos;t load assignments.
            </div>
            <div className="text-xs font-mono break-all">{error.message}</div>
          </div>
        )}

        <div className="border border-border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-input border-b border-border">
                  {[
                    "ID",
                    "Task / Project",
                    "Assigned To",
                    "Assigned By",
                    "Priority",
                    "Status",
                    "Due Date",
                    "Actions",
                  ].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-background">
                {loading && (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-4 py-10 text-center text-sm text-muted-foreground"
                    >
                      Loading assignments from Neon…
                    </td>
                  </tr>
                )}
                {!loading &&
                  paged.map((a) => (
                    <tr
                      key={a.id}
                      className="border-b border-border last:border-b-0 hover:bg-input/50 transition-colors"
                    >
                      <td className="px-4 py-3 text-xs text-muted-foreground font-mono">
                        {a.id}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm font-medium text-foreground">
                          {a.title}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {a.project_name}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-foreground whitespace-nowrap">
                        {a.assignee_name ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">
                        {a.assigner_name ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <PriorityBadge priority={a.priority} />
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={a.status} />
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">
                        {formatDate(a.due_date)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            className="flex items-center gap-1 text-xs text-primary border border-secondary rounded px-2 py-1 font-medium hover:bg-secondary/50 transition-colors"
                          >
                            <RefreshCw
                              className="w-2.5 h-2.5"
                              strokeWidth={3}
                            />
                            Reassign
                          </button>
                          <button
                            type="button"
                            className="flex items-center gap-1 text-xs text-muted-foreground border border-border rounded px-2 py-1 font-medium hover:text-foreground transition-colors"
                          >
                            <Trash2 className="w-2.5 h-2.5" strokeWidth={3} />
                            Remove
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                {!loading && filtered.length === 0 && (
                  <tr>
                    <td colSpan={8} className="p-0">
                      {items.length === 0 ? (
                        <EmptyState
                          icon={ClipboardList}
                          title="No task assignments yet"
                          description='Click "Assign Task" to assign a task to a team member.'
                        />
                      ) : (
                        <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                          No assignments match your filters.
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <Pagination
          totalLabel={`Showing ${start}–${end} of ${filtered.length} assignments`}
          page={page}
          totalPages={totalPages}
          onChange={setPage}
        />
      </div>
    </>
  );
}
