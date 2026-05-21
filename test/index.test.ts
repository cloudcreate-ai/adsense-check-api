import app, { api } from '../src/index';

const API_KEY = 'adsense-check-api-key-free';

const env = {
  API_KEY,
  AI_FAST_API_BASE: 'https://api.deepseek.com',
  AI_FAST_API_KEY: 'test-fast-key',
  AI_FAST_MODEL: 'deepseek-v4-flash',
  AI_EXPERT_API_BASE: 'https://api.deepseek.com',
  AI_EXPERT_API_KEY: 'test-expert-key',
  AI_EXPERT_MODEL: 'deepseek-v4-pro',
  RATE_LIMIT_MAX: '60',
};

// Helper: API routes go through `api` directly (paths without /api prefix)
// Non-API routes go through `app` (full paths)
function apiReq(path: string, init?: RequestInit) {
  return api.fetch(new Request(`http://test${path}`, init), env, undefined);
}

function appReq(path: string, init?: RequestInit) {
  return app.fetch(new Request(`http://test${path}`, init), env, undefined);
}

async function jsonBody(res: Response): Promise<Record<string, any>> {
  return res.json() as Promise<Record<string, any>>;
}

// Mock AI API — intercept fetch calls to AI endpoints
function mockAiResponse(body: Record<string, any>) {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;
    if (urlStr.includes('chat/completions')) {
      return new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify(body) } }],
      }));
    }
    // Fallback: real fetch for non-AI calls (shouldn't happen in tests)
    return fetch(input, init);
  }));
}

beforeEach(() => {
  vi.restoreAllMocks();
});

// ── Health & Static ──────────────────────────────────────────────────────

describe('GET /api/health', () => {
  test('returns 200 with status ok', async () => {
    const res = await apiReq('/health', {
      headers: { 'Authorization': `Bearer ${API_KEY}` },
    });
    expect(res.status).toBe(200);
    const body = await jsonBody(res);
    expect(body.status).toBe('ok');
    expect(body).toHaveProperty('timestamp');
  });
});

describe('GET /llms.txt', () => {
  // Static assets are served by CF Workers platform, not by Hono routes.
  // The file content and serving should be verified against `wrangler dev`.
  test('public/llms.txt exists with API documentation', async () => {
    // @ts-ignore - node:fs available at runtime in vitest but not in CF Workers
    const { readFileSync } = await import('node:fs');
    const text = readFileSync('public/llms.txt', 'utf-8');
    expect(text).toContain('adsense-check-api');
    expect(text).toContain('/api/analyze/page');
    expect(text).toContain('adsense-check-api-key-free');
    expect(text).toContain('UNAUTHORIZED');
  });
});

// ── 404 handling ─────────────────────────────────────────────────────────

describe('404', () => {
  test('unknown path returns plain text 404 with guidance', async () => {
    const res = await appReq('/random/unknown/path');
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toContain('text/plain');
    const text = await res.text();
    expect(text).toContain('Not found');
    expect(text).toContain('/api/');
    expect(text).toContain('/llms.txt');
  });

  test('old route /analyze/page returns 404 with guidance', async () => {
    const res = await appReq('/analyze/page', { method: 'POST' });
    expect(res.status).toBe(404);
    const text = await res.text();
    expect(text).toContain('/api/');
    expect(text).toContain('/llms.txt');
  });

  test('old route /health returns 404 with guidance', async () => {
    const res = await appReq('/health');
    expect(res.status).toBe(404);
    const text = await res.text();
    expect(text).toContain('/api/');
    expect(text).toContain('/llms.txt');
  });
});

// ── Authentication (integration: full middleware chain) ──────────────────

