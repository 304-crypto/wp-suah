
import { WordPressConfig, GeneratedPost, DashboardStats } from "../types";

/**
 * WordPress REST API 서비스
 * - URL 자동 보정
 * - CORS 예외 처리
 * - 상세 에러 메시지
 */

const getAuthHeader = (config: WordPressConfig) => {
  const user = config.username.trim();
  const pass = config.applicationPassword.replace(/\s/g, "");
  return { "Authorization": `Basic ${btoa(`${user}:${pass}`)}` };
};

/**
 * URL 자동 보정 - HTTPS 강제, 후행 슬래시 제거
 */
const getBaseUrl = (url: string): string => {
  if (!url) return "";
  let cleanUrl = url.trim()
    .replace(/\/+$/, "")  // 후행 슬래시 제거
    .replace(/^\/+/, ""); // 선행 슬래시 제거

  // 프로토콜 없으면 https 추가
  if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
    cleanUrl = 'https://' + cleanUrl;
  }

  // http를 https로 자동 변환 (보안 강화)
  cleanUrl = cleanUrl.replace(/^http:\/\//i, 'https://');

  // URL 유효성 검사
  try {
    new URL(cleanUrl);
  } catch {
    throw new Error("유효하지 않은 사이트 주소입니다.");
  }

  return cleanUrl;
};

/**
 * 에러 메시지 상세화
 */
const getDetailedError = (error: any, context: string): string => {
  const msg = error.message || String(error);

  if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('fetch')) {
    return `네트워크 오류 (${context}): 사이트에 연결할 수 없습니다.\n\n해결 방법:\n1. 인터넷 연결 확인\n2. 사이트 주소가 올바른지 확인\n3. 사이트가 HTTPS를 사용하는지 확인\n4. 방화벽/보안 프로그램 확인`;
  }

  if (msg.includes('CORS') || msg.includes('cross-origin')) {
    return `CORS 오류 (${context}): 브라우저 보안 정책으로 인해 요청이 차단되었습니다.\n\n해결 방법:\n1. WordPress에 CORS 플러그인 설치 (WP CORS 등)\n2. .htaccess 또는 nginx 설정에 CORS 헤더 추가`;
  }

  return `${context} 실패: ${msg}`;
};

/**
 * 연결 테스트
 */
export const testWordPressConnection = async (config: WordPressConfig): Promise<{ ok: boolean, message: string }> => {
  try {
    const baseUrl = getBaseUrl(config.siteUrl);

    const response = await fetch(`${baseUrl}/wp-json/wp/v2/users/me`, {
      method: "GET",
      headers: {
        ...getAuthHeader(config),
        'Content-Type': 'application/json'
      },
      mode: 'cors'
    });

    if (response.ok) {
      const user = await response.json();
      return { ok: true, message: `✅ 연결 성공! (${user.name || user.slug})` };
    }

    if (response.status === 401 || response.status === 403) {
      return { ok: false, message: "❌ 인증 실패: 아이디 또는 앱 비밀번호를 확인하세요.\n\n앱 비밀번호는 WordPress 관리자 → 사용자 → 프로필 → 애플리케이션 비밀번호에서 생성합니다." };
    }

    if (response.status === 404) {
      return { ok: false, message: "❌ REST API를 찾을 수 없습니다.\n\n확인사항:\n1. 사이트 주소가 올바른지\n2. REST API가 활성화되어 있는지\n3. 보안 플러그인이 API를 차단하지 않는지" };
    }

    return { ok: false, message: `❌ 오류 (${response.status}): ${response.statusText || '알 수 없는 오류'}` };

  } catch (e: any) {
    return { ok: false, message: getDetailedError(e, "연결 테스트") };
  }
};

/**
 * 발행 통계 조회
 */
export const fetchPostStats = async (config: WordPressConfig): Promise<Pick<DashboardStats, 'wpDraft' | 'wpFuture' | 'wpPublish'>> => {
  const defaultStats = { wpDraft: 0, wpFuture: 0, wpPublish: 0 };

  try {
    const baseUrl = getBaseUrl(config.siteUrl);
    const statuses = ['draft', 'future', 'publish'];

    const counts = await Promise.all(statuses.map(async (status) => {
      try {
        const response = await fetch(`${baseUrl}/wp-json/wp/v2/posts?status=${status}&per_page=1`, {
          method: "GET",
          headers: { ...getAuthHeader(config) },
          mode: 'cors'
        });

        if (!response.ok) return 0;
        return parseInt(response.headers.get('X-WP-Total') || '0');
      } catch {
        return 0;
      }
    }));

    return { wpDraft: counts[0], wpFuture: counts[1], wpPublish: counts[2] };
  } catch {
    return defaultStats;
  }
};

