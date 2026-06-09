"use client";

import { Search } from "lucide-react";

export default function SearchInput({
  placeholder = "Search...",
  className = "",
  value,
  onChange,
}) {
  return (
    <label
      className={`flex items-center gap-2 border border-border rounded-md px-3 py-2 text-sm bg-input focus-within:border-primary transition-colors ${className}`}
    >
      <Search className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" strokeWidth={2.4} />
      <input
        type="text"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="bg-transparent outline-none flex-1 min-w-0 text-foreground placeholder:text-muted-foreground"
      />
    </label>
  );
}
