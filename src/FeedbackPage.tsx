import React, { useEffect } from 'react';
import { CircularProgressbar, buildStyles } from 'react-circular-progressbar';
import 'react-circular-progressbar/dist/styles.css';
import ReactMarkdown from 'react-markdown';

// Gemini 피드백을 6개 항목으로 파싱
function parseFeedback6(feedback: string) {
  // 1. 종합 평가 (점수/등급/총평), 2. 좋은 점/분석, 3. 아쉬운 점, 4. 추천 표현/개선, 5. 학습 제안, 6. 주요 표현/예문
  const sections = { summary: '', good: '', bad: '', recommend: '', learn: '', example: '' };
  const matches = feedback.match(/\d[\).\-] ?[\s\S]*?(?=\n\d[\).\-]|$)/g) || [];
  if (matches[0]) sections.summary = matches[0].replace(/^1[\).\-] ?/, '').trim();
  if (matches[1]) sections.good = matches[1].replace(/^2[\).\-] ?/, '').trim();
  if (matches[2]) sections.bad = matches[2].replace(/^3[\).\-] ?/, '').trim();
  if (matches[3]) sections.recommend = matches[3].replace(/^4[\).\-] ?/, '').trim();
  if (matches[4]) sections.learn = matches[4].replace(/^5[\).\-] ?/, '').trim();
  if (matches[5]) sections.example = matches[5].replace(/^6[\).\-] ?/, '').trim();
  return sections;
}

// 따옴표 안 어휘 추출
function extractQuotedPhrases(text: string) {
  const matches = text.match(/"([^"]+)"/g) || [];
  return matches.map(m => m.replace(/"/g, ''));
}

// 상단 텍스트에서 어휘/문장에 id 부여 및 하이라이트 span 적용
function renderTextWithHighlights(text: string, prefix: string, highlightPhrases: string[], highlightActive: string | null) {
  // 긴 텍스트에서 highlightPhrases(어휘/문장)와 일치하는 부분에 id 부여
  let rendered: React.ReactNode[] = [];
  let rest = text;
  let idx = 0;
  while (rest.length > 0) {
    let found = null;
    let foundIdx = -1;
    for (const phrase of highlightPhrases) {
      const i = rest.indexOf(phrase);
      if (i !== -1 && (foundIdx === -1 || i < foundIdx)) {
        found = phrase;
        foundIdx = i;
      }
    }
    if (found && foundIdx !== -1) {
      if (foundIdx > 0) {
        rendered.push(<span key={prefix + idx + '_n'}>{rest.slice(0, foundIdx)}</span>);
        idx++;
      }
      rendered.push(
        <span
          key={prefix + idx + '_h'}
          id={`${prefix}_highlight_${found}`}
          className={highlightActive === `${prefix}_highlight_${found}` ? 'highlight-strong' : 'highlighted'}
        >
          {found}
        </span>
      );
      rest = rest.slice(foundIdx + found.length);
      idx++;
    } else {
      rendered.push(<span key={prefix + idx + '_r'}>{rest}</span>);
      break;
    }
  }
  return rendered;
}

// 하이라이트 연동: 피드백 내 따옴표 어휘 hover 시 상단 번역문 하이라이트
function useHighlightEffect(phrases: string[]) {
  useEffect(() => {
    const handler = (e: Event) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains('highlighted-phrase')) {
        const phrase = target.getAttribute('data-phrase');
        ['ko', 'user', 'ai'].forEach(prefix => {
          const el = document.getElementById(`${prefix}_highlight_${phrase}`);
          if (el) el.classList.add('highlight-strong');
        });
      }
    };
    const remove = (e: Event) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains('highlighted-phrase')) {
        const phrase = target.getAttribute('data-phrase');
        ['ko', 'user', 'ai'].forEach(prefix => {
          const el = document.getElementById(`${prefix}_highlight_${phrase}`);
          if (el) el.classList.remove('highlight-strong');
        });
      }
    };
    document.addEventListener('mouseover', handler);
    document.addEventListener('mouseout', remove);
    return () => {
      document.removeEventListener('mouseover', handler);
      document.removeEventListener('mouseout', remove);
    };
  }, [phrases]);
}

