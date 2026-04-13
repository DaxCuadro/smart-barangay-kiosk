import { jsPDF } from 'jspdf';

/* ─── helpers ──────────────────────────────────────────────── */
const PAGE = { unit: 'mm', format: 'letter' };
const MARGIN = 20;

function addWrappedText(doc, text, x, y, maxW, lineH = 5) {
  const lines = doc.splitTextToSize(text, maxW);
  lines.forEach(line => {
    if (y > doc.internal.pageSize.getHeight() - MARGIN) {
      doc.addPage();
      y = MARGIN;
    }
    doc.text(line, x, y);
    y += lineH;
  });
  return y;
}

function drawCheckbox(doc, x, y, size = 3) {
  doc.rect(x, y - size + 0.5, size, size);
}

/* ================================================================
   1. PRE-TEST SURVEY
   ================================================================ */
export function generatePreTestPdf(cfg = {}) {
  const {
    researchers = 'Dennis Leonardo S. Cuadro | Frank John Paul L. Tresvalles | Karl S. Ignacio',
    program = 'BS Computer Engineering, Ateneo de Naga University',
    partnerBarangays = 'Brgy. Maangas & Brgy. Santa Maria, Presentacion, Camarines Sur',
    barangayOptions = ['Brgy. Maangas, Presentacion', 'Brgy. Santa Maria, Presentacion'],
    preTestItems = null,
  } = cfg;

  /* default survey items */
  const sections = preTestItems || [
    {
      title: 'PART 1: Current Experience with Barangay Document Requests',
      subtitle: 'Kasalukuyang Karanasan sa Pag-request ng Barangay Documents',
      items: [
        { en: 'I am satisfied with the current manual process of requesting barangay documents.', fil: 'Nasisiyahan ako sa kasalukuyang manual na proseso ng pag-request ng barangay documents.' },
        { en: 'The current process of requesting barangay documents is fast and efficient.', fil: 'Mabilis at episyente ang kasalukuyang proseso ng pag-request ng barangay documents.' },
        { en: 'I find it convenient to personally go to the barangay hall every time I need a document.', fil: 'Maginhawa para sa akin ang personal na pagpunta sa barangay hall tuwing kailangan ko ng dokumento.' },
        { en: 'I rarely experience long waiting times when requesting documents at the barangay.', fil: 'Bihira akong makaranas ng mahabang oras ng paghihintay sa pag-request ng dokumento sa barangay.' },
        { en: 'I am always informed about the status of my document request (e.g., if it is ready for pickup).', fil: 'Lagi akong napapabalitaan tungkol sa status ng aking document request.' },
      ],
    },
    {
      title: 'PART 2: Accessibility and Inclusivity of Current Services',
      subtitle: 'Accessibility at Inclusivity ng Kasalukuyang Serbisyo',
      items: [
        { en: "The barangay's current document request process is accessible to all residents, including senior citizens and PWDs.", fil: 'Ang kasalukuyang proseso ng barangay ay accessible sa lahat ng residente, kasama ang mga senior citizen at PWD.' },
        { en: 'I can easily request barangay documents even during my work hours or busy schedule.', fil: 'Madali akong makapag-request ng barangay documents kahit sa oras ng trabaho o abala akong schedule.' },
        { en: 'I have no difficulty communicating my document request needs to barangay staff.', fil: 'Wala akong hirap sa pakikipag-communicate sa barangay staff tungkol sa aking pangangailangan ng dokumento.' },
      ],
    },
    {
      title: 'PART 3: Technology Readiness and Familiarity',
      subtitle: 'Kahandaan at Pamilyaridad sa Teknolohiya',
      items: [
        { en: 'I am comfortable using digital devices such as smartphones, tablets, or computers.', fil: 'Komportable akong gumamit ng mga digital device tulad ng smartphone, tablet, o computer.' },
        { en: 'I am familiar with using self-service kiosks or touch-screen machines (e.g., ATMs, payment terminals).', fil: 'Pamilyar ako sa paggamit ng self-service kiosk o touch-screen machines tulad ng ATM at payment terminals.' },
        { en: 'I have access to a smartphone or computer with internet connection at home.', fil: 'May access ako sa smartphone o computer na may internet connection sa bahay.' },
        { en: 'I am open to using a computerized system for requesting barangay documents.', fil: 'Bukas akong gumamit ng computerized system para sa pag-request ng barangay documents.' },
      ],
    },
    {
      title: 'PART 4: Perceived Need for Digital Innovation',
      subtitle: 'Pangangailangan sa Digital na Inobasyon',
      items: [
        { en: 'I believe the barangay needs a digital/computerized system for processing document requests.', fil: 'Naniniwala akong kailangan ng barangay ang isang digital/computerized system para sa pagproseso ng document requests.' },
        { en: 'A system that allows me to request documents from home (online) would be very helpful.', fil: 'Ang system na magpapahintulot sa akin na mag-request ng dokumento mula sa bahay (online) ay magiging napakakapaki-pakinabang.' },
        { en: 'Receiving SMS notifications about my document request status would improve my experience.', fil: 'Ang pagtanggap ng SMS notification tungkol sa status ng aking document request ay magpapahusay ng aking karanasan.' },
      ],
    },
  ];

  const doc = new jsPDF(PAGE);
  const pageW = doc.internal.pageSize.getWidth();
  const contentW = pageW - MARGIN * 2;
  let y = MARGIN;

  /* ── Header ── */
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  y = addWrappedText(doc, 'PRE-TEST SURVEY QUESTIONNAIRE FOR RESIDENTS', MARGIN, y, contentW, 6);
  y += 1;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  y = addWrappedText(doc, 'Smart Barangay Kiosk System with Offline-First Document Request Handling and Resident Management', MARGIN, y, contentW, 4);
  y += 3;
  doc.setFontSize(8);
  y = addWrappedText(doc, `Researchers: ${researchers}`, MARGIN, y, contentW, 4);
  y = addWrappedText(doc, `Program: ${program}`, MARGIN, y, contentW, 4);
  y = addWrappedText(doc, `Partner Barangays: ${partnerBarangays}`, MARGIN, y, contentW, 4);
  y += 4;

  /* ── Informed Consent ── */
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('INFORMED CONSENT', MARGIN, y); y += 5;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  y = addWrappedText(doc, 'Magandang araw po! Kami po ay mga estudyante ng Ateneo de Naga University na kasalukuyang nagsasagawa ng thesis research. Ang survey na ito ay naglalayong malaman ang inyong kasalukuyang karanasan sa pag-request ng mga barangay documents. Ang inyong sagot ay magiging confidential at gagamitin lamang para sa layunin ng pananaliksik.', MARGIN, y, contentW, 4);
  y += 4;

  /* ── Demographics ── */
  doc.setFontSize(8);
  doc.text('Pangalan (Optional): _______________________________     Edad: __________', MARGIN, y); y += 5;
  doc.text('Kasarian:  [  ] Lalaki    [  ] Babae    [  ] Prefer not to say', MARGIN, y); y += 5;
  let brgyLine = 'Barangay:  ';
  barangayOptions.forEach((b, i) => { brgyLine += `[  ] ${b}${i < barangayOptions.length - 1 ? '    ' : ''}`; });
  y = addWrappedText(doc, brgyLine, MARGIN, y, contentW, 4); y += 4;

  /* ── Rating Legend ── */
  doc.setFont('helvetica', 'bold');
  doc.text('Rating Scale:  1 = Strongly Disagree  |  2 = Disagree  |  3 = Neutral  |  4 = Agree  |  5 = Strongly Agree', MARGIN, y);
  y += 6;

  /* ── Sections ── */
  let globalNum = 0;
  sections.forEach(section => {
    if (y > doc.internal.pageSize.getHeight() - 40) { doc.addPage(); y = MARGIN; }
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text(section.title, MARGIN, y); y += 4;
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'italic');
    doc.text(`(${section.subtitle})`, MARGIN, y); y += 5;

    section.items.forEach(item => {
      globalNum++;
      if (y > doc.internal.pageSize.getHeight() - 25) { doc.addPage(); y = MARGIN; }
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      const numStr = `${globalNum}. `;
      const textW = contentW - 40;
      doc.text(numStr, MARGIN, y);
      const lines = doc.splitTextToSize(`${item.en} (${item.fil})`, textW);
      lines.forEach(line => {
        doc.text(line, MARGIN + 6, y);
        y += 4;
      });
      /* rating boxes */
      const boxY = y;
      const boxStartX = pageW - MARGIN - 35;
      for (let r = 1; r <= 5; r++) {
        const bx = boxStartX + (r - 1) * 7;
        drawCheckbox(doc, bx, boxY, 3);
        doc.setFontSize(6);
        doc.text(String(r), bx + 0.7, boxY - 3.5);
      }
      y += 5;
    });
    y += 3;
  });

  /* ── Footer ── */
  y += 4;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'italic');
  y = addWrappedText(doc, 'Maraming salamat po sa inyong oras at pagtugon! Ang inyong sagot ay malaking tulong sa aming pananaliksik.', MARGIN, y, contentW, 4);

  return doc;
}

