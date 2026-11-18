# Privacy Policy — Image to PDF Scanner

_Last updated: 19 November 2026_

**Image to PDF Scanner** ("the extension") is built by **Tashrif Rashid Sourav** ("I", "me"). This policy explains what the extension does with your data. The short version: **it collects nothing, sends nothing anywhere, and keeps everything on your own computer.**

## 1. What the extension does

It lets you pick images on web pages you are viewing (posts, chats, galleries), collects them in a local "basket", cleans them up, and exports them as a PDF, a ZIP of images, or a text file.

## 2. Data I collect

**None.** The extension has no server, no account system, no analytics, no advertising and no telemetry. I never receive any information about you, your browsing, or your images.

## 3. Data processed on your device

To work, the extension handles the following **only inside your browser**:

| Data | Why | Where it is kept |
|---|---|---|
| **Images you choose to capture** (and the PDF/ZIP/text you create from them) | To build the basket, edit pages and export files | Your browser's local IndexedDB storage, until you press **Clear basket** or delete a history entry |
| **Text recognised by OCR** | To make a PDF searchable or to export a `.txt` file | In memory while exporting; only inside the files you download |
| **Basic page information** (the site name, post author name and the page title visible on screen) | To name your exported file automatically (e.g. `Author-2026-11-19.pdf`) | Stored with the captured image in local storage |
| **Your settings** (theme, export options, optional modes) | To remember your choices | `chrome.storage` in your browser |

A small helper script runs on the pages you visit so it can show its capture buttons when you hover over an image. That check happens entirely on your device: nothing about the pages you visit is recorded, stored or sent anywhere. The extension reads an image's address and the author name shown near it **only when you use it** — when you click one of its buttons, use its shortcut or context-menu entry. It does not read, record or transmit your browsing history, passwords, messages or form data.

## 4. Network activity

- The extension **downloads the image files you ask it to capture**, from the website you are on, so they can be stored in your basket. Those requests go to that website's own servers (the same ones your browser already contacts to display the images).
- **Nothing is uploaded.** The extension never sends your images, text or settings to me or to any third party.
- All code, the OCR engine and the OCR language data are **bundled inside the extension**. It does not download or run remote code and does not contact any CDN.

## 5. Permissions

| Permission | Purpose |
|---|---|
| Access to all sites | Show the capture buttons on the pages you browse and fetch the image files you select. Used only for the actions you trigger. |
| `scripting` | Attach the capture helper to tabs that were already open when the extension was installed or updated. |
| `storage` | Save your settings. |
| `contextMenus` | Provide the right-click entries. |
| `debugger` — **optional, off by default** | Only if you turn on **Compatibility mode** in Settings: lets the extension send real mouse/keyboard input to websites that ignore simulated clicks. It is used only while a capture is running, never to read page data, and you can remove it at any time (Settings → turn the mode off). |

## 6. Third parties

I do not share data with anyone, because I do not have any. The extension bundles open-source libraries (listed in `THIRD_PARTY_NOTICES.md`) that run locally and do not communicate with their authors.

## 7. Children

The extension is a general-purpose tool and is not directed at children. It collects no personal information from anyone.

## 8. Your control

- Remove images at any time with **Clear basket**, the ✕ on a page, or the ✕ on a history entry.
- Uninstalling the extension deletes all of its stored data from your browser.

## 9. Changes

If this policy ever changes, the new version will be published with the extension and the "Last updated" date will change. Because the extension collects no data, I do not expect material changes.

## 10. Contact

Tashrif Rashid Sourav — [tashrifrashid.sourav@gmail.com](mailto:tashrifrashid.sourav@gmail.com)

---

_Image to PDF Scanner is an independent project. It is not affiliated with, endorsed by, or sponsored by LinkedIn, Meta (Facebook, Messenger), WhatsApp, Telegram or Microsoft. Their names are used only to describe which websites the extension can read images from._
