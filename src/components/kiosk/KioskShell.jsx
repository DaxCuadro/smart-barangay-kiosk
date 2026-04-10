import { useEffect, useMemo, useState } from 'react';
import { useSupabase } from '../../contexts/SupabaseContext';
import PrecheckScreen from './PrecheckScreen';
import { getSelectedBarangayId, getSelectedBarangayName, setBarangayInfo } from '../../utils/barangayInfoStorage';
import useIdleReset from '../../hooks/useIdleReset';
import useOfflineSync from '../../hooks/useOfflineSync';
import { cacheBarangays, getCachedBarangays, cacheResidents, cacheAnnouncements, getCachedAnnouncements } from '../../utils/offlineStorage';
import GuideModal from '../ui/GuideModal';
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
  const [systemBroadcast, setSystemBroadcast] = useState(null);
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

  // Auto-reset to welcome screen after 2 minutes of inactivity
  useIdleReset(() => {
    setStage('welcome');
    setSelectedAnnouncement(null);
    setChangeOpen(false);
  }, 120000);

  const { isOnline, pendingCount, syncing } = useOfflineSync(supabase);

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
        // Fallback to cached announcements when offline
        try {
          const cached = await getCachedAnnouncements(activeBarangayId);
          if (cached && cached.length > 0) {
            setAnnouncements(cached);
            setError(null);
          } else {
            setError(fetchError.message);
            setAnnouncements([]);
          }
        } catch {
          setError(fetchError.message);
          setAnnouncements([]);
        }
      } else {
        const mapped = (data || [])
          .map(item => mapFromSupabase(item, today))
          .filter(item => item.status === 'ongoing');
        setAnnouncements(mapped);
        // Cache for offline use
        cacheAnnouncements(activeBarangayId, mapped).catch(() => {});
      }

      setLoading(false);
    }

    loadAnnouncements();
    return () => {
      isActive = false;
    };
  }, [supabase, activeBarangayId]);

  // Load system broadcast from app_settings
  useEffect(() => {
    let isActive = true;
    (async () => {
      const { data } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'system_broadcast')
        .maybeSingle();
      if (!isActive) return;
      if (data?.value) {
        try {
          const parsed = JSON.parse(data.value);
          if (parsed.enabled && parsed.title) {
            setSystemBroadcast(parsed);
          } else {
            setSystemBroadcast(null);
          }
        } catch {
          setSystemBroadcast(null);
        }
      }
    })();
    return () => { isActive = false; };
  }, [supabase]);

  useEffect(() => {
    let isActive = true;
    async function loadBarangays() {
      setBarangayLoading(true);
      setBarangayError('');
      const [barangayResult] = await Promise.all([
        supabase.from('barangays').select('id, name, code, status, enable_kiosk, enable_announcements').order('name', { ascending: true }),
      ]);

      if (!isActive) return;

      let activeItems = [];

      if (barangayResult.error) {
        // Fallback to cached data when offline
        try {
          const cached = await getCachedBarangays();
          if (cached && cached.length > 0) {
            activeItems = cached;
            setBarangayError('');
          } else {
            setBarangayError(barangayResult.error?.message || 'Failed to load barangays.');
            setBarangays([]);
            setBarangayLoading(false);
            return;
          }
        } catch {
          setBarangayError(barangayResult.error?.message || 'Failed to load barangays.');
          setBarangays([]);
          setBarangayLoading(false);
          return;
        }
      } else {
        activeItems = (barangayResult.data || []).filter(item => item.status !== 'inactive' && item.enable_kiosk !== false);
        // Cache for offline use
        cacheBarangays(activeItems).catch(() => {});
      }

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

  // Pre-cache residents for offline search when online
  useEffect(() => {
    if (!isOnline || !activeBarangayId) return;
    let isActive = true;
    async function prefetchResidents() {
      const { data, error } = await supabase
        .from('residents')
        .select('id, first_name, last_name, middle_name, sex, civil_status, birthday, birthplace, address, occupation, education, religion, telephone, email')
        .eq('barangay_id', activeBarangayId)
        .order('last_name', { ascending: true })
        .limit(5000);
      if (!isActive || error || !data) return;
      cacheResidents(activeBarangayId, data).catch(() => {});
    }
    prefetchResidents();
    return () => { isActive = false; };
  }, [supabase, isOnline, activeBarangayId]);

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
    return <PrecheckScreen onClose={handleReset} barangayId={activeBarangayId} isOnline={isOnline} />;
  }

  return (
    <div className="kiosk-shell">
      {!isOnline && (
        <div className="kiosk-offline-banner" role="status">
          <span>⚡ Offline mode — using cached data{pendingCount > 0 ? ` · ${pendingCount} request${pendingCount > 1 ? 's' : ''} queued` : ''}</span>
          {syncing && <span> · Syncing…</span>}
        </div>
      )}
      {isOnline && pendingCount > 0 && (
        <div className="kiosk-sync-banner" role="status">
          <span>Syncing {pendingCount} queued request{pendingCount > 1 ? 's' : ''}…</span>
        </div>
      )}
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
        </div>
        {systemBroadcast && (
          <div className={`kiosk-broadcast ${
            systemBroadcast.type === 'warning' ? 'kiosk-broadcast--warning'
            : systemBroadcast.type === 'success' ? 'kiosk-broadcast--success'
            : systemBroadcast.type === 'update' ? 'kiosk-broadcast--update'
            : 'kiosk-broadcast--info'
          }`}>
            <p className="kiosk-broadcast-title">{systemBroadcast.title}</p>
            {systemBroadcast.message && <p className="kiosk-broadcast-message">{systemBroadcast.message}</p>}
          </div>
        )}
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
          <GuideModal guideSrc="/kiosk-guide.png" label="Kiosk Guide" className="guide-trigger--light kiosk-guide-btn" />
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