/* ================================================================
   2. POST-EVALUATION SURVEY
   ================================================================ */
export function generatePostEvalPdf(cfg = {}) {
  const {
    researchers = 'Dennis Leonardo S. Cuadro | Frank John Paul L. Tresvalles | Karl S. Ignacio',
    program = 'BS Computer Engineering, Ateneo de Naga University',
    partnerBarangays = 'Brgy. Maangas & Brgy. Santa Maria, Presentacion, Camarines Sur',
    barangayOptions = ['Brgy. Maangas, Presentacion', 'Brgy. Santa Maria, Presentacion'],
    postEvalItems = null,
  } = cfg;

  const sections = postEvalItems || [
    {
      title: 'PART 1: Ease of Use / Usability',
      subtitle: 'Kaginhawahan sa Paggamit',
      items: [
        { en: 'The system was easy to understand and navigate, even without prior training.', fil: 'Madaling intindihin at i-navigate ang sistema kahit walang naunang pagsasanay.' },
        { en: 'The on-screen instructions and labels were clear and easy to follow.', fil: 'Ang mga instructions at labels sa screen ay malinaw at madaling sundin.' },
        { en: 'I was able to complete my document request without needing assistance from barangay staff.', fil: 'Nakumpleto ko ang aking document request nang hindi na kailangan ng tulong mula sa barangay staff.' },
        { en: "The system's interface design is user-friendly and visually appealing.", fil: 'Ang disenyo ng interface ng sistema ay user-friendly at maganda sa paningin.' },
        { en: 'I feel confident that I can use the system again on my own in the future.', fil: 'Kumpiyansa akong magamit muli ang sistema mag-isa sa susunod.' },
      ],
    },
    {
      title: 'PART 2: Efficiency and Speed',
      subtitle: 'Episyensya at Bilis',
      items: [
        { en: 'Using the system, I was able to request a document faster compared to the traditional manual process.', fil: 'Sa paggamit ng sistema, mas mabilis akong nakapag-request ng dokumento kumpara sa tradisyonal na manual na proseso.' },
        { en: 'The number of steps required to complete a request was reasonable and not excessive.', fil: 'Ang bilang ng mga hakbang na kinailangan para makumpleto ang request ay makatuwiran at hindi labis.' },
        { en: 'The system processed my request without significant delays or errors.', fil: 'Naproseso ng sistema ang aking request nang walang malaking delay o error.' },
      ],
    },
    {
      title: 'PART 3: Accessibility and Convenience',
      subtitle: 'Accessibility at Kaginhawahan',
      items: [
        { en: 'The kiosk at the barangay hall is easy to access and use for walk-in residents.', fil: 'Ang kiosk sa barangay hall ay madaling puntahan at gamitin ng mga walk-in na residente.' },
        { en: 'The option to request documents online (remotely) is very convenient.', fil: 'Ang opsiyong mag-request ng dokumento online (remotely) ay napakaconvenient.' },
        { en: 'The system makes barangay document requests more accessible to senior citizens, PWDs, and busy residents.', fil: 'Ginagawang mas accessible ng sistema ang document requests para sa senior citizens, PWDs, at mga abala na residente.' },
        { en: 'I can request documents at a time that is convenient for me, not limited to office hours.', fil: 'Makakapag-request ako ng dokumento sa oras na convenient sa akin, hindi limitado sa office hours.' },
      ],
    },
    {
      title: 'PART 4: Reliability and Offline Capability',
      subtitle: 'Reliability at Offline na Kakayahan',
      items: [
        { en: 'The kiosk system worked properly even when internet connection was slow or unavailable.', fil: 'Gumana nang maayos ang kiosk system kahit mabagal o walang internet connection.' },
        { en: 'I did not experience any system crash or major technical issue during my use.', fil: 'Hindi ako nakaranas ng anumang system crash o major technical issue habang ginagamit ko ito.' },
        { en: 'I trust that my document request was properly recorded and will be processed.', fil: 'Nagtitiwala akong ang aking document request ay maayos na naitala at ipoproseso.' },
      ],
    },
    {
      title: 'PART 5: SMS Notification and Communication',
      subtitle: 'SMS Notification at Komunikasyon',
      items: [
        { en: 'I received an SMS notification about the status of my document request.', fil: 'Nakatanggap ako ng SMS notification tungkol sa status ng aking document request.' },
        { en: 'The SMS notification was timely and helped me know when to pick up my document.', fil: 'Ang SMS notification ay napapanahon at nakatulong sa akin na malaman kung kailan kukunin ang aking dokumento.' },
        { en: 'The SMS feature reduced the need for me to follow up in person at the barangay hall.', fil: 'Ang SMS feature ay nagbawas ng pangangailangan kong mag-follow up nang personal sa barangay hall.' },
      ],
    },
    {
      title: 'PART 6: Overall Satisfaction and Impact',
      subtitle: 'Pangkalahatang Kasiyahan at Epekto',
      items: [
        { en: 'Overall, I am satisfied with my experience using the Smart Barangay Kiosk System.', fil: 'Sa pangkalahatan, nasisiyahan ako sa aking karanasan sa paggamit ng Smart Barangay Kiosk System.' },
        { en: 'The system significantly improved the way I request barangay documents compared to the old process.', fil: 'Lubos na pinahusay ng sistema ang paraan ng pag-request ko ng barangay documents kumpara sa lumang proseso.' },
        { en: 'I would recommend this system to other residents in our barangay.', fil: 'Irerekomenda ko ang sistemang ito sa ibang mga residente ng aming barangay.' },
        { en: 'I prefer using this system over the traditional manual process for future document requests.', fil: 'Mas gusto ko ang paggamit ng sistemang ito kaysa sa tradisyonal na manual na proseso para sa mga susunod na document requests.' },
        { en: 'I believe this system should be permanently adopted by the barangay.', fil: 'Naniniwala akong dapat permanenteng gamitin ng barangay ang sistemang ito.' },
      ],
    },
  ];

  const doc = new jsPDF(PAGE);
  const pageW = doc.internal.pageSize.getWidth();
  const contentW = pageW - MARGIN * 2;
  let y = MARGIN;

  /* ── Header ── */
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  y = addWrappedText(doc, 'POST-EVALUATION SURVEY QUESTIONNAIRE FOR RESIDENTS', MARGIN, y, contentW, 6);
  y += 1;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  y = addWrappedText(doc, 'Smart Barangay Kiosk System with Offline-First Document Request Handling and Resident Management', MARGIN, y, contentW, 4);
  y += 3;
  doc.setFontSize(8);
  y = addWrappedText(doc, `Researchers: ${researchers}`, MARGIN, y, contentW, 4);
  y = addWrappedText(doc, `Program: ${program}`, MARGIN, y, contentW, 4);
  y = addWrappedText(doc, `Partner Barangays: ${partnerBarangays}`, MARGIN, y, contentW, 4);
  y += 4;

  /* ── Informed Consent ── */
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('INFORMED CONSENT', MARGIN, y); y += 5;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  y = addWrappedText(doc, 'Magandang araw po! Salamat sa paggamit ng Smart Barangay Kiosk System. Ang survey na ito ay naglalayong malaman ang inyong karanasan at feedback matapos gamitin ang sistema \u2014 maging sa kiosk o online. Ang inyong sagot ay magiging confidential at gagamitin lamang para sa layunin ng pananaliksik.', MARGIN, y, contentW, 4);
  y += 4;

  /* ── Demographics ── */
  doc.text('Pangalan (Optional): _______________________________     Edad: __________', MARGIN, y); y += 5;
  doc.text('Kasarian:  [  ] Lalaki    [  ] Babae    [  ] Prefer not to say', MARGIN, y); y += 5;
  let brgyLine = 'Barangay:  ';
  barangayOptions.forEach((b, i) => { brgyLine += `[  ] ${b}${i < barangayOptions.length - 1 ? '    ' : ''}`; });
  y = addWrappedText(doc, brgyLine, MARGIN, y, contentW, 4); y += 4;
  doc.text('Mode of Request Used:  [  ] Kiosk (sa Barangay Hall)    [  ] Online (Remote/sa bahay)    [  ] Both', MARGIN, y); y += 6;

  /* ── Rating Legend ── */
  doc.setFont('helvetica', 'bold');
  doc.text('Rating Scale:  1 = Strongly Disagree  |  2 = Disagree  |  3 = Neutral  |  4 = Agree  |  5 = Strongly Agree', MARGIN, y);
  y += 6;

  /* ── Sections ── */
  let globalNum = 0;
  sections.forEach(section => {
    if (y > doc.internal.pageSize.getHeight() - 40) { doc.addPage(); y = MARGIN; }
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text(section.title, MARGIN, y); y += 4;
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'italic');
    doc.text(`(${section.subtitle})`, MARGIN, y); y += 5;

    section.items.forEach(item => {
      globalNum++;
      if (y > doc.internal.pageSize.getHeight() - 25) { doc.addPage(); y = MARGIN; }
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      const numStr = `${globalNum}. `;
      const textW = contentW - 40;
      doc.text(numStr, MARGIN, y);
      const lines = doc.splitTextToSize(`${item.en} (${item.fil})`, textW);
      lines.forEach(line => {
        doc.text(line, MARGIN + 6, y);
        y += 4;
      });
      const boxY = y;
      const boxStartX = pageW - MARGIN - 35;
      for (let r = 1; r <= 5; r++) {
        const bx = boxStartX + (r - 1) * 7;
        drawCheckbox(doc, bx, boxY, 3);
        doc.setFontSize(6);
        doc.text(String(r), bx + 0.7, boxY - 3.5);
      }
      y += 5;
    });
    y += 3;
  });

  y += 4;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'italic');
  y = addWrappedText(doc, 'Maraming salamat po sa inyong oras at pagtugon! Ang inyong feedback ay malaking tulong sa pagpapahusay ng aming sistema at pananaliksik.', MARGIN, y, contentW, 4);

  return doc;
}

