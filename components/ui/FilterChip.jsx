"use client";

export default function FilterChip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
        active
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-background text-muted-foreground border-border hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}
