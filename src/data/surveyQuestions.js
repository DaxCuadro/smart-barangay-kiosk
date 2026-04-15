/**
 * Survey questions for pre-usage and post-usage surveys.
 * Each question uses a 5-point Likert scale (1-5).
 * Bilingual: English with Filipino translation.
 * 
 * These are streamlined versions of the thesis survey questionnaires
 * designed for in-app popup surveys (shorter, more focused).
 */

export const LIKERT_LABELS = {
  1: 'Strongly Disagree',
  2: 'Disagree',
  3: 'Neutral',
  4: 'Agree',
  5: 'Strongly Agree',
};

export const LIKERT_LABELS_SHORT = {
  1: 'SD',
  2: 'D',
  3: 'N',
  4: 'A',
  5: 'SA',
};

/**
 * PRE-USAGE SURVEY — asked BEFORE the resident uses the system
 * Covers: current experience, accessibility, tech readiness, perceived need
 */
export const PRE_SURVEY_QUESTIONS = [
  // Part 1: Current Experience (3 items)
  {
    id: 'pre_1',
    part: 'Current Experience with Document Requests',
    partFil: 'Kasalukuyang Karanasan sa Pag-request ng Dokumento',
    text: 'I am satisfied with the current manual process of requesting barangay documents.',
    textFil: 'Nasisiyahan ako sa kasalukuyang manual na proseso ng pag-request ng barangay documents.',
  },
  {
    id: 'pre_2',
    part: 'Current Experience with Document Requests',
    partFil: 'Kasalukuyang Karanasan sa Pag-request ng Dokumento',
    text: 'The current process of requesting barangay documents is fast and efficient.',
    textFil: 'Mabilis at episyente ang kasalukuyang proseso ng pag-request ng barangay documents.',
  },
  {
    id: 'pre_3',
    part: 'Current Experience with Document Requests',
    partFil: 'Kasalukuyang Karanasan sa Pag-request ng Dokumento',
    text: 'I find it convenient to personally go to the barangay hall every time I need a document.',
    textFil: 'Maginhawa para sa akin ang personal na pagpunta sa barangay hall tuwing kailangan ko ng dokumento.',
  },
  {
    id: 'pre_4',
    part: 'Current Experience with Document Requests',
    partFil: 'Kasalukuyang Karanasan sa Pag-request ng Dokumento',
    text: 'I rarely experience long waiting times when requesting documents at the barangay.',
    textFil: 'Bihira akong makaranas ng mahabang oras ng paghihintay sa pag-request ng dokumento sa barangay.',
  },
  {
    id: 'pre_5',
    part: 'Current Experience with Document Requests',
    partFil: 'Kasalukuyang Karanasan sa Pag-request ng Dokumento',
    text: 'I am always informed about the status of my document request (e.g., if it is ready for pickup).',
    textFil: 'Lagi akong napapabalitaan tungkol sa status ng aking document request.',
  },
  // Part 2: Accessibility (3 items)
  {
    id: 'pre_6',
    part: 'Accessibility and Inclusivity',
    partFil: 'Accessibility at Inclusivity ng Serbisyo',
    text: 'The barangay\'s current document request process is accessible to all residents, including senior citizens and PWDs.',
    textFil: 'Ang kasalukuyang proseso ng barangay ay accessible sa lahat ng residente, kasama ang mga senior citizen at PWD.',
  },
  {
    id: 'pre_7',
    part: 'Accessibility and Inclusivity',
    partFil: 'Accessibility at Inclusivity ng Serbisyo',
    text: 'I can easily request barangay documents even during my work hours or busy schedule.',
    textFil: 'Madali akong makapag-request ng barangay documents kahit sa oras ng trabaho o abala akong schedule.',
  },
  {
    id: 'pre_8',
    part: 'Accessibility and Inclusivity',
    partFil: 'Accessibility at Inclusivity ng Serbisyo',
    text: 'I have no difficulty communicating my document request needs to barangay staff.',
    textFil: 'Wala akong hirap sa pakikipag-communicate sa barangay staff tungkol sa aking pangangailangan ng dokumento.',
  },
  // Part 3: Technology Readiness (4 items)
  {
    id: 'pre_9',
    part: 'Technology Readiness',
    partFil: 'Kahandaan sa Teknolohiya',
    text: 'I am comfortable using digital devices such as smartphones, tablets, or computers.',
    textFil: 'Komportable akong gumamit ng mga digital device tulad ng smartphone, tablet, o computer.',
  },
  {
    id: 'pre_10',
    part: 'Technology Readiness',
    partFil: 'Kahandaan sa Teknolohiya',
    text: 'I am familiar with using self-service kiosks or touch-screen machines (e.g., ATMs, payment terminals).',
    textFil: 'Pamilyar ako sa paggamit ng self-service kiosk o touch-screen machines tulad ng ATM at payment terminals.',
  },
  {
    id: 'pre_11',
    part: 'Technology Readiness',
    partFil: 'Kahandaan sa Teknolohiya',
    text: 'I have access to a smartphone or computer with internet connection at home.',
    textFil: 'May access ako sa smartphone o computer na may internet connection sa bahay.',
  },
  {
    id: 'pre_12',
    part: 'Technology Readiness',
    partFil: 'Kahandaan sa Teknolohiya',
    text: 'I am open to using a computerized system for requesting barangay documents.',
    textFil: 'Bukas akong gumamit ng computerized system para sa pag-request ng barangay documents.',
  },
  // Part 4: Perceived Need (3 items)
  {
    id: 'pre_13',
    part: 'Perceived Need for Digital Innovation',
    partFil: 'Pangangailangan sa Digital na Inobasyon',
    text: 'I believe the barangay needs a digital/computerized system for processing document requests.',
    textFil: 'Naniniwala akong kailangan ng barangay ang isang digital/computerized system para sa pagproseso ng document requests.',
  },
  {
    id: 'pre_14',
    part: 'Perceived Need for Digital Innovation',
    partFil: 'Pangangailangan sa Digital na Inobasyon',
    text: 'A system that allows me to request documents from home (online) would be very helpful.',
    textFil: 'Ang system na magpapahintulot sa akin na mag-request ng dokumento mula sa bahay ay magiging napakakapaki-pakinabang.',
  },
  {
    id: 'pre_15',
    part: 'Perceived Need for Digital Innovation',
    partFil: 'Pangangailangan sa Digital na Inobasyon',
    text: 'Receiving SMS notifications about my document request status would improve my experience.',
    textFil: 'Ang pagtanggap ng SMS notification tungkol sa status ng aking document request ay magpapahusay ng aking karanasan.',
  },
];

