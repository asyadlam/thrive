import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ConfirmDialog from './ConfirmDialog';
import { cloudAvailable, cloudBackupInfo, getSession, onSessionChange } from '../lib/cloud';
import { formatLongDay, formatTime, listAllEntries, todayKey } from '../lib/journal';

/** Remembered on this device once the person chooses either button: the prompt never shows here again. */
const DONE_KEY = 'thrive.newDevicePromptDone';

const seen = () => {
  try {
    return localStorage.getItem(DONE_KEY) === '1';
  } catch {
    return true; // can't remember a choice: better never to show it than to show it every time
  }
};
const markSeen = () => {
  try {
    localStorage.setItem(DONE_KEY, '1');
  } catch {
    /* nothing to remember */
  }
};

/**
 * "New device" prompt: shown once per device, only when someone is logged in, this device has no journal entries
 * yet, and their account has a cloud backup. "Restore my backup" runs the usual Restore from cloud (with its
 * confirm); "Not now" just closes it. Either way it never shows again on this device.
 */
export default function NewDevicePrompt() {
  const navigate = useNavigate();
  const [backupAt, setBackupAt] = useState<string | null>(null);

  useEffect(() => {
    if (!cloudAvailable() || seen()) return;
    let active = true;
    const check = async () => {
      try {
        if (seen() || !(await getSession())) return;
        if ((await listAllEntries()).length > 0) return; // this device already has its Thrive
        const info = await cloudBackupInfo();
        if (active && info && !seen()) setBackupAt(info.updatedAt);
      } catch {
        /* quiet: the Restore from cloud button in Settings is always there */
      }
    };
    void check();
    const stop = onSessionChange((s) => (s ? void check() : setBackupAt(null)));
    return () => {
      active = false;
      stop();
    };
  }, []);

  if (!backupAt) return null;

  const when = `${formatLongDay(todayKey(new Date(backupAt)))} at ${formatTime(backupAt)}`;
  return (
    <ConfirmDialog
      title="Welcome back"
      message={`This device doesn't have your Thrive on it yet. Your cloud backup from ${when} is ready.`}
      confirmLabel="Restore my backup"
      cancelLabel="Not now"
      tone="gentle"
      onConfirm={() => {
        markSeen();
        setBackupAt(null);
        navigate('/settings?restore=cloud'); // the usual Restore from cloud, with its confirm
      }}
      onCancel={() => {
        markSeen();
        setBackupAt(null);
      }}
    />
  );
}
