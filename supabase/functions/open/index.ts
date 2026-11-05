// Clark Cup deep-link bouncer.
//
// Mail clients sanitise href values and drop unknown schemes, so a
// clarkcup:// link in an email arrives stripped: styled text with
// nothing to click. This is an ordinary https URL they will keep, which
// then hands the browser over to the app.
//
// Falls back to the App Store listing for anyone without the app, and
// for a desktop browser where the scheme means nothing.

const APP_STORE = 'https://apps.apple.com/app/id6767001561';

// An allowlist, not a parameter: without it this would be an open
// redirect that anyone could point anywhere.
const ROUTES: Record<string, string> = {
  home:          'clarkcup:///',
  'photo-contest': 'clarkcup:///photo-contest',
  leaderboard:   'clarkcup:///leaderboard',
  points:        'clarkcup:///my-points',
};

Deno.serve((req) => {
  const to = new URL(req.url).searchParams.get('to') ?? 'home';
  const target = ROUTES[to] ?? ROUTES.home;

  const html = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Opening Clark Cup...</title>
<style>
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
         background:#f4efe7; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;
         color:#1c1a16; text-align:center; padding:24px; }
  .card { max-width:340px; }
  h1 { font-size:20px; margin:0 0 8px; }
  p { color:#6b645c; font-size:15px; line-height:1.5; margin:0 0 22px; }
  a { display:inline-block; background:#3a6b4a; color:#fff; text-decoration:none;
      font-size:15px; font-weight:600; padding:13px 24px; border-radius:999px; }
</style>
</head><body>
<div class="card">
  <h1>Opening Clark Cup</h1>
  <p>If nothing happens, the app may not be installed on this device.</p>
  <a href="${APP_STORE}">Get the app</a>
</div>
<script>
  // Hand over immediately; the fallback above is what remains if the
  // handover does not take.
  location.replace(${JSON.stringify(target)});
</script>
</body></html>`;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
});
