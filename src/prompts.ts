export function renderPrompt(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}

export function extractJson(text: string): any {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('No JSON found in response');
  }
  return JSON.parse(jsonMatch[0]);
}

const AI_LANG_NAMES: Record<string, string> = { en: 'English', zh: '中文' };

export function getLangName(lang: string): string {
  return AI_LANG_NAMES[lang] ?? lang;
}

// ── Prompt Templates ─────────────────────────────────────────────────────

export const ANALYZE_SINGLE = `You are a Google AdSense review expert. Analyze this page and score it on five dimensions.
Current date: {{date}}
Reply language: {{langName}}
{{topicContext}}

## Step 1 — Classify the page type
Choose ONE type based on the page's content and purpose:
- "homepage": The site's main landing page
- "listing": An index/category page listing multiple items
- "content": A standalone article, blog post, guide, or tutorial
- "game_detail": A game page with a playable game or game download
- "video_detail": A page centered around a video or video embed
- "reference_detail": A wiki entry, glossary term, encyclopedia article, or database record
- "required": About, Privacy, Terms, Contact, Legal, Editorial Policy
- "utility": Search, Login, Signup, Download, 404, or functional tool pages

## Step 2 — Score based on page type

### For "required" and "utility" pages:
Set value=10, originality=10, relevance=10, translation=10 automatically. Only evaluate compliance (is the page reasonably complete and not empty/placeholder?).

### For "game_detail" pages:
The page's core value IS the interactive gaming experience, not editorial text.

**If embedSignal = "game" (has game iframe/canvas):**
- value: Score 7+ if the page has a game embed with basic context (title, description, instructions). If the embed is present but the page has very little supporting text (<200 chars), still score 7 but note the need for manual verification.
- originality: Score based on curation quality — unique descriptions, gameplay tips, editorial commentary. Score 5-7 for basic original descriptions. Score 3-4 only for generic one-liners like "Play X free online" that clearly follow an auto-generated template.
- relevance: How relevant the game is to the site's overall topic/theme.
- compliance: Flag actual policy violations (see rules below).

**If embedSignal = "none" (no game embed, pure text):**
This is a content page (game guide/review), not a functional page. Evaluate as a "content" page — assess text depth, originality, and substantive information.

### For "video_detail" pages:
The page's core value IS the video content, not surrounding text.

**If embedSignal = "video" (has video element):**
- value: Score 7+ if the page embeds a working video with basic context. If text is minimal, still score 7 but note the need for manual verification.
- originality: Score based on unique descriptions, analysis, commentary, or curation. Score 5-7 for basic original descriptions. Score 3-4 for generic boilerplate.
- relevance: How relevant the video is to the site's topic.
- compliance: Flag actual policy violations.

**If embedSignal = "none" (no video embed, pure text):**
This is a content page (video review/transcript), not a functional page. Evaluate as a "content" page — assess text depth, originality, and substantive information.

### For "content" pages (articles, guides, tutorials):
- value: Depth and usefulness of information. Crucially evaluate for Authoritativeness (E-E-A-T). Reward points (+1 to +2) if the page clearly attributes content to a qualified author (Author Bio, expertise statement) or links to reputable external references. Score 7+ for detailed, well-structured guides that provide deep answers. Score 3-4 for thin, superficial, or filler content.
- originality: Unique perspective, personal experience, original analysis, not just rephrasing others. Strictly demand evidence of Firsthand Experience — e.g., unique screenshots, specific test data, personal case studies, or custom logs. Score 7+ for genuine original analysis or firsthand experience. Score 3-4 for well-disguised but vapid AI-generated or templated rephrasing.
- relevance: How relevant the topic is to the site's overall theme.
- compliance: Flag actual policy violations (see rules below).

### For "listing" pages (category, index, feed, archive):
The page's core value IS discovery efficiency — helping users find content they care about, NOT long-form text.

- value: Evaluate discovery utility, NOT text volume. Score 7+ if the page has clear categorization, useful metadata (thumbnails, dates, ratings, play counts), and easy navigation (pagination, sorting, filters). Score 3-4 for bare link lists with no context, organization, or discovery aids.
- originality: Editorial curation and unique organization. Score 7+ for pages with hand-curated selections, thoughtful categories, or original introductory text explaining what's featured and why. Score 3-4 for purely auto-generated alphabetical or chronological dumps with no editorial touch.
- relevance: How relevant the listed items are to the site's topic.
- compliance: Flag actual policy violations. Do NOT penalize for lack of long text on listing pages.

### For "homepage":
The page's core value IS orientation — communicating the site's purpose and directing users to key sections.

- value: Score 7+ if the homepage clearly explains what the site offers, highlights key content or features, and provides intuitive navigation to important sections. Score 3-4 for confusing layouts, unclear purpose, or pages that don't help users take the next step.
- originality: Unique brand positioning, visual identity, and editorial voice. Score 7+ for a homepage that stands out and conveys trust. Score 3-4 for generic templates with no personality or differentiation.
- relevance: By definition should be highly relevant to the site's topic.
- compliance: Flag actual policy violations.

### For "reference_detail" pages (wiki entries, glossary terms, encyclopedia articles, database records):
The page's core value IS information completeness and accuracy.

- value: Score 7+ for thorough, well-structured entries that cover the topic adequately. Cross-references to related entries add value. Score 3-4 for stub entries with minimal information, missing key details, or clearly incomplete records.
- originality: Original compilation, unique presentation, or synthesized knowledge. Score 7+ for entries written in original words with unique insights or structure. Score 3-4 for directly copied/pasted content from a single source.
- relevance: How relevant the entry is to the site's topic.
- compliance: Flag actual policy violations.

### Compliance rules (apply to ALL page types):
Flag: adult content, gambling promotion, drugs, violence promotion, copyright infringement, deceptive content.
- Words like "crack", "bet", "drug", "gamble" used in educational, news, or informational contexts are NOT violations.
- Only flag actual promotion or facilitation of policy-violating content.
- If the page is a 404 or has minimal content, do not flag. Note "insufficient content".

### Anti-Hallucination & Trustworthiness Rule (apply to ALL page types):
For "content", "reference_detail", and "game_detail" pages, actively check for factual validity. If the content generates hallucinated facts (e.g., non-existent software version numbers, incorrect game mechanics, fake history data, or contradictory logical steps), the \`compliance\` and \`value\` score MUST be strictly penalized to ≤ 4, regardless of how clean the writing or translation is.

### Translation rules (apply to ALL page types):
Declared language: {{pageLanguage}}
Score 10 = content is flawlessly, correctly, and naturally written in the declared language, seamlessly adopting local idioms, domain-specific jargon, and community-accepted phrasings rather than stiff, overly formal literal machine translation.
Score 0 = content is completely untranslated or machine-translated gibberish.

**STRICT SCORING RULES — do NOT be lenient:**
- If ANY paragraph or section of substantial length (2+ sentences) is in a different language than declared, score ≤ 5.
- If FAQ headings are in one language but answers are in another, score ≤ 4.
- If key content blocks are left in English while the rest is in the declared language, score ≤ 5.
- If the page mixes 3+ languages, score ≤ 3.
- Minor UI artifacts (button text, copyright notice) alone → score 8-9.
- If the declared language is English or not set, score 10 automatically.

Page: {{url}}
Embed signal: {{embedSignal}} (game = has game iframe/canvas, video = has video element, none = no embed)
{{listingContext}}

Content:
{{content}}

Reply in {{langName}} with JSON:
{
  "pageType": "homepage|listing|content|game_detail|video_detail|reference_detail|required|utility",
  "evaluation_details": {
    "value_reason": "Objective analysis of this page's real value density, information depth, and whether it solves user pain points. Look for substantive content vs. filler.",
    "value": <0-10>,
    "originality_reason": "Evidence of firsthand experience — unique screenshots, specific test data, personal case studies, or custom logs. Distinguish genuine human experience from AI-generated or templated content.",
    "originality": <0-10>,
    "relevance_reason": "How deeply this page anchors to the site's core topic. Flag if the page deviates or pads content off-topic.",
    "relevance": <0-10>,
    "relevanceLabel": "relevant|tangential|off-topic",
    "compliance_reason": "Fact-check and policy compliance check. Note any hallucinated facts (fake version numbers, incorrect mechanics) or policy violations.",
    "compliance": <0-10>,
    "translation_reason": "Check if content matches the declared language naturally, adopting local idioms and domain jargon. Flag machine-translation artifacts.",
    "translation": <0-10>
  },
  "confidence": "high|medium|low",
  "assessment": "Comprehensive summary synthesizing the key findings across all E-E-A-T dimensions.",
  "suggestions": ["1-3 highly specific actionable suggestions to improve this page based on the lowest scoring dimensions"]
}

**Confidence scoring rules:**
- "high": Page type is clear and the evaluation criteria apply well.
- "medium": Page type is somewhat ambiguous, or the page is a hybrid that doesn't fit cleanly into one category. Note the uncertainty in the assessment.
- "low": Cannot determine page type, or the page is too minimal/thin to meaningfully evaluate. Reduce value and originality by 1-2 points to reflect the uncertainty. Note why in the assessment.
`;

