"use client";

const iconStyles = {
  primary: "bg-secondary text-secondary-foreground",
  success: "bg-green-500/15 text-green-300",
  warning: "bg-yellow-500/15 text-yellow-300",
  danger: "bg-red-500/15 text-red-300",
  muted: "bg-muted text-muted-foreground",
};

export default function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "primary",
}) {
  return (
    <div className="flex flex-col gap-4 bg-background border border-border rounded-lg p-5 transition-shadow hover:shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground font-body">
          {label}
        </span>
        <div
          className={`w-8 h-8 rounded-md flex items-center justify-center ${iconStyles[tone]}`}
        >
          {Icon && <Icon className="w-4 h-4" strokeWidth={2.25} />}
        </div>
      </div>
      <div>
        <div className="text-3xl font-bold text-foreground font-headings">
          {value}
        </div>
        {hint && (
          <div className="text-xs text-muted-foreground font-body mt-1">
            {hint}
          </div>
        )}
      </div>
    </div>
  );
}
