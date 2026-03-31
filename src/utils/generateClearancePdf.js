import { jsPDF } from 'jspdf';

/**
 * Compute age from birthday string.
 */
function computeAge(birthday) {
  if (!birthday) return '';
  const birth = new Date(birthday);
  if (Number.isNaN(birth.getTime())) return '';
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) {
    age--;
  }
  return `${age} y/o`;
}

/**
 * Format birthday for display: "DECEMBER 17 1999"
 */
function formatBirthday(birthday) {
  if (!birthday) return '';
  const d = new Date(birthday);
  if (Number.isNaN(d.getTime())) return '';
  const months = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
    'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
  return `${months[d.getMonth()]} ${d.getDate()} ${d.getFullYear()}`;
}

/**
 * Format issue date: "19th day of MARCH, 2025"
 */
function formatIssueDate(date) {
  const d = date ? new Date(date) : new Date();
  const day = d.getDate();
  const suffix = (day === 1 || day === 21 || day === 31) ? 'st'
    : (day === 2 || day === 22) ? 'nd'
      : (day === 3 || day === 23) ? 'rd' : 'th';
  const months = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
    'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
  return `${day}${suffix} day of ${months[d.getMonth()]}, ${d.getFullYear()}`;
}

/**
 * Load image as base64 data URL for jsPDF.
 * Returns null if the URL is empty or fails to load.
 */
