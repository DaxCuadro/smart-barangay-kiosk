import { useEffect, useRef, useState } from 'react';
import useModalA11y from '../../hooks/useModalA11y';

function ModalBody({ mode, initialData, onClose, onSave }) {
  const containerRef = useRef(null);
  const closeButtonRef = useRef(null);
  const [form, setForm] = useState({ title: '', startDate: '', endDate: '', description: '' });

  useEffect(() => {
    const payload = {
      title: initialData?.title || '',
      startDate: initialData?.startDate || initialData?.date || '',
      endDate: initialData?.endDate || initialData?.startDate || initialData?.date || '',
      description: initialData?.description || '',
    };
    const timeout = setTimeout(() => setForm(payload), 0);
    return () => clearTimeout(timeout);
  }, [initialData]);

  function resetForm() {
    setForm({ title: '', startDate: '', endDate: '', description: '' });
  }

  function handleChange(e) {
    const { name, value } = e.target;
    const nextValue = name === 'title' ? value.slice(0, 30) : value;
    setForm(prev => ({ ...prev, [name]: nextValue }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!form.title.trim() || !form.startDate) {
      return;
    }
    const start = form.startDate;
    const end = form.endDate || form.startDate;
    const [normalizedStart, normalizedEnd] = start <= end ? [start, end] : [end, start];
    onSave({
      title: form.title.trim().slice(0, 30),
      startDate: normalizedStart,
      endDate: normalizedEnd,
      description: form.description.trim(),
    });
    resetForm();
  }

  function handleCancel() {
    resetForm();
    onClose();
  }

  useModalA11y({
    open: true,
    containerRef,
    onClose: handleCancel,
    focusOnOpenRef: closeButtonRef,
  });

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm" role="presentation">
      <div
        ref={containerRef}
        className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-blue-100 pr-2"
        role="dialog"
        aria-modal="true"
        aria-labelledby="event-modal-title"
        tabIndex={-1}
      >
        <div className="max-h-[85vh] overflow-y-auto p-6 relative">
          <button
            ref={closeButtonRef}
            type="button"
            aria-label="Close"
            className="absolute right-3 top-3 text-gray-400 hover:text-gray-600"
            onClick={handleCancel}
          >
            ×
          </button>
          <div className="mb-5">
            <p className="text-xs uppercase tracking-[0.2em] font-semibold text-blue-500">{mode === 'edit' ? 'Update Event' : 'Create Event'}</p>
            <h3 id="event-modal-title" className="text-2xl font-bold text-blue-900">{mode === 'edit' ? 'Edit Admin Schedule' : 'Add Admin Schedule'}</h3>
          </div>
          <form className="space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1" htmlFor="modal-event-title">
              Event Title
            </label>
            <input
              id="modal-event-title"
              name="title"
              type="text"
              className="w-full rounded-xl border border-gray-200 px-4 py-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 placeholder:text-gray-400"
              placeholder="e.g., Barangay Assembly"
              value={form.title}
              onChange={handleChange}
              maxLength={30}
              required
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1">Schedule</label>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <span className="block text-[11px] uppercase tracking-wide text-gray-400">Start</span>
                <input
                  name="startDate"
                  type="date"
                  className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                  value={form.startDate}
                  onChange={handleChange}
                  required
                />
              </div>
              <div>
                <span className="block text-[11px] uppercase tracking-wide text-gray-400">End</span>
                <input
                  name="endDate"
                  type="date"
                  className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                  value={form.endDate}
                  onChange={handleChange}
                  placeholder="Same as start if left blank"
                />
              </div>
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1" htmlFor="modal-event-note">
              Notes (optional)
            </label>
            <textarea
              id="modal-event-note"
              name="description"
              rows={3}
              className="w-full rounded-xl border border-gray-200 px-4 py-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 placeholder:text-gray-400"
              placeholder="Details, reminders, or logistics"
              value={form.description}
              onChange={handleChange}
            />
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              className="flex-1 border border-gray-300 rounded-xl py-2.5 font-semibold text-gray-600 hover:bg-gray-50"
              onClick={handleCancel}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 bg-blue-600 text-white rounded-xl py-2.5 font-semibold shadow hover:bg-blue-700"
            >
              {mode === 'edit' ? 'Save Changes' : 'Save Event'}
            </button>
          </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function AddEventModal({ open, mode = 'create', initialData = null, onClose, onSave }) {
  if (!open) return null;
  return <ModalBody key={initialData?.id || 'new-event'} mode={mode} initialData={initialData} onClose={onClose} onSave={onSave} />;
}
