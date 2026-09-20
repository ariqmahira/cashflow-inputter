/**
 * The device side of scanning a receipt.
 *
 * Everything that only exists inside the Android shell is confined here, so the parsing in
 * `receipt.ts` stays plain functions over plain strings. Two Google ML Kit plugins do the
 * work: the document scanner supplies its own camera, edge detection and crop, and hands
 * back a deskewed JPEG — which the text recogniser reads far more reliably than a photo
 * taken freehand over a crumpled till roll.
 *
 * Both run on the device. That is the point: the rest of the app works with no connection,
 * and a scan button that needed a server would be the one thing that did not.
 */

import { Capacitor } from '@capacitor/core';
import type { TextBlock } from '@capacitor-mlkit/text-recognition';

// Both plugins are imported where they are used rather than at the top, so the web build —
// which can never call them — does not carry the ML Kit bindings at all. `auth-gate.tsx`
// keeps the deep-link listener out of the same bundle for the same reason.

/**
 * Whether scanning could work here at all.
 *
 * Cheap and synchronous, so the form can decide what to render without waiting. The document
 * scanner is Android-only, and the browser has no camera worth pointing at a receipt — on
 * the web the button simply never appears.
 */
export function scanSupported(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

/**
 * How long to wait for Play Services to fetch the scanner.
 *
 * Generous, because this is a background download on a phone that may be on mall wifi, and
 * nothing is blocked on it finishing. The timeout exists only so a stalled install resolves
 * to "unavailable" instead of leaving the promise — and the button's state — pending
 * forever.
 */
const INSTALL_TIMEOUT_MS = 90_000;

/**
 * Shared across callers, in the same spirit as the outbox's in-flight guard.
 *
 * This is asked for twice: once at app start to get the download out of the way, and again
 * when the expense form mounts and needs to know whether to show the button. Both must see
 * one install, and the second must not sit through a fresh round trip.
 */
let preparing: Promise<boolean> | null = null;

/**
 * Makes sure the scanner is ready, and says whether it is.
 *
 * The scanner UI and its models are not in the APK — Play Services downloads them on first
 * use. Left to happen lazily, the first tap would sit on a spinner or fail outright, so this
 * is called once at startup and the result decides whether the button is ever offered.
 *
 * Never throws. A device with no Play Services, or too little memory for ML Kit, is a device
 * that does not scan; that is a missing button, not an error.
 */
export function prepareScanner(): Promise<boolean> {
  preparing ??= runPrepare().catch(() => false);
  return preparing;
}

async function runPrepare(): Promise<boolean> {
  if (!scanSupported()) return false;

  const { DocumentScanner, GoogleDocumentScannerModuleInstallState } = await import(
    '@capacitor-mlkit/document-scanner'
  );

  const { available } = await DocumentScanner.isGoogleDocumentScannerModuleAvailable();
  if (available) return true;

  // `installGoogleDocumentScannerModule` only starts the download; completion arrives on the
  // progress listener, so the two have to be joined back together here.
  const installed = new Promise<boolean>((resolve) => {
    let handle: { remove: () => Promise<void> } | undefined;
    const finish = (ok: boolean) => {
      void handle?.remove();
      clearTimeout(timer);
      resolve(ok);
    };
    const timer = setTimeout(() => finish(false), INSTALL_TIMEOUT_MS);

    void DocumentScanner.addListener('googleDocumentScannerModuleInstallProgress', (event) => {
      if (event.state === GoogleDocumentScannerModuleInstallState.COMPLETED) finish(true);
      if (
        event.state === GoogleDocumentScannerModuleInstallState.FAILED ||
        event.state === GoogleDocumentScannerModuleInstallState.CANCELED
      ) {
        finish(false);
      }
    }).then((h) => {
      handle = h;
    });
  });

  await DocumentScanner.installGoogleDocumentScannerModule();
  return installed;
}

/**
 * Scans one receipt and returns its text, top line first.
 *
 * Throws if the user cancels or the scan fails; the caller decides what to say about it.
 *
 * The image is never kept. It exists for as long as it takes to read, and the URI is dropped
 * on the way out — there is nowhere in the schema to put a receipt photo, and adding one is
 * a different feature.
 */
export async function scanReceipt(): Promise<string[]> {
  const [{ DocumentScanner }, { TextRecognition }] = await Promise.all([
    import('@capacitor-mlkit/document-scanner'),
    import('@capacitor-mlkit/text-recognition'),
  ]);

  const { scannedImages } = await DocumentScanner.scanDocument({
    resultFormats: 'JPEG',
    galleryImportAllowed: true,
    pageLimit: 1,
  });

  const path = scannedImages?.[0];
  if (!path) throw new Error('No page was scanned.');

  const { blocks } = await TextRecognition.processImage({ path });
  return orderedLines(blocks);
}

/**
 * Flattens the recognised blocks into reading order.
 *
 * ML Kit groups text into blocks and returns them in its own order, which on a two-column
 * receipt can put the whole right-hand column of figures after the whole left-hand column of
 * labels. Sorting every line by its vertical position puts each label back beside its amount,
 * which is what the total-line matching depends on.
 *
 * Bounding boxes are optional in the plugin's types; without them the original order is the
 * best available answer.
 */
function orderedLines(blocks: TextBlock[]): string[] {
  const lines = blocks.flatMap((block) => block.lines);
  return lines
    .map((line, index) => ({ line, index }))
    .sort((a, b) => {
      const top = (a.line.boundingBox?.top ?? 0) - (b.line.boundingBox?.top ?? 0);
      return top !== 0 ? top : a.index - b.index;
    })
    .map(({ line }) => line.text);
}
