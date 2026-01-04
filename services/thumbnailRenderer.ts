export interface ThumbnailConfig {
  text: string;
  bgColor?: string;
  textColor?: string;
  borderColor?: string;
  fontSize?: number;
  fontWeight?: string;
  lineHeight?: number;
  borderWidth?: number;
}

/**
 * 🎨 고대비 컬러 테마 (보색 대비)
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

/**
 * 🎲 랜덤 고대비 테마 선택
 */
function getRandomTheme() {
  const randomIndex = Math.floor(Math.random() * HIGH_CONTRAST_THEMES.length);
  return HIGH_CONTRAST_THEMES[randomIndex];
}

/**
 * 신한은행 스타일 고임팩트 썸네일 렌더러
 * 
 * ✅ 대형 굵은 글씨 (가독성 최우선)
 * ✅ 두꺼운 단일 보더 (심플하고 강렬)
 * ✅ 랜덤 고대비 보색 테마
 * ✅ 중앙 정렬 (수평/수직)
 * ✅ 자연스러운 줄바꿈 (공백 → 구두점 → 글자 순)
 * ✅ HTML 태그 자동 제거
 */
export const renderThumbnailToBase64 = async (config: ThumbnailConfig): Promise<string> => {
  const canvas = document.createElement('canvas');
  canvas.width = 500;
  canvas.height = 500;
  const ctx = canvas.getContext('2d');

  if (!ctx) throw new Error("Canvas context is not available");

  await document.fonts.ready;

  // ═══════════════════════════════════════════════════════════
  // 0. HTML 태그 제거 및 컬러 테마 자동 선택
  // ═══════════════════════════════════════════════════════════
  const cleanText = config.text.replace(/<[^>]*>/g, '').trim();
  
  const theme = (config.bgColor && config.textColor && config.borderColor) 
    ? { bg: config.bgColor, text: config.textColor, border: config.borderColor }
    : getRandomTheme();

  const bgColor = theme.bg;
  const textColor = theme.text;
  const borderColor = theme.border;
  const borderWidth = config.borderWidth || 20;
  const fontWeight = config.fontWeight || 'bold';

  // ═══════════════════════════════════════════════════════════
  // 1. 배경 채우기
  // ═══════════════════════════════════════════════════════════
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // ═══════════════════════════════════════════════════════════
  // 2. 두꺼운 단일 테두리
  // ═══════════════════════════════════════════════════════════
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = borderWidth;
  ctx.strokeRect(
    borderWidth / 2,
    borderWidth / 2,
    canvas.width - borderWidth,
    canvas.height - borderWidth
  );

  // ═══════════════════════════════════════════════════════════
  // 3. 자연스러운 줄바꿈 (공백 → 구두점 → 글자 순)
  // ═══════════════════════════════════════════════════════════
  const padding = 80;
  const maxWidth = canvas.width - (padding * 2);

  let fontSize = 90;
  ctx.font = `${fontWeight} ${fontSize}px 'NanumSquareNeo', 'Pretendard', sans-serif`;

  /**
   * 한글 줄바꿈 로직 개선:
   * 1. 공백 기준 단어 분리 (우선)
   * 2. 단어가 너무 길면 구두점 기준 분리
   * 3. 그래도 안 되면 글자 단위 분리
   */
  const wrapText = (text: string, maxWidth: number): string[] => {
    const lines: string[] = [];
    
    // 1단계: 공백 기준 단어 분리
    const words = text.split(' ');
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? currentLine + ' ' + word : word;
      const metrics = ctx.measureText(testLine);

      if (metrics.width > maxWidth && currentLine !== '') {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }

    if (currentLine) {
      lines.push(currentLine);
    }

    // 2단계: 여전히 너무 긴 줄이 있으면 구두점 기준으로 재분리
    const finalLines: string[] = [];
    for (const line of lines) {
      const metrics = ctx.measureText(line);
      
      if (metrics.width > maxWidth) {
        // 구두점 기준 분리
        const segments = line.split(/([,?!.])/);
        let subLine = '';
        
        for (const segment of segments) {
          if (!segment) continue;
          
          const testSub = subLine + segment;
          const subMetrics = ctx.measureText(testSub);
          
          if (subMetrics.width > maxWidth && subLine !== '') {
            finalLines.push(subLine.trim());
            subLine = segment;
          } else {
            subLine = testSub;
          }
        }
        
        if (subLine.trim()) {
          finalLines.push(subLine.trim());
        }
      } else {
        finalLines.push(line);
      }
    }

    // 3단계: 그래도 안 되면 글자 단위 분리
    if (finalLines.some(line => ctx.measureText(line).width > maxWidth)) {
      const charLines: string[] = [];
      for (const line of finalLines) {
        const metrics = ctx.measureText(line);
        
        if (metrics.width > maxWidth) {
          let charLine = '';
          for (const char of line) {
            const test = charLine + char;
            const m = ctx.measureText(test);
            
            if (m.width > maxWidth && charLine !== '') {
              charLines.push(charLine);
              charLine = char;
            } else {
              charLine = test;
            }
          }
          if (charLine) {
            charLines.push(charLine);
          }
        } else {
          charLines.push(line);
        }
      }
      return charLines;
    }

    return finalLines.length > 0 ? finalLines : lines;
  };

  // 3줄 이하로 맞추기 위한 폰트 크기 자동 조절
  let lines = wrapText(cleanText, maxWidth);

  while (lines.length > 3 && fontSize > 50) {
    fontSize -= 5;
    ctx.font = `${fontWeight} ${fontSize}px 'NanumSquareNeo', 'Pretendard', sans-serif`;
    lines = wrapText(cleanText, maxWidth);
  }

  // 강제로 3줄 제한 (... 없이)
  if (lines.length > 3) {
    lines = lines.slice(0, 3);
  }

  // ═══════════════════════════════════════════════════════════
  // 4. 중앙 정렬 (수직 + 수평)
  // ═══════════════════════════════════════════════════════════
  const lineHeight = fontSize * 1.3;
  const totalHeight = lines.length * lineHeight;
  let currentY = (canvas.height - totalHeight) / 2 + (lineHeight * 0.35);

  // ═══════════════════════════════════════════════════════════
  // 5. 텍스트 렌더링 (심플하게, 그림자 없음)
  // ═══════════════════════════════════════════════════════════
  ctx.fillStyle = textColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;

  lines.forEach((line) => {
    ctx.fillText(line, canvas.width / 2, currentY);
    currentY += lineHeight;
  });

  // ═══════════════════════════════════════════════════════════
  // 6. WebP 고품질 변환
  // ═══════════════════════════════════════════════════════════
  return canvas.toDataURL('image/webp', 0.95).split(',')[1];
};
