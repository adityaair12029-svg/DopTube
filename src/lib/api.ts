export async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: 'include',
    headers: {
      'X-Requested-With': 'DopTube',
      ...(options?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(options?.headers ?? {}),
    },
    ...options,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
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
