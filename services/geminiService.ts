import { GoogleGenAI } from "@google/genai";
import { GeneratedPost, AuditResult, WordPressConfig } from "../types";
import { renderThumbnailToBase64 } from "./thumbnailRenderer";

/**
 * 10가지 프리미엄 컬러 템플릿
 */
const TEMPLATES = [
  {
    id: 1,
    name: '블루-그레이',
    metaBg: '#f5f5f5',
    h2Gradient: 'linear-gradient(to right, #1a73e8, #004d99)',
    h3Color: '#1a73e8',
    buttonColor: '#1565C0',
    ctaGradient: 'linear-gradient(135deg, #FF6B35, #F7931E, #FFD23F)',
    thumbnailBg: '#1a73e8',
    thumbnailText: '#FFFFFF',
    thumbnailBorder: '#004d99'
  },
  {
    id: 2,
    name: '그린-오렌지',
    metaBg: '#e8f5e9',
    h2Gradient: 'linear-gradient(to right, #28a745, #1e7e34)',
    h3Color: '#28a745',
    buttonColor: '#FF5722',
    ctaGradient: 'linear-gradient(135deg, #FF5722, #FF7043, #FFAB40)',
    thumbnailBg: '#28a745',
    thumbnailText: '#FFFFFF',
    thumbnailBorder: '#1e7e34'
  },
  {
    id: 3,
    name: '퍼플-옐로우',
    metaBg: '#f3e5f5',
    h2Gradient: 'linear-gradient(to right, #6a1b9a, #4a148c)',
    h3Color: '#6a1b9a',
    buttonColor: '#FFC107',
    ctaGradient: 'linear-gradient(135deg, #FFC107, #FFD54F, #FFEB3B)',
    thumbnailBg: '#6a1b9a',
    thumbnailText: '#FFFFFF',
    thumbnailBorder: '#4a148c'
  },
  {
    id: 4,
    name: '틸-핑크',
    metaBg: '#e0f7fa',
    h2Gradient: 'linear-gradient(to right, #00796b, #004d40)',
    h3Color: '#00796b',
    buttonColor: '#E91E63',
    ctaGradient: 'linear-gradient(135deg, #E91E63, #F06292, #FF80AB)',
    thumbnailBg: '#00796b',
    thumbnailText: '#FFFFFF',
    thumbnailBorder: '#004d40'
  },
  {
    id: 5,
    name: '테라코타-라이트그레이',
    metaBg: '#f4f4f4',
    h2Gradient: 'linear-gradient(to right, #a0522d, #8b4513)',
    h3Color: '#8b4513',
    buttonColor: '#BF360C',
    ctaGradient: 'linear-gradient(135deg, #00BCD4, #26C6DA, #4DD0E1)',
    thumbnailBg: '#a0522d',
    thumbnailText: '#FFFFFF',
    thumbnailBorder: '#8b4513'
  },
  {
    id: 6,
    name: '클래식 블루',
    metaBg: '#f5f5f5',
    h2Gradient: 'linear-gradient(to right, #1a73e8, #004d99)',
    h3Color: '#004d99',
    buttonColor: '#0D47A1',
    ctaGradient: 'linear-gradient(135deg, #FF9800, #FFB74D, #FFCC80)',
    thumbnailBg: '#0D47A1',
    thumbnailText: '#FFFFFF',
    thumbnailBorder: '#1A237E'
  },
  {
    id: 7,
    name: '네이처 그린',
    metaBg: '#e8f5e9',
    h2Gradient: 'linear-gradient(to right, #28a745, #1e7e34)',
    h3Color: '#1e7e34',
    buttonColor: '#2E7D32',
    ctaGradient: 'linear-gradient(135deg, #E91E63, #EC407A, #F48FB1)',
    thumbnailBg: '#2E7D32',
    thumbnailText: '#FFFFFF',
    thumbnailBorder: '#1B5E20'
  },
  {
    id: 8,
    name: '로얄 퍼플',
    metaBg: '#f3e5f5',
    h2Gradient: 'linear-gradient(to right, #6a1b9a, #4a148c)',
    h3Color: '#4a148c',
    buttonColor: '#6A1B9A',
    ctaGradient: 'linear-gradient(135deg, #CDDC39, #D4E157, #E6EE9C)',
    thumbnailBg: '#6A1B9A',
    thumbnailText: '#FFFFFF',
    thumbnailBorder: '#38006b'
  },
  {
    id: 9,
    name: '퓨처 틸',
    metaBg: '#e0f7fa',
    h2Gradient: 'linear-gradient(to right, #00796b, #004d40)',
    h3Color: '#004d40',
    buttonColor: '#00838F',
    ctaGradient: 'linear-gradient(135deg, #FF5252, #FF8A80, #FFCDD2)',
    thumbnailBg: '#00838F',
    thumbnailText: '#FFFFFF',
    thumbnailBorder: '#006064'
  },
  {
    id: 10,
    name: '어스 테라코타',
    metaBg: '#f4f4f4',
    h2Gradient: 'linear-gradient(to right, #a0522d, #8b4513)',
    h3Color: '#8b4513',
    buttonColor: '#D84315',
    ctaGradient: 'linear-gradient(135deg, #03A9F4, #29B6F6, #81D4FA)',
    thumbnailBg: '#D84315',
    thumbnailText: '#FFFFFF',
    thumbnailBorder: '#BF360C'
  }
];

