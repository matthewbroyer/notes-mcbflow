# Release notes · Notes (notes.mcbflow.com)

Newest first. One entry per release, in plain words a user would understand.

## 1.7 · 2026-10-17
- New Help page (sidebar, and More on phones): getting started in four steps, answers grouped by topic (writing, tags and links, finding and tidying up, backups and sync), installing the app, and your data and privacy. The Tips that were in Settings moved there.
- Search in the top bar (or / or Ctrl+K) now looks through every note, Archive and Trash included, plus your tags, and opens the note you pick. The box above your notes is now called "Filter this list" and still narrows the list you're looking at; on computers it sits above the notes instead of in the top bar.
- Notes always opens in light mode until you pick dark (welcome screen, top bar or Settings). It no longer follows your device's dark mode.
- First visit: the welcome screen asks "Start empty" or "Start with sample data" (empty is the default). The three sample notes are no longer added on their own. When they're there, All notes shows "You're looking at sample data" with Remove sample data, which removes the samples you haven't changed (with Undo). Your existing notes are untouched.
- Delete forever (in Trash) and Empty Trash happen right away and show Undo, instead of asking first.
- The phone More menu now lists Settings, Pinned, Trash, Help and What's new, and looks the same as in the other mcbflow.com apps. What's new, messages and empty pages also use the shared look.
- The welcome banner now reads "Your notes" with today's date and how many notes you have.
- Settings starts with "Changes save as you make them." The "Your notes" section is now "Notes settings", and the Install section reads the same in every app.
- The spreadsheet export is now named notes-notes-YYYY-MM-DD.csv, and share images are dated (notes-milestone-YYYY-MM-DD.png). Backups keep their names. Import still takes files with any name.

## 1.6 · 2026-10-17
- New bottom bar on phones: Notes · Checklists · + (new note) · Archive · More. The + does the same as the "New note" button, which now only shows on bigger screens. Trash, Settings and What's new are under More.
- Clear all data now asks you to type DELETE, the same in every mcbflow.com app, and offers to save a backup first. When you're signed in it says the synced copy on your account is deleted too.
- Account pop-up spacing fixed.
- The welcome banner art is no longer cut off on phones.
- Very long note titles, tags or words no longer make the page scroll sideways on phones.

## 1.5 · 2026-10-16
- New Settings page, laid out the same way in every mcbflow.com app: Appearance, Account & sync, Your notes, Tips, Backup & data, Install, About.
- Account button in the top bar: "Sign in", or your initial with a dot that shows whether sync is up to date. New "Keep me signed in on this device" switch (turn it off on a shared computer).
- First visit: the same short welcome screen as the other apps (what Notes does, pick light or dark, write a first note, or sign in / import a backup / import from Google Keep). The three sample notes are still added; the Welcome note is shorter now.
- Clearer Data menu with a line about each choice: Save backup now (Ctrl+S; in Chrome and Edge it keeps one backup file up to date), Export All as JSON, CSV or ZIP, Import Backup (now also takes the .zip) and Import from Google Keep.
- New: Export All (CSV), one row per note for Excel, Numbers or Google Sheets. New: Export All (ZIP), the backup, the spreadsheet and your attached files in one download.
- Pictures and attached files now open right in the app (photo viewer, PDFs, text files) instead of downloading. Click a thumbnail on a note card to see it. Files that are on another device say so.
- Quieter backup reminders when you're signed in and syncing: the Data menu just says "Synced to your account".
- Even top bar: every button, the light/dark switch and the account button are the same height.
- Profile picture and screen name for your mcbflow.com account: account button → Edit profile. The same picture and name show in every app.
- A greeting above All notes: "Good morning", or "Good morning, Matthew" with your screen name when you're signed in.
- Settings now has a proper gear icon. The first tab keeps its name, "Notes" ("All notes" in the sidebar).
- New name style: "Notes ∙ mcbflow.com". New footer with What's new, Privacy, Terms and More free apps, and a new Terms page.
- "Delete all notes" is now Data → Clear all data (it still asks first, and still warns when it also deletes your synced notes).

## 1.4 · 2026-10-15
- Optional free mcbflow.com account: sign in from Settings or the Data menu → Sync across devices to keep your notes the same on your phone and computer. Without an account, everything works as before and nothing leaves your device.
- Attached files now live in the browser's database instead of next to your notes, so they no longer eat into the roughly 5 MB note space. Existing attachments move over automatically the first time you open this version.
- Attachments stay on the device you added them on. Other devices show "not on this device"; Export backup / Import backup still moves them.
- Delete all notes warns that it also deletes your synced notes when signed in.

## 1.3 · 2026-10-14
- Moved to notes.mcbflow.com. Notes saved at the old address don't carry over: export a backup there and import it here.
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
