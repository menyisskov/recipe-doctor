# Vision study plan

## Collection and consent

Start with 8 to 12 kitchens. In each kitchen collect one fridge scene and one pantry scene when available. Record a wide photo and one or more close-ups of the same setup. Include weak light, clutter, reflections, opaque containers, similar packaging, and Hebrew labels. Cover iPhone and Android and include clear scenes for comparison.

Before collection, give participants a contact and explain the purpose, who can access the content, where and for how long it will be kept, and how to request deletion. Record permission for local research separately from permission to send photos to the specifically named provider. Verify the provider's retention controls on the selected account before obtaining the latter permission. A participant who declines cloud processing may still take part in the manual baseline.

Ask participants to omit people, papers, medication, names, and shipping information. Replace or crop accidental personal content locally with permission before use. Remove metadata and original filenames. Assign pseudonymous kitchen, scene, and image IDs. Store research data and consent records separately in restricted private storage. Publish only aggregate findings and synthetic examples. Before recruitment, assign an owner, contact channel, storage location, and retention period. A proposed local research retention period is up to 30 days after the study ends, subject to the agreed policy.

## Annotation and study split

| Record | Fields |
|---|---|
| Photo | Anonymous kitchen, scene and photo IDs, fridge or pantry, wide or close-up, device family, lighting, clutter and catalog version. |
| Ingredient | Photo ID, catalog ID or a generic out-of-catalog name, clear or ambiguous visibility, visual or label evidence, and whether the label was in Hebrew. Record each type once per image. |
| Evaluation | Scene, scan configuration, model and prompt versions, status, duration, attempts and cost if available. |
| Participant task | Task and scene IDs, route, execution order, start/end, matching result, quantity confirmation, correction counts and reason for an incomplete task if observed. |

Mark an item clear only when a person can identify it by sight or from a readable label. Mark evidence that could fit multiple ingredients ambiguous. Exclude hidden contents of unlabeled opaque containers from ground truth. Track confirmed out-of-catalog items separately as coverage gaps. Do not transcribe photographed labels.

Annotate before seeing provider results. Have a second annotator verify the holdout and disagreements on development data. Resolve disagreements in advance or retain an ambiguous label. Set aside about one quarter of kitchens for final evaluation, with all photos from a kitchen in the same split. Freeze the catalog, model, image settings and prompt before opening the holdout.

## Runs and success metrics

Use a timed manual entry task with a fixed recipe catalog for the early baseline. On the app, have participants use both routes on separate comparable scenes. Counterbalance route order. Measure from first entry action, capture or upload through opening a matching recipe, including confirmation and corrections. Keep the same recipe catalog and completion criterion for both routes. Record incomplete tasks, failures and abandonment.

Compare wide-only against wide plus close-up for each scene. Measure precision and missed items against the visible ground truth in each condition. Also compare detected coverage against the combined ground truth to estimate the value of the close-up. Compare providers by recognition, correction effort, ability to read Hebrew packaging, response time, price and approved retention settings.

| Outcome | Calculation |
|---|---|
| Time to recipe | Median and P90 among completed tasks, reported alongside the completion rate among all tasks started. |
| Suggestion acceptance | Suggestions confirmed with the original catalog ID divided by all unique suggestions shown. Report empty scans separately. |
| Precision and miss rate | Correct suggested IDs divided by suggested catalog IDs. Missed clear in-catalog IDs divided by all clear in-catalog IDs. Keep ambiguous and out-of-catalog findings separate. |
| Correction effort | Per-scan additions, removals and changed catalog links, including manual additions after an empty scan. |
| Recipe coverage | Scans leading to at least one matched recipe divided by scans started. Report the proportion of users who confirmed sufficient quantities among people who opened a recipe and answered, with missing answers counted separately. |
| Latency, failures and cost | Median and P90 from submission to final response. Divide failed scans by submitted scans. Average any known costs across scans, including retries and failed submissions with known usage. |

Report fridge and pantry results separately with denominators. Mark unavailable costs or zero-denominator metrics as missing. Set numeric launch targets after the initial measurement and before the pilot. Use the pilot readout to separate capture issues, provider errors, catalog gaps and insufficient quantities.

## Run the private evaluation

Place a JSON manifest and approved photos in the same private directory, outside Git. This is a synthetic example of the manifest shape.

```json
[
  {
    "kitchen": "k01",
    "category": "fridge",
    "split": "development",
    "consentForProvider": false,
    "wide": { "file": "wide.jpg", "visibleIds": ["egg"] },
    "closeups": [{ "file": "detail.jpg", "visibleIds": ["egg", "tomato"] }]
  }
]
```

Run the local app with the chosen vision settings. Launch the study command with the same environment and set `STUDY_APP_URL` to the local origin. Use `npm run study:vision -- <private-manifest-path> development` to compare wide and combined scans. After freezing the configuration, repeat using `holdout`. For a paid provider run, also set `STUDY_ALLOW_PROVIDER=true` after permission to incur cost and participant consent for the named provider. The command checks consent before sending any photo and emits aggregate metrics only. Use app logs to reconcile attempts and reported cost, and use the participant session records for the manual baseline, confirmation and correction metrics.