async function loadImageAsDataUrl(url) {
  if (!url) return null;
  try {
    const response = await fetch(url, { mode: 'cors' });
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/**
 * Draw left-side officials sidebar.
 *  officials: { punong: [{ name, alternateTitle }], kagawad: [...], sk: [...], treasurer: [...], secretary: [...] }
 */
function drawOfficialsSidebar(doc, officials, startY) {
  const x = 10;
  let y = startY;
  const sideWidth = 48;

  doc.setFont('helvetica', 'normal');

  // Punong Barangay
  const punong = officials?.punong?.[0];
  if (punong) {
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.text(punong.name.toUpperCase(), x + sideWidth / 2, y, { align: 'center' });
    y += 3;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.text('Punong Barangay', x + sideWidth / 2, y, { align: 'center' });
    y += 5;
  }

  // KAGAWAD header
  const kagawads = officials?.kagawad || [];
  if (kagawads.length) {
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.text('KAGAWAD', x + sideWidth / 2, y, { align: 'center' });
    y += 4;

    doc.setFontSize(6);
    for (const k of kagawads) {
      doc.setFont('helvetica', 'bold');
      doc.text(k.name.toUpperCase(), x + sideWidth / 2, y, { align: 'center' });
      y += 2.5;
      if (k.alternateTitle) {
        doc.setFont('helvetica', 'italic');
        doc.text(k.alternateTitle, x + sideWidth / 2, y, { align: 'center' });
        y += 2.5;
      }
      y += 1.5;
    }
  }

  // SK Chair
  const sk = officials?.sk?.[0];
  if (sk) {
    doc.setFontSize(6);
    doc.setFont('helvetica', 'bold');
    doc.text(sk.name.toUpperCase(), x + sideWidth / 2, y, { align: 'center' });
    y += 2.5;
    doc.setFont('helvetica', 'normal');
    doc.text('SK Chairman', x + sideWidth / 2, y, { align: 'center' });
    y += 4;
  }

  // Treasurer
  const treasurer = officials?.treasurer?.[0];
  if (treasurer) {
    doc.setFontSize(6);
    doc.setFont('helvetica', 'bold');
    doc.text(treasurer.name.toUpperCase(), x + sideWidth / 2, y, { align: 'center' });
    y += 2.5;
    doc.setFont('helvetica', 'normal');
    doc.text('Treasurer', x + sideWidth / 2, y, { align: 'center' });
    y += 4;
  }

  // Secretary
  const secretary = officials?.secretary?.[0];
  if (secretary) {
    doc.setFontSize(6);
    doc.setFont('helvetica', 'bold');
    doc.text(secretary.name.toUpperCase(), x + sideWidth / 2, y, { align: 'center' });
    y += 2.5;
    doc.setFont('helvetica', 'normal');
    doc.text('Secretary', x + sideWidth / 2, y, { align: 'center' });
  }
}

/**
 * Generate a Barangay Clearance PDF.
 *
 * @param {object} params
 * @param {object} params.request     – The request item (from toRequestItem)
 * @param {object} params.barangay    – Barangay record { name, province, municipality, barangay_address, barangay_email, seal_url }
 * @param {object} params.officials   – Grouped officials { punong, kagawad, sk, treasurer, secretary }
 * @param {number} [params.amount]    – Document fee amount
 * @returns {Promise<jsPDF>} – the jsPDF instance (call .save() or .output())
 */
export async function generateClearancePdf({ request, barangay, officials, amount }) {
  const doc = new jsPDF({ unit: 'mm', format: 'letter' }); // 215.9 x 279.4mm

  const pageW = doc.internal.pageSize.getWidth();
  const contentLeft = 62; // right of sidebar
  const contentRight = pageW - 15;
  const contentCenterX = (contentLeft + contentRight) / 2;

  // ── Seal image ──
  const sealDataUrl = await loadImageAsDataUrl(barangay?.seal_url);
  if (sealDataUrl) {
    doc.addImage(sealDataUrl, 'PNG', contentCenterX - 30, 8, 18, 18);
  }

  // ── Header ──
  let y = 12;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('REPUBLIC OF THE PHILIPPINES', contentCenterX, y, { align: 'center' });
  y += 5;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  if (barangay?.province) {
    doc.text(`Province of ${barangay.province}`, contentCenterX, y, { align: 'center' });
    y += 4.5;
  }
  if (barangay?.municipality) {
    doc.text(`Municipality of ${barangay.municipality}`, contentCenterX, y, { align: 'center' });
    y += 4.5;
  }

  doc.setFont('helvetica', 'bold');
  doc.text('OFFICE OF THE PUNONG BARANGAY', contentCenterX, y, { align: 'center' });
  y += 5;

  doc.setFontSize(9);
  if (barangay?.barangay_address) {
    doc.text(barangay.barangay_address.toUpperCase(), contentCenterX, y, { align: 'center' });
    y += 4.5;
  } else if (barangay?.name) {
    doc.text(`BARANGAY ${barangay.name.toUpperCase()}`, contentCenterX, y, { align: 'center' });
    y += 4.5;
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  if (barangay?.barangay_email) {
    doc.text(`Email: ${barangay.barangay_email}`, contentCenterX, y, { align: 'center' });
    y += 4;
  }

  // ── Divider line ──
  y += 2;
  doc.setDrawColor(0);
  doc.setLineWidth(0.3);
  doc.line(contentLeft, y, contentRight, y);
  y += 8;

  // ── Title ──
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('BARANGAY CLEARANCE', contentCenterX, y, { align: 'center' });
  y += 10;

  // ── Certification body ──
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  const bodyWidth = contentRight - contentLeft;
  const certText = 'This is to certify that the person whose name, signature and thumb marks appeared herein below has requested CLEARANCE from this office.';
  const lines = doc.splitTextToSize(certText, bodyWidth);
  doc.text(lines, contentLeft, y, { align: 'justify' });
  y += lines.length * 4.5 + 4;

  // ── Personal info fields ──
  const fullName = request.resident || '';
  const age = computeAge(request.birthday);
  const birthday = formatBirthday(request.birthday);
  const gender = (request.sex || '').toUpperCase();
  const civilStatus = (request.civilStatus || '').toUpperCase();
  const address = request.address || '';
  const purpose = request.purpose || '';

  doc.setFontSize(9);

  const fieldLeft = contentLeft;
  const valueLeft = contentLeft + 30;
  const col2Label = contentLeft + bodyWidth * 0.6;
  const col2Value = col2Label + 22;
  const lineH = 5.5;

  // Row 1: NAME / AGE
  doc.setFont('helvetica', 'bold');
  doc.text('NAME', fieldLeft, y);
  doc.text(':', valueLeft - 2, y);
  doc.setFont('helvetica', 'normal');
  doc.text(fullName.toUpperCase(), valueLeft, y);
  doc.setFont('helvetica', 'bold');
  doc.text('AGE:', col2Label, y);
  doc.setFont('helvetica', 'normal');
  doc.text(age, col2Value, y);
  y += lineH;

  // Row 2: BIRTHDAY / GENDER
  doc.setFont('helvetica', 'bold');
  doc.text('BIRTHDAY', fieldLeft, y);
  doc.text(':', valueLeft - 2, y);
  doc.setFont('helvetica', 'normal');
  doc.text(birthday, valueLeft, y);
  doc.setFont('helvetica', 'bold');
  doc.text('GENDER:', col2Label, y);
  doc.setFont('helvetica', 'normal');
  doc.text(gender, col2Value, y);
  y += lineH;

  // Row 3: CIVIL STATUS / CITIZENSHIP
  doc.setFont('helvetica', 'bold');
  doc.text('CIVIL STATUS', fieldLeft, y);
  doc.text(':', valueLeft - 2, y);
  doc.setFont('helvetica', 'normal');
  doc.text(civilStatus, valueLeft, y);
  doc.setFont('helvetica', 'bold');
  doc.text('CITIZENSHIP:', col2Label, y);
  doc.setFont('helvetica', 'normal');
  doc.text('FILIPINO', col2Value, y);
  y += lineH;

  // Row 4: ADDRESS
  doc.setFont('helvetica', 'bold');
  doc.text('ADDRESS', fieldLeft, y);
  doc.text(':', valueLeft - 2, y);
  doc.setFont('helvetica', 'normal');
  const addrLines = doc.splitTextToSize(address, bodyWidth - 32);
  doc.text(addrLines, valueLeft, y);
  y += addrLines.length * 4 + 1;

  // Row 5: PURPOSE
  doc.setFont('helvetica', 'bold');
  doc.text('PURPOSE', fieldLeft, y);
  doc.text(':', valueLeft - 2, y);
  doc.setFont('helvetica', 'normal');
  const purposeLines = doc.splitTextToSize(purpose || 'N/A', bodyWidth - 32);
  doc.text(purposeLines, valueLeft, y);
  y += purposeLines.length * 4 + 6;

  // ── Certification paragraph ──
  doc.setFontSize(9);
  const certPara = 'This is to certify further that he/she is known to me of good moral character and is a law-abiding citizen. He/she has no pending case or derogatory record in this office.';
  const certLines = doc.splitTextToSize(certPara, bodyWidth);
  doc.text(certLines, contentLeft + 8, y);
  y += certLines.length * 4.5 + 8;

  // ── Thumb marks area ──
  const thumbBoxW = 20;
  const thumbBoxH = 16;
  const thumbGap = 8;
  const thumbStartX = contentCenterX + 2;
  doc.setDrawColor(0);
  doc.setLineWidth(0.3);
  // Left thumb box
  doc.rect(thumbStartX, y, thumbBoxW, thumbBoxH);
  // Right thumb box
  doc.rect(thumbStartX + thumbBoxW + thumbGap, y, thumbBoxW, thumbBoxH);
  // Labels above boxes
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text('Left', thumbStartX + thumbBoxW / 2, y - 1.5, { align: 'center' });
  doc.text('Right', thumbStartX + thumbBoxW + thumbGap + thumbBoxW / 2, y - 1.5, { align: 'center' });
  y += thumbBoxH + 6;

  // ── Signature line ──
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(fullName.toUpperCase(), contentLeft + 6, y);
  y += 3.5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text('Signature over Printed Name', contentLeft + 4, y);
  y += 10;

  // ── Issued date ──
  const issuedDate = formatIssueDate();
  const locationName = barangay?.barangay_address || (barangay?.name ? `Barangay ${barangay.name}` : '');
  const municipalityStr = barangay?.municipality ? `, ${barangay.municipality}` : '';
  const provinceStr = barangay?.province ? `, ${barangay.province}` : '';
  const issueLine = `Issued this ${issuedDate} at ${locationName}${municipalityStr}${provinceStr}, Philippines.`;
  doc.setFontSize(8.5);
  const issueLines = doc.splitTextToSize(issueLine, bodyWidth - 10);
  doc.text(issueLines, contentLeft + 10, y);
  y += issueLines.length * 4 + 8;

  // ── Prepared by / Signatures ──
  doc.setFontSize(8);
  doc.text('Prepared by:', contentLeft, y);
  y += 10;

  const secretary = officials?.secretary?.[0];
  const punong = officials?.punong?.[0];

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  if (secretary) {
    doc.text(secretary.name.toUpperCase(), contentLeft, y);
  }
  if (punong) {
    doc.text(`HON. ${punong.name.toUpperCase()}`, contentRight, y, { align: 'right' });
  }
  y += 3.5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  if (secretary) {
    doc.text('Barangay Secretary', contentLeft, y);
  }
  if (punong) {
    doc.text('Punong Barangay', contentRight, y, { align: 'right' });
  }
  y += 12;

  // ── Footer: Amount / O.R. / Note ──
  doc.setFontSize(8);
  const displayAmount = amount != null ? Number(amount).toFixed(2) : '___';
  doc.text(`Amount: ${displayAmount}`, contentLeft, y);
  y += 4;
  doc.text('O.R. No.: _____________', contentLeft + 10, y);
  y += 4;
  doc.text('Date Issued: _____________', contentLeft + 10, y);
  y += 4;
  const placeName = barangay?.name ? `BTO – ${barangay.name}` : '___________';
  doc.text(`Place of Issued: ${placeName}`, contentLeft + 10, y);
  y += 8;

  doc.setFontSize(7);
  doc.setFont('helvetica', 'italic');
  const noteText = 'NOTE: This clearance is good only for ninety (90) days from date of issued. Not valid without official dry seal.';
  const noteLines = doc.splitTextToSize(noteText, bodyWidth - 15);
  doc.text(noteLines, contentLeft + 10, y);

  // ── Left sidebar (officials list) ──
  const sidebarX = 5;
  const sidebarY = 30;
  const sidebarW = 52;
  const sidebarH = 240;
  doc.setDrawColor(0);
  doc.setLineWidth(0.3);
  doc.rect(sidebarX, sidebarY, sidebarW, sidebarH);
  drawOfficialsSidebar(doc, officials, sidebarY + 5);

  return doc;
}
