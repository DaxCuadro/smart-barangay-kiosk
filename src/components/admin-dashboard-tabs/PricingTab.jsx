import { useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { useSupabase } from '../../contexts/SupabaseContext';

const DEFAULT_DOCUMENT_OPTIONS = [
  'Barangay Clearance',
  'Certificate of Indigency',
  'Residency Certification',
  'Barangay ID',
  'Business Clearance',
  'Solo Parent Certification',
];

const SERVICE_FEE_KEY = 'service_fee';
const SMS_FEE_KEY = 'sms_fee';
const DOCUMENT_OPTIONS_KEY = 'document_options';
const PRICING_KEY_PREFIX = 'pricing_';

function safeParseJson(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeDocumentOptions(value) {
  if (!value) return DEFAULT_DOCUMENT_OPTIONS;
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    const parsed = safeParseJson(value, value.split('\n'));
    const cleaned = parsed
      .map(item => (item || '').trim())
      .filter(Boolean);
    return cleaned.length ? cleaned : DEFAULT_DOCUMENT_OPTIONS;
  }
  return DEFAULT_DOCUMENT_OPTIONS;
}

function toNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function enrichPricing(items) {
  return (items || []).map(item => ({
    id: crypto.randomUUID(),
    document: item.document || '',
    price: toNumber(item.price, 0),
  }));
}

export default function PricingTab({ barangayId }) {
  const supabase = useSupabase();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [saveInfo, setSaveInfo] = useState('');
  const [saveError, setSaveError] = useState('');
  const [documentOptions, setDocumentOptions] = useState(DEFAULT_DOCUMENT_OPTIONS);
  const [documentPrices, setDocumentPrices] = useState([]);
  const [serviceFee, setServiceFee] = useState(0);
  const [smsFee, setSmsFee] = useState(0);
  const [newDocName, setNewDocName] = useState('');
  const [newDocPrice, setNewDocPrice] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [wizardPrices, setWizardPrices] = useState({});
  const [wizardSaving, setWizardSaving] = useState(false);

  const takenDocuments = useMemo(() => new Set(documentPrices.map(item => item.document)), [documentPrices]);
  const availableOptions = useMemo(
    () => documentOptions.filter(option => !takenDocuments.has(option)),
    [documentOptions, takenDocuments],
  );

  const pricingKey = useMemo(() => (barangayId ? `${PRICING_KEY_PREFIX}${barangayId}` : null), [barangayId]);

  useEffect(() => {
    async function loadPricing() {
      if (!barangayId) return;
      setLoading(true);
      setLoadError('');
      setSaveInfo('');
      const keys = [SERVICE_FEE_KEY, SMS_FEE_KEY, DOCUMENT_OPTIONS_KEY, pricingKey];
      const { data, error } = await supabase
        .from('app_settings')
        .select('key, value')
        .in('key', keys.filter(Boolean));

      if (error) {
        setLoadError(error.message);
        setLoading(false);
        return;
      }

      const valueMap = new Map((data || []).map(row => [row.key, row.value]));
      setServiceFee(toNumber(valueMap.get(SERVICE_FEE_KEY), 0));
      setSmsFee(toNumber(valueMap.get(SMS_FEE_KEY), 0));
      setDocumentOptions(normalizeDocumentOptions(valueMap.get(DOCUMENT_OPTIONS_KEY)));

      const parsedPricing = safeParseJson(valueMap.get(pricingKey), []);
      setDocumentPrices(enrichPricing(parsedPricing));
      setLoading(false);
    }

    loadPricing();
  }, [supabase, barangayId, pricingKey]);

  function handleDelete(id) {
    const next = documentPrices.filter(item => item.id !== id);
    persistPrices(next, 'Price deleted.');
    if (expandedId === id) {
      setExpandedId(null);
    }
  }

  function handleAdd() {
    if (!newDocName.trim()) return;
    const next = [
      ...documentPrices,
      { id: crypto.randomUUID(), document: newDocName.trim(), price: toNumber(newDocPrice, 0) },
    ];
    persistPrices(next, 'Price added.');
    setNewDocName('');
    setNewDocPrice('');
  }

  async function handleSave(nextList = documentPrices, successMessage = 'Pricing saved.') {
    if (!barangayId || !pricingKey) return;
    setSaving(true);
    setSaveError('');
    setSaveInfo('');
    const payload = nextList
      .filter(item => item.document.trim())
      .map(item => ({ document: item.document.trim(), price: toNumber(item.price, 0) }));

    const { error } = await supabase
      .from('app_settings')
      .upsert({ key: pricingKey, value: JSON.stringify(payload) }, { onConflict: 'key' });

    setSaving(false);
    if (error) {
      setSaveError(error.message);
      return;
    }
    setSaveInfo(successMessage);
  }

  function persistPrices(nextList, successMessage) {
    setDocumentPrices(nextList);
    handleSave(nextList, successMessage);
  }

  const serviceSummary = useMemo(() => serviceFee + smsFee, [serviceFee, smsFee]);

  async function handleWizardSave() {
    if (!barangayId || !pricingKey) return;
    setWizardSaving(true);
    setSaveError('');
    setSaveInfo('');
    const newEntries = availableOptions.map(doc => ({
      document: doc,
      price: toNumber(wizardPrices[doc], 0),
    }));
    const mergedList = [
      ...documentPrices
        .filter(item => item.document.trim())
        .map(item => ({ document: item.document.trim(), price: toNumber(item.price, 0) })),
      ...newEntries,
    ];
    const { error } = await supabase
      .from('app_settings')
      .upsert({ key: pricingKey, value: JSON.stringify(mergedList) }, { onConflict: 'key' });
    setWizardSaving(false);
    if (error) {
      setSaveError(error.message);
      return;
    }
    setDocumentPrices(enrichPricing(mergedList));
    setWizardPrices({});
    setSaveInfo('All document prices saved successfully!');
  }

  if (!barangayId) {
    return (
      <div className="space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-lg text-sm text-slate-600">
        Assign a barangay to configure pricing.
      </div>
    );
  }

  return (
    <div className="space-y-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-lg">
      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Documents</p>
        <h2 className="text-2xl font-semibold text-slate-900">Document pricing</h2>
        <p className="text-sm text-slate-600">
          Admins manage document prices. Service fee and SMS fee come from superadmin and apply to every request.
        </p>
      </div>

      {availableOptions.length > 0 && !loading ? (
        <div className="rounded-3xl border-2 border-amber-300 bg-amber-50 p-6 space-y-5">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-200 text-lg">💰</div>
            <div>
              <h3 className="text-lg font-bold text-amber-900">Document Pricing Setup</h3>
              <p className="text-sm text-amber-700">
                {availableOptions.length} document{availableOptions.length > 1 ? 's' : ''} still need{availableOptions.length === 1 ? 's' : ''} pricing.
                Set the base price for each document below.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {availableOptions.map((doc, idx) => (
              <div key={doc} className="flex items-center gap-4 rounded-2xl bg-white p-4 border border-amber-200 shadow-sm">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xs font-bold text-amber-700">{idx + 1}</span>
                <p className="flex-1 text-sm font-semibold text-slate-800">{doc}</p>
                <div className="flex items-center gap-1">
                  <span className="text-sm text-slate-500">₱</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="w-28 rounded-xl border border-slate-200 px-3 py-2 text-sm text-right text-slate-900 focus:border-amber-500 focus:outline-none"
                    value={wizardPrices[doc] ?? ''}
                    onChange={e => setWizardPrices(prev => ({ ...prev, [doc]: e.target.value }))}
                    placeholder="0.00"
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between gap-3 pt-2">
            <p className="text-xs text-amber-600">
              Service fee (₱{serviceFee.toFixed(2)}) + SMS fee (₱{smsFee.toFixed(2)}) will be added automatically.
            </p>
            <button
              type="button"
              className="rounded-full bg-amber-600 px-6 py-3 text-sm font-semibold text-white shadow hover:bg-amber-500 disabled:opacity-60 disabled:cursor-not-allowed"
              onClick={handleWizardSave}
              disabled={wizardSaving}
            >
              {wizardSaving ? 'Saving…' : `Save all ${availableOptions.length} price${availableOptions.length > 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[2fr,1fr]">
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-slate-800">Document price list</h3>
          </div>
          {loadError ? (
            <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{loadError}</p>
          ) : null}
          {saveError ? (
            <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{saveError}</p>
          ) : null}
          {saveInfo ? (
            <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{saveInfo}</p>
          ) : null}

          <div className="space-y-3">
            {documentPrices.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
                No pricing rows yet. Add a document below.
              </p>
            ) : (
              <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200">
                {documentPrices.map(item => {
                  const basePrice = toNumber(item.price, 0);
                  const total = basePrice + serviceFee + smsFee;
                  const isExpanded = expandedId === item.id;
                  return (
                    <div key={item.id} className="p-4 space-y-3">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex flex-col gap-1">
                          <label className="text-xs font-semibold text-slate-500">Document</label>
                          <p className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900">
                            {item.document}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <p className="text-xs font-semibold text-slate-500">Total price</p>
                            <p className="text-lg font-semibold text-slate-900">₱ {total.toFixed(2)}</p>
                          </div>
                          <button
                            type="button"
                            className="rounded-full border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                            onClick={() => setExpandedId(isExpanded ? null : item.id)}
                          >
                            {isExpanded ? 'Hide breakdown' : 'See breakdown'}
                          </button>
                          <button
                            type="button"
                            className="rounded-full border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                            onClick={() => handleDelete(item.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </div>

                      {isExpanded ? (
                        <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm text-slate-700 space-y-1">
                          <div className="flex items-center justify-between"><span>Document price</span><span>₱ {basePrice.toFixed(2)}</span></div>
                          <div className="flex items-center justify-between"><span>Service fee</span><span>₱ {serviceFee.toFixed(2)}</span></div>
                          <div className="flex items-center justify-between"><span>SMS fee</span><span>₱ {smsFee.toFixed(2)}</span></div>
                          <div className="flex items-center justify-between font-semibold text-slate-900 pt-1 border-t border-slate-200"><span>Total</span><span>₱ {total.toFixed(2)}</span></div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-3">
            <p className="text-sm font-semibold text-slate-800">Add document</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[2fr,1fr,auto] sm:items-end">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-slate-500">Document</label>
                <select
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none"
                  value={newDocName}
                  onChange={event => setNewDocName(event.target.value)}
                  disabled={!availableOptions.length}
                >
                  <option value="">{availableOptions.length ? 'Select document' : 'No documents available'}</option>
                  {availableOptions.map(option => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-slate-500">Document price (admin)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none"
                  value={newDocPrice}
                  onChange={event => setNewDocPrice(event.target.value)}
                  placeholder="0.00"
                />
              </div>
              <button
                type="button"
                className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white shadow hover:bg-slate-800 disabled:opacity-60"
                onClick={handleAdd}
                disabled={!newDocName.trim()}
              >
                Add
              </button>
            </div>
          </div>
        </div>

        <aside className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
          <div className="flex items-center justify-between">
            <span>Service fee</span>
            <strong>₱ {serviceFee.toFixed(2)}</strong>
          </div>
          <div className="flex items-center justify-between">
            <span>SMS fee</span>
            <strong>₱ {smsFee.toFixed(2)}</strong>
          </div>
          <div className="flex items-center justify-between border-t border-slate-200 pt-3 text-slate-800 font-semibold">
            <span>Platform charges total</span>
            <span>₱ {serviceSummary.toFixed(2)}</span>
          </div>
          <p className="text-xs text-slate-500">
            Platform charges are added on top of each document price.
          </p>
          {saving ? <p className="text-xs text-slate-500">Saving…</p> : null}
          {saveInfo ? <p className="text-xs text-emerald-600">{saveInfo}</p> : null}
          {saveError ? <p className="text-xs text-rose-600">{saveError}</p> : null}
        </aside>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading pricing…</p>
      ) : null}
    </div>
  );
}

PricingTab.propTypes = {
  barangayId: PropTypes.string,
};
