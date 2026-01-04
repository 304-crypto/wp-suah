// ═══════════════════════════════════════════════════════════
// 🎯 앱 상태 및 기본 타입
// ═══════════════════════════════════════════════════════════

export enum AppStatus {
  IDLE = 'IDLE',
  PROCESSING = 'PROCESSING',
  ERROR = 'ERROR'
}

// ═══════════════════════════════════════════════════════════
// 📦 WordPress 설정
// ═══════════════════════════════════════════════════════════

export interface WordPressConfig {
  siteUrl: string;
  username: string;
  applicationPassword: string;
  customInstruction?: string;
  defaultCategoryId?: string;
  enableAiImage?: boolean;
  aiImageCount?: number;
  adCode1?: string; // 광고 코드 1
  adCode2?: string; // 광고 코드 2
  defaultStatus?: 'draft' | 'publish' | 'future';
  publishInterval?: number; // 분 단위
  startTime?: string; // KST 시작 시간
  apiKeys?: string[]; // Gemini API 키 목록 (최대 10개)
  currentKeyIndex?: number; // 현재 사용 중인 키 인덱스
}

// ═══════════════════════════════════════════════════════════
// 🆕 멀티 사이트 프로필 관리
// ═══════════════════════════════════════════════════════════

export interface SiteProfile {
  id: string;
  name: string; // 사용자가 지정한 이름 (예: "메인 블로그", "credivita.com")
  config: WordPressConfig;
  createdAt: string;
  lastUsedAt: string;
}

export interface AppSettings {
  profiles: SiteProfile[];
  currentProfileId: string | null;
}

// ═══════════════════════════════════════════════════════════
// 📝 포스트 관련 타입
// ═══════════════════════════════════════════════════════════

export interface AuditResult {
  isHtmlValid: boolean;
  brokenUrls: string[];
  guidelineScore: number;
  aiReview: string;
  passed: boolean;
}

export interface GeneratedPost {
  id?: number;
  title: string;
  content: string;
  excerpt: string;
  status: 'draft' | 'publish' | 'future' | 'pending' | 'private';
  date?: string;
  thumbnailData?: string;
  featuredMediaUrl?: string;
  audit?: AuditResult;
  categories?: number[]; // 🆕 카테고리 ID 배열
}

export interface DashboardStats {
  unprocessed: number;
  localPending: number;
  wpDraft: number;
  wpFuture: number;
  wpPublish: number;
}

export interface BulkItem {
  topic: string;
  status: 'pending' | 'generating' | 'publishing' | 'completed' | 'failed';
  error?: string;
  result?: GeneratedPost;
  usedKeyIndex?: number;
  scheduledDate?: string;
}
