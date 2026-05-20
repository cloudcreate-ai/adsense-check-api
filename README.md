# adsense-check-api

Cloudflare Worker API for Google AdSense page analysis. Proxies AI-powered compliance, quality, and approval assessments.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Health check |
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
AI_FAST_API_BASE=https://api.deepseek.com
AI_FAST_API_KEY=sk-your-key
AI_FAST_MODEL=deepseek-v4-flash
AI_EXPERT_API_BASE=https://api.deepseek.com
AI_EXPERT_API_KEY=sk-your-key
AI_EXPERT_MODEL=deepseek-v4-pro
```

```bash
npm run dev       # local dev server at http://localhost:8787
npm run deploy    # deploy to Cloudflare Workers
```

## Authentication

All `/analyze/*` endpoints require a Bearer token. For free access, use `adsense-check-api-key-free`:

```bash
curl -X POST http://localhost:8787/api/analyze/page \
  -H "Authorization: Bearer adsense-check-api-key-free" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com/page","content":"..."}'
```

Free users will see an `X-Powered-By` header with a link to [adsense-check](https://github.com/cloudcreate-ai/adsense-checklist).

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `API_KEY` | No | `adsense-check-api-key-free` | Worker authentication key |
| `AI_FAST_API_BASE` | Yes | - | Fast model API endpoint |
| `AI_FAST_API_KEY` | Yes | - | Fast model API key |
| `AI_FAST_MODEL` | No | `deepseek-v4-flash` | Fast model name |
| `AI_EXPERT_API_BASE` | Yes (for expert) | `https://api.deepseek.com` | Expert model API endpoint |
| `AI_EXPERT_API_KEY` | Yes (for expert) | - | Expert model API key |
| `AI_EXPERT_MODEL` | No | `deepseek-v4-pro` | Expert model name |
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

### Prerequisites

- Node.js 18+ and npm
- [Cloudflare account](https://dash.cloudflare.com/)
- DeepSeek (or other OpenAI-compatible) API key

### 1. Clone and install

```bash
git clone https://github.com/cloudcreate-ai/adsense-check-api.git
cd adsense-check-api
npm install
```

### 2. Local development

Create `.dev.vars` with your AI API keys:

```env
AI_FAST_API_BASE=https://api.deepseek.com
AI_FAST_API_KEY=sk-your-key
AI_FAST_MODEL=deepseek-v4-flash
AI_EXPERT_API_BASE=https://api.deepseek.com
AI_EXPERT_API_KEY=sk-your-key
AI_EXPERT_MODEL=deepseek-v4-pro
```

```bash
npm run dev   # starts http://localhost:8787
```

### 3. Login to Cloudflare

```bash
npx wrangler login
```

### 4. Deploy the Worker

```bash
npm run deploy
```

This creates a Worker named `adsense-check-api` and deploys it. The URL will be:

```
https://adsense-check-api.<your-account>.workers.dev
```

### 5. Set production secrets

**Never commit API keys.** Set them as Worker secrets:

```bash
echo "sk-your-fast-key" | npx wrangler secret put AI_FAST_API_KEY
echo "sk-your-expert-key" | npx wrangler secret put AI_EXPERT_API_KEY
```

Alternatively, set them in the Cloudflare Dashboard → Workers & Pages → adsense-check-api → Settings → Variables and Secrets.

### 6. Customize the API Key (optional)

The default `API_KEY` is `adsense-check-api-key-free`. To use your own key:

```bash
npx wrangler secret put API_KEY    # interactive prompt
```

Then update `wrangler.toml` `[vars]` section to match your preferred key.

### 7. Custom domain (optional)

In Cloudflare Dashboard → Workers & Pages → adsense-check-api → Triggers, add your custom domain.

## Architecture

- **Hono** — lightweight routing framework for Cloudflare Workers
- **Cloudflare Workers** — serverless runtime with automatic scaling
- **Smart placement** — isolates automatically placed near users
- **Static assets** — `public/llms.txt` served at the platform level
- **Dual model support** — fast model for routine analysis, expert model for deep approval assessment
