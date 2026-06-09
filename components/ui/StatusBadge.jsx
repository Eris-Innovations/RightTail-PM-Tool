"use client";

const statusStyles = {
  "In Progress": {
    badge: "bg-yellow-500/15 text-yellow-300",
    dot: "bg-yellow-400",
  },
  Planning: {
    badge: "bg-blue-500/15 text-blue-300",
    dot: "bg-blue-400",
  },
  Completed: {
    badge: "bg-green-500/15 text-green-300",
    dot: "bg-green-400",
  },
  Done: {
    badge: "bg-green-500/15 text-green-300",
    dot: "bg-green-400",
  },
  "On Hold": {
    badge: "bg-muted text-muted-foreground",
    dot: "bg-muted-foreground/50",
  },
  "To Do": {
    badge: "bg-muted text-muted-foreground",
    dot: "bg-muted-foreground/50",
  },
};

export default function StatusBadge({ status }) {
  const style = statusStyles[status] ?? {
    badge: "bg-muted text-muted-foreground",
    dot: "bg-muted-foreground/40",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium ${style.badge}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
      {status}
    </span>
  );
}

export const statusDotClass = (status) =>
  (statusStyles[status] ?? { dot: "bg-muted-foreground/50" }).dot;
