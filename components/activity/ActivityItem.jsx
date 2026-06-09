"use client";

const toneClasses = {
  primary: "text-primary",
  success: "text-green-400",
  warning: "text-yellow-400",
  muted: "text-muted-foreground",
};

export default function ActivityItem({ icon: Icon, tone = "primary", message, time }) {
  return (
    <div className="flex items-start gap-3 py-3 border-b border-border last:border-b-0">
      <div className={`mt-0.5 ${toneClasses[tone] ?? toneClasses.primary}`}>
        {Icon && <Icon className="w-[15px] h-[15px]" strokeWidth={2.4} />}
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-sm text-foreground font-body">{message}</span>
      </div>
      <span className="text-xs text-muted-foreground font-body whitespace-nowrap">
        {time}
      </span>
    </div>
  );
}
