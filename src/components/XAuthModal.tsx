import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, Eye, EyeOff, Loader2, Mail, Sparkles, X } from 'lucide-react';
import type { UserProfile } from '../types';
import { apiFetch, setAuthToken } from '../lib/api';
import { signInWithGooglePopup, syncUserProfileToFirestore } from '../firebase';
import { DopTubeLogo } from './DopTubeLogo';

interface XAuthModalProps {
  open: boolean;
  theme: 'dark' | 'light';
  onClose: () => void;
  onSuccess: (user: UserProfile) => void;
}

type AuthStep = 'landing' | 'signin' | 'name' | 'birthday' | 'password' | 'username' | 'avatar' | 'interests';

const INTEREST_TOPICS = [
  'Education',
  'Music',
  'Gaming',
  'Technology',
  'Cricket',
  'Comedy',
  'Cooking',
  'Travel',
  'Science',
  'News',
  'Movies',
  'Business',
];

async function compressAvatarFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read image file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Unsupported image format.'));
      img.onload = () => {
        const size = 256;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(String(reader.result || ''));
          return;
        }
        const minSide = Math.min(img.width, img.height);
        const sx = Math.max(0, (img.width - minSide) / 2);
        const sy = Math.max(0, (img.height - minSide) / 2);
        ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  });
}