/* ================================================================
   3. PHYSICAL DOCUMENTS — Barangay Endorsement & Permit
   ================================================================ */
export function generateEndorsementPdf(cfg = {}) {
  const {
    barangayName = '____________',
    municipality = '____________',
    province = 'Camarines Sur',
    punongBarangay = '____________________________',
    barangaySecretary = '____________________________',
    date = '___________________',
    deploymentDuration = '___________________',
    researchers = [
      'Dennis Leonardo S. Cuadro — BS Computer Engineering',
      'Karl S. Ignacio — BS Computer Engineering',
      'Frank John Paul L. Tresvalles — BS Computer Engineering',
    ],
  } = cfg;

  const doc = new jsPDF(PAGE);
  const pageW = doc.internal.pageSize.getWidth();
  const contentW = pageW - MARGIN * 2;
  let y = MARGIN;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('REPUBLIC OF THE PHILIPPINES', pageW / 2, y, { align: 'center' }); y += 5;
  doc.setFont('helvetica', 'normal');
  doc.text(`Province of ${province}`, pageW / 2, y, { align: 'center' }); y += 5;
  doc.text(`Municipality of ${municipality}`, pageW / 2, y, { align: 'center' }); y += 5;
  doc.setFont('helvetica', 'bold');
  doc.text(`BARANGAY ${barangayName.toUpperCase()}`, pageW / 2, y, { align: 'center' }); y += 10;

  doc.setFontSize(12);
  doc.text('BARANGAY ENDORSEMENT AND PERMIT TO CONDUCT STUDY', pageW / 2, y, { align: 'center' }); y += 10;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Date: ${date}`, MARGIN, y); y += 8;
  doc.text('TO WHOM IT MAY CONCERN:', MARGIN, y); y += 7;

  y = addWrappedText(doc, `This is to certify and endorse that the following researchers from the Ateneo de Naga University, under the program Bachelor of Science in Computer Engineering, have been granted permission to conduct their thesis study entitled:`, MARGIN, y, contentW, 5);
  y += 3;
  doc.setFont('helvetica', 'bolditalic');
  y = addWrappedText(doc, '"Development of a Smart Barangay Kiosk System with Offline-First Document Request Handling and Resident Management"', MARGIN + 10, y, contentW - 20, 5);
  y += 3;
  doc.setFont('helvetica', 'normal');
  y = addWrappedText(doc, `within Barangay ${barangayName}, ${municipality}, ${province}.`, MARGIN, y, contentW, 5);
  y += 5;

  doc.setFont('helvetica', 'bold');
  doc.text('Researchers:', MARGIN, y); y += 5;
  doc.setFont('helvetica', 'normal');
  researchers.forEach(r => {
    doc.text(`\u2022  ${r}`, MARGIN + 5, y); y += 5;
  });
  y += 3;

  doc.text('The barangay administration hereby grants the researchers permission to:', MARGIN, y); y += 6;
  const permissions = [
    'Deploy and test the Smart Barangay Kiosk System at the Barangay Hall;',
    'Collect data from resident users through surveys and system usage logs for academic research purposes;',
    'Conduct demonstrations and user evaluations with willing barangay residents; and',
    'Coordinate with barangay officials and staff for the smooth implementation of the study.',
  ];
  permissions.forEach((p, i) => {
    y = addWrappedText(doc, `${i + 1}. ${p}`, MARGIN + 5, y, contentW - 10, 5);
    y += 1;
  });
  y += 3;

  y = addWrappedText(doc, 'The barangay understands that:', MARGIN, y, contentW, 5); y += 2;
  const understandings = [
    'All data collected will be used solely for academic research purposes;',
    'No personal or sensitive data of residents will be disclosed or shared outside the scope of the study;',
    'The system is deployed as a prototype for research evaluation and not yet for permanent operational use; and',
    'The researchers will comply with the Data Privacy Act of 2012 (Republic Act No. 10173).',
  ];
  understandings.forEach(u => {
    y = addWrappedText(doc, `\u2022  ${u}`, MARGIN + 5, y, contentW - 10, 5);
    y += 1;
  });
  y += 3;
  y = addWrappedText(doc, `The expected duration of the deployment and testing period is ${deploymentDuration}.`, MARGIN, y, contentW, 5);
  y += 3;
  y = addWrappedText(doc, 'This endorsement is issued upon the request of the above-named researchers for academic and documentation purposes.', MARGIN, y, contentW, 5);
  y += 15;

  /* Signatures */
  doc.setFont('helvetica', 'bold');
  doc.text('Certified by:', MARGIN, y); y += 12;
  doc.text('_________________________________________', MARGIN, y); y += 5;
  doc.text(`HON. ${punongBarangay.toUpperCase()}`, MARGIN, y); y += 5;
  doc.setFont('helvetica', 'normal');
  doc.text('Punong Barangay', MARGIN, y); y += 5;
  doc.text(`Barangay ${barangayName}, ${municipality}, ${province}`, MARGIN, y); y += 12;

  doc.setFont('helvetica', 'bold');
  doc.text('Noted by:', MARGIN, y); y += 12;
  doc.text('_________________________________________', MARGIN, y); y += 5;
  doc.text(barangaySecretary.toUpperCase(), MARGIN, y); y += 5;
  doc.setFont('helvetica', 'normal');
  doc.text('Barangay Secretary', MARGIN, y);

  return doc;
}

/* ================================================================
   4. PHYSICAL DOCUMENTS — Certificate of Deployment & Acceptance
   ================================================================ */
export function generateDeploymentCertPdf(cfg = {}) {
  const {
    barangayName = '____________',
    municipality = '____________',
    province = 'Camarines Sur',
    deploymentDuration = '___________________',
    punongBarangay = '____________________________',
    barangaySecretary = '____________________________',
    date = '___________________',
  } = cfg;

  const doc = new jsPDF(PAGE);
  const pageW = doc.internal.pageSize.getWidth();
  const contentW = pageW - MARGIN * 2;
  let y = MARGIN;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('REPUBLIC OF THE PHILIPPINES', pageW / 2, y, { align: 'center' }); y += 5;
  doc.setFont('helvetica', 'normal');
  doc.text(`Province of ${province}`, pageW / 2, y, { align: 'center' }); y += 5;
  doc.text(`Municipality of ${municipality}`, pageW / 2, y, { align: 'center' }); y += 5;
  doc.setFont('helvetica', 'bold');
  doc.text(`BARANGAY ${barangayName.toUpperCase()}`, pageW / 2, y, { align: 'center' }); y += 10;

  doc.setFontSize(12);
  doc.text('CERTIFICATE OF SYSTEM DEPLOYMENT AND ACCEPTANCE', pageW / 2, y, { align: 'center' }); y += 10;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Date: ${date}`, MARGIN, y); y += 8;

  y = addWrappedText(doc, 'This is to certify that the Smart Barangay Kiosk System, developed by the following researchers:', MARGIN, y, contentW, 5);
  y += 3;
  ['Dennis Leonardo S. Cuadro', 'Karl S. Ignacio', 'Frank John Paul L. Tresvalles'].forEach((n, i) => {
    doc.text(`${i + 1}. ${n}`, MARGIN + 5, y); y += 5;
  });
  y += 2;
  y = addWrappedText(doc, 'from the Ateneo de Naga University, BS Computer Engineering Program, has been:', MARGIN, y, contentW, 5);
  y += 4;

  const checkItems = [
    `Deployed at the Barangay Hall of Barangay ${barangayName}, ${municipality}, ${province};`,
    'Tested and evaluated by barangay officials, staff, and resident users;',
    "Accepted as a functional prototype for the purpose of the researchers' thesis study.",
  ];
  checkItems.forEach(item => {
    doc.text('[   ]', MARGIN + 5, y);
    y = addWrappedText(doc, item, MARGIN + 16, y, contentW - 20, 5);
    y += 2;
  });
  y += 3;

  doc.setFont('helvetica', 'bold');
  doc.text('The system includes the following features:', MARGIN, y); y += 5;
  doc.setFont('helvetica', 'normal');
  const features = [
    'Self-service kiosk for walk-in document requests (no account required)',
    'Online/remote document request portal for registered residents',
    'SMS notification for document request status updates',
    'Offline-first capability ensuring functionality even without internet connection',
    'Administrative dashboard for barangay staff',
  ];
  features.forEach(f => {
    doc.text(`\u2022  ${f}`, MARGIN + 5, y); y += 5;
  });
  y += 3;
  y = addWrappedText(doc, `The deployment and testing period was conducted during ${deploymentDuration}.`, MARGIN, y, contentW, 5);
  y += 3;
  y = addWrappedText(doc, 'The barangay confirms that the system was operational during the testing period and that data gathered was used solely for academic research.', MARGIN, y, contentW, 5);
  y += 15;

  doc.setFont('helvetica', 'bold');
  doc.text('Certified by:', MARGIN, y); y += 12;
  doc.text('_________________________________________', MARGIN, y); y += 5;
  doc.text(`HON. ${punongBarangay.toUpperCase()}`, MARGIN, y); y += 5;
  doc.setFont('helvetica', 'normal');
  doc.text('Punong Barangay', MARGIN, y); y += 5;
  doc.text(`Barangay ${barangayName}, ${municipality}, ${province}`, MARGIN, y); y += 12;

  doc.setFont('helvetica', 'bold');
  doc.text('Witnessed by:', MARGIN, y); y += 12;
  doc.text('_________________________________________', MARGIN, y); y += 5;
  doc.text(barangaySecretary.toUpperCase(), MARGIN, y); y += 5;
  doc.setFont('helvetica', 'normal');
  doc.text('Barangay Secretary', MARGIN, y);

  return doc;
}

