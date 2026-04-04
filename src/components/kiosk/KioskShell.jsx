import { useEffect, useMemo, useState } from 'react';
import { useSupabase } from '../../contexts/SupabaseContext';
import PrecheckScreen from './PrecheckScreen';
import { getSelectedBarangayId, getSelectedBarangayName, setBarangayInfo } from '../../utils/barangayInfoStorage';
import { isPrinterSupported, isPrinterConnected, connectPrinter, disconnectPrinter, getPrinterName, onPrinterDisconnect } from '../../utils/thermalPrinter';
import useIdleReset from '../../hooks/useIdleReset';
import './kioskShell.css';

function normalizeDate(value) {
  if (!value) return null;
  const reference = new Date(value);
  return new Date(reference.getFullYear(), reference.getMonth(), reference.getDate());
}

function resolveStatus(startDate, endDate, today) {
  const start = normalizeDate(startDate);
  const end = normalizeDate(endDate);
  if (!start || !end) return 'upcoming';
  if (today < start) return 'upcoming';
  if (today > end) return 'ended';
  return 'ongoing';
}

function mapFromSupabase(record, today) {
  const status = resolveStatus(record.start_date, record.end_date, today);
  return {
    id: record.id,
    title: record.title || 'Announcement',
    body: record.description || 'Details will be posted soon.',
    imageData: record.image_data || null,
    status,
  };
}

