import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { renderPrompt, ANALYZE_SINGLE, COMPLIANCE_RECHECK, TOPIC_ANALYSIS, APPROVAL_SUMMARY, getLangName } from './prompts';
import { callAiAPI, resolveModelConfig } from './ai-client';
import { checkRateLimit } from './rate-limiter';
import type {
  AnalyzePageRequest,
  ComplianceRecheckRequest,
  TopicAnalysisRequest,
  ApprovalAnalysisRequest,
} from './types';

const DOCS_HINT = 'See GET /llms.txt for API documentation';
const FREE_API_KEY = 'adsense-check-api-key-free';

type Env = {
  API_KEY?: string;
  AI_FAST_API_BASE?: string;
  AI_FAST_API_KEY?: string;
  AI_FAST_MODEL?: string;
  AI_EXPERT_API_BASE?: string;
  AI_EXPERT_API_KEY?: string;
  AI_EXPERT_MODEL?: string;
  RATE_LIMIT_MAX?: string;
  MIN_CLIENT_VERSION?: string;
};

/** Compare semver: returns -1/0/1 */
function compareSemver(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return Math.sign(d);
  }
  return 0;
}

const app = new Hono<{ Bindings: Env; Variables: { isFreeUser: boolean } }>();

// CORS (applied to all routes including /llms.txt)
app.use('*', cors({
  origin: (origin) => origin || '*',
  allowHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400,
}));

// ── API routes (auth + rate limit) ────────────────────────────────────────

const api = new Hono<{ Bindings: Env; Variables: { isFreeUser: boolean } }>();

api.use('*', async (c, next) => {
  const auth = c.req.header('Authorization');
  if (!auth || !auth.startsWith('Bearer ')) {
    return c.json({ error: 'Missing Authorization header. Use Bearer adsense-check-api-key-free for free access.', code: 'UNAUTHORIZED', docs: DOCS_HINT }, 401);
  }
  const token = auth.slice(7);
  const expected = c.env.API_KEY || FREE_API_KEY;
  if (token !== expected) {
    return c.json({ error: 'Invalid API key', code: 'FORBIDDEN', docs: DOCS_HINT }, 403);
  }
  if (token === FREE_API_KEY) {
    c.set('isFreeUser', true);
  }
  await next();
});

// ── Client version check (after auth, before rate limit + routes) ───────────

api.use('*', async (c, next) => {
  const minVer = c.env.MIN_CLIENT_VERSION;
  if (!minVer) { await next(); return; }
  try {
    const body = await c.req.json() as { clientVersion?: string };
    const cv = body?.clientVersion;
    if (!cv || compareSemver(cv, minVer) < 0) {
      return c.json({
        error: cv
          ? `Client version ${cv} is below minimum ${minVer}. Please upgrade.`
          : `Client version not provided. Minimum required: ${minVer}. Please upgrade.`,
        code: 'CLIENT_VERSION_TOO_OLD',
        minVersion: minVer,
        clientVersion: cv ?? '(not provided)',
        docs: DOCS_HINT,
      }, 426); // 426 Upgrade
    }
  } catch { /* parse error, let downstream handler deal with it */ }
  await next();
});

api.use('*', async (c, next) => {
  const max = parseInt(c.env.RATE_LIMIT_MAX || '60', 10);
  const apiKey = c.env.API_KEY || FREE_API_KEY;
  if (!checkRateLimit(apiKey, max)) {
    return c.json({ error: 'Rate limit exceeded', code: 'RATE_LIMITED', docs: DOCS_HINT }, 429);
  }
  await next();
});

api.use('*', async (c, next) => {
  await next();
  if ((c.get('isFreeUser') as boolean | undefined)) {
    c.res.headers.set('X-Powered-By', 'adsense-check - https://github.com/cloudcreate-ai/adsense-checklist');
    c.res.headers.set('X-Data-Usage', 'By using the free tier, you consent to your data being used for product optimization.');
  }
});

api.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

api.post('/analyze/page', async (c) => {
  let body: AnalyzePageRequest;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body', code: 'BAD_REQUEST', docs: DOCS_HINT }, 400);
  }

  if (!body.content || !body.url) {
    return c.json({ error: 'Missing required fields: content, url', code: 'BAD_REQUEST', docs: DOCS_HINT }, 400);
  }

  console.log(`analyze/page url=${body.url}`);

  const langName = getLangName(body.lang || 'en');
  const date = new Date().toISOString().slice(0, 10);
  const topicCtx = body.siteTopic
    ? `\nSite topic: ${body.siteTopic.topic}\nSite type: ${body.siteTopic.type}\nSite description: ${body.siteTopic.description}`
    : '';
  const listingCtx = body.listingSignals
    ? `\nListing structure: ${body.listingSignals.listItems} items, pagination=${body.listingSignals.hasPagination}, categories=${body.listingSignals.hasCategories}, search=${body.listingSignals.hasSearch}`
    : '';

  const prompt = renderPrompt(ANALYZE_SINGLE, {
    date,
    langName,
    topicContext: topicCtx,
    pageLanguage: body.pageLanguage || 'English',
    url: body.url,
    embedSignal: body.embedSignal || 'none',
    listingContext: listingCtx,
    content: body.content,
  });

  try {
    const result = await callAiAPI(prompt, resolveModelConfig(c.env, false, body));
    return c.json(result);
  } catch (err) {
    return c.json({ error: String(err), code: 'AI_ERROR', docs: DOCS_HINT }, 502);
  }
});

