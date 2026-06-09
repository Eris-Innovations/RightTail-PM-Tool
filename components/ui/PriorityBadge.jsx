"use client";

const styles = {
  High: "bg-red-500/15 text-red-300",
  Medium: "bg-yellow-500/15 text-yellow-300",
  Low: "bg-muted text-muted-foreground",
};

export default function PriorityBadge({ priority }) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium ${
        styles[priority] ?? styles.Low
      }`}
    >
      {priority}
    </span>
  );
}
