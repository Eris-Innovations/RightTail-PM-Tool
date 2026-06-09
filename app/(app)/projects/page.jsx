"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Plus,
  FolderOpen,
  Eye,
  Pencil,
  Archive,
  ArchiveRestore,
  Trash2,
  Tag,
  X,
} from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import SearchInput from "@/components/ui/SearchInput";
import FilterChip from "@/components/ui/FilterChip";
import StatusBadge from "@/components/ui/StatusBadge";
import PriorityBadge from "@/components/ui/PriorityBadge";
import Pagination from "@/components/ui/Pagination";
import EmptyState from "@/components/ui/EmptyState";
import RowActionMenu from "@/components/ui/RowActionMenu";
import ProjectFormModal from "@/components/projects/ProjectFormModal";
import ProjectDetailModal from "@/components/projects/ProjectDetailModal";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { api } from "@/lib/api";
import { useApi } from "@/lib/hooks/useApi";
import { usePagination } from "@/lib/hooks/usePagination";
import { formatDate } from "@/lib/formatters";
import { useAuth } from "@/lib/auth/AuthProvider";

const STATUSES = ["All", "Planning", "In Progress", "Completed", "On Hold"];
const PRIORITIES = ["All", "Critical", "High", "Medium", "Low"];

const summaryStyle = {
  "In Progress": "bg-yellow-400",
  Planning: "bg-blue-400",
  Completed: "bg-green-400",
  "On Hold": "bg-muted-foreground/40",
};