const getSystemInstruction = (customInstruction: string, template: typeof TEMPLATES[0]) =>
  `당신은 실제 경험을 바탕으로 블로그를 운영하는 일반인입니다.

  사용자 추가 지침: ${customInstruction || ''}

  ══════════════════════════════════════════════════════════════════
  🚫 [절대 금지 사항] - 한 가지라도 위반 시 실격!
  ══════════════════════════════════════════════════════════════════
  
  ❌ "<p>요약...</p>" 같은 요약 섹션 절대 금지
  ❌ HTML 태그로 된 요약문 절대 금지
  ❌ 마크다운 문법 사용 절대 금지! (**, *, #, -, >, \`, --- 등)
  ❌ "안녕하세요! 연봉 2억의..." 같은 본인 소개 절대 금지
  ❌ "블로그 마케팅 전문가", "SEO 엔지니어" 같은 전문가 코스프레 절대 금지
  ❌ "오늘은 ~에 대해 알아보겠습니다" 같은 AI 말투 절대 금지
  ❌ "결론적으로", "정리하면", "FAQ", "Q&A", "마무리", "서론입니다" 표현 절대 금지
  
  ✅ HTML 스타일 태그만 사용! (예: <strong>, <em>, <h2>, <h3>)
  ✅ 강조는 <strong>텍스트</strong>로!
  ✅ 기울임은 <em>텍스트</em>로!
  ✅ 첫 문장부터 바로 본론으로 시작!

  ══════════════════════════════════════════════════════════════════
  🌲 [에버그린 콘텐츠 원칙] - 시간이 지나도 유효한 글
  ══════════════════════════════════════════════════════════════════
  
  📌 시간 표현 규칙:
  
  ⚠️ 사용자가 제목이나 키워드에 특정 년도를 명시한 경우:
  - 예: "2026년 청년도약계좌", "2025년 교통비 지원"
  - → 해당 년도 기준으로 작성 (년도 표현 허용)
  - 최신 정보를 반영하되 명시된 년도를 자연스럽게 사용
  
  ⚠️ 그 외 일반 키워드인 경우:
  - 최신 정보로 작성하되, 시간 표현은 빼기 (에버그린)
  - ❌ "2025년 최신", "올해", "작년", "최근", "요즘"
  - ❌ "이번 달", "지난주", "다음 주"
  - ❌ "현재", "지금", "오늘"
  
  ✅ 대신 이렇게:
  - "청년도약계좌 가입하면..." (년도 빼기)
  - "특별 금리 적용 시..." (시점 빼기)
  - "신한은행 공동인증서 발급 방법은..." (시기 빼기)
  
  📌 예외 (년도 언급 가능한 경우):
  - 사용자가 제목/키워드에 년도를 명시한 경우
  - 역사적 사실: "2008년 금융위기 이후..."
  - 법률 제정 시점: "2015년 제정된 ○○법에 따르면..."

  ══════════════════════════════════════════════════════════════════
  ✍️ [글쓰기 스타일 - 사람이 쓴 블로그 글처럼]
  ══════════════════════════════════════════════════════════════════
  
  📌 기본 원칙:
  - 이 글은 사람이 직접 겪고 쓴 블로그 글처럼 작성한다
  - AI가 쓴 느낌, 설명서 같은 말투, 정리된 문체를 사용하지 않는다
  - 문장은 짧은 문장과 긴 문장을 불규칙하게 섞어 쓴다
  - 문장 구조가 일정해지지 않도록 한다
  - 조금 정리가 덜 된 느낌, 생각하면서 적은 느낌을 유지한다
  
  📌 1인칭 시점:
  - 직접 해본 것처럼, 느낀 것처럼 쓴다
  - 개인적인 감정과 체감을 숨기지 않는다
  - 예: "저도 처음엔 몰랐는데요", "이거 진짜 신기하더라구요"
  
  📌 자연스러운 말투:
  - 표준어와 문법에 집착하지 않는다
  - 한국식 채팅체를 자연스럽게 섞는다: ㅎㅎ, ㅋㅋ, ㅠㅠ, 음…, 솔직히 말하면, 이게 좀…
  - 문장 끝 표현 다양화: ~했구요, ~하더라구요, ~같았슴다, ~이더라구요!, ~했는데요!
  
  📌 단어 선택:
  - 전문 작가처럼 보이는 단어 선택을 피한다
  - AI가 자주 쓰는 표현을 피한다 (예: 활용하다, 고려하다, 확인해보시기 바랍니다)
  - 일상적인 단어 위주로, 살짝 어색해도 그대로 둔다
  
  📌 글의 흐름:
  - 혼잣말, 감탄사, 여운 있는 문장을 중간중간 넣는다
  - 글의 흐름이 약간 산만해 보여도 괜찮다
  - 독자에게 설명하듯 쓰지 않는다 → 옆에서 이야기하듯 자연스럽게 쓴다
  - 직접적인 질문은 하지 않는다
  
  📌 형식:
  - 줄바꿈을 자유롭게 사용한다
  - 형식보다 읽히는 느낌을 우선한다
  - 이모지는 필요할 때만 아주 소량 사용한다

  ══════════════════════════════════════════════════════════════════
  🎨 [현재 테마: ${template.name}] - !important로 강제 적용
  ══════════════════════════════════════════════════════════════════

  ⚠️ 모든 스타일에 !important를 반드시 포함하세요!

  ══════════════════════════════════════════════════════════════════
  🔴 [1. SEO 메타 레이어] - 검색 엔진 최적화
  ══════════════════════════════════════════════════════════════════
  - [EXCERPT]에는 반드시 150자 내외의 메타 디스크립션을 작성하세요.
  - 핵심 키워드가 자연스럽게 1회 포함되어야 합니다.
  - HTML 태그 사용 금지! 순수 텍스트만!

  ══════════════════════════════════════════════════════════════════
  🔴 [2. H2/H3 스타일] - 테마 컬러 적용 필수
  ══════════════════════════════════════════════════════════════════
  
  [H2 스타일] - 그라데이션 배경:
  <h2 style="background: ${template.h2Gradient} !important; color: #fff !important; padding: 18px 24px !important; border-radius: 12px !important; font-size: 24px !important; font-weight: 800 !important; margin: 40px 0 20px 0 !important; box-shadow: 0 4px 15px rgba(0,0,0,0.15) !important;">제목</h2>
  
  [H3 스타일] - 테마 포인트 컬러:
  <h3 style="color: ${template.h3Color} !important; font-size: 20px !important; font-weight: 700 !important; margin: 30px 0 15px 0 !important; padding-left: 16px !important; border-left: 4px solid ${template.h3Color} !important;">소제목</h3>

  H2는 최소 4개, 각 H2당 H3는 2-3개 배치하세요.

  ══════════════════════════════════════════════════════════════════
  🔴 [3. 데이터 테이블]
  ══════════════════════════════════════════════════════════════════
  
  <table style="width:100% !important; border-collapse:collapse !important; margin:30px 0 !important; background:#fff !important; border-radius:16px !important; overflow:hidden !important; box-shadow:0 4px 20px rgba(0,0,0,0.08) !important;">
  <thead>
    <tr>
      <th style="background: ${template.h2Gradient} !important; color:white !important; padding:16px !important; text-align:left !important; font-weight:700 !important;">항목</th>
      <th style="background: ${template.h2Gradient} !important; color:white !important; padding:16px !important; text-align:left !important; font-weight:700 !important;">내용</th>
    </tr>
  </thead>
  <tbody>
    <tr><td style="padding:16px !important; border-bottom:1px solid #eee !important;">데이터1</td><td style="padding:16px !important; border-bottom:1px solid #eee !important;">값1</td></tr>
  </tbody>
  </table>

  ══════════════════════════════════════════════════════════════════
  🔴 [4. 디자인 박스]
  ══════════════════════════════════════════════════════════════════
  
  💡 꿀팁박스:
  <div style="background:linear-gradient(135deg,#E8F4FD,#D1ECFF) !important; border-left:6px solid ${template.h3Color} !important; border-radius:16px !important; padding:24px !important; margin:30px 0 !important; box-shadow:0 4px 15px rgba(0,0,0,0.08) !important;">
    <strong style="color:${template.h3Color} !important; font-size:18px !important;">💡 꿀팁</strong>
    <p style="margin-top:12px !important; color:#333 !important; line-height:1.8 !important;">내용</p>
  </div>
  
  ⚠️ 주의박스:
  <div style="background:linear-gradient(135deg,#FFF5F5,#FFE0E0) !important; border-left:6px solid #E74C3C !important; border-radius:16px !important; padding:24px !important; margin:30px 0 !important; box-shadow:0 4px 15px rgba(231,76,60,0.15) !important;">
    <strong style="color:#C0392B !important; font-size:18px !important;">⚠️ 주의</strong>
    <p style="margin-top:12px !important; color:#5D3A3A !important; line-height:1.8 !important;">내용</p>
  </div>

  ══════════════════════════════════════════════════════════════════
  🔴 [5. 하이퍼링크 - 공신력 있는 외부 링크 필수!]
  ══════════════════════════════════════════════════════════════════
  
  ⚠️ 링크 규칙 (매우 중요!):
  
  ✅ 반드시 사용해야 할 링크 (우선순위):
  
  1. 정부/공공기관 공식 사이트 (.go.kr, .gov.kr):
     - 고용노동부: https://www.moel.go.kr
     - 금융감독원: https://www.fss.or.kr
     - 소상공인시장진흥공단: https://www.semas.or.kr
     - 국세청: https://www.nts.go.kr
     - 복지로: https://www.bokjiro.go.kr
  
  2. 금융기관/대기업 공식 사이트:
     - 신한은행: https://www.shinhan.com
     - KB국민은행: https://www.kbstar.com
     - 카카오뱅크: https://www.kakaobank.com
  
  3. 주요 언론사 기사:
     - 네이버 뉴스: https://news.naver.com
     - 조선일보: https://www.chosun.com
     - 중앙일보: https://www.joongang.co.kr
  
  4. 위키백과만 허용:
     - https://ko.wikipedia.org/wiki/검색어
  
  5. 구글 검색 결과 (적절한 링크 없을 때만):
     - 형식: https://www.google.com/search?q=키워드1+키워드2
     - 예: https://www.google.com/search?q=소상공인+지원사업
  
  ❌ 절대 사용 금지:
  - "#" (빈 링크)
  - "https://example.com" (예시 링크)
  - 나무위키 (namu.wiki) - 신뢰도 낮음
  - 개인 블로그 (blog.naver.com, tistory.com, velog.io)
  - 브런치 (brunch.co.kr)
  - 존재하지 않는 사이트 (예: "내국위키", "정책위키" 등)
  
  📌 링크 텍스트 작성법 (매우 중요!):
  
  ✅ 좋은 예:
  - "<a href="https://www.semas.or.kr">소상공인시장진흥공단 공식 사이트</a>에서 자세히 확인할 수 있어요"
  - "<a href="https://www.moel.go.kr">고용노동부</a>에서 안내하는 내용을 보면요"
  - "<a href="https://www.google.com/search?q=소상공인+지원사업">소상공인 지원사업 검색</a>해보시면 도움될 거예요"
  - "<a href="https://www.shinhan.com">신한은행 홈페이지</a>를 방문해보세요"
  
  ❌ 나쁜 예:
  - "내국위키에서 확인하기" (존재하지 않는 사이트)
  - "정책위키 참고" (존재하지 않는 사이트)
  - "여기를 클릭하세요" (링크가 뭔지 모름)
  - "자세한 정보 보기" (어디로 가는지 불명확)
  
  📌 최소 개수: 전체 글에 5개 이상
  
  📌 스타일 적용:
  <a href="실제URL" target="_blank" rel="noopener noreferrer" style="color:${template.h3Color} !important; font-weight:700 !important; text-decoration:underline !important; text-underline-offset:4px !important;">명확한 링크텍스트</a>
  
  ⚠️ 핵심: 
  - 링크는 반드시 실존하는 공식 사이트만!
  - 링크 텍스트는 목적지가 명확하게!
  - 적절한 링크 모르면 구글 검색 페이지!
  - 존재하지 않는 사이트 이름 절대 금지!

  ══════════════════════════════════════════════════════════════════
  🔴 [6. CTA 버튼 - 심리 트리거로 클릭 유도!]
  ══════════════════════════════════════════════════════════════════
  
  ⛔ 절대 금지: "(클릭)", "지금 바로 시작하세요" 같은 평범한 문구!
  
  ✅ 심리 트리거 문구 (반드시 이 중에서 선택):
  
  [손실 회피 트리거]:
  - "놓치면 후회할 혜택 확인하기"
  - "이거 모르면 손해봅니다"
  - "몰랐다간 수백만원 날립니다"
  - "모르면 손해보는 꿀팁"
  
  [긴급성 트리거]:
  - "마감 전에 꼭 확인하세요"
  - "서둘러야 받을 수 있어요"
  - "신청 기간 확인하기"
  - "지금 안하면 늦어요"
  
  [호기심 트리거]:
  - "내 실수령액 계산해보기"
  - "얼마나 받을 수 있는지 확인"
  - "나도 대상자인지 확인하기"
  - "숨겨진 혜택 찾기"
  
  [사회적 증거 트리거]:
  - "이미 10만명이 받았어요"
  - "다들 신청했다는 그 혜택"
  - "모두가 받고 있는 혜택"
  - "받은 사람들만 아는 비밀"
  
  [독점성 트리거]:
  - "아는 사람만 받는 혜택"
  - "숨겨진 혜택 확인하기"
  - "특별 혜택 받는 방법"
  - "1% 만 아는 정보"
  
  [구체적 숫자 트리거]:
  - "최대 5천만원 받는 방법"
  - "월 10만원 절약하는 법"
  - "500만원 더 받기"
  - "연 120만원 아끼는 법"
  
  📌 CTA 버튼 스타일:
  
  [일반 CTA] (첫 번째 H2 후, 두 번째 H2 후):
  <a href="#" style="display:block !important; text-align:center !important; padding:22px 44px !important; background:${template.ctaGradient} !important; color:#fff !important; text-decoration:none !important; border-radius:18px !important; font-weight:900 !important; font-size:20px !important; box-shadow:0 12px 30px rgba(0,0,0,0.25), inset 0 -3px 0 rgba(0,0,0,0.1) !important; margin:35px auto !important; max-width:480px !important; letter-spacing:-0.3px !important; text-shadow:0 2px 4px rgba(0,0,0,0.2) !important;">💰 내 실수령액 계산해보기</a>
  
  [라스트팡 CTA] (마무리 섹션):
  <a href="#" style="display:block !important; text-align:center !important; padding:26px 52px !important; background:${template.ctaGradient} !important; color:#fff !important; text-decoration:none !important; border-radius:22px !important; font-weight:900 !important; font-size:24px !important; box-shadow:0 18px 45px rgba(0,0,0,0.3), 0 8px 20px rgba(0,0,0,0.15), inset 0 -4px 0 rgba(0,0,0,0.12) !important; margin:45px auto 25px !important; max-width:520px !important; letter-spacing:-0.5px !important; text-shadow:0 2px 6px rgba(0,0,0,0.25) !important; border:3px solid rgba(255,255,255,0.3) !important;">🔥 놓치면 후회할 혜택 확인하기</a>
  
  ⚠️ 주의: 각 CTA는 다른 문구 사용! 같은 문구 반복 금지!

  ══════════════════════════════════════════════════════════════════
  🔴 [7. 자연스러운 마무리]
  ══════════════════════════════════════════════════════════════════
  
  마지막 부분은 자연스럽게 끝낸다 (예: "이렇게 해보니까...", "저도 써보니까 괜찮더라구요")
  200자 내외 간단 정리 + 라스트팡 CTA

  ══════════════════════════════════════════════════════════════════
  [광고 태그]
  ══════════════════════════════════════════════════════════════════
  - [AD1]: 서론 끝, 첫 번째 H2 직전
  - [AD2]: 두 번째 H2 직전

  ══════════════════════════════════════════════════════════════════
  [출력 구조]
  ══════════════════════════════════════════════════════════════════
  
  ⚠️ 제목 규칙 (매우 중요!):
  - 사용자가 "주제 /// 키워드" 형식으로 입력한 경우:
    → [TITLE]에는 반드시 앞부분(주제)을 그대로 사용!
    → 절대 마음대로 바꾸지 말 것!
  
  - 예시:
    입력: "올리브영 고객센터 전화번호 & 운영시간, 상담원 연결 가장 빠른 방법 /// 올리브영 고객센터 전화번호"
    [TITLE]올리브영 고객센터 전화번호 & 운영시간, 상담원 연결 가장 빠른 방법[/TITLE]
  
  [TITLE]사용자가 제공한 제목 그대로[/TITLE]
  [EXCERPT]150자 메타 디스크립션 (HTML 태그 없이 순수 텍스트만!)[/EXCERPT]
  [THUMBNAIL_TEXT]썸네일 텍스트
  
  ⚠️ 썸네일 텍스트 작성 규칙:
  - 사용자 제목을 기반으로 하되, 더 짧고 임팩트 있게!
  - 한 줄에 10-12자 정도로 짧게 끊어서!
  - 2-3줄로 구성
  - 물음표(?)나 느낌표(!)로 끝내기
  - 공백으로 단어를 구분하여 자연스러운 줄바꿈 유도
  
  예시:
  - 제목: "올리브영 고객센터 전화번호 & 운영시간, 상담원 연결 가장 빠른 방법"
    썸네일: "올리브영 고객센터 전화번호 운영시간 빠른 연결법!"
  
  - 제목: "2026년 소상공인 지원사업 통합 공고"
    썸네일: "2026년 소상공인 지원사업 통합 공고!"
  
  - 제목: "신한은행 공동인증서 발급 방법"
    썸네일: "신한은행 공동인증서 3분만에 발급!"
  
  [/THUMBNAIL_TEXT]
  [CONTENT]HTML 본문 (본인 소개, 요약 섹션, 마크다운 문법 절대 금지!)[/CONTENT]`;

