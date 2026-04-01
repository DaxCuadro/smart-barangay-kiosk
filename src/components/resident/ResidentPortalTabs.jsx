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
}) {
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [moreDocsNotice, setMoreDocsNotice] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [announcementIndex, setAnnouncementIndex] = useState(null);
  const addressValue = selectedResident?.address || '';
  const zoneValue = extractZoneFromAddress(addressValue);
  const addressDisplay = /^\s*Zone\s+\d+\s*$/i.test(addressValue) ? 'N/A' : (addressValue || 'N/A');
  const ongoingRequests = requests.filter(item => ['pending', 'current', 'done'].includes(item.status || 'pending'));
  const recentRequests = ongoingRequests;
  const historyRequests = releaseLogs || [];
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

  const closeAnnouncementModal = () => setAnnouncementIndex(null);
  const openAnnouncement = index => setAnnouncementIndex(index);
  const hasAnnouncements = announcements && announcements.length > 0;
  const currentAnnouncement = hasAnnouncements && announcementIndex !== null ? announcements[announcementIndex] : null;
  const goPrevAnnouncement = () => {
    if (!hasAnnouncements || announcementIndex === null) return;
    setAnnouncementIndex(prev => (prev - 1 + announcements.length) % announcements.length);
  };
  const goNextAnnouncement = () => {
    if (!hasAnnouncements || announcementIndex === null) return;
    setAnnouncementIndex(prev => (prev + 1) % announcements.length);
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
    const lines = [
      'Barangay Document Request Receipt',
      `Name: ${formatResidentName()}`,
      `Document: ${successDocument || 'N/A'}`,
      `Reference: ${successReference || 'N/A'}`,
      `Price: ${successPrice !== null && successPrice !== undefined ? formatCurrency(successPrice) : 'Not available'}`,
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `request-receipt-${successReference || 'receipt'}.txt`;
    link.click();
    URL.revokeObjectURL(url);
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
          <div className="resident-home-grid">
            <div>
              <h3>Ongoing requests</h3>
              {requestsLoading ? (
                <p className="resident-note">Loading requests...</p>
              ) : recentRequests.length ? (
                <div className="resident-scroll-list">
                  <ul className="resident-list">
                    {recentRequests.map(item => (
                      <li key={item.id}>
                        <div>
                          <p>{item.document}</p>
                          <span>Status: {statusLabel(item.status)}</span>
                        </div>
                        <span>{new Date(item.created_at).toLocaleDateString('en-PH')}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="resident-note">No ongoing requests yet.</p>
              )}
            </div>
            <div>
              <h3>Announcements</h3>
              {announcements.length ? (
                <div className="resident-scroll-list">
                  <ul className="resident-list">
                    {announcements.map((item, index) => (
                      <li key={item.id}>
                        <div>
                          <p>{item.title || 'Announcement'}</p>
                          <span>{item.description || 'Details will be posted soon.'}</span>
                        </div>
                        <button
                          type="button"
                          className="resident-link"
                          onClick={() => openAnnouncement(index)}
                        >
                          View
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="resident-note">No announcements yet.</p>
              )}
            </div>
            <div>
              <h3>Request history</h3>
              {releaseLogsLoading ? (
                <p className="resident-note">Loading requests...</p>
              ) : historyRequests.length ? (
                <div className="resident-scroll-list">
                  <ul className="resident-list">
                    {historyRequests.map(item => (
                      <li key={item.id}>
                        <div>
                          <p>{item.document || 'Document'}</p>
                          <span>Status: Claimed</span>
                        </div>
                        <span>{new Date(item.released_at || item.created_at).toLocaleDateString('en-PH')}</span>
                      </li>
                    ))}
                  </ul>
                </div>
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
              <div className="resident-receipt">
                <div className="resident-price-lines">
                  <div><span>Reference number: </span><span>{successReference || 'N/A'}</span></div>
                  <div><span>Document: </span><span>{successDocument || 'N/A'}</span></div>
                  <div><span>Price: </span><span>{successPrice !== null && successPrice !== undefined ? formatCurrency(successPrice) : 'Not available'}</span></div>
                </div>
                <p style={{ marginTop: '12px' }}>A secretary will text once it is ready.</p>
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
    </div>
  );
}