api.post('/analyze/compliance', async (c) => {
  let body: ComplianceRecheckRequest;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body', code: 'BAD_REQUEST', docs: DOCS_HINT }, 400);
  }

  if (!body.content || !body.url || body.firstScore == null) {
    return c.json({ error: 'Missing required fields: content, url, firstScore', code: 'BAD_REQUEST', docs: DOCS_HINT }, 400);
  }

  console.log(`analyze/compliance url=${body.url}`);

  const langName = getLangName(body.lang || 'en');
  const prompt = renderPrompt(COMPLIANCE_RECHECK, {
    firstScore: String(body.firstScore),
    langName,
    url: body.url,
    content: body.content,
  });

  try {
    const result = await callAiAPI(prompt, resolveModelConfig(c.env, false, body));
    return c.json(result);
  } catch (err) {
    return c.json({ error: String(err), code: 'AI_ERROR', docs: DOCS_HINT }, 502);
  }
});

api.post('/analyze/topic', async (c) => {
  let body: TopicAnalysisRequest;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body', code: 'BAD_REQUEST', docs: DOCS_HINT }, 400);
  }

  if (!body.title || !body.content) {
    return c.json({ error: 'Missing required fields: title, content', code: 'BAD_REQUEST', docs: DOCS_HINT }, 400);
  }

  const langName = getLangName(body.lang || 'en');
  const prompt = renderPrompt(TOPIC_ANALYSIS, {
    title: body.title,
    metaDescription: body.metaDescription || '(none)',
    navText: body.navText || '(none)',
    content: body.content,
    langName,
  });

  console.log(`analyze/topic title=${body.title}`);

  try {
    const result = await callAiAPI(prompt, resolveModelConfig(c.env, false, body));
    return c.json(result);
  } catch (err) {
    return c.json({ error: String(err), code: 'AI_ERROR', docs: DOCS_HINT }, 502);
  }
});

api.post('/analyze/approval', async (c) => {
  let body: ApprovalAnalysisRequest;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body', code: 'BAD_REQUEST', docs: DOCS_HINT }, 400);
  }

  if (!body.siteUrl || !body.pageSummaries) {
    return c.json({ error: 'Missing required fields: siteUrl, pageSummaries', code: 'BAD_REQUEST', docs: DOCS_HINT }, 400);
  }

  const expert = body.expert || false;
  const langName = getLangName(body.lang || 'en');
  const date = new Date().toISOString().slice(0, 10);

  const prompt = renderPrompt(APPROVAL_SUMMARY, {
    date,
    langName,
    siteUrl: body.siteUrl,
    siteType: body.siteType || 'unknown',
    siteTopic: body.siteTopic || 'unknown',
    pagesAnalyzed: String(body.pagesAnalyzed || 0),
    totalDiscovered: String(body.totalDiscovered || body.pagesAnalyzed || 0),
    compositeScore: String(body.compositeScore || 0),
    pageValueScore: String(body.pageValueScore || 0),
    siteQuality: String(body.siteQuality || 0),
    homeQuality: String(body.homeQuality || 0),
    pageValueNote: body.pageValueNote || '',
    pageSummaries: body.pageSummaries,
  });

  console.log(`analyze/approval siteUrl=${body.siteUrl}`);

  try {
    const result = await callAiAPI(prompt, resolveModelConfig(c.env, expert, body));
    return c.json(result);
  } catch (err) {
    return c.json({ error: String(err), code: 'AI_ERROR', docs: DOCS_HINT }, 502);
  }
});

app.route('/api', api);

// Export api sub-app for integration testing (avoids Hono sub-app env binding propagation issue)
export { api };

app.notFound((c) => {
  const method = c.req.method;
  const path = c.req.path;
  const message = `Not found: ${method} ${path}. Available API routes are under /api/ (e.g. /api/health, /api/analyze/page). See GET /llms.txt for full API documentation.`;
  return new Response(message, { status: 404, headers: { 'Content-Type': 'text/plain' } });
});

export default app;
