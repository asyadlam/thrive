/*
  POST /api/delete-account — permanently deletes the CALLER's own Thrive account: their Supabase Auth user and
  their row in cloud_backups. The copy of their journal on their device is untouched.

  - Needs the caller's own login token (Authorization: Bearer <access token>); it's checked with Supabase first,
    and only the user it belongs to is ever deleted. No user id is ever taken from the request.
  - Uses the Supabase secret (service role) key, which is read ONLY here, on the server, from
    SUPABASE_SERVICE_ROLE_KEY. It is never sent to the browser and never logged.
  - Only my own app may call this (same Origin check as the other endpoints).

  Environment variables (Vercel → Settings → Environment Variables):
    SUPABASE_SERVICE_ROLE_KEY   server-only secret key (never a VITE_ variable)
    VITE_SUPABASE_URL           the project URL (already set for the app; read here too)
    ALLOWED_ORIGINS             optional extra sites allowed to call this, comma-separated
*/

const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env;

type ErrorCode = 'method_not_allowed' | 'forbidden_origin' | 'not_logged_in' | 'not_configured' | 'delete_failed';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}
const fail = (error: ErrorCode, status: number) => json({ error }, status);

/** Host part of a URL or bare host ("https://a.b/x" → "a.b"), or '' if it isn't one. */
function hostOf(value: string | null | undefined): string {
  if (!value) return '';
  try {
    return new URL(value.includes('://') ? value : `https://${value}`).host.toLowerCase();
  } catch {
    return '';
  }
}

/** Only my own app may call this: the page's Origin (or Referer) must be this site or one of my Vercel domains. */
function isFromMyApp(request: Request): boolean {
  const from = hostOf(request.headers.get('origin')) || hostOf(request.headers.get('referer'));
  if (!from) return false;
  const allowed = new Set(
    [
      request.headers.get('host'),
      env.VERCEL_PROJECT_PRODUCTION_URL,
      env.VERCEL_BRANCH_URL,
      env.VERCEL_URL,
      ...(env.ALLOWED_ORIGINS || '').split(','),
    ]
      .map((v) => hostOf(v?.trim()))
      .filter(Boolean),
  );
  return allowed.has(from);
}

export async function POST(request: Request): Promise<Response> {
  if (!isFromMyApp(request)) return fail('forbidden_origin', 403);

  const base = (env.SUPABASE_URL || env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
  const secret = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !secret) return fail('not_configured', 503);

  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return fail('not_logged_in', 401);

  const admin = { apikey: secret, Authorization: `Bearer ${secret}` };

  try {
    // 1. Who is calling? Supabase checks the token; we only ever act on the user it belongs to.
    const who = await fetch(`${base}/auth/v1/user`, { headers: { apikey: secret, Authorization: `Bearer ${token}` } });
    if (!who.ok) return fail('not_logged_in', 401);
    const user = (await who.json()) as { id?: string };
    if (!user.id || !/^[0-9a-f-]{36}$/i.test(user.id)) return fail('not_logged_in', 401);

    // 2. Delete the Auth user. If this fails, nothing has been changed yet.
    const gone = await fetch(`${base}/auth/v1/admin/users/${user.id}`, { method: 'DELETE', headers: admin });
    if (!gone.ok && gone.status !== 404) {
      console.error('delete-account: auth delete failed with status', gone.status); // status only, never ids or keys
      return fail('delete_failed', 502);
    }

    // 3. The cloud backup row goes with the user (ON DELETE CASCADE); delete it explicitly too, to be sure.
    const row = await fetch(`${base}/rest/v1/cloud_backups?user_id=eq.${user.id}`, {
      method: 'DELETE',
      headers: { ...admin, Prefer: 'return=minimal' },
    });
    if (!row.ok) console.error('delete-account: backup row delete returned status', row.status);

    return json({ ok: true });
  } catch {
    console.error('delete-account: could not reach Supabase');
    return fail('delete_failed', 502);
  }
}

export function GET(): Response {
  return fail('method_not_allowed', 405);
}