export const XAuthModal: React.FC<XAuthModalProps> = ({ open, theme, onClose, onSuccess }) => {
  const [step, setStep] = useState<AuthStep>('landing');
  const [name, setName] = useState('');
  const [birthday, setBirthday] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [username, setUsername] = useState('');
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [usernameSuggestions, setUsernameSuggestions] = useState<string[]>([]);
  const [checkingUsername, setCheckingUsername] = useState(false);

  const [avatarDataUrl, setAvatarDataUrl] = useState('');
  const [interests, setInterests] = useState<string[]>([]);

  // Sign-in credentials
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setError('');
      setLoading(false);
      return;
    }
    setStep('landing');
    setError('');
  }, [open]);

  // Check username availability & fetch suggestions when on username step
  useEffect(() => {
    if (!open || step !== 'username') return;
    let cancelled = false;
    setCheckingUsername(true);
    const clean = username.trim().replace(/^@+/, '').replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
    const timer = setTimeout(async () => {
      try {
        const res = await apiFetch<{ available: boolean; normalized: string; suggestions: string[] }>(
          `/api/auth/check-username?username=${encodeURIComponent(clean)}&name=${encodeURIComponent(name)}`
        );
        if (!cancelled) {
          setUsernameAvailable(clean.length >= 3 ? res.available : null);
          setUsernameSuggestions(res.suggestions || []);
        }
      } catch {
        if (!cancelled) setUsernameAvailable(null);
      } finally {
        if (!cancelled) setCheckingUsername(false);
      }
    }, 180);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, step, username, name]);

  if (!open) return null;

  const handleGoogleSignIn = async () => {
    setError('');
    setLoading(true);
    try {
      const { idToken } = await signInWithGooglePopup();
      const res = await apiFetch<{ user: UserProfile; token?: string }>('/api/auth/google', {
        method: 'POST',
        body: JSON.stringify({ idToken }),
      });
      if (res.token) setAuthToken(res.token);

      void syncUserProfileToFirestore({
        displayName: res.user.name,
        handle: res.user.channel?.handle || `@${res.user.name.toLowerCase().replace(/[^a-z0-9]/g, '') || 'creator'}`,
        avatarUrl: res.user.avatarUrl,
        email: res.user.email,
        preferredLanguage: res.user.preferredLanguage || 'English',
        historyPaused: res.user.historyPaused,
        personalizationEnabled: res.user.preferences?.personalizationEnabled ?? true,
        restrictedMode: res.user.restrictedMode,
        theme,
        selectedInterests: res.user.preferences?.selectedInterests ?? [],
      }).catch(() => {});

      onSuccess(res.user);
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Google Sign-In failed.';
      setError(
        message.includes('popup-closed-by-user')
          ? 'Sign-in cancelled. Tap Google again whenever you are ready.'
          : message
      );
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await apiFetch<{ user: UserProfile; token?: string }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          identifier: loginIdentifier.trim(),
          password: loginPassword,
        }),
      });
      if (res.token) setAuthToken(res.token);
      onSuccess(res.user);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterComplete = async () => {
    setError('');
    setLoading(true);
    try {
      const cleanHandle = username.trim().replace(/^@+/, '').replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
      const res = await apiFetch<{ user: UserProfile; token?: string }>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          birthday: birthday.trim(),
          password,
          username: cleanHandle,
          avatarDataUrl,
          interests,
        }),
      });
      if (res.token) setAuthToken(res.token);
      onSuccess(res.user);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    setError('');
    if (step === 'signin' || step === 'name') setStep('landing');
    else if (step === 'birthday') setStep('name');
    else if (step === 'password') setStep('birthday');
    else if (step === 'username') setStep('password');
    else if (step === 'avatar') setStep('username');
    else if (step === 'interests') setStep('avatar');
  };

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const cleanUsername = username.trim().replace(/^@+/, '').replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
  const nameValid = name.trim().length >= 2;
  const birthdayStepValid = birthday.trim().length >= 4 && emailValid;
  const passwordValid = password.length >= 8;
  const usernameStepValid = cleanUsername.length >= 3 && usernameAvailable !== false;
  const interestsValid = interests.length >= 3;

  const primaryCtaClass = (enabled: boolean) =>
    `w-full h-[52px] rounded-full font-bold text-[15px] flex items-center justify-center gap-2 transition-colors ${
      enabled
        ? 'bg-[#0f1419] text-white dark:bg-white dark:text-black hover:opacity-90 cursor-pointer'
        : 'bg-[#eff3f4] text-[#536471] dark:bg-[#202327] dark:text-[#71767b] cursor-not-allowed'
    }`;

  const outlinedPillClass =
    'w-full h-[52px] rounded-full font-bold text-[15px] border border-[#cfd9de] dark:border-[#2f3336] text-[#0f1419] dark:text-white hover:bg-[#eff3f4] dark:hover:bg-[#16181c] flex items-center justify-center transition-colors cursor-pointer';

  const GoogleIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.3 0 6.08-1.09 8.1-2.96l-3.88-3.05c-1.08.72-2.46 1.15-4.22 1.15-3.25 0-6.01-2.2-7-5.16H1.01v3.14C3.05 21.17 7.21 24 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5 14.01c-.25-.72-.39-1.49-.39-2.29s.14-1.57.39-2.29V6.29H1.01A11.996 11.996 0 0 0 0 11.72c0 1.94.46 3.77 1.01 5.43l3.99-3.14Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.8 0 3.41.62 4.68 1.84l3.51-3.51C18.07 1.19 15.3 0 12 0 7.21 0 3.05 2.83 1.01 6.87l3.99 3.14c.99-2.96 3.75-5.26 7-5.26Z"
      />
    </svg>
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="DopTube account authentication"
        className="w-full h-full sm:h-[650px] sm:max-w-[520px] sm:rounded-2xl bg-white dark:bg-black text-[#0f1419] dark:text-[#e7e9ea] border-0 sm:border border-[#e5e7eb] dark:border-[#2f3336] flex flex-col justify-between px-6 py-5 sm:px-10 sm:py-7 shadow-2xl overflow-y-auto"
      >
        {/* Top Bar */}
        <div>
          <div className="flex items-center justify-between min-h-[40px]">
            {step === 'landing' ? (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close sign in dialog"
                className="w-9 h-9 -ml-2 rounded-full flex items-center justify-center hover:bg-[#eff3f4] dark:hover:bg-[#16181c] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleBack}
                aria-label="Go back"
                className="w-9 h-9 -ml-2 rounded-full flex items-center justify-center hover:bg-[#eff3f4] dark:hover:bg-[#16181c] cursor-pointer"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}

            <div className="flex items-center justify-center">
              <DopTubeLogo compact showRegion={false} />
            </div>

            {step !== 'landing' ? (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close dialog"
                className="w-9 h-9 -mr-2 rounded-full flex items-center justify-center hover:bg-[#eff3f4] dark:hover:bg-[#16181c] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            ) : (
              <span className="w-9" />
            )}
          </div>

          {error && (
            <div className="mt-4 px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* STEP 1: LANDING (X/Twitter Create an account) */}
          {step === 'landing' && (
            <div className="mt-8 sm:mt-10 flex flex-col">
              <h1 className="text-[32px] sm:text-[36px] font-extrabold tracking-tight leading-[1.15]">
                Create an account
              </h1>
              <p className="mt-2 text-[15px] text-[#536471] dark:text-[#71767b]">
                Join DopTube to personalize your feed, save playlists, and publish videos.
              </p>

              {/* Circular Icon Quick Row matching screenshot + Google CTA */}
              <div className="mt-8 flex items-center justify-center gap-5">
                <button
                  type="button"
                  disabled={loading}
                  onClick={handleGoogleSignIn}
                  aria-label="Continue with Google"
                  className="w-14 h-14 rounded-full bg-white text-black border border-[#cfd9de] dark:border-transparent hover:opacity-90 flex items-center justify-center shadow-sm cursor-pointer disabled:opacity-60"
                >
                  <GoogleIcon />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setError('');
                    setStep('name');
                  }}
                  aria-label="Sign up with email"
                  className="w-14 h-14 rounded-full bg-[#eff3f4] dark:bg-[#16181c] border border-[#cfd9de] dark:border-[#2f3336] text-[#0f1419] dark:text-white hover:opacity-90 flex items-center justify-center cursor-pointer"
                >
                  <Mail className="w-5 h-5" />
                </button>
              </div>

              <button
                type="button"
                disabled={loading}
                onClick={handleGoogleSignIn}
                className="mt-5 w-full h-[50px] rounded-full bg-white text-black border border-[#cfd9de] hover:bg-neutral-100 font-bold text-[15px] flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-60"
              >
                <GoogleIcon />
                <span>{loading ? 'Connecting to Google...' : 'Continue with Google'}</span>
              </button>

              <div className="my-5 flex items-center gap-3">
                <span className="flex-1 h-px bg-[#e5e7eb] dark:bg-[#2f3336]" />
                <span className="text-xs font-medium text-[#536471] dark:text-[#71767b]">or</span>
                <span className="flex-1 h-px bg-[#e5e7eb] dark:bg-[#2f3336]" />
              </div>

              <button
                type="button"
                onClick={() => {
                  setError('');
                  setStep('name');
                }}
                className={primaryCtaClass(true)}
              >
                Create account
              </button>

              <p className="mt-4 text-xs text-[#536471] dark:text-[#71767b] leading-relaxed">
                By signing up, you agree to DopTube’s Terms of Service and Privacy Policy.
              </p>

              <div className="mt-8 pt-5 border-t border-[#e5e7eb] dark:border-[#2f3336]">
                <p className="text-[15px] font-bold mb-3">Already have an account?</p>
                <button
                  type="button"
                  onClick={() => {
                    setError('');
                    setStep('signin');
                  }}
                  className={outlinedPillClass}
                >
                  Sign in
                </button>
              </div>
            </div>
          )}

          {/* SIGN IN SCREEN */}
          {step === 'signin' && (
            <form onSubmit={handlePasswordLogin} className="mt-6 space-y-5">
              <div>
                <h1 className="text-[32px] sm:text-[36px] font-extrabold tracking-tight leading-tight">
                  Sign in to DopTube
                </h1>
              </div>

              <button
                type="button"
                disabled={loading}
                onClick={handleGoogleSignIn}
                className="w-full h-[48px] rounded-full bg-white text-black border border-[#cfd9de] hover:bg-neutral-100 font-bold text-[15px] flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-60"
              >
                <GoogleIcon />
                <span>{loading ? 'Connecting...' : 'Sign in with Google'}</span>
              </button>

              <div className="flex items-center gap-3">
                <span className="flex-1 h-px bg-[#e5e7eb] dark:bg-[#2f3336]" />
                <span className="text-xs font-medium text-[#536471] dark:text-[#71767b]">or</span>
                <span className="flex-1 h-px bg-[#e5e7eb] dark:bg-[#2f3336]" />
              </div>

              <div className="space-y-3.5">
                <input
                  type="text"
                  required
                  value={loginIdentifier}
                  onChange={(e) => setLoginIdentifier(e.target.value)}
                  placeholder="Email or @username"
                  aria-label="Email or username"
                  className="w-full h-[54px] px-4 rounded-xl bg-transparent border border-[#cfd9de] dark:border-[#2f3336] focus:border-[#0f1419] dark:focus:border-white text-[16px] placeholder:text-[#71767b] focus:outline-none"
                />
                <div className="relative">
                  <input
                    type={showLoginPassword ? 'text' : 'password'}
                    required
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="Password"
                    aria-label="Password"
                    className="w-full h-[54px] px-4 pr-12 rounded-xl bg-transparent border border-[#cfd9de] dark:border-[#2f3336] focus:border-[#0f1419] dark:focus:border-white text-[16px] placeholder:text-[#71767b] focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowLoginPassword((v) => !v)}
                    aria-label={showLoginPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-[#536471] dark:text-[#71767b] cursor-pointer"
                  >
                    {showLoginPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || !loginIdentifier.trim() || !loginPassword}
                className={primaryCtaClass(Boolean(loginIdentifier.trim() && loginPassword) && !loading)}
              >
                {loading ? 'Signing in...' : 'Sign in'}
              </button>

              <p className="text-sm text-[#536471] dark:text-[#71767b] pt-2">
                Don’t have an account?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setError('');
                    setStep('name');
                  }}
                  className="text-[#0f1419] dark:text-white font-semibold hover:underline cursor-pointer"
                >
                  Sign up
                </button>
              </p>
            </form>
          )}

          {/* STEP 2: WHAT'S YOUR NAME? */}
          {step === 'name' && (
            <div className="mt-7">
              <h1 className="text-[32px] sm:text-[36px] font-extrabold tracking-tight leading-tight">
                What&apos;s your name?
              </h1>
              <input
                type="text"
                autoFocus
                maxLength={60}
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && nameValid) {
                    e.preventDefault();
                    setStep('birthday');
                  }
                }}
                placeholder="John Smith"
                aria-label="What's your name?"
                className="mt-7 w-full bg-transparent text-[26px] sm:text-[28px] font-normal text-[#0f1419] dark:text-white placeholder:text-[#71767b] focus:outline-none caret-[#0f1419] dark:caret-white"
              />
            </div>
          )}

          {/* STEP 3: WHEN'S YOUR BIRTHDAY? + EMAIL */}
          {step === 'birthday' && (
            <div className="mt-7 space-y-6">
              <div>
                <h1 className="text-[32px] sm:text-[36px] font-extrabold tracking-tight leading-tight">
                  When&apos;s your birthday?
                </h1>
                <p className="mt-2 text-[15px] text-[#536471] dark:text-[#71767b]">
                  Your birthday won&apos;t be shown publicly
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-[#536471] dark:text-[#71767b] mb-1.5">
                    Date of birth
                  </label>
                  <input
                    type="date"
                    value={birthday}
                    onChange={(e) => setBirthday(e.target.value)}
                    aria-label="Date of birth"
                    className="w-full h-[54px] px-4 rounded-xl bg-transparent border border-[#cfd9de] dark:border-[#2f3336] focus:border-[#0f1419] dark:focus:border-white text-[16px] text-[#0f1419] dark:text-white focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-[#536471] dark:text-[#71767b] mb-1.5">
                    Email address
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    aria-label="Email address"
                    className="w-full h-[54px] px-4 rounded-xl bg-transparent border border-[#cfd9de] dark:border-[#2f3336] focus:border-[#0f1419] dark:focus:border-white text-[16px] placeholder:text-[#71767b] focus:outline-none"
                  />
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: CHOOSE A PASSWORD */}
          {step === 'password' && (
            <div className="mt-7 space-y-6">
              <div>
                <h1 className="text-[32px] sm:text-[36px] font-extrabold tracking-tight leading-tight">
                  Choose a password
                </h1>
                <p className="mt-2 text-[15px] text-[#536471] dark:text-[#71767b]">
                  Passwords should be hard to guess and at least 8 characters long.
                </p>
              </div>

              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoFocus
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && passwordValid) {
                      e.preventDefault();
                      setStep('username');
                    }
                  }}
                  placeholder="Password"
                  aria-label="Choose a password"
                  className="w-full h-[56px] px-4 pr-12 rounded-xl bg-transparent border border-[#cfd9de] dark:border-[#2f3336] focus:border-[#0f1419] dark:focus:border-white text-[17px] placeholder:text-[#71767b] focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1.5 text-[#536471] dark:text-[#71767b] cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              {password.length > 0 && !passwordValid && (
                <p className="text-xs text-red-500">Enter at least {8 - password.length} more characters.</p>
              )}
            </div>
          )}

          {/* STEP 5: GIVE YOURSELF A USERNAME */}
          {step === 'username' && (
            <div className="mt-7 space-y-5">
              <div>
                <h1 className="text-[32px] sm:text-[36px] font-extrabold tracking-tight leading-tight">
                  Give yourself a username
                </h1>
                <p className="mt-2 text-[15px] text-[#536471] dark:text-[#71767b]">
                  Your @username is unique. You can always change it later.
                </p>
              </div>

              <div>
                <div className="flex items-center h-[56px] px-4 rounded-xl border border-[#cfd9de] dark:border-[#2f3336] focus-within:border-[#0f1419] dark:focus-within:border-white">
                  <span className="text-[18px] font-semibold text-[#536471] dark:text-[#71767b] mr-1">@</span>
                  <input
                    type="text"
                    autoFocus
                    maxLength={24}
                    value={username}
                    onChange={(e) => setUsername(e.target.value.replace(/^@+/, '').replace(/[^a-zA-Z0-9_]/g, ''))}
                    placeholder="username"
                    aria-label="Username"
                    className="w-full bg-transparent text-[17px] text-[#0f1419] dark:text-white placeholder:text-[#71767b] focus:outline-none"
                  />
                  {checkingUsername ? (
                    <Loader2 className="w-4 h-4 animate-spin text-[#71767b]" />
                  ) : usernameAvailable === true ? (
                    <Check className="w-4 h-4 text-emerald-500" />
                  ) : null}
                </div>
                {usernameAvailable === false && (
                  <p className="mt-1.5 text-xs text-red-500">That username is already taken.</p>
                )}
              </div>

              {usernameSuggestions.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-[#536471] dark:text-[#71767b] mb-2">Suggestions</p>
                  <div className="flex flex-wrap gap-2">
                    {usernameSuggestions.map((sug) => (
                      <button
                        key={sug}
                        type="button"
                        onClick={() => setUsername(sug.replace(/^@/, ''))}
                        className="h-9 px-3.5 rounded-full border border-[#cfd9de] dark:border-[#2f3336] text-sm font-medium hover:bg-[#eff3f4] dark:hover:bg-[#16181c] cursor-pointer"
                      >
                        {sug}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 6: SET A PROFILE PICTURE */}
          {step === 'avatar' && (
            <div className="mt-7 flex flex-col">
              <h1 className="text-[32px] sm:text-[36px] font-extrabold tracking-tight leading-tight">
                Set a profile picture
              </h1>
              <p className="mt-2 text-[15px] text-[#536471] dark:text-[#71767b]">
                Have a favorite selfie? Upload it now.
              </p>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  try {
                    const dataUrl = await compressAvatarFile(file);
                    setAvatarDataUrl(dataUrl);
                    setError('');
                  } catch (err) {
                    setError(err instanceof Error ? err.message : 'Failed to load image.');
                  }
                }}
              />

              <div className="my-12 flex items-center justify-center">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  aria-label="Choose profile photo"
                  className="w-36 h-36 rounded-full flex items-center justify-center overflow-hidden cursor-pointer group"
                >
                  {avatarDataUrl ? (
                    <img src={avatarDataUrl} alt="Profile preview" className="w-full h-full object-cover rounded-full border-2 border-[#0f1419] dark:border-white" />
                  ) : (
                    <svg
                      viewBox="0 0 120 120"
                      fill="none"
                      aria-hidden="true"
                      className="w-36 h-36 text-[#0f1419] dark:text-[#e7e9ea] group-hover:opacity-80 transition-opacity"
                    >
                      <circle cx="60" cy="60" r="52" stroke="currentColor" strokeWidth="8" />
                      <circle cx="60" cy="43" r="15" stroke="currentColor" strokeWidth="8" />
                      <path
                        d="M31 94C36 77 47 70 60 70C73 70 84 77 89 94"
                        stroke="currentColor"
                        strokeWidth="8"
                        strokeLinecap="round"
                      />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* STEP 7: PICK YOUR INTERESTS */}
          {step === 'interests' && (
            <div className="mt-7 space-y-5">
              <div>
                <h1 className="text-[32px] sm:text-[36px] font-extrabold tracking-tight leading-tight flex items-center gap-2">
                  <span>Pick your interests</span>
                </h1>
                <p className="mt-2 text-[15px] text-[#536471] dark:text-[#71767b]">
                  {interestsValid
                    ? `${interests.length} topics selected for your DopTube feed.`
                    : `Select ${3 - interests.length} more topic${3 - interests.length === 1 ? '' : 's'} to continue`}
                </p>
              </div>

              <div className="flex flex-wrap gap-2.5 pt-2">
                {INTEREST_TOPICS.map((topic) => {
                  const selected = interests.includes(topic);
                  return (
                    <button
                      key={topic}
                      type="button"
                      onClick={() =>
                        setInterests((prev) =>
                          prev.includes(topic) ? prev.filter((item) => item !== topic) : [...prev, topic]
                        )
                      }
                      className={`h-10 px-4 rounded-full text-sm font-semibold border transition-colors flex items-center gap-1.5 cursor-pointer ${
                        selected
                          ? 'bg-[#0f1419] text-white border-[#0f1419] dark:bg-white dark:text-black dark:border-white'
                          : 'bg-transparent text-[#0f1419] dark:text-[#e7e9ea] border-[#cfd9de] dark:border-[#2f3336] hover:bg-[#eff3f4] dark:hover:bg-[#16181c]'
                      }`}
                    >
                      {selected && <Check className="w-3.5 h-3.5" />}
                      <span>{topic}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Bottom-Anchored Action Footer for Registration Steps */}
        {step !== 'landing' && step !== 'signin' && (
          <div className="pt-6 space-y-3">
            {step === 'name' && (
              <button
                type="button"
                disabled={!nameValid}
                onClick={() => setStep('birthday')}
                className={primaryCtaClass(nameValid)}
              >
                Continue
              </button>
            )}

            {step === 'birthday' && (
              <button
                type="button"
                disabled={!birthdayStepValid}
                onClick={() => setStep('password')}
                className={primaryCtaClass(birthdayStepValid)}
              >
                Continue
              </button>
            )}

            {step === 'password' && (
              <button
                type="button"
                disabled={!passwordValid}
                onClick={() => setStep('username')}
                className={primaryCtaClass(passwordValid)}
              >
                Continue
              </button>
            )}

            {step === 'username' && (
              <button
                type="button"
                disabled={!usernameStepValid}
                onClick={() => setStep('avatar')}
                className={primaryCtaClass(usernameStepValid)}
              >
                Continue
              </button>
            )}

            {step === 'avatar' && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setAvatarDataUrl('');
                    setStep('interests');
                  }}
                  className={outlinedPillClass}
                >
                  Skip
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (avatarDataUrl) {
                      setStep('interests');
                    } else {
                      fileInputRef.current?.click();
                    }
                  }}
                  className={primaryCtaClass(true)}
                >
                  {avatarDataUrl ? 'Continue' : 'Add profile photo'}
                </button>
              </>
            )}

            {step === 'interests' && (
              <button
                type="button"
                disabled={!interestsValid || loading}
                onClick={handleRegisterComplete}
                className={primaryCtaClass(interestsValid && !loading)}
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Creating account...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Continue</span>
                  </>
                )}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
