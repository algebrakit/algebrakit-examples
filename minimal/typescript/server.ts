/**
 * Algebrakit minimal example - Node.js / TypeScript
 * =================================================
 * Creates an Algebrakit exercise session using the SDK and serves it as an
 * interactive web page with learning event logging.
 *
 * The server handles these routes:
 * - GET /?exercise=<slug> — creates a new session for that exercise and serves the page (index.html)
 * - /proxy/algebrakit/*  — forwards widget API calls to Algebrakit with the API key attached
 * - GET /style.css, /event-log.js — page styling and event log display
 *
 * To run:
 *   npm install
 *   cp .env.example .env   (then add your API key to .env)
 *   npm start
 *
 * Then open http://localhost:3000 in your browser.
 */

import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import httpProxy from 'http-proxy';
import { ApiClient, CreateSessionRequest } from '@algebrakit/sdk';

// Load environment variables from .env file
dotenv.config({ path: path.join(__dirname, '.env') });

// Configuration
const API_KEY = process.env.ALGEBRAKIT_API_KEY;
const API_URL = process.env.ALGEBRAKIT_API_URL || 'https://api.algebrakit.com';
const WIDGET_URL = process.env.ALGEBRAKIT_WIDGET_URL || 'https://widgets.algebrakit.com';
const PORT = parseInt(process.env.PORT || '3000', 10);
const PROXY_PREFIX = '/proxy/algebrakit';

if (!API_KEY || API_KEY === 'your_api_key_here') {
  console.error('\nError: ALGEBRAKIT_API_KEY is not set or is still the placeholder.');
  console.error('Copy .env.example to .env and set ALGEBRAKIT_API_KEY.\n');
  process.exit(1);
}

// Example exercises, one per question type. The integration is the same for all of them.
// The page shows one at a time: /?exercise=<slug>
const EXERCISES = [
  { slug: 'linear-equation', title: 'Linear equation', exerciseId: 'fa42e943-8213-41a6-8a91-8c22a929ffe9' },
  { slug: 'ratio-table', title: 'Ratio table', exerciseId: '1e3d0964-4769-41fa-9a8a-86639fb53d53' },
  { slug: 'parabola', title: 'Draw a parabola', exerciseId: 'f5a894f8-4b67-4fe3-8423-6033e90ea56f' },
  { slug: 'triangle-area', title: 'Area of a triangle', exerciseId: 'eb21b44a-d846-4182-8a00-8f564386f11d' },
  { slug: 'subtraction', title: 'Subtract multi-digit numbers', exerciseId: '489d0c1a-147f-47bc-86cb-6d7c8a90fe15' },
];

const client = new ApiClient(API_URL, API_KEY);
const template = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf-8');

// Static files used by the page (styling and event log display only)
const STATIC_FILES: Record<string, string> = {
  '/style.css': 'text/css; charset=utf-8',
  '/event-log.js': 'text/javascript; charset=utf-8',
};

type SessionResult = { sessionId: string; error: null } | { sessionId: null; error: string };

async function createExerciseSession(exerciseId: string): Promise<SessionResult> {
  try {
    const request: CreateSessionRequest = {
      exercises: [{ exerciseId, version: 'latest' }],
      apiVersion: 2,
    };

    const response = await client.createSession(request);
    const session = response?.[0]?.success ? response[0].sessions?.[0] : undefined;

    if (session) {
      return { sessionId: session.sessionId, error: null };
    }
    return { sessionId: null, error: response?.[0]?.msg || 'Unknown error creating session' };
  } catch (e: any) {
    return { sessionId: null, error: e.message };
  }
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

async function renderPage(slug: string | null): Promise<string> {
  const exercise = EXERCISES.find((e) => e.slug === slug) ?? EXERCISES[0];
  const session = await createExerciseSession(exercise.exerciseId);

  const exerciseNav = EXERCISES.map((e) =>
    `<a href="/?exercise=${e.slug}"${e === exercise ? ' aria-current="page"' : ''}>${escapeHtml(e.title)}</a>`
  ).join('\n');

  const page = template
    .replace('{{PROXY_URL}}', PROXY_PREFIX)
    .replace('{{WIDGET_URL}}', WIDGET_URL)
    .replaceAll('{{STACK}}', 'Node.js / TypeScript')
    .replace('{{EXERCISE_NAV}}', exerciseNav);

  if (session.error !== null) {
    console.log(`Session creation failed: ${session.error}`);
    // No session: show the error instead of the <akit-exercise> element
    return page.replace(
      /<akit-exercise[^>]*><\/akit-exercise>/,
      `<div class="error"><strong>Could not create a session.</strong> ${escapeHtml(session.error)}` +
        `<p>Check ALGEBRAKIT_API_KEY in .env and the server log.</p></div>`
    );
  }

  console.log(`Created session ${session.sessionId} (${exercise.title})`);
  return page.replace('{{SESSION_ID}}', session.sessionId);
}

// Proxy: forwards widget requests to the Algebrakit API with the API key attached.
// WARNING: this forwards every path, for anyone who can reach this server. That is fine
// on localhost, but do not deploy it as-is: in production, only forward the endpoints the
// widgets need and require your own user to be logged in.
const proxy = httpProxy.createProxyServer({ target: API_URL, changeOrigin: true });

proxy.on('proxyReq', (proxyReq) => {
  proxyReq.setHeader('x-api-key', API_KEY);
});

proxy.on('error', (err, _req, res) => {
  console.error('Proxy error:', err.message);
  (res as http.ServerResponse).writeHead(502, { 'Content-Type': 'application/json' });
  (res as http.ServerResponse).end(JSON.stringify({ error: 'Proxy error', message: err.message }));
});

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);

  if (url.pathname.startsWith(PROXY_PREFIX)) {
    req.url = req.url!.substring(PROXY_PREFIX.length); // strip prefix
    proxy.web(req, res);
  } else if (req.method === 'GET' && url.pathname === '/') {
    // A new session per page load: in a real application, create one session per student
    // and assignment, store its ID, and reuse it so the student can resume.
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(await renderPage(url.searchParams.get('exercise')));
  } else if (req.method === 'GET' && STATIC_FILES[url.pathname]) {
    res.writeHead(200, { 'Content-Type': STATIC_FILES[url.pathname] });
    res.end(fs.readFileSync(path.join(__dirname, url.pathname)));
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  }
});

server.listen(PORT, () => {
  console.log(`\nOpen http://localhost:${PORT} in your browser.`);
});
