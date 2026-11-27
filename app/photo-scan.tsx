"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { ingredientNames } from "../lib/pantry";
import { localId, recognitionResponse, type ErrorCode, type Suggestion } from "../lib/vision/contracts";
import type { PublicVisionSettings } from "../lib/vision/settings";
import IngredientPicker from "./ingredient-picker";

type Photo = { id: string; blob: Blob; url: string };
const scanErrors: Record<ErrorCode, string> = {
  invalid_request: "We could not read this upload. Choose the photos again or add ingredients by hand.",
  unsupported_image: "This image could not be read. Try a new photo or a JPEG, PNG, or WebP image.",
  upload_limit: "The upload is too large. Remove a photo or try a smaller one.",
  rate_limited: "Photo scanning is busy. Try again in a little while or add ingredients by hand.",
  timeout: "The scan took too long. Try again or add ingredients by hand.",
  provider_unavailable: "Photo scanning is unavailable. You can keep adding ingredients by hand.",
  invalid_provider_output: "We could not read the scan results. Try again, add a close-up, or continue by hand.",
};

async function preparePhoto(file: File, settings: PublicVisionSettings): Promise<Photo> {
  const original = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = original;
    await image.decode();
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image decoding unavailable");
    const scale = Math.min(1, settings.maxEdge / Math.max(image.naturalWidth, image.naturalHeight));
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.88, 0.76, 0.65]) {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
      if (blob?.type === "image/jpeg" && blob.size <= settings.maxImageBytes) {
        return { id: localId(), blob, url: URL.createObjectURL(blob) };
      }
    }
    throw new Error("Image exceeds upload limit");
  } finally {
    URL.revokeObjectURL(original);
  }
}

function suggestionKey(item: Suggestion) {
  return item.kind === "catalog" ? item.ingredientId : `free:${item.suggestedName}`;
}

