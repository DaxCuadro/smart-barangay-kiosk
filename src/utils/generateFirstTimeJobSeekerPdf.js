import { jsPDF } from 'jspdf';

/**
 * Draw a paragraph with mixed bold/normal/italic segments, word-wrapped.
 */
function drawMixedParagraph(doc, segments, startX, y, maxWidth, lineH, indent) {
  let fullText = '';
  const ranges = [];
  for (const seg of segments) {
    const start = fullText.length;
    fullText += seg.text;
    ranges.push({ start, end: fullText.length, bold: !!seg.bold, italic: !!seg.italic });
  }

  function getStyle(charIdx) {
    for (const r of ranges) {
      if (charIdx >= r.start && charIdx < r.end) {
        if (r.bold && r.italic) return 'bolditalic';
        if (r.bold) return 'bold';
        if (r.italic) return 'italic';
        return 'normal';
      }
    }
    return 'normal';
  }

  const tokenRegex = /\S+/g;
  const tokens = [];
  let m;
  while ((m = tokenRegex.exec(fullText)) !== null) {
    tokens.push({ text: m[0], idx: m.index });
  }

  let x = startX + indent;
  let currentY = y;

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    const style = getStyle(tok.idx);
    doc.setFont('helvetica', style);
    const tokW = doc.getTextWidth(tok.text);
    doc.setFont('helvetica', 'normal');
    const spaceW = doc.getTextWidth(' ');

    if (i > 0) {
      if (x + spaceW + tokW > startX + maxWidth) {
        currentY += lineH;
        x = startX;
      } else {
        x += spaceW;
      }
    }

    doc.setFont('helvetica', style);
    doc.text(tok.text, x, currentY);
    x += tokW;
  }

  return currentY;
}

/**
 * Compute age as a plain number from birthday string.
 */
function computeAgeNumber(birthday) {
  if (!birthday) return '';
  const birth = new Date(birthday);
  if (Number.isNaN(birth.getTime())) return '';
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) {
    age--;
  }
  return `${age}`;
}

/**
 * Format issue date: "16th day of DECEMBER, 2024"
 */
function formatIssueDate(date) {
  const d = date ? new Date(date) : new Date();
  const day = d.getDate();
  const suffix = (day === 1 || day === 21 || day === 31) ? 'st'
    : (day === 2 || day === 22) ? 'nd'
      : (day === 3 || day === 23) ? 'rd' : 'th';
  const months = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
    'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
  return { dayStr: `${day}${suffix}`, monthYear: `${months[d.getMonth()]}, ${d.getFullYear()}` };
}

/**
 * Load image as base64 data URL for jsPDF.
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
 */
