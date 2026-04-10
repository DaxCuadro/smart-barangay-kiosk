import { useCallback, useEffect, useRef, useState } from 'react';
import useModalA11y from '../../hooks/useModalA11y';

/**
 * A small floating "?" button that opens a full-screen modal
 * showing a guide image (PNG) with pinch-zoom / scroll support.
 *
 * Props:
 *   guideSrc  – path to the guide image (e.g. "/kiosk-guide.png")
 *   label     – accessible label (e.g. "Kiosk Guide")
 *   className – extra classes for the trigger button wrapper
 */
export default function GuideModal({ guideSrc, label = 'Guide', className = '' }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const closeBtnRef = useRef(null);

  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const pinchRef = useRef({ startDist: 0, startScale: 1 });
  const panRef = useRef({ startX: 0, startY: 0, startTx: 0, startTy: 0 });
  const imgRef = useRef(null);

  const resetZoom = useCallback(() => {
    setScale(1);
    setTranslate({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    if (!open) resetZoom();
  }, [open, resetZoom]);

  /* Pinch-to-zoom handlers */
  const handleTouchStart = useCallback((e) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchRef.current = { startDist: Math.hypot(dx, dy), startScale: scale };
    } else if (e.touches.length === 1 && scale > 1) {
      panRef.current = {
        startX: e.touches[0].clientX,
        startY: e.touches[0].clientY,
        startTx: translate.x,
        startTy: translate.y,
      };
    }
  }, [scale, translate]);

  const handleTouchMove = useCallback((e) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const newScale = Math.min(5, Math.max(1, pinchRef.current.startScale * (dist / pinchRef.current.startDist)));
      setScale(newScale);
      if (newScale <= 1) setTranslate({ x: 0, y: 0 });
    } else if (e.touches.length === 1 && scale > 1) {
      const dx = e.touches[0].clientX - panRef.current.startX;
      const dy = e.touches[0].clientY - panRef.current.startY;
      setTranslate({ x: panRef.current.startTx + dx, y: panRef.current.startTy + dy });
    }
  }, [scale]);

  /* Mouse wheel zoom (desktop) */
  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.15 : 0.15;
    setScale((prev) => {
      const next = Math.min(5, Math.max(1, prev + delta));
      if (next <= 1) setTranslate({ x: 0, y: 0 });
      return next;
    });
  }, []);

  useModalA11y({
    open,
    containerRef,
    onClose: () => setOpen(false),
    focusOnOpenRef: closeBtnRef,
  });

  return (
    <>
      <button
        type="button"
        className={`guide-trigger ${className}`}
        onClick={() => setOpen(true)}
        aria-label={`Open ${label}`}
        title={label}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
          <circle cx="12" cy="12" r="10" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" />
          <circle cx="12" cy="17" r="0.5" fill="currentColor" stroke="none" />
        </svg>
        <span>Guide</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-200 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          role="presentation"
          onClick={() => setOpen(false)}
        >
          <div
            ref={containerRef}
            className="guide-modal"
            role="dialog"
            aria-modal="true"
            aria-label={label}
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="guide-modal-header">
              <h2 className="guide-modal-title">{label}</h2>
              <button
                ref={closeBtnRef}
                type="button"
                className="guide-modal-close"
                onClick={() => setOpen(false)}
                aria-label="Close guide"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="guide-modal-toolbar">
              <button type="button" className="guide-zoom-btn" onClick={() => setScale((s) => Math.min(5, s + 0.5))} aria-label="Zoom in">+</button>
              <span className="guide-zoom-level">{Math.round(scale * 100)}%</span>
              <button type="button" className="guide-zoom-btn" onClick={() => { setScale((s) => { const n = Math.max(1, s - 0.5); if (n <= 1) setTranslate({ x: 0, y: 0 }); return n; }); }} aria-label="Zoom out">–</button>
              {scale > 1 && <button type="button" className="guide-zoom-btn" onClick={resetZoom} aria-label="Reset zoom">Reset</button>}
            </div>
            <div
              className="guide-modal-body"
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onWheel={handleWheel}
              ref={imgRef}
            >
              <img
                src={guideSrc}
                alt={label}
                className="guide-modal-img"
                draggable="false"
                style={{
                  transform: `scale(${scale}) translate(${translate.x / scale}px, ${translate.y / scale}px)`,
                  transformOrigin: 'top center',
                  transition: scale === 1 ? 'transform 0.2s ease' : 'none',
                }}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
