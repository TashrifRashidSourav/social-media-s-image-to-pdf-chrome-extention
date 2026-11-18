#!/usr/bin/env node
/**
 * Builds the store upload package: dist/image-to-pdf-scanner-<version>.zip
 * Only files the extension needs at run time are included (no README, store assets, tools or dev files).
 *
 * Usage:  node tools/package.js
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const JSZip = require(path.join(root, 'vendor', 'jszip.min.js'));

const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const version = manifest.version;

// Files / folders that ship inside the extension.
const INCLUDE = [
  'manifest.json',
  'background.js', 'content.js', 'content.css',
  'popup.html', 'popup.js',
  'editor.html', 'editor.js', 'editor.css', 'theme.css',
  'process.js', 'cvsandbox.html', 'sandbox-cv.js',
  'export.js', 'db.js',
  'icons', 'vendor',
  'PRIVACY.md', 'THIRD_PARTY_NOTICES.md',
];

const zip = new JSZip();
let files = 0;
let bytes = 0;

function add(rel) {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) throw new Error('Missing: ' + rel);
  const st = fs.statSync(abs);
  if (st.isDirectory()) {
    for (const name of fs.readdirSync(abs).sort()) add(rel + '/' + name);
  } else {
    const data = fs.readFileSync(abs);
    zip.file(rel, data, { date: new Date(st.mtimeMs), compression: 'DEFLATE', compressionOptions: { level: 9 } });
    files++;
    bytes += data.length;
  }
}

// every file the manifest points at must exist
const referenced = [
  manifest.background && manifest.background.service_worker,
  manifest.action && manifest.action.default_popup,
  ...Object.values(manifest.icons || {}),
  ...Object.values((manifest.action && manifest.action.default_icon) || {}),
  ...(manifest.content_scripts || []).flatMap((c) => [...(c.js || []), ...(c.css || [])]),
  ...((manifest.sandbox && manifest.sandbox.pages) || []),
].filter(Boolean);
for (const r of referenced) {
  if (!fs.existsSync(path.join(root, r))) throw new Error('manifest references a missing file: ' + r);
}

INCLUDE.forEach(add);

// The Edge Add-ons validator rejects packages that contain archives inside the ZIP.
const ARCHIVE = /\.(gz|tgz|zip|rar|7z|tar|bz2|xz|lz|lzma|cab|jar)$/i;
const nested = Object.keys(zip.files).filter((n) => ARCHIVE.test(n));
if (nested.length) throw new Error('Package contains compressed archive files (the store will reject it): ' + nested.join(', '));

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const out = path.join(root, 'dist', 'image-to-pdf-scanner-' + version + '.zip');
zip.generateAsync({ type: 'nodebuffer', platform: 'UNIX' }).then((buf) => {
  fs.writeFileSync(out, buf);
  console.log('Created ' + path.relative(root, out));
  console.log('  ' + files + ' files, ' + (bytes / 1048576).toFixed(1) + ' MB uncompressed, ' + (buf.length / 1048576).toFixed(1) + ' MB zipped');
});