describe('Auth middleware', () => {
  test('missing Authorization returns 401 with docs hint', async () => {
    const res = await apiReq('/analyze/page', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(401);
    const body = await jsonBody(res);
    expect(body.code).toBe('UNAUTHORIZED');
    expect(body.error).toContain('adsense-check-api-key-free');
    expect(body.docs).toBe('See GET /llms.txt for API documentation');
  });

  test('wrong API key returns 403 with docs hint', async () => {
    const res = await apiReq('/analyze/page', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer wrong-key',
      },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(403);
    const body = await jsonBody(res);
    expect(body.code).toBe('FORBIDDEN');
    expect(body.docs).toBe('See GET /llms.txt for API documentation');
  });

  test('valid free API key passes auth', async () => {
    mockAiResponse({ pageType: 'content' });
    const res = await apiReq('/analyze/page', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({ url: 'https://example.com', content: 'test' }),
    });
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });
});

// ── POST /api/analyze/page ───────────────────────────────────────────────

describe('POST /api/analyze/page', () => {
  test('missing url returns 400', async () => {
    const res = await apiReq('/analyze/page', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({ content: 'test' }),
    });
    expect(res.status).toBe(400);
    const body = await jsonBody(res);
    expect(body.code).toBe('BAD_REQUEST');
    expect(body.error).toContain('url');
    expect(body.docs).toBe('See GET /llms.txt for API documentation');
  });

  test('missing content returns 400', async () => {
    const res = await apiReq('/analyze/page', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({ url: 'https://example.com' }),
    });
    expect(res.status).toBe(400);
    const body = await jsonBody(res);
    expect(body.code).toBe('BAD_REQUEST');
    expect(body.error).toContain('content');
  });

  test('invalid JSON returns 400', async () => {
    const res = await apiReq('/analyze/page', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
      },
      body: 'not json',
    });
    expect(res.status).toBe(400);
    const body = await jsonBody(res);
    expect(body.code).toBe('BAD_REQUEST');
  });

  test('valid request returns AI response with all fields', async () => {
    mockAiResponse({
      pageType: 'content',
      evaluation_details: {
        value_reason: 'Good content', value: 8,
        originality_reason: 'Original', originality: 7,
        relevance_reason: 'On topic', relevance: 9, relevanceLabel: 'relevant',
        compliance_reason: 'Clean', compliance: 10,
        translation_reason: 'Good', translation: 10,
      },
      confidence: 'high',
      assessment: 'Good page',
      suggestions: ['Improve value'],
    });

    const res = await apiReq('/analyze/page', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        url: 'https://example.com/article',
        content: 'Long article content here',
        lang: 'en',
        pageLanguage: 'English',
        embedSignal: 'none',
      }),
    });

    expect(res.status).toBe(200);
    const body = await jsonBody(res);
    expect(body.pageType).toBe('content');
    expect(body.evaluation_details.value).toBe(8);
    expect(body.evaluation_details.originality).toBe(7);
    expect(body.evaluation_details.relevance).toBe(9);
    expect(body.evaluation_details.compliance).toBe(10);
    expect(body.evaluation_details.translation).toBe(10);
    expect(body.confidence).toBe('high');
    expect(body.assessment).toBe('Good page');
    expect(body.suggestions).toContain('Improve value');
  });
});

// ── POST /api/analyze/compliance ─────────────────────────────────────────

describe('POST /api/analyze/compliance', () => {
  test('missing firstScore returns 400', async () => {
    const res = await apiReq('/analyze/compliance', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({ url: 'https://example.com', content: 'test' }),
    });
    expect(res.status).toBe(400);
    const body = await jsonBody(res);
    expect(body.code).toBe('BAD_REQUEST');
    expect(body.error).toContain('firstScore');
  });

  test('missing url returns 400', async () => {
    const res = await apiReq('/analyze/compliance', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({ content: 'test', firstScore: 5 }),
    });
    expect(res.status).toBe(400);
    const body = await jsonBody(res);
    expect(body.code).toBe('BAD_REQUEST');
    expect(body.error).toContain('url');
  });

  test('valid request returns AI response', async () => {
    mockAiResponse({
      compliance_reason: 'No violations found',
      compliance: 8,
      verdict: 'compliant',
      assessment: 'Page is clean',
    });

    const res = await apiReq('/analyze/compliance', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        url: 'https://example.com/page',
        content: 'Some content to check',
        firstScore: 4,
      }),
    });

    expect(res.status).toBe(200);
    const body = await jsonBody(res);
    expect(body.compliance).toBe(8);
    expect(body.verdict).toBe('compliant');
    expect(body.assessment).toBe('Page is clean');
  });
});

