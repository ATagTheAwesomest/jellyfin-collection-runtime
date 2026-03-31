# Jellyfin Collection Runtime

A JavaScript snippet that adds **total runtime** and **"Ends at"** time to Jellyfin collection detail pages.

## What it does

When viewing a collection (e.g. a movie franchise), the script:

1. Detects movie items in the collection
2. Fetches each movie's runtime via the Jellyfin API
3. Displays the combined total runtime (e.g. `9h 32m`) in the collection header
4. Displays an "Ends at" time based on the current time + total runtime

The info is inserted after the content rating (e.g. PG-13) in the header bar, matching the native Jellyfin styling.

## Installation

### Option 1: Jellyfin JavaScript Injection Plugin (Recommended)

1. Install the [Jellyfin JS Injection Plugin](https://github.com/danieladov/jellyfin-plugin-js-injection) on your server
2. Place `collection-runtime.js` in the plugin's configured scripts directory
3. Restart Jellyfin

### Option 2: Tampermonkey / Userscript

1. Install [Tampermonkey](https://www.tampermonkey.net/) in your browser
2. Create a new userscript
3. Set the `@match` to your Jellyfin server URL (e.g. `https://your-jellyfin-server/*`)
4. Paste the contents of `collection-runtime.js` into the script body
5. Save and enable

### Option 3: Web directory injection

1. Copy `collection-runtime.js` to your Jellyfin server's web directory
2. Reference it in the `index.html` or via a plugin that supports custom JS loading

## How it works

- Uses the Jellyfin `ApiClient` (exposed globally by the web client) for authentication
- Fetches `/Users/{userId}/Items/{itemId}` for each movie card in the collection
- Sums `RunTimeTicks` (Jellyfin's internal unit: 1 tick = 100 nanoseconds) and converts to hours/minutes
- Injects styled `<div class="mediaInfoItem">` elements into the existing header
- Handles SPA navigation via hash polling and a MutationObserver
- Caches results per collection to avoid redundant API calls

## Logging

The script logs verbosely to the browser console with a `[CollectionRuntime]` prefix, including:

- Page detection results
- Card discovery and item IDs
- API requests and per-item runtimes
- Final totals and skip reasons

Open your browser's dev tools (F12 → Console) to see the output.