// 부제목 자동 제거 함수
function cleanSectionText(text: string, sectionTitle: string) {
  // '좋은 점/분석:', '아쉬운 점:' 등 부제목 제거
  return text.replace(new RegExp(`^${sectionTitle}\s*:?`, 'i'), '').trim();
}

// 마침표 기준 줄바꿈 및 5. 학습제안 특수 처리
function formatSectionText(text: string, sectionKey: string) {
  let t = text;
  // 1. 마침표 기준 줄바꿈 (단, 이미 줄바꿈된 곳은 유지)
  t = t.replace(/([^.\n])\.(\s|$)/g, '$1.\n');
  // 2. 5. 학습제안 특수 처리
  if (sectionKey === 'learn') {
    t = t.replace(/(언어별 특성 고려:)/g, '\n**$1**\n');
    t = t.replace(/(문장 분할 및 재조합 연습:)/g, '\n**$1**\n');
  }
  // 3. 모든 ● 앞에 빈 줄 추가 (문서 맨 앞도 포함)
  t = t.replace(/\s*● /g, '\n\n● ');
  // 4. 맨 앞에 ●가 오면 줄바꿈 없이 시작
  t = t.replace(/^\n+/, '');
  // 5. 중복 줄바꿈 정리
  t = t.replace(/\n{3,}/g, '\n\n');
  return t;
}

interface FeedbackPageProps {
  original: string;
  user: string;
  ai: string;
  feedback: string;
}

