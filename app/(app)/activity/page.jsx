"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Calendar,
  Filter as FilterIcon,
  X,
} from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import SearchInput from "@/components/ui/SearchInput";
import FilterChip from "@/components/ui/FilterChip";
import ActivityItem from "@/components/activity/ActivityItem";
import Pagination from "@/components/ui/Pagination";
import EmptyState from "@/components/ui/EmptyState";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { api } from "@/lib/api";
import { useApi } from "@/lib/hooks/useApi";
import { usePagination } from "@/lib/hooks/usePagination";
import { formatDate, timeAgo } from "@/lib/formatters";
import { getActivityIcon } from "@/lib/activityIcon";
import { useAuth } from "@/lib/auth/AuthProvider";

function useDebounced(value, ms = 250) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

// Pretty labels for the structured entity types the server emits.
const ENTITY_LABELS = {
  all: "All",
  auth: "Auth",
  user: "Users",
  project: "Projects",
  task: "Tasks",
  milestone: "Milestones",
  team: "Teams",
  assignment: "Assignments",
};

// Group activity rows into "Today", "Yesterday", then by date for the
// timeline view. Pure function so it's trivial to memoise.
function groupByDay(items) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const groups = new Map();
  for (const item of items) {
    const d = new Date(item.created_at);
    d.setHours(0, 0, 0, 0);
    const key = d.toISOString();
    if (!groups.has(key)) {
      let label = formatDate(d);
      if (d.getTime() === today.getTime()) label = "Today";
      else if (d.getTime() === yesterday.getTime()) label = "Yesterday";
      groups.set(key, { key, label, rows: [] });
    }
    groups.get(key).rows.push(item);
  }
  return [...groups.values()];
}

