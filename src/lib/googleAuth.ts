/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User } from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

export const provider = new GoogleAuthProvider();
provider.addScope('https://www.googleapis.com/auth/spreadsheets');
provider.addScope('https://www.googleapis.com/auth/drive.file');

let isSigningIn = false;
let cachedAccessToken: string | null = null;

const ACCESS_TOKEN_KEY = 'gudang_google_oauth_token';
const TOKEN_EXPIRY_KEY = 'gudang_google_oauth_token_expiry';

export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      const token = await getAccessToken();
      if (token) {
        if (onAuthSuccess) onAuthSuccess(user, token);
      } else if (!isSigningIn) {
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      localStorage.removeItem(ACCESS_TOKEN_KEY);
      localStorage.removeItem(TOKEN_EXPIRY_KEY);
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to get access token from Firebase Auth');
    }

    cachedAccessToken = credential.accessToken;
    localStorage.setItem(ACCESS_TOKEN_KEY, credential.accessToken);
    // Extended to 3 hours based on user's instruction (3 hours = 180 minutes)
    const expiryTime = Date.now() + 3 * 60 * 60 * 1000;
    localStorage.setItem(TOKEN_EXPIRY_KEY, expiryTime.toString());

    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.warn('Sign in error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  if (cachedAccessToken) {
    return cachedAccessToken;
  }

  const savedToken = localStorage.getItem(ACCESS_TOKEN_KEY);
  const savedExpiry = localStorage.getItem(TOKEN_EXPIRY_KEY);

  if (savedToken && savedExpiry) {
    const expiry = parseInt(savedExpiry, 10);
    if (Date.now() < expiry) {
      cachedAccessToken = savedToken;
      return savedToken;
    }
  }

  // Token expired or missing
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(TOKEN_EXPIRY_KEY);
  cachedAccessToken = null;

  // Fallback to Apps Script bypass if configured
  const appsScriptUrl = localStorage.getItem('gudang_apps_script_url');
  if (appsScriptUrl) {
    return 'apps-script-bypass';
  }

  return null;
};

export const setAccessToken = (token: string | null) => {
  cachedAccessToken = token;
  if (token) {
    localStorage.setItem(ACCESS_TOKEN_KEY, token);
    localStorage.setItem(TOKEN_EXPIRY_KEY, (Date.now() + 3 * 60 * 60 * 1000).toString());
  } else {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(TOKEN_EXPIRY_KEY);
  }
};

export const extendGoogleTokenExpiry = () => {
  const token = localStorage.getItem(ACCESS_TOKEN_KEY);
  if (token) {
    const newExpiry = Date.now() + 3 * 60 * 60 * 1000;
    localStorage.setItem(TOKEN_EXPIRY_KEY, newExpiry.toString());
  }
};

export const logoutGoogle = async () => {
  await auth.signOut();
  cachedAccessToken = null;
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(TOKEN_EXPIRY_KEY);
};