/* ================================================================
   5. PHYSICAL DOCUMENTS — Informed Consent Form
   ================================================================ */
export function generateConsentFormPdf(cfg = {}) {
  const {
    contactInfo = '[insert email or contact number]',
  } = cfg;

  const doc = new jsPDF(PAGE);
  const pageW = doc.internal.pageSize.getWidth();
  const contentW = pageW - MARGIN * 2;
  let y = MARGIN;

  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('INFORMED CONSENT FORM', pageW / 2, y, { align: 'center' }); y += 10;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('Research Title:', MARGIN, y);
  doc.setFont('helvetica', 'normal');
  y = addWrappedText(doc, 'Development of a Smart Barangay Kiosk System with Offline-First Document Request Handling and Resident Management', MARGIN + 28, y, contentW - 28, 4.5);
  y += 3;
  doc.setFont('helvetica', 'bold');
  doc.text('Researchers:', MARGIN, y);
  doc.setFont('helvetica', 'normal');
  doc.text('Dennis Leonardo S. Cuadro, Karl S. Ignacio, Frank John Paul L. Tresvalles', MARGIN + 25, y); y += 5;
  doc.setFont('helvetica', 'bold');
  doc.text('Institution:', MARGIN, y);
  doc.setFont('helvetica', 'normal');
  doc.text('Ateneo de Naga University \u2014 BS Computer Engineering', MARGIN + 22, y); y += 5;
  doc.setFont('helvetica', 'bold');
  doc.text('Contact:', MARGIN, y);
  doc.setFont('helvetica', 'normal');
  doc.text(contactInfo, MARGIN + 18, y); y += 10;

  doc.setFont('helvetica', 'bold');
  doc.text('Dear Respondent,', MARGIN, y); y += 6;
  doc.setFont('helvetica', 'normal');
  y = addWrappedText(doc, 'You are being invited to participate in a research study. Please read the following information carefully before deciding whether to participate.', MARGIN, y, contentW, 5);
  y += 5;

  doc.setFont('helvetica', 'bold');
  doc.text('Purpose of the Study:', MARGIN, y); y += 5;
  doc.setFont('helvetica', 'normal');
  y = addWrappedText(doc, 'This study aims to develop and evaluate a Smart Barangay Kiosk System that digitalizes document request processes for barangay residents, with offline-first capabilities, SMS notification, and online remote access.', MARGIN, y, contentW, 5);
  y += 5;

  doc.setFont('helvetica', 'bold');
  doc.text('What your participation involves:', MARGIN, y); y += 5;
  doc.setFont('helvetica', 'normal');
  y = addWrappedText(doc, 'You will be asked to use the kiosk system and/or the online document request portal, and complete a survey questionnaire about your experience.', MARGIN, y, contentW, 5);
  y += 5;

  doc.setFont('helvetica', 'bold');
  doc.text('Confidentiality:', MARGIN, y); y += 5;
  doc.setFont('helvetica', 'normal');
  y = addWrappedText(doc, 'All information collected will be treated with strict confidentiality. No personal identifying information will be included in any published report. Data will be stored securely and used only for academic research purposes in compliance with the Data Privacy Act of 2012 (RA 10173).', MARGIN, y, contentW, 5);
  y += 5;

  doc.setFont('helvetica', 'bold');
  doc.text('Voluntary Participation:', MARGIN, y); y += 5;
  doc.setFont('helvetica', 'normal');
  y = addWrappedText(doc, 'Your participation is entirely voluntary. You may withdraw at any time without penalty.', MARGIN, y, contentW, 5);
  y += 8;

  doc.setFont('helvetica', 'bold');
  doc.text('Consent:', MARGIN, y); y += 6;
  doc.setFont('helvetica', 'normal');
  drawCheckbox(doc, MARGIN, y, 4);
  y = addWrappedText(doc, '  I have read and understood the above information. I voluntarily agree to participate in this study.', MARGIN + 6, y, contentW - 10, 5);
  y += 15;

  doc.text('_________________________________________', MARGIN, y); y += 5;
  doc.setFont('helvetica', 'bold');
  doc.text("Respondent's Signature over Printed Name", MARGIN, y); y += 10;
  doc.setFont('helvetica', 'normal');
  doc.text('_________________________________________', MARGIN, y); y += 5;
  doc.text('Date', MARGIN, y);

  return doc;
}

