import { useEffect, useMemo, useRef, useState } from 'react';
import { BARANGAY_INFO_STORAGE_KEY, getBarangayZonesCount } from '../../utils/barangayInfoStorage';
import useModalA11y from '../../hooks/useModalA11y';

const INITIAL_FORM = {
  lastName: '',
  firstName: '',
  middleName: '',
  sex: '',
  civilStatus: '',
  birthday: '',
  birthplace: '',
  address: '',
  occupation: '',
  education: '',
  religion: '',
  email: '',
  telephone: '',
  zone: '',
};

const SEX_OPTIONS = ['Male', 'Female'];
const CIVIL_STATUSES = ['Single', 'Married', 'Widowed', 'Separated'];
const EDUCATION_LEVELS = [
  'No formal education',
  'Primary',
  'Secondary',
  'Vocational',
  'College',
  'Postgraduate',
];

const FIELD_CLASS =
  'mt-1 w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none';
const SELECT_CLASS =
  'mt-1 w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-900 focus:border-blue-500 focus:outline-none';
const TEXTAREA_CLASS =
  'mt-1 w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none';

function computeAge(dateString) {
  if (!dateString) return '';
  const birth = new Date(dateString);
  if (Number.isNaN(birth.getTime())) return '';
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
    age -= 1;
  }
  return age >= 0 ? age : '';
}

function splitAddressAndZone(value) {
  if (!value) return { street: '', zone: '' };
  const match = value.match(/(,?\s*Zone\s+(\d+))$/i);
  if (match) {
    const zone = match[2];
    const street = value.slice(0, match.index).replace(/,\s*$/, '').trim();
    return { street, zone };
  }
  return { street: value, zone: '' };
}

function composeAddress(street, zone) {
  const trimmedStreet = street.trim();
  if (zone) {
    return trimmedStreet ? `${trimmedStreet}, Zone ${zone}` : `Zone ${zone}`;
  }
  return trimmedStreet;
}

function clampZoneValue(value, maxZones) {
  if (!value) return '';
  const numericZone = Number(value);
  if (Number.isNaN(numericZone) || numericZone < 1) return '';
  if (numericZone > maxZones) return '';
  return String(numericZone);
}

function toTitleCase(value) {
  if (!value) return value;
  return value
    .toLowerCase()
    .replace(/(^|[\s-])\S/g, (match) => match.toUpperCase());
}

