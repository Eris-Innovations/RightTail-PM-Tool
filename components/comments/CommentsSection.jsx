"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AtSign,
  Edit3,
  History,
  Loader2,
  MessageSquare,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth/AuthProvider";
import { timeAgo } from "@/lib/formatters";
import MentionTextarea from "@/components/comments/MentionTextarea";
import Modal from "@/components/ui/Modal";
import ConfirmDialog from "@/components/ui/ConfirmDialog";

// Render the comment body with `@handle` tokens highlighted. Mentions that
// resolved to a real user (per the row's mentions array) are styled like
// chips; everything else is plain text.
function renderBody(text, mentions) {
  if (!text) return null;
  const resolvedHandles = new Set(
    mentions.flatMap((m) => [
      (m.email ?? "").split("@")[0]?.toLowerCase(),
      (m.name ?? "").toLowerCase().replace(/[^a-z0-9]/g, ""),
    ])
  );
  const parts = text.split(/(@[A-Za-z0-9._-]{1,64})/g);
  return parts.map((p, i) => {
    if (p.startsWith("@")) {
      const handle = p.slice(1).toLowerCase();
      const matched = resolvedHandles.has(handle);
      return (
        <span
          key={i}
          className={`font-medium ${
            matched
              ? "text-primary bg-primary/10 px-1 rounded"
              : "text-muted-foreground"
          }`}
        >
          {p}
        </span>
      );
    }
    return <span key={i}>{p}</span>;
  });
}

function CommentHistoryModal({ open, onClose, commentId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => {
    if (!open || !commentId) return;
    setLoading(true);
    setError(null);
    setData(null);
    api
      .commentHistory(commentId)
      .then(setData)
      .catch(setError)
      .finally(() => setLoading(false));
  }, [open, commentId]);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Comment history"
      subtitle="Earlier versions of this comment, in the order they were posted."
      size="md"
    >
      {loading && (
        <div className="py-6 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…
        </div>
      )}
      {error && (
        <div className="p-3 rounded border border-red-500/30 bg-red-500/10 text-xs text-red-300">
          {error.message}
        </div>
      )}
      {data && (
        <div className="flex flex-col gap-3">
          {data.versions.length === 0 && (
            <div className="text-xs text-muted-foreground py-4 text-center">
              No prior versions — this comment hasn&apos;t been edited.
            </div>
          )}
          {data.versions.map((v, i) => (
            <div
              key={v.id}
              className="rounded-md border border-border bg-input/30 p-3"
            >
              <div className="flex items-center justify-between mb-1">
                <div className="text-[11px] text-muted-foreground">
                  Version {i + 1} · by {v.editor_name ?? "system"}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {timeAgo(v.created_at)}
                </div>
              </div>
              <p className="text-sm text-foreground whitespace-pre-wrap">
                {v.body}
              </p>
            </div>
          ))}
          <div className="rounded-md border border-primary/30 bg-primary/10 p-3">
            <div className="flex items-center justify-between mb-1">
              <div className="text-[11px] text-primary font-semibold">
                Current
              </div>
              {data.edited_at && (
                <div className="text-[11px] text-muted-foreground">
                  edited {timeAgo(data.edited_at)}
                </div>
              )}
            </div>
            <p className="text-sm text-foreground whitespace-pre-wrap">
              {data.is_deleted ? (
                <span className="italic text-muted-foreground">
                  [deleted]
                </span>
              ) : (
                data.current_body
              )}
            </p>
          </div>
        </div>
      )}
    </Modal>
  );
}

