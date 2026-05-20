# adsense-check-api

Cloudflare Worker API for Google AdSense page analysis. Proxies AI-powered compliance, quality, and approval assessments.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check |
| `POST` | `/analyze/page` | 5-dimension page scoring (value, originality, relevance, compliance, translation) |
| `POST` | `/analyze/compliance` | Second-pass compliance re-check for flagged pages |
| `POST` | `/analyze/topic` | Site topic & type detection |
| `POST` | `/analyze/approval` | AdSense approval probability assessment |

## Quick Start

```bash
npm install
```

Configure `.dev.vars`:

```env
API_KEY=your-worker-api-key
AI_API_BASE=https://api.deepseek.com
AI_API_KEY=sk-your-ai-key
AI_FAST_MODEL=deepseek-chat
```

```bash
npm run dev       # local dev server at http://localhost:8787
npm run deploy    # deploy to Cloudflare Workers
```

## Authentication

All `/analyze/*` endpoints require a Bearer token:

```bash
curl -X POST http://localhost:8787/analyze/page \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com/page","content":"..."}'
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `API_KEY` | Yes | - | Worker authentication key |
| `AI_API_BASE` | No | `https://api.deepseek.com` | AI API endpoint |
| `AI_API_KEY` | Yes | - | AI API key |
| `AI_FAST_MODEL` | No | `deepseek-chat` | Fast model name |
| `AI_EXPERT_API_BASE` | No | `https://api.anthropic.com` | Expert model endpoint |
| `AI_EXPERT_API_KEY` | No | - | Expert model API key |
| `AI_EXPERT_MODEL` | No | `claude-sonnet-4-6` | Expert model name |
| `RATE_LIMIT_MAX` | No | `60` | Max requests per minute per key |

## Request Examples

### Page Analysis

```json
{
  "url": "https://example.com/article-1",
  "content": "Full page text content here...",
  "lang": "en",
  "pageLanguage": "English",
  "embedSignal": "none"
}
```

### Topic Analysis

```json
{
  "title": "My Site",
  "metaDescription": "A site about...",
  "navText": "Home | About | Contact",
  "content": "Homepage text content..."
}
```

### Compliance Re-check

```json
{
  "url": "https://example.com/page-2",
  "content": "Flagged page content...",
  "firstScore": 4
}
```

### Approval Assessment

```json
{
  "siteUrl": "https://example.com",
  "siteType": "content",
  "siteTopic": "Excel tools",
  "pagesAnalyzed": 10,
  "totalDiscovered": 50,
  "compositeScore": 65,
  "pageValueScore": 70,
  "siteQuality": 80,
  "homeQuality": 75,
  "pageSummaries": "- https://example.com/1: [pass] V=8 O=7 R=9 C=8 ...\n- ..."
}
```

## Rate Limiting

In-memory rate limiter per isolate — `RATE_LIMIT_MAX` requests per minute. Returns `429` when exceeded.

## Deploy

```bash
npx wrangler login
npm run deploy
```

Set production secrets via Cloudflare dashboard or `wrangler secret put`.