export default function ResidentModal({ mode, initialData, onClose, onSave }) {
  const containerRef = useRef(null);
  const closeButtonRef = useRef(null);
  const [form, setForm] = useState(() => {
    const parsed = splitAddressAndZone(initialData?.address || '');
    return {
      ...INITIAL_FORM,
      ...initialData,
      address: parsed.street,
      zone: parsed.zone,
    };
  });
  const [error, setError] = useState('');
  const [zoneCount, setZoneCount] = useState(() => getBarangayZonesCount());
  const safeZoneValue = useMemo(() => clampZoneValue(form.zone, zoneCount), [form.zone, zoneCount]);

  const heading = useMemo(() => (mode === 'edit' ? 'Edit Resident' : 'Add Resident'), [mode]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handleStorage = event => {
      if (!event || event.key === null || event.key === BARANGAY_INFO_STORAGE_KEY) {
        setZoneCount(getBarangayZonesCount());
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  useModalA11y({
    open: true,
    containerRef,
    onClose,
    focusOnOpenRef: closeButtonRef,
  });

  function handleChange(event) {
    const { name, value } = event.target;
    const titleCaseFields = new Set([
      'firstName',
      'lastName',
      'middleName',
      'birthplace',
      'address',
      'occupation',
      'religion',
    ]);
    const nextValue = titleCaseFields.has(name) ? toTitleCase(value) : value;
    setForm(prev => ({ ...prev, [name]: nextValue }));
  }

  function handleSubmit(event) {
    event.preventDefault();
    if (!form.firstName.trim() || !form.lastName.trim()) {
      setError('First name and last name are required.');
      return;
    }
    const payload = { ...form, zone: safeZoneValue, address: composeAddress(form.address, safeZoneValue) };
    onSave(payload);
  }

  const age = computeAge(form.birthday);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm px-4" role="presentation">
      <div
        ref={containerRef}
        className="w-full max-w-4xl rounded-3xl bg-white shadow-2xl pr-2"
        role="dialog"
        aria-modal="true"
        aria-labelledby="resident-modal-title"
        tabIndex={-1}
      >
        <div className="max-h-[85vh] overflow-y-auto">
          <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-blue-500 font-semibold">Residents</p>
              <h2 id="resident-modal-title" className="text-2xl font-bold text-gray-900">{heading}</h2>
            </div>
            <button
              ref={closeButtonRef}
              type="button"
              className="rounded-full p-2 text-gray-400 hover:bg-gray-100"
              onClick={onClose}
              aria-label="Close form"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          </div>

          <form className="px-6 py-6 space-y-6" onSubmit={handleSubmit}>
          {error && <p className="rounded-xl bg-red-50 px-4 py-2 text-sm text-red-600">{error}</p>}

          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="text-sm font-semibold text-gray-700">Last Name *</label>
              <input
                type="text"
                name="lastName"
                value={form.lastName}
                onChange={handleChange}
                className={FIELD_CLASS}
                placeholder="Dela Cruz"
              />
            </div>
            <div>
              <label className="text-sm font-semibold text-gray-700">First Name *</label>
              <input
                type="text"
                name="firstName"
                value={form.firstName}
                onChange={handleChange}
                className={FIELD_CLASS}
                placeholder="Juan"
              />
            </div>
            <div>
              <label className="text-sm font-semibold text-gray-700">Middle Name</label>
              <input
                type="text"
                name="middleName"
                value={form.middleName}
                onChange={handleChange}
                className={FIELD_CLASS}
                placeholder="Santos"
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="text-sm font-semibold text-gray-700">Sex</label>
              <select
                name="sex"
                value={form.sex}
                onChange={handleChange}
                className={SELECT_CLASS}
              >
                <option value="">Select</option>
                {SEX_OPTIONS.map(option => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-semibold text-gray-700">Civil Status</label>
              <select
                name="civilStatus"
                value={form.civilStatus}
                onChange={handleChange}
                className={SELECT_CLASS}
              >
                <option value="">Select</option>
                {CIVIL_STATUSES.map(option => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-semibold text-gray-700">Birthday</label>
              <input
                type="date"
                name="birthday"
                value={form.birthday}
                onChange={handleChange}
                className={SELECT_CLASS}
              />
              {age !== '' && <p className="mt-1 text-xs text-gray-500">Age: {age}</p>}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="text-sm font-semibold text-gray-700">Birthplace</label>
              <input
                type="text"
                name="birthplace"
                value={form.birthplace}
                onChange={handleChange}
                className={FIELD_CLASS}
                placeholder="City / Province"
              />
            </div>
            <div>
              <label className="text-sm font-semibold text-gray-700">Residential Address</label>
              <input
                type="text"
                name="address"
                value={form.address}
                onChange={handleChange}
                className={FIELD_CLASS}
                placeholder="Sitio XYZ"
              />
            </div>
            <div>
              <label className="text-sm font-semibold text-gray-700">Zone / Purok</label>
              <select
                name="zone"
                value={safeZoneValue}
                onChange={handleChange}
                className={`${SELECT_CLASS} cursor-pointer`}
              >
                <option value="">No zone</option>
                {Array.from({ length: zoneCount }, (_, index) => index + 1).map(option => (
                  <option key={option} value={String(option)}>
                    Zone {option}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-500">Displayed as "Zone X" after the street.</p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="text-sm font-semibold text-gray-700">Occupation / Profession</label>
              <input
                type="text"
                name="occupation"
                value={form.occupation}
                onChange={handleChange}
                className={FIELD_CLASS}
                placeholder="Teacher"
              />
            </div>
            <div>
              <label className="text-sm font-semibold text-gray-700">Highest Education Attainment</label>
              <select
                name="education"
                value={form.education}
                onChange={handleChange}
                className={SELECT_CLASS}
              >
                <option value="">Select</option>
                {EDUCATION_LEVELS.map(option => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-semibold text-gray-700">Religion</label>
              <input
                type="text"
                name="religion"
                value={form.religion}
                onChange={handleChange}
                className={FIELD_CLASS}
                placeholder="Roman Catholic"
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-sm font-semibold text-gray-700">Email Address</label>
              <input
                type="email"
                name="email"
                value={form.email}
                onChange={handleChange}
                className={FIELD_CLASS}
                placeholder="juan@example.com"
              />
            </div>
            <div>
              <label className="text-sm font-semibold text-gray-700">Telephone / Mobile Number</label>
              <input
                type="text"
                name="telephone"
                value={form.telephone}
                onChange={handleChange}
                className={FIELD_CLASS}
                placeholder="0917 000 0000"
              />
            </div>
          </div>

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              className="rounded-full border border-gray-200 px-6 py-3 text-sm font-semibold text-gray-600 hover:bg-gray-50"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-full bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow hover:bg-blue-500"
            >
              {mode === 'edit' ? 'Save Changes' : 'Add Resident'}
            </button>
          </div>
          </form>
        </div>
      </div>
    </div>
  );
}
