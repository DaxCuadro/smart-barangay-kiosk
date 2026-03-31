import { useRef } from 'react';
import useModalA11y from '../../hooks/useModalA11y';

export default function ConfirmDialog({
  open,
  title,
  description,
  children,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'danger',
  loading = false,
  confirmDisabled = false,
  onConfirm,
  onCancel,
}) {
  const containerRef = useRef(null);
  const cancelButtonRef = useRef(null);

  useModalA11y({
    open,
    containerRef,
    onClose: loading ? undefined : onCancel,
    focusOnOpenRef: cancelButtonRef,
  });

  if (!open) return null;

  const confirmClass =
    tone === 'danger'
      ? 'bg-red-600 hover:bg-red-500 focus-visible:ring-red-500'
      : 'bg-blue-600 hover:bg-blue-500 focus-visible:ring-blue-500';

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4" role="presentation">
      <div
        ref={containerRef}
        className="w-full max-w-md rounded-3xl bg-white pr-2 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        tabIndex={-1}
      >
        <div className="max-h-[85vh] overflow-y-auto p-6">
          <div className="space-y-3">
            <div>
              <h2 id="confirm-dialog-title" className="text-xl font-bold text-gray-900">{title}</h2>
            </div>
            {description && <p className="text-sm text-gray-600">{description}</p>}
            {children}
          </div>
          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              ref={cancelButtonRef}
              type="button"
              className="rounded-full border border-gray-200 px-5 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50"
              onClick={loading ? undefined : onCancel}
              disabled={loading}
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              className={`rounded-full px-6 py-2.5 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 ${confirmClass}`}
              onClick={onConfirm}
              disabled={loading || confirmDisabled}
            >
              {loading ? 'Please wait...' : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
