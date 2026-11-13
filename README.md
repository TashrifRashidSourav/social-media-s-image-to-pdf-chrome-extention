# Image to PDF Scanner (Chrome extension)

Capture all images of a LinkedIn / Facebook (or any) post, clean them up like CamScanner, export a page-by-page PDF.

## Install
1. Open `chrome://extensions`, turn on **Developer mode**.
2. **Load unpacked** → choose this folder.
3. Pin the extension. Reload any LinkedIn/Facebook tab that was already open.

## Use
- Hover an image → **＋ PDF** (one image) or **📄 Whole post** (steps through the post's viewer and grabs every image, e.g. the “+16”).
- Toolbar icon → capture post, drag-select, add all large images, open basket, or **Inspect page** (writes a JSON report of the page structure; send it to fix selectors if a site changes).
- Shortcuts: `Alt+Shift+C` capture post · `Alt+Shift+S` drag-select · `Alt+Shift+E` editor (change at `chrome://extensions/shortcuts`).
- The **basket** keeps images across posts/sites. Open it in the editor to reorder, crop, enhance, then export.

## Editor features
Auto crop + perspective fix, manual crop, deskew, shadow removal, filters (enhanced / magic / scan B&W / grayscale), brightness/contrast,
smart upscale (Lanczos + sharpen – not a neural upscaler), rotate, blank-page finder, drag-reorder, page size/orientation/margin,
file-size presets, OCR searchable text (English, Bangla, …), watermark, page numbers, password, ZIP of PNG/JPG, Google Drive upload,
export history, dark mode, drop/paste local images.

## Google Drive (optional)
Settings → paste an OAuth **Web application** client ID (Drive API enabled) and add the redirect URI shown there.

## Notes
- Everything runs locally. OCR language data (other than bundled engine) is downloaded once from a CDN and cached.
- `vendor/tesseract-core/` only needs the three `*-lstm.wasm.js` files; the other `.js`/`.wasm` files in that folder are unused and can be deleted.
