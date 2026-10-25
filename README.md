# Float Todo

A desktop floating-ball to-do widget, built with Electron.

## Run it
```bash
npm install
npm start
```
Build a Mac app: `npm run dist` (produces a .dmg in `dist/`).

## Using it
- At rest it's a translucent ball on the edge of the screen (the number is your to-do count). Hover to expand; move away and it collapses after 0.45s.
- Drag the ball or the panel's title bar to reposition it — the position is remembered.
- Right-click the ball or title bar for: toggle always-on-top, launch at login, reset position, and quit (the Dock icon is hidden, so this is how you quit).
- The pin icon in the header keeps the panel expanded.
- Add a task in the bottom input and press Enter. Shortcuts: `Write weekly report #work @tomorrow`
  - `#category`: type a new category name directly to create it
  - `@today` / `@tomorrow` / `@+3d` / `@10-30` / `@2026-10-30` for due dates
  - Or use the category field and date picker below the input instead
- Tasks: check the circle to mark complete; hover a task for Pending / Cancel / Delete; other tabs let you restore a task with one click.
- Double-click a task's text to edit it, or use the pencil icon that appears on hover.
- Drag tasks to reorder them, or drag into a different category group (including empty ones).
- Categories: double-click a name to rename it (or use the pencil icon), click the colored dot to change its color, click the trash icon to delete it (confirm within 3 seconds if it has tasks), and use "+ New category" at the bottom of the list to add one.
- The circle icon in the header opens a slider to adjust the panel's background transparency.
- The ⟳ icon in the header imports the next 7 days of events from the macOS Calendar app into a `calendar` category (requires authorization on first use; de-duplicated by event ID — recurring events only import their primary occurrence).

## Data
Stored in Electron's localStorage (in the app's user data directory). Window position is stored separately in `window.json`.

## Notes
- A plain web page can't stay "always on the desktop, on top, without taking up a window," so this wraps the UI in Electron. Always-on-top uses the `screen-saver` level and stays visible across all desktop spaces and full-screen apps.
- The glass effect uses CSS `backdrop-filter`, which only blurs what's inside the window. For a true blur of the desktop behind it, you could add `vibrancy: 'hud'` to the expanded window on Mac, but the window would then become a rectangular shape with no custom corner radius — a trade-off to weigh if you want that.
