"use client";

export default function TextField({
  label,
  id,
  type = "text",
  value,
  onChange,
  required,
  autoComplete,
  placeholder,
  hint,
  error,
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={id}
        className="text-xs font-medium text-foreground font-body"
      >
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={onChange}
        required={required}
        autoComplete={autoComplete}
        placeholder={placeholder}
        className={`bg-input border rounded-md px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground ${
          error
            ? "border-red-500/60 focus:border-red-400"
            : "border-border focus:border-primary"
        }`}
      />
      {hint && !error && (
        <span className="text-xs text-muted-foreground">{hint}</span>
      )}
      {error && <span className="text-xs text-red-400">{error}</span>}
    </div>
  );
}
