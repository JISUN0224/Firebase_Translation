// import React, { useState } from 'react';
import { useState } from 'react';
import { CircularProgressbar, buildStyles } from 'react-circular-progressbar';
import 'react-circular-progressbar/dist/styles.css';

// Gemini 피드백을 6개 항목으로 파싱
function parseFeedback6(feedback: string) {
  // 1. 종합 평가 (점수/등급/총평), 2. 좋은 점/분석, 3. 아쉬운 점, 4. 추천 표현/개선, 5. 학습 제안, 6. 주요 표현/예문
  const sections = { summary: '', good: '', bad: '', recommend: '', learn: '', example: '' };
  
  // 기본 정규식 파싱
  const matches = feedback.match(/\d[\).\-] ?[\s\S]*?(?=\n\d[\).\-]|$)/g) || [];
  if (matches[0]) sections.summary = matches[0].replace(/^1[\).\-] ?/, '').trim();
  if (matches[1]) sections.good = matches[1].replace(/^2[\).\-] ?/, '').trim();
  if (matches[2]) sections.bad = matches[2].replace(/^3[\).\-] ?/, '').trim();
  if (matches[3]) sections.recommend = matches[3].replace(/^4[\).\-] ?/, '').trim();
  if (matches[4]) sections.learn = matches[4].replace(/^5[\).\-] ?/, '').trim();
  if (matches[5]) sections.example = matches[5].replace(/^6[\).\-] ?/, '').trim();
  
  // 파싱 실패 감지
  const isEmpty = Object.values(sections).every(v => !v || v.trim() === '');
  const summaryTooLong = sections.summary.length > feedback.length * 0.8;
  
  if (isEmpty || summaryTooLong) {
    // fallback: 전체 피드백을 summary에 넣고 나머지는 비움
    return {
      summary: feedback,
      good: '',
      bad: '',
      recommend: '',
      learn: '',
      example: ''
    };
  }
  
  return sections;
}

