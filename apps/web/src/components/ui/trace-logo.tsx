import React from "react";

export function TraceLogo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        className="shrink-0"
      >
        <rect
          x="2.5"
          y="2.5"
          width="19"
          height="19"
          rx="4"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <path
          d="M7 8.5H17M12 8.5V16.5"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <circle cx="16.5" cy="15.5" r="1.75" fill="var(--accent-primary)" />
      </svg>
      <span className="text-sm font-semibold tracking-[0.14em] text-[var(--text-primary)]">
        TRACE
      </span>
    </span>
  );
}
