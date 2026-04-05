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
 * Format issue date: returns { dayStr, monthYear }
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
 * Generate an Oath of Undertaking PDF for First Time Job Seekers (R.A. 11261).
 * No officials sidebar on this document.
 */
export async function generateOathOfUndertakingPdf({ request, barangay, officials }) {
  const doc = new jsPDF({ unit: 'mm', format: 'letter' });

  const pageW = doc.internal.pageSize.getWidth();

  const marginTop = 15;
  const marginLeft = 15;
  const marginRight = 15;

  const contentLeft = marginLeft;
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
  doc.setDrawColor(0);
  doc.setLineWidth(0.4);
  doc.line(marginLeft, y, pageW - marginRight, y);
  y += 10;

  // ── Title ──
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('OATH OF UNDERTAKING', headerCenterX, y, { align: 'center' });
  y += 10;

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

  const locationStr = `${zone ? `${zone}, ` : ''}Barangay ${barangayName}${municipality ? `, ${municipality}` : ''}${province ? `, ${province}` : ''}`;

  // ── Opening paragraph ──
  doc.setFontSize(10);
  const openingSegments = [
    { text: 'I, ', bold: false },
    { text: `${fullNameFormatted},`, bold: true },
    { text: ' ', bold: false },
    { text: `${ageNum}`, bold: true },
    { text: ' years of age, Resident of ', bold: false },
    { text: `${locationStr},`, bold: false },
    { text: ' since birth, availing the Benefits of Republic Act 11261, otherwise known as the ', bold: false },
    { text: 'First Time Job Seekers Act of 2019,', bold: true },
    { text: ' do hereby declare, agree and undertake to abide and be bound by the following;', bold: false },
  ];
  y = drawMixedParagraph(doc, openingSegments, contentLeft, y, bodyWidth, 4.5, 10);
  y += 8;

  // ── Numbered items ──
  const items = [
    'That this is the first time that I will actively look for a job, and therefore requesting that a Barangay Certification be issued in my favor to avail benefits of the law;',
    'That I am aware that the benefit and privilege/s under the said law shall be valid only for (1) year from the date that the Barangay Certification is issued;',
    'That I can avail the benefits of the law only once;',
    'That I understand that my personal information shall be included in the Roster/List of First Time Jobseekers and will not be used for any unlawful purpose;',
    'That will inform and/ or report to be Barangay personally, through text or other means, or through my family/relatives once I get employed; and',
    'That I am not a beneficiary for the Jobstart Program under R.A. No. 10889 and laws that that give similar exemptions for the documents or transactions exempted under R.A. No. 11261',
    'That if issued the requested Certification, I will not use the same in any fraud, neither falsify nor help and/ or assist in fabrication of the said certification.',
    'That this undertaking is made solely for the purpose of obtaining a Barangay Certification consistent with the objective of R.A. No. 11261 and not for any other purpose.',
    'That I Consent to the use of my personal information pursuant to the Data Privacy Act and other applicable laws, rules, and regulations.',
  ];

  const numIndent = 8;
  const itemTextLeft = contentLeft + numIndent;
  const itemWidth = bodyWidth - numIndent;
  const lineH = 4.5;

  for (let i = 0; i < items.length; i++) {
    const num = `${i + 1}.`;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(num, contentLeft, y);

    const lines = doc.splitTextToSize(items[i], itemWidth);
    doc.text(lines, itemTextLeft, y);
    y += lines.length * lineH + 2;
  }
  y += 4;

  // ── Signed date ──
  const { dayStr, monthYear } = formatIssueDate();
  const officeName = barangayName ? `Punong Barangay, ${barangayName}` : 'Punong Barangay';
  const municipalityPart = municipality ? `, ${municipality}` : '';
  const provincePart = province ? `, ${province}.` : '.';
  doc.setFontSize(10);
  const signedSegments = [
    { text: 'Signed this ', bold: false },
    { text: `${dayStr}`, bold: true },
    { text: ' day of ', bold: false },
    { text: `${monthYear},`, bold: true },
    { text: ` in the Office of the ${officeName}${municipalityPart}${provincePart}`, bold: false },
  ];
  y = drawMixedParagraph(doc, signedSegments, contentLeft, y, bodyWidth, 4.5, 10);
  y += 20;

  // ── Resident signature ──
  const sigCenterX = contentLeft + bodyWidth / 2;
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

  // ── Footer: Date Issued / Place of Issued ──
  const now = new Date();
  const footerDateStr = `${now.getMonth() + 1}/${now.getDate()}/${now.getFullYear()}`;
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.text(`Date Issued: ${footerDateStr}`, contentLeft, y);
  y += 4.5;
  const placeName = barangayName ? `BTO – ${barangayName}` : '___________';
  doc.text(`Place of Issued: ${placeName}`, contentLeft, y);

  return doc;
}
