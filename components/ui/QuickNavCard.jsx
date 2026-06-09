"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";

export default function QuickNavCard({ to, icon: Icon, title, subtitle }) {
  return (
    <Link
       href={to}
      className="flex items-center gap-4 bg-background border border-border rounded-lg p-4 transition-all hover:border-primary/50 hover:shadow-sm"
    >
      <div className="w-10 h-10 rounded-md bg-secondary flex items-center justify-center text-primary flex-shrink-0">
        {Icon && <Icon className="w-5 h-5" strokeWidth={2.2} />}
      </div>
      <div className="min-w-0">
        <div className="text-sm font-semibold text-foreground font-body">
          {title}
        </div>
        <div className="text-xs text-muted-foreground font-body">
          {subtitle}
        </div>
      </div>
      <div className="ml-auto text-muted-foreground">
        <ChevronRight className="w-3.5 h-3.5" strokeWidth={2.6} />
      </div>
    </Link>
  );
}
