# Third-Party Notices

Image to PDF Scanner bundles the open-source software below. It is included unmodified, in the `vendor/` folder, and runs locally in your browser. Full licence texts are in `vendor/licenses/`.

| Component | Version | Used for | Licence | Licence file |
|---|---|---|---|---|
| [OpenCV.js](https://opencv.org/) (build from `@techstark/opencv-js`) | 5.0.0-release.1 | Image processing: crop, perspective, deskew, filters, upscaling | Apache License 2.0 | `vendor/licenses/opencv-js-LICENSE.txt` |
| [jsPDF](https://github.com/parallax/jsPDF) | 4.2.1 | Creating PDF files (text layer, watermark, encryption) | MIT | `vendor/licenses/jspdf-LICENSE.txt` |
| [Tesseract.js](https://github.com/naptha/tesseract.js) | 7.0.0 | OCR (text recognition) engine wrapper | Apache License 2.0 | `vendor/licenses/tesseract.js-LICENSE.txt` |
| [Tesseract.js Core](https://github.com/naptha/tesseract.js-core) (Tesseract OCR compiled to WebAssembly) | 7.0.0 | OCR engine | Apache License 2.0 | `vendor/licenses/tesseract.js-core-LICENSE.txt` |
| [tessdata_best](https://github.com/tesseract-ocr/tessdata_best) language data (via `@tesseract.js-data/*`) | 4.0.0 (best, integer) | OCR language models: English, Bangla, Hindi, Arabic, Spanish, French, German | Apache License 2.0 | — (see the Tesseract repository) |
| [JSZip](https://stuk.github.io/jszip/) | 3.10.2 | Creating ZIP files | MIT (used under the MIT option of its "MIT OR GPL-3.0-or-later" dual licence) | `vendor/licenses/jszip-LICENSE.txt` |
| [Noto Sans Bengali](https://github.com/notofonts/bengali) | Regular | Embedding Bangla text in the OCR layer of PDFs | SIL Open Font License 1.1 | `vendor/licenses/NotoSansBengali-OFL.txt` |

## Notes

- The Apache-2.0 components (OpenCV.js, Tesseract.js, Tesseract.js Core, tessdata_best) are redistributed without modification. Their licence texts and copyright notices are retained.
- The MIT and OFL components are likewise redistributed without modification, with their licence texts retained.
- "Tesseract", "OpenCV" and the other names above belong to their respective owners and are used only to identify the software.
- This extension is an independent project and is not affiliated with, endorsed by, or sponsored by LinkedIn, Meta (Facebook, Messenger), WhatsApp, Telegram or Microsoft.
