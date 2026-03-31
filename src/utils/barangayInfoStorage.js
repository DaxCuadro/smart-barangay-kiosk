export const BARANGAY_INFO_STORAGE_KEY = 'sbk-barangay-info-v1';

function readBarangayInfo() {
  if (typeof window === 'undefined') return {};
  try {
    const stored = window.localStorage.getItem(BARANGAY_INFO_STORAGE_KEY);
    if (!stored) return {};
    return JSON.parse(stored) || {};
  } catch {
    return {};
  }
}

function writeBarangayInfo(payload) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(BARANGAY_INFO_STORAGE_KEY, JSON.stringify(payload));
}

export function getBarangayZonesCount() {
  const stored = readBarangayInfo();
  return Number(stored?.zonesCount) || 1;
}

export function getSelectedBarangayId() {
  const stored = readBarangayInfo();
  return stored?.barangayId || '';
}

export function getSelectedBarangayName() {
  const stored = readBarangayInfo();
  return stored?.barangayName || '';
}

export function setBarangayInfo({ barangayId, barangayName, zonesCount }) {
  const stored = readBarangayInfo();
  writeBarangayInfo({
    ...stored,
    ...(barangayId !== undefined ? { barangayId } : {}),
    ...(barangayName !== undefined ? { barangayName } : {}),
    ...(zonesCount !== undefined ? { zonesCount } : {}),
  });
}

export function clearBarangayInfo() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(BARANGAY_INFO_STORAGE_KEY);
}