export const COMPLIANCE_RECHECK = `You are a Google AdSense policy compliance expert. A previous analysis flagged this page as potentially non-compliant (score: {{firstScore}}/10). Perform a careful second review.

Focus ONLY on compliance. Check for:
- Adult or sexually explicit content
- Gambling or casino promotion
- Illegal drugs or controlled substances
- Violence, gore, or hate speech
- Copyright infringement or pirated content
- Deceptive content, phishing, or scams
- Excessive profanity
- Misleading medical/financial claims
- Content that targets children inappropriately
- Dangerous AI Hallucinations: serious factual errors that could cause property damage, device failure, or personal safety risks (e.g., incorrect flashing code, fake official phone numbers, wrong medication dosages)
- Deepfake/Impersonation: impersonation of official entities or authoritative figures to publish misleading claims

Be fair — informational/educational content ABOUT sensitive topics (e.g., health articles, news reporting) is NOT a violation. Only flag actual policy violations.

Additional instructions:
- If the page text is very short (< 200 characters) and appears to be an error page, 404, or placeholder, do not flag any compliance violations. Score compliance as 10 and note "insufficient content".
- Context matters: words that match policy keywords but appear in news reporting, educational content, or informational discussion are NOT violations.

Page: {{url}}

Content:
{{content}}

Reply in {{langName}} with JSON:
{
  "compliance_reason": "Step-by-step analysis: (1) list which policy rules were checked, (2) note any matching concerns, (3) explain whether hallucinated facts or impersonation attempts were detected, (4) conclude with final determination.",
  "compliance": <0-10>,
  "verdict": "compliant|borderline|violation",
  "assessment": "Brief explanation of your compliance determination"
}`;

