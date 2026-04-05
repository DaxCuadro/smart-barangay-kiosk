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
function drawOfficialsSidebar(doc, officials, startY, sidebarX, sideWidth) {
  const cx = sidebarX + sideWidth / 2;
  let y = startY;

  doc.setFont('helvetica', 'normal');

  // Punong Barangay
  const punong = officials?.punong?.[0];
  if (punong) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text(punong.name.toUpperCase(), cx, y, { align: 'center' });
    y += 4;
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8);
    doc.text('Punong Barangay', cx, y, { align: 'center' });
    y += 7;
  }

  // KAGAWAD header
  const kagawads = officials?.kagawad || [];
  if (kagawads.length) {
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    doc.text('KAGAWAD', cx, y, { align: 'center' });
    y += 6;

    doc.setFontSize(8);
    for (const k of kagawads) {
      doc.setFont('helvetica', 'bold');
      doc.text(k.name.toUpperCase(), cx, y, { align: 'center' });
      y += 4;
      if (k.alternateTitle) {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(7.5);
        doc.text(k.alternateTitle, cx, y, { align: 'center' });
        y += 4;
        doc.setFontSize(8);
      }
      y += 3;
    }
  }

  // SK Chair
  const sk = officials?.sk?.[0];
  if (sk) {
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text(sk.name.toUpperCase(), cx, y, { align: 'center' });
    y += 4;
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7.5);
    doc.text('SK Chairman', cx, y, { align: 'center' });
    y += 6;
  }

  // Treasurer
  const treasurer = officials?.treasurer?.[0];
  if (treasurer) {
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text(treasurer.name.toUpperCase(), cx, y, { align: 'center' });
    y += 4;
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7.5);
    doc.text('Treasurer', cx, y, { align: 'center' });
    y += 6;
  }

  // Secretary
  const secretary = officials?.secretary?.[0];
  if (secretary) {
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text(secretary.name.toUpperCase(), cx, y, { align: 'center' });
    y += 4;
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7.5);
    doc.text('Secretary', cx, y, { align: 'center' });
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

  const pageW = doc.internal.pageSize.getWidth();   // ~215.9
  const pageH = doc.internal.pageSize.getHeight();   // ~279.4

  // ── Margins ──
  const marginTop = 10;
  const marginLeft = 15;
  const marginRight = 15;
  const marginBottom = 12;

  // ── Sidebar dimensions ──
  const sidebarW = 50;
  const hasOfficials = officials && (
    (officials.punong?.length > 0) ||
    (officials.kagawad?.length > 0) ||
    (officials.sk?.length > 0) ||
    (officials.treasurer?.length > 0) ||
    (officials.secretary?.length > 0)
  );

  // ── Content area (right of sidebar if officials present) ──
  const contentLeft = hasOfficials ? (marginLeft + sidebarW + 4) : marginLeft;
  const contentRight = pageW - marginRight;
  const bodyWidth = contentRight - contentLeft;
  const contentCenterX = (contentLeft + contentRight) / 2;

  // ── Seal image (top-left corner) ──
  const sealDataUrl = await loadImageAsDataUrl(barangay?.seal_url);
  const sealSize = 20;
  if (sealDataUrl) {
    doc.addImage(sealDataUrl, 'PNG', contentLeft, marginTop, sealSize, sealSize);
  }

  // ── Header (centered in content area) ──
  let y = marginTop + 3;
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('REPUBLIC OF THE PHILIPPINES', contentCenterX, y, { align: 'center' });
  y += 4.5;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'italic');
  if (barangay?.province) {
    doc.text(`Province of ${barangay.province}`, contentCenterX, y, { align: 'center' });
    y += 4;
  }
  if (barangay?.municipality) {
    doc.text(`Municipality of ${barangay.municipality}`, contentCenterX, y, { align: 'center' });
    y += 4.5;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('OFFICE OF THE PUNONG BARANGAY', contentCenterX, y, { align: 'center' });
  y += 5;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
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

  // ── Divider line (full page width) ──
  y += 1;
  const dividerY = y;
  doc.setDrawColor(0);
  doc.setLineWidth(0.4);
  doc.line(marginLeft, dividerY, pageW - marginRight, dividerY);
  y += 10;

  // ── Title ──
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('BARANGAY CLEARANCE', contentCenterX, y, { align: 'center' });
  y += 10;

  // ── Certification body (with tab indent) ──
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  const certText = 'This is to certify that the person whose name, signature and thumb marks appeared herein below has requested CLEARANCE from this office.';
  const certLines = doc.splitTextToSize(certText, bodyWidth - 8);
  // First line indented
  if (certLines.length > 0) {
    doc.text(certLines[0], contentLeft + 10, y);
    for (let i = 1; i < certLines.length; i++) {
      y += 4.5;
      doc.text(certLines[i], contentLeft, y);
    }
  }
  y += 8;

  // ── Personal info fields ──
  const fullName = request.resident || '';
  const age = computeAge(request.birthday);
  const birthday = formatBirthday(request.birthday);
  const gender = (request.sex || '').toUpperCase();
  const civilStatus = (request.civilStatus || '').toUpperCase();
  const address = request.address || '';
  const purpose = request.purpose || '';

  doc.setFontSize(10);

  const fieldLeft = contentLeft;
  const valueLeft = contentLeft + 35;
  const col2Label = contentLeft + bodyWidth * 0.58;
  const col2Colon = col2Label + 26;
  const col2Value = col2Colon + 3;
  const lineH = 5.5;

  // Row 1: NAME / AGE
  doc.setFont('helvetica', 'bold');
  doc.text('NAME', fieldLeft, y);
  doc.text(':', valueLeft - 2, y);
  doc.setFont('helvetica', 'normal');
  doc.text(fullName.toUpperCase(), valueLeft, y);
  doc.setFont('helvetica', 'bold');
  doc.text('AGE', col2Label, y);
  doc.text(':', col2Colon, y);
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
  doc.text('GENDER', col2Label, y);
  doc.text(':', col2Colon, y);
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
  doc.text('CITIZENSHIP', col2Label, y);
  doc.text(':', col2Colon, y);
  doc.setFont('helvetica', 'normal');
  doc.text('FILIPINO', col2Value, y);
  y += lineH;

  // Row 4: ADDRESS
  doc.setFont('helvetica', 'bold');
  doc.text('ADDRESS', fieldLeft, y);
  doc.text(':', valueLeft - 2, y);
  doc.setFont('helvetica', 'normal');
  const addrLines = doc.splitTextToSize(address, bodyWidth - 37);
  doc.text(addrLines, valueLeft, y);
  y += addrLines.length * 4.5 + 1;

  // Row 5: PURPOSE
  doc.setFont('helvetica', 'bold');
  doc.text('PURPOSE', fieldLeft, y);
  doc.text(':', valueLeft - 2, y);
  doc.setFont('helvetica', 'normal');
  const purposeLines = doc.splitTextToSize(purpose || 'N/A', bodyWidth - 37);
  doc.text(purposeLines, valueLeft, y);
  y += purposeLines.length * 4.5 + 8;

  // ── Second certification paragraph (indented) ──
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  const certPara = 'This is to certify further that he/she is known to me of good moral character and is a law-abiding citizen. He/she has no pending case or derogatory record in this office.';
  const cert2Lines = doc.splitTextToSize(certPara, bodyWidth - 8);
  // First line indented (matching first cert paragraph)
  if (cert2Lines.length > 0) {
    doc.text(cert2Lines[0], contentLeft + 10, y);
    for (let i = 1; i < cert2Lines.length; i++) {
      y += 4.5;
      doc.text(cert2Lines[i], contentLeft, y);
    }
  }
  y += 10;

  // ── Thumb marks area ──
  const thumbBoxW = 20;
  const thumbBoxH = 18;
  const thumbGap = 10;
  const thumbAreaW = thumbBoxW * 2 + thumbGap;
  const thumbStartX = contentRight - thumbAreaW - 5;
  doc.setDrawColor(0);
  doc.setLineWidth(0.3);
  // Labels above boxes
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('Left', thumbStartX + thumbBoxW / 2, y - 2, { align: 'center' });
  doc.text('Right', thumbStartX + thumbBoxW + thumbGap + thumbBoxW / 2, y - 2, { align: 'center' });
  // Boxes
  doc.rect(thumbStartX, y, thumbBoxW, thumbBoxH);
  doc.rect(thumbStartX + thumbBoxW + thumbGap, y, thumbBoxW, thumbBoxH);
  y += thumbBoxH + 10;

  // ── Signature (centered, no line) ──
  const sigCenterX = contentLeft + 35;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(fullName.toUpperCase(), sigCenterX, y + 3, { align: 'center' });
  y += 7;
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8);
  doc.text('Signature over Printed Name', sigCenterX, y, { align: 'center' });
  y += 12;

  // ── Issued date (indented, wrapped) ──
  const issuedDate = formatIssueDate();
  const locationName = barangay?.name ? `Barangay ${barangay.name}` : (barangay?.barangay_address || '');
  const regionStr = barangay?.province ? `, Region V` : '';
  const municipalityStr = barangay?.municipality ? `, ${barangay.municipality}` : '';
  const provinceStr = barangay?.province ? `,\n${barangay.province}, Philippines.` : ', Philippines.';
  const issueLine = `Issued this ${issuedDate} at ${locationName}${municipalityStr}${regionStr}${provinceStr}`;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  const issueLines = doc.splitTextToSize(issueLine, bodyWidth - 8);
  if (issueLines.length > 0) {
    doc.text(issueLines[0], contentLeft + 10, y);
    for (let i = 1; i < issueLines.length; i++) {
      y += 4.5;
      doc.text(issueLines[i], contentLeft, y);
    }
  }
  y += 10;

  // ── Prepared by ──
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('Prepared by:', contentLeft, y);
  y += 12;

  // ── Secretary & Punong Barangay (centered in their halves) ──
  const secretary = officials?.secretary?.[0];
  const punong = officials?.punong?.[0];
  const halfW = bodyWidth / 2;
  const leftCenter = contentLeft + halfW / 2;
  const rightCenter = contentLeft + halfW + halfW / 2;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  if (secretary) {
    doc.text(secretary.name.toUpperCase(), leftCenter, y, { align: 'center' });
  }
  if (punong) {
    doc.text(`HON. ${punong.name.toUpperCase()}`, rightCenter, y, { align: 'center' });
  }
  y += 4;
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8.5);
  if (secretary) {
    doc.text('Barangay Secretary', leftCenter, y, { align: 'center' });
  }
  if (punong) {
    doc.text('Punong Barangay', rightCenter, y, { align: 'center' });
  }
  y += 12;

  // ── Footer: Amount / O.R. / Note ──
  const footerLeft = contentLeft;
  const indentLeft = footerLeft + 6;
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  const displayAmount = amount != null ? Number(amount).toFixed(2) : '___';
  doc.text(`Amount: ${displayAmount}`, footerLeft, y);
  y += 4.5;
  doc.text('O.R. No.: _____________', indentLeft, y);
  y += 4.5;
  doc.text('Date Issued:', indentLeft, y);
  y += 4.5;
  const placeName = barangay?.name ? `BTO – ${barangay.name}` : '___________';
  doc.text(`Place of Issued: ${placeName}`, indentLeft, y);
  y += 8;

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'italic');
  const noteText = 'NOTE: This clearance is good only for ninety (90) days from date of issued. Not valid without official dry seal.';
  const noteLines = doc.splitTextToSize(noteText, bodyWidth - 10);
  doc.text(noteLines, footerLeft, y);

  // ── Left sidebar (officials box starts below divider line) ──
  if (hasOfficials) {
    const sidebarX = marginLeft;
    const sidebarTop = dividerY + 5;
    const sidebarBottom = Math.min(y + 8, pageH - marginBottom);
    doc.setDrawColor(0);
    doc.setLineWidth(0.3);
    doc.rect(sidebarX, sidebarTop, sidebarW, sidebarBottom - sidebarTop);
    drawOfficialsSidebar(doc, officials, sidebarTop + 8, sidebarX, sidebarW);
  }

  return doc;
}
