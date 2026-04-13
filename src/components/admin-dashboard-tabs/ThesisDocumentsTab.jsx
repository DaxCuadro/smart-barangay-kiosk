import { useState, useCallback } from 'react';
import {
  generatePreTestPdf,
  generatePostEvalPdf,
  generateEndorsementPdf,
  generateDeploymentCertPdf,
  generateConsentFormPdf,
  generateLetterRequestPdf,
} from '../../utils/generateThesisDocsPdf';

/* ─── tiny section wrapper ─────────────────────────────── */
function Field({ label, value, onChange, textarea, placeholder }) {
  const cls = 'mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-indigo-400 focus:ring-1 focus:ring-indigo-300';
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      {textarea ? (
        <textarea className={cls + ' min-h-14'} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={2} />
      ) : (
        <input className={cls} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
      )}
    </label>
  );
}

/* ─── card for each document type ──────────────────────── */
function DocCard({ title, description, color, children, onGenerate, generating }) {
  const ring = { indigo: 'border-indigo-100 bg-indigo-50', emerald: 'border-emerald-100 bg-emerald-50', amber: 'border-amber-100 bg-amber-50', rose: 'border-rose-100 bg-rose-50', violet: 'border-violet-100 bg-violet-50', cyan: 'border-cyan-100 bg-cyan-50' };
  const btn = { indigo: 'bg-indigo-600 hover:bg-indigo-500', emerald: 'bg-emerald-600 hover:bg-emerald-500', amber: 'bg-amber-600 hover:bg-amber-500', rose: 'bg-rose-600 hover:bg-rose-500', violet: 'bg-violet-600 hover:bg-violet-500', cyan: 'bg-cyan-600 hover:bg-cyan-500' };
  const tag = { indigo: 'text-indigo-600', emerald: 'text-emerald-600', amber: 'text-amber-600', rose: 'text-rose-600', violet: 'text-violet-600', cyan: 'text-cyan-600' };
  return (
    <section className={`rounded-2xl border p-5 shadow-md ${ring[color] || ring.indigo}`}>
      <p className={`text-xs font-semibold uppercase tracking-widest ${tag[color] || tag.indigo}`}>Thesis Document</p>
      <h3 className="mt-1 text-lg font-bold text-slate-900">{title}</h3>
      <p className="mt-1 text-sm text-slate-600">{description}</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">{children}</div>
      <button
        type="button"
        onClick={onGenerate}
        disabled={generating}
        className={`mt-4 inline-flex items-center gap-2 rounded-full px-5 py-2 text-sm font-semibold text-white shadow ${btn[color] || btn.indigo} disabled:opacity-50`}
      >
        {generating ? 'Generating…' : '↓ Generate PDF'}
      </button>
    </section>
  );
}

