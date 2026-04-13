import { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

export default function PwaUpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    // Check for SW updates every 60 seconds so kiosk / barangay PCs that stay
    // open pick up new deployments quickly without a manual page refresh.
    onRegisteredSW(_swUrl, registration) {
      if (registration) {
        setInterval(() => { registration.update(); }, 60 * 1000);
      }
    },
  });

  // Auto-apply critical updates: if a new SW version is waiting and the user
  // hasn't interacted within 5 seconds, apply it automatically.  This ensures
  // barangay PCs that sit idle on the page always get the latest code.
  useEffect(() => {
    if (!needRefresh) return;
    const timer = setTimeout(() => { updateServiceWorker(true); }, 5000);
    return () => clearTimeout(timer);
  }, [needRefresh, updateServiceWorker]);

  if (!needRefresh) return null;

  return (
    <div className="fixed bottom-4 right-4 z-9999 flex items-center gap-3 rounded-xl bg-slate-800 px-5 py-3 text-sm text-white shadow-lg">
      <span>A new version is available.</span>
      <button
        onClick={() => updateServiceWorker(true)}
        className="rounded-lg bg-blue-500 px-3 py-1 font-semibold text-white hover:bg-blue-600"
      >
        Update
      </button>
      <button
        onClick={() => setNeedRefresh(false)}
        className="rounded-lg px-3 py-1 text-slate-300 hover:text-white"
      >
        Later
      </button>
    </div>
  );
}