function CommentRow({ comment, currentUser, onEdit, onDelete, onShowHistory }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.body ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const canEdit = !comment.is_deleted && !!currentUser;
  const canDelete = !comment.is_deleted && !!currentUser;
  // Edited rows show a history affordance even to non-authors so reviewers
  // can audit what changed.
  const hasHistory = !!comment.edited_at;

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await onEdit(comment.id, draft);
      setEditing(false);
    } catch (err) {
      setError(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className={`flex gap-3 px-3 py-3 rounded-md border ${
        comment.is_deleted
          ? "border-dashed border-border bg-input/10"
          : "border-border bg-input/30"
      }`}
    >
      <div className="w-8 h-8 rounded-full bg-secondary flex-shrink-0 flex items-center justify-center text-secondary-foreground text-xs font-bold">
        {(comment.author_name ?? "?").charAt(0).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-1">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm font-semibold text-foreground truncate">
              {comment.author_name ?? "Unknown user"}
            </span>
            <span className="text-[11px] text-muted-foreground flex-shrink-0">
              {timeAgo(comment.created_at)}
              {comment.edited_at && " · edited"}
            </span>
          </div>
          <div className="flex items-center gap-0.5 flex-shrink-0">
            {hasHistory && (
              <button
                type="button"
                onClick={() => onShowHistory(comment.id)}
                title="View edit history"
                className="w-6 h-6 inline-flex items-center justify-center text-muted-foreground hover:text-foreground rounded hover:bg-input/60"
              >
                <History className="w-3 h-3" strokeWidth={2.4} />
              </button>
            )}
            {canEdit && !editing && (
              <button
                type="button"
                onClick={() => {
                  setDraft(comment.body ?? "");
                  setEditing(true);
                }}
                title="Edit"
                className="w-6 h-6 inline-flex items-center justify-center text-muted-foreground hover:text-primary rounded hover:bg-primary/10"
              >
                <Edit3 className="w-3 h-3" strokeWidth={2.4} />
              </button>
            )}
            {canDelete && (
              <button
                type="button"
                onClick={() => onDelete(comment.id)}
                title="Delete"
                className="w-6 h-6 inline-flex items-center justify-center text-muted-foreground hover:text-red-300 rounded hover:bg-red-500/10"
              >
                <Trash2 className="w-3 h-3" strokeWidth={2.4} />
              </button>
            )}
          </div>
        </div>
        {editing ? (
          <div className="flex flex-col gap-2">
            <MentionTextarea
              value={draft}
              onChange={setDraft}
              disabled={saving}
              autoFocus
              rows={3}
              onSubmit={save}
            />
            {error && (
              <div className="text-[11px] text-red-300">{error.message}</div>
            )}
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditing(false)}
                disabled={saving}
                className="text-[11px] text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-input/60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={save}
                disabled={saving || draft.trim().length === 0}
                className="text-[11px] bg-primary text-primary-foreground px-2.5 py-1 rounded hover:opacity-90 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-foreground whitespace-pre-wrap break-words">
            {comment.is_deleted ? (
              <span className="italic text-muted-foreground">
                [comment deleted{comment.deleted_by_id ? "" : ""}]
              </span>
            ) : (
              renderBody(comment.body, comment.mentions ?? [])
            )}
          </p>
        )}
        {comment.mentions?.length > 0 && !editing && !comment.is_deleted && (
          <div className="flex items-center gap-1 mt-1.5 flex-wrap">
            <AtSign
              className="w-2.5 h-2.5 text-muted-foreground"
              strokeWidth={2.6}
            />
            {comment.mentions.map((m) => (
              <span
                key={m.user_id}
                className="text-[10px] text-muted-foreground"
                title={m.email}
              >
                {m.name}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function CommentsSection({ entityType, entityId }) {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState(null);
  const [historyOpenId, setHistoryOpenId] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  // Showing soft-deleted rows is opt-in to keep the default view tidy.
  const [showDeleted, setShowDeleted] = useState(false);

  const reload = useCallback(async () => {
    if (!entityType || !entityId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.comments(entityType, entityId, {
        includeDeleted: showDeleted,
      });
      setItems(res.items ?? []);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [entityType, entityId, showDeleted]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function postComment() {
    if (!draft.trim() || posting) return;
    setPosting(true);
    setPostError(null);
    try {
      await api.createComment({
        entity_type: entityType,
        entity_id: entityId,
        body: draft.trim(),
      });
      setDraft("");
      await reload();
    } catch (err) {
      setPostError(err);
    } finally {
      setPosting(false);
    }
  }

  async function editComment(id, body) {
    await api.updateComment(id, body);
    await reload();
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    try {
      await api.deleteComment(pendingDelete);
    } finally {
      setPendingDelete(null);
      await reload();
    }
  }

  const visibleCount = items.filter((c) => !c.is_deleted).length;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <MessageSquare
            className="w-3.5 h-3.5 text-muted-foreground"
            strokeWidth={2.4}
          />
          <h3 className="text-sm font-semibold text-foreground">
            Comments ({visibleCount})
          </h3>
        </div>
        <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showDeleted}
            onChange={(e) => setShowDeleted(e.target.checked)}
            className="accent-primary"
          />
          Show deleted
        </label>
      </div>

      {error && (
        <div className="mb-2 p-2.5 rounded border border-red-500/30 bg-red-500/10 text-xs text-red-300">
          {error.message}
        </div>
      )}

      <div className="flex flex-col gap-2 mb-3">
        {loading && items.length === 0 && (
          <div className="py-4 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading comments…
          </div>
        )}
        {!loading && items.length === 0 && (
          <div className="py-4 text-center text-xs text-muted-foreground">
            No comments yet — be the first to start the conversation.
          </div>
        )}
        {items.map((c) => (
          <CommentRow
            key={c.id}
            comment={c}
            currentUser={user}
            onEdit={editComment}
            onDelete={(id) => setPendingDelete(id)}
            onShowHistory={(id) => setHistoryOpenId(id)}
          />
        ))}
      </div>

      <div className="rounded-md border border-border bg-input/20 p-2.5 flex flex-col gap-2">
        <MentionTextarea
          value={draft}
          onChange={setDraft}
          placeholder="Write a comment. Use @ to mention a teammate."
          disabled={posting}
          rows={2}
          onSubmit={postComment}
        />
        {postError && (
          <div className="text-[11px] text-red-300">{postError.message}</div>
        )}
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] text-muted-foreground">
            Markdown not supported · Cmd/Ctrl+Enter to send · @ to mention
          </span>
          <button
            type="button"
            onClick={postComment}
            disabled={posting || draft.trim().length === 0}
            className="flex items-center gap-1.5 bg-primary text-primary-foreground px-3 py-1.5 rounded text-xs font-medium hover:opacity-90 disabled:opacity-50"
          >
            {posting ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Send className="w-3 h-3" strokeWidth={2.4} />
            )}
            Comment
          </button>
        </div>
      </div>

      <CommentHistoryModal
        open={!!historyOpenId}
        onClose={() => setHistoryOpenId(null)}
        commentId={historyOpenId}
      />
      <ConfirmDialog
        open={!!pendingDelete}
        title="Delete comment?"
        message="The comment will be hidden from the discussion. Authors and admins can still see it in the history pane."
        confirmLabel="Delete"
        tone="danger"
        onConfirm={confirmDelete}
        onClose={() => setPendingDelete(null)}
      />
    </div>
  );
}
