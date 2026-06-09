// Single source of truth for every REST call the React app makes.
// Methods are grouped by domain (auth, projects, …) so it's easy to
// spot what's available. Re-export ApiError here so call-sites only
// import from "@/lib/api".

"use client";

import { ApiError, request, qs } from "./client";

export { ApiError };

export const api = {
  health: () => request("/api/health"),

  // ----- auth -----
  // Login, password-reset, and password-change happen client-side via
  // @supabase/supabase-js — see lib/auth/AuthProvider.jsx.
  //
  // Signup is the exception: we route it through OUR server so we can
  // use the Supabase Admin API (no rate limit, auto-confirmed) instead
  // of the public /auth/v1/signup endpoint. See
  // app/api/auth/signup/route.js. After signup() returns, the
  // AuthProvider follows up with supabase.auth.signInWithPassword().
  signup: (payload) =>
    request("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  me: () => request("/api/auth/me"),

  // ----- dashboard -----
  dashboardStats: () => request("/api/dashboard/stats"),
  dashboardActivity: () => request("/api/dashboard/activity"),
  dashboardProjectProgress: () => request("/api/dashboard/project-progress"),
  dashboardTaskStatus: () => request("/api/dashboard/task-status"),
  dashboardTeamWorkload: () => request("/api/dashboard/team-workload"),
  dashboardUpcomingDeadlines: (days) =>
    request(`/api/dashboard/upcoming-deadlines${days ? `?days=${days}` : ""}`),
  dashboardMyTasks: () => request("/api/dashboard/my-tasks"),

  // ----- projects -----
  projects: (params) => request(`/api/projects${qs(params)}`),
  project: (id) => request(`/api/projects/${encodeURIComponent(id)}`),
  createProject: (payload) =>
    request("/api/projects", { method: "POST", body: JSON.stringify(payload) }),
  updateProject: (id, payload) =>
    request(`/api/projects/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deleteProject: (id) =>
    request(`/api/projects/${encodeURIComponent(id)}`, { method: "DELETE" }),
  archiveProject: (id) =>
    request(`/api/projects/${encodeURIComponent(id)}/archive`, { method: "POST" }),
  restoreProject: (id) =>
    request(`/api/projects/${encodeURIComponent(id)}/restore`, { method: "POST" }),

  // ----- milestones -----
  createMilestone: (projectId, payload) =>
    request(`/api/projects/${encodeURIComponent(projectId)}/milestones`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateMilestone: (id, payload) =>
    request(`/api/milestones/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  completeMilestone: (id) =>
    request(`/api/milestones/${encodeURIComponent(id)}/complete`, {
      method: "POST",
    }),
  reopenMilestone: (id) =>
    request(`/api/milestones/${encodeURIComponent(id)}/reopen`, {
      method: "POST",
    }),
  deleteMilestone: (id) =>
    request(`/api/milestones/${encodeURIComponent(id)}`, { method: "DELETE" }),

  // ----- tasks & assignment -----
  assignments: () => request("/api/assignments"),
  tasks: (params) => request(`/api/tasks${qs(params)}`),
  task: (id) => request(`/api/tasks/${encodeURIComponent(id)}`),
  createTask: (payload) =>
    request("/api/tasks", { method: "POST", body: JSON.stringify(payload) }),
  updateTask: (id, payload) =>
    request(`/api/tasks/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deleteTask: (id) =>
    request(`/api/tasks/${encodeURIComponent(id)}`, { method: "DELETE" }),
  taskAssignments: (id) =>
    request(`/api/tasks/${encodeURIComponent(id)}/assignments`),
  addTaskAssignee: (id, userId) =>
    request(`/api/tasks/${encodeURIComponent(id)}/assignees`, {
      method: "POST",
      body: JSON.stringify({ user_id: userId }),
    }),
  removeTaskAssignee: (id, userId) =>
    request(
      `/api/tasks/${encodeURIComponent(id)}/assignees/${encodeURIComponent(userId)}`,
      { method: "DELETE" }
    ),

  // ----- teams -----
  teams: (params) => request(`/api/teams${qs(params)}`),
  team: (id) => request(`/api/teams/${encodeURIComponent(id)}`),
  createTeam: (payload) =>
    request("/api/teams", { method: "POST", body: JSON.stringify(payload) }),
  updateTeam: (id, payload) =>
    request(`/api/teams/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deleteTeam: (id) =>
    request(`/api/teams/${encodeURIComponent(id)}`, { method: "DELETE" }),
  addTeamMember: (id, userId) =>
    request(`/api/teams/${encodeURIComponent(id)}/members`, {
      method: "POST",
      body: JSON.stringify({ user_id: userId }),
    }),
  removeTeamMember: (id, userId) =>
    request(
      `/api/teams/${encodeURIComponent(id)}/members/${encodeURIComponent(userId)}`,
      { method: "DELETE" }
    ),
  setTeamLeader: (id, userId) =>
    request(`/api/teams/${encodeURIComponent(id)}/leader`, {
      method: "PATCH",
      body: JSON.stringify({ user_id: userId }),
    }),

  // ----- users -----
  users: (params) => request(`/api/users${qs(params)}`),
  user: (id) => request(`/api/users/${encodeURIComponent(id)}`),
  createUser: (payload) =>
    request("/api/users", { method: "POST", body: JSON.stringify(payload) }),
  updateUser: (id, payload) =>
    request(`/api/users/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deleteUser: (id) =>
    request(`/api/users/${encodeURIComponent(id)}`, { method: "DELETE" }),
  activateUser: (id) =>
    request(`/api/users/${encodeURIComponent(id)}/activate`, { method: "POST" }),
  deactivateUser: (id) =>
    request(`/api/users/${encodeURIComponent(id)}/deactivate`, { method: "POST" }),
  resetUserPassword: (id) =>
    request(`/api/users/${encodeURIComponent(id)}/reset-password`, {
      method: "POST",
    }),
  updateUserRole: (userId, role) =>
    request(`/api/users/${userId}/role`, {
      method: "PATCH",
      body: JSON.stringify({ role }),
    }),

  // ----- activity -----
  activity: (params) => {
    if (typeof params === "number" || params == null) {
      const limit = typeof params === "number" ? params : 100;
      return request(`/api/activity?limit=${limit}`);
    }
    return request(`/api/activity${qs(params)}`);
  },
  activityFilters: () => request("/api/activity/filters"),

  // ----- notifications -----
  notifications: (params) => request(`/api/notifications${qs(params)}`),
  notificationUnreadCount: () => request("/api/notifications/unread-count"),
  markNotificationRead: (id) =>
    request(`/api/notifications/${id}/read`, { method: "POST" }),
  markAllNotificationsRead: () =>
    request("/api/notifications/read-all", { method: "POST" }),
  deleteNotification: (id) =>
    request(`/api/notifications/${id}`, { method: "DELETE" }),
  notificationPreferences: () => request("/api/notifications/preferences"),
  updateNotificationPreferences: (payload) =>
    request("/api/notifications/preferences", {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  runDeadlineReminders: (days = 3) =>
    request(`/api/notifications/run-deadline-reminders?days=${days}`, {
      method: "POST",
    }),

  // ----- comments -----
  comments: (entity_type, entity_id, { includeDeleted = false } = {}) =>
    request(
      `/api/comments${qs({
        entity_type,
        entity_id,
        include_deleted: includeDeleted ? "true" : undefined,
      })}`
    ),
  createComment: (payload) =>
    request("/api/comments", { method: "POST", body: JSON.stringify(payload) }),
  updateComment: (id, body) =>
    request(`/api/comments/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ body }),
    }),
  deleteComment: (id) =>
    request(`/api/comments/${id}`, { method: "DELETE" }),
  commentHistory: (id) => request(`/api/comments/${id}/history`),
};
