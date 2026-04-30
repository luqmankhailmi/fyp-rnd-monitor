# FYP Research Studio (Tauri Offline App)

Desktop app to support FYP problem statement research and solution planning, fully offline.

## Features

- Research paper tracker with:
  - title, authors, year
  - problem gap notes
  - proposed solution ideas
  - upload attachment (stored in local app state)
  - detailed editable notes per paper
- Draggable Kanban board (`To Do`, `Doing`, `Done`) with task priority.
- Node-style connection board to map relationships and connect ideas visually.
- Local backup export/import to JSON.

## Run Locally

```bash
npm install
npm run tauri dev
```

## Build Desktop Bundle

```bash
npm run tauri build
```

## Data Storage

- App data is stored in browser local storage inside the Tauri app profile.
- Use the in-app `Export Backup` button to save a JSON copy.