/**
 * POST-USAGE SURVEY — asked AFTER the resident has used the system
 * Covers: usability, efficiency, accessibility, reliability, SMS, satisfaction
 */
export const POST_SURVEY_QUESTIONS = [
  // Part 1: Ease of Use (5 items)
  {
    id: 'post_1',
    part: 'Ease of Use / Usability',
    partFil: 'Kaginhawahan sa Paggamit',
    text: 'The system was easy to understand and navigate, even without prior training.',
    textFil: 'Madaling intindihin at i-navigate ang sistema kahit walang naunang pagsasanay.',
  },
  {
    id: 'post_2',
    part: 'Ease of Use / Usability',
    partFil: 'Kaginhawahan sa Paggamit',
    text: 'The on-screen instructions and labels were clear and easy to follow.',
    textFil: 'Ang mga instructions at labels sa screen ay malinaw at madaling sundin.',
  },
  {
    id: 'post_3',
    part: 'Ease of Use / Usability',
    partFil: 'Kaginhawahan sa Paggamit',
    text: 'I was able to complete my document request without needing assistance from barangay staff.',
    textFil: 'Nakumpleto ko ang aking document request nang hindi na kailangan ng tulong mula sa barangay staff.',
  },
  {
    id: 'post_4',
    part: 'Ease of Use / Usability',
    partFil: 'Kaginhawahan sa Paggamit',
    text: 'The system\'s interface design is user-friendly and visually appealing.',
    textFil: 'Ang disenyo ng interface ng sistema ay user-friendly at maganda sa paningin.',
  },
  {
    id: 'post_5',
    part: 'Ease of Use / Usability',
    partFil: 'Kaginhawahan sa Paggamit',
    text: 'I feel confident that I can use the system again on my own in the future.',
    textFil: 'Kumpiyansa akong magamit muli ang sistema mag-isa sa susunod.',
  },
  // Part 2: Efficiency (3 items)
  {
    id: 'post_6',
    part: 'Efficiency and Speed',
    partFil: 'Episyensya at Bilis',
    text: 'Using the system, I was able to request a document faster compared to the traditional manual process.',
    textFil: 'Sa paggamit ng sistema, mas mabilis akong nakapag-request ng dokumento kumpara sa tradisyonal na manual na proseso.',
  },
  {
    id: 'post_7',
    part: 'Efficiency and Speed',
    partFil: 'Episyensya at Bilis',
    text: 'The number of steps required to complete a request was reasonable and not excessive.',
    textFil: 'Ang bilang ng mga hakbang na kinailangan para makumpleto ang request ay makatuwiran at hindi labis.',
  },
  {
    id: 'post_8',
    part: 'Efficiency and Speed',
    partFil: 'Episyensya at Bilis',
    text: 'The system processed my request without significant delays or errors.',
    textFil: 'Naproseso ng sistema ang aking request nang walang malaking delay o error.',
  },
  // Part 3: Accessibility (4 items)
  {
    id: 'post_9',
    part: 'Accessibility and Convenience',
    partFil: 'Accessibility at Kaginhawahan',
    text: 'The kiosk at the barangay hall is easy to access and use for walk-in residents.',
    textFil: 'Ang kiosk sa barangay hall ay madaling puntahan at gamitin ng mga walk-in na residente.',
  },
  {
    id: 'post_10',
    part: 'Accessibility and Convenience',
    partFil: 'Accessibility at Kaginhawahan',
    text: 'The option to request documents online (remotely) is very convenient.',
    textFil: 'Ang opsiyong mag-request ng dokumento online (remotely) ay napakaconvenient.',
  },
  {
    id: 'post_11',
    part: 'Accessibility and Convenience',
    partFil: 'Accessibility at Kaginhawahan',
    text: 'The system makes barangay document requests more accessible to senior citizens, PWDs, and busy residents.',
    textFil: 'Ginagawang mas accessible ng sistema ang document requests para sa senior citizens, PWDs, at mga abala na residente.',
  },
  {
    id: 'post_12',
    part: 'Accessibility and Convenience',
    partFil: 'Accessibility at Kaginhawahan',
    text: 'I can request documents at a time that is convenient for me, not limited to office hours.',
    textFil: 'Makakapag-request ako ng dokumento sa oras na convenient sa akin, hindi limitado sa office hours.',
  },
  // Part 4: Reliability (3 items)
  {
    id: 'post_13',
    part: 'Reliability and Offline Capability',
    partFil: 'Reliability at Offline na Kakayahan',
    text: 'The system worked properly even when internet connection was slow or unavailable.',
    textFil: 'Gumana nang maayos ang sistema kahit mabagal o walang internet connection.',
  },
  {
    id: 'post_14',
    part: 'Reliability and Offline Capability',
    partFil: 'Reliability at Offline na Kakayahan',
    text: 'I did not experience any system crash or major technical issue during my use.',
    textFil: 'Hindi ako nakaranas ng anumang system crash o major technical issue habang ginagamit ko ito.',
  },
  {
    id: 'post_15',
    part: 'Reliability and Offline Capability',
    partFil: 'Reliability at Offline na Kakayahan',
    text: 'I trust that my document request was properly recorded and will be processed.',
    textFil: 'Nagtitiwala akong ang aking document request ay maayos na naitala at ipoproseso.',
  },
  // Part 5: SMS (3 items)
  {
    id: 'post_16',
    part: 'SMS Notification and Communication',
    partFil: 'SMS Notification at Komunikasyon',
    text: 'I received an SMS notification about the status of my document request.',
    textFil: 'Nakatanggap ako ng SMS notification tungkol sa status ng aking document request.',
  },
  {
    id: 'post_17',
    part: 'SMS Notification and Communication',
    partFil: 'SMS Notification at Komunikasyon',
    text: 'The SMS notification was timely and helped me know when to pick up my document.',
    textFil: 'Ang SMS notification ay napapanahon at nakatulong sa akin na malaman kung kailan kukunin ang aking dokumento.',
  },
  {
    id: 'post_18',
    part: 'SMS Notification and Communication',
    partFil: 'SMS Notification at Komunikasyon',
    text: 'The SMS feature reduced the need for me to follow up in person at the barangay hall.',
    textFil: 'Ang SMS feature ay nagbawas ng pangangailangan kong mag-follow up nang personal sa barangay hall.',
  },
  // Part 6: Overall Satisfaction (5 items)
  {
    id: 'post_19',
    part: 'Overall Satisfaction and Impact',
    partFil: 'Pangkalahatang Kasiyahan at Epekto',
    text: 'Overall, I am satisfied with my experience using the Smart Barangay Kiosk System.',
    textFil: 'Sa pangkalahatan, nasisiyahan ako sa aking karanasan sa paggamit ng Smart Barangay Kiosk System.',
  },
  {
    id: 'post_20',
    part: 'Overall Satisfaction and Impact',
    partFil: 'Pangkalahatang Kasiyahan at Epekto',
    text: 'The system significantly improved the way I request barangay documents compared to the old process.',
    textFil: 'Lubos na pinahusay ng sistema ang paraan ng pag-request ko ng barangay documents kumpara sa lumang proseso.',
  },
  {
    id: 'post_21',
    part: 'Overall Satisfaction and Impact',
    partFil: 'Pangkalahatang Kasiyahan at Epekto',
    text: 'I would recommend this system to other residents in our barangay.',
    textFil: 'Irerekomenda ko ang sistemang ito sa ibang mga residente ng aming barangay.',
  },
  {
    id: 'post_22',
    part: 'Overall Satisfaction and Impact',
    partFil: 'Pangkalahatang Kasiyahan at Epekto',
    text: 'I prefer using this system over the traditional manual process for future document requests.',
    textFil: 'Mas gusto ko ang paggamit ng sistemang ito kaysa sa tradisyonal na manual na proseso para sa mga susunod na document requests.',
  },
  {
    id: 'post_23',
    part: 'Overall Satisfaction and Impact',
    partFil: 'Pangkalahatang Kasiyahan at Epekto',
    text: 'I believe this system should be permanently adopted by the barangay.',
    textFil: 'Naniniwala akong dapat permanenteng gamitin ng barangay ang sistemang ito.',
  },
];

