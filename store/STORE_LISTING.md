# Microsoft Edge Add-ons — submission guide

Everything you need to paste into the **Partner Center → Edge Add-ons → New extension** form.
Upload the package built by `node tools/package.js` → `dist/image-to-pdf-scanner-1.0.0.zip`.

---

## 1. Package

| Field | Value |
|---|---|
| File to upload | `dist/image-to-pdf-scanner-1.0.0.zip` (≈ 19 MB; 36 MB unpacked) |
| Version | 1.0.0 (from `manifest.json`) |
| Manifest | V3 |

Rebuild after any change: `node tools/package.js`.

---

## 2. Store listing (English)

**Name**
```
Image to PDF Scanner
```

**Short description** (≤ 132 characters — this is also the manifest description)
```
Turn images from posts, chats and web pages into a clean, page-by-page PDF. Auto-crop, enhance and OCR, all offline.
```

**Category:** Productivity

**Search terms** (up to 7)
```
image to pdf
pdf maker
document scanner
ocr
save post images
photo to pdf
batch images to pdf
```

**Detailed description**
```
Image to PDF Scanner turns the images you see online into a clean, page-by-page PDF — in one click, and fully offline.

Found a post, album or chat with lots of important images? Instead of saving them one by one to your phone, hover over an image and click "Whole post". The extension collects every image of the post for you, lets you tidy them up, and exports a single PDF.

WHAT IT DOES
• One-click capture of all images in a multi-image post or album (supported: LinkedIn, Facebook / Messenger, WhatsApp Web, Telegram Web) — plus single images, drag-select and "all large images" on any web page.
• A basket that remembers your images across posts and sites, so you can combine them into one PDF.
• Scanner-style clean-up: automatic crop and perspective correction, straightening, shadow removal, brightness/contrast, and four looks (Enhanced colour, Magic colour, Scan B&W, Grayscale).
• HD upscale for low-resolution images: removes noise, enlarges and sharpens so text and diagrams look clearer.
• Make PDFs searchable with built-in OCR — English, Bangla, Hindi, Arabic, Spanish, French and German, all bundled.
• Export a PDF (A4 / Letter / Legal / fit-to-image, margins, three file-size presets, watermark, page numbers, password) or a ZIP of images, or just the recognised text.
• Reorder pages by drag and drop, rotate, crop manually, find blank pages, compare before/after.
• Automatic duplicate and icon/ad filtering.
• Light and dark theme.

PRIVATE BY DESIGN
Everything runs inside your browser. There is no account, no server, no analytics, and no network traffic of its own. Your images never leave your computer. The OCR engine, languages and image-processing engine are all included in the extension.

HOW TO USE
1. Hover over an image in a post and click "Whole post" (or "+ PDF" for one image).
2. Click the toolbar icon → "Open basket & editor".
3. Adjust the pages if you like, then click "Download PDF".

Keyboard shortcuts: Alt+Shift+C (capture post), Alt+Shift+S (drag-select), Alt+Shift+E (open editor).

NOTES
• Some sites open their photo viewer only for real clicks. For those (e.g. LinkedIn, Messenger) there is an optional "Compatibility mode" in Settings. It is off by default and asks for an extra permission only if you turn it on.
• Websites change their pages from time to time; capture on a given site may occasionally need an update.

Not affiliated with, endorsed by, or sponsored by LinkedIn, Meta (Facebook, Messenger), WhatsApp, Telegram or Microsoft. Their names are used only to describe which websites the extension can read images from. All trademarks belong to their owners.
```

**What's new (version notes)**
```
First release.
```

---

## 3. Links

| Field | Value |
|---|---|
| Privacy policy URL | Host `PRIVACY.md` somewhere public (for example the GitHub file URL `https://github.com/<your-user>/<your-repo>/blob/main/PRIVACY.md`, or GitHub Pages) and paste the link. **A public URL is required.** |
| Website | Your GitHub repository URL (optional) |
| Support / contact email | tashrifrashid.sourav@gmail.com |

---

## 4. Single purpose statement

```
Collect the images from a web page or post that the user chooses, clean them up like a document scanner, and export them as a PDF (or ZIP / text).
```

---

## 5. Permission justifications

Paste these where the form asks "why does the extension need this permission?".

