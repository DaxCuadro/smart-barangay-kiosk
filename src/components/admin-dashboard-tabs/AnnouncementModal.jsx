import { useEffect, useMemo, useRef, useState } from 'react';
import useModalA11y from '../../hooks/useModalA11y';

const INITIAL_FORM = {
  title: '',
  startDate: '',
  endDate: '',
  description: '',
  imageData: '',
};

const FIELD_CLASS =
  'mt-1 w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none';
const DATE_CLASS =
  'mt-1 w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-900 focus:border-blue-500 focus:outline-none';
const TEXTAREA_CLASS =
  'mt-1 w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none';

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function AnnouncementModal({ open, mode, initialData, onClose, onSave }) {
  const containerRef = useRef(null);
  const closeButtonRef = useRef(null);
  const [form, setForm] = useState(INITIAL_FORM);
  const [error, setError] = useState('');
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    if (open) {
      setForm({
        title: initialData?.title || '',
        startDate: initialData?.startDate || '',
        endDate: initialData?.endDate || '',
        description: initialData?.description || '',
        imageData: initialData?.imageData || '',
      });
      setError('');
      setIsUploading(false);
    }
  }, [open, initialData]);

  const heading = useMemo(() => (mode === 'edit' ? 'Edit Announcement' : 'New Announcement'), [mode]);

  useModalA11y({
    open,
    containerRef,
    onClose,
    focusOnOpenRef: closeButtonRef,
  });

  if (!open) return null;

  function handleChange(event) {
    const { name, value } = event.target;
    setForm(prev => ({ ...prev, [name]: value }));
  }

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file.');
      return;
    }
    setIsUploading(true);
    try {
      const dataUrl = await readFileAsDataURL(file);
      setForm(prev => ({ ...prev, imageData: dataUrl }));
      setError('');
    } catch (err) {
      console.error('Image parsing failed:', err);
      setError('Failed to load the image. Try again.');
    } finally {
      setIsUploading(false);
    }
  }

  function handleImageClear() {
    setForm(prev => ({ ...prev, imageData: '' }));
  }

  function handleSubmit(event) {
    event.preventDefault();
    if (!form.title.trim()) {
      setError('Title is required.');
      return;
    }
    if (!form.startDate || !form.endDate) {
      setError('Please provide both start and end dates.');
      return;
    }
    if (new Date(form.startDate) > new Date(form.endDate)) {
      setError('The end date must be later than the start date.');
      return;
    }
    onSave({ ...form });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4" role="presentation">
      <div
        ref={containerRef}
        className="w-full max-w-2xl rounded-3xl bg-white shadow-2xl pr-2"
        role="dialog"
        aria-modal="true"
        aria-labelledby="announcement-modal-title"
        tabIndex={-1}
      >
        <div className="max-h-[85vh] overflow-y-auto">
          <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-blue-500 font-semibold">Announcements</p>
              <h2 id="announcement-modal-title" className="text-2xl font-bold text-gray-900">{heading}</h2>
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

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="text-sm font-medium text-gray-700">Title</label>
              <input
                type="text"
                name="title"
                value={form.title}
                onChange={handleChange}
                className={FIELD_CLASS}
                placeholder="Community assembly, vaccination drive, etc."
                maxLength={120}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Start Date</label>
              <input
                type="date"
                name="startDate"
                value={form.startDate}
                onChange={handleChange}
                className={DATE_CLASS}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">End Date</label>
              <input
                type="date"
                name="endDate"
                value={form.endDate}
                onChange={handleChange}
                className={DATE_CLASS}
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700">Short Description</label>
            <textarea
              name="description"
              value={form.description}
              onChange={handleChange}
              className={TEXTAREA_CLASS}
              rows={3}
              placeholder="Add context or instructions for barangay residents."
              maxLength={300}
            />
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700">PubMat / Image (1x1 preferred)</label>
            <div className="mt-2 flex flex-col gap-4 sm:flex-row">
              <div className="flex h-32 w-32 items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-gray-50 overflow-hidden">
                {form.imageData ? (
                  <img src={form.imageData} alt="Announcement visual" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-xs text-gray-400 text-center px-2">Square preview</span>
                )}
              </div>
              <div className="flex-1 space-y-2">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="block w-full text-sm text-gray-600 file:mr-4 file:rounded-full file:border-0 file:bg-blue-50 file:px-4 file:py-2 file:text-blue-700 file:font-semibold"
                />
                <p className="text-xs text-gray-400">Upload a square visual (PNG/JPG). It will be displayed inside a 1x1 frame.</p>
                <div className="flex gap-2">
                  {form.imageData && (
                    <button
                      type="button"
                      className="text-xs font-semibold text-gray-500 hover:text-gray-700"
                      onClick={handleImageClear}
                    >
                      Remove image
                    </button>
                  )}
                  {isUploading && <span className="text-xs text-blue-500">Processing image...</span>}
                </div>
              </div>
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
              className="rounded-full bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow hover:bg-blue-500 disabled:opacity-50"
              disabled={isUploading}
            >
              {mode === 'edit' ? 'Save Changes' : 'Add Announcement'}
            </button>
          </div>
          </form>
        </div>
      </div>
    </div>
  );
}