// 따옴표 안 어휘 추출
function extractQuotedPhrases(text: string) {
  const matches = text.match(/"([^"]+)"/g) || [];
  return matches.map(m => m.replace(/"/g, ''));
}

// 부제목 자동 제거 함수
function cleanSectionText(text: string, sectionTitle: string) {
  // '좋은 점/분석:', '아쉬운 점:' 등 부제목 제거
  return text.replace(new RegExp(`^${sectionTitle}\s*:?`, 'i'), '').trim();
}

// 마침표 기준 줄바꿈 및 5. 학습제안 특수 처리
function formatSectionText(text: string, sectionKey: string) {
  let t = text;
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

// TTS 함수 (위로 이동)
const speakText = (text: string) => {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.8;
    utterance.pitch = 1;
    utterance.volume = 1;
    if (/[\u4e00-\u9fff]/.test(text)) {
      utterance.lang = 'zh-CN';
    } else {
      utterance.lang = 'ko-KR';
    }
    window.speechSynthesis.speak(utterance);
  } else {
    alert('이 브라우저는 음성 합성을 지원하지 않습니다.');
  }
};

interface FeedbackPageProps {
  original?: string;
  user?: string;
  ai?: string;
  feedback?: string;
}

// bullet point를 모두 '‧'로 통일하는 함수 추가
function normalizeBullets(text: string) {
  // ●, •, *, -, 등 다양한 bullet point를 모두 '‧'로 변환
  return text.replace(/^[ \t]*[●•*-]/gm, '‧');
}

export default function FeedbackPage(props: FeedbackPageProps) {
  // If props are not provided, read from localStorage
  const original = props.original ?? localStorage.getItem('original') ?? '';
  const user = props.user ?? localStorage.getItem('user') ?? '';
  const ai = props.ai ?? localStorage.getItem('ai') ?? '';
  const feedback = props.feedback ?? localStorage.getItem('feedback') ?? '';

  // 하이라이트할 단어 상태 (App.tsx와 동일한 방식)
  const [highlightWord, setHighlightWord] = useState<string | null>(null);

  // 6개 항목 파싱
  const normalizedFeedback = normalizeBullets(feedback);
  const sections = parseFeedback6(normalizedFeedback);
  // 모든 피드백 항목에서 따옴표 어휘 추출(중복 제거)
  const allPhrases = Array.from(new Set([
    ...extractQuotedPhrases(sections.summary),
    ...extractQuotedPhrases(sections.good),
    ...extractQuotedPhrases(sections.bad),
    ...extractQuotedPhrases(sections.recommend),
    ...extractQuotedPhrases(sections.learn),
  ]));

  // App.tsx와 동일한 하이라이트 렌더링 함수 (상단 번역 비교 카드: 노란색)
  function renderTextWithHighlight(text: string) {
    if (!highlightWord) return <span>{text}</span>;
    const regex = new RegExp(`(${highlightWord})`, 'g');
    return text.split(regex).map((part, idx) =>
      part === highlightWord ? (
        <span key={idx} className="bg-yellow-200 font-bold rounded px-1">{part}</span>
      ) : (
        <span key={idx}>{part}</span>
      )
    );
  }

  // 피드백 텍스트에서 따옴표 부분을 클릭 가능하게 렌더링 (피드백 박스: 노란색 배경+볼드)
  function renderFeedbackWithClickableQuotes(text: string, enableHighlight: boolean = true) {
    const parts = text.split(/"([^"]+)"/g);
    return parts.map((part, idx) => {
      if (idx % 2 === 1 && allPhrases.includes(part) && enableHighlight) {
        return (
          <span
            key={idx}
            className="bg-yellow-200 font-bold rounded px-1 cursor-pointer"
            onMouseEnter={() => setHighlightWord(part)}
            onMouseLeave={() => setHighlightWord(null)}
            style={{ position: 'relative', transition: 'background 0.2s' }}
          >
            "{part}"
          </span>
        );
      }
      return <span key={idx}>{part}</span>;
    });
  }

  // 피드백 본문에서 '**좋은 점**', '**종합 평가**' 등 중복 부제목 자동 제거
  function removeDuplicateSubtitle(text: string, sectionTitle: string) {
    // '**좋은 점**', '**종합 평가**', '**종합 평가** 항목:' 등 다양한 형태 제거
    const regex = new RegExp(`^([*]{2})?${sectionTitle}([*]{2})?( 항목)?:?`, 'i');
    return text.replace(regex, '').trim();
  }

  // 🔥 예문 섹션 특별 렌더링 (●, ‧, • 모두 지원)
  function renderExampleSection(text: string) {
    const lines = text.split('\n').filter(line => line.trim());
    const renderedSections = [];
    let currentGroup = [];
    let groupCount = 0;
    
    for (let idx = 0; idx < lines.length; idx++) {
      const line = lines[idx];
      
      if (line.trim().match(/^[‧]\s*/)) {
        const content = line.replace(/^[‧]\s*/, '').trim();
        
        // 중요 표현이 나오면 새로운 그룹 시작
        if (content.includes('중요 표현') && (content.includes(':') || content.includes('：') || content.includes('→'))) {
          // 이전 그룹이 있으면 렌더링
          if (currentGroup.length > 0) {
            renderedSections.push(renderExampleGroup(currentGroup, groupCount));
          }
          
          // 새 그룹 시작
          groupCount++;
          currentGroup = [{
            type: 'expression',
            content: content,
            idx: idx
          }];
        }
        // 원문 예문 또는 예문 번역
        else if (content.includes('원문 예문') || content.includes('예문 번역')) {
          if (currentGroup.length > 0) {
            currentGroup.push({
              type: content.includes('원문 예문') ? 'original' : 'translation',
              content: content,
              idx: idx
            });
          } else {
            // 중요 표현 없이 예문이 나온 경우 일반 렌더링
            renderedSections.push(renderGeneralItem(content, idx));
          }
        }
        // 일반적인 bullet point
        else {
          renderedSections.push(renderGeneralItem(content, idx));
        }
      } else if (line.trim() === '') {
        renderedSections.push(<br key={idx} />);
      } else {
        renderedSections.push(
          <div key={idx} style={{ marginBottom: '4px', lineHeight: '1.6' }}>
            {line}
          </div>
        );
      }
    }
    
    // 마지막 그룹 렌더링
    if (currentGroup.length > 0) {
      renderedSections.push(renderExampleGroup(currentGroup, groupCount));
    }
    
    return renderedSections;
  }
  
  // 예문 그룹 렌더링 함수
  function renderExampleGroup(group: any[], groupNum: number) {
    return (
      <div key={`group-${groupNum}`} style={{ marginBottom: '24px' }}>
        {/* 그룹 구분선 (첫 번째 그룹 제외) */}
        {groupNum > 1 && (
          <div style={{
            margin: '20px 0',
            borderTop: '2px dashed #e0e7ff',
            position: 'relative'
          }}>
            <span style={{
              position: 'absolute',
              top: '-10px',
              left: '50%',
              transform: 'translateX(-50%)',
              background: '#fff',
              padding: '0 12px',
              fontSize: '0.85em',
              color: '#6366f1',
              fontWeight: 'bold'
            }}>
              예문 {groupNum}
            </span>
          </div>
        )}
        
        {/* 그룹 내용들 */}
        <div style={{
          border: '2px solid #e0e7ff',
          borderRadius: '12px',
          padding: '16px',
          backgroundColor: '#fafbff'
        }}>
          {group.map((item, itemIdx) => {
            if (item.type === 'expression') {
              return (
                <div key={item.idx} style={{ 
                  marginBottom: '12px', 
                  padding: '12px', 
                  backgroundColor: '#e0f2fe', 
                  borderRadius: '8px', 
                  border: '1px solid #0284c7',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', lineHeight: '1.6' }}>
                    <span style={{ fontSize: '0.92em', color: '#666', fontWeight: 'bold', flexShrink: 0 }}>‧</span>
                    <div style={{ flex: 1, fontWeight: 'bold', color: '#0f4c75' }}>{item.content}</div>
                  </div>
                </div>
              );
            } else if (item.type === 'original') {
              return (
                <div key={item.idx} style={{ 
                  marginBottom: '8px', 
                  padding: '12px', 
                  backgroundColor: '#f8fafc', 
                  borderRadius: '8px', 
                  border: '1px solid #e2e8f0',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', lineHeight: '1.6' }}>
                    <span style={{ fontSize: '0.92em', color: '#666', fontWeight: 'bold', flexShrink: 0 }}>‧</span>
                    <div style={{ flex: 1, fontWeight: 'bold', color: '#1e40af' }}>{item.content}</div>
                  </div>
                </div>
              );
            } else if (item.type === 'translation') {
              const colonIndex = Math.max(item.content.indexOf(':'), item.content.indexOf('：'));
              const translationText = colonIndex !== -1 ? item.content.substring(colonIndex + 1).trim() : item.content;
              
              return (
                <div key={item.idx} style={{ 
                  marginBottom: itemIdx === group.length - 1 ? '0' : '8px', 
                  padding: '12px', 
                  backgroundColor: '#fef3c7', 
                  borderRadius: '8px', 
                  border: '1px solid #fbbf24',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '4px', lineHeight: '1.6' }}>
                    <span style={{ fontSize: '0.92em', color: '#666', fontWeight: 'bold', flexShrink: 0 }}>‧</span>
                    <span style={{ fontWeight: 'bold', color: '#92400e' }}>
                      {item.content.substring(0, colonIndex + 1)}
                    </span>
                    <button
                      onClick={() => speakText(translationText)}
                      style={{
                        background: '#f59e0b',
                        color: 'white',
                        border: 'none',
                        borderRadius: '50%',
                        width: '28px',
                        height: '28px',
                        cursor: 'pointer',
                        fontSize: '0.9em',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.2s',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                      }}
                      onMouseEnter={e => {
                        (e.target as HTMLElement).style.background = '#d97706';
                        (e.target as HTMLElement).style.transform = 'scale(1.1)';
                      }}
                      onMouseLeave={e => {
                        (e.target as HTMLElement).style.background = '#f59e0b';
                        (e.target as HTMLElement).style.transform = 'scale(1)';
                      }}
                      title="음성으로 듣기"
                    >
                      🔊
                    </button>
                  </div>
                  <div style={{ marginLeft: '24px', fontSize: '1.05em', lineHeight: '1.5' }}>
                    {translationText}
                  </div>
                </div>
              );
            }
            return null;
          })}
        </div>
      </div>
    );
  }
  
  // 일반 아이템 렌더링 함수
  function renderGeneralItem(content: string, idx: number) {
    return (
      <div key={idx} style={{ 
        marginBottom: '8px',
        padding: '8px',
        backgroundColor: '#f9fafb',
        borderRadius: '6px',
        border: '1px solid #f3f4f6'
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', lineHeight: '1.6' }}>
          <span style={{ fontSize: '0.92em', color: '#666', fontWeight: 'bold', flexShrink: 0 }}>‧</span>
          <div style={{ flex: 1 }}>{content}</div>
        </div>
      </div>
    );
  }

  // 텍스트 파싱 및 렌더링 (‧만 지원)
  function renderFormattedText(text: string, enableHighlight: boolean = true, sectionKey: string = '') {
    if (sectionKey === 'example') {
      return renderExampleSection(text);
    }
    // 섹션별 중복 부제목 제거
    let cleanText = text;
    if (sectionKey === 'good') cleanText = removeDuplicateSubtitle(text, '좋은 점');
    if (sectionKey === 'bad') cleanText = removeDuplicateSubtitle(text, '아쉬운 점');
    if (sectionKey === 'recommend') cleanText = removeDuplicateSubtitle(text, '추천 표현');
    if (sectionKey === 'learn') cleanText = removeDuplicateSubtitle(text, '학습 제안');
    if (sectionKey === 'summary') cleanText = removeDuplicateSubtitle(text, '종합 평가');
    // bullet point 단위로 자연스럽게 분할
    const bulletPoints = cleanText.split(/\n\s*(?=[‧])/).filter(line => line.trim());
    return bulletPoints.map((line, idx) => {
      if (line.trim().match(/^[‧]\s*/)) {
        const content = line.replace(/^[‧]\s*/, '');
        return (
          <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '8px', lineHeight: '1.6' }}>
            <span className="feedback-dot" style={{ flexShrink: 0 }}>‧</span>
            <div style={{ flex: 1 }}>
              {renderFeedbackWithClickableQuotes(content, enableHighlight)}
            </div>
          </div>
        );
      } else if (line.trim() === '') {
        return <br key={idx} />;
      } else {
        return (
          <div key={idx} style={{ marginBottom: '4px', lineHeight: '1.6' }}>
            {renderFeedbackWithClickableQuotes(line, enableHighlight)}
          </div>
        );
      }
    });
  }

  // 종합 평가에서 점수/등급/총평 추출 (정규식 보완)
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
        {/* 상단 번역 비교 3단 카드 */}
        <div className="flex gap-4 mb-10">
          <div className="flex-1 bg-white rounded-xl shadow p-5 border-b-4 border-blue-200 flex flex-col items-start">
            <div className="font-bold text-blue-700 mb-2 text-lg">원문</div>
            <div className="text-gray-800 text-base">{renderTextWithHighlight(original)}</div>
          </div>
          <div className="flex-1 bg-white rounded-xl shadow p-5 border-b-4 border-blue-200 flex flex-col items-start">
            <div className="font-bold text-blue-700 mb-2 text-lg">AI 번역</div>
            <div className="text-gray-800 text-base">{renderTextWithHighlight(ai)}</div>
          </div>
          <div className="flex-1 bg-white rounded-xl shadow p-5 border-b-4 border-yellow-200 flex flex-col items-start">
            <div className="font-bold text-yellow-700 mb-2 text-lg">내 번역</div>
            <div className="text-gray-800 text-base">{renderTextWithHighlight(user)}</div>
          </div>
        </div>
        
        {/* 1. 종합 평가 섹션 */}
        <div className="bg-white rounded-xl shadow p-6 border-l-8 mb-8 font-sans" style={{borderColor:'#2563eb',wordBreak:'break-all',overflowWrap:'break-word',textAlign:'left',padding:'24px', fontFamily:'Noto Sans KR, Apple SD Gothic Neo, Arial, sans-serif', marginBottom:'24px'}}>
          <div className="flex items-center gap-2 mb-2">
            <span style={{fontSize:'1.3em'}}>🟦</span>
            <span className="font-bold text-lg" style={{color:'#2563eb'}}>1. 종합 평가</span>
          </div>
          <div className="flex gap-6 items-start">
            {/* 도넛 그래프 */}
            <div className="flex-shrink-0">
              <div className="w-24 h-24">
                <CircularProgressbar
                  value={score}
                  maxValue={100}
                  text={`${score}`}
                  styles={buildStyles({
                    textColor: '#2563eb',
                    pathColor: '#2563eb',
                    trailColor: '#e0e7ff',
                    textSize: '1.8rem',
                    pathTransitionDuration: 0.5,
                  })}
                />
              </div>
              <div className="text-center mt-1 font-bold text-sm text-blue-700">총점</div>
            </div>
            {/* 종합 평가 텍스트 */}
            <div className="flex-1 text-justify text-base" style={{padding:'0 4px', fontFamily:"'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', 'SimSun', 'Noto Sans KR', 'Apple SD Gothic Neo', Arial, sans-serif"}}>
              {renderFormattedText(formatSectionText(cleanSectionText(sections.summary, '종합 평가'), 'summary'))}
            </div>
          </div>
        </div>
        
        {/* 하단: 2~6번 피드백 섹션 */}
        <div className="space-y-6">
          {[
            {title:'좋은 점/분석', color:'#2563eb', icon:'✅', key:'good'},
            {title:'아쉬운 점', color:'#f59e42', icon:'⚠️', key:'bad'},
            {title:'추천 표현/개선', color:'#10b981', icon:'💡', key:'recommend'},
            {title:'학습 제안', color:'#6366f1', icon:'📚', key:'learn'},
            {title:'주요 표현/예문', color:'#f43f5e', icon:'📝', key:'example'}
          ].map((meta, idx) => (
            <div key={meta.key} className="bg-white rounded-xl shadow p-6 border-l-8 font-sans" style={{borderColor:meta.color,wordBreak:'break-all',overflowWrap:'break-word',textAlign:'left',padding:'24px', fontFamily:'Noto Sans KR, Apple SD Gothic Neo, Arial, sans-serif'}}>
              <div className="flex items-center gap-2 mb-2">
                <span style={{fontSize:'1.3em'}}>{meta.icon}</span>
                <span className="font-bold text-lg" style={{color:meta.color}}>{idx+2}. {meta.title}</span>
              </div>
              <div className="text-justify text-base" style={{padding:'0 4px', fontFamily:"'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', 'SimSun', 'Noto Sans KR', 'Apple SD Gothic Neo', Arial, sans-serif"}}>
                {renderFormattedText(formatSectionText(cleanSectionText(sections[meta.key as keyof typeof sections] || '', meta.title), meta.key), meta.key !== 'example', meta.key)}
              </div>
            </div>
          ))}
        </div>
      </div>
      
      {/* 스타일: 하이라이트, 도넛, 섹션 등 */}
      <style>{`
        .text-justify {
          text-align: justify;
        }
        
        .feedback-dot {
          font-size: 0.92em;
          color: #666;
          font-weight: bold;
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
      `}</style>
    </div>
  );
} 