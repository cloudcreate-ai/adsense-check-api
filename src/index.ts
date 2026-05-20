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

type Env = {
  API_KEY?: string;
  AI_API_BASE?: string;
  AI_API_KEY?: string;
  AI_FAST_MODEL?: string;
  AI_EXPERT_API_BASE?: string;
  AI_EXPERT_API_KEY?: string;
  AI_EXPERT_MODEL?: string;
  RATE_LIMIT_MAX?: string;
  ALLOWED_ORIGINS?: string;
};

const app = new Hono<{ Bindings: Env }>();

// ── Middleware ─────────────────────────────────────────────────────────────

// CORS
app.use('*', cors({
  origin: (origin) => origin || '*',
  allowHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400,
}));

// Auth
app.use('/analyze/*', async (c, next) => {
  const auth = c.req.header('Authorization');
  if (!auth || !auth.startsWith('Bearer ')) {
    return c.json({ error: 'Missing Authorization header', code: 'UNAUTHORIZED' }, 401);
  }
  const token = auth.slice(7);
  const expected = c.env.API_KEY;
  if (!expected || token !== expected) {
    return c.json({ error: 'Invalid API key', code: 'FORBIDDEN' }, 403);
  }
  await next();
});

// Rate limiter
app.use('/analyze/*', async (c, next) => {
  const max = parseInt(c.env.RATE_LIMIT_MAX || '60', 10);
  const apiKey = c.env.API_KEY || '';
  if (!checkRateLimit(apiKey, max)) {
    return c.json({ error: 'Rate limit exceeded', code: 'RATE_LIMITED' }, 429);
  }
  await next();
});

// ── Routes ─────────────────────────────────────────────────────────────────

app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

app.post('/analyze/page', async (c) => {
  let body: AnalyzePageRequest;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body', code: 'BAD_REQUEST' }, 400);
  }

  if (!body.content || !body.url) {
    return c.json({ error: 'Missing required fields: content, url', code: 'BAD_REQUEST' }, 400);
  }

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
    return c.json({ error: String(err), code: 'AI_ERROR' }, 502);
  }
});

app.post('/analyze/compliance', async (c) => {
  let body: ComplianceRecheckRequest;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body', code: 'BAD_REQUEST' }, 400);
  }

  if (!body.content || !body.url || body.firstScore == null) {
    return c.json({ error: 'Missing required fields: content, url, firstScore', code: 'BAD_REQUEST' }, 400);
  }

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
    return c.json({ error: String(err), code: 'AI_ERROR' }, 502);
  }
});

app.post('/analyze/topic', async (c) => {
  let body: TopicAnalysisRequest;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body', code: 'BAD_REQUEST' }, 400);
  }

  if (!body.title || !body.content) {
    return c.json({ error: 'Missing required fields: title, content', code: 'BAD_REQUEST' }, 400);
  }

  const langName = getLangName(body.lang || 'en');
  const prompt = renderPrompt(TOPIC_ANALYSIS, {
    title: body.title,
    metaDescription: body.metaDescription || '(none)',
    navText: body.navText || '(none)',
    content: body.content,
    langName,
  });

  try {
    const result = await callAiAPI(prompt, resolveModelConfig(c.env, false, body));
    return c.json(result);
  } catch (err) {
    return c.json({ error: String(err), code: 'AI_ERROR' }, 502);
  }
});

app.post('/analyze/approval', async (c) => {
  let body: ApprovalAnalysisRequest;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body', code: 'BAD_REQUEST' }, 400);
  }

  if (!body.siteUrl || !body.pageSummaries) {
    return c.json({ error: 'Missing required fields: siteUrl, pageSummaries', code: 'BAD_REQUEST' }, 400);
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

  try {
    const result = await callAiAPI(prompt, resolveModelConfig(c.env, expert, body));
    return c.json(result);
  } catch (err) {
    return c.json({ error: String(err), code: 'AI_ERROR' }, 502);
  }
});

export default app;
