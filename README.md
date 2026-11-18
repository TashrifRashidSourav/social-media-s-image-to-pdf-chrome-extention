# Image to PDF Scanner

A Chrome extension that turns the images you see on **LinkedIn, Facebook / Messenger, WhatsApp Web, Telegram Web** (and any other web page) into a clean, **page-by-page PDF** — without saving anything to your phone first.

It captures **every image of a multi-image post in one click**, then cleans each one up the way a scanner app (CamScanner-style) would: auto-crop, perspective fix, straighten, remove shadows, boost clarity, upscale low-resolution images, and optionally make the text searchable (OCR).

Everything runs **locally in your browser**. Your images are never uploaded anywhere unless you choose Google Drive upload.

---

## Table of contents

1. [Features](#features)
2. [Installation](#installation)
3. [Quick start](#quick-start)
4. [Capturing images](#capturing-images)
5. [Site-by-site guide](#site-by-site-guide)
6. [The editor](#the-editor)
7. [Exporting](#exporting)
8. [Settings and Google Drive](#settings-and-google-drive)
9. [Privacy, permissions and security](#privacy-permissions-and-security)
10. [Troubleshooting](#troubleshooting)
11. [Debug tools](#debug-tools)
12. [How it works (architecture)](#how-it-works-architecture)
13. [Project structure](#project-structure)
14. [Development notes](#development-notes)
15. [Known limitations](#known-limitations)
16. [Third-party libraries](#third-party-libraries)

---

## Features

**Capture**
- 🖱 **Hover buttons** on any image: **＋ PDF** (add this image) and **📄 Whole post** (capture all images of the post / album).
- 📌 **Whole-post capture** for multi-image posts (e.g. a LinkedIn post showing 4 images and "+16"), Messenger albums, WhatsApp media and Telegram albums.
- ▭ **Drag-select**: draw a box around several images on any page.
- 🖼 **Add all large images on the page**.
- Right-click menu, toolbar popup, and keyboard shortcuts.
- A persistent **basket** that survives across posts, sites and browser restarts — collect from several places, export as one PDF.
- Automatic **de-duplication** (by image ID and by what the picture actually looks like) and automatic removal of icons, avatars and ad banners.
- Drop, paste or pick **local images** too.

**Scan-quality cleanup (per page or all pages)**
- Auto **crop edges + perspective correction** for photographed pages.
- **Manual crop** with four draggable corners.
- **Deskew** (straighten tilted text), **rotate**, **shadow / uneven-light removal**.
- Looks: **Original · Enhanced colour · Magic colour · Scan B&W · Grayscale**, plus brightness and contrast.
- **HD upscale** for low-resolution images (denoise → enlarge → deblur), on by default.
- **Blank-page finder**.

**Export**
- **PDF** with page size (A4 / Letter / Legal / fit-to-image), orientation, margins, three file-size presets.
- **OCR** → searchable / selectable text inside the PDF (English, Bangla, Hindi, Arabic, Spanish, French, German).
- Watermark, page numbers, **password protection**.
- **ZIP of PNG or JPG** images, **plain-text** export of recognised text.
- **Save to Google Drive** (optional, needs your own OAuth client ID).
- **Export history** (last 12 PDFs, re-downloadable).
- Automatic file name from the post author and date.
- Light / dark theme.

---

## Installation

The extension is loaded "unpacked" (no store listing required).

1. Open `chrome://extensions` (also works in Edge `edge://extensions` and Brave).
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and select this project folder (the one containing `manifest.json`).
4. Pin the extension from the puzzle-piece menu so the toolbar icon is always visible.
5. **Reload any tab that was already open** (LinkedIn, WhatsApp, …) so the extension can attach to it.

After you change any file in the folder, click the **reload ↻** button on the extension's card in `chrome://extensions`, then refresh the website tab.

> Chrome may show a warning about the `debugger` permission. It is only used as a fallback to send real mouse/keyboard input to sites that ignore simulated clicks (see [Privacy](#privacy-permissions-and-security)).

---

## Quick start

1. Open a post with several images (for example on LinkedIn).
2. **Hover** over one of its images. Two buttons appear in the image's top-right corner.
3. Click **📄 Whole post**. The extension opens the image viewer, walks through every image and adds them to the basket. A toast in the bottom-right shows progress.
4. Click the toolbar icon → **Open basket & editor**.
5. Check the pages, adjust if you want (crop, look, order), then click **⬇ Download PDF**.

---

## Capturing images

### The hover buttons
Hover any image that is at least ~150 px large:

| Button | What it does |
|---|---|
| **＋ PDF** | Adds just this image to the basket. |
| **📄 Whole post** | Captures all images of the post/album the image belongs to. |

### The toolbar popup
Click the extension icon:

| Item | What it does |
|---|---|
| 📌 Capture whole post | Same as **Whole post** for the image you last hovered (or the image nearest the middle of the screen). |
| ▭ Drag-select images on page | Dims the page; drag a box — every image at least 30 % inside it is added (in reading order). `Esc` cancels. |
| 🖼 Add all large images on page | Adds every image ≥ 200 px on the page. Handy on gallery pages; it can also pick up ads, so review the basket. |
| 🗂 Open basket & editor | Opens the editor in a new tab. A badge shows how many images are in the basket. |
| 🔍 Inspect page (debug report) | Downloads a JSON description of the page structure (see [Debug tools](#debug-tools)). |

### Right-click menu
- **Add image to PDF basket** (on an image)
- **Capture all images of this post → PDF basket**
- **Drag-select images on this page**
- **Open PDF basket / editor**

### Keyboard shortcuts
| Shortcut | Action |
|---|---|
| `Alt+Shift+C` | Capture whole post (image under the mouse) |
| `Alt+Shift+S` | Drag-select mode |
| `Alt+Shift+E` | Open the editor / basket |

Change them at `chrome://extensions/shortcuts`.

### Other ways to add images
- In the editor: **＋ Add images** (file picker), **drag & drop** files onto the window, or **paste** (`Ctrl+V`) an image from the clipboard.

### What gets filtered automatically
- Images smaller than about **240 px** on the longest side or **80 px** on the shortest (icons, tracking pixels, ad banners).
- **Duplicates**: the same photo is detected even when a site serves it under different URLs (e.g. LinkedIn size variants, Telegram/Messenger `blob:` URLs). Only near-identical pictures are dropped — two different pages that share a layout are both kept.

---

## Site-by-site guide

> Websites change their markup often. If **Whole post** misses images on a site, use [Debug tools](#debug-tools) to see why.

### LinkedIn
- Open the **post itself** (click its date/text) or use the home feed, hover the image grid, click **📄 Whole post**.
- The extension clicks the first image, steps through the viewer with **Next**, and stops at the expected number (it reads the "+N" badge) or when it sees an image twice (wrap-around).
- To click reliably it falls back to **real browser-level input** through the `debugger` permission. Chrome then shows a *"…started debugging this browser"* bar for the few seconds of capture; it detaches automatically.
- A **row of separate posts** (e.g. your profile's Activity section) is not one post: the extension treats each item as its own post and tells you to open the post first.
- Feed images are low-res (`feedshare-shrink_480`); the extension asks for the large variant first and falls back to the original.

### Facebook, Messenger and Facebook chat (messages)
- Open a photo from the album/message, hover it, click **📄 Whole post**.
- If the viewer has a filmstrip ("View photo 1 … N"), the extension reads **all full-size photos straight from the filmstrip** — no clicking needed. Otherwise it steps with **Next**.
- Large photos are sent to the basket in small batches.

### WhatsApp Web
- Hover the photo you want to start from and click **📄 Whole post**.
- A prompt asks **how many photos** to capture, starting from that one (default 10). Leave it empty to capture to the end of the chat's media.
- Photos are taken at full size from the media viewer, not from the chat thumbnails.

### Telegram Web
- **Albums**: an album is one message; the extension reads **all photos of that message directly** (no viewer, can't wander into other messages). If photos haven't loaded yet it scrolls the album into view and waits (up to 10 s).
- **Single photo / non-album**: uses the viewer with a "how many photos" prompt (default 1).

### Instagram, X (Twitter), Pinterest and any other site
- **＋ PDF**, drag-select and "add all large images" work everywhere.
- X/Twitter and Pinterest image URLs are upgraded to their original size automatically.
- **Whole post** works on sites with a standard full-screen viewer that has a labelled **Next** button or responds to the right-arrow key.

---

## The editor

Open it from the toolbar popup or `Alt+Shift+E`. Layout:

```
┌────────────┬──────────────────────────────┬─────────────────────┐
│ Thumbnails │  Preview of the current page │  Enhancement + PDF  │
│ (reorder,  │  (rotate, crop, compare,     │  options + export   │
│  tick,     │   copy image, delete)        │  buttons            │
│  delete)   │                              │                     │
└────────────┴──────────────────────────────┴─────────────────────┘
```

### Top bar
| Button | What it does |
|---|---|
| ＋ Add images | Add local image files. |
| Select all / Select none | Tick or untick every page (ticked pages are the ones exported). |
| Delete selected | Remove ticked pages. |
| Clear basket | Remove everything. |
| Find blank pages | Ticks pages that look empty so you can delete them. |
| ✨ Auto-enhance all | Reset every page to the default auto settings. |
| 🕘 History | Re-download previous PDFs (last 12). |
| ⚙ Settings | Theme and Google Drive client ID. |

### Thumbnail list
- Click a page to open it. **Drag** thumbnails to reorder (the order is saved).
- The checkbox marks pages for export / deletion; **✕** removes a page.
- Thumbnails show the *processed* result, so you see crops and filters immediately.

### Stage toolbar
`◀ ▶` previous / next page · `⟲ ⟳` rotate · **✂ Crop / perspective** · **Reset page** · **👁 Hold: original** (press and hold to compare with the untouched image) · **⧉ Copy image** (copies the page as a PNG) · **🗑 Delete page**.

Keyboard: `↑ ↓ ← →` change page · `Delete` removes the current page.

### Page enhancement panel
Choose **This page** or **All pages** at the top; every change applies to that scope.

**Look**
| Look | Best for |
|---|---|
| **Original** | No colour processing. |
| **Enhanced colour** *(default)* | Gentle denoise, automatic levels (grey paper becomes white, ink stays dark), mild sharpen. |
| **Magic colour (shadow-free)** | Documents with uneven lighting or shadows — keeps colour. |
| **Scan B&W (documents)** | High-contrast black-and-white, like a scanner app. |
| **Grayscale** | Plain grey. |

**Options**
| Option | What it does |
|---|---|
| **Auto crop edges & fix perspective** *(default on)* | Detects a photographed page (tilted / in perspective) and flattens it; otherwise trims solid dark or coloured borders. It **never trims plain white margins**, so slide and diagram designs stay intact. |
| **Straighten tilted text (deskew)** | Corrects tilt up to ±10°. |
| **Remove shadows / even out light** | Evens out lighting (already built into *Magic* and *Scan*). |
| **HD upscale for low-resolution** *(default on)* | Edge-preserving denoise → enlarge to about 2400 px → deblur with a strength matched to the enlargement. Skipped for images that are already large. |
| **Brightness / Contrast** | Manual fine-tuning. |

> **About HD upscale.** It restores edge contrast and removes noise, which makes text and diagrams visibly clearer. It cannot invent detail that was never in the image — extremely small text may stay unreadable. It is a classic image-processing method, **not** an AI model.

### Manual crop
Click **✂ Crop / perspective**, drag the four corner handles to match the page edges, then **Apply crop**. **Auto-detect** returns to automatic detection, **Full image** removes cropping.

---

## Exporting

Exports the **ticked pages**, or **all pages if none are ticked**.

### PDF options
| Option | Choices |
|---|---|
| **File name** | Filled automatically from the post author and date (e.g. `Rahul-Yadav-2026-11-18`). Edit it freely. |
| **Page size** | A4 · Letter · Legal · Fit to image |
| **Orientation** | Auto (landscape for wide images) · Portrait · Landscape |
| **Margin** | None · Small (14 pt) · Medium (28 pt) · Large (48 pt) |
| **File size** | **High quality** (up to 3200 px, JPEG 92 %) · **Balanced** (2400 px, JPEG 85 %) · **Small** (1500 px, JPEG 60 %, for WhatsApp / e-mail) |
| **Make text searchable (OCR)** | Adds an invisible text layer so you can search and copy text. |
| **OCR language** | English · Bangla · English + Bangla · Hindi · Arabic · Spanish · French · German |
| **Page numbers** | "1 / N" at the bottom of each page. |
| **Watermark** | Diagonal text with adjustable opacity (5–60 %). |
| **Password** | Optional; the PDF asks for it to open (printing and copying stay allowed). |

Pages using the **Scan B&W** look are stored losslessly (PNG) unless you choose the *Small* preset.

### Export buttons
| Button | Result |
|---|---|
| **⬇ Download PDF** | The finished PDF (also saved to History). |
| **☁ Save to Google Drive** | Builds the PDF and uploads it to your Drive (needs [setup](#google-drive-setup)). |
| **ZIP · PNG / ZIP · JPG** | Every page as a numbered image (`page-001.png`, …) in one ZIP. |
| **📝 Export text (OCR .txt)** | Recognised text of all pages in one text file. |

A progress window shows each step and has a **Cancel** button.

### OCR notes
- The first run for a language downloads its small language data from a public CDN (jsDelivr) and your browser caches it afterwards. The OCR engine itself is bundled.
- Bangla text is embedded with a Noto Sans Bengali font. The layer is searchable, but copied Bangla text can come out with letters in a different order, because conjunct shaping isn't applied to hidden text.

---

## Settings and Google Drive

Open **⚙ Settings** in the editor.

- **Theme**: Match system · Light · Dark.
- **Google OAuth Client ID**: needed only for **Save to Google Drive**.

### Google Drive setup
1. In [Google Cloud Console](https://console.cloud.google.com/) create a project and **enable the Google Drive API**.
2. Create an **OAuth client ID** of type **Web application**.
3. Add the **redirect URI** shown in the extension's Settings dialog (it looks like `https://<extension-id>.chromiumapp.org/`).
4. Paste the client ID into Settings and **Save**.
5. Click **☁ Save to Google Drive**; sign in once. The extension only requests the `drive.file` scope (files it creates itself).

---

## Privacy, permissions and security

- **All processing is local**: cropping, enhancement, OCR and PDF creation run inside your browser. There is no server and no analytics.
- **Network use**: (1) fetching the images you asked to capture, (2) downloading OCR language data from a CDN on first use of a language, (3) Google Drive upload — only if you set it up and click the button.
- **Storage**: the basket and history live in your browser's IndexedDB; preferences in `chrome.storage`. Use **Clear basket** and the history ✕ to delete them.

| Permission | Why it is needed |
|---|---|
| `<all_urls>` (host access) | Run on any site and download image files (bypassing page CORS). |
| `activeTab`, `scripting` | Attach to tabs opened before the extension was installed. |
| `storage`, `unlimitedStorage` | Remember settings; keep the image basket and history. |
| `contextMenus` | The right-click entries. |
| `downloads` | Reserved for downloads. |
| `identity` | Google Drive sign-in (only used when you press the Drive button). |
| `debugger` | Fallback that sends **real** mouse/keyboard events to sites that ignore simulated clicks (LinkedIn, Messenger). Attached only during a capture and then detached. Chrome shows a banner while it is attached. |

---

## Troubleshooting

| Problem | What to try |
|---|---|
| Nothing happens / no hover buttons | Reload the extension and **refresh the website tab**. Hover buttons only appear on images ≥ 150 px. |
| **Whole post** captured fewer images than the post has | The site's viewer may use different markup. A `i2p-capture-log.json` is downloaded automatically when the count looks wrong — see [Debug tools](#debug-tools). |
| "Only N of ~M images captured: the image viewer was not detected" | Open the first image yourself so the viewer is showing, then click **Whole post** again. |
| "This image is in a row of separate posts" (LinkedIn) | Open the post itself first (click its date), then capture. |
| Images are blurry or tiny | Chat/feed thumbnails are low-res. Use **Whole post** (it opens the full-size viewer) and keep **HD upscale** on. |
| Telegram album: "Added 7 of 10" | Remaining photos hadn't loaded. Scroll that album into view for a moment and capture again; duplicates are skipped automatically. |
| A page was cropped too tightly / not at all | Use **✂ Crop / perspective**, or untick **Auto crop** for that page. |
| Text looks too sharp / too soft | Switch **Look** (Original → Enhanced → Magic), or untick **HD upscale** for that page. |
| PDF too large for sharing | Choose **File size → Small**. |
| OCR is slow on the first run | It is downloading language data once; later runs are faster. |
| Editor shows "Could not load image engine" | Reload the extension. Make sure `vendor/opencv.js` exists. |
| Chrome shows a "debugging this browser" bar | Expected while capturing on LinkedIn/Messenger; it disappears when the capture ends. |
| Duplicate images in the basket | Duplicates are filtered by picture content; if some remain, tick them and **Delete selected**. |

---

## Debug tools

- **🔍 Inspect page**: toolbar popup → *Inspect page*. Downloads `i2p-inspect-<site>.json` describing the page's images, nearby containers, buttons and full-screen overlays. For the most useful report, **open the image viewer first**, then click Inspect.
- **Capture log**: when a capture ends with fewer images than expected (or only one), `i2p-capture-log.json` is downloaded automatically. It records every step (what was clicked, whether a viewer opened, each *Next* step, the album match). Attach it when reporting a problem.
- Open DevTools (`F12`) → Console and filter for `[i2p]` to watch the capture live.

---

## How it works (architecture)

```
 Web page  ──►  content.js ──────────►  background.js (service worker)
 (hover bar,     │  finds images,         │  fetches image bytes (bypasses CORS),
  drag-select,   │  drives viewers,       │  drops icons / duplicates,
  viewer         │  reads albums          │  stores them in IndexedDB (the "basket"),
  stepping)      │                        │  debugger-based real input (fallback)
                 ▼                        ▼
            toast / log           IndexedDB  ◄──────  editor.html / editor.js
                                                       │ thumbnails, preview, panel
                                                       ├─► process.js ──postMessage──► cvsandbox.html (sandbox-cv.js)
                                                       │                                OpenCV.js: crop, perspective,
                                                       │                                deskew, shadows, filters, HD upscale
                                                       └─► export.js: jsPDF (PDF), Tesseract.js (OCR), JSZip (ZIP)
```

Key design points:
- **Manifest V3**, no build step, plain JavaScript.
- **OpenCV runs in a sandboxed page.** OpenCV.js needs `unsafe-eval`, which MV3 extension pages forbid, so it lives in `cvsandbox.html` (a manifest `sandbox` page) and exchanges pixel data with the editor through `postMessage`.
- **Viewer capture** is layered: (1) generic "full-screen overlay containing a big image" detection, (2) synthetic mouse/keyboard events, (3) real input via the `debugger` API, (4) reading image URLs from the page data, (5) the visible tiles. Each step stops on a repeated image, an expected count, or a hard limit.
- **Chat sites** use shortcuts when possible: Messenger's filmstrip and Telegram's album message already contain the full-size photos.
- **Crop detection** looks for a tilted/perspective quadrilateral, otherwise a solid dark/coloured margin; axis-aligned boxes and white margins are treated as part of the design and left alone.
- **De-duplication** uses the image ID for CDN URLs and a 48×48 grayscale fingerprint for everything else (flat/blank pictures are never compared).

---

## Project structure

```
manifest.json        Extension manifest (MV3), permissions, shortcuts, CSP
background.js        Service worker: context menu, shortcuts, fetching, basket, debugger input
content.js           Injected into every page: hover bar, drag-select, viewer capture, album reading, inspector
content.css          Styles for the hover bar, toast, drag-select overlay
popup.html / .js     Toolbar popup
editor.html / .js    The editor (basket, preview, panel, export)
editor.css           Editor layout / styling
theme.css            Light / dark theme variables
process.js           Editor-side client for the OpenCV sandbox
cvsandbox.html       Sandboxed page hosting OpenCV
sandbox-cv.js        Image pipeline: crop, perspective, deskew, shadows, filters, HD upscale
export.js            PDF building (jsPDF), OCR (Tesseract.js), text layer
db.js                IndexedDB helper (basket + history)
icons/               Toolbar / store icons
vendor/              Bundled libraries (see below)
```

---

## Development notes

- **No build step.** Edit the files, click **reload ↻** on the extension card, refresh the target tab.
- **Adding or fixing a site:** most site-specific behaviour lives in `runCaptureInner` in `content.js` (viewer detection, next/close buttons, album readers). Use **Inspect page** on the open viewer to see the real markup.
- **Syntax check:** `node --check content.js` (and the other `.js` files) before reloading.
- **Headless testing:** the editor, OCR and PDF export can be driven with `puppeteer-core` and a locally installed Chrome using `enableExtensions` (Chrome ≥ 137 ignores the old `--load-extension` flag).
- **Unused vendor files:** `vendor/tesseract-core/` only needs the three `*-lstm.wasm.js` files; the plain `.js` and `.wasm` files in that folder are unused and can be deleted to reduce the size.
- The extension has no automated test suite yet.

---

## Known limitations

- **Site markup changes.** LinkedIn, Facebook, WhatsApp and Telegram can change their pages at any time; capture is built from their current structure and may need adjusting. The debug tools exist for this.
- **Not an AI upscaler.** HD upscale improves clarity but cannot recover detail that isn't there.
- **Bangla copy-paste order** in OCR text can be off (search still works).
- **Video and GIF** items in albums/posts are skipped; only still images are captured.
- **Private or expiring image URLs** (some signed CDN links) may fail to download; the extension then falls back to the original size.
- **Telegram Web K** (the older web version) isn't covered by the direct album reader; only Telegram Web A's album markup has been checked.
- Capture on LinkedIn/Messenger shows Chrome's "debugging" banner briefly.

---

## Third-party libraries

Bundled locally in `vendor/` (nothing is loaded from a CDN at run time except OCR language data):

| Library | Used for | License |
|---|---|---|
| [OpenCV.js](https://docs.opencv.org/) | Crop, perspective, deskew, filters, upscaling | Apache-2.0 |
| [jsPDF](https://github.com/parallax/jsPDF) | Building PDFs (text layer, watermark, encryption) | MIT |
| [Tesseract.js](https://github.com/naptha/tesseract.js) + core | OCR | Apache-2.0 |
| [JSZip](https://stuk.github.io/jszip/) | ZIP export | MIT / GPL-3.0 (dual) |
| [Noto Sans Bengali](https://fonts.google.com/noto) | Embedding Bangla OCR text | SIL OFL 1.1 |

Add your own `LICENSE` file for this project's code before publishing it.

---

## Author

**Created and maintained by Tashrif Rashid Sourav**

| | |
|---|---|
| ✉️ Email | [tashrifrashid.sourav@gmail.com](mailto:tashrifrashid.sourav@gmail.com) |
| 💼 LinkedIn | [linkedin.com/in/tashrif-rashid-sourav](https://www.linkedin.com/in/tashrif-rashid-sourav/) |

Found a bug, a site that stopped working, or have an idea for a feature? Send an email and attach the `i2p-capture-log.json` or `i2p-inspect-<site>.json` file from the [debug tools](#debug-tools) if you have one.

© 2026 Tashrif Rashid Sourav. All rights reserved unless a `LICENSE` file says otherwise.
