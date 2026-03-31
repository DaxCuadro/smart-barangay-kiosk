import { useEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function getFocusableElements(container) {
  if (!container) return [];
  return Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR)).filter(element => {
    return element.offsetParent !== null || element === document.activeElement;
  });
}

export default function useModalA11y({ open, containerRef, onClose, focusOnOpenRef }) {
  const previousFocusRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const container = containerRef.current;
    const preferred = focusOnOpenRef?.current;
    const focusable = getFocusableElements(container);

    const initialTarget = preferred && !preferred.disabled ? preferred : focusable[0] || container;
    if (initialTarget && typeof initialTarget.focus === 'function') {
      window.requestAnimationFrame(() => {
        initialTarget.focus();
      });
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose?.();
        return;
      }

      if (event.key !== 'Tab') return;
      const nodes = getFocusableElements(containerRef.current);
      if (!nodes.length) {
        event.preventDefault();
        return;
      }

      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      const previous = previousFocusRef.current;
      if (previous && typeof previous.focus === 'function') {
        window.requestAnimationFrame(() => {
          previous.focus();
        });
      }
    };
  }, [open, containerRef, onClose, focusOnOpenRef]);
}