export const TOPIC_ANALYSIS = `You are a web analyst. The following website has incomplete or unclear metadata (missing title and/or description). Analyze its content and determine the site type and topic.

Website title (from browser): {{title}}
Meta description: {{metaDescription}}
Navigation: {{navText}}
Homepage content (first 2000 chars):
{{content}}

Classify this website into ONE of these types:
- "content": informational site (news, blog, educational articles, guides)
- "tool": utility/tool site (calculator, converter, generator, online tool)
- "game": online game site (playable games, game portal)
- "video": video site (video sharing, video blog, YouTube-style site with embedded videos)
- "reference": wiki/encyclopedia/reference site (structured knowledge base, searchable database, glossary, dictionary, encyclopedia-style content with interlinked articles, transcript archive)
- "unsupported": e-commerce, SaaS product, social media, forum, portfolio, or anything not fitting above categories

YMYL (Your Money or Your Life) Detection:
Determine if the site covers topics in sensitive areas that Google classifies as YMYL:
- Financial: investment advice, insurance, loans, tax guidance, crypto trading
- Medical/Health: diagnoses, treatments, drug information, medical devices
- Legal: legal advice, contracts, rights, court proceedings
- Safety: emergency procedures, security advice, home/vehicle safety

If the site touches any of these areas, mark it as YMYL. YMYL sites face much stricter E-E-A-T requirements — the presence of YMYL content means subsequent compliance and fact-checking must be significantly more rigorous.

Also evaluate niche focus: is the site tightly focused on one topic (high score) or scattered across unrelated subjects (low score)?

Reply language: {{langName}}

Reply in {{langName}} with JSON:
{
  "type": "content|tool|game|video|reference|unsupported",
  "topic": "Main topic in 3-5 words (e.g. 'Excel translation reference')",
  "description": "One sentence describing what this site does",
  "isYMYL": true|false,
  "YMYL_reason": "If true, explain which sensitive category (financial, medical, legal, safety) is covered. If false, state 'Not applicable'.",
  "nicheFocusScore": <1-10>,
  "nicheFocusReason": "10 = extremely focused and vertical (e.g. exclusively Excel multilingual translation). Low = scattered unrelated topics.",
  "confidence": "high|medium|low",
  "reasoning": "Brief explanation of why this type was chosen",
  "metaSuggestions": ["Suggested improvement for site title", "Suggested improvement for meta description"]
}`;