// Debounce hook — applies server-side search after the user pauses typing so
// every keystroke doesn't slam the API.
function useDebounced(value, delay = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

export default function Projects() {
  const { user } = useAuth();
  const canCreate = user?.role === "admin" || user?.role === "manager";
  const canEdit = canCreate;
  const canDelete = user?.role === "admin";

  // Filters
  const [status, setStatus] = useState("All");
  const [priority, setPriority] = useState("All");
  const [ownerId, setOwnerId] = useState("");
  const [startFrom, setStartFrom] = useState("");
  const [endTo, setEndTo] = useState("");
  const [query, setQuery] = useState("");
  const [archivedView, setArchivedView] = useState("active"); // active | with-archived | only-archived
  const debouncedQuery = useDebounced(query, 300);

  // Owner dropdown source
  const [users, setUsers] = useState([]);
  useEffect(() => {
    api
      .users()
      .then((res) => setUsers(res.items ?? []))
      .catch(() => setUsers([]));
  }, []);

  // Build the query-string passed to the server. Empty values are dropped so
  // the URL stays clean and the server logic stays simple.
  const queryParams = useMemo(() => {
    const params = {};
    if (status !== "All") params.status = status;
    if (priority !== "All") params.priority = priority;
    if (ownerId) params.owner_id = ownerId;
    if (startFrom) params.start_from = startFrom;
    if (endTo) params.end_to = endTo;
    if (debouncedQuery.trim()) params.q = debouncedQuery.trim();
    if (archivedView === "with-archived") params.include_archived = "true";
    if (archivedView === "only-archived") params.only_archived = "true";
    return params;
  }, [status, priority, ownerId, startFrom, endTo, debouncedQuery, archivedView]);

  const fetcher = useCallback(() => api.projects(queryParams), [queryParams]);
  const { data, error, loading, refetch } = useApi(fetcher, [queryParams]);
  const items = data?.items ?? [];
  const summary = data?.summary ?? [];
  const archivedCount = data?.archivedCount ?? 0;

  const { page, setPage, totalPages, paged, start, end } = usePagination(
    items,
    10,
    JSON.stringify(queryParams)
  );

  // Action state
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [detailTargetId, setDetailTargetId] = useState(null);
  const [archiveTarget, setArchiveTarget] = useState(null);
  const [restoreTarget, setRestoreTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [actionError, setActionError] = useState(null);

  function clearFilters() {
    setStatus("All");
    setPriority("All");
    setOwnerId("");
    setStartFrom("");
    setEndTo("");
    setQuery("");
    setArchivedView("active");
  }

  const hasFilters =
    status !== "All" ||
    priority !== "All" ||
    !!ownerId ||
    !!startFrom ||
    !!endTo ||
    !!query ||
    archivedView !== "active";

  return (
    <>
      <PageHeader
        title="Projects"
        subtitle="Manage, create, and track all your projects."
      >
        {canCreate && (
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
          >
            <Plus className="w-3.5 h-3.5" strokeWidth={3} />
            New Project
          </button>
        )}
      </PageHeader>

      <ProjectFormModal
        open={createOpen}
        mode="create"
        onClose={() => setCreateOpen(false)}
        onSaved={() => refetch()}
      />

      <ProjectFormModal
        open={!!editTarget}
        mode="edit"
        project={editTarget}
        onClose={() => setEditTarget(null)}
        onSaved={() => refetch()}
      />

      <ProjectDetailModal
        open={!!detailTargetId}
        projectId={detailTargetId}
        onClose={() => setDetailTargetId(null)}
      />

      <ConfirmDialog
        open={!!archiveTarget}
        onClose={() => setArchiveTarget(null)}
        onConfirm={async () => {
          await api.archiveProject(archiveTarget.id);
          refetch();
        }}
        tone="warning"
        title="Archive project?"
        confirmLabel="Archive"
        message={
          <>
            Archive <span className="font-semibold">{archiveTarget?.name}</span>?
            It will be hidden from the active list but can be restored at any
            time.
          </>
        }
      />

      <ConfirmDialog
        open={!!restoreTarget}
        onClose={() => setRestoreTarget(null)}
        onConfirm={async () => {
          await api.restoreProject(restoreTarget.id);
          refetch();
        }}
        tone="primary"
        title="Restore project?"
        confirmLabel="Restore"
        message={
          <>
            Bring{" "}
            <span className="font-semibold">{restoreTarget?.name}</span> back to
            the active project list?
          </>
        }
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          await api.deleteProject(deleteTarget.id);
          refetch();
        }}
        tone="danger"
        title="Delete project permanently?"
        confirmLabel="Delete forever"
        requireText={deleteTarget?.id}
        message={
          <>
            This permanently deletes{" "}
            <span className="font-semibold">{deleteTarget?.name}</span> and{" "}
            <span className="font-semibold">all of its tasks</span>. This action
            cannot be undone.
          </>
        }
      />

      <div className="px-8 py-6 flex flex-col gap-5">
        {/* Row 1 — search + archived view toggle */}
        <div className="flex items-center gap-3 flex-wrap">
          <SearchInput
            placeholder="Search by name, description, ID, tag, or category…"
            className="flex-1 max-w-md"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="ml-auto flex items-center gap-2 bg-input border border-border rounded-md p-0.5">
            {[
              { id: "active", label: "Active" },
              { id: "with-archived", label: "All" },
              {
                id: "only-archived",
                label: `Archived${archivedCount ? ` (${archivedCount})` : ""}`,
              },
            ].map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setArchivedView(opt.id)}
                className={`px-2.5 py-1 text-xs rounded-[5px] font-medium transition-colors ${
                  archivedView === opt.id
                    ? "bg-secondary text-secondary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Row 2 — status chips */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs uppercase tracking-wide text-muted-foreground mr-1">
            Status
          </span>
          {STATUSES.map((s) => (
            <FilterChip
              key={s}
              active={status === s}
              onClick={() => setStatus(s)}
            >
              {s}
            </FilterChip>
          ))}
        </div>

        {/* Row 3 — priority chips */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs uppercase tracking-wide text-muted-foreground mr-1">
            Priority
          </span>
          {PRIORITIES.map((p) => (
            <FilterChip
              key={p}
              active={priority === p}
              onClick={() => setPriority(p)}
            >
              {p}
            </FilterChip>
          ))}
        </div>

        {/* Row 4 — owner + date range + clear */}
        <div className="flex items-end gap-3 flex-wrap">
          <div className="flex flex-col gap-1">
            <label className="text-xs uppercase tracking-wide text-muted-foreground">
              Owner
            </label>
            <select
              value={ownerId}
              onChange={(e) => setOwnerId(e.target.value)}
              className="bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground outline-none focus:border-primary min-w-44"
            >
              <option value="">All owners</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs uppercase tracking-wide text-muted-foreground">
              Start from
            </label>
            <input
              type="date"
              value={startFrom}
              onChange={(e) => setStartFrom(e.target.value)}
              className="bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs uppercase tracking-wide text-muted-foreground">
              End by
            </label>
            <input
              type="date"
              value={endTo}
              onChange={(e) => setEndTo(e.target.value)}
              className="bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
            />
          </div>
          {hasFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="flex items-center gap-1.5 px-3 py-2 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <X className="w-3 h-3" strokeWidth={2.6} />
              Clear filters
            </button>
          )}
        </div>

        <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
          <span className="font-medium text-foreground">
            {items.length} project{items.length === 1 ? "" : "s"} matching
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
            <div className="font-semibold mb-1">Couldn&apos;t load projects.</div>
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
                    "Project",
                    "Status",
                    "Priority",
                    "Owner",
                    "Dates",
                    "Tags",
                    "",
                  ].map((h, i) => (
                    <th
                      key={`${h}-${i}`}
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
                      Loading projects from Neon…
                    </td>
                  </tr>
                )}
                {!loading &&
                  paged.map((p) => {
                    const archived = !!p.archived_at;
                    const completion =
                      p.total_tasks > 0
                        ? Math.round((p.done_tasks / p.total_tasks) * 100)
                        : 0;
                    return (
                      <tr
                        key={p.id}
                        onClick={() => setDetailTargetId(p.id)}
                        className={`border-b border-border last:border-b-0 transition-colors cursor-pointer ${
                          archived
                            ? "opacity-60 hover:bg-input/40"
                            : "hover:bg-input/50"
                        }`}
                      >
                        <td className="px-4 py-3 text-xs text-muted-foreground font-mono">
                          {p.id}
                        </td>
                        <td className="px-4 py-3 min-w-60">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-foreground truncate max-w-xs">
                              {p.name}
                            </span>
                            {archived && (
                              <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-zinc-700/40 text-zinc-300 font-semibold flex-shrink-0">
                                Archived
                              </span>
                            )}
                          </div>
                          {p.description && (
                            <div className="text-xs text-muted-foreground mt-0.5 line-clamp-1 max-w-md">
                              {p.description}
                            </div>
                          )}
                          {p.total_tasks > 0 && (
                            <div className="text-[11px] text-muted-foreground mt-1">
                              {completion}% · {p.done_tasks}/{p.total_tasks} tasks
                              {p.category && (
                                <span className="ml-2">· {p.category}</span>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={p.status} />
                        </td>
                        <td className="px-4 py-3">
                          <PriorityBadge priority={p.priority} />
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">
                          {p.owner_name ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                          {formatDate(p.start_date)}
                          {p.end_date && (
                            <>
                              <span className="mx-1">→</span>
                              {formatDate(p.end_date)}
                            </>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1 flex-wrap max-w-40">
                            {Array.isArray(p.tags) && p.tags.length > 0 ? (
                              p.tags.slice(0, 3).map((t) => (
                                <span
                                  key={t}
                                  className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-secondary/40 text-secondary-foreground"
                                >
                                  <Tag className="w-2.5 h-2.5" strokeWidth={2.4} />
                                  {t}
                                </span>
                              ))
                            ) : (
                              <span className="text-xs text-muted-foreground/50">—</span>
                            )}
                            {Array.isArray(p.tags) && p.tags.length > 3 && (
                              <span className="text-[10px] text-muted-foreground">
                                +{p.tags.length - 3}
                              </span>
                            )}
                          </div>
                        </td>
                        <td
                          className="px-4 py-3 text-right"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <RowActionMenu
                            ariaLabel={`Actions for ${p.name}`}
                            items={[
                              {
                                label: "View details",
                                icon: Eye,
                                onClick: () => setDetailTargetId(p.id),
                              },
                              canEdit && !archived && {
                                label: "Edit",
                                icon: Pencil,
                                onClick: () => setEditTarget(p),
                              },
                              canEdit && !archived && {
                                label: "Archive",
                                icon: Archive,
                                tone: "warning",
                                onClick: () =>
                                  setArchiveTarget({ id: p.id, name: p.name }),
                              },
                              canEdit && archived && {
                                label: "Restore",
                                icon: ArchiveRestore,
                                onClick: () =>
                                  setRestoreTarget({ id: p.id, name: p.name }),
                              },
                              canDelete && {
                                label: "Delete forever",
                                icon: Trash2,
                                tone: "danger",
                                onClick: () =>
                                  setDeleteTarget({ id: p.id, name: p.name }),
                              },
                            ]}
                          />
                        </td>
                      </tr>
                    );
                  })}
                {!loading && items.length === 0 && (
                  <tr>
                    <td colSpan={8} className="p-0">
                      {!hasFilters ? (
                        <EmptyState
                          icon={FolderOpen}
                          title="No projects yet"
                          description={
                            canCreate
                              ? "Create your first project to get started."
                              : "Ask your admin or a project manager to create one."
                          }
                          action={
                            canCreate ? (
                              <button
                                type="button"
                                onClick={() => setCreateOpen(true)}
                                className="mt-3 flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
                              >
                                <Plus className="w-3.5 h-3.5" strokeWidth={3} />
                                New Project
                              </button>
                            ) : null
                          }
                        />
                      ) : (
                        <div className="px-4 py-12 text-center">
                          <div className="text-sm text-foreground">
                            No projects match your filters.
                          </div>
                          <button
                            type="button"
                            onClick={clearFilters}
                            className="mt-3 text-xs text-primary font-medium hover:underline"
                          >
                            Clear filters
                          </button>
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
          totalLabel={`Showing ${start}–${end} of ${items.length} project${items.length === 1 ? "" : "s"}`}
          page={page}
          totalPages={totalPages}
          onChange={setPage}
        />
      </div>
    </>
  );
}
