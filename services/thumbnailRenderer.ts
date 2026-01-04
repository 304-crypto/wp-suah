export interface ThumbnailConfig {
  text: string;
  bgColor?: string;
  textColor?: string;
  borderColor?: string;
}

/**
 * 🎨 고대비 컬러 테마
 */
const HIGH_CONTRAST_THEMES = [
  { bg: '#FFFFFF', text: '#0066FF', border: '#0066FF' },
  { bg: '#FFD700', text: '#000000', border: '#000000' },
  { bg: '#FFFFFF', text: '#00A86B', border: '#00A86B' },
  { bg: '#FFFFFF', text: '#DC143C', border: '#DC143C' },
  { bg: '#FFFFFF', text: '#6B3FA0', border: '#6B3FA0' },
  { bg: '#000000', text: '#FFD700', border: '#FFD700' },
  { bg: '#FFFFFF', text: '#003366', border: '#003366' },
  { bg: '#FFFFFF', text: '#FF6B35', border: '#FF6B35' },
];

function getRandomTheme() {
  return HIGH_CONTRAST_THEMES[Math.floor(Math.random() * HIGH_CONTRAST_THEMES.length)];
}

/**
 * 📐 3줄 균형 잡힌 줄바꿈 (문맥 유지)
 * 
 * 목표:
 * - 정확히 3줄로 배치
 * - 각 줄 길이 비슷하게 (균형)
 * - 단어 단위로 끊기 (자연스러운 문맥)
 */
function balancedWrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.trim().split(/\s+/);

  if (words.length === 0) return [''];
  if (words.length === 1) return [words[0]];
  if (words.length === 2) return words;

  // 3줄 목표로 단어 분배
  const totalChars = words.reduce((sum, w) => sum + w.length, 0);
  const targetCharsPerLine = Math.ceil(totalChars / 3);

  const lines: string[] = [];
  let currentLine = '';
  let currentChars = 0;

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const testLine = currentLine ? currentLine + ' ' + word : word;

    // 줄 바꿈 조건 체크
    const shouldBreak =
      // 1. 현재 줄이 목표 글자수에 도달했고, 아직 3줄 미만이면
      (currentChars + word.length >= targetCharsPerLine && lines.length < 2 && currentLine) ||
      // 2. 또는 현재 줄이 maxWidth를 초과하면
      (ctx.measureText(testLine).width > maxWidth && currentLine);

    if (shouldBreak) {
      lines.push(currentLine);
      currentLine = word;
      currentChars = word.length;
    } else {
      currentLine = testLine;
      currentChars += word.length;
    }
  }

  // 마지막 줄 추가
  if (currentLine) {
    lines.push(currentLine);
  }

  // 3줄 초과시 마지막 줄들 합치기
  while (lines.length > 3) {
    const last = lines.pop()!;
    lines[lines.length - 1] += ' ' + last;
  }

  // 각 줄이 maxWidth 초과하는지 최종 체크 (... 없이 자르기)
  return lines.map(line => {
    if (ctx.measureText(line).width <= maxWidth) {
      return line;
    }
    // 초과하면 단어 단위로 자르기 (... 없이!)
    const words = line.split(' ');
    let result = '';
    for (const word of words) {
      const test = result ? result + ' ' + word : word;
      if (ctx.measureText(test).width > maxWidth) {
        break;
      }
      result = test;
    }
    return result || line.substring(0, 10); // 최소 10글자
  });
}

/**
 * 🎨 깔끔한 3줄 썸네일 렌더러
 * 
 * ✅ 3줄로 깔끔하게
 * ✅ 여백 충분히 (위/아래/좌/우)
 * ✅ 텍스트 안 짤림
 * ✅ 문맥에 맞게 자연스러운 줄바꿈
 */
export const renderThumbnailToBase64 = async (config: ThumbnailConfig): Promise<string> => {
  const canvas = document.createElement('canvas');
  canvas.width = 500;
  canvas.height = 500;
  const ctx = canvas.getContext('2d');

  if (!ctx) throw new Error("Canvas context is not available");

  await document.fonts.ready;

  const theme = (config.bgColor && config.textColor && config.borderColor)
    ? { bg: config.bgColor, text: config.textColor, border: config.borderColor }
    : getRandomTheme();

  // ═══════════════════════════════════════════════════════════
  // 1. 배경 + 테두리
  // ═══════════════════════════════════════════════════════════
  const borderWidth = 18;

  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = theme.border;
  ctx.lineWidth = borderWidth;
  ctx.strokeRect(borderWidth / 2, borderWidth / 2, canvas.width - borderWidth, canvas.height - borderWidth);

  // ═══════════════════════════════════════════════════════════
  // 2. 텍스트 영역 설정 (여백 최소화로 최대한 채우기)
  // ═══════════════════════════════════════════════════════════
  const padding = 35; // 좌우 여백 줄임
  const maxWidth = canvas.width - (padding * 2);

  // 텍스트 정리 (HTML 태그 제거)
  const text = config.text.replace(/<[^>]*>/g, '').trim();

  // ═══════════════════════════════════════════════════════════
  // 3. 폰트 크기 최대화 (90px부터 시작해서 최대한 크게!)
  // ═══════════════════════════════════════════════════════════
  const fontSizes = [90, 85, 80, 75, 70, 65, 60, 56, 52, 48, 44, 40, 36];
  let lines: string[] = [];
  let finalFontSize = 60;

  for (const fontSize of fontSizes) {
    ctx.font = `900 ${fontSize}px 'NanumSquareNeo', 'Pretendard', sans-serif`;
    lines = balancedWrap(ctx, text, maxWidth);

    // 모든 줄이 maxWidth 안에 들어오는지 확인
    const allFit = lines.every(line => ctx.measureText(line).width <= maxWidth);

    // 3줄 이하이고 모든 줄이 들어오면 → 이 폰트 사용!
    if (lines.length <= 3 && allFit) {
      finalFontSize = fontSize;
      break;
    }
  }

  // 최종 폰트 적용
  ctx.font = `900 ${finalFontSize}px 'NanumSquareNeo', 'Pretendard', sans-serif`;
  lines = balancedWrap(ctx, text, maxWidth);

  // ═══════════════════════════════════════════════════════════
  // 4. 중앙 정렬 렌더링 (줄 간격 타이트하게)
  // ═══════════════════════════════════════════════════════════
  const lineHeight = finalFontSize * 1.2; // 줄 간격 더 타이트하게
  const totalHeight = lines.length * lineHeight;

  // 수직 중앙 정렬
  let y = (canvas.height - totalHeight) / 2 + finalFontSize * 0.15;

  ctx.fillStyle = theme.text;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  for (const line of lines) {
    ctx.fillText(line, canvas.width / 2, y);
    y += lineHeight;
  }

  // ═══════════════════════════════════════════════════════════
  // 5. WebP 출력
  // ═══════════════════════════════════════════════════════════
  return canvas.toDataURL('image/webp', 0.95).split(',')[1];
};
