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

const RAWBT_INTENT = 'intent:print?text=';
const RAWBT_SUFFIX = '#Intent;scheme=rawbt;package=ru.a402.rawbtprinter;end;';

function center(text, width) {
  if (text.length >= width) return text.slice(0, width);
  const pad = Math.floor((width - text.length) / 2);
  return ' '.repeat(pad) + text;
}

function priceLine(label, value, width) {
  const price = `P${Number(value).toFixed(2)}`;
  const gap = width - label.length - price.length;
  return label + ' '.repeat(Math.max(1, gap)) + price;
}

function buildReceiptText(info) {
  const {
    barangayName = 'Barangay',
    date,
    reference,
    queueNumber,
    residentName,
    document,
    purpose,
    documentFee,
    serviceFee,
    smsFee,
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

  // Date & reference
  lines.push(`Date: ${date}`);
  lines.push(`Ref:  ${reference}`);

  if (queueNumber) {
    lines.push('');
    lines.push(center(`QUEUE #${queueNumber}`, W));
    lines.push('');
  }

  lines.push(thin);

  // Resident details
  lines.push(`Name: ${residentName}`);
  lines.push(`Doc:  ${document}`);

  const purposePrefix = 'Purpose: ';
  const purposeText = purposePrefix + purpose;
  if (purposeText.length <= W) {
    lines.push(purposeText);
  } else {
    lines.push(purposePrefix);
    const words = purpose.split(' ');
    let cur = ' ';
    for (const w of words) {
      if (cur.length + w.length + 1 > W) {
        lines.push(cur);
        cur = ' ' + w;
      } else {
        cur += (cur.trim() ? ' ' : '') + w;
      }
    }
    if (cur.trim()) lines.push(cur);
  }

  lines.push(thin);

  // Pricing
  if (documentFee !== null && documentFee !== undefined) {
    lines.push(priceLine('Document Fee:', documentFee, W));
    lines.push(priceLine('Service Fee:', serviceFee, W));
    lines.push(priceLine('SMS Fee:', smsFee, W));
    lines.push(thin);
    lines.push(priceLine('TOTAL:', total, W));
  }

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
 * Returns 'printed' on success attempt, 'no-rawbt' if intent fails.
 */
export function printReceipt(receiptInfo) {
  const text = buildReceiptText(receiptInfo);
  const encoded = encodeURIComponent(text);
  const intentUrl = RAWBT_INTENT + encoded + RAWBT_SUFFIX;

  try {
    window.location.href = intentUrl;
    return 'printed';
  } catch {
    return 'no-rawbt';
  }
}
