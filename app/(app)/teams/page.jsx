"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  UsersRound,
  Crown,
  Eye,
  Pencil,
  Trash2,
  Users as UsersIcon,
  Briefcase,
  Clock,
} from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import SearchInput from "@/components/ui/SearchInput";
import Pagination from "@/components/ui/Pagination";
import EmptyState from "@/components/ui/EmptyState";
import RowActionMenu from "@/components/ui/RowActionMenu";
import TeamFormModal from "@/components/teams/TeamFormModal";
import TeamDetailModal from "@/components/teams/TeamDetailModal";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { api } from "@/lib/api";
import { useApi } from "@/lib/hooks/useApi";
import { usePagination } from "@/lib/hooks/usePagination";
import { formatDate } from "@/lib/formatters";
import { useAuth } from "@/lib/auth/AuthProvider";

function useDebounced(value, ms = 250) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

export default function Teams() {
  const { user } = useAuth();
  // Team CRUD is open to any signed-in user.
  const canManage = !!user;
  const canDelete = !!user;

  const [search, setSearch] = useState("");
  const debounced = useDebounced(search);
  const queryParams = useMemo(
    () => (debounced ? { q: debounced } : null),
    [debounced]
  );
  const fetcher = useMemo(() => () => api.teams(queryParams), [queryParams]);
  const { data, error, loading, refetch } = useApi(fetcher);
  const items = data?.items ?? [];

  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [detailTargetId, setDetailTargetId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [actionError, setActionError] = useState(null);

  async function confirmDelete() {
    if (!deleteTarget) return;
    setActionError(null);
    try {
      await api.deleteTeam(deleteTarget.id);
      setDeleteTarget(null);
      refetch();
    } catch (err) {
      setActionError(err.message || "Could not delete team.");
    }
  }

  const { page, setPage, totalPages, paged, start, end } = usePagination(
    items,
    10,
    debounced
  );

  return (
    <>
      <PageHeader
        title="Teams"
        subtitle="Organise people into teams with leaders, projects, and shared workload."
      >
        {canManage && (
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
          >
            <Plus className="w-3.5 h-3.5" strokeWidth={3} />
            Create Team
          </button>
        )}
      </PageHeader>

      <TeamFormModal
        open={createOpen}
        mode="create"
        onClose={() => setCreateOpen(false)}
        onSaved={() => refetch()}
      />
      <TeamFormModal
        open={!!editTarget}
        mode="edit"
        team={editTarget}
        onClose={() => setEditTarget(null)}
        onSaved={() => refetch()}
      />
      <TeamDetailModal
        open={!!detailTargetId}
        teamId={detailTargetId}
        onClose={() => setDetailTargetId(null)}
      />
      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete team"
        message={`Delete ${deleteTarget?.name}? Projects assigned to this team will be released (not deleted), and all member assignments cleared.`}
        confirmLabel="Delete team"
        tone="danger"
        requireText={deleteTarget?.name}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
      />

      <div className="px-8 py-6 flex flex-col gap-5">
        <div className="flex items-center gap-3 flex-wrap">
          <SearchInput
            placeholder="Search teams by name or ID…"
            className="flex-1 max-w-xs"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {actionError && (
          <div className="p-3 rounded-md border border-red-500/30 bg-red-500/10 text-sm text-red-300">
            {actionError}
          </div>
        )}

        {error && (
          <div className="p-4 rounded-md border border-red-500/30 bg-red-500/10 text-sm text-red-300">
            <div className="font-semibold mb-1">Couldn&apos;t load teams.</div>
            <div className="text-xs font-mono break-all">{error.message}</div>
          </div>
        )}

        <div className="border border-border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-input border-b border-border">
                  {[
                    "Team",
                    "Leader",
                    "Members",
                    "Active Projects",
                    "Active Tasks",
                    "Created",
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
                      colSpan={7}
                      className="px-4 py-10 text-center text-sm text-muted-foreground"
                    >
                      Loading teams…
                    </td>
                  </tr>
                )}
                {!loading &&
                  paged.map((t) => (
                    <tr
                      key={t.id}
                      className="border-b border-border last:border-b-0 hover:bg-input/50 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => setDetailTargetId(t.id)}
                          className="flex items-start gap-3 min-w-0 text-left"
                        >
                          <div className="w-9 h-9 rounded-md bg-secondary flex items-center justify-center flex-shrink-0">
                            <UsersRound
                              className="w-4 h-4 text-secondary-foreground"
                              strokeWidth={2.4}
                            />
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-foreground truncate hover:underline">
                              {t.name}
                            </div>
                            <div className="text-xs text-muted-foreground font-mono truncate">
                              {t.id}
                            </div>
                            {t.description && (
                              <div className="text-xs text-muted-foreground mt-0.5 line-clamp-1 max-w-md">
                                {t.description}
                              </div>
                            )}
                          </div>
                        </button>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {t.leader_name ? (
                          <span className="inline-flex items-center gap-1.5 text-sm text-foreground">
                            <Crown
                              className="w-3 h-3 text-yellow-400"
                              strokeWidth={2.6}
                            />
                            {t.leader_name}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">
                            None
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 text-sm text-foreground">
                          <UsersIcon
                            className="w-3 h-3 text-muted-foreground"
                            strokeWidth={2.4}
                          />
                          {t.member_count}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 text-sm text-foreground">
                          <Briefcase
                            className="w-3 h-3 text-muted-foreground"
                            strokeWidth={2.4}
                          />
                          {t.active_project_count}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 text-sm text-foreground">
                          <Clock
                            className="w-3 h-3 text-muted-foreground"
                            strokeWidth={2.4}
                          />
                          {t.active_task_count}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">
                        {formatDate(t.created_at)}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <RowActionMenu
                          items={[
                            {
                              label: "Open team",
                              icon: Eye,
                              onClick: () => setDetailTargetId(t.id),
                            },
                            {
                              label: "Edit team",
                              icon: Pencil,
                              onClick: () => setEditTarget(t),
                            },
                            {
                              label: "Delete team",
                              icon: Trash2,
                              tone: "danger",
                              onClick: () => setDeleteTarget(t),
                            },
                          ]}
                        />
                      </td>
                    </tr>
                  ))}
                {!loading && items.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-0">
                      <EmptyState
                        icon={UsersRound}
                        title={
                          debounced ? "No teams match your search" : "No teams yet"
                        }
                        description={
                          debounced
                            ? "Try a different search term, or clear the filter."
                            : canManage
                              ? 'Click "Create Team" to spin up your first team.'
                              : "Ask an admin or manager to create the first team."
                        }
                        action={
                          !debounced && canManage ? (
                            <button
                              type="button"
                              onClick={() => setCreateOpen(true)}
                              className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
                            >
                              <Plus className="w-3.5 h-3.5" strokeWidth={3} />
                              Create Team
                            </button>
                          ) : null
                        }
                      />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <Pagination
          totalLabel={`Showing ${start}–${end} of ${items.length} teams`}
          page={page}
          totalPages={totalPages}
          onChange={setPage}
        />
      </div>
    </>
  );
}