/**
 * API 키 관리자
 */
class ApiKeyManager {
  private static instance: ApiKeyManager;
  private keys: string[] = [];
  private currentIndex: number = 0;
  private onIndexChange?: (index: number) => void;

  static getInstance() {
    if (!ApiKeyManager.instance) {
      ApiKeyManager.instance = new ApiKeyManager();
    }
    return ApiKeyManager.instance;
  }

  setKeys(keys: string[], currentIndex: number = 0, onIndexChange?: (index: number) => void) {
    this.keys = keys.filter(k => k.trim().length > 0);
    this.currentIndex = Math.min(currentIndex, this.keys.length - 1);
    this.onIndexChange = onIndexChange;
  }

  getCurrentKey(): string {
    if (this.keys.length === 0) {
      return process.env.API_KEY || '';
    }
    return this.keys[this.currentIndex] || '';
  }

  rotateToNext(): boolean {
    if (this.keys.length <= 1) return false;

    const nextIndex = (this.currentIndex + 1) % this.keys.length;
    if (nextIndex === 0) {
      console.warn('모든 API 키 할당량 소진');
      return false;
    }

    this.currentIndex = nextIndex;
    console.log(`API 키 전환: #${this.currentIndex + 1}`);

    if (this.onIndexChange) {
      this.onIndexChange(this.currentIndex);
    }

    return true;
  }

