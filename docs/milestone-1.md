# Product specification

## User flow

| Stage | Interaction |
|---|---|
| Start | Take or upload a photo, or add ingredients by hand. Both paths update the same confirmed list. The device restores saved ingredients and staples and offers a reset. |
| Photos | Start with one photo. Preview, replace, remove, or add close-ups. The browser resizes and encodes uploads without the original metadata. Show the external processing notice and require consent before submission. |
| Scan | Announce progress while manual editing stays available. After a failure, allow a retry or manual entry without losing confirmed ingredients. When the response is empty, suggest a close-up or manual entry. Ignore a response to an abandoned scan. |
| Review | Merge the same ingredient across photos and show its sources. Allow batch confirmation of clear catalog matches. Require explicit action on every uncertain or unlinked item. Allow correction, dismissal, linking or keeping a free-text item. |
| Results | Refresh complete recipe matches as the confirmed list changes. Show name, description, time and servings. If there is no complete match, offer a return to editing. |
| Recipe | Show required quantities, optional ingredients, selected substitutions, equipment and directions. Ask the user to check quantities. |

The current interface is English and left-to-right under the English-only repository instruction. Use keyboard-accessible native controls, status announcements, readable contrast, and touch targets. Preserve the confirmed list during scan cancellation, replacement, or recovery.

## Contracts

| Contract | Rules |
|---|---|
| [Ingredient catalog](../schemas/ingredient-catalog.schema.json) | Stable snake-case IDs, English display names, and aliases. Search normalizes case, diacritics, whitespace and punctuation. Keep aliases unique after normalization to support exact selection. Fresh tomato and crushed tomatoes remain distinct. |
| [Pantry](../schemas/pantry.schema.json) | Availability is the union of manually confirmed items and saved staples. Removing an ingredient clears it from both sets. Free-text items affect matching only after being linked to a catalog ID. Reset clears pantry and staples. |
| [Recipe](../schemas/recipe.schema.json) | Use catalog IDs for quantities, optional items, and explicit substitution alternatives. Instructions reference catalog IDs that appear in the recipe. Editorial review checks that the wording and amounts agree. |
| [Provider result](../schemas/recognition.schema.json) | Canonical, provider-independent observations contain a photo ID, a short clue, and an uncertainty flag. A catalog match carries an ID. An unlinked observation carries a name. Quantity, freshness and hidden contents are outside the contract. |
| [Upload manifest](../schemas/recognition-manifest.schema.json) | POST multipart form data to `/api/recognize`. The `manifest` field contains the version, request ID and unique photo IDs. Upload parts are named `image_<imageId>`. |
| [Recognition response](../schemas/recognition-response.schema.json) | The response includes the request ID and merged suggestions, or a typed error with a retry flag. A valid empty array is a successful scan with no detections. |

Reject unsupported or excess uploads before contacting a provider. Discard observations with unknown source or catalog IDs. An invalid response with no usable observations is a provider-output failure. Merge catalog matches by ID, retaining evidence across photos. A clear observation permits batch confirmation of its merged item. Free-text observations merge by normalized name and require review. Use photographed text solely as identification evidence.

## Matching rules

1. Use the confirmed catalog IDs, including staples deliberately added by the user.
2. For each required ingredient, use the original if available, then the first available substitute in recipe order. Exclude the recipe when neither is available.
3. Optional ingredients do not affect matches. Show quantities and specific substitutes. If the same product serves several roles, the user must check the total quantity needed.
4. Order results by preparation time and then by stable recipe ID.

Example: eggs, crushed tomatoes, neutral cooking oil and salt match Skillet Tomato Eggs through its recipe-specific tomato substitution. Unconfirmed salt prevents the match. Duplicate eggs have no effect.
