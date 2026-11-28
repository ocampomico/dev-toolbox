# Dev Toolbox

Small developer utilities that run entirely in the browser. Nothing you paste is stored or sent to a server.

## Tools

- **JSON**: format, minify, sort keys, and validate (errors include the line and column). Converts JSON to CSV (nested objects become dot keys) and CSV to JSON (detects the delimiter, handles quoted fields, optionally reads numbers, booleans, and null), with a table preview.
- **Diff**: compares two JSON documents and lists added, removed, and changed values by path (like `$.user.tags[2]`) with old and new values. Objects are matched by key, so key order is ignored; arrays are matched by index. Includes swap and format-both buttons.
- **Encode**: Base64 (UTF-8 safe, optional URL-safe output, decodes either form) and URL component encoding.
- **JWT**: decodes the header and payload, shows `iat`, `nbf`, and `exp` as dates, and says whether the token has expired. It does not verify signatures.
- **UUID**: generates v4 or v7 (time-ordered) UUIDs in bulk and inspects any UUID's version, variant, and embedded time.
- **Hash**: SHA-1, SHA-256, SHA-384, and SHA-512 digests, or HMACs with a key, through Web Crypto.
- **Regex**: tests a JavaScript regular expression against multi-line text with toggles for the g, i, m, s, u, y and d flags (and v where the browser supports it). Highlights matches, lists each one with its index, length, and numbered and named groups, and previews a replace with `$1`, `$<name>` and `$&`. Syntax errors show as you type. Matching runs in a Web Worker that is stopped after 1 second, so a pattern that backtracks badly cannot freeze the page, and the list stops at 1,000 matches. Includes a short cheat sheet.
- **Cron**: explains a 5-field cron expression or a shortcut like `@daily` in plain English, breaks it down field by field, and lists the next 5 runs in your time zone. Supports lists, ranges, steps, month and day names, 7 for Sunday, and the rule that cron runs on either day field when both are set. Errors name the field that is wrong.
- **Time**: live Unix time, and conversion between seconds, milliseconds, ISO 8601, and any time zone.

## Develop

```sh
npm install
npm run dev     # http://localhost:5173
npm test        # unit tests for src/lib
npm run build   # production build into dist/
```

Production builds assume the app is served from `/tools/devtoolbox/`. Set `BASE_PATH=/` to build for the site root.

## Structure

- `src/lib/`: pure functions for each tool, with no UI imports; covered by `lib.test.ts`.
- `src/workers/`: Web Workers for work that could hang the page, like running a user's regex.
- `src/views/`: one view per tool. All views stay mounted, so input survives switching tabs.
