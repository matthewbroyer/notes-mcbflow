# Release notes · Notes (notes.mcbflow.com)

Newest first. One entry per release, in plain words a user would understand.

## 1.4 · 2026-10-15
- Optional free mcbflow.com account: sign in from Settings or the Data menu → Sync across devices to keep your notes the same on your phone and computer. Without an account, everything works as before and nothing leaves your device.
- Attached files now live in the browser's database instead of next to your notes, so they no longer eat into the roughly 5 MB note space. Existing attachments move over automatically the first time you open this version.
- Attachments stay on the device you added them on. Other devices show "not on this device"; Export backup / Import backup still moves them.
- Delete all notes warns that it also deletes your synced notes when signed in.

## 1.3 · 2026-10-14
- Moved to notes.mcbflow.com. Notes saved at mbnotes.online don't carry over: export a backup there (Settings → Export backup) and import it here.
- Storage names simplified.

## 1.2 · 2026-10-14
- On computers, the search box, backup status and logo spacing now look exactly like the other mb apps: same size, same "Search…" text, and the "/" key now jumps to search.
- Tidier top bar that matches the other apps. On phones it now shows search, Data and a proper light/dark switch as icons, plus the New note button.
- Data (backup and import) is now reachable from the top bar on phones too.
- The light/dark switch shows a sun and a moon so it's clear what it does.

## 1.1 · 2026-10-14
- About card at the bottom of Settings: version, release date, links and copyright in one place.
- Installing from matthewbroyer.com: the hub's Install button opens the app with a short install prompt.
- New "page not found" page that matches the app and links back to it.
- Settings: the Install card now sits at the bottom of Settings, just above the About card, and the danger card is now called "Delete data".

## 2026-10-13

**New look and Google Keep import** (Official Web App · v1.0, was Alpha v1.1)

- **Import from Google Keep.** Settings → Import from Google Keep reads your Google Takeout .zip (or the Keep .json files) right in the browser. Titles, text, checklists, colors, pins, archive, trash, labels (as #tags), web links, dates and images come across. Running it again skips notes you already imported.
- **Fixed: "Load demo notes" could wipe your notes.** The button showed on any empty view (an empty Trash, no search results) and replaced everything. Sample notes are now only offered when you have no notes, and they're added, never swapped in.
- **Fixed: notes typed in the top box were lost if you clicked away.** Clicking anywhere else now saves the note, and a half-written note survives a reload or closed tab.
- **Fixed: on phones you couldn't pin, archive or delete a note.** Those buttons were hover-only. They're now always visible on touch screens and also in the note editor.
- **Fixed: Undo did nothing the first time.** Undo and Redo now use the browser's own history, so Ctrl+Z works as expected.
- **Safer imports.** Backups and Keep exports are cleaned before they're shown, so a crafted file can't run code in the app.
- **Import backup** now asks whether to add the backup to your notes or replace them, instead of always replacing.
- **Empty Trash** and **Delete all notes** (Settings), both with a confirmation. Moving a note to Trash or Archive shows an Undo.
- Checklists: Enter adds the next item, Backspace on an empty item removes it, and a finished list can be shared as an image (the list's title is hidden unless you turn it on).
- Search now also finds checklist items. Pasting a screenshot attaches it; pasted web formatting is cleaned up. Attachments open when clicked.
- New MB Suite design: left sidebar on computers, icon rail on tablets, bottom bar on phones, tag filter chips on smaller screens, Marigold accent and a new logo.
- Install it as an app (Settings, in Chrome/Edge/Android, or Add to Home Screen on iPhone). Works offline after the first visit.
- The app no longer loads anything from other sites (it used Tailwind, Font Awesome and Google Fonts from CDNs), so it's lighter and nothing about your visit goes to third parties.
- Added a Privacy page.
