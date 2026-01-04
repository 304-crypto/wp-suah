<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Gem SEO Pro - AI 기반 SEO 콘텐츠 자동 발행기

WordPress 연동 SEO 최적화 콘텐츠 자동 생성 및 예약 발행 시스템

## 주요 기능

- 🤖 **AI 콘텐츠 생성**: Gemini API 기반 SEO 최적화 콘텐츠 자동 생성
- 📅 **예약 발행**: 한국표준시(KST) 기반 시간 설정, 발행 간격 조절
- 🎨 **자동 썸네일**: 500x500 고대비 WebP 썸네일 자동 생성
- 📊 **실시간 통계**: WordPress 발행/예약/임시저장 현황 모니터링
- 🔗 **WordPress 연동**: REST API + App Password 인증

## 생성 콘텐츠 특징

- ✅ H2/H3 계층 구조
- ✅ 비교 테이블 자동 삽입
- ✅ 하이퍼링크 2개 이상
- ✅ 꿀팁박스 / 주의박스
- ✅ 화려한 CTA 버튼 3개 이상
- ✅ 마무리 섹션 (200자 행동유도 + 라스트팡 CTA)

---

## 🚀 Render 배포 가이드

### 1. 폴더 준비

> ⚠️ **중요**: 배포 전 폴더명에서 공백과 괄호를 제거하세요!

```bash
# 폴더명 변경
gem-seo-publisher (1)  →  gem-seo-publisher
```

### 2. GitHub 연결

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/gem-seo-publisher.git
git push -u origin main
```

### 3. Render 설정

1. [Render Dashboard](https://dashboard.render.com) 접속
2. New → Static Site 선택
3. GitHub 저장소 연결
4. 설정:
   - **Build Command**: `npm install && npm run build`
   - **Publish Directory**: `dist`
5. Environment Variables 추가:
   - `API_KEY`: Gemini API 키

---

## 로컬 실행

```bash
# 의존성 설치
npm install

# .env.local에 API 키 설정
API_KEY=your_gemini_api_key

# 개발 서버 실행
npm run dev
```

## WordPress 연결 설정

1. WordPress 관리자 → 사용자 → 프로필
2. **애플리케이션 비밀번호** 생성
3. 앱 설정에서 입력:
   - 사이트 주소: `https://your-site.com`
   - 아이디: WordPress 사용자명
   - 앱 비밀번호: 생성된 16자리 비밀번호

---

## 기술 스택

- React 19 + TypeScript
- Vite 6
- Tailwind CSS
- Google Gemini API
- WordPress REST API