export default function PhotoScan({
  vision, available, approve, retain,
}: {
  vision: PublicVisionSettings | null;
  available: ReadonlySet<string>;
  approve: (ids: string[]) => void;
  retain: (label: string) => void;
}) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const photoList = useRef<Photo[]>([]);
  const alive = useRef(false);
  const [consented, setConsented] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");
  const [suggestionCount, setSuggestionCount] = useState<number | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [retry, setRetry] = useState(false);
  const active = useRef<AbortController | null>(null);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      active.current?.abort();
      active.current = null;
      for (const photo of photoList.current) URL.revokeObjectURL(photo.url);
    };
  }, []);

  function invalidate() {
    active.current?.abort();
    active.current = null;
    setScanning(false);
    setSuggestionCount(null);
    setSuggestions([]);
    setEditing(null);
    setError("");
    setRetry(false);
  }

  function updatePhotos(updated: Photo[]) {
    invalidate();
    for (const old of photoList.current) if (!updated.includes(old)) URL.revokeObjectURL(old.url);
    photoList.current = updated;
    setPhotos(updated);
    setConsented(false);
  }

  async function select(event: ChangeEvent<HTMLInputElement>, replaceId?: string) {
    const input = event.currentTarget;
    const files = Array.from(input.files ?? []);
    input.value = "";
    if (!vision || files.length === 0) return;
    const current = photoList.current;
    if (!replaceId && files.length + current.length > vision.maxImages) {
      setError(`Choose up to ${vision.maxImages} photos in total.`);
      return;
    }
    setPreparing(true);
    setError("");
    const additions: Photo[] = [];
    try {
      for (const file of files) additions.push(await preparePhoto(file, vision));
      if (!alive.current) return;
      updatePhotos(replaceId ? current.map((photo) => photo.id === replaceId ? additions[0] : photo) : [...current, ...additions]);
    } catch {
      if (alive.current) setError("This photo could not be prepared. Try a smaller JPEG, PNG, or WebP image, or add ingredients by hand.");
    } finally {
      for (const photo of additions) if (!photoList.current.includes(photo) || !alive.current) URL.revokeObjectURL(photo.url);
      if (alive.current) setPreparing(false);
    }
  }

  async function scan() {
    if (!consented || photos.length === 0 || active.current) return;
    const controller = new AbortController();
    active.current = controller;
    setScanning(true);
    setSuggestionCount(null);
    setError("");
    setSuggestions([]);
    setEditing(null);
    const id = localId();
    const form = new FormData();
    form.set("manifest", JSON.stringify({ schemaVersion: 1, requestId: id, imageIds: photos.map((photo) => photo.id) }));
    for (const photo of photos) form.set(`image_${photo.id}`, photo.blob, `${photo.id}.jpg`);
    try {
      const response = await fetch("/api/recognize", { method: "POST", body: form, signal: controller.signal });
      const parsed = recognitionResponse.safeParse(await response.json());
      if (active.current !== controller) return;
      if (!parsed.success || (parsed.data.requestId !== id && parsed.data.requestId !== null)) throw new Error("Invalid response");
      if (parsed.data.status === "error") {
        setError(scanErrors[parsed.data.code]);
        setRetry(parsed.data.retryable);
      } else {
        setSuggestions(parsed.data.suggestions);
        setSuggestionCount(parsed.data.suggestions.length);
        setRetry(false);
      }
    } catch {
      if (active.current === controller) {
        setError("The scan could not finish. Check your connection, try again, or add ingredients by hand.");
        setRetry(true);
      }
    } finally {
      if (active.current === controller) {
        setScanning(false);
        active.current = null;
      }
    }
  }

  function dismiss(keys: string[]) {
    setSuggestions((current) => current.filter((item) => !keys.includes(suggestionKey(item))));
    setEditing(null);
  }

  if (!vision) return (
    <section className="panel photo-panel" aria-labelledby="scan-title">
      <h2 id="scan-title">Scan your fridge or pantry</h2>
      <p className="muted">Photo scanning is unavailable. You can still find recipes by adding ingredients by hand.</p>
      <a className="secondary" href="#ingredient-search">Add ingredients by hand</a>
    </section>
  );
  const pending = suggestions.filter((item) => item.kind === "free_text" || !available.has(item.ingredientId));
  const batch = pending.filter((item): item is Extract<Suggestion, { kind: "catalog" }> => item.kind === "catalog" && !item.uncertain);
  return (
    <section className="panel photo-panel" aria-labelledby="scan-title">
      <h2 id="scan-title">Scan your fridge or pantry</h2>
      {vision.mock && <p className="demo-label">Photo scan demo</p>}
      <p className="muted">Start with one clear photo. Add close-ups for small items or labels.</p>
      {photos.length > 0 && (
        <ul className="photos" aria-label="Selected photos">
          {photos.map((photo, index) => (
            <li key={photo.id}>
              <img src={photo.url} alt={`Selected photo ${index + 1}`} />
              <div className="photo-actions">
                <label className="file-action quiet">
                  <input type="file" accept="image/*" disabled={preparing} onChange={(event) => select(event, photo.id)} />
                  Replace <span className="visually-hidden">photo {index + 1}</span>
                </label>
                <button className="quiet" type="button" disabled={preparing} aria-label={`Remove photo ${index + 1}`}
                  onClick={() => updatePhotos(photos.filter((item) => item.id !== photo.id))}>Remove</button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {photos.length < vision.maxImages && (
        <div className="photo-buttons">
          <label className="file-action primary"><input type="file" accept="image/*" capture="environment"
            disabled={preparing} onChange={select} /> Take a photo</label>
          <label className="file-action secondary"><input type="file" accept="image/*" multiple
            disabled={preparing} onChange={select} /> {photos.length ? "Add photos" : "Upload photos"}</label>
        </div>
      )}
      {preparing && <p role="status">Preparing your photos…</p>}
      {photos.length > 0 && (
        <div className="scan-actions">
          <label className="consent"><input type="checkbox" checked={consented} disabled={scanning}
            onChange={(event) => setConsented(event.target.checked)} />
            <span>I agree to send these photos for processing. {vision.notice}</span>
          </label>
          <button className="primary" type="button" disabled={!consented || scanning || preparing} onClick={scan}>
            {scanning ? "Scanning…" : retry ? "Try scan again" : "Scan photos"}
          </button>
          {scanning && <button className="quiet" type="button" onClick={invalidate}>Cancel scan</button>}
        </div>
      )}
      <div role="status" className="visually-hidden">{scanning ? "Scanning photos. You can keep editing your ingredients." : ""}</div>
      {error && <p className="error" role="alert">{error}</p>}
      {suggestionCount !== null && (
        <div className="review" aria-labelledby="review-title">
          <h3 id="review-title">Review suggestions</h3>
          {pending.length === 0 && <p role="status">{suggestionCount ? "All suggestions have been reviewed." : "No suggestions found. Add a close-up or enter ingredients by hand."}</p>}
          {batch.length > 0 && <button className="secondary" type="button" onClick={() => {
            const ids = batch.map(({ ingredientId }) => ingredientId); approve(ids); dismiss(ids);
          }}>Confirm {batch.length} clear {batch.length === 1 ? "suggestion" : "suggestions"}</button>}
          <ul className="list">
            {pending.map((item) => {
              const key = suggestionKey(item);
              const name = item.kind === "catalog" ? ingredientNames.get(item.ingredientId) : item.suggestedName;
              const status = item.kind === "free_text" ? "Needs a catalog match" : item.uncertain ? "Uncertain" : "";
              return <li className="review-item" key={key}>
                <div className="row"><strong>{name}</strong>{status && <span className="tag">{status}</span>}</div>
                <ul className="evidence">{item.evidence.map(({ imageId, clue }) => {
                  const index = photos.findIndex((photo) => photo.id === imageId);
                  return <li key={`${imageId}:${clue}`}>{index >= 0 ? `Photo ${index + 1}: ` : ""}{clue}</li>;
                })}</ul>
                <div className="row">
                  {item.kind === "catalog" ?
                    <button className="secondary" type="button" onClick={() => { approve([item.ingredientId]); dismiss([key]); }}>Confirm<span className="visually-hidden"> {name}</span></button> :
                    <button className="secondary" type="button" onClick={() => { retain(item.suggestedName); dismiss([key]); }}>Keep unlinked<span className="visually-hidden"> {name}</span></button>}
                  <button className="quiet" type="button" onClick={() => setEditing(editing === key ? null : key)}>Edit<span className="visually-hidden"> {name}</span></button>
                  <button className="quiet" type="button" onClick={() => dismiss([key])}>Dismiss<span className="visually-hidden"> {name}</span></button>
                </div>
                {editing === key && <IngredientPicker inputId={`edit-${pending.indexOf(item)}`} initialValue={name} onSelect={(id) => { approve([id]); dismiss([key]); }} />}
              </li>;
            })}
          </ul>
        </div>
      )}
      <a className="manual-link" href="#ingredient-search">Add ingredients by hand</a>
    </section>
  );
}
