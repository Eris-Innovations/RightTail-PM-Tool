// Shared between server route handlers and the React client — keeping
// the symbols in one module prevents silent drift (e.g. the API starts
// logging a new entity_type that the UI can't filter on).

export const ROLES = {
  ADMIN: "admin",
  MANAGER: "manager",
  MEMBER: "member",
};

export const ENTITY_TYPES = {
  AUTH: "auth",
  USER: "user",
  PROJECT: "project",
  TASK: "task",
  MILESTONE: "milestone",
  TEAM: "team",
  ASSIGNMENT: "assignment",
  ACTIVITY: "activity",
};

export const NOTIFICATION_TYPES = {
  TASK_ASSIGNED: "task_assigned",
  TASK_UPDATED: "task_updated",
  TASK_COMPLETED: "task_completed",
  PROJECT_UPDATED: "project_updated",
  DEADLINE_REMINDER: "deadline_reminder",
  COMMENT_ADDED: "comment_added",
  COMMENT_MENTION: "comment_mention",
};

// Order matters — driven by the proposal's status pipeline.
export const TASK_STATUSES = ["To Do", "In Progress", "In Review", "Done"];
export const PROJECT_STATUSES = [
  "Planning",
  "In Progress",
  "On Hold",
  "Completed",
];
export const PRIORITIES = ["Low", "Medium", "High", "Critical"];
