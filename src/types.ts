export type AnalysisType = 'page' | 'compliance' | 'topic' | 'approval';

export type PageType =
  | 'homepage' | 'listing' | 'content' | 'game_detail' | 'tool_detail' | 'video_detail'
  | 'reference_detail' | 'required' | 'utility';

export type SiteType = 'content' | 'tool' | 'game' | 'video' | 'reference' | 'unsupported';

export interface AnalyzePageRequest {
  content: string;
  url: string;
  lang?: string;
  pageLanguage?: string;
  embedSignal?: 'game' | 'tool' | 'video' | 'none';
  siteTopic?: { topic: string; type: string; description: string };
  listingSignals?: { listItems: number; hasPagination: boolean; hasCategories: boolean; hasSearch: boolean };
  model?: string;
  modelApiBase?: string;
  modelApiKey?: string;
}

export interface AnalyzePageResponse {
  pageType: PageType | string;
  evaluation_details: {
    value: number;
    value_reason: string;
    originality: number;
    originality_reason: string;
    relevance: number;
    relevance_reason: string;
    relevanceLabel: string;
    compliance: number;
    compliance_reason: string;
    translation: number;
    translation_reason: string;
  };
  confidence: 'high' | 'medium' | 'low';
  assessment: string;
  suggestions: string[];
}

export interface ComplianceRecheckRequest {
  content: string;
  url: string;
  firstScore: number;
  lang?: string;
  model?: string;
  modelApiBase?: string;
  modelApiKey?: string;
}

export interface ComplianceRecheckResponse {
  compliance_reason: string;
  compliance: number;
  verdict: 'compliant' | 'borderline' | 'violation' | string;
  assessment: string;
}

export interface TopicAnalysisRequest {
  title: string;
  metaDescription: string;
  navText: string;
  content: string;
  lang?: string;
  model?: string;
  modelApiBase?: string;
  modelApiKey?: string;
}

export interface TopicAnalysisResponse {
  type: SiteType | string;
  topic: string;
  description: string;
  isYMYL: boolean;
  YMYL_reason: string;
  nicheFocusScore: number;
  nicheFocusReason: string;
  confidence: 'high' | 'medium' | 'low';
  reasoning: string;
  metaSuggestions: string[];
}

export interface ApprovalAnalysisRequest {
  siteUrl: string;
  siteType: string;
  siteTopic: string;
  pagesAnalyzed: number;
  totalDiscovered: number;
  compositeScore: number;
  pageValueScore: number;
  siteQuality: number;
  homeQuality: number;
  pageValueNote?: string;
  pageSummaries: string;
  lang?: string;
  expert?: boolean;
  model?: string;
  modelApiBase?: string;
  modelApiKey?: string;
}

export interface ApprovalAnalysisResponse {
  analysis: string;
  probability: number;
  verdict: string;
  reasons: string[];
  topActions: string[];
  detailedSummary: string;
}

export interface ApiErrorResponse {
  error: string;
  code: string;
}
