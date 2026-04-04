/**
 * Bluetooth thermal printer utility for GOOJPRT PT-210.
 * Uses the Web Bluetooth API to discover, connect, and print ESC/POS receipts.
 */

const KNOWN_PRINTER_SERVICES = [
  '000018f0-0000-1000-8000-00805f9b34fb',
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
  '49535343-fe7d-4ae5-8fa9-9fafd205e455',
];

const KNOWN_WRITE_CHARACTERISTICS = [
  '00002af1-0000-1000-8000-00805f9b34fb',
  'bef8d6c9-9c21-4c9e-b632-bd58c1009f9f',
  '49535343-8841-43f4-a8d4-ecbe34729bb3',
];

let cachedDevice = null;
let cachedCharacteristic = null;
let disconnectListeners = [];

// --- ESC/POS command bytes ---
const ESC = 0x1b;
const GS = 0x1d;
const INIT = [ESC, 0x40];
const ALIGN_CENTER = [ESC, 0x61, 0x01];
const ALIGN_LEFT = [ESC, 0x61, 0x00];
const BOLD_ON = [ESC, 0x45, 0x01];
const BOLD_OFF = [ESC, 0x45, 0x00];
const DOUBLE_SIZE = [GS, 0x21, 0x11];
const NORMAL_SIZE = [GS, 0x21, 0x00];
const LF = [0x0a];
const FEED_CUT = [ESC, 0x64, 0x05, GS, 0x56, 0x00];

function textToBytes(text) {
  return Array.from(new TextEncoder().encode(text));
}

function buildReceiptBytes(info) {
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

  const buf = [];
  const push = (...arrays) => arrays.forEach(a => buf.push(...a));
  const line = (str) => push(textToBytes(str), LF);

  push(INIT);

  // Header
  push(ALIGN_CENTER, BOLD_ON, DOUBLE_SIZE);
  line(barangayName.length > 16 ? barangayName.slice(0, 16) : barangayName);
  push(NORMAL_SIZE);
  line('Document Request Receipt');
  push(BOLD_OFF);
  line(sep);
  push(ALIGN_LEFT);

  // Date & reference
  line(`Date: ${date}`);
  push(BOLD_ON);
  line(`Ref: ${reference}`);
  push(BOLD_OFF);

  if (queueNumber) {
    push(ALIGN_CENTER, BOLD_ON, DOUBLE_SIZE);
    line(`Queue #${queueNumber}`);
    push(NORMAL_SIZE, BOLD_OFF, ALIGN_LEFT);
  }

  line(thin);

  // Resident details
  line(`Name: ${residentName}`);
  line(`Document: ${document}`);
  // Wrap purpose if needed
  const purposePrefix = 'Purpose: ';
  const purposeText = purposePrefix + purpose;
  if (purposeText.length <= W) {
    line(purposeText);
  } else {
    line(purposePrefix);
    const words = purpose.split(' ');
    let cur = ' ';
    for (const w of words) {
      if (cur.length + w.length + 1 > W) {
        line(cur);
        cur = ' ' + w;
      } else {
        cur += (cur.trim() ? ' ' : '') + w;
      }
    }
    if (cur.trim()) line(cur);
  }

  line(thin);

  // Pricing
  if (documentFee !== null && documentFee !== undefined) {
    const fmtLine = (label, val) => {
      const price = `P${Number(val).toFixed(2)}`;
      const gap = W - label.length - price.length;
      return label + ' '.repeat(Math.max(1, gap)) + price;
    };
    line(fmtLine('Document Fee:', documentFee));
    line(fmtLine('Service Fee:', serviceFee));
    line(fmtLine('SMS Fee:', smsFee));
    line(thin);
    push(BOLD_ON);
    line(fmtLine('TOTAL:', total));
    push(BOLD_OFF);
  }

  line(sep);
  push(ALIGN_CENTER);
  if (message) line(message);
  line('Thank you!');
  line(sep);
  push(ALIGN_LEFT);

  push(FEED_CUT);

  return new Uint8Array(buf);
}

// --- Public API ---

export function isPrinterSupported() {
  return typeof navigator !== 'undefined' && !!navigator.bluetooth;
}

export function isPrinterConnected() {
  return !!(cachedDevice?.gatt?.connected && cachedCharacteristic);
}

export function getPrinterName() {
  return cachedDevice?.name || null;
}

export function onPrinterDisconnect(fn) {
  disconnectListeners.push(fn);
  return () => {
    disconnectListeners = disconnectListeners.filter(l => l !== fn);
  };
}

function notifyDisconnect() {
  disconnectListeners.forEach(fn => {
    try { fn(); } catch { /* ignore */ }
  });
}

export async function connectPrinter() {
  if (!isPrinterSupported()) {
    throw new Error('Web Bluetooth is not supported in this browser.');
  }

  const device = await navigator.bluetooth.requestDevice({
    filters: [
      { namePrefix: 'PT-210' },
      { namePrefix: 'GOOJPRT' },
      { namePrefix: 'Gprinter' },
      { namePrefix: 'BlueTooth Printer' },
    ],
    optionalServices: KNOWN_PRINTER_SERVICES,
  });

  device.addEventListener('gattserverdisconnected', () => {
    cachedCharacteristic = null;
    notifyDisconnect();
  });

  const server = await device.gatt.connect();
  cachedDevice = device;

  for (const svcUuid of KNOWN_PRINTER_SERVICES) {
    try {
      const service = await server.getPrimaryService(svcUuid);
      const chars = await service.getCharacteristics();
      // Try known UUIDs first
      for (const charUuid of KNOWN_WRITE_CHARACTERISTICS) {
        const match = chars.find(c => c.uuid === charUuid);
        if (match && (match.properties.write || match.properties.writeWithoutResponse)) {
          cachedCharacteristic = match;
          return { name: device.name || 'Thermal Printer', connected: true };
        }
      }
      // Fallback: use any writable characteristic
      const writable = chars.find(c => c.properties.write || c.properties.writeWithoutResponse);
      if (writable) {
        cachedCharacteristic = writable;
        return { name: device.name || 'Thermal Printer', connected: true };
      }
    } catch {
      // service not found on device, try next
    }
  }

  throw new Error('No writable print characteristic found on the device.');
}

export async function disconnectPrinter() {
  if (cachedDevice?.gatt?.connected) {
    cachedDevice.gatt.disconnect();
  }
  cachedDevice = null;
  cachedCharacteristic = null;
}

async function writeChunked(data) {
  if (!cachedCharacteristic) throw new Error('Printer not connected.');
  const CHUNK = 100;
  for (let i = 0; i < data.length; i += CHUNK) {
    const slice = data.slice(i, i + CHUNK);
    if (cachedCharacteristic.properties.writeWithoutResponse) {
      await cachedCharacteristic.writeValueWithoutResponse(slice);
    } else {
      await cachedCharacteristic.writeValue(slice);
    }
    if (i + CHUNK < data.length) {
      await new Promise(r => setTimeout(r, 20));
    }
  }
}

export async function printReceipt(receiptInfo) {
  if (!isPrinterConnected()) {
    throw new Error('Printer is not connected.');
  }
  const data = buildReceiptBytes(receiptInfo);
  await writeChunked(data);
  return true;
}
