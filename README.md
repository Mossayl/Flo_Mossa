# Flo Mossa

Floating, always-on-top note collector for macOS built with Electron. The app lets you jot down tagged snippets, drop or paste screenshots, cache everything locally, and generate structured DOCX notes on demand. A tray icon keeps the window handy without cluttering your workspace, and `electron-builder` packaging produces both the raw `.app` bundle and a distributable `.dmg`.

## Features
- **Minimal floating window** – 360×420 frameless UI that stays above other apps but can be hidden or restored from the tray.
- **Structured note input** – Tag selector, title and source fields, multiline content area, and dual actions for caching or submitting.
- **Screenshot ingestion** – Drag & drop, paste (`Cmd+V`), or file-select images; thumbnails with ✨ success indicators confirm they were stored.
- **Local cache + DOCX export** – Every fragment is saved as JSON under Electron’s `userData` path (`~/Library/Application Support/flo_mossa/local-notes-cache`). Submitting composes a DOCX (via `docx` library) into `~/Library/Application Support/flo_mossa/local-notes/<tag>/<title>.docx` and keeps companion metadata JSON.
- **Tray controls** – A menu bar icon toggles visibility or quits without killing the background process.
- **One-command packaging** – `electron-builder` scripts emit both the `.app` bundle (for direct double-click) and a `.dmg` installer for distribution.

## Requirements
- macOS with Apple Silicon or Intel (tested on Apple Silicon).
- Node.js 20+ (Electron 39 requires modern Node).
- npm (ships with Node).

## Installation
```bash
npm install
```

## Development
- **Start the app in watch mode**
  ```bash
  npm start
  ```
  This launches Electron with the floating window. Logs from the renderer are visible in DevTools (`Cmd+Opt+I`).

- **Project structure**
  ```
  .
  ├── app/                 # UI: index.html, styles, renderer logic
  ├── images/              # Saved screenshots during a session
  ├── main.js              # Electron main process, tray + IPC + doc generation
  ├── preload.js           # Secure bridge exposing IPC helpers
  ├── dist/                # Build outputs (.app, .dmg) after packaging
  └── package.json         # Scripts, deps, electron-builder config
  ```

## Working with Notes
- **Cache fragments** – Use the “缓存” button; each press appends a chunk to the JSON file under `~/Library/Application Support/flo_mossa/local-notes-cache`.
- **Submit to DOCX** – Click “提交” to merge cached chunks into a DOCX and metadata JSON inside `~/Library/Application Support/flo_mossa/local-notes/<tag>/`. The cache file for that tag/title resets afterward.
- **Images** – Saved into the app’s `images/` directory (bundled with the app); entries reference filenames so they can be embedded into exports.

## Packaging
- **Create only the `.app` bundle** (fast for local verification):
  ```bash
  npm run pack
  ```
  Output: `dist/mac-arm64/Flo Mossa.app` (double-click to launch).

- **Create distributable `.dmg`**:
  ```bash
  npm run build:mac
  ```
  Output: `dist/Flo Mossa-<version>-mac-arm64.dmg` plus a `.blockmap`.

- **Cross-platform builds** – The current config only targets macOS (`dmg`). Add other targets in `package.json > build.mac.target` as needed.

### Code Signing & Icons
- Builds are currently unsigned; macOS Gatekeeper will prompt the first time you open them. Provide a Developer ID certificate and set `CSC_IDENTITY_AUTO_DISCOVERY=true` (or explicit signing config) to ship publicly.
- Place a custom icon at `build/icon.icns` and electron-builder will embed it automatically.

## Troubleshooting
- **`hdiutil: create failed - 设备未配置`** – rerun with sufficient privileges (or allow Terminal full disk access) so `electron-builder` can create disk images.
- **App shows default Electron icon** – add a `.icns` file under `build/`.
- **Note files missing** – confirm the tag/title combination you cached matches the one you submit; each pair writes to its own cache JSON.

## Scripts Reference
| Command            | Description |
| ------------------ | ----------- |
| `npm start`        | Launch Electron in development. |
| `npm run pack`     | Package the app directory only (`dist/mac-arm64/Flo Mossa.app`). |
| `npm run dist`     | Shortcut for `electron-builder` default target(s). |
| `npm run build:mac`| Build the signed/unsigned DMG installer. |

Happy note-taking! Provide new UI assets or doc templates by editing files in `app/` and rerunning the build scripts.