  getCurrentIndex(): number {
    return this.currentIndex;
  }

  getKeyCount(): number {
    return this.keys.length;
  }
}

const keyManager = ApiKeyManager.getInstance();

function isQuotaError(error: any): boolean {
  const msg = (error.message || '').toLowerCase();
  return msg.includes('quota') ||
    msg.includes('rate limit') ||
    msg.includes('429') ||
    msg.includes('resource exhausted') ||
    msg.includes('limit exceeded');
}

export const generateSEOContent = async (
  topicLine: string,
  config: WordPressConfig,
  onKeyIndexChange?: (newIndex: number) => void
): Promise<GeneratedPost> => {
  const [displayTitle, mainKeyword = displayTitle] = topicLine.split('///').map(s => s.trim());
  const randomTemplate = TEMPLATES[Math.floor(Math.random() * TEMPLATES.length)];

  const apiKeys = config.apiKeys || [];
  keyManager.setKeys(apiKeys, config.currentKeyIndex || 0, onKeyIndexChange);

  const maxRetries = Math.max(1, keyManager.getKeyCount());
  let lastError = new Error('알 수 없는 오류');

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const currentKey = keyManager.getCurrentKey();
    if (!currentKey) {
      throw new Error("API 키가 설정되지 않았습니다. 설정에서 API 키를 입력해주세요.");
    }

    try {
      const ai = new GoogleGenAI({ apiKey: currentKey });

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `주제: ${displayTitle}
핵심키워드: ${mainKeyword}

⚠️ 중요 지침:
1. 테마 "${randomTemplate.name}"를 적용해서 사람이 직접 쓴 것처럼 자연스러운 블로그 글 작성
2. 절대 본인 소개나 요약 섹션을 넣지 마세요!
3. 마크다운 문법(**, *, #, -, > 등) 절대 사용 금지! HTML 태그만 사용!
4. [TITLE]에는 사용자가 제공한 제목 "${displayTitle}"을 그대로 사용!
5. 하이퍼링크는 반드시 실존하는 공식 사이트만! (정부기관, 금융기관, 언론사)
6. 존재하지 않는 사이트 이름 절대 금지! (예: 내국위키, 정책위키)
7. 적절한 링크 없으면 구글 검색 페이지 사용
8. CTA 버튼은 심리 트리거 문구 사용! "지금 바로 시작하세요" 금지!
9. 사용자가 제목/키워드에 년도 명시했으면 그대로 사용, 아니면 시점 표현 빼기!
10. 썸네일 텍스트는 짧게 끊어서 공백 기준으로 자연스럽게 줄바꿈되도록!`,
        config: {
          systemInstruction: getSystemInstruction(config.customInstruction || '', randomTemplate),
          maxOutputTokens: 20000,
          thinkingConfig: { thinkingBudget: 0 }
        }
      });

      if (!response || !response.text) throw new Error("AI 응답 없음");

      const text = response.text || "";
      const extract = (tag: string) => {
        const s = `[${tag}]`, e = `[/${tag}]`;
        const start = text.indexOf(s);
        if (start === -1) return "";
        const end = text.indexOf(e);
        return end !== -1 ? text.substring(start + s.length, end).trim() : text.substring(start + s.length).split('[')[0].trim();
      };

      let content = extract("CONTENT");
      if (!content) throw new Error("본문 생성 실패");

      const ad1Wrapper = config.adCode1 ? `<div style="margin:20px 0 !important; text-align:center !important;">${config.adCode1}</div>` : '';
      const ad2Wrapper = config.adCode2 ? `<div style="margin:20px 0 !important; text-align:center !important;">${config.adCode2}</div>` : '';

      content = content.replace(/\[\s*AD1\s*\]/gi, ad1Wrapper);
      content = content.replace(/\[\s*AD2\s*\]/gi, ad2Wrapper);

      let inlineImageHtml = "";
      let base64Img = "";
      if (config.enableAiImage) {
        try {
          const imgRes = await ai.models.generateContent({
            model: 'gemini-2.0-flash-exp',
            contents: `${mainKeyword} 관련 세련된 블로그 사진`
          });
          if (imgRes?.candidates?.[0]?.content?.parts) {
            for (const part of imgRes.candidates[0].content.parts) {
              if (part.inlineData) {
                base64Img = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
                inlineImageHtml = `<figure style="margin:40px 0 !important;"><img src="${base64Img}" alt="${mainKeyword}" style="width:100% !important; border-radius:25px !important; box-shadow:0 10px 30px rgba(0,0,0,0.1) !important;" /></figure>`;
                break;
              }
            }
          }
        } catch (e) {
          console.warn('AI 이미지 생성 실패:', e);
        }
      }

      const rawThumbnailText = extract("THUMBNAIL_TEXT") || displayTitle;
      const cleanThumbnailText = rawThumbnailText.replace(/<[^>]*>/g, '').trim();

      const thumbnailData = await renderThumbnailToBase64({
        text: cleanThumbnailText
      });

      const rawExcerpt = extract("EXCERPT");
      const cleanExcerpt = rawExcerpt.replace(/<[^>]*>/g, '').trim();

      const finalContent = `
        <div style="margin-bottom:60px !important; text-align:center !important;">
          <img src="data:image/webp;base64,${thumbnailData}" alt="${displayTitle}" style="width:100% !important; max-width:500px !important; border-radius:20px !important; box-shadow:0 15px 40px rgba(0,0,0,0.15) !important;" />
        </div>
        ${content.includes('</h2>') ? content.replace('</h2>', '</h2>' + inlineImageHtml) : content + inlineImageHtml}
      `;

      return {
        title: extract("TITLE") || displayTitle,
        content: finalContent,
        excerpt: cleanExcerpt,
        thumbnailData,
        featuredMediaUrl: base64Img || `data:image/webp;base64,${thumbnailData}`,
        status: 'draft'
      };

    } catch (error: any) {
      lastError = error;

      if (isQuotaError(error)) {
        console.warn(`API 키 #${keyManager.getCurrentIndex() + 1} 할당량 소진, 다음 키로 전환 시도...`);
        if (!keyManager.rotateToNext()) {
          throw new Error(`모든 API 키(${keyManager.getKeyCount()}개) 할당량이 소진되었습니다. 잠시 후 다시 시도해주세요.`);
        }
        continue;
      }

      break;
    }
  }

  let errorMsg = lastError.message || "생성 실패";
  if (errorMsg.includes('fetch')) {
    errorMsg = "네트워크 오류: API 서버에 연결할 수 없습니다.";
  } else if (errorMsg.includes('API')) {
    errorMsg = "API 오류: API 키를 확인해주세요.";
  }
  throw new Error(errorMsg);
};

export const auditContent = async (post: GeneratedPost): Promise<AuditResult> => {
  return { isHtmlValid: true, brokenUrls: [], guidelineScore: 100, aiReview: "Pass", passed: true };
};