/**
 * ADMIN PRE-USAGE SURVEY — asked BEFORE the official/secretary uses the system
 * Covers: current workflow, challenges, technology readiness, expectations
 */
export const ADMIN_PRE_SURVEY_QUESTIONS = [
  // Part 1: Current Workflow (4 items)
  {
    id: 'admin_pre_1',
    part: 'Current Document Processing Workflow',
    partFil: 'Kasalukuyang Proseso ng Pagproseso ng Dokumento',
    text: 'I am satisfied with the current manual process of handling barangay document requests.',
    textFil: 'Nasisiyahan ako sa kasalukuyang manual na proseso ng pag-asikaso ng mga document request sa barangay.',
  },
  {
    id: 'admin_pre_2',
    part: 'Current Document Processing Workflow',
    partFil: 'Kasalukuyang Proseso ng Pagproseso ng Dokumento',
    text: 'The current manual process allows me to process document requests quickly and efficiently.',
    textFil: 'Ang kasalukuyang manual na proseso ay nagpapahintulot sa akin na maproseso ang mga document request nang mabilis at episyente.',
  },
  {
    id: 'admin_pre_3',
    part: 'Current Document Processing Workflow',
    partFil: 'Kasalukuyang Proseso ng Pagproseso ng Dokumento',
    text: 'It is easy to keep track of all pending, in-progress, and completed document requests manually.',
    textFil: 'Madaling subaybayan ang lahat ng pending, in-progress, at completed na document requests nang manual.',
  },
  {
    id: 'admin_pre_4',
    part: 'Current Document Processing Workflow',
    partFil: 'Kasalukuyang Proseso ng Pagproseso ng Dokumento',
    text: 'I rarely encounter problems with lost or misplaced document requests in the current system.',
    textFil: 'Bihira akong makatagpo ng problema sa nawawala o natraspapel na document requests sa kasalukuyang sistema.',
  },
  // Part 2: Challenges (4 items)
  {
    id: 'admin_pre_5',
    part: 'Challenges in Current Operations',
    partFil: 'Mga Hamon sa Kasalukuyang Operasyon',
    text: 'Managing document requests during peak hours is difficult with the current manual process.',
    textFil: 'Mahirap pamahalaan ang mga document request sa oras ng dami ng tao gamit ang kasalukuyang manual na proseso.',
  },
  {
    id: 'admin_pre_6',
    part: 'Challenges in Current Operations',
    partFil: 'Mga Hamon sa Kasalukuyang Operasyon',
    text: 'Residents frequently follow up in person about the status of their document requests.',
    textFil: 'Madalas na personal na nag-follow up ang mga residente tungkol sa status ng kanilang document request.',
  },
  {
    id: 'admin_pre_7',
    part: 'Challenges in Current Operations',
    partFil: 'Mga Hamon sa Kasalukuyang Operasyon',
    text: 'Record-keeping and generating reports on document requests is time-consuming.',
    textFil: 'Ang pag-iingat ng rekord at paggawa ng mga ulat tungkol sa document requests ay matagal.',
  },
  {
    id: 'admin_pre_8',
    part: 'Challenges in Current Operations',
    partFil: 'Mga Hamon sa Kasalukuyang Operasyon',
    text: 'I sometimes have difficulty verifying resident information for document processing.',
    textFil: 'Minsan nahihirapan akong i-verify ang impormasyon ng residente para sa pagproseso ng dokumento.',
  },
  // Part 3: Technology Readiness (3 items)
  {
    id: 'admin_pre_9',
    part: 'Technology Readiness',
    partFil: 'Kahandaan sa Teknolohiya',
    text: 'I am comfortable using computers and digital tools for my work at the barangay.',
    textFil: 'Komportable akong gumamit ng mga computer at digital tools para sa aking trabaho sa barangay.',
  },
  {
    id: 'admin_pre_10',
    part: 'Technology Readiness',
    partFil: 'Kahandaan sa Teknolohiya',
    text: 'I am willing to learn and adapt to a new computerized system for managing document requests.',
    textFil: 'Handa akong matuto at mag-adapt sa bagong computerized system para sa pamamahala ng document requests.',
  },
  {
    id: 'admin_pre_11',
    part: 'Technology Readiness',
    partFil: 'Kahandaan sa Teknolohiya',
    text: 'I believe that a digital system can improve the efficiency of our barangay services.',
    textFil: 'Naniniwala akong ang isang digital system ay makakapagpahusay ng episyensya ng aming mga serbisyo sa barangay.',
  },
  // Part 4: Expectations (3 items)
  {
    id: 'admin_pre_12',
    part: 'Expectations for Digital Innovation',
    partFil: 'Mga Inaasahan sa Digital na Inobasyon',
    text: 'I expect a kiosk system to reduce the workload of barangay staff in processing documents.',
    textFil: 'Inaasahan ko na ang isang kiosk system ay magbabawas ng workload ng barangay staff sa pagproseso ng mga dokumento.',
  },
  {
    id: 'admin_pre_13',
    part: 'Expectations for Digital Innovation',
    partFil: 'Mga Inaasahan sa Digital na Inobasyon',
    text: 'A system that allows online/remote document requests would greatly help our barangay operations.',
    textFil: 'Ang isang system na nagpapahintulot ng online/remote na document request ay lubos na makakatulong sa aming operasyon sa barangay.',
  },
  {
    id: 'admin_pre_14',
    part: 'Expectations for Digital Innovation',
    partFil: 'Mga Inaasahan sa Digital na Inobasyon',
    text: 'Automated SMS notifications for residents would reduce follow-up inquiries to barangay staff.',
    textFil: 'Ang automated SMS notifications para sa mga residente ay magbabawas ng follow-up inquiries sa barangay staff.',
  },
];