/* ================================================================
   6. PHYSICAL DOCUMENTS — Letter Request to Conduct Study
   ================================================================ */
export function generateLetterRequestPdf(cfg = {}) {
  const {
    barangayName = '____________',
    municipality = '____________',
    province = 'Camarines Sur',
    punongBarangay = '____________________________',
    thesisAdviser = '____________________________',
    date = '___________________',
    deploymentDuration = '___________________',
  } = cfg;

  const doc = new jsPDF(PAGE);
  const pageW = doc.internal.pageSize.getWidth();
  const contentW = pageW - MARGIN * 2;
  let y = MARGIN;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Date: ${date}`, pageW - MARGIN, y, { align: 'right' }); y += 10;

  doc.setFont('helvetica', 'bold');
  doc.text(`HON. ${punongBarangay.toUpperCase()}`, MARGIN, y); y += 5;
  doc.setFont('helvetica', 'normal');
  doc.text('Punong Barangay', MARGIN, y); y += 5;
  doc.text(`Barangay ${barangayName}, ${municipality}`, MARGIN, y); y += 5;
  doc.text(province, MARGIN, y); y += 10;

  doc.setFont('helvetica', 'bold');
  doc.text('Dear Honorable Punong Barangay:', MARGIN, y); y += 7;
  doc.setFont('helvetica', 'normal');

  y = addWrappedText(doc, 'We, the undersigned, are fourth-year students of Ateneo de Naga University pursuing a degree in Bachelor of Science in Computer Engineering. We are currently conducting our thesis entitled:', MARGIN, y, contentW, 5);
  y += 3;
  doc.setFont('helvetica', 'bolditalic');
  y = addWrappedText(doc, '"Development of a Smart Barangay Kiosk System with Offline-First Document Request Handling and Resident Management"', MARGIN + 10, y, contentW - 20, 5);
  y += 5;
  doc.setFont('helvetica', 'normal');
  y = addWrappedText(doc, 'In connection with this, we respectfully request your permission to:', MARGIN, y, contentW, 5);
  y += 3;

  y = addWrappedText(doc, `The expected duration of the deployment and testing is ${deploymentDuration}.`, MARGIN, y, contentW, 5);
  y += 5;

  const requests = [
    'Deploy and test our Smart Barangay Kiosk System at your Barangay Hall;',
    'Conduct surveys and gather feedback from residents who will use the system;',
    'Collect anonymized data from the system for research analysis; and',
    'Coordinate with barangay staff for the smooth conduct of our study.',
  ];
  requests.forEach((r, i) => {
    y = addWrappedText(doc, `${i + 1}. ${r}`, MARGIN + 5, y, contentW - 10, 5);
    y += 1;
  });
  y += 3;
  y = addWrappedText(doc, 'We assure you that all data collected will be treated with utmost confidentiality and will be used solely for academic purposes, in compliance with the Data Privacy Act of 2012 (RA 10173).', MARGIN, y, contentW, 5);
  y += 3;
  y = addWrappedText(doc, 'We hope for your kind consideration and support. Thank you very much.', MARGIN, y, contentW, 5);
  y += 8;
  doc.text('Respectfully yours,', MARGIN, y); y += 12;

  ['Dennis Leonardo S. Cuadro', 'Karl S. Ignacio', 'Frank John Paul L. Tresvalles'].forEach(name => {
    doc.text('_________________________________________', MARGIN, y); y += 5;
    doc.setFont('helvetica', 'bold');
    doc.text(name, MARGIN, y); y += 8;
    doc.setFont('helvetica', 'normal');
  });

  y += 4;
  doc.setFont('helvetica', 'bold');
  doc.text('Noted by:', MARGIN, y); y += 12;
  doc.text('_________________________________________', MARGIN, y); y += 5;
  doc.text(thesisAdviser.toUpperCase(), MARGIN, y); y += 5;
  doc.setFont('helvetica', 'normal');
  doc.text('Thesis Adviser / Department Chair', MARGIN, y); y += 5;
  doc.text('Ateneo de Naga University', MARGIN, y); y += 12;

  doc.setFont('helvetica', 'bold');
  doc.text('Approved:', MARGIN, y); y += 12;
  doc.text('_________________________________________', MARGIN, y); y += 5;
  doc.text(`HON. ${punongBarangay.toUpperCase()}`, MARGIN, y); y += 5;
  doc.setFont('helvetica', 'normal');
  doc.text('Punong Barangay', MARGIN, y);

  return doc;
}