/* ================================================================ */
export default function ThesisDocumentsTab() {
  /* ── Shared fields ── */
  const [researchers, setResearchers] = useState('Dennis Leonardo S. Cuadro | Frank John Paul L. Tresvalles | Karl S. Ignacio');
  const [program, setProgram] = useState('BS Computer Engineering, Ateneo de Naga University');
  const [partnerBarangays, setPartnerBarangays] = useState('Brgy. Maangas & Brgy. Santa Maria, Presentacion, Camarines Sur');
  const [brgyOptions, setBrgyOptions] = useState('Brgy. Maangas, Presentacion\nBrgy. Santa Maria, Presentacion');

  /* ── Physical doc fields ── */
  const [brgyName, setBrgyName] = useState('');
  const [municipality, setMunicipality] = useState('Presentacion');
  const [province, setProvince] = useState('Camarines Sur');
  const [punong, setPunong] = useState('');
  const [secretary, setSecretary] = useState('');
  const [adviser, setAdviser] = useState('');
  const [contactInfo, setContactInfo] = useState('');
  const [docDate, setDocDate] = useState('');
  const [deploymentDuration, setDeploymentDuration] = useState('');

  const [generating, setGenerating] = useState(null);

  const parseBrgyOptions = useCallback(() => brgyOptions.split('\n').map(s => s.trim()).filter(Boolean), [brgyOptions]);

  /* ── generators ── */
  const handleGenerate = useCallback(async (type) => {
    setGenerating(type);
    try {
      const shared = { researchers, program, partnerBarangays, barangayOptions: parseBrgyOptions() };
      const physicalShared = { barangayName: brgyName || '____________', municipality: municipality || '____________', province, punongBarangay: punong || '____________________________', barangaySecretary: secretary || '____________________________', date: docDate || '___________________', deploymentDuration: deploymentDuration || '___________________' };
      let doc;
      let filename;
      switch (type) {
        case 'pre-test':
          doc = generatePreTestPdf(shared);
          filename = 'Pre-Test_Survey_Questionnaire.pdf';
          break;
        case 'post-eval':
          doc = generatePostEvalPdf(shared);
          filename = 'Post-Evaluation_Survey_Questionnaire.pdf';
          break;
        case 'endorsement':
          doc = generateEndorsementPdf(physicalShared);
          filename = `Barangay_Endorsement_${brgyName || 'Template'}.pdf`;
          break;
        case 'deployment':
          doc = generateDeploymentCertPdf(physicalShared);
          filename = `Certificate_of_Deployment_${brgyName || 'Template'}.pdf`;
          break;
        case 'consent':
          doc = generateConsentFormPdf({ contactInfo: contactInfo || '[insert email or contact number]' });
          filename = 'Informed_Consent_Form.pdf';
          break;
        case 'letter':
          doc = generateLetterRequestPdf({ ...physicalShared, thesisAdviser: adviser || '____________________________' });
          filename = `Letter_Request_${brgyName || 'Template'}.pdf`;
          break;
        default:
          return;
      }
      doc.save(filename);
    } finally {
      setGenerating(null);
    }
  }, [researchers, program, partnerBarangays, parseBrgyOptions, brgyName, municipality, province, punong, secretary, adviser, contactInfo, docDate, deploymentDuration]);

  const generateAll = useCallback(async () => {
    for (const type of ['pre-test', 'post-eval', 'endorsement', 'deployment', 'consent', 'letter']) {
      await handleGenerate(type);
    }
  }, [handleGenerate]);

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-violet-600">Thesis Tools</p>
          <h2 className="text-xl font-bold text-slate-900">Thesis Documents Generator</h2>
          <p className="mt-1 text-sm text-slate-500">Generate printable PDF surveys and physical documents. Edit any field before generating.</p>
        </div>
        <button type="button" onClick={generateAll} className="rounded-full bg-violet-600 px-5 py-2 text-sm font-semibold text-white shadow hover:bg-violet-500">
          ↓ Generate All PDFs
        </button>
      </div>

      {/* ── Shared Config ── */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-md">
        <h3 className="text-sm font-bold text-slate-700 uppercase tracking-widest">Shared Information (applies to surveys)</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Researchers" value={researchers} onChange={setResearchers} />
          <Field label="Program" value={program} onChange={setProgram} />
          <Field label="Partner Barangays" value={partnerBarangays} onChange={setPartnerBarangays} />
          <Field label="Barangay Options (one per line)" value={brgyOptions} onChange={setBrgyOptions} textarea placeholder="Brgy. Name, Municipality" />
        </div>
      </section>

      {/* ── Survey Documents ── */}
      <div>
        <h3 className="mb-3 text-sm font-bold text-slate-500 uppercase tracking-widest">Survey Questionnaires</h3>
        <div className="grid gap-4 lg:grid-cols-2">
          <DocCard
            title="Pre-Test Survey"
            description="15-item questionnaire about residents' current experience before using the system."
            color="indigo"
            onGenerate={() => handleGenerate('pre-test')}
            generating={generating === 'pre-test'}
          >
            <div className="col-span-2 rounded-xl bg-white/60 p-3 text-xs text-slate-500">
              <p className="font-semibold text-slate-700">Sections included:</p>
              <ul className="mt-1 list-disc pl-4 space-y-0.5">
                <li>Current Experience (5 items)</li>
                <li>Accessibility & Inclusivity (3 items)</li>
                <li>Technology Readiness (4 items)</li>
                <li>Perceived Need for Innovation (3 items)</li>
              </ul>
            </div>
          </DocCard>
          <DocCard
            title="Post-Evaluation Survey"
            description="23-item questionnaire for residents after using the kiosk or online system."
            color="emerald"
            onGenerate={() => handleGenerate('post-eval')}
            generating={generating === 'post-eval'}
          >
            <div className="col-span-2 rounded-xl bg-white/60 p-3 text-xs text-slate-500">
              <p className="font-semibold text-slate-700">Sections included:</p>
              <ul className="mt-1 list-disc pl-4 space-y-0.5">
                <li>Ease of Use / Usability (5 items)</li>
                <li>Efficiency and Speed (3 items)</li>
                <li>Accessibility and Convenience (4 items)</li>
                <li>Reliability and Offline Capability (3 items)</li>
                <li>SMS Notification (3 items)</li>
                <li>Overall Satisfaction & Impact (5 items)</li>
              </ul>
            </div>
          </DocCard>
        </div>
      </div>

      {/* ── Physical / Legal Documents ── */}
      <div>
        <h3 className="mb-3 text-sm font-bold text-slate-500 uppercase tracking-widest">Physical Documents (for signing)</h3>
        <section className="mb-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-md">
          <h4 className="text-sm font-bold text-slate-700 uppercase tracking-widest">Barangay Details (applies to physical docs)</h4>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Barangay Name" value={brgyName} onChange={setBrgyName} placeholder="e.g. Maangas" />
            <Field label="Municipality" value={municipality} onChange={setMunicipality} placeholder="e.g. Presentacion" />
            <Field label="Province" value={province} onChange={setProvince} />
            <Field label="Punong Barangay" value={punong} onChange={setPunong} placeholder="Full name" />
            <Field label="Barangay Secretary" value={secretary} onChange={setSecretary} placeholder="Full name" />
            <Field label="Thesis Adviser" value={adviser} onChange={setAdviser} placeholder="Full name" />
            <Field label="Contact Info (for consent form)" value={contactInfo} onChange={setContactInfo} placeholder="Email or phone" />
            <Field label="Date" value={docDate} onChange={setDocDate} placeholder="e.g. April 13, 2026" />
            <Field label="Deployment/Testing Duration" value={deploymentDuration} onChange={setDeploymentDuration} placeholder="e.g. March 15 – April 15, 2026" />
          </div>
        </section>

        <div className="grid gap-4 lg:grid-cols-2">
          <DocCard
            title="Barangay Endorsement & Permit"
            description="Official permit from the Punong Barangay authorizing the study."
            color="amber"
            onGenerate={() => handleGenerate('endorsement')}
            generating={generating === 'endorsement'}
          >
            <div className="col-span-2 text-xs text-slate-500">Signed by: Punong Barangay + Barangay Secretary</div>
          </DocCard>
          <DocCard
            title="Certificate of Deployment & Acceptance"
            description="Proof that the system was deployed, tested, and accepted at the barangay."
            color="rose"
            onGenerate={() => handleGenerate('deployment')}
            generating={generating === 'deployment'}
          >
            <div className="col-span-2 text-xs text-slate-500">Signed by: Punong Barangay + Barangay Secretary</div>
          </DocCard>
          <DocCard
            title="Informed Consent Form"
            description="Data privacy consent for each survey respondent (RA 10173 compliant)."
            color="cyan"
            onGenerate={() => handleGenerate('consent')}
            generating={generating === 'consent'}
          >
            <div className="col-span-2 text-xs text-slate-500">Signed by: Each survey respondent</div>
          </DocCard>
          <DocCard
            title="Letter Request to Conduct Study"
            description="Formal letter requesting permission to deploy and conduct the study."
            color="violet"
            onGenerate={() => handleGenerate('letter')}
            generating={generating === 'letter'}
          >
            <div className="col-span-2 text-xs text-slate-500">Signed by: Researchers + Adviser + Punong Barangay</div>
          </DocCard>
        </div>
      </div>
    </div>
  );
}
