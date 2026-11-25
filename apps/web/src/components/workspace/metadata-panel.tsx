"use client";

import React, { useMemo, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import type { MetadataField, MetadataGroup } from "@trace/shared-types";

export const MetadataPanel = React.memo(function MetadataPanel({
  fields,
  onJumpToOffset,
}: {
  fields: MetadataField[];
  onJumpToOffset: (start: number, length: number) => void;
}) {
  const [query, setQuery] = useState("");
  const [onlySensitive, setOnlySensitive] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return fields.filter((f) => {
      if (onlySensitive && !f.isSensitive) return false;
      if (!q) return true;
      return (
        f.fieldName.toLowerCase().includes(q) ||
        f.displayValue.toLowerCase().includes(q) ||
        f.group.toLowerCase().includes(q) ||
        (f.rawKey ?? "").toLowerCase().includes(q)
      );
    });
  }, [fields, query, onlySensitive]);

  const grouped = useMemo(() => {
    const map = new Map<MetadataGroup, MetadataField[]>();
    for (const f of filtered) {
      const list = map.get(f.group) ?? [];
      list.push(f);
      map.set(f.group, list);
    }
    return Array.from(map.entries());
  }, [filtered]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-3.5">
        <div className="relative flex-1 min-w-[200px]">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Filter metadata fields"
            placeholder="Search field name, tag, or value..."
            className="min-h-[40px] w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)] pr-3 pl-9 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
          />
        </div>

        <label className="inline-flex min-h-[40px] cursor-pointer items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3 text-xs text-[var(--text-secondary)]">
          <input
            type="checkbox"
            checked={onlySensitive}
            onChange={(e) => setOnlySensitive(e.target.checked)}
            className="accent-[var(--accent-primary)]"
          />
          <span>Sensitive only ({fields.filter((f) => f.isSensitive).length})</span>
        </label>
      </div>

      {grouped.length === 0 ? (
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-8 text-center text-sm text-[var(--text-secondary)]">
          No metadata fields match the current filters.
        </div>
      ) : (
        <div className="space-y-3">
          {grouped.map(([groupName, groupFields]) => {
            const isCollapsed = Boolean(collapsed[groupName]);
            return (
              <section
                key={groupName}
                className="overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)]"
              >
                <button
                  type="button"
                  aria-expanded={!isCollapsed}
                  onClick={() =>
                    setCollapsed((prev) => ({ ...prev, [groupName]: !isCollapsed }))
                  }
                  className="flex min-h-[46px] w-full items-center justify-between bg-[var(--bg-elevated)] px-4 text-left"
                >
                  <span className="font-mono-tech text-xs font-medium uppercase tracking-wider text-[var(--text-primary)]">
                    {groupName} ({groupFields.length})
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 text-[var(--text-secondary)] transition-transform ${
                      isCollapsed ? "-rotate-90" : ""
                    }`}
                    aria-hidden="true"
                  />
                </button>

                {!isCollapsed && (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[600px] border-collapse text-left text-xs">
                      <thead>
                        <tr className="border-b border-[var(--border-subtle)] font-mono-tech text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
                          <th className="p-3">Field</th>
                          <th className="p-3">Value</th>
                          <th className="p-3">Parser</th>
                          <th className="p-3">Byte Offset</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border-subtle)]">
                        {groupFields.map((field) => (
                          <tr key={field.id} className="hover:bg-[var(--bg-primary)]/50">
                            <td className="p-3 align-top">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-medium text-[var(--text-primary)]">
                                  {field.fieldName}
                                </span>
                                {field.isSensitive && (
                                  <span className="font-mono-tech rounded bg-[var(--status-warning)]/15 px-1.5 py-0.5 text-[10px] uppercase text-[var(--status-warning)]">
                                    Sensitive
                                  </span>
                                )}
                              </div>
                              {field.rawKey && (
                                <p className="font-mono-tech mt-0.5 text-[11px] text-[var(--text-muted)]">
                                  {field.rawKey}
                                </p>
                              )}
                            </td>
                            <td className="p-3 align-top break-all text-[var(--text-secondary)]">
                              {field.displayValue}
                            </td>
                            <td className="font-mono-tech p-3 align-top text-[11px] text-[var(--text-muted)]">
                              {field.sourceParser}
                            </td>
                            <td className="p-3 align-top">
                              {field.byteRange ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    onJumpToOffset(
                                      field.byteRange!.start,
                                      field.byteRange!.length
                                    )
                                  }
                                  className="font-mono-tech rounded bg-[var(--accent-soft)] px-2 py-1 text-[11px] text-[var(--accent-primary)] hover:underline"
                                >
                                  0x{field.byteRange.start.toString(16).padStart(8, "0")}
                                </button>
                              ) : (
                                <span
                                  title="Underlying parser did not expose an exact byte offset"
                                  className="font-mono-tech text-[11px] text-[var(--text-muted)]"
                                >
                                  Offset N/A
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
});