| Permission | Justification |
|---|---|
| **Host access: all sites** (`<all_urls>`) | The extension's single purpose is to capture images from whichever web page the user is viewing, so it cannot know the sites in advance. Host access is needed to (a) show the capture buttons next to images on the pages the user browses, and (b) download the image files the user selects (image servers/CDNs differ for every site and block cross-origin reads from page scripts). Nothing is sent to any server; downloaded images are stored locally in the user's browser. |
| `scripting` | To attach the capture helper to tabs that were already open when the extension was installed or updated, so it works without the user having to refresh every tab. |
| `storage` | To remember the user's settings (theme, export options). |
| `contextMenus` | To provide the right-click entries "Add image to PDF basket", "Capture all images of this post" and "Drag-select images". |
| `debugger` — **optional permission** | Not granted at install. It is requested only if the user switches on **Settings → Compatibility mode**. Some sites (e.g. LinkedIn, Messenger) ignore script-generated clicks, so their photo viewer cannot be opened by the extension. When the user enables the mode, the extension uses the debugging interface solely to send a real mouse click / key press to open and step through the viewer while a capture is running, then detaches. It never reads page data, network traffic or cookies through the debugger. The user can remove the permission at any time by turning the mode off. |

**Remote code:** No. All JavaScript, WebAssembly, OCR language data and fonts are packaged inside the extension. The extension does not download or execute remote code.

**Data collection / usage:** The extension does **not** collect, transmit or sell user data. (Tick "I do not collect user data" / answer "No" to every data-collection category.)

---

## 6. Notes for certification (reviewers)

Paste into **Notes for certification**:

```
No account or sign-in is required. All features work offline.

To test:
1. Open any web page that shows several images (for example a news article or a Wikipedia article with a gallery).
2. Hover over a large image. Two blue buttons ("+ PDF" and "Whole post") appear at its top-right corner. Click "+ PDF".
3. Click the extension's toolbar icon, then "Open basket & editor". The image appears as page 1.
4. Repeat for 2–3 more images (or use the toolbar popup → "Add all large images on page").
5. In the editor you can drag thumbnails to reorder, change the "Look" and options on the right, then click "Download PDF". Tick "Make text searchable (OCR)" to test OCR (works offline).

Social-media "Whole post" capture requires being signed in to those sites, so it cannot be demonstrated without accounts. It opens the site's own photo viewer and steps through it.

Technical notes:
• The image-processing engine (OpenCV.js WebAssembly build, bundled in vendor/opencv.js) uses new Function internally. It therefore runs inside a manifest "sandbox" page (cvsandbox.html) that has no access to extension APIs; extension pages themselves use the default strict CSP with only 'wasm-unsafe-eval'.
• The "debugger" permission is optional and requested at runtime only when the user turns on Compatibility mode in Settings.
• Third-party licences are in THIRD_PARTY_NOTICES.md and vendor/licenses/.
```

---

## 7. Graphics

All files are in this folder (`store/`).

| Edge field | File | Size |
|---|---|---|
| Extension logo | `store-logo-300x300.png` | 300 × 300 |
| Screenshot 1 | `screenshot-1-editor.png` — the editor: a crooked photo flattened and cleaned automatically | 1280 × 800 |
| Screenshot 2 | `screenshot-2-export.png` — PDF and export options | 1280 × 800 |
| Screenshot 3 | `screenshot-3-before-after.png` — before / after | 1280 × 800 |
| Screenshot 4 | `screenshot-4-capture.png` — hover buttons on a multi-image post | 1280 × 800 |
| Screenshot 5 | `screenshot-5-popup.png` — the toolbar popup | 1280 × 800 |
| Small promotional tile (optional) | `promo-small-440x280.png` | 440 × 280 |
| Large promotional tile (optional) | `promo-large-1400x560.png` | 1400 × 560 |

The screenshots show the real extension running on sample pages created for the screenshots (no real people's content, no third-party brand pages).

---

## 8. Pre-submission checklist

- [ ] Public **privacy policy URL** is live (host `PRIVACY.md`).
- [x] `LICENSE` file added (all rights reserved, source viewable).
- [ ] Install the **unzipped package** once in Edge (`edge://extensions` → Developer mode → Load unpacked) and try: hover button, drag-select, editor, PDF download.
- [ ] Reload and confirm the toolbar icon shows your logo.
- [ ] Upload `dist/image-to-pdf-scanner-1.0.0.zip`.
- [ ] Fill in the listing text above, upload the graphics, paste the permission justifications and certification notes.
- [ ] Choose markets and visibility (public / hidden / private), then submit.

**Version updates:** raise `version` in `manifest.json`, run `node tools/package.js`, upload the new ZIP, and describe the changes in "What's new".
