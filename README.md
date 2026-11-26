# Daymark

> **A calmer way to keep your day moving.** ☀️

A local-first daily planner for tasks, habits, recurring schedules, and progress review.

[![Built with vanilla JavaScript](https://img.shields.io/badge/built%20with-vanilla%20JavaScript-f7df1e?logo=javascript&logoColor=111)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![Progressive Web App](https://img.shields.io/badge/app-progressive%20web%20app-5b4bdb)](https://web.dev/progressive-web-apps/)
[![Privacy](https://img.shields.io/badge/data-local--first-2f855a)](#data-and-privacy)

Daymark keeps planning lightweight while still supporting recurring routines, completion history, streaks, analytics, calendar navigation, and optional push notifications.

## Why Daymark?

Most task tools make a simple list feel like project management. Daymark focuses on a smaller loop:

```text
Plan → Do → Review → Repeat
```

The interface is intentionally quiet, local-first, and easy to use without an account.

## Highlights

- Add one-time tasks and recurring routines
- Support daily, interval, weekday, weekly-quota, and monthly schedules
- Track completion and skipped tasks in local browser storage
- Review past tasks and unfinished days
- View calendar activity, progress summaries, completion percentages, and streaks
- Install as a progressive web app
- Optionally enable push notifications through a compatible notification worker
- Continue working offline with a local-first data model

## Tech stack

- HTML, CSS, and vanilla JavaScript
- Web Storage for local task and history data
- Service Worker and Web App Manifest for PWA behavior
- Optional Web Push integration
- No frontend framework or build step required

## Run locally

Because the app uses browser APIs and a service worker, serve the repository through a local HTTP server rather than opening `index.html` directly.

For example, with Python:

```bash
python -m http.server 8000
```

Then open [http://localhost:8000](http://localhost:8000).

## Optional notifications

Notifications are optional. The app can run entirely in local-only mode.

To enable push notifications:

1. Configure a compatible notification API endpoint.
2. Set the public VAPID key and API URL in `config.js`.
3. Serve the app over HTTPS in production.
4. Grant notification permission in the browser.

The public VAPID key is safe to publish. Private VAPID keys, credentials, and deployment secrets must remain outside the repository.

## Project structure

```text
index.html          Application shell and dialogs
app.js              UI state, task actions, rendering, and sync
recurrence.js       Schedule normalization, occurrence rules, stats, and streaks
style.css           Base application styles
dashboard.css       Progress dashboard styles
brand.css           Daymark visual identity styles
service-worker.js   PWA and notification support
manifest.json       Installable web-app metadata
config.js           Public runtime configuration
icons/              Application icons
```

The recurrence engine is kept separate from the UI so schedule rules, analytics, migrations, and calendar views share one source of truth.

## Data and privacy

Tasks, history, and device identifiers are stored in the browser by default. Optional notification sync sends the configured task state and history to the configured API endpoint. Review that deployment and its privacy policy before enabling notifications.

Do not store passwords, secrets, financial information, or sensitive personal data in task titles or notes.

## Current status

The core local-first planner is usable. Notification delivery and hosted sync depend on the separately configured worker service.

## Roadmap

- Add automated browser tests for scheduling and recurrence edge cases
- Add import/export for local task data
- Improve accessibility coverage and keyboard navigation
- Add a documented notification-worker deployment
- Add conflict handling for multi-device synchronization

## License

No license has been selected yet. Until a license is added, the repository remains source-available but does not grant broad reuse rights.

## Author

Built and maintained by Antony Nixon.
