"use client";

import { useId, useMemo, useRef, useState } from "react";

/*
 * A multi-select that reads like a sentence: chosen items as chips, a text
 * field that autocompletes as you type ("Bri" → Brisbane), Enter to take the
 * highlighted suggestion or add exactly what was typed. Used for cities and
 * employers on Search Brief.
 */

export function ChipCombobox({
  id,
  value,
  onChange,
  options,
  placeholder,
  ariaLabel,
  emptyHint,
  max = 20,
}: {
  id?: string;
  value: string[];
  onChange: (next: string[]) => void;
  options: string[];
  placeholder: string;
  ariaLabel: string;
  /** Shown inside the box when nothing is selected. */
  emptyHint?: string;
  max?: number;
}) {
  const generatedId = useId();
  const listId = `${id ?? generatedId}-list`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);
  const [rawHighlight, setHighlight] = useState(0);

  const selected = useMemo(() => new Set(value.map((item) => item.toLowerCase())), [value]);
  const matches = useMemo(() => {
    const query = draft.trim().toLowerCase();
    const available = options.filter((option) => !selected.has(option.toLowerCase()));
    if (!query) return available.slice(0, 8);
    const starts = available.filter((option) => option.toLowerCase().startsWith(query));
    const contains = available.filter((option) => !option.toLowerCase().startsWith(query) && option.toLowerCase().includes(query));
    return [...starts, ...contains].slice(0, 8);
  }, [draft, options, selected]);

  const highlight = Math.min(rawHighlight, Math.max(matches.length - 1, 0));

  function add(raw: string) {
    const text = raw.trim();
    if (!text || selected.has(text.toLowerCase()) || value.length >= max) return;
    // Prefer the canonical spelling when what was typed matches an option.
    const canonical = options.find((option) => option.toLowerCase() === text.toLowerCase()) ?? text;
    onChange([...value, canonical]);
    setDraft("");
    setOpen(true);
  }

  function remove(item: string) {
    onChange(value.filter((existing) => existing !== item));
    inputRef.current?.focus();
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") { event.preventDefault(); setOpen(true); setHighlight((index) => Math.min(index + 1, Math.max(matches.length - 1, 0))); return; }
    if (event.key === "ArrowUp") { event.preventDefault(); setHighlight((index) => Math.max(index - 1, 0)); return; }
    if (event.key === "Escape") { setOpen(false); return; }
    if (event.key === "Backspace" && !draft && value.length) { onChange(value.slice(0, -1)); return; }
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      if (open && matches[highlight] && draft.trim()) add(matches[highlight]);
      else add(draft);
    }
  }

  return (
    <div className="chip-combobox">
      <div className="chip-combobox-box" onClick={() => inputRef.current?.focus()}>
        {value.map((item) => (
          <button key={item} type="button" className="chip-combobox-chip" onClick={(event) => { event.stopPropagation(); remove(item); }} aria-label={`Remove ${item}`}>
            {item}<span aria-hidden="true">×</span>
          </button>
        ))}
        {!value.length && emptyHint ? <span className="chip-combobox-hint">{emptyHint}</span> : null}
        <input
          ref={inputRef}
          id={id}
          role="combobox"
          aria-label={ariaLabel}
          aria-expanded={open && matches.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          value={draft}
          onChange={(event) => { setDraft(event.target.value); setHighlight(0); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onKeyDown={onKeyDown}
          placeholder={value.length ? "Add another…" : placeholder}
        />
      </div>
      {open && matches.length ? (
        <ul className="chip-combobox-list" id={listId} role="listbox">
          {matches.map((option, index) => (
            <li
              key={option}
              role="option"
              aria-selected={index === highlight}
              className={index === highlight ? "is-active" : ""}
              onMouseDown={(event) => { event.preventDefault(); add(option); }}
              onMouseEnter={() => setHighlight(index)}
            >
              {option}
            </li>
          ))}
          {draft.trim() && !matches.some((option) => option.toLowerCase() === draft.trim().toLowerCase()) ? (
            <li className="chip-combobox-free" role="option" aria-selected={false} onMouseDown={(event) => { event.preventDefault(); add(draft); }}>
              Add “{draft.trim()}”
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