// ── POST /api/analyze/topic ──────────────────────────────────────────────

describe('POST /api/analyze/topic', () => {
  test('missing title returns 400', async () => {
    const res = await apiReq('/analyze/topic', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({ content: 'homepage content' }),
    });
    expect(res.status).toBe(400);
    const body = await jsonBody(res);
    expect(body.code).toBe('BAD_REQUEST');
    expect(body.error).toContain('title');
  });

  test('missing content returns 400', async () => {
    const res = await apiReq('/analyze/topic', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({ title: 'My Site' }),
    });
    expect(res.status).toBe(400);
    const body = await jsonBody(res);
    expect(body.code).toBe('BAD_REQUEST');
    expect(body.error).toContain('content');
  });

  test('valid request returns AI response', async () => {
    mockAiResponse({
      type: 'content',
      topic: 'Excel tools',
      description: 'A site about Excel',
      isYMYL: false,
      YMYL_reason: 'Not applicable',
      nicheFocusScore: 8,
      nicheFocusReason: 'Focused topic',
      confidence: 'high',
      reasoning: 'Based on content analysis',
      metaSuggestions: ['Add meta description'],
    });

    const res = await apiReq('/analyze/topic', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        title: 'Excel Tools Hub',
        metaDescription: 'Free Excel tools',
        navText: 'Home | Tools | About',
        content: 'Homepage with Excel tools',
      }),
    });

    expect(res.status).toBe(200);
    const body = await jsonBody(res);
    expect(body.type).toBe('content');
    expect(body.topic).toBe('Excel tools');
    expect(body.isYMYL).toBe(false);
    expect(body.nicheFocusScore).toBe(8);
  });
});

// ── POST /api/analyze/approval ───────────────────────────────────────────

describe('POST /api/analyze/approval', () => {
  test('missing siteUrl returns 400', async () => {
    const res = await apiReq('/analyze/approval', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({ pageSummaries: '- page 1' }),
    });
    expect(res.status).toBe(400);
    const body = await jsonBody(res);
    expect(body.code).toBe('BAD_REQUEST');
    expect(body.error).toContain('siteUrl');
  });

  test('missing pageSummaries returns 400', async () => {
    const res = await apiReq('/analyze/approval', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({ siteUrl: 'https://example.com' }),
    });
    expect(res.status).toBe(400);
    const body = await jsonBody(res);
    expect(body.code).toBe('BAD_REQUEST');
    expect(body.error).toContain('pageSummaries');
  });

  test('expert mode returns AI response', async () => {
    mockAiResponse({
      analysis: 'Step-by-step reasoning',
      probability: 75,
      verdict: 'Likely Pass',
      reasons: ['Good content', 'Fast site', 'Clean design'],
      topActions: ['Add more content', 'Improve originality'],
      detailedSummary: 'Site looks good overall',
    });

    const res = await apiReq('/analyze/approval', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        siteUrl: 'https://example.com',
        siteType: 'content',
        siteTopic: 'Excel tools',
        pagesAnalyzed: 10,
        totalDiscovered: 50,
        compositeScore: 65,
        pageValueScore: 70,
        siteQuality: 80,
        homeQuality: 75,
        pageSummaries: '- https://example.com/1: [pass] V=8 O=7\n- https://example.com/2: [warn] V=5 O=4',
        expert: true,
      }),
    });

    expect(res.status).toBe(200);
    const body = await jsonBody(res);
    expect(body.probability).toBe(75);
    expect(body.verdict).toBe('Likely Pass');
    expect(body.reasons).toHaveLength(3);
    expect(body.topActions).toHaveLength(2);
  });
});

// ── CORS ─────────────────────────────────────────────────────────────────