export default function ActivityLog() {
  const { user } = useAuth();
  // Any signed-in user can prune the activity log. We still defend
  // against an un-resolved AuthProvider state by requiring `user`.
  const canDelete = !!user;

  const [tone, setTone] = useState("All");
  const [entityType, setEntityType] = useState("all");
  const [actorId, setActorId] = useState("");
  const [action, setAction] = useState("");
  const [since, setSince] = useState("");
  const [until, setUntil] = useState("");
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounced(query, 250);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [actionError, setActionError] = useState(null);

  // Server-side filters (everything except `tone` which is local + cheap
  // since we already render every loaded row).
  const queryParams = useMemo(
    () => ({
      entity_type: entityType !== "all" ? entityType : undefined,
      actor_id: actorId || undefined,
      action: action || undefined,
      since: since || undefined,
      until: until || undefined,
      q: debouncedQuery || undefined,
      limit: 500,
    }),
    [entityType, actorId, action, since, until, debouncedQuery]
  );
  const fetcher = useMemo(() => () => api.activity(queryParams), [queryParams]);
  const { data, error, loading, refetch } = useApi(fetcher);
  const items = data?.items ?? [];

  async function handleDelete() {
    if (!deleteTarget) return;
    setActionError(null);
    try {
      await api.deleteActivity(deleteTarget.id);
      refetch();
    } catch (err) {
      setActionError(err.message || "Could not delete activity entry.");
      throw err;
    }
  }

  // The filter dropdowns only need to refresh when activity is mutated,
  // which is rare relative to filter clicks — so we let it lazy-load once.
  const filtersFetcher = useMemo(() => () => api.activityFilters(), []);
  const { data: filtersData } = useApi(filtersFetcher);
  const entityTypes = filtersData?.entity_types ?? [];
  const actorOptions = filtersData?.actors ?? [];
  const actionOptions = filtersData?.actions ?? [];

  // Local-only filter: tone (kept for the existing UX of the toolbar chips).
  const filtered = useMemo(() => {
    if (tone === "All") return items;
    return items.filter((a) => a.tone === tone);
  }, [items, tone]);

  const { page, setPage, totalPages, paged, start, end } = usePagination(
    filtered,
    25,
    `${tone}|${entityType}|${actorId}|${action}|${since}|${until}|${debouncedQuery}`
  );

  const grouped = useMemo(() => groupByDay(paged), [paged]);

  const hasActiveFilters =
    tone !== "All" ||
    entityType !== "all" ||
    actorId !== "" ||
    action !== "" ||
    since !== "" ||
    until !== "" ||
    debouncedQuery !== "";

  function clearAll() {
    setTone("All");
    setEntityType("all");
    setActorId("");
    setAction("");
    setSince("");
    setUntil("");
    setQuery("");
  }

  const toneFilters = [
    { label: "All", value: "All" },
    { label: "Created", value: "primary" },
    { label: "Completed", value: "success" },
    { label: "Updated", value: "warning" },
    { label: "Removed", value: "muted" },
  ];

  return (
    <>
      <PageHeader
        title="Activity Log"
        subtitle="Full audit trail of every login, change, and lifecycle event."
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        tone="danger"
        title="Delete activity entry?"
        confirmLabel="Delete entry"
        message={
          <>
            Remove this audit record? It cannot be recovered.
            {deleteTarget?.message && (
              <div className="mt-2 px-3 py-2 rounded-md bg-input/60 border border-border text-xs text-muted-foreground italic line-clamp-3">
                “{deleteTarget.message}”
              </div>
            )}
          </>
        }
      />

      <div className="px-8 py-6 flex flex-col gap-5">
        {/* Search + tone row */}
        <div className="flex items-center gap-3 flex-wrap">
          <SearchInput
            placeholder="Search activity, actor, or ID…"
            className="flex-1 max-w-xs"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="flex items-center gap-2 flex-wrap">
            {toneFilters.map((f) => (
              <FilterChip
                key={f.value}
                active={tone === f.value}
                onClick={() => setTone(f.value)}
              >
                {f.label}
              </FilterChip>
            ))}
          </div>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearAll}
              className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <X className="w-3 h-3" strokeWidth={2.4} />
              Clear filters
            </button>
          )}
        </div>

        {/* Entity type chips — derived from what's actually in the DB so we
            don't show options that would return zero results. */}
        <div className="flex items-center gap-2 flex-wrap">
          <FilterIcon
            className="w-3.5 h-3.5 text-muted-foreground"
            strokeWidth={2.4}
          />
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground mr-1">
            Entity:
          </span>
          <FilterChip
            active={entityType === "all"}
            onClick={() => setEntityType("all")}
          >
            All
          </FilterChip>
          {entityTypes.map((t) => (
            <FilterChip
              key={t.entity_type}
              active={entityType === t.entity_type}
              onClick={() => setEntityType(t.entity_type)}
            >
              {ENTITY_LABELS[t.entity_type] ?? t.entity_type}{" "}
              <span className="opacity-60">({t.count})</span>
            </FilterChip>
          ))}
        </div>

        {/* Date + actor + action row */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">
              <Calendar className="w-3 h-3" strokeWidth={2.4} />
              From
            </label>
            <input
              type="date"
              value={since}
              onChange={(e) => setSince(e.target.value)}
              className="bg-input border border-border rounded-md px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-primary"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">
              <Calendar className="w-3 h-3" strokeWidth={2.4} />
              To
            </label>
            <input
              type="date"
              value={until}
              onChange={(e) => setUntil(e.target.value)}
              className="bg-input border border-border rounded-md px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-primary"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Actor
            </label>
            <select
              value={actorId}
              onChange={(e) => setActorId(e.target.value)}
              className="bg-input border border-border rounded-md px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-primary"
            >
              <option value="">All actors</option>
              {actorOptions.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.count})
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Action
            </label>
            <select
              value={action}
              onChange={(e) => setAction(e.target.value)}
              className="bg-input border border-border rounded-md px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-primary"
            >
              <option value="">All actions</option>
              {actionOptions.map((a) => (
                <option key={a.action} value={a.action}>
                  {a.action} ({a.count})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">
            {filtered.length} events
          </span>
          {hasActiveFilters && items.length > 0 && (
            <span> match the current filters.</span>
          )}
        </div>

        {actionError && (
          <div className="p-3 rounded-md border border-red-500/30 bg-red-500/10 text-sm text-red-300 flex items-start justify-between gap-3">
            <span>{actionError}</span>
            <button
              type="button"
              onClick={() => setActionError(null)}
              className="text-red-300 hover:text-red-100"
              aria-label="Dismiss"
            >
              <X className="w-3.5 h-3.5" strokeWidth={2.6} />
            </button>
          </div>
        )}

        {error && (
          <div className="p-4 rounded-md border border-red-500/30 bg-red-500/10 text-sm text-red-300">
            <div className="font-semibold mb-1">
              Couldn&apos;t load activity.
            </div>
            <div className="text-xs font-mono break-all">{error.message}</div>
          </div>
        )}

        {/* Timeline: events grouped under date headings. */}
        <div className="border border-border rounded-lg bg-background">
          {loading && (
            <div className="py-10 text-center text-sm text-muted-foreground">
              Loading activity…
            </div>
          )}
          {!loading && filtered.length === 0 && (
            <EmptyState
              icon={Activity}
              title={
                hasActiveFilters
                  ? "No activity matches your filters"
                  : "No activity recorded yet"
              }
              description={
                hasActiveFilters
                  ? "Try widening the date range or clearing a filter."
                  : "Audit events show up here as you sign in, create projects, assign tasks, and update users."
              }
            />
          )}
          {!loading &&
            grouped.map((g) => (
              <div key={g.key} className="border-b border-border last:border-b-0">
                <div className="sticky top-0 z-10 bg-background/95 backdrop-blur px-4 py-2 border-b border-border">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {g.label}
                  </h3>
                </div>
                <div className="p-1">
                  {g.rows.map((a) => (
                    <div key={a.id} className="px-4">
                      <ActivityItem
                        icon={getActivityIcon(a.icon)}
                        tone={a.tone}
                        message={
                          a.actor_name ? (
                            <span>
                              <span className="font-medium text-foreground">
                                {a.actor_name}
                              </span>{" "}
                              <span className="text-muted-foreground">·</span>{" "}
                              {a.message}
                            </span>
                          ) : (
                            a.message
                          )
                        }
                        time={timeAgo(a.created_at)}
                        onDelete={
                          canDelete
                            ? () =>
                                setDeleteTarget({
                                  id: a.id,
                                  message: a.message,
                                })
                            : undefined
                        }
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
        </div>

        <Pagination
          totalLabel={`Showing ${start}–${end} of ${filtered.length} events`}
          page={page}
          totalPages={totalPages}
          onChange={setPage}
        />
      </div>
    </>
  );
}