function drawOfficialsSidebar(doc, officials, startY, sidebarX, sideWidth) {
  const cx = sidebarX + sideWidth / 2;
  let y = startY;

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
 * Generate a Barangay Certification for First Time Job Seekers (R.A. 11261).
 */
export async function generateFirstTimeJobSeekerPdf({ request, barangay, officials, amount }) {
  const doc = new jsPDF({ unit: 'mm', format: 'letter' });

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  const marginTop = 15;
  const marginLeft = 15;
  const marginRight = 15;
  const marginBottom = 12;

  const sidebarW = 50;
  const hasOfficials = officials && (
    (officials.punong?.length > 0) ||
    (officials.kagawad?.length > 0) ||
    (officials.sk?.length > 0) ||
    (officials.treasurer?.length > 0) ||
    (officials.secretary?.length > 0)
  );

  const contentLeft = hasOfficials ? (marginLeft + sidebarW + 4) : marginLeft;
  const contentRight = pageW - marginRight;
  const bodyWidth = contentRight - contentLeft;

  const headerCenterX = (marginLeft + pageW - marginRight) / 2;

  // ── Seal image (top-left, behind text) ──
  const sealDataUrl = await loadImageAsDataUrl(barangay?.seal_url);
  const sealSize = 20;
  if (sealDataUrl) {
    doc.addImage(sealDataUrl, 'PNG', marginLeft, marginTop, sealSize, sealSize);
  }

  // ── Header ──
  let y = marginTop + 3;
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('REPUBLIC OF THE PHILIPPINES', headerCenterX, y, { align: 'center' });
  y += 4.5;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'italic');
  if (barangay?.province) {
    doc.text(`Province of ${barangay.province}`, headerCenterX, y, { align: 'center' });
    y += 4;
  }
  if (barangay?.municipality) {
    doc.text(`Municipality of ${barangay.municipality}`, headerCenterX, y, { align: 'center' });
    y += 4.5;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('OFFICE OF THE PUNONG BARANGAY', headerCenterX, y, { align: 'center' });
  y += 5;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  if (barangay?.barangay_address) {
    doc.text(barangay.barangay_address.toUpperCase(), headerCenterX, y, { align: 'center' });
    y += 4.5;
  } else if (barangay?.name) {
    doc.text(`BARANGAY ${barangay.name.toUpperCase()}`, headerCenterX, y, { align: 'center' });
    y += 4.5;
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  if (barangay?.barangay_email) {
    doc.text(`Email: ${barangay.barangay_email}`, headerCenterX, y, { align: 'center' });
    y += 4;
  }

  // ── Divider line ──
  y += 1;
  const dividerY = y;
  doc.setDrawColor(0);
  doc.setLineWidth(0.4);
  doc.line(marginLeft, dividerY, pageW - marginRight, dividerY);
  y += 10;

  // ── Title ──
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('BARANGAY CERTIFICATION', headerCenterX, y, { align: 'center' });
  y += 6;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('(First Time Jobseekers Assistant Act R.A 11261)', headerCenterX, y, { align: 'center' });
  y += 10;

  // ── TO WHOM IT MAY CONCERN ──
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('TO WHOM IT MAY CONCERN:', contentLeft, y);
  y += 8;

  // ── Build data ──
  const raw = request.raw || {};
  const firstName = (raw.first_name || '').toUpperCase();
  const middleName = (raw.middle_name || '').toUpperCase();
  const lastName = (raw.last_name || '').toUpperCase();
  const fullNameFormatted = [firstName, middleName, lastName].filter(Boolean).join(' ');
  const ageNum = computeAgeNumber(request.birthday);
  const zone = request.zone || '';
  const barangayName = barangay?.name || '';
  const municipality = barangay?.municipality || '';
  const province = barangay?.province || '';

  const zonePart = zone ? `${zone}, ` : '';
  const locationStr = `${zonePart}Barangay ${barangayName}${municipality ? `, ${municipality}` : ''}${province ? `, ${province}` : ''}`;

  // ── Body paragraph 1: Certify identity + qualified availed of RA 11261 ──
  doc.setFontSize(10);
  const certifySegments = [
    { text: 'This is to certify that ', bold: false },
    { text: `${fullNameFormatted},`, bold: true },
    { text: ` a resident of ${locationStr}, for `, bold: false },
    { text: `${ageNum} years old,`, bold: true },
    { text: ' is a qualified availed of ', bold: false },
    { text: 'RA 11261', bold: true },
    { text: ' or the ', bold: false },
    { text: 'First-Time Jobseekers Act of 2019.', italic: true },
  ];
  y = drawMixedParagraph(doc, certifySegments, contentLeft, y, bodyWidth - 8, 4.5, 10);
  y += 8;

  // ── Body paragraph 2: Further certifies – Oath of Understanding ──
  doc.setFontSize(10);
  const furtherSegments = [
    { text: 'This further certifies', bold: true },
    { text: ' that the holder/bearer was informed of his/her rights, including the duties and responsibilities accorded by ', bold: false },
    { text: 'RA 11261', bold: true },
    { text: ' through the ', bold: false },
    { text: 'Oath of Understanding', bold: true },
    { text: ' he/she has signed and executed in the presence of our Barangay Official/s.', bold: false },
  ];
  y = drawMixedParagraph(doc, furtherSegments, contentLeft, y, bodyWidth - 8, 4.5, 10);
  y += 8;

  // ── Signed date ──
  const { dayStr, monthYear } = formatIssueDate();
  const locationName = barangayName ? `Barangay ${barangayName}` : (barangay?.barangay_address || '');
  const municipalityStr = municipality ? `, ${municipality}` : '';
  const provinceStr = province ? `, ${province}, Philippines.` : ', Philippines.';
  doc.setFontSize(10);
  const signedSegments = [
    { text: 'Signed this ', bold: false },
    { text: `${dayStr}`, bold: true },
    { text: ' day of ', bold: false },
    { text: `${monthYear},`, bold: true },
    { text: ` in the ${locationName}${municipalityStr}${provinceStr}`, bold: false },
  ];
  y = drawMixedParagraph(doc, signedSegments, contentLeft, y, bodyWidth - 8, 4.5, 10);
  y += 10;

  // ── Validity note ──
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  const validityText = 'This certification is valid only for one (1) year from the date of issuance.';
  const validityLines = doc.splitTextToSize(validityText, bodyWidth - 8);
  doc.text(validityLines, contentLeft + 10, y);
  y += validityLines.length * 4.5 + 14;

  // ── Resident signature ──
  const sigCenterX = contentLeft + 35;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(fullNameFormatted, sigCenterX, y, { align: 'center' });
  y += 4;
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8);
  doc.text('Signature Over Printed Name', sigCenterX, y, { align: 'center' });
  y += 22;

  // ── Secretary & Punong Barangay signatures ──
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
  const nowDate = new Date();
  const footerDateStr = `${nowDate.getMonth() + 1}/${nowDate.getDate()}/${nowDate.getFullYear()}`;
  doc.text(`Date Issued: ${footerDateStr}`, indentLeft, y);
  y += 4.5;
  const placeName = barangayName ? `BTO – ${barangayName}` : '___________';
  doc.text(`Place of Issued: ${placeName}`, indentLeft, y);
  y += 8;

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'italic');
  const noteText = 'NOTE: This certificate is good only for one (1) year from date of issuance. Not valid without official dry seal.';
  const noteLines = doc.splitTextToSize(noteText, bodyWidth - 10);
  doc.text(noteLines, footerLeft, y);

  // ── Left sidebar (officials box) ──
  if (hasOfficials) {
    const sidebarX = marginLeft;
    const sidebarTop = dividerY + 5;
    const sidebarBottom = Math.min(y + 8, pageH - marginBottom);

    doc.setDrawColor(0);
    doc.setLineWidth(0.3);
    doc.rect(sidebarX, sidebarTop, sidebarW, sidebarBottom - sidebarTop);

    drawOfficialsSidebar(doc, officials, sidebarTop + 6, sidebarX, sidebarW);
  }

  return doc;
}