/**
 * 포스트 발행
 */
export const publishToWordPress = async (config: WordPressConfig, post: GeneratedPost) => {
  try {
    const baseUrl = getBaseUrl(config.siteUrl);

    // 카테고리 결정: post.categories > config.defaultCategoryId > 빈 배열
    let categories: number[] = [];
    if (post.categories && post.categories.length > 0) {
      categories = post.categories;
    } else if (config.defaultCategoryId) {
      const catId = parseInt(config.defaultCategoryId);
      if (!isNaN(catId)) {
        categories = [catId];
      }
    }

    const response = await fetch(`${baseUrl}/wp-json/wp/v2/posts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeader(config)
      },
      body: JSON.stringify({
        title: post.title,
        content: post.content,
        excerpt: post.excerpt,
        status: post.status,
        date: post.date,
        categories: categories
      }),
      mode: 'cors'
    });

    if (!response.ok) {
      const errorBody = await response.text();
      let errorMsg = `발행 실패 (${response.status})`;

      try {
        const errorJson = JSON.parse(errorBody);
        errorMsg = errorJson.message || errorMsg;
      } catch { }

      if (response.status === 401 || response.status === 403) {
        errorMsg = "인증 실패: 앱 비밀번호를 확인하세요.";
      } else if (response.status === 400) {
        errorMsg = "잘못된 요청: 글 내용을 확인하세요.";
      }

      throw new Error(errorMsg);
    }

    return await response.json();

  } catch (e: any) {
    throw new Error(getDetailedError(e, "발행"));
  }
};

/**
 * 예약/발행된 글 목록 조회
 */
export const fetchScheduledPosts = async (config: WordPressConfig): Promise<GeneratedPost[]> => {
  try {
    const baseUrl = getBaseUrl(config.siteUrl);

    const response = await fetch(`${baseUrl}/wp-json/wp/v2/posts?status=future,draft,publish&per_page=20&_embed&orderby=date&order=desc`, {
      method: "GET",
      headers: { ...getAuthHeader(config) },
      mode: 'cors'
    });

    if (!response.ok) return [];

    const posts = await response.json();

    if (!Array.isArray(posts)) return [];

    return posts.map((p: any) => ({
      id: p.id,
      title: p.title?.rendered || '(제목 없음)',
      content: p.content?.rendered || '',
      excerpt: p.excerpt?.rendered || '',
      status: p.status,
      date: p.date,
      featuredMediaUrl: p._embedded?.['wp:featuredmedia']?.[0]?.source_url,
      categories: p.categories || []
    }));

  } catch {
    return [];
  }
};

/**
 * 이미지를 WordPress 미디어 라이브러리에 업로드
 * FIFU 플러그인 호환을 위해 실제 URL 반환
 */
export const uploadMediaToWordPress = async (
  config: WordPressConfig,
  base64Data: string,
  filename: string
): Promise<string | null> => {
  try {
    const baseUrl = getBaseUrl(config.siteUrl);

    // base64 데이터에서 실제 바이너리 추출
    const base64Content = base64Data.replace(/^data:image\/\w+;base64,/, '');
    const binaryString = atob(base64Content);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: 'image/webp' });

    // FormData로 파일 업로드
    const formData = new FormData();
    formData.append('file', blob, `${filename}.webp`);

    const response = await fetch(`${baseUrl}/wp-json/wp/v2/media`, {
      method: 'POST',
      headers: {
        ...getAuthHeader(config)
        // Content-Type은 FormData가 자동 설정
      },
      body: formData,
      mode: 'cors'
    });

    if (!response.ok) {
      console.warn('미디어 업로드 실패:', response.status);
      return null;
    }

    const media = await response.json();
    console.log('✅ 미디어 업로드 성공:', media.source_url);
    return media.source_url;

  } catch (e) {
    console.warn('미디어 업로드 오류:', e);
    return null;
  }
};
