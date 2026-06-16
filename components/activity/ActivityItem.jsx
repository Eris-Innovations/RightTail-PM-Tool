"use client";

import { Trash2 } from "lucide-react";

const toneClasses = {
  primary: "text-primary",
  success: "text-green-400",
  warning: "text-yellow-400",
  muted: "text-muted-foreground",
};

export default function ActivityItem({
  icon: Icon,
  tone = "primary",
  message,
  time,
  onDelete,
}) {
  return (
    <div className="group flex items-start gap-3 py-3 border-b border-border last:border-b-0">
      <div className={`mt-0.5 ${toneClasses[tone] ?? toneClasses.primary}`}>
        {Icon && <Icon className="w-[15px] h-[15px]" strokeWidth={2.4} />}
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-sm text-foreground font-body">{message}</span>
      </div>
      <span className="text-xs text-muted-foreground font-body whitespace-nowrap">
        {time}
      </span>
      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          aria-label="Delete activity entry"
          className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity text-muted-foreground hover:text-red-300 -mr-1 p-1 rounded"
        >
          <Trash2 className="w-3.5 h-3.5" strokeWidth={2.4} />
        </button>
      )}
    </div>
  );
}
