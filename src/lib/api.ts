export const AUTH_TOKEN_STORAGE_KEY = 'doptube_auth_token';

export function getAuthToken(): string {
  try {
    return window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

export function setAuthToken(token?: string | null) {
  if (!token) return;
  try {
    window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
  } catch {
    // ignore storage errors
  }
}

export function clearAuthToken() {
  try {
    window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
  } catch {
    // ignore storage errors
  }
}

export async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const token = getAuthToken();
  const res = await fetch(url, {
    credentials: 'include',
    headers: {
      'X-Requested-With': 'DopTube',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(options?.headers ?? {}),
    },
    ...options,
  });

  const text = await res.text();
  let data: unknown = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      if (!res.ok) {
        throw new Error(`Server returned non-JSON response (${res.status})`);
      }
      throw new Error('Unexpected non-JSON response from DopTube server.');
    }
  }

  if (!res.ok) {
    const errMsg =
      typeof data === 'object' && data !== null && 'error' in data
        ? String((data as { error?: string }).error || '')
        : '';
    throw new Error(errMsg || `Request failed (${res.status})`);
  }
  return data as T;
}

export function uploadWithProgress(
  url: string,
  formData: FormData,
  onProgress: (percent: number) => void
): Promise<{ videoId: string; status: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url, true);
    xhr.withCredentials = true;
    xhr.setRequestHeader('X-Requested-With', 'DopTube');
    const token = getAuthToken();
    if (token) {
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    }

    xhr.upload.onprogress = (evt) => {
      if (evt.lengthComputable) {
        onProgress(Math.round((evt.loaded / evt.total) * 100));
      }
    };

    xhr.onload = () => {
      try {
        const parsed = JSON.parse(xhr.responseText || '{}') as { videoId?: string; status?: string; error?: string };
        if (xhr.status >= 200 && xhr.status < 300 && parsed.videoId) {
          resolve({ videoId: parsed.videoId, status: parsed.status ?? 'processing' });
        } else {
          reject(new Error(parsed.error || `Upload failed (${xhr.status})`));
        }
      } catch {
        reject(new Error('Unexpected server response during upload.'));
      }
    };

    xhr.onerror = () => reject(new Error('Network error while uploading video.'));
    xhr.send(formData);
  });
}