/**
 * ADMIN POST-USAGE SURVEY — asked AFTER the official/secretary has used the system
 * Covers: ease of use, efficiency, features, reliability, satisfaction
 */
export const ADMIN_POST_SURVEY_QUESTIONS = [
  // Part 1: Ease of Use (4 items)
  {
    id: 'admin_post_1',
    part: 'Ease of Use / Usability',
    partFil: 'Kaginhawahan sa Paggamit',
    text: 'The admin dashboard was easy to understand and navigate, even without extensive training.',
    textFil: 'Madaling intindihin at i-navigate ang admin dashboard kahit walang masusing pagsasanay.',
  },
  {
    id: 'admin_post_2',
    part: 'Ease of Use / Usability',
    partFil: 'Kaginhawahan sa Paggamit',
    text: 'The interface for managing document requests (view, process, release) is clear and intuitive.',
    textFil: 'Ang interface para sa pamamahala ng document requests (tingnan, iproseso, i-release) ay malinaw at madaling gamitin.',
  },
  {
    id: 'admin_post_3',
    part: 'Ease of Use / Usability',
    partFil: 'Kaginhawahan sa Paggamit',
    text: 'I can easily track the status of all requests from pending to released.',
    textFil: 'Madali kong masubaybayan ang status ng lahat ng requests mula pending hanggang released.',
  },
  {
    id: 'admin_post_4',
    part: 'Ease of Use / Usability',
    partFil: 'Kaginhawahan sa Paggamit',
    text: 'The overall layout and design of the admin panel is user-friendly and visually organized.',
    textFil: 'Ang kabuuang layout at disenyo ng admin panel ay user-friendly at maayos ang pagkaka-organize.',
  },
  // Part 2: Efficiency and Speed (4 items)
  {
    id: 'admin_post_5',
    part: 'Efficiency and Speed',
    partFil: 'Episyensya at Bilis',
    text: 'Using the system, I can process document requests faster compared to the manual process.',
    textFil: 'Sa paggamit ng sistema, mas mabilis kong napoproseso ang mga document request kumpara sa manual na proseso.',
  },
  {
    id: 'admin_post_6',
    part: 'Efficiency and Speed',
    partFil: 'Episyensya at Bilis',
    text: 'The request queue system (pending → in progress → ready → released) improved my workflow.',
    textFil: 'Ang request queue system (pending → in progress → ready → released) ay nagpahusay sa aking workflow.',
  },
  {
    id: 'admin_post_7',
    part: 'Efficiency and Speed',
    partFil: 'Episyensya at Bilis',
    text: 'The system reduced the number of in-person follow-ups from residents about their request status.',
    textFil: 'Ang sistema ay nagbawas ng bilang ng personal na follow-up mula sa mga residente tungkol sa status ng kanilang request.',
  },
  {
    id: 'admin_post_8',
    part: 'Efficiency and Speed',
    partFil: 'Episyensya at Bilis',
    text: 'Record-keeping and viewing release logs is easier with the system than with manual records.',
    textFil: 'Ang pag-iingat ng rekord at pagtingin ng release logs ay mas madali sa sistema kaysa sa manual na rekord.',
  },
  // Part 3: System Features (4 items)
  {
    id: 'admin_post_9',
    part: 'System Features',
    partFil: 'Mga Feature ng Sistema',
    text: 'The SMS notification feature is useful for informing residents about their document status.',
    textFil: 'Ang SMS notification feature ay kapaki-pakinabang para sa pagpapaalam sa mga residente tungkol sa status ng kanilang dokumento.',
  },
  {
    id: 'admin_post_10',
    part: 'System Features',
    partFil: 'Mga Feature ng Sistema',
    text: 'The resident verification feature helps ensure only legitimate residents can request documents.',
    textFil: 'Ang resident verification feature ay nakakatulong na matiyak na tanging mga lehitimong residente lamang ang makapag-request ng dokumento.',
  },
  {
    id: 'admin_post_11',
    part: 'System Features',
    partFil: 'Mga Feature ng Sistema',
    text: 'The calendar and announcements features are useful for managing barangay communications.',
    textFil: 'Ang calendar at announcements features ay kapaki-pakinabang para sa pamamahala ng komunikasyon sa barangay.',
  },
  {
    id: 'admin_post_12',
    part: 'System Features',
    partFil: 'Mga Feature ng Sistema',
    text: 'The feedback from residents displayed in the system helps improve barangay services.',
    textFil: 'Ang feedback mula sa mga residente na ipinapakita sa sistema ay nakakatulong sa pagpapahusay ng serbisyo ng barangay.',
  },
  // Part 4: Reliability (3 items)
  {
    id: 'admin_post_13',
    part: 'Reliability and Offline Capability',
    partFil: 'Reliability at Offline na Kakayahan',
    text: 'The system worked reliably even during slow or intermittent internet connections.',
    textFil: 'Gumana nang maayos ang sistema kahit sa mabagal o pabugso-bugsong internet connection.',
  },
  {
    id: 'admin_post_14',
    part: 'Reliability and Offline Capability',
    partFil: 'Reliability at Offline na Kakayahan',
    text: 'I did not experience system crashes or data loss while processing requests.',
    textFil: 'Hindi ako nakaranas ng system crash o pagkawala ng data habang nagpoproseso ng mga request.',
  },
  {
    id: 'admin_post_15',
    part: 'Reliability and Offline Capability',
    partFil: 'Reliability at Offline na Kakayahan',
    text: 'I trust that all document requests and release logs are properly saved in the system.',
    textFil: 'Nagtitiwala akong ang lahat ng document requests at release logs ay maayos na naka-save sa sistema.',
  },
  // Part 5: Overall Satisfaction (4 items)
  {
    id: 'admin_post_16',
    part: 'Overall Satisfaction and Impact',
    partFil: 'Pangkalahatang Kasiyahan at Epekto',
    text: 'Overall, I am satisfied with the Smart Barangay Kiosk System as a tool for managing document requests.',
    textFil: 'Sa pangkalahatan, nasisiyahan ako sa Smart Barangay Kiosk System bilang isang tool para sa pamamahala ng document requests.',
  },
  {
    id: 'admin_post_17',
    part: 'Overall Satisfaction and Impact',
    partFil: 'Pangkalahatang Kasiyahan at Epekto',
    text: 'The system has significantly improved the efficiency of our barangay document processing.',
    textFil: 'Lubos na pinahusay ng sistema ang episyensya ng aming pagproseso ng dokumento sa barangay.',
  },
  {
    id: 'admin_post_18',
    part: 'Overall Satisfaction and Impact',
    partFil: 'Pangkalahatang Kasiyahan at Epekto',
    text: 'I would recommend this system to other barangays for managing their document request services.',
    textFil: 'Irerekomenda ko ang sistemang ito sa ibang mga barangay para sa pamamahala ng kanilang document request services.',
  },
  {
    id: 'admin_post_19',
    part: 'Overall Satisfaction and Impact',
    partFil: 'Pangkalahatang Kasiyahan at Epekto',
    text: 'I prefer using this system over the traditional manual process for future document management.',
    textFil: 'Mas gusto ko ang paggamit ng sistemang ito kaysa sa tradisyonal na manual na proseso para sa pamamahala ng dokumento sa hinaharap.',
  },
];

/** Get unique parts in order for a question list */
export function getSurveyParts(questions) {
  const seen = new Set();
  return questions.reduce((acc, q) => {
    if (!seen.has(q.part)) {
      seen.add(q.part);
      acc.push({ part: q.part, partFil: q.partFil });
    }
    return acc;
  }, []);
}
