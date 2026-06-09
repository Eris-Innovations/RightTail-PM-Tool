"use client";

export default function Pagination({ totalLabel, page = 1, totalPages = 4, onChange }) {
  const handle = (next) => {
    if (next < 1 || next > totalPages) return;
    onChange?.(next);
  };

  return (
    <div className="flex items-center justify-between text-sm text-muted-foreground">
      <span>{totalLabel}</span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => handle(page - 1)}
          disabled={page === 1}
          className="px-3 py-1.5 rounded-md border border-border text-xs text-muted-foreground hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Previous
        </button>
        {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => handle(n)}
            className={`w-8 h-8 rounded-md text-xs font-medium border transition-colors ${
              n === page
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {n}
          </button>
        ))}
        <button
          type="button"
          onClick={() => handle(page + 1)}
          disabled={page === totalPages}
          className="px-3 py-1.5 rounded-md border border-border text-xs text-muted-foreground hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Next
        </button>
      </div>
    </div>
  );
}