export default function FeedbackPage(props: FeedbackPageProps) {
  // If props are not provided, read from localStorage
  const original = props.original ?? localStorage.getItem('original') ?? '';
  const user = props.user ?? localStorage.getItem('user') ?? '';
  const ai = props.ai ?? localStorage.getItem('ai') ?? '';
  const feedback = props.feedback ?? localStorage.getItem('feedback') ?? '';

  // 6개 항목 파싱
  const sections = parseFeedback6(feedback);
  // 모든 피드백 항목에서 따옴표 어휘 추출(중복 제거)
  const allPhrases = Array.from(new Set([
    ...extractQuotedPhrases(sections.summary),
    ...extractQuotedPhrases(sections.good),
    ...extractQuotedPhrases(sections.bad),
    ...extractQuotedPhrases(sections.recommend),
    ...extractQuotedPhrases(sections.learn),
    ...extractQuotedPhrases(sections.example),
  ]));
  useHighlightEffect(allPhrases);

  // 종합 평가에서 점수/등급/총평 추출 (정규식 보완)
  // 예: '종합 평가: 9/10점', '종합 평가: 9.5/10점', '종합 평가: 9점', '종합 평가: 10점'
  let score = 0;
  const scoreMatch = sections.summary.match(/([0-9]{1,3}(?:\.[0-9])?)\s*\/\s*([0-9]{1,3})(?:점)?/);
  if (scoreMatch) {
    // 예: 9/10점, 9.5/10점
    score = Math.round((parseFloat(scoreMatch[1]) / parseFloat(scoreMatch[2])) * 100);
  } else {
    // 예: 9점, 10점 등
    const altMatch = sections.summary.match(/([0-9]{1,3}(?:\.[0-9])?)점/);
    if (altMatch) {
      score = Math.round(parseFloat(altMatch[1]) * 10); // 10점 만점 → 100점
    }
  }

  return (
    <div className="min-h-screen bg-[#f7f8fc] py-10 px-2">
      <div className="max-w-5xl mx-auto">
        {/* 번역 비교 상단 초록색 박스 */}
        <div className="rounded-t-2xl" style={{background:'#98c97b', padding:'18px 32px 10px 32px', display:'flex', alignItems:'center', gap:'12px'}}>
          <span style={{fontSize:'1.5em'}}>📚</span>
          <span className="text-white text-xl font-bold tracking-wide">번역 비교</span>
        </div>
        {/* 3단 번역 카드 */}
        <div className="flex flex-row gap-0" style={{background:'#f3f8f1', borderRadius:'0 0 18px 18px', border:'1.5px solid #c7e2c0', borderTop:'none', overflow:'hidden', marginBottom:'38px'}}>
          {/* 원문 */}
          <div className="flex-1 p-6" style={{background:'#fff', borderRight:'1.5px solid #e0e7ef', display:'flex', flexDirection:'column', alignItems:'flex-start', minHeight:'140px', fontFamily:"'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', 'SimSun', 'Noto Sans KR', 'Apple SD Gothic Neo', Arial, sans-serif"}}>
            <div className="flex items-center gap-2 mb-2">
              <span style={{fontSize:'1.3em'}}>📝</span>
              <span className="font-bold text-base">원문</span>
            </div>
            <div style={{whiteSpace:'pre-line', wordBreak:'break-all', color:'#222', fontSize:'1.08em'}}>{original}</div>
          </div>
          {/* 나의 번역 */}
          <div className="flex-1 p-6" style={{background:'#fff', borderRight:'1.5px solid #e0e7ef', display:'flex', flexDirection:'column', alignItems:'flex-start', minHeight:'140px', fontFamily:"'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', 'SimSun', 'Noto Sans KR', 'Apple SD Gothic Neo', Arial, sans-serif"}}>
            <div className="flex items-center gap-2 mb-2">
              <span style={{fontSize:'1.3em'}}>🔤</span>
              <span className="font-bold text-base">사용자 번역</span>
            </div>
            <div style={{whiteSpace:'pre-line', wordBreak:'break-all', color:'#222', fontSize:'1.08em'}}>{user}</div>
          </div>
          {/* AI 번역 */}
          <div className="flex-1 p-6" style={{background:'#fff', display:'flex', flexDirection:'column', alignItems:'flex-start', minHeight:'140px', fontFamily:"'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', 'SimSun', 'Noto Sans KR', 'Apple SD Gothic Neo', Arial, sans-serif"}}>
            <div className="flex items-center gap-2 mb-2">
              <span style={{fontSize:'1.3em'}}>🤖</span>
              <span className="font-bold text-base">AI 번역</span>
            </div>
            <div style={{whiteSpace:'pre-line', wordBreak:'break-all', color:'#222', fontSize:'1.08em'}}>{ai}</div>
          </div>
        </div>
        {/* 도넛 그래프만 중앙에 */}
        <div className="flex justify-center mb-8">
          <div className="w-40 h-40 flex-shrink-0">
            <CircularProgressbar
              value={score}
              maxValue={100}
              text={`${score}`}
              styles={buildStyles({
                textColor: '#2563eb',
                pathColor: '#2563eb',
                trailColor: '#e0e7ff',
                textSize: '2.2rem',
                pathTransitionDuration: 0.5,
              })}
            />
            <div className="text-center mt-2 font-bold text-lg text-blue-700">총점</div>
          </div>
        </div>
        {/* 1. 종합 평가 섹션 */}
        <div className="bg-white rounded-xl shadow p-6 border-l-8 mb-8 font-sans" style={{borderColor:'#2563eb',wordBreak:'break-all',overflowWrap:'break-word',textAlign:'left',padding:'24px', fontFamily:'Noto Sans KR, Apple SD Gothic Neo, Arial, sans-serif'}}>
          <div className="flex items-center gap-2 mb-2">
            <span style={{fontSize:'1.3em'}}>🟦</span>
            <span className="font-bold text-lg" style={{color:'#2563eb'}}>1. 종합 평가</span>
          </div>
          <div className="text-justify text-base" style={{padding:'0 4px', fontFamily:"'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', 'SimSun', 'Noto Sans KR', 'Apple SD Gothic Neo', Arial, sans-serif"}}>
            <ReactMarkdown
              components={{
                text: ({node, ...props}) => {
                  // ● 기호를 span으로 감싸서 크기 조절
                  const replaced = String(props.children).replace(/●/g, '<span class="feedback-dot">●</span>');
                  return <span dangerouslySetInnerHTML={{__html: replaced}} />;
                }
              }}
            >
              {formatSectionText(cleanSectionText(sections.summary, '종합 평가'), 'summary')}
            </ReactMarkdown>
          </div>
        </div>
        {/* 하단: 2~6번 피드백 섹션 */}
        <div className="space-y-6">
          {[{title:'좋은 점/분석', color:'#2563eb', icon:'✅', key:'good'},
            {title:'아쉬운 점', color:'#f59e42', icon:'⚠️', key:'bad'},
            {title:'추천 표현/개선', color:'#10b981', icon:'💡', key:'recommend'},
            {title:'학습 제안', color:'#6366f1', icon:'📚', key:'learn'},
            {title:'주요 표현/예문', color:'#f43f5e', icon:'📝', key:'example'}].map((meta, idx) => (
            <div key={meta.key} className="bg-white rounded-xl shadow p-6 border-l-8 font-sans" style={{borderColor:meta.color,wordBreak:'break-all',overflowWrap:'break-word',textAlign:'left',padding:'24px', fontFamily:'Noto Sans KR, Apple SD Gothic Neo, Arial, sans-serif'}}>
              <div className="flex items-center gap-2 mb-2">
                <span style={{fontSize:'1.3em'}}>{meta.icon}</span>
                <span className="font-bold text-lg" style={{color:meta.color}}>{idx+2}. {meta.title}</span>
              </div>
              <div className="text-justify text-base" style={{padding:'0 4px', fontFamily:"'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', 'SimSun', 'Noto Sans KR', 'Apple SD Gothic Neo', Arial, sans-serif"}}>
                <ReactMarkdown
                  components={{
                    text: ({node, ...props}) => {
                      const replaced = String(props.children).replace(/●/g, '<span class="feedback-dot">●</span>');
                      return <span dangerouslySetInnerHTML={{__html: replaced}} />;
                    }
                  }}
                >
                  {formatSectionText(cleanSectionText(sections[meta.key as keyof typeof sections] || '', meta.title), meta.key)}
                </ReactMarkdown>
              </div>
            </div>
          ))}
        </div>
      </div>
      {/* 스타일: 하이라이트, 도넛, 섹션 등 */}
      <style>{`
        .highlight-strong {
          background: #fff3b0;
          border: 2.5px solid #facc15;
          border-radius: 6px;
          animation: pop 0.18s;
          box-shadow: 0 0 0 2px #fde68a;
          transform: scale(1.08);
          position: relative;
        }
        @keyframes pop {
          0% { transform: scale(1); }
          60% { transform: scale(1.13); }
          100% { transform: scale(1.08); }
        }
        .highlighted, .highlighted-phrase {
          background: #fffde7;
          border-bottom: 2px dashed #facc15;
          border-radius: 4px;
          cursor: pointer;
          position: relative;
        }
        .highlighted-phrase:hover::after {
          content: '상단에서 위치 확인';
          position: absolute;
          left: 50%;
          top: 100%;
          transform: translateX(-50%);
          background: #333;
          color: #fff;
          padding: 4px 10px;
          border-radius: 4px;
          font-size: 0.92em;
          white-space: nowrap;
          margin-top: 6px;
          z-index: 10;
          box-shadow: 0 2px 8px rgba(0,0,0,0.13);
        }
        .text-justify {
          text-align: justify;
        }
        .feedback-dot {
          font-size: 0.92em;
        }
      `}</style>
    </div>
  );
} 