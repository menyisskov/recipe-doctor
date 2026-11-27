# Pilot handoff

| Milestone | Present in this branch | Remaining evidence |
|---|---|---|
| Research setup | Consent and labeling plan, English catalog and data schemas | Consented photos, private ground truth, manual baseline, and reserved holdout |
| Vision proof of concept | Configurable candidate adapter, dry-run mode and evaluation procedure | Real detections, latency, costs, privacy validation and a model selection |
| Manual product | Search, pantry and staples, deterministic matches and recipe pages | Measure manual task completion with participants |
| Capture integration | Capture and upload inputs, consent, previews, scan review and typed recovery | Physical iPhone Safari and Android Chrome checks, including native formats |
| Pilot readiness | Original starter recipes, local verification and deployment checklist | Tune recipe coverage from data, establish targets, verify hosting safeguards and obtain approval to deploy |
| Pilot | Study protocol and decision criteria | Recruitment, measurement and investment decision |

Verified locally with five data and service tests, eight browser scenarios across mobile-profile Chromium and WebKit, and a production build. The private evaluation command also completed a wide versus wide-plus-close-up run against mock mode with synthetic photos. This exercise checks the pipeline; real accuracy, scan time, and cost still require consented photos and an approved provider run.

## Release checks

- Exercise manual entry, camera capture, photo selection, unsupported formats, partial uploads, empty scans, unavailable provider, retries, and stale responses on physical iPhone Safari and Android Chrome. Include screen-reader and keyboard checks. Native HEIC decoding depends on the device and browser. When it cannot be read, use a fresh capture or JPEG, PNG, or WebP.
- Test with consented photos in a private environment. Review the candidate account's image retention and consent wording. Compare wide shots and close-ups and freeze the final evaluation split.
- Confirm names, quantities and directions, and prepare recipes for the most common gaps observed during the study. Check substitutions in a kitchen before relying on them in pilot recipes.
- Set explicit budget, input and concurrency limits on the app and at ingress. Use a shared limiter when running multiple instances. Configure HTTPS and a supported Node.js host with the image-processing dependency installed. Turn off request-body logging.
- Confirm production environment variables and run the production build before deployment. Obtain approval before launching a paid service or publishing the pilot. Set the metrics and targets before launch.
