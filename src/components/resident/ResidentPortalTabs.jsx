import React, { useState } from 'react';

const MORE_DOCS_VALUE = '__more_documents__';
const MORE_DOCS_NOTICE = 'Other document types are not yet available in this version of the system.';

const HomeIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>
);
const RequestIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></svg>
);
const ProfileIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
);

export default function ResidentPortalTabs({
  activeTab,
  setActiveTab,
  verificationStatus,
  requestCounts,
  requestsLoading,
  requests,
  releaseLogs,
  releaseLogsLoading,
  announcements,
  requestForm,
  setRequestForm,
  requestError,
  requestSaving,
  requestSuccessModalOpen,
  requestSuccessModalMessage,
  requestSuccessDetails,
  onCloseRequestSuccessModal,
  onSubmitRequest,
  pricingInfo,
  profileSaveError,
  profileSaveInfo,
  profileEditing,
  selectedResident,
  profileForm,
  onProfileChange,
  onSubmitProfileUpdate,
  onStartProfileEdit,
  onCancelProfileEdit,
  zoneCount,
  profileSaving,
  documentOptions,
  sexOptions,
  civilStatuses,
  educationLevels,
  extractZoneFromAddress,
  accountEmail,
  accountPassword,
  setAccountPassword,
  accountShowPassword,
  setAccountShowPassword,
  accountSaving,
  accountError,
  accountInfo,
  onUpdateAccount,
  onSignOut,
  onCancelRequest,
  onSubmitFeedback,
  supabase,
}) {
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [moreDocsNotice, setMoreDocsNotice] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [announcementIndex, setAnnouncementIndex] = useState(null);
  const [announcementDismissed, setAnnouncementDismissed] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const [historyDateFrom, setHistoryDateFrom] = useState('');
  const [historyDateTo, setHistoryDateTo] = useState('');
  const [cancellingId, setCancellingId] = useState(null);
  const [feedbackModal, setFeedbackModal] = useState(null);
  const [feedbackRating, setFeedbackRating] = useState(0);
  const [feedbackComment, setFeedbackComment] = useState('');
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [submittedFeedbackIds, setSubmittedFeedbackIds] = useState(new Set());
  const [feedbackBannerDismissed, setFeedbackBannerDismissed] = useState(false);
  const addressValue = selectedResident?.address || '';
  const zoneValue = extractZoneFromAddress(addressValue);
  const addressDisplay = /^\s*Zone\s+\d+\s*$/i.test(addressValue) ? 'N/A' : (addressValue || 'N/A');
  const ongoingRequests = requests.filter(item => ['pending', 'current', 'done'].includes(item.status || 'pending'));
  const recentRequests = ongoingRequests;
  const historyRequests = releaseLogs || [];
  const unratedCount = historyRequests.filter(item => !submittedFeedbackIds.has(item.id)).length;
  const filteredHistory = historyRequests.filter(item => {
    const q = historySearch.trim().toLowerCase();
    if (q && !(item.document || '').toLowerCase().includes(q)) return false;
    const relDate = item.released_at || item.created_at;
    if (historyDateFrom && relDate && new Date(relDate) < new Date(historyDateFrom)) return false;
    if (historyDateTo && relDate && new Date(relDate) > new Date(historyDateTo + 'T23:59:59')) return false;
    return true;
  });
  const statusLabel = status => {
    if (status === 'current') return 'In Progress';
    if (status === 'done') return 'Ready';
    return 'Pending';
  };
  const closePasswordModal = () => {
    setPasswordModalOpen(false);
    setCurrentPassword('');
    setShowCurrentPassword(false);
    setAccountPassword('');
    setAccountShowPassword(false);
  };

  const closeAnnouncementModal = () => {
    setAnnouncementIndex(null);
    setAnnouncementDismissed(true);
  };
  const hasAnnouncements = announcements && announcements.length > 0;
  const currentAnnouncement = hasAnnouncements && announcementIndex !== null ? announcements[announcementIndex] : null;

  // Auto-show announcements modal on mount (once per session)
  React.useEffect(() => {
    if (hasAnnouncements && !announcementDismissed && announcementIndex === null) {
      setAnnouncementIndex(0);
    }
  }, [hasAnnouncements, announcementDismissed, announcementIndex]);
  const goPrevAnnouncement = () => {
    if (!hasAnnouncements || announcementIndex === null) return;
    setAnnouncementIndex(prev => (prev - 1 + announcements.length) % announcements.length);
  };
  const goNextAnnouncement = () => {
    if (!hasAnnouncements || announcementIndex === null) return;
    setAnnouncementIndex(prev => (prev + 1) % announcements.length);
  };

  // Load already-submitted feedback IDs so we can hide the feedback button
  React.useEffect(() => {
    if (!supabase || !selectedResident?.id || !releaseLogs?.length) return;
    let isActive = true;
    const releaseIds = releaseLogs.map(r => r.id);
    supabase
      .from('resident_feedback')
      .select('release_log_id')
      .in('release_log_id', releaseIds)
      .then(({ data }) => {
        if (!isActive) return;
        if (data) setSubmittedFeedbackIds(new Set(data.map(r => r.release_log_id)));
      });
    return () => { isActive = false; };
  }, [supabase, selectedResident?.id, releaseLogs]);

  const handleCancelClick = async (requestId) => {
    setCancellingId(requestId);
    await onCancelRequest(requestId);
    setCancellingId(null);
  };

  const openFeedbackModal = (releaseLog) => {
    setFeedbackModal(releaseLog);
    setFeedbackRating(0);
    setFeedbackComment('');
  };

  const handleFeedbackSubmit = async () => {
    if (!feedbackModal || feedbackRating < 1) return;
    setFeedbackSubmitting(true);
    await onSubmitFeedback(feedbackModal.id, feedbackRating, feedbackComment);
    setSubmittedFeedbackIds(prev => new Set([...prev, feedbackModal.id]));
    setFeedbackSubmitting(false);
    setFeedbackModal(null);
  };

  const handlePasswordUpdate = async event => {
    const success = await onUpdateAccount(event, currentPassword);
    if (success) {
      closePasswordModal();
    }
  };

  const basePrice = pricingInfo?.prices?.[requestForm.document] ?? null;
  const serviceFee = pricingInfo?.serviceFee || 0;
  const smsFee = pricingInfo?.smsFee || 0;
  const totalPrice = basePrice !== null ? basePrice + serviceFee + smsFee : null;
  const formatCurrency = value => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 2 }).format(value || 0);

  const successReference = requestSuccessDetails?.reference || '';
  const successPrice = requestSuccessDetails?.price;
  const successDocument = requestSuccessDetails?.document || requestForm.document;
  const successMessage = requestSuccessModalMessage || requestSuccessDetails?.message || '';

  const formatResidentName = () => {
    if (!selectedResident) return 'N/A';
    const middle = selectedResident.middle_name ? ` ${selectedResident.middle_name}` : '';
    return `${selectedResident.last_name || ''}, ${selectedResident.first_name || ''}${middle}`.trim();
  };

  const handleDownloadReceipt = () => {
    const name = formatResidentName();
    const doc = successDocument || 'N/A';
    const ref = successReference || 'N/A';
    const price = successPrice !== null && successPrice !== undefined ? formatCurrency(successPrice) : 'Not available';

    const W = 380;
    const PAD = 24;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    // Fonts
    const fontBold = 'bold 16px "Segoe UI", Arial, sans-serif';
    const fontNormal = '14px "Segoe UI", Arial, sans-serif';
    const fontSmall = '12px "Segoe UI", Arial, sans-serif';
    const fontTitle = 'bold 18px "Segoe UI", Arial, sans-serif';

    // Calculate height first
    canvas.width = W;
    canvas.height = 500; // temp
    ctx.font = fontNormal;

    let y = PAD;
    const lineH = 22;
    const sectionGap = 14;

    // Title block
    y += 20; // Barangay Document Request Receipt
    y += lineH; // subtitle
    y += sectionGap;
    y += 2; // separator line

    // Details
    const details = [
      { label: 'Name: ', value: name },
      { label: 'Document: ', value: doc },
      { label: 'Reference: ', value: ref },
      { label: 'Price: ', value: price },
    ];
    y += sectionGap;
    y += details.length * lineH;
    y += sectionGap;
    y += 2; // separator line

    // Footer
    y += sectionGap;
    y += lineH; // thank you
    y += PAD;

    const totalH = y;
    canvas.height = totalH;

    // Background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, totalH);

    // Draw
    y = PAD;

    // Header
    ctx.fillStyle = '#1d2b53';
    ctx.font = fontTitle;
    ctx.textAlign = 'center';
    ctx.fillText('Document Request Receipt', W / 2, y + 16);
    y += 20;
    ctx.font = fontSmall;
    ctx.fillStyle = '#6b7280';
    ctx.fillText(new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' }), W / 2, y + 14);
    y += lineH;
    y += sectionGap;

    // Separator
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PAD, y);
    ctx.lineTo(W - PAD, y);
    ctx.stroke();
    y += 2;
    y += sectionGap;

    // Details
    ctx.textAlign = 'left';
    const labelX = PAD;
    const valueX = PAD + 100;
    for (const { label, value } of details) {
      ctx.font = fontBold;
      ctx.fillStyle = '#374151';
      ctx.fillText(label, labelX, y + 14);
      ctx.font = fontNormal;
      ctx.fillStyle = '#1d2b53';
      ctx.fillText(value, valueX, y + 14);
      y += lineH;
    }

    y += sectionGap;

    // Separator
    ctx.strokeStyle = '#e5e7eb';
    ctx.beginPath();
    ctx.moveTo(PAD, y);
    ctx.lineTo(W - PAD, y);
    ctx.stroke();
    y += 2;
    y += sectionGap;

    // Footer
    ctx.font = fontSmall;
    ctx.fillStyle = '#6b7280';
    ctx.textAlign = 'center';
    ctx.fillText('Thank you! Please wait for the SMS notification.', W / 2, y + 12);

    // Download
    const dataUrl = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `request-receipt-${ref}.png`;
    link.click();
  };

  const tabMeta = [
    { key: 'home', label: 'Home', Icon: HomeIcon },
    { key: 'request', label: 'Request', Icon: RequestIcon },
    { key: 'profile', label: 'Profile', Icon: ProfileIcon },
  ];

  return (
    <div className="resident-portal">
      {/* Desktop pill tabs */}
      <div className="resident-tabs resident-tabs--desktop">
        {tabMeta.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            className={`resident-tab ${activeTab === key ? 'is-active' : ''}`}
            onClick={() => setActiveTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Mobile bottom navigation */}
      <nav className="resident-bottom-nav">
        {tabMeta.map(item => (
          <button
            key={item.key}
            type="button"
            className={`resident-bottom-nav-item ${activeTab === item.key ? 'is-active' : ''}`}
            onClick={() => setActiveTab(item.key)}
          >
            <item.Icon />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      {verificationStatus === 'pending_update' ? (
        <div className="resident-banner">
          Your profile update is pending approval. You can still submit requests.
        </div>
      ) : null}

      {activeTab === 'home' && unratedCount > 0 && !feedbackBannerDismissed ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '12px', padding: '10px 16px', fontSize: '0.82rem', color: '#1e40af', marginBottom: '0' }}>
          <span style={{ flexShrink: 0, fontSize: '1rem' }}>⭐</span>
          <span style={{ flex: 1 }}>
            You have <strong>{unratedCount}</strong> unrated {unratedCount === 1 ? 'document' : 'documents'} in your request history. Help us improve by rating your experience!
          </span>
          <button
            type="button"
            onClick={() => setFeedbackBannerDismissed(true)}
            style={{ flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.1rem', color: '#64748b', lineHeight: 1, padding: '2px 4px' }}
            aria-label="Dismiss notice"
          >
            ✕
          </button>
        </div>
      ) : null}

      {activeTab === 'home' ? (
        <section className="resident-card">
          <div className="resident-card-head">
            <h2>Welcome back</h2>
            <p>Track your requests and recent barangay updates.</p>
          </div>
          <div className="resident-summary">
            <div>
              <span>Pending</span>
              <strong>{requestCounts.pending}</strong>
            </div>
            <div>
              <span>In Progress</span>
              <strong>{requestCounts.current}</strong>
            </div>
            <div>
              <span>Ready</span>
              <strong>{requestCounts.done}</strong>
            </div>
          </div>
          <div className="resident-home-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div>
              <h3>Ongoing requests</h3>
              {requestsLoading ? (
                <p className="resident-note">Loading requests...</p>
              ) : recentRequests.length ? (
                <div className="resident-scroll-list">
                  <ul className="resident-list">
                    {recentRequests.map(item => (
                      <li key={item.id}>
                        <div style={{ flex: 1 }}>
                          <p>{item.document}</p>
                          <span>Status: {statusLabel(item.status)}</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                          <span style={{ fontSize: '0.8rem' }}>{new Date(item.created_at).toLocaleDateString('en-PH')}</span>
                          {item.status === 'pending' ? (
                            <button
                              type="button"
                              className="resident-link"
                              style={{ fontSize: '0.75rem', color: '#ef4444' }}
                              disabled={cancellingId === item.id}
                              onClick={() => handleCancelClick(item.id)}
                            >
                              {cancellingId === item.id ? 'Cancelling...' : 'Cancel'}
                            </button>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="resident-note">No ongoing requests yet.</p>
              )}
            </div>
            <div>
              <h3>Request history</h3>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' }}>
                <input
                  type="search"
                  value={historySearch}
                  onChange={e => setHistorySearch(e.target.value)}
                  placeholder="Search document..."
                  style={{ flex: 1, minWidth: '120px', padding: '4px 8px', borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}
                />
                <input
                  type="date"
                  value={historyDateFrom}
                  onChange={e => setHistoryDateFrom(e.target.value)}
                  style={{ padding: '4px 6px', borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}
                  title="From date"
                />
                <input
                  type="date"
                  value={historyDateTo}
                  onChange={e => setHistoryDateTo(e.target.value)}
                  style={{ padding: '4px 6px', borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}
                  title="To date"
                />
              </div>
              {releaseLogsLoading ? (
                <p className="resident-note">Loading requests...</p>
              ) : filteredHistory.length ? (
                <div className="resident-scroll-list">
                  <ul className="resident-list">
                    {filteredHistory.map(item => (
                      <li key={item.id}>
                        <div style={{ flex: 1 }}>
                          <p>{item.document || 'Document'}</p>
                          <span>Status: Claimed</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                          <span style={{ fontSize: '0.8rem' }}>{new Date(item.released_at || item.created_at).toLocaleDateString('en-PH')}</span>
                          {!submittedFeedbackIds.has(item.id) ? (
                            <button
                              type="button"
                              className="resident-link"
                              style={{ fontSize: '0.75rem' }}
                              onClick={() => openFeedbackModal(item)}
                            >
                              Rate
                            </button>
                          ) : (
                            <span style={{ fontSize: '0.7rem', color: '#16a34a' }}>✓ Rated</span>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : historyRequests.length ? (
                <p className="resident-note">No results match your filter.</p>
              ) : (
                <p className="resident-note">No claimed requests yet.</p>
              )}
            </div>
          </div>
        </section>
      ) : null}

      {activeTab === 'request' ? (
        <section className="resident-card">
          <div className="resident-card-head">
            <h2>Submit a request</h2>
            <p>Linked residents can request documents remotely.</p>
          </div>
          <form className="resident-form" onSubmit={onSubmitRequest}>
            {requestError ? <p className="resident-note resident-note--error">{requestError}</p> : null}
            <label className="resident-field">
              <span>Document type</span>
              <select
                value={requestForm.document}
                onChange={event => {
                  if (event.target.value === MORE_DOCS_VALUE) {
                    setMoreDocsNotice(true);
                    return;
                  }
                  setRequestForm(prev => ({ ...prev, document: event.target.value }));
                }}
                required
              >
                <option value="">Select</option>
                {documentOptions.map(option => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
                <option value={MORE_DOCS_VALUE}>Other documents...</option>
              </select>
            </label>
            {requestForm.document ? (
              <div className="resident-note resident-note--info">
                <strong>Price review</strong>
                <div className="resident-price-lines">
                  <div><span>Document: </span> <span>{basePrice !== null ? formatCurrency(basePrice) : 'Not set'}</span></div>
                  <div><span>Service fee: </span> <span>{formatCurrency(serviceFee)}</span></div>
                  <div><span>SMS fee: </span> <span>{formatCurrency(smsFee)}</span></div>
                  <div><span>Total: </span> <span>{totalPrice !== null ? formatCurrency(totalPrice) : 'Not set'}</span></div>
                </div>
              </div>
            ) : null}
            <label className="resident-field">
              <span>Purpose</span>
              <textarea
                value={requestForm.purpose}
                onChange={event => setRequestForm(prev => ({ ...prev, purpose: event.target.value }))}
                placeholder="Briefly describe why you need this document."
                rows={3}
                required
              />
            </label>
            <button className="resident-submit" type="submit" disabled={requestSaving}>
              {requestSaving ? 'Submitting...' : 'Submit request'}
            </button>
          </form>
        </section>
      ) : null}

      {activeTab === 'profile' ? (
        <section className="resident-card">
          <div className="resident-card-head">
            <h2>Profile details</h2>
            <p>Edits will be reviewed before they take effect.</p>
          </div>
          {profileSaveError ? <p className="resident-note resident-note--error">{profileSaveError}</p> : null}
          {profileSaveInfo ? <p className="resident-note resident-note--info">{profileSaveInfo}</p> : null}

          {!profileEditing ? (
            <div className="resident-profile">
              <div className="resident-profile-grid">
                <div>
                  <span>Full name</span>
                  <strong>
                    {selectedResident?.last_name || 'N/A'}, {selectedResident?.first_name || ''} {selectedResident?.middle_name || ''}
                  </strong>
                </div>
                <div>
                  <span>Sex</span>
                  <strong>{selectedResident?.sex || 'N/A'}</strong>
                </div>
                <div>
                  <span>Civil status</span>
                  <strong>{selectedResident?.civil_status || 'N/A'}</strong>
                </div>
                <div>
                  <span>Birthday</span>
                  <strong>{selectedResident?.birthday || 'N/A'}</strong>
                </div>
                <div>
                  <span>Birthplace</span>
                  <strong>{selectedResident?.birthplace || 'N/A'}</strong>
                </div>
                <div>
                  <span>Address</span>
                  <strong>{addressDisplay}</strong>
                </div>
                <div>
                  <span>Zone</span>
                  <strong>{zoneValue || 'N/A'}</strong>
                </div>
                <div>
                  <span>Occupation</span>
                  <strong>{selectedResident?.occupation || 'N/A'}</strong>
                </div>
                <div>
                  <span>Education</span>
                  <strong>{selectedResident?.education || 'N/A'}</strong>
                </div>
                <div>
                  <span>Religion</span>
                  <strong>{selectedResident?.religion || 'N/A'}</strong>
                </div>
                <div>
                  <span>Email</span>
                  <strong>{selectedResident?.email || 'N/A'}</strong>
                </div>
                <div>
                  <span>Telephone</span>
                  <strong>{selectedResident?.telephone || 'N/A'}</strong>
                </div>
              </div>
              <button className="resident-submit" type="button" onClick={onStartProfileEdit}>
                Update profile
              </button>
            </div>
          ) : (
            <form className="resident-form" onSubmit={onSubmitProfileUpdate}>
              <div className="resident-form-grid">
                <label className="resident-field">
                  <span>First name</span>
                  <input name="firstName" value={profileForm.firstName} onChange={onProfileChange} />
                </label>
                <label className="resident-field">
                  <span>Last name</span>
                  <input name="lastName" value={profileForm.lastName} onChange={onProfileChange} />
                </label>
                <label className="resident-field">
                  <span>Middle name</span>
                  <input name="middleName" value={profileForm.middleName} onChange={onProfileChange} />
                </label>
                <label className="resident-field">
                  <span>Sex</span>
                  <select name="sex" value={profileForm.sex} onChange={onProfileChange}>
                    <option value="">Select</option>
                    {sexOptions.map(option => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </label>
                <label className="resident-field">
                  <span>Civil status</span>
                  <select name="civilStatus" value={profileForm.civilStatus} onChange={onProfileChange}>
                    <option value="">Select</option>
                    {civilStatuses.map(option => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </label>
                <label className="resident-field">
                  <span>Birthday</span>
                  <input type="date" name="birthday" value={profileForm.birthday} onChange={onProfileChange} />
                </label>
                <label className="resident-field">
                  <span>Birthplace</span>
                  <input name="birthplace" value={profileForm.birthplace} onChange={onProfileChange} />
                </label>
                <label className="resident-field">
                  <span>Address</span>
                  <input name="address" value={profileForm.address} onChange={onProfileChange} />
                </label>
                <label className="resident-field">
                  <span>Zone</span>
                  <select name="zone" value={profileForm.zone} onChange={onProfileChange}>
                    <option value="">Select</option>
                    {Array.from({ length: zoneCount }, (_, index) => index + 1).map(option => (
                      <option key={option} value={String(option)}>
                        Zone {option}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="resident-field">
                  <span>Occupation</span>
                  <input name="occupation" value={profileForm.occupation} onChange={onProfileChange} />
                </label>
                <label className="resident-field">
                  <span>Education</span>
                  <select name="education" value={profileForm.education} onChange={onProfileChange}>
                    <option value="">Select</option>
                    {educationLevels.map(option => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </label>
                <label className="resident-field">
                  <span>Religion</span>
                  <input name="religion" value={profileForm.religion} onChange={onProfileChange} />
                </label>
                <label className="resident-field">
                  <span>Email</span>
                  <input type="email" name="email" value={profileForm.email} onChange={onProfileChange} />
                </label>
                <label className="resident-field">
                  <span>Telephone</span>
                  <input name="telephone" value={profileForm.telephone} onChange={onProfileChange} />
                </label>
              </div>
              <div className="resident-actions">
                <button type="button" className="resident-link" onClick={onCancelProfileEdit}>
                  Cancel
                </button>
                <button className="resident-submit" type="submit" disabled={profileSaving}>
                  {profileSaving ? 'Submitting...' : 'Submit update for review'}
                </button>
              </div>
            </form>
          )}
          <div className="resident-card">
            <div className="resident-card-head">
              <h2>Login details</h2>
              <p>Update your account password.</p>
            </div>
            <form className="resident-form" onSubmit={handlePasswordUpdate}>
              {accountError ? <p className="resident-note resident-note--error">{accountError}</p> : null}
              {accountInfo ? <p className="resident-note resident-note--info">{accountInfo}</p> : null}
              <label className="resident-field">
                <span>Email address</span>
                <input type="email" value={accountEmail || ''} readOnly />
              </label>
              <button
                className="resident-submit"
                type="button"
                disabled={accountSaving}
                onClick={() => setPasswordModalOpen(true)}
              >
                {accountSaving ? 'Updating...' : 'Change password'}
              </button>
            </form>
          </div>
          {onSignOut ? (
            <button type="button" className="resident-signout-profile" onClick={onSignOut}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
              Sign out
            </button>
          ) : null}
        </section>
      ) : null}

      {passwordModalOpen ? (
        <div className="resident-modal-backdrop">
          <div className="resident-modal">
            <div className="resident-modal-scroll">
              <div className="resident-card-head">
                <h2>Update password</h2>
                <p>Enter your current password, then set a new one.</p>
              </div>
              <form className="resident-form" onSubmit={handlePasswordUpdate}>
                {accountError ? <p className="resident-note resident-note--error">{accountError}</p> : null}
                {accountInfo ? <p className="resident-note resident-note--info">{accountInfo}</p> : null}
                <label className="resident-field">
                  <span>Current password</span>
                  <div className="resident-password">
                    <input
                      type={showCurrentPassword ? 'text' : 'password'}
                      value={currentPassword}
                      onChange={event => setCurrentPassword(event.target.value)}
                      placeholder="********"
                    />
                    <button
                      type="button"
                      className="resident-password-toggle"
                      onClick={() => setShowCurrentPassword(prev => !prev)}
                    >
                      {showCurrentPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </label>
                <label className="resident-field">
                  <span>New password (min 6 characters)</span>
                  <div className="resident-password">
                    <input
                      type={accountShowPassword ? 'text' : 'password'}
                      value={accountPassword}
                      onChange={event => setAccountPassword(event.target.value)}
                      placeholder="Enter new password"
                    />
                    <button
                      type="button"
                      className="resident-password-toggle"
                      onClick={() => setAccountShowPassword(prev => !prev)}
                    >
                      {accountShowPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </label>
                <div className="resident-modal-actions">
                  <button type="button" className="resident-link" onClick={closePasswordModal}>
                    Cancel
                  </button>
                  <button className="resident-submit" type="submit" disabled={accountSaving}>
                    {accountSaving ? 'Updating...' : 'Update password'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      ) : null}

      {currentAnnouncement ? (
        <div className="resident-modal-backdrop" role="dialog" aria-modal="true">
          <div className="resident-modal" onClick={event => event.stopPropagation()}>
            <div className="resident-modal-scroll">
              <div className="resident-card-head">
                <p style={{ fontSize: '0.8rem', color: '#6b7280', margin: 0 }}>
                  Announcement {announcementIndex + 1} of {announcements.length}
                </p>
                <h2>{currentAnnouncement.title || 'Announcement'}</h2>
              </div>
              {currentAnnouncement.image_data || currentAnnouncement.imageData ? (
                <div className="resident-image-frame">
                  <img
                    src={currentAnnouncement.image_data || currentAnnouncement.imageData}
                    alt={currentAnnouncement.title || 'Announcement visual'}
                  />
                </div>
              ) : null}
              <p>{currentAnnouncement.description || 'Details will be posted soon.'}</p>
              <div className="resident-modal-actions">
                {announcements.length > 1 ? (
                  <>
                    <button type="button" className="resident-link" onClick={goPrevAnnouncement}>
                      Previous
                    </button>
                    <button type="button" className="resident-link" onClick={goNextAnnouncement}>
                      Next
                    </button>
                  </>
                ) : null}
                <button className="resident-submit" type="button" onClick={closeAnnouncementModal}>
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {requestSuccessModalOpen ? (
        <div className="resident-modal-backdrop" role="dialog" aria-modal="true">
          <div className="resident-modal" onClick={event => event.stopPropagation()}>
            <div className="resident-modal-scroll">
              <div className="resident-card-head">
                <h2>Request submitted</h2>
                {successMessage && successMessage !== 'Request submitted' ? <p>{successMessage}</p> : null}
              </div>
              <div className="resident-receipt" style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '16px 0' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: '12px', rowGap: '8px', fontSize: '0.95rem' }}>
                  <span style={{ fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' }}>Name:</span>
                  <span style={{ color: '#1d2b53' }}>{selectedResident ? `${selectedResident.last_name || ''}, ${selectedResident.first_name || ''}${selectedResident.middle_name ? ` ${selectedResident.middle_name}` : ''}`.trim() : 'N/A'}</span>
                  <span style={{ fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' }}>Document:</span>
                  <span style={{ color: '#1d2b53' }}>{successDocument || 'N/A'}</span>
                  <span style={{ fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' }}>Reference:</span>
                  <span style={{ color: '#1d2b53' }}>{successReference || 'N/A'}</span>
                  <span style={{ fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' }}>Price:</span>
                  <span style={{ color: '#1d2b53' }}>{successPrice !== null && successPrice !== undefined ? formatCurrency(successPrice) : 'Not available'}</span>
                </div>
                <p style={{ marginTop: '8px', fontSize: '0.85rem', color: '#6b7280', textAlign: 'center' }}>A secretary will text once it is ready.</p>
              </div>
              <div className="resident-modal-actions">
                <button className="resident-link" type="button" onClick={handleDownloadReceipt}>
                  Download receipt
                </button>
                <button className="resident-submit" type="button" onClick={onCloseRequestSuccessModal}>
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {moreDocsNotice ? (
        <div className="resident-modal-backdrop" role="dialog" aria-modal="true">
          <div className="resident-modal" onClick={event => event.stopPropagation()}>
            <div className="resident-modal-scroll">
              <div className="resident-card-head">
                <h2>Not available</h2>
                <p>{MORE_DOCS_NOTICE}</p>
              </div>
              <div className="resident-modal-actions">
                <button className="resident-submit" type="button" onClick={() => setMoreDocsNotice(false)}>
                  OK
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {feedbackModal ? (
        <div className="resident-modal-backdrop" role="dialog" aria-modal="true">
          <div className="resident-modal" onClick={event => event.stopPropagation()}>
            <div className="resident-modal-scroll">
              <div className="resident-card-head">
                <h2>Rate your experience</h2>
                <p>How was your experience with <strong>{feedbackModal.document || 'this document'}</strong>?</p>
              </div>
              <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', margin: '16px 0' }}>
                {[1, 2, 3, 4, 5].map(star => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setFeedbackRating(star)}
                    style={{
                      fontSize: '2rem',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: star <= feedbackRating ? '#f59e0b' : '#d1d5db',
                      transition: 'color 0.15s',
                    }}
                    aria-label={`${star} star${star > 1 ? 's' : ''}`}
                  >
                    ★
                  </button>
                ))}
              </div>
              <p style={{ textAlign: 'center', fontSize: '0.85rem', color: '#6b7280', margin: 0 }}>
                {feedbackRating === 0 ? 'Tap a star to rate' : `${feedbackRating} out of 5 stars`}
              </p>
              <label className="resident-field" style={{ marginTop: '12px' }}>
                <span>Comment (optional)</span>
                <textarea
                  value={feedbackComment}
                  onChange={e => setFeedbackComment(e.target.value)}
                  placeholder="Share your thoughts about the service..."
                  rows={3}
                  style={{ resize: 'vertical' }}
                />
              </label>
              <div className="resident-modal-actions">
                <button className="resident-link" type="button" onClick={() => setFeedbackModal(null)}>
                  Cancel
                </button>
                <button
                  className="resident-submit"
                  type="button"
                  disabled={feedbackRating < 1 || feedbackSubmitting}
                  onClick={handleFeedbackSubmit}
                >
                  {feedbackSubmitting ? 'Submitting...' : 'Submit feedback'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