describe('CORS', () => {
  test('llms.txt includes CORS headers', async () => {
    const res = await appReq('/llms.txt', {
      headers: { Origin: 'https://example.com' },
    });
    expect(res.headers.get('access-control-allow-origin')).toBe('https://example.com');
  });

  test('API routes include CORS headers via app', async () => {
    // CORS is applied at app level, so test through app.fetch()
    // Auth will fail but CORS headers should still be present
    const res = await appReq('/api/health', {
      headers: { Origin: 'https://example.com' },
    });
    expect(res.headers.get('access-control-allow-origin')).toBe('https://example.com');
  });
});

// ── X-Powered-By header for free users ───────────────────────────────────

describe('X-Powered-By header', () => {
  test('free user responses include ad header', async () => {
    mockAiResponse({ pageType: 'content' });
    const res = await apiReq('/analyze/page', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({ url: 'https://example.com', content: 'test' }),
    });
    expect(res.headers.get('x-powered-by')).toBe('adsense-check - https://github.com/cloudcreate-ai/adsense-checklist');
  });
});

describe('X-Data-Usage header', () => {
  test('free user responses include data usage consent header', async () => {
    mockAiResponse({ pageType: 'content' });
    const res = await apiReq('/analyze/page', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({ url: 'https://example.com', content: 'test' }),
    });
    expect(res.headers.get('x-data-usage')).toBe('By using the free tier, you consent to your data being used for product optimization.');
  });
});

// ── Rate limiting ────────────────────────────────────────────────────────

describe('Rate limiting', () => {
  test('allows requests within limit', async () => {
    mockAiResponse({ pageType: 'content' });

    const res = await apiReq('/analyze/page', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({ url: 'https://example.com', content: 'test' }),
    });

    expect(res.status).toBe(200);
  });
});

// ── Client version check ─────────────────────────────────────────────────

describe('Client version check', () => {
  const envWithMinVersion = {
    ...env,
    MIN_CLIENT_VERSION: '1.12.0',
  };

  test('no MIN_CLIENT_VERSION set → request passes through', async () => {
    mockAiResponse({ pageType: 'content' });
    const res = await apiReq('/analyze/page', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({ url: 'https://example.com', content: 'test' }),
    });
    expect(res.status).toBe(200);
  });

  test('version below minimum returns 426', async () => {
    const res = await api.fetch(new Request('http://test/analyze/page', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({ url: 'https://example.com', content: 'test', clientVersion: '1.10.0' }),
    }), envWithMinVersion, undefined);
    expect(res.status).toBe(426);
    const body = await jsonBody(res);
    expect(body.code).toBe('CLIENT_VERSION_TOO_OLD');
    expect(body.minVersion).toBe('1.12.0');
    expect(body.clientVersion).toBe('1.10.0');
  });

  test('version equal to minimum passes', async () => {
    mockAiResponse({ pageType: 'content' });
    const res = await api.fetch(new Request('http://test/analyze/page', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({ url: 'https://example.com', content: 'test', clientVersion: '1.12.0' }),
    }), envWithMinVersion, undefined);
    expect(res.status).toBe(200);
  });

  test('version above minimum passes', async () => {
    mockAiResponse({ pageType: 'content' });
    const res = await api.fetch(new Request('http://test/analyze/page', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({ url: 'https://example.com', content: 'test', clientVersion: '2.0.0' }),
    }), envWithMinVersion, undefined);
    expect(res.status).toBe(200);
  });

  test('missing clientVersion when MIN_CLIENT_VERSION is set → returns 426', async () => {
    const res = await api.fetch(new Request('http://test/analyze/page', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({ url: 'https://example.com', content: 'test' }),
    }), envWithMinVersion, undefined);
    expect(res.status).toBe(426);
    const body = await jsonBody(res);
    expect(body.code).toBe('CLIENT_VERSION_TOO_OLD');
    expect(body.minVersion).toBe('1.12.0');
    expect(body.clientVersion).toBe('(not provided)');
  });
});
