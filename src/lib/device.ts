/*
  This device, for the "Last backup … · from this device" line: a random id made once and kept here, and a short
  label from the platform only ("Safari on iPhone", "Chrome on Mac") — nothing personal. Both ride along in each
  backup's metadata; neither is ever restored or merged onto another device.
*/

const ID_KEY = 'thrive.deviceId';
let cached: string | null = null;

export function deviceId(): string {
  if (cached) return cached;
  try {
    const saved = localStorage.getItem(ID_KEY);
    if (saved) return (cached = saved);
    const fresh = `device-${crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`;
    localStorage.setItem(ID_KEY, fresh);
    return (cached = fresh);
  } catch {
    return (cached = 'device-unknown');
  }
}

/** "Safari on iPhone", "Chrome on Mac", "Firefox on Windows"… (platform and browser only). */
export function deviceLabel(): string {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  const platform = /iPhone/.test(ua)
    ? 'iPhone'
    : /iPad/.test(ua) || (/Macintosh/.test(ua) && typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1)
      ? 'iPad'
      : /Android/.test(ua)
        ? 'Android'
        : /Macintosh|Mac OS X/.test(ua)
          ? 'Mac'
          : /Windows/.test(ua)
            ? 'Windows'
            : /CrOS/.test(ua)
              ? 'Chromebook'
              : /Linux/.test(ua)
                ? 'Linux'
                : 'a device';
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Firefox\/|FxiOS/.test(ua)
      ? 'Firefox'
      : /Chrome\/|CriOS/.test(ua)
        ? 'Chrome'
        : /Safari\//.test(ua)
          ? 'Safari'
          : '';
  const standalone =
    typeof window !== 'undefined' &&
    (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);
  if (standalone) return `Thrive app on ${platform}`;
  return browser ? `${browser} on ${platform}` : platform;
}

/** What each backup says about where it was made. */
export type BackupMeta = { madeAt: string; deviceId: string; deviceLabel: string };

export const backupMeta = (): BackupMeta => ({ madeAt: new Date().toISOString(), deviceId: deviceId(), deviceLabel: deviceLabel() });

export function readBackupMeta(v: unknown): BackupMeta | null {
  const m = (v ?? null) as Partial<BackupMeta> | null;
  return m && typeof m.deviceId === 'string' && typeof m.madeAt === 'string'
    ? { madeAt: m.madeAt, deviceId: m.deviceId.slice(0, 80), deviceLabel: typeof m.deviceLabel === 'string' ? m.deviceLabel.slice(0, 60) : '' }
    : null;
}