export const APPROVAL_SUMMARY = `You are an experienced Google AdSense reviewer. Based on the audit report below, estimate the probability that this site will be approved by AdSense.

Current date: {{date}}
Reply language: {{langName}}. ALL text in the JSON output MUST be in {{langName}}. Do NOT use any other language.

=== Site Basic Info ===
URL: {{siteUrl}}
Site type: {{siteType}}
Site topic: {{siteTopic}}
Pages analyzed: {{pagesAnalyzed}} / {{totalDiscovered}}

=== Core Scoring Signals ===

Composite score: {{compositeScore}}/100
  = 页面价值({{pageValueScore}}) × 全站质量({{siteQuality}})/100 × 首页质量({{homeQuality}})/100

- 页面价值 (VOT): {{pageValueScore}}/100 — geometric mean of Value × Originality × Translation across all content pages (excluding required/utility pages). This is the core content quality signal.
{{pageValueNote}}

- 全站质量: {{siteQuality}}/100 — 硬性要求 + 内容质量 + 用户体验的通过率。良好的基础设施防止扣分，但不能让平庸内容变好。

- 首页质量: {{homeQuality}}/100 — 落地页检查（H1、内链、加载速度、移动端溢出、首页内容）的通过率。

=== Per-page AI Analysis ===
{{pageSummaries}}

Based on all the above, provide your expert assessment in {{langName}} with JSON:
{
  "analysis": "Step-by-step reasoning: (1) identify the strongest signals, (2) identify the weakest signals and bottlenecks, (3) consider whether content pages pass AdSense value tests, (4) weigh technical quality against content quality, (5) consider YMYL implications if applicable. Write your full analysis here BEFORE determining probability.",

  "probability": <0-100 integer, your estimated approval probability based on the analysis above>,
  "verdict": "<short verdict like 'Likely Pass' / 'Likely Fail' / 'Uncertain'>",
  "reasons": ["3-5 key reasons for your assessment"],
  "topActions": ["2-3 highest-impact actions the site owner should take first"],
  "detailedSummary": "<1-2 sentence paragraph summarizing the overall situation>"
}

Important:
- Be honest and critical — AdSense reviewers are thorough, so your assessment should be too.
- The composite formula is multiplicative: a weakness in any of the three signals directly reduces the total. Look at which signal is the bottleneck.
- If the site type is "tool", "game", or "video", consider whether there is sufficient supporting content beyond the core functionality.
- STRICTLY use {{langName}} for ALL string values in the JSON. No exceptions.
`;
