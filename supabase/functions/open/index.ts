// Clark Cup deep-link bouncer.
//
// Mail clients sanitise href values and drop unknown schemes, so a
// clarkcup:// link in an email arrives stripped: styled text with
// nothing to click. This is an ordinary https URL they keep, which then
// hands the browser over to the app.
//
// A redirect rather than a page on purpose. Supabase's gateway rewrites
// the content type of a GET body to text/plain with nosniff, so an HTML
// page served from here is displayed as source rather than rendered.
// A 302 carries no body and so has nothing to rewrite.

// An allowlist, not a parameter: without it this would be an open
// redirect that anyone could point anywhere.
const ROUTES: Record<string, string> = {
  home:            'clarkcup:///',
  'photo-contest': 'clarkcup:///photo-contest',
  leaderboard:     'clarkcup:///leaderboard',
  points:          'clarkcup:///my-points',
};

Deno.serve((req) => {
  const to = new URL(req.url).searchParams.get('to') ?? 'home';
  const target = ROUTES[to] ?? ROUTES.home;

  return new Response(null, {
    status: 302,
    headers: { 'Location': target, 'Cache-Control': 'no-store' },
  });
});
