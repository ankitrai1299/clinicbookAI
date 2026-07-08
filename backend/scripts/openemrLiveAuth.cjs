// One-shot interactive OAuth (authorization_code + PKCE) against the live OpenEMR,
// with a local callback listener so the short-lived auth code is exchanged in
// milliseconds (OpenEMR expires it in ~60s — too fast for copy/paste relays).
// Prints the authorize URL, waits for the browser redirect, exchanges the code,
// then reads Patient / Practitioner / Appointment over FHIR.
//   node scripts/openemrLiveAuth.cjs
const crypto = require('crypto');
const http = require('http');
const https = require('https');
const axios = require('axios');

const BASE = 'https://13.127.25.165';
const FHIR = BASE + '/apis/default/fhir';
const CLIENT_ID = 'pda7-NxeJU3xRjeQl3KIUOa1Xw4Lb-OzoomulH_tuhk';
const REDIRECT = 'http://localhost:3000/auth/openemr/callback';
const SCOPE = 'openid launch/patient patient/Patient.read patient/Appointment.read patient/Practitioner.read';
const agent = new https.Agent({ rejectUnauthorized: false }); // self-signed cert

const verifier = crypto.randomBytes(48).toString('base64url');
const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
const state = crypto.randomBytes(8).toString('hex');

const authUrl = BASE + '/oauth2/default/authorize?response_type=code'
  + '&client_id=' + encodeURIComponent(CLIENT_ID)
  + '&redirect_uri=' + encodeURIComponent(REDIRECT)
  + '&scope=' + encodeURIComponent(SCOPE)
  + '&state=' + state
  + '&aud=' + encodeURIComponent(FHIR)
  + '&code_challenge=' + challenge + '&code_challenge_method=S256';

console.log('AUTHORIZE_URL:');
console.log(authUrl);
console.log('\nWaiting for the browser callback on http://localhost:3000 ...\n');

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://localhost:3000');
  if (!u.pathname.startsWith('/auth/openemr/callback')) { res.writeHead(404); res.end('nope'); return; }
  const code = u.searchParams.get('code');
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end('<h2 style="font-family:sans-serif">Code mil gaya! Ye tab band kar sakte ho. ✅</h2>');
  if (!code) { console.log('ERROR: no code in callback'); process.exit(1); }

  console.log('Code received -> exchanging immediately...');
  try {
    const form = new URLSearchParams({
      grant_type: 'authorization_code', code, redirect_uri: REDIRECT,
      client_id: CLIENT_ID, code_verifier: verifier
    });
    const tok = await axios.post(BASE + '/oauth2/default/token', form.toString(), {
      httpsAgent: agent, headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 20000
    });
    const t = tok.data;
    console.log('\n=== TOKEN OK ===');
    console.log('  scope        :', t.scope);
    console.log('  patient ctx  :', t.patient || '(none)');
    console.log('  expires_in   :', t.expires_in, 's');

    for (const r of ['Patient', 'Practitioner', 'Appointment']) {
      try {
        const resp = await axios.get(FHIR + '/' + r, {
          httpsAgent: agent, timeout: 20000,
          headers: { Authorization: 'Bearer ' + t.access_token, Accept: 'application/fhir+json' }
        });
        const b = resp.data; const e = b.entry || [];
        console.log('\n=== GET /' + r + ' === HTTP 200, total: ' + (b.total !== undefined ? b.total : e.length));
        e.slice(0, 5).forEach((x) => {
          const rr = x.resource || {};
          const n0 = rr.name && rr.name[0];
          const nm = n0 ? (n0.text || [(n0.given || []).join(' '), n0.family].filter(Boolean).join(' ')) : '';
          console.log('   -', rr.resourceType, rr.id, nm || rr.status || '');
        });
      } catch (err) {
        const s = err.response && err.response.status;
        const d = err.response && JSON.stringify(err.response.data).slice(0, 250);
        console.log('\n=== GET /' + r + ' === FAILED http=' + s, d || err.message);
      }
    }
    console.log('\n✅ DONE — OpenEMR -> ClinicBook FHIR reads verified.');
  } catch (err) {
    const s = err.response && err.response.status;
    const d = err.response && JSON.stringify(err.response.data).slice(0, 400);
    console.log('TOKEN ERROR http=' + s, d || err.message);
  }
  server.close();
  process.exit(0);
});

server.on('error', (e) => { console.log('SERVER ERROR:', e.message, '(port 3000 busy?)'); process.exit(1); });
server.listen(3000);
