"use client";

import { useMemo, useState, useEffect } from "react";
import {
  Plus,
  Users as UsersIcon,
  ShieldCheck,
  Loader2,
  Eye,
  Pencil,
  KeyRound,
  UserCheck,
  UserX,
  Trash2,
  Copy,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import SearchInput from "@/components/ui/SearchInput";
import FilterChip from "@/components/ui/FilterChip";
import Pagination from "@/components/ui/Pagination";
import EmptyState from "@/components/ui/EmptyState";
import RowActionMenu from "@/components/ui/RowActionMenu";
import UserFormModal from "@/components/users/UserFormModal";
import UserDetailModal from "@/components/users/UserDetailModal";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import Modal from "@/components/ui/Modal";
import { api } from "@/lib/api";
import { useApi } from "@/lib/hooks/useApi";
import { usePagination } from "@/lib/hooks/usePagination";
import { formatDate } from "@/lib/formatters";
import { useAuth } from "@/lib/auth/AuthProvider";

const ALL_ROLES = ["admin", "manager", "member"];

const roleStyle = {
  admin: "bg-purple-500/15 text-purple-300",
  manager: "bg-blue-500/15 text-blue-300",
  member: "bg-zinc-500/15 text-zinc-300",
};

function initials(name) {
  return (name ?? "?")
    .split(/\s+/)
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

// Light-touch toast for transient feedback (reset-link copied, etc.).
function useTransient(ms = 3000) {
  const [msg, setMsg] = useState(null);
  useEffect(() => {
    if (!msg) return;
    const id = setTimeout(() => setMsg(null), ms);
    return () => clearTimeout(id);
  }, [msg, ms]);
  return [msg, setMsg];
}

export default function Users() {
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("All");
  const [status, setStatus] = useState("All");
  const [department, setDepartment] = useState("All");
  const [pendingRoleId, setPendingRoleId] = useState(null);
  const [roleError, setRoleError] = useState(null);

  const { user: currentUser } = useAuth();
  const isAdmin = currentUser?.role === "admin";

  const { data, error, loading, refetch } = useApi(api.users);
  const items = data?.items ?? [];
  const summary = data?.summary ?? [];
  const statusSummary = data?.statusSummary ?? [];
  const departments = data?.departments ?? [];

  // Action state
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [detailTargetId, setDetailTargetId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deactivateTarget, setDeactivateTarget] = useState(null);
  const [activateTarget, setActivateTarget] = useState(null);
  const [resetTarget, setResetTarget] = useState(null);
  const [resetResult, setResetResult] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [toast, setToast] = useTransient(2500);

  async function handleRoleChange(userId, newRole) {
    setRoleError(null);
    setPendingRoleId(userId);
    try {
      await api.updateUserRole(userId, newRole);
      refetch();
    } catch (err) {
      setRoleError(err.message || "Could not update role.");
    } finally {
      setPendingRoleId(null);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setActionError(null);
    try {
      await api.deleteUser(deleteTarget.id);
      setDeleteTarget(null);
      refetch();
    } catch (err) {
      setActionError(err.message || "Could not delete user.");
    }
  }

  async function confirmDeactivate() {
    if (!deactivateTarget) return;
    setActionError(null);
    try {
      await api.deactivateUser(deactivateTarget.id);
      setDeactivateTarget(null);
      refetch();
    } catch (err) {
      setActionError(err.message || "Could not deactivate user.");
    }
  }

  async function confirmActivate() {
    if (!activateTarget) return;
    setActionError(null);
    try {
      await api.activateUser(activateTarget.id);
      setActivateTarget(null);
      refetch();
    } catch (err) {
      setActionError(err.message || "Could not activate user.");
    }
  }

  async function confirmReset() {
    if (!resetTarget) return;
    setActionError(null);
    try {
      const result = await api.resetUserPassword(resetTarget.id);
      setResetResult(result);
      setResetTarget(null);
    } catch (err) {
      setActionError(err.message || "Could not issue reset link.");
      setResetTarget(null);
    }
  }

  function copyResetLink() {
    if (!resetResult?.reset_token) return;
    const url = `${window.location.origin}/reset-password?token=${resetResult.reset_token}`;
    navigator.clipboard?.writeText(url);
    setToast("Reset link copied to clipboard.");
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((u) => {
      const roleMatch = role === "All" ? true : u.role === role;
      const statusMatch = status === "All" ? true : u.status === status;
      const deptMatch = department === "All" ? true : u.department === department;
      const queryMatch = q
        ? `${u.name} ${u.email} ${u.id} ${u.role} ${u.department ?? ""}`
            .toLowerCase()
            .includes(q)
        : true;
      return roleMatch && statusMatch && deptMatch && queryMatch;
    });
  }, [items, role, status, department, query]);

  const { page, setPage, totalPages, paged, start, end } = usePagination(
    filtered,
    10,
    `${role}|${status}|${department}|${query}`
  );

  const headerCols = isAdmin
    ? ["User", "Email", "Role", "Status", "Department", "Joined", ""]
    : ["User", "Email", "Role", "Status", "Department", "Joined"];

  return (
    <>
      <PageHeader
        title="Users"
        subtitle="Manage team members, roles, departments, and access."
      >
        {isAdmin && (
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
          >
            <Plus className="w-3.5 h-3.5" strokeWidth={3} />
            Add User
          </button>
        )}
      </PageHeader>

      <UserFormModal
        open={createOpen}
        mode="create"
        onClose={() => setCreateOpen(false)}
        onSaved={() => refetch()}
      />
      <UserFormModal
        open={!!editTarget}
        mode="edit"
        user={editTarget}
        onClose={() => setEditTarget(null)}
        onSaved={() => refetch()}
      />
      <UserDetailModal
        open={!!detailTargetId}
        userId={detailTargetId}
        onClose={() => setDetailTargetId(null)}
      />
      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete user"
        message={`Permanently remove ${deleteTarget?.name}? Their owned projects will be unassigned and their task assignments cleared.`}
        confirmLabel="Delete user"
        tone="danger"
        requireText={deleteTarget?.name}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
      />
      <ConfirmDialog
        open={!!deactivateTarget}
        title="Deactivate user"
        message={`Block ${deactivateTarget?.name} from signing in? Their data and history remain intact and you can re-activate them at any time.`}
        confirmLabel="Deactivate"
        tone="warning"
        onClose={() => setDeactivateTarget(null)}
        onConfirm={confirmDeactivate}
      />
      <ConfirmDialog
        open={!!activateTarget}
        title="Activate user"
        message={`Restore sign-in access for ${activateTarget?.name}?`}
        confirmLabel="Activate"
        tone="primary"
        onClose={() => setActivateTarget(null)}
        onConfirm={confirmActivate}
      />
      <ConfirmDialog
        open={!!resetTarget}
        title="Reset password"
        message={`Issue a single-use password reset link for ${resetTarget?.name}? The link is valid for one hour.`}
        confirmLabel="Issue reset link"
        tone="primary"
        onClose={() => setResetTarget(null)}
        onConfirm={confirmReset}
      />

      {/* Reset-token result modal — shown after a successful reset call. */}
      <Modal
        open={!!resetResult}
        onClose={() => setResetResult(null)}
        title="Password reset link issued"
        subtitle={
          resetResult?.user?.name
            ? `Share this one-time link with ${resetResult.user.name}.`
            : undefined
        }
        size="md"
      >
        {resetResult && (
          <div className="space-y-3 text-sm text-foreground">
            <p className="text-muted-foreground text-xs">
              The link expires in 1 hour and can only be used once. After it's
              used, it cannot be reused.
            </p>
            <div className="rounded-md border border-border bg-input/40 px-3 py-2 font-mono text-xs break-all">
              {window.location.origin}/reset-password?token=
              {resetResult.reset_token}
            </div>
            <div className="flex items-center justify-between gap-2 pt-1">
              <button
                type="button"
                onClick={copyResetLink}
                className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
              >
                <Copy className="w-3 h-3" strokeWidth={2.6} />
                Copy link
              </button>
              <button
                type="button"
                onClick={() => setResetResult(null)}
                className="px-3 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:opacity-90"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </Modal>

      <div className="px-8 py-6 flex flex-col gap-5">
        <div className="flex items-center gap-3 flex-wrap">
          <SearchInput
            placeholder="Search by name, email, ID, department…"
            className="flex-1 max-w-xs"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="flex items-center gap-2 flex-wrap">
            <FilterChip active={role === "All"} onClick={() => setRole("All")}>
              All roles
            </FilterChip>
            {ALL_ROLES.map((r) => (
              <FilterChip
                key={r}
                active={role === r}
                onClick={() => setRole(r)}
              >
                {r[0].toUpperCase() + r.slice(1)}
              </FilterChip>
            ))}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <FilterChip
              active={status === "All"}
              onClick={() => setStatus("All")}
            >
              All status
            </FilterChip>
            <FilterChip
              active={status === "Active"}
              onClick={() => setStatus("Active")}
            >
              Active
            </FilterChip>
            <FilterChip
              active={status === "Inactive"}
              onClick={() => setStatus("Inactive")}
            >
              Inactive
            </FilterChip>
          </div>
          {departments.length > 0 && (
            <select
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className="bg-input border border-border rounded-md px-3 py-1.5 text-xs text-foreground outline-none focus:border-primary"
            >
              <option value="All">All departments</option>
              {departments.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
          <span className="font-medium text-foreground">
            {items.length} users total
          </span>
          {summary.map((s) => (
            <span key={s.role} className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full inline-block bg-secondary" />
              {s.count} {s.role}
            </span>
          ))}
          {statusSummary.map((s) => (
            <span key={s.status} className="flex items-center gap-1.5">
              <span
                className={`w-2 h-2 rounded-full inline-block ${s.status === "Active" ? "bg-green-400" : "bg-zinc-500"}`}
              />
              {s.count} {s.status.toLowerCase()}
            </span>
          ))}
        </div>

        {isAdmin && (
          <div className="flex items-start gap-2 px-3 py-2 rounded-md border border-secondary bg-secondary/30 text-xs text-secondary-foreground">
            <ShieldCheck className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" strokeWidth={2.4} />
            <span>
              You're signed in as an admin — use the actions menu (⋯) to edit,
              activate, deactivate, reset passwords, or delete users.
            </span>
          </div>
        )}

        {(roleError || actionError) && (
          <div className="p-3 rounded-md border border-red-500/30 bg-red-500/10 text-sm text-red-300">
            {roleError || actionError}
          </div>
        )}

        {toast && (
          <div className="p-2 rounded-md border border-green-500/30 bg-green-500/10 text-xs text-green-300">
            {toast}
          </div>
        )}

        {error && (
          <div className="p-4 rounded-md border border-red-500/30 bg-red-500/10 text-sm text-red-300">
            <div className="font-semibold mb-1">Couldn&apos;t load users.</div>
            <div className="text-xs font-mono break-all">{error.message}</div>
          </div>
        )}

        <div className="border border-border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-input border-b border-border">
                  {headerCols.map((h, i) => (
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
                      colSpan={headerCols.length}
                      className="px-4 py-10 text-center text-sm text-muted-foreground"
                    >
                      Loading users from Neon…
                    </td>
                  </tr>
                )}
                {!loading &&
                  paged.map((u) => {
                    const isSelf = u.id === currentUser?.id;
                    const inactive = u.status !== "Active";
                    return (
                      <tr
                        key={u.id}
                        className={`border-b border-border last:border-b-0 transition-colors ${
                          inactive ? "opacity-60" : ""
                        } hover:bg-input/50`}
                      >
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => setDetailTargetId(u.id)}
                            className="flex items-center gap-3 min-w-0 text-left"
                          >
                            {u.avatar_url ? (
                              <img
                                src={u.avatar_url}
                                alt={u.name}
                                className="w-8 h-8 rounded-full object-cover border border-border flex-shrink-0"
                              />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-secondary-foreground text-xs font-semibold flex-shrink-0">
                                {initials(u.name)}
                              </div>
                            )}
                            <div className="min-w-0">
                              <div className="text-sm font-medium text-foreground truncate hover:underline">
                                {u.name}
                                {isSelf && (
                                  <span className="text-muted-foreground ml-1.5 text-[10px]">
                                    (you)
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-muted-foreground font-mono truncate">
                                {u.id}
                              </div>
                            </div>
                          </button>
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">
                          {u.email}
                        </td>
                        <td className="px-4 py-3">
                          {isAdmin ? (
                            <div className="flex items-center gap-2">
                              <select
                                value={u.role}
                                disabled={pendingRoleId === u.id}
                                onChange={(e) =>
                                  handleRoleChange(u.id, e.target.value)
                                }
                                className={`text-xs font-medium capitalize px-2 py-1 rounded-md bg-input border border-border text-foreground outline-none focus:border-primary cursor-pointer ${
                                  pendingRoleId === u.id
                                    ? "opacity-50 cursor-wait"
                                    : ""
                                }`}
                                title={
                                  isSelf
                                    ? "You are changing your own role"
                                    : "Change this user's role"
                                }
                              >
                                {ALL_ROLES.map((r) => (
                                  <option key={r} value={r}>
                                    {r[0].toUpperCase() + r.slice(1)}
                                  </option>
                                ))}
                              </select>
                              {pendingRoleId === u.id && (
                                <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                              )}
                            </div>
                          ) : (
                            <span
                              className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium capitalize ${
                                roleStyle[u.role] ?? roleStyle.member
                              }`}
                            >
                              {u.role}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {u.status === "Active" ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide bg-green-500/15 text-green-300">
                              <CheckCircle2 className="w-3 h-3" strokeWidth={2.6} />
                              Active
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide bg-zinc-500/15 text-zinc-400">
                              <XCircle className="w-3 h-3" strokeWidth={2.6} />
                              Inactive
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-foreground">
                          {u.department || (
                            <span className="text-muted-foreground italic">
                              —
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">
                          {formatDate(u.created_at)}
                        </td>
                        {isAdmin && (
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                              <RowActionMenu
                              items={[
                                {
                                  label: "View profile",
                                  icon: Eye,
                                  onClick: () => setDetailTargetId(u.id),
                                },
                                {
                                  label: "Edit user",
                                  icon: Pencil,
                                  onClick: () => setEditTarget(u),
                                },
                                {
                                  label: "Reset password",
                                  icon: KeyRound,
                                  onClick: () => setResetTarget(u),
                                },
                                u.status === "Active"
                                  ? {
                                      label: isSelf
                                        ? "Deactivate (not allowed)"
                                        : "Deactivate",
                                      icon: UserX,
                                      onClick: () => setDeactivateTarget(u),
                                      disabled: isSelf,
                                    }
                                  : {
                                      label: "Activate",
                                      icon: UserCheck,
                                      onClick: () => setActivateTarget(u),
                                    },
                                {
                                  label: isSelf
                                    ? "Delete (not allowed)"
                                    : "Delete user",
                                  icon: Trash2,
                                  tone: "danger",
                                  onClick: () => setDeleteTarget(u),
                                  disabled: isSelf,
                                },
                              ]}
                            />
                          </td>
                        )}
                      </tr>
                    );
                  })}
                {!loading && filtered.length === 0 && (
                  <tr>
                    <td colSpan={headerCols.length} className="p-0">
                      {items.length === 0 ? (
                        <EmptyState
                          icon={UsersIcon}
                          title="No users yet"
                          description={
                            isAdmin
                              ? 'Click "Add User" to invite the first team member.'
                              : "Workspace is empty."
                          }
                          action={
                            isAdmin ? (
                              <button
                                type="button"
                                onClick={() => setCreateOpen(true)}
                                className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
                              >
                                <Plus className="w-3.5 h-3.5" strokeWidth={3} />
                                Add User
                              </button>
                            ) : null
                          }
                        />
                      ) : (
                        <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                          No users match your filters.
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
          totalLabel={`Showing ${start}–${end} of ${filtered.length} users`}
          page={page}
          totalPages={totalPages}
          onChange={setPage}
        />
      </div>
    </>
  );
}
