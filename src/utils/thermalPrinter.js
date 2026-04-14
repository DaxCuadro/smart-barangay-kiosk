/**
 * Thermal printer utility for GOOJPRT PT-210 via RawBT.
 *
 * The PT-210 uses Classic Bluetooth (SPP) which is NOT supported by Web Bluetooth.
 * Instead, we print through the RawBT Android app which acts as a bridge:
 *   1. RawBT is installed on the Android kiosk device
 *   2. RawBT is paired with the PT-210 via Bluetooth
 *   3. We send print data via an Android intent URL
 *   4. RawBT receives the text and forwards it to the printer
 *
 * Setup: Install RawBT from Play Store, pair PT-210, enable "Auto print", set paper width to 58mm.
 */

const RAWBT_SCHEME = 'rawbt:';

function center(text, width) {
  if (text.length >= width) return text.slice(0, width);
  const pad = Math.floor((width - text.length) / 2);
  return ' '.repeat(pad) + text;
}

function buildReceiptText(info) {
  const {
    barangayName = 'Barangay',
    date,
    reference,
    referenceNumbers,
    queueNumber,
    residentName,
    document,
    documents,
    total,
    message,
  } = info;

  const W = 32; // 58 mm paper ≈ 32 chars
  const sep = '='.repeat(W);
  const thin = '-'.repeat(W);
  const lines = [];

  // Header
  lines.push(center(barangayName.toUpperCase(), W));
  lines.push(center('Document Request Receipt', W));
  lines.push(sep);

  // Date
  lines.push(`Date: ${date}`);

  // Handle multi-document or single document
  const docList = documents || (document ? [document] : []);
  const refList = referenceNumbers || (reference ? [reference] : []);

  if (refList.length === 1) {
    lines.push(`Ref:  ${refList[0]}`);
  }

  if (queueNumber) {
    lines.push('');
    lines.push(center(`QUEUE #${queueNumber}`, W));
    lines.push('');
  }

  lines.push(thin);

  // Resident details
  lines.push(`Name: ${residentName}`);

  if (docList.length <= 1) {
    lines.push(`Doc:  ${docList[0] || '—'}`);
  } else {
    lines.push('Documents:');
    docList.forEach((doc, idx) => {
      const refStr = refList[idx] ? ` [${refList[idx]}]` : '';
      lines.push(` ${idx + 1}. ${doc}${refStr}`);
    });
  }

  lines.push(thin);

  // Total price
  const label = 'Total:';
  const price = `P${Number(total || 0).toFixed(2)}`;
  const gap = W - label.length - price.length;
  lines.push(label + ' '.repeat(Math.max(1, gap)) + price);

  lines.push(sep);
  if (message) lines.push(center(message, W));
  lines.push(center('Thank you!', W));
  lines.push(sep);
  lines.push('');
  lines.push('');
  lines.push('');

  return lines.join('\n');
}

// --- Public API ---

/**
 * Send receipt to RawBT for printing on the PT-210.
 * RawBT must be installed and paired with the printer.
 * Returns 'printed' if sent, 'no-rawbt' on failure.
 */
export function printReceipt(receiptInfo) {
  const text = buildReceiptText(receiptInfo);
  const encoded = encodeURIComponent(text);

  try {
    window.location.href = RAWBT_SCHEME + encoded;
    return 'printed';
  } catch {
    return 'no-rawbt';
  }
}
