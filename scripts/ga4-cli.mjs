import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import path from 'node:path';

const root = process.cwd();
const args = process.argv.slice(2);
const command = args[0] || 'validate';
const ADMIN_BASE = 'https://analyticsadmin.googleapis.com/v1beta';
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const DEFAULT_CLIENT_PATH = path.join(root, 'ga4-oauth-client.json');
const DEFAULT_TOKEN_PATH = path.join(root, '.ga4-token.json');
const USER_DATA_ACKNOWLEDGEMENT =
  'I acknowledge that I have the necessary privacy disclosures and rights from my end users for the collection and processing of their data, including the association of such data with the visitation information Google Analytics collects from my site and/or app property.';

const KEY_EVENTS = [
  'purchase',
  'sign_up',
  'begin_checkout',
  'qna_submit',
  'contact_click'
];

const CUSTOM_DIMENSIONS = [
  ['App Environment', 'app_env'],
  ['Traffic Source', 'traffic_source'],
  ['Analysis Mode', 'analysis_mode'],
  ['Humanize Mode', 'humanize_mode'],
  ['Checkout Type', 'checkout_type'],
  ['Pricing Tab', 'pricing_tab']
];

function arg(name, fallback = '') {
  const prefix = `--${name}=`;
  const found = args.find((item) => item.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function hasFlag(name) {
  return args.includes(`--${name}`);
}

async function read(relPath) {
  return readFile(path.join(root, relPath), 'utf8');
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

async function writeJson(filePath, data) {
  await writeFile(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function clientPath() {
  return path.resolve(arg('client', process.env.GA4_OAUTH_CLIENT || process.env.GOOGLE_OAUTH_CLIENT || DEFAULT_CLIENT_PATH));
}

function tokenPath() {
  return path.resolve(arg('token', process.env.GA4_TOKEN_FILE || DEFAULT_TOKEN_PATH));
}

function propertyName(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return raw.startsWith('properties/') ? raw : `properties/${raw}`;
}

async function measurementId() {
  if (process.env.GA_MEASUREMENT_ID) return process.env.GA_MEASUREMENT_ID;
  const config = await read('assets/js/config.js');
  const match = config.match(/GA_MEASUREMENT_ID:\s*runtime\.GA_MEASUREMENT_ID\s*\|\|\s*'([^']+)'/);
  return match ? match[1] : '';
}

async function loadClient() {
  const file = clientPath();
  if (!existsSync(file)) {
    throw new Error(`OAuth client JSON not found: ${file}\nPlace your Google Cloud Desktop app OAuth JSON there, or pass --client=path.`);
  }
  const raw = await readJson(file);
  const client = raw.installed || raw.web || raw;
  if (!client.client_id || !client.client_secret) {
    throw new Error('OAuth client JSON must include client_id and client_secret.');
  }
  return {
    clientId: client.client_id,
    clientSecret: client.client_secret
  };
}

function openBrowser(url) {
  const platform = process.platform;
  const cmd = platform === 'win32' ? 'cmd' : platform === 'darwin' ? 'open' : 'xdg-open';
  const cmdArgs = platform === 'win32' ? ['/c', 'start', '', url] : [url];
  try {
    spawn(cmd, cmdArgs, { detached: true, stdio: 'ignore' }).unref();
    return true;
  } catch {
    return false;
  }
}

async function exchangeToken(client, code, redirectUri) {
  const body = new URLSearchParams({
    client_id: client.clientId,
    client_secret: client.clientSecret,
    code,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code'
  });
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`OAuth token exchange failed (${res.status}): ${JSON.stringify(data)}`);
  data.expiry_date = Date.now() + (Number(data.expires_in || 3600) * 1000) - 60000;
  return data;
}

async function refreshToken(client, token) {
  if (!token.refresh_token) throw new Error('Token has no refresh_token. Run npm run ga4:auth again.');
  const body = new URLSearchParams({
    client_id: client.clientId,
    client_secret: client.clientSecret,
    refresh_token: token.refresh_token,
    grant_type: 'refresh_token'
  });
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`OAuth token refresh failed (${res.status}): ${JSON.stringify(data)}`);
  const next = {
    ...token,
    ...data,
    refresh_token: data.refresh_token || token.refresh_token,
    expiry_date: Date.now() + (Number(data.expires_in || 3600) * 1000) - 60000
  };
  await writeJson(tokenPath(), next);
  return next;
}

async function auth() {
  const client = await loadClient();
  const state = randomBytes(16).toString('hex');
  const scopes = [
    'https://www.googleapis.com/auth/analytics.readonly',
    'https://www.googleapis.com/auth/analytics.edit'
  ].join(' ');

  const server = createServer();
  const codePromise = new Promise((resolve, reject) => {
    server.on('request', (req, res) => {
      const requestUrl = new URL(req.url || '/', 'http://127.0.0.1');
      if (requestUrl.pathname !== '/oauth2callback') {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      if (requestUrl.searchParams.get('state') !== state) {
        res.writeHead(400);
        res.end('Invalid state. You can close this tab.');
        reject(new Error('OAuth state mismatch.'));
        return;
      }
      const code = requestUrl.searchParams.get('code');
      const error = requestUrl.searchParams.get('error');
      if (error || !code) {
        res.writeHead(400);
        res.end('OAuth failed. You can close this tab.');
        reject(new Error(error || 'Missing OAuth code.'));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h1>Google Analytics CLI login complete</h1><p>You can close this tab and return to the terminal.</p>');
      resolve(code);
    });
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const redirectUri = `http://127.0.0.1:${port}/oauth2callback`;
  const url = new URL(AUTH_URL);
  url.searchParams.set('client_id', client.clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', scopes);
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  url.searchParams.set('state', state);

  console.log('Opening Google OAuth login...');
  if (!openBrowser(url.toString())) {
    console.log('Open this URL in your browser:');
    console.log(url.toString());
  }

  try {
    const code = await codePromise;
    const previous = existsSync(tokenPath()) ? await readJson(tokenPath()) : {};
    const token = await exchangeToken(client, code, redirectUri);
    await writeJson(tokenPath(), {
      ...token,
      refresh_token: token.refresh_token || previous.refresh_token
    });
    console.log(`OAuth token saved: ${tokenPath()}`);
  } finally {
    server.close();
  }
}

async function accessToken() {
  const client = await loadClient();
  const file = tokenPath();
  if (!existsSync(file)) throw new Error(`OAuth token not found: ${file}\nRun npm run ga4:auth first.`);
  const token = await readJson(file);
  if (!token.access_token || Number(token.expiry_date || 0) <= Date.now()) {
    return (await refreshToken(client, token)).access_token;
  }
  return token.access_token;
}

async function adminRequest(method, apiPath, body) {
  const token = await accessToken();
  const res = await fetch(`${ADMIN_BASE}/${apiPath.replace(/^\/+/, '')}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const message = data.error?.message || text || res.statusText;
    throw new Error(`${method} ${apiPath} failed (${res.status}): ${message}`);
  }
  return data;
}

async function listAll(apiPath, collectionKey) {
  const out = [];
  let pageToken = '';
  do {
    const url = new URL(`${ADMIN_BASE}/${apiPath.replace(/^\/+/, '')}`);
    if (!url.searchParams.has('pageSize')) url.searchParams.set('pageSize', '200');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const relative = url.toString().slice(`${ADMIN_BASE}/`.length);
    const data = await adminRequest('GET', relative);
    out.push(...(data[collectionKey] || []));
    pageToken = data.nextPageToken || '';
  } while (pageToken);
  return out;
}

async function listAccountSummaries() {
  return listAll('accountSummaries', 'accountSummaries');
}

async function listStreams(property) {
  return listAll(`${property}/dataStreams`, 'dataStreams');
}

async function findStreamByMeasurementId(id) {
  const summaries = await listAccountSummaries();
  for (const account of summaries) {
    for (const prop of account.propertySummaries || []) {
      const streams = await listStreams(prop.property);
      const match = streams.find((stream) => stream.webStreamData?.measurementId === id);
      if (match) return { account, property: prop, stream: match };
    }
  }
  return null;
}

async function resolvePropertyAndStream() {
  const explicitProperty = propertyName(arg('property'));
  const explicitStream = arg('stream');
  const id = arg('measurement-id', await measurementId());
  if (explicitProperty) {
    return {
      property: { property: explicitProperty, displayName: explicitProperty },
      stream: explicitStream ? { name: explicitStream } : null
    };
  }
  const found = await findStreamByMeasurementId(id);
  if (!found) throw new Error(`Could not find a GA4 web stream for measurement ID ${id}. Check OAuth account permissions.`);
  return found;
}

async function list() {
  const summaries = await listAccountSummaries();
  const lines = [];
  for (const account of summaries) {
    lines.push(`${account.account} ${account.displayName || ''}`.trim());
    for (const prop of account.propertySummaries || []) {
      lines.push(`  ${prop.property} ${prop.displayName || ''}`.trimEnd());
      const streams = await listStreams(prop.property).catch((error) => {
        lines.push(`    streams unavailable: ${error.message}`);
        return [];
      });
      for (const stream of streams) {
        const web = stream.webStreamData || {};
        lines.push(`    ${stream.name} ${stream.displayName || ''} ${web.measurementId || ''} ${web.defaultUri || ''}`.trimEnd());
      }
    }
  }
  console.log(lines.join('\n') || 'No GA4 accounts found for this OAuth user.');
}

async function setup() {
  const { property } = await resolvePropertyAndStream();
  const parent = property.property || property.name;
  console.log(`Using property: ${parent}`);

  if (!hasFlag('skip-key-events')) {
    const existing = await listAll(`${parent}/keyEvents`, 'keyEvents').catch(() => []);
    const existingNames = new Set(existing.map((item) => item.eventName));
    for (const eventName of KEY_EVENTS) {
      if (existingNames.has(eventName)) {
        console.log(`key event exists: ${eventName}`);
        continue;
      }
      try {
        await adminRequest('POST', `${parent}/keyEvents`, {
          eventName,
          countingMethod: 'ONCE_PER_EVENT'
        });
        console.log(`key event created: ${eventName}`);
      } catch (error) {
        console.log(`key event skipped: ${eventName} (${error.message})`);
      }
    }
  }

  if (!hasFlag('skip-dimensions')) {
    const existing = await listAll(`${parent}/customDimensions`, 'customDimensions').catch(() => []);
    const existingParams = new Set(existing.map((item) => item.parameterName));
    for (const [displayName, parameterName] of CUSTOM_DIMENSIONS) {
      if (existingParams.has(parameterName)) {
        console.log(`custom dimension exists: ${parameterName}`);
        continue;
      }
      try {
        await adminRequest('POST', `${parent}/customDimensions`, {
          displayName,
          parameterName,
          scope: 'EVENT',
          description: 'Created by the GA4 CLI for gpkorea.ai.kr event reporting.'
        });
        console.log(`custom dimension created: ${parameterName}`);
      } catch (error) {
        console.log(`custom dimension skipped: ${parameterName} (${error.message})`);
      }
    }
  }
}

async function acknowledgeUserDataCollection(property) {
  if (!hasFlag('yes')) {
    throw new Error('Refusing to acknowledge user data collection without --yes. Confirm privacy disclosures first.');
  }
  await adminRequest('POST', `${property}:acknowledgeUserDataCollection`, {
    acknowledgement: USER_DATA_ACKNOWLEDGEMENT
  });
  console.log(`User data collection acknowledged for ${property}`);
}

async function mpSecret() {
  const resolved = await resolvePropertyAndStream();
  const parent = resolved.stream?.name;
  const property = resolved.property.property || resolved.property.name;
  if (!parent) {
    throw new Error('A data stream is required. Pass --stream=properties/123/dataStreams/456 or use --measurement-id=G-...');
  }
  if (hasFlag('acknowledge-user-data')) await acknowledgeUserDataCollection(property);

  const displayName = arg('name', 'Codex CLI Measurement Protocol');
  const created = await adminRequest('POST', `${parent}/measurementProtocolSecrets`, { displayName });
  console.log(`Measurement Protocol secret created: ${created.name}`);
  console.log(`GA4_API_SECRET=${created.secretValue}`);
}

async function validate() {
  const id = await measurementId();
  const config = await read('assets/js/config.js');
  const index = await read('index.html');
  const tracking = await read('assets/js/head-tracking.js');
  const errors = [];

  if (!/^G-[A-Z0-9]+$/.test(id)) errors.push(`Invalid GA measurement ID: ${id || '(empty)'}`);
  if (!config.includes("runtime.GA_MEASUREMENT_ID || '" + id + "'")) errors.push('config.js does not expose the GA runtime override.');
  if (!index.includes('/assets/js/head-tracking.js')) errors.push('index.html does not load /assets/js/head-tracking.js.');
  if (!tracking.includes('send_page_view: false')) errors.push('head-tracking.js should disable automatic page_view for SPA routing.');
  if (!tracking.includes('gpTrackPageView')) errors.push('head-tracking.js is missing gpTrackPageView().');
  if (!tracking.includes('gpTrack')) errors.push('head-tracking.js is missing gpTrack().');

  if (errors.length) {
    console.error('GA4 validation failed:');
    errors.forEach((item) => console.error(`- ${item}`));
    process.exit(1);
  }

  console.log(`GA4 validation passed: ${id}`);
}

async function sendTest() {
  const id = arg('measurement-id', await measurementId());
  const apiSecret = arg('api-secret', process.env.GA4_API_SECRET || '');
  const collect = hasFlag('collect');
  if (!/^G-[A-Z0-9]+$/.test(id)) throw new Error(`Invalid GA measurement ID: ${id || '(empty)'}`);
  if (!apiSecret) {
    throw new Error('GA4_API_SECRET is required for Measurement Protocol tests. Create it with npm run ga4:mp-secret or in GA4 Admin > Data Streams > Measurement Protocol API secrets.');
  }

  const endpoint = collect ? 'mp/collect' : 'debug/mp/collect';
  const url = new URL(`https://www.google-analytics.com/${endpoint}`);
  url.searchParams.set('measurement_id', id);
  url.searchParams.set('api_secret', apiSecret);

  const body = {
    client_id: `cli.${Date.now()}`,
    events: [{
      name: 'cli_ga4_test',
      params: {
        engagement_time_msec: 1,
        debug_mode: true,
        app_env: process.env.APP_ENV || 'cli'
      }
    }]
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`GA4 test failed (${res.status}): ${text}`);
  if (text) console.log(text);
  else console.log(`GA4 ${collect ? 'collect' : 'debug'} event sent: ${id}`);
}

try {
  if (command === 'auth') await auth();
  else if (command === 'list') await list();
  else if (command === 'setup') await setup();
  else if (command === 'mp-secret') await mpSecret();
  else if (command === 'validate') await validate();
  else if (command === 'send-test') await sendTest();
  else {
    console.error([
      'Usage: node scripts/ga4-cli.mjs <auth|list|setup|mp-secret|validate|send-test>',
      'Options:',
      '  --client=path                 OAuth Desktop app client JSON',
      '  --token=path                  OAuth token file',
      '  --measurement-id=G-...        GA4 measurement ID',
      '  --property=properties/123     GA4 property resource',
      '  --stream=properties/123/dataStreams/456',
      '  --api-secret=secret           Measurement Protocol API secret',
      '  --collect                     Send MP test to collection endpoint',
      '  --acknowledge-user-data --yes Create MP secret after user data acknowledgement'
    ].join('\n'));
    process.exit(1);
  }
} catch (error) {
  console.error(error.message || error);
  process.exit(1);
}