function KioskShell() {
  const supabase = useSupabase();
  const [stage, setStage] = useState('welcome');
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState(null);
  const [barangays, setBarangays] = useState([]);
  const [barangayLoading, setBarangayLoading] = useState(true);
  const [barangayError, setBarangayError] = useState('');
  const [activeBarangayId, setActiveBarangayId] = useState(() => getSelectedBarangayId());
  const [activeBarangayName, setActiveBarangayName] = useState(() => getSelectedBarangayName());
  const [changeOpen, setChangeOpen] = useState(false);
  const [changePasswordInput, setChangePasswordInput] = useState('');
  const [changePasswordError, setChangePasswordError] = useState('');
  const [passwordUnlocked, setPasswordUnlocked] = useState(false);
  const [requiresPassword, setRequiresPassword] = useState(true);
  const [unlockLoading, setUnlockLoading] = useState(false);
  const [printerConnected, setPrinterConnected] = useState(() => isPrinterConnected());
  const [printerName, setPrinterName] = useState(() => getPrinterName());
  const [printerBusy, setPrinterBusy] = useState(false);

  useEffect(() => {
    if (!isPrinterSupported()) return undefined;
    const unsubscribe = onPrinterDisconnect(() => {
      setPrinterConnected(false);
      setPrinterName(null);
    });
    return unsubscribe;
  }, []);

  async function handleTogglePrinter() {
    if (printerBusy) return;
    setPrinterBusy(true);
    try {
      if (isPrinterConnected()) {
        await disconnectPrinter();
        setPrinterConnected(false);
        setPrinterName(null);
      } else {
        const result = await connectPrinter();
        setPrinterConnected(true);
        setPrinterName(result.name);
      }
    } catch {
      setPrinterConnected(false);
      setPrinterName(null);
    }
    setPrinterBusy(false);
  }

  // Auto-reset to welcome screen after 2 minutes of inactivity
  useIdleReset(() => {
    setStage('welcome');
    setSelectedAnnouncement(null);
    setChangeOpen(false);
  }, 120000);

  useEffect(() => {
    let isActive = true;
    const today = normalizeDate(new Date());

    async function loadAnnouncements() {
      setLoading(true);
      setError(null);
      if (!activeBarangayId) {
        setAnnouncements([]);
        setLoading(false);
        return;
      }
      const { data, error: fetchError } = await supabase
        .from('announcements')
        .select('id, title, description, image_data, start_date, end_date')
        .eq('barangay_id', activeBarangayId)
        .order('start_date', { ascending: true });

      if (!isActive) return;

      if (fetchError) {
        setError(fetchError.message);
        setAnnouncements([]);
      } else {
        const mapped = (data || [])
          .map(item => mapFromSupabase(item, today))
          .filter(item => item.status === 'ongoing');
        setAnnouncements(mapped);
      }

      setLoading(false);
    }

    loadAnnouncements();
    return () => {
      isActive = false;
    };
  }, [supabase, activeBarangayId]);

  useEffect(() => {
    let isActive = true;
    async function loadBarangays() {
      setBarangayLoading(true);
      setBarangayError('');
      const [barangayResult] = await Promise.all([
        supabase.from('barangays').select('id, name, code, status, enable_kiosk, enable_announcements').order('name', { ascending: true }),
      ]);

      if (!isActive) return;
      if (barangayResult.error) {
        setBarangayError(barangayResult.error?.message || 'Failed to load barangays.');
        setBarangays([]);
        setBarangayLoading(false);
        return;
      }

      const activeItems = (barangayResult.data || []).filter(item => item.status !== 'inactive' && item.enable_kiosk !== false);
      setBarangays(activeItems);

      const storedId = getSelectedBarangayId();
      const hasActive = activeItems.some(item => item.id === storedId);
      if ((!storedId || !hasActive) && activeItems.length > 0) {
        const fallback = activeItems[0];
        setActiveBarangayId(fallback.id);
        setActiveBarangayName(fallback.name || '');
        setBarangayInfo({ barangayId: fallback.id, barangayName: fallback.name || '' });
      }
      setBarangayLoading(false);
    }
    loadBarangays();
    return () => {
      isActive = false;
    };
  }, [supabase]);

  const activeBarangay = useMemo(() => {
    if (!activeBarangayId) return null;
    return barangays.find(item => item.id === activeBarangayId) || null;
  }, [barangays, activeBarangayId]);

  function handleContinue() {
    if (!activeBarangayId) {
      openBarangayChange();
      return;
    }
    setStage('precheck');
  }

  function handleReset() {
    setStage('welcome');
  }

  function openBarangayChange() {
    setChangeOpen(true);
    setChangePasswordInput('');
    setChangePasswordError('');
    setPasswordUnlocked(false);
    fetchPasswordStatus();
  }

  function closeBarangayChange() {
    setChangeOpen(false);
    setChangePasswordInput('');
    setChangePasswordError('');
    setPasswordUnlocked(false);
  }

  async function fetchPasswordStatus() {
    setUnlockLoading(true);
    setChangePasswordError('');
    const { data, error } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'kiosk_change_password')
      .maybeSingle();
    setUnlockLoading(false);
    if (error) {
      setRequiresPassword(true);
      setPasswordUnlocked(false);
      setChangePasswordError('Unable to check kiosk password status. Please try again or contact support.');
      return;
    }
    const storedPassword = (data?.value || '').trim();
    const needsPassword = Boolean(storedPassword);
    setRequiresPassword(needsPassword);
    setPasswordUnlocked(!needsPassword);
  }

  async function handleUnlock(event) {
    event.preventDefault();
    setUnlockLoading(true);
    setChangePasswordError('');
    const { data, error } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'kiosk_change_password')
      .maybeSingle();
    setUnlockLoading(false);
    if (error) {
      setChangePasswordError('Unable to verify password. Please try again.');
      setPasswordUnlocked(false);
      return;
    }
    const storedPassword = (data?.value || '').trim();
    if (!storedPassword || changePasswordInput === storedPassword) {
      setPasswordUnlocked(true);
      setChangePasswordError('');
    } else {
      setChangePasswordError('Incorrect password.');
      setPasswordUnlocked(false);
    }
  }

  function handleSaveBarangay(event) {
    event.preventDefault();
    if (!activeBarangayId) return;
    const selected = barangays.find(item => item.id === activeBarangayId);
    setActiveBarangayName(selected?.name || '');
    setBarangayInfo({ barangayId: activeBarangayId, barangayName: selected?.name || '' });
    closeBarangayChange();
  }


  if (stage === 'precheck') {
    return <PrecheckScreen onClose={handleReset} barangayId={activeBarangayId} />;
  }

  return (
    <div className="kiosk-shell">
      <div className="kiosk-frame">
        <div className="kiosk-toolbar">
          <div className="kiosk-toolbar-meta">
            <span className="kiosk-toolbar-label">Barangay</span>
            <span className="kiosk-toolbar-name">
              {activeBarangay?.name || activeBarangayName || 'Not set'}
            </span>
          </div>
          <button
            type="button"
            className="kiosk-toolbar-button"
            onClick={openBarangayChange}
          >
            Change
          </button>
          {isPrinterSupported() ? (
            <button
              type="button"
              className={`kiosk-toolbar-button kiosk-printer-button ${printerConnected ? 'kiosk-printer-button--on' : ''}`}
              onClick={handleTogglePrinter}
              disabled={printerBusy}
              title={printerConnected ? `Printer: ${printerName || 'Connected'}` : 'Connect printer'}
            >
              {printerBusy ? '...' : printerConnected ? `🖨 ${printerName || 'Printer'}` : '🖨 Connect Printer'}
            </button>
          ) : null}
        </div>
        {activeBarangay?.enable_announcements !== false && (
        <div className="kiosk-panel kiosk-panel--announcements">
          <p className="kiosk-subhead">Announcements</p>
          {loading ? (
            <p className="kiosk-announcement-note">Loading announcements...</p>
          ) : error ? (
            <p className="kiosk-announcement-note">Offline announcements shown for now.</p>
          ) : announcements.length === 0 ? (
            <p className="kiosk-announcement-note">No live announcements right now.</p>
          ) : null}
          <div className="kiosk-announcement-list">
            {announcements.map((item) => (
              <article key={item.id} className="kiosk-announcement-card">
                <h2>{item.title}</h2>
                <p>{item.body}</p>
                {item.imageData ? (
                  <div className="kiosk-announcement-actions">
                    <button
                      type="button"
                      className="kiosk-announcement-show"
                      onClick={() => setSelectedAnnouncement(item)}
                    >
                      Show
                    </button>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </div>
        )}

        <div className="kiosk-panel kiosk-panel--cta">
          <p className="kiosk-subhead">Welcome to the Smart Barangay Kiosk</p>
          <h1 className="kiosk-title kiosk-title--compact">Tap Continue to start</h1>
          <p className="kiosk-body kiosk-note">
            Walk-in requests do not require login. We will just confirm your identity at the desk if you cannot
            find your profile.
          </p>
          <div className="kiosk-actions">
            <button type="button" className="kiosk-continue" onClick={handleContinue}>
              Continue
            </button>
          </div>
          <p className="kiosk-footnote">{/*Need to cancel? Tap the × button to reset the screen.*/}</p>
        </div>
      </div>
      {changeOpen ? (
        <div className="kiosk-modal" role="dialog" aria-modal="true" onClick={closeBarangayChange}>
          <div className="kiosk-modal-card" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              className="kiosk-modal-close"
              onClick={closeBarangayChange}
              aria-label="Close change barangay"
            >
              ×
            </button>
            <h3 className="kiosk-modal-title">Change barangay</h3>
            {!passwordUnlocked && requiresPassword ? (
              <form className="kiosk-change-form" onSubmit={handleUnlock}>
                <label>
                  Password
                  <input
                    type="password"
                    value={changePasswordInput}
                    onChange={(event) => setChangePasswordInput(event.target.value)}
                    placeholder="Enter kiosk password"
                    required
                  />
                </label>
                {changePasswordError ? <p className="kiosk-change-error">{changePasswordError}</p> : null}
                <button type="submit" disabled={unlockLoading}>
                  {unlockLoading ? 'Checking...' : 'Unlock'}
                </button>
              </form>
            ) : (
              <form className="kiosk-change-form" onSubmit={handleSaveBarangay}>
                <label>
                  Barangay
                  <select
                    value={activeBarangayId}
                    onChange={(event) => setActiveBarangayId(event.target.value)}
                    required
                  >
                    <option value="">Select barangay</option>
                    {barangays.map(item => (
                      <option key={item.id} value={item.id}>
                        {item.code ? `${item.name} (${item.code})` : item.name}
                      </option>
                    ))}
                  </select>
                </label>
                {barangayLoading ? <p className="kiosk-change-note">Loading barangays...</p> : null}
                {barangayError ? <p className="kiosk-change-error">{barangayError}</p> : null}
                <button type="submit" disabled={!activeBarangayId}>Save</button>
              </form>
            )}
          </div>
        </div>
      ) : null}
      {selectedAnnouncement ? (
        <div
          className="kiosk-modal"
          role="dialog"
          aria-modal="true"
          onClick={() => setSelectedAnnouncement(null)}
        >
          <div className="kiosk-modal-card" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              className="kiosk-modal-close"
              onClick={() => setSelectedAnnouncement(null)}
              aria-label="Close announcement"
            >
              ×
            </button>
            <div className="kiosk-modal-image">
              {selectedAnnouncement.imageData ? (
                <img src={selectedAnnouncement.imageData} alt={selectedAnnouncement.title} />
              ) : (
                <span className="kiosk-modal-fallback">No image available.</span>
              )}
            </div>
            <h3 className="kiosk-modal-title">{selectedAnnouncement.title}</h3>
            <p className="kiosk-modal-body">{selectedAnnouncement.body}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default KioskShell;
