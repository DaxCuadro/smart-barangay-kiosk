
import React, { useState } from 'react';
import logo from '../assets/logo.png';
import { useSupabase } from '../contexts/SupabaseContext';

// Finalized color palette
// Primary: #2563eb (blue-600)
// Accent: #1e40af (blue-800)
// Background: #f8fafc (gray-50)
// Card: #ffffff (white)
// Border: #e5e7eb (gray-200)
// Error: #ef4444 (red-500)


export default function AdminLogin({ onLogin, accessError, onLogout }) {
  const supabase = useSupabase();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState(null);
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [recoveryCompleted, setRecoveryCompleted] = useState(false);
  const [otpMode, setOtpMode] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpMaskedPhone, setOtpMaskedPhone] = useState('');
  const [otpVerifying, setOtpVerifying] = useState(false);

  React.useEffect(() => {
    const hash = window.location.hash || '';
    if (hash.includes('type=recovery')) {
      setRecoveryMode(true);
    }

    const { data: authListener } = supabase.auth.onAuthStateChange(event => {
      if (event === 'PASSWORD_RECOVERY') {
        setRecoveryMode(true);
        setRecoveryCompleted(false);
        setError(null);
        setInfo('Set your new password below.');
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [supabase.auth]);

  async function handleLogin(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setInfo('');
    const { error, data } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setLoading(false);
      setError(error.message);
      return;
    }

    const { data: adminRow, error: adminError } = await supabase
      .from('admin_users')
      .select('user_id')
      .eq('user_id', data.user.id)
      .maybeSingle();

    if (adminError || !adminRow) {
      await supabase.auth.signOut();
      setLoading(false);
      setError('This account is not authorized for admin access.');
      return;
    }

    setLoading(false);
    if (rememberMe) {
      localStorage.setItem('adminEmail', email);
    } else {
      localStorage.removeItem('adminEmail');
    }
    onLogin(data.session);
  }

  async function handleForgotPassword() {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError('Enter your email first so we can send an OTP.');
      return;
    }

    setForgotLoading(true);
    setError(null);
    setInfo('');

    const { data, error: invokeError } = await supabase.functions.invoke('request_otp', {
      body: { email: trimmedEmail, user_type: 'admin' },
    });

    setForgotLoading(false);
    if (invokeError || data?.error) {
      setError(data?.error || invokeError?.message || 'Failed to send OTP.');
      return;
    }

    setOtpMaskedPhone(data?.masked_phone || '');
    setOtpMode(true);
    setOtpCode('');
    setNewPassword('');
    setConfirmPassword('');
    setInfo(`OTP sent to ${data?.masked_phone || 'your phone'}. Enter it below.`);
  }

  async function handleVerifyOtpAndReset(event) {
    event.preventDefault();
    setError(null);
    setInfo('');

    if (!otpCode.trim()) {
      setError('Enter the OTP code sent to your phone.');
      return;
    }
    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Password confirmation does not match.');
      return;
    }

    setOtpVerifying(true);
    const { data, error: invokeError } = await supabase.functions.invoke('verify_otp', {
      body: { email: email.trim(), otp: otpCode.trim(), new_password: newPassword },
    });
    setOtpVerifying(false);

    if (invokeError || data?.error) {
      setError(data?.error || invokeError?.message || 'Failed to verify OTP.');
      return;
    }

    setOtpMode(false);
    setOtpCode('');
    setNewPassword('');
    setConfirmPassword('');
    setRecoveryCompleted(true);
    setInfo('Password updated successfully. Sign in with your new password.');
  }

  async function handleUpdatePassword(event) {
    event.preventDefault();
    setError(null);
    setInfo('');

    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Password confirmation does not match.');
      return;
    }

    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
    setLoading(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setNewPassword('');
    setConfirmPassword('');
    setRecoveryCompleted(true);
    window.history.replaceState(null, '', '/admin');
    setInfo('Password updated successfully.');
  }

  // Autofill email if remembered
  React.useEffect(() => {
    const savedEmail = localStorage.getItem('adminEmail');
    if (savedEmail) {
      setEmail(savedEmail);
      setRememberMe(true);
    }
  }, []);

  return (
    <div className="min-h-screen w-full bg-(--sbk-page-bg) px-4 py-8">
      <div className="mx-auto flex w-full max-w-md items-center">
        <form
          className="sbk-panel w-full rounded-4xl border border-transparent bg-white/95 p-6 shadow-2xl"
          onSubmit={recoveryMode ? handleUpdatePassword : otpMode ? handleVerifyOtpAndReset : handleLogin}
        >
          <div className="mb-6 text-center">
            <img src={logo} alt="Smart Barangay Kiosk" className="mx-auto h-10 select-none" draggable="false" />
            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
              {recoveryMode ? 'Account recovery' : otpMode ? 'Password reset' : 'Welcome back'}
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-900">
              {recoveryMode ? 'Set new password' : otpMode ? 'Enter OTP' : 'Admin login'}
            </h2>
          </div>

          {!recoveryMode && !recoveryCompleted && !otpMode ? (
            <>
          <div className="mb-5">
            <label className="block text-sm font-semibold text-slate-700" htmlFor="admin-email">Email</label>
            <input
              id="admin-email"
              type="email"
              placeholder="name@barangay.gov.ph"
              className="mt-2 block w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-(--sbk-accent)"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="username"
            />
          </div>
          <div className="mb-5">
            <label className="block text-sm font-semibold text-slate-700" htmlFor="admin-password">Password</label>
            <div className="relative mt-2 flex items-center">
              <input
                id="admin-password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Enter your password"
                className="block w-full rounded-2xl border border-slate-200 px-4 py-3 pr-11 text-sm text-slate-900 placeholder:text-slate-400 focus:border-(--sbk-accent)"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
              <button
                type="button"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                onClick={() => setShowPassword(v => !v)}
                className="absolute inset-y-0 right-3 flex items-center text-slate-500 hover:text-slate-700"
              >
                {showPassword ? (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-5.523 0-10-4.477-10-10 0-1.657.336-3.236.938-4.675M15 12a3 3 0 11-6 0 3 3 0 016 0zm6.062-4.675A9.956 9.956 0 0122 9c0 5.523-4.477 10-10 10a9.956 9.956 0 01-4.675-.938M3 3l18 18" /></svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0zm7-1c0 5-4 9-10 9S2 16 2 11s4-9 10-9 10 4 10 9z" /></svg>
                )}
              </button>
            </div>
          </div>
          <div className="mb-4 flex items-center justify-between text-sm">
            <label className="flex items-center gap-2 text-slate-600">
              <input
                id="remember-me"
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300 text-(--sbk-accent) focus:ring-(--sbk-accent)"
                checked={rememberMe}
                onChange={e => setRememberMe(e.target.checked)}
              />
              Remember me on this device
            </label>
          </div>
          <div className="mb-4 text-right">
            <button
              type="button"
              className="text-sm font-semibold text-(--sbk-accent) hover:text-(--sbk-accent-strong)"
              onClick={handleForgotPassword}
              disabled={forgotLoading}
            >
              {forgotLoading ? 'Sending OTP...' : 'Forgot password?'}
            </button>
          </div>
            </>
          ) : recoveryMode ? (
            <>
              <div className="mb-5">
                <label className="block text-sm font-semibold text-slate-700" htmlFor="admin-new-password">New password</label>
                <input
                  id="admin-new-password"
                  type="password"
                  className="mt-2 block w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-(--sbk-accent)"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  minLength={8}
                  required
                  autoComplete="new-password"
                />
              </div>
              <div className="mb-5">
                <label className="block text-sm font-semibold text-slate-700" htmlFor="admin-confirm-password">Confirm password</label>
                <input
                  id="admin-confirm-password"
                  type="password"
                  className="mt-2 block w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-(--sbk-accent)"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  minLength={8}
                  required
                  autoComplete="new-password"
                />
              </div>
            </>
          ) : otpMode ? (
            <>
              <p className="mb-4 text-sm text-slate-600 text-center">
                A 6-digit code was sent to <strong>{otpMaskedPhone || 'your registered phone'}</strong>.
              </p>
              <div className="mb-5">
                <label className="block text-sm font-semibold text-slate-700" htmlFor="admin-otp">OTP Code</label>
                <input
                  id="admin-otp"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="123456"
                  className="mt-2 block w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 tracking-[0.3em] text-center placeholder:text-slate-400 focus:border-(--sbk-accent)"
                  value={otpCode}
                  onChange={e => setOtpCode(e.target.value.replace(/\D/g, ''))}
                  required
                />
              </div>
              <div className="mb-5">
                <label className="block text-sm font-semibold text-slate-700" htmlFor="admin-otp-new-password">New password</label>
                <input
                  id="admin-otp-new-password"
                  type="password"
                  placeholder="At least 8 characters"
                  className="mt-2 block w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-(--sbk-accent)"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  minLength={8}
                  required
                  autoComplete="new-password"
                />
              </div>
              <div className="mb-5">
                <label className="block text-sm font-semibold text-slate-700" htmlFor="admin-otp-confirm-password">Confirm password</label>
                <input
                  id="admin-otp-confirm-password"
                  type="password"
                  className="mt-2 block w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-(--sbk-accent)"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  minLength={8}
                  required
                  autoComplete="new-password"
                />
              </div>
            </>
          ) : (
            <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-center">
              <p className="text-sm font-semibold text-emerald-700">Your password has been changed.</p>
              <p className="mt-1 text-xs text-emerald-700/80">Sign in using your new password.</p>
            </div>
          )}

          {(accessError || error) && (
            <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-center text-sm font-semibold text-rose-600">
              {accessError || error}
            </div>
          )}

          {info ? (
            <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-center text-sm font-semibold text-emerald-700">
              {info}
            </div>
          ) : null}

          {onLogout && (
            <button
              type="button"
              className="mb-4 w-full rounded-2xl border border-slate-200 bg-slate-50 py-2 text-sm font-semibold text-slate-700"
              onClick={onLogout}
            >
              Sign out to switch account
            </button>
          )}

          <button
            type="submit"
            className="w-full rounded-2xl bg-(--sbk-accent) py-3 text-sm font-semibold text-white shadow-lg shadow-blue-500/30 transition hover:bg-(--sbk-accent-strong) disabled:opacity-50"
            disabled={loading}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="h-5 w-5 animate-spin text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path></svg>
                {recoveryMode ? 'Updating password…' : 'Checking credentials…'}
              </span>
            ) : recoveryMode ? 'Update password' : otpMode ? (otpVerifying ? 'Verifying...' : 'Reset password') : 'Sign in'}
          </button>

          {recoveryMode || recoveryCompleted || otpMode ? (
            <button
              type="button"
              className="mt-4 w-full rounded-2xl border border-slate-200 bg-slate-50 py-2 text-sm font-semibold text-slate-700"
              onClick={() => {
                setRecoveryMode(false);
                setRecoveryCompleted(false);
                setOtpMode(false);
                setOtpCode('');
                setNewPassword('');
                setConfirmPassword('');
                setError(null);
                setInfo('');
              }}
            >
              {recoveryCompleted ? 'Continue to login' : 'Back to login'}
            </button>
          ) : null}
        </form>
      </div>
    </div>
  );
}
