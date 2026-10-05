# IR & Neuro Cath Lab Inventory Count

Offline-capable web app (PWA) for physical inventory counts in IR and Neuro cath labs.
© 2026 Shadi Al Rawashdeh (shadirawa@gmail.com). All rights reserved. See `LICENSE.txt`.

**Features:** Count Sheet (467 register lines, walk order, live variance / recount / expiry / reorder logic), Progress Dashboard, Items Not On Register log, searchable Device Catalog (2,011 devices), Excel export, JSON backup/restore.

**Per-user versions:** each person creates a profile (optional PIN). Data is stored only in that person's browser (IndexedDB) and never leaves the device. The PIN is a local convenience lock, not encryption. Use *Backup* to move a profile between devices.

## Publish on GitHub Pages
1. Create a new repository on GitHub (e.g. `ir-count`).
2. Upload **all files and folders from this directory** (keep `data/`, `icons/`, `vendor/`, and the hidden `.nojekyll`). Drag-and-drop in the GitHub web UI works.
3. Repository **Settings → Pages → Build and deployment → Deploy from a branch → `main` / `(root)` → Save**.
4. After a minute the app is live at `https://<your-username>.github.io/<repo>/`.
5. Open it once online; it then works offline and can be installed (browser menu → *Install app* / *Add to Home screen*).

To publish an update, change `VERSION` in `sw.js` (e.g. `v1.0.1`) so users' cached copies refresh.

## Run locally
`python3 -m http.server 8000` in this folder, then open http://localhost:8000 (service workers need http(s), not `file://`).

## Notes
- Editing register data: `data/register.json`. Device data: `data/devices.json`.
- The register's System Qty and Expiry columns were empty in the source workbook, so users can enter System qty in the app.
