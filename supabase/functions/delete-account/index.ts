// Permanently delete the calling user's account and personal data.
//
// Required by App Store Review Guideline 5.1.1(v): an app that lets people
// create an account must let them delete it from inside the app, along with
// their data. Signing out is explicitly not enough.
//
// This has to live server-side because removing a row from auth.users needs
// the service role key, which must never ship inside the app. The caller is
// identified from their own JWT, so a user can only ever delete themselves.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req) => {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return Response.json({ error: 'Not signed in' }, { status: 401 });

  const url = Deno.env.get('SUPABASE_URL')!;

  // Resolve who is calling from their token — never from the request body,
  // so nobody can ask us to delete someone else.
  const asUser = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: userErr } = await asUser.auth.getUser();
  if (userErr || !user) return Response.json({ error: 'Not signed in' }, { status: 401 });

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // Their profile row. point_submissions cascades from it, and upcoming_events
  // they created fall back to NULL rather than disappearing for everyone else.
  const { data: profile } = await admin
    .from('profiles')
    .select('id, avatar_url')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  if (profile) {
    // Remove their uploaded avatar from storage, if any.
    if (profile.avatar_url) {
      const marker = '/storage/v1/object/public/photos/';
      const idx = profile.avatar_url.indexOf(marker);
      if (idx !== -1) {
        const path = profile.avatar_url.slice(idx + marker.length).split('?')[0];
        await admin.storage.from('photos').remove([path]);
      }
    }

    const { error: delErr } = await admin.from('profiles').delete().eq('id', profile.id);
    if (delErr) return Response.json({ error: delErr.message }, { status: 500 });
  }

  // Finally the login itself. Do this last: if it failed after the profile was
  // already gone, the user could at least still sign in and retry.
  const { error: authErr } = await admin.auth.admin.deleteUser(user.id);
  if (authErr) return Response.json({ error: authErr.message }, { status: 500 });

  return Response.json({ deleted: true });
});
