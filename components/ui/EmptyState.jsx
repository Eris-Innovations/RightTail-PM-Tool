"use client";

import { Inbox } from "lucide-react";

export default function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 px-4 text-center">
      <div className="w-12 h-12 rounded-xl bg-secondary text-primary flex items-center justify-center">
        <Icon className="w-5 h-5" strokeWidth={2.2} />
      </div>
      <div className="max-w-sm">
        <h3 className="text-sm font-semibold text-foreground font-headings">
          {title}
        </h3>
        {description && (
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}
