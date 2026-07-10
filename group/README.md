# group

`group` is a Chrome Manifest V3 extension for saving the current page into local JSON-backed groups and quickly reopening grouped work contexts.

## Load In Chrome

1. Open `chrome://extensions`.
2. Enable Developer Mode.
3. Click `Load unpacked`.
4. Select this folder: `D:\Claire\group`.

## First Use

Open any ordinary `http` or `https` page. The floating `g` button appears near the right edge. Click it, then choose or create a `group.json` file from the setup prompt.

## MVP Features

- Floating draggable page widget.
- Save the current page into an existing or new group.
- Global duplicate URL detection.
- Tree preview with page titles and domains.
- Open all pages in a group as new tabs in the current window.
- Management page for renaming, deleting, opening, JSON binding, and appearance settings.

## MVP Exclusions

Address-bar search, nested group UI, tag filtering, drag sorting, batching, blacklists, and automatic JSON repair are intentionally left for later versions.
