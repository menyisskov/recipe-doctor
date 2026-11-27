"use client";

import { useState } from "react";
import { findIngredients, normalizeName } from "../lib/pantry";

export default function IngredientPicker({
  inputId,
  initialValue = "",
  onSelect,
  onFreeText,
}: {
  inputId: string;
  initialValue?: string;
  onSelect: (id: string) => void;
  onFreeText?: (label: string) => void;
}) {
  const [query, setQuery] = useState(initialValue);
  const matches = findIngredients(query).slice(0, 8);
  const exact = matches[0] && [matches[0].label, ...matches[0].aliases]
    .some((name) => normalizeName(name) === normalizeName(query)) ? matches[0] : undefined;
  function select(id: string) {
    onSelect(id);
    setQuery("");
    document.getElementById(inputId)?.focus();
  }
  function addFreeText() {
    if (!query.trim() || !onFreeText) return;
    onFreeText(query.trim());
    setQuery("");
    document.getElementById(inputId)?.focus();
  }
  return (
    <form className="picker" onSubmit={(event) => { event.preventDefault(); if (exact) select(exact.id); }}>
      <label className="visually-hidden" htmlFor={inputId}>Find an ingredient</label>
      <input id={inputId} type="search" placeholder="Search for an ingredient" value={query} maxLength={100}
        autoComplete="off" onChange={(event) => setQuery(event.target.value)} />
      {query.trim() && (
        <div className="picker-matches">
          {matches.length > 0 ? matches.map(({ id, label }) => (
            <button className="pick" type="button" key={id} onClick={() => select(id)}>{label}<span aria-hidden="true">+</span></button>
          )) : <p className="muted">No ingredient in the catalog matches that name.</p>}
          {onFreeText && !exact && (
            <button className="quiet pick" type="button" onClick={addFreeText}>Keep “{query.trim()}” as an unlinked item</button>
          )}
        </div>
      )}
    </form>
  );
}
