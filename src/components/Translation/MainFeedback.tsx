import { useEffect, useState } from 'react';
import axios from 'axios';
import { collection, getDocs, QuerySnapshot, type DocumentData } from 'firebase/firestore';
import { db } from '../../firebase';
import '../../index.css';
import '../../App.css';
import { useNavigate } from 'react-router-dom';

interface TranslationProblem {
  id: string;
  "한국어": string;
  "난이도": string;
  "분야": string;
  "주요어휘"?: any[];
  "출발언어"?: string;
  "sourceLanguage"?: string;
  "ChatGPT_번역"?: string;
  "Gemini_번역"?: string;
}

// === [복구: 피드백 하이라이트 및 연동 기능 함수 정의] ===
function parseFeedback6(feedback: string) {
  const sections = { summary: '', good: '', bad: '', recommend: '', learn: '', example: '' };
  const matches = feedback.match(/\d[\).\-] ?[\s\S]*?(?=\n\d[\).\-]|$)/g) || [];
  if (matches[0]) sections.summary = matches[0].replace(/^1[\).\-] ?/, '').trim();
  if (matches[1]) sections.good = matches[1].replace(/^2[\).\-] ?/, '').trim();
  if (matches[2]) sections.bad = matches[2].replace(/^3[\).\-] ?/, '').trim();
  if (matches[3]) sections.recommend = matches[3].replace(/^4[\).\-] ?/, '').trim();
  if (matches[4]) sections.learn = matches[4].replace(/^5[\).\-] ?/, '').trim();
  if (matches[5]) sections.example = matches[5].replace(/^6[\).\-] ?/, '').trim();
  const isEmpty = Object.values(sections).every(v => !v || v.trim() === '');
  const summaryTooLong = sections.summary.length > feedback.length * 0.8;
  if (isEmpty || summaryTooLong) {
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
function extractQuotedPhrases(text: string) {
  // 작은따옴표 또는 큰따옴표 모두 지원
  const matches = text.match(/['"]([^'"]+)['"]/g) || [];
  return matches.map(m => m.replace(/['"]/g, ''));
}
function renderFeedbackWithClickableQuotes(text: string, allPhrases: string[], setHighlightWord: (w: string|null)=>void) {
  // 작은따옴표 또는 큰따옴표 모두 지원
  const parts = text.split(/(['"][^'"]+['"])/g);
  return parts.map((part, idx) => {
    const match = part.match(/^['"]([^'"]+)['"]$/);
    if (match && allPhrases.includes(match[1])) {
      return (
        <span
          key={idx}
          className="bg-yellow-200 font-bold rounded px-1 cursor-pointer"
          onMouseEnter={() => setHighlightWord(match[1])}
          onMouseLeave={() => setHighlightWord(null)}
          style={{ position: 'relative', transition: 'background 0.2s' }}
        >
          {part}
        </span>
      );
    }
    return <span key={idx}>{part}</span>;
  });
}

export default function MainFeedback() {
  const [problems, setProblems] = useState<TranslationProblem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [difficulty, setDifficulty] = useState<string>('전체');
  const [domain, setDomain] = useState<string>('전체');
  const [userTranslation, setUserTranslation] = useState('');
  const [aiTranslations, setAiTranslations] = useState<{ [model: string]: string }>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [targetLanguage, setTargetLanguage] = useState<string>('한-중');
  const [feedback, setFeedback] = useState<string>('');
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [showHints, setShowHints] = useState(false);
  const [highlightWord, setHighlightWord] = useState<string | null>(null);
  const [selectedVocab, setSelectedVocab] = useState<any | null>(null);
  const navigate = useNavigate();
  const [availableDomains, setAvailableDomains] = useState<string[]>(['전체']);
  const [showIntro, setShowIntro] = useState(true);

  useEffect(() => {
    const fetchProblems = async () => {
      try {
        const querySnapshot: QuerySnapshot<DocumentData> = await getDocs(collection(db, 'translationContents'));
        let loadedProblems: TranslationProblem[] = [];
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          loadedProblems.push({ id: doc.id, ...data } as TranslationProblem);
        });
        const allDomains = Array.from(new Set(loadedProblems.map(p => typeof p["분야"] === 'string' ? p["분야"] : null).filter((v): v is string => !!v)));
        setAvailableDomains(['전체', ...allDomains]);
        let filtered = loadedProblems;
        if (difficulty !== '전체') {
          filtered = filtered.filter(p => p["난이도"] === difficulty);
        }
        if (domain !== '전체') {
          filtered = filtered.filter(p => p["분야"] === domain);
        }
        setProblems(filtered);
        setCurrentIndex(0);
      } catch (err) {
        setProblems([]);
      }
    };
    fetchProblems();
  }, [difficulty, domain]);

  const problem = problems[currentIndex] || null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setAiTranslations({});
    if (!problem) {
      setError('문제가 없습니다.');
      setLoading(false);
      return;
    }
    setAiTranslations({
      'ChatGPT_번역': problem.ChatGPT_번역 || '',
      'Gemini_번역': problem.Gemini_번역 || ''
    });
    setLoading(false);
  };

  const handleDomainChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setDomain(e.target.value);
  };

  const availableDifficulties = ['전체', '상', '중', '하'];
  const handleDifficultyChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setDifficulty(e.target.value);
  };
  const languagePairs = ['한-중', '중-한'];
  const handleTargetLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setTargetLanguage(e.target.value);
  };

  const fetchGeminiFeedback = async () => {
    if (!problem) return;
    setFeedback('');
    setFeedbackError(null);
    setFeedbackLoading(true);
    try {
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
      const sourceLanguage = problem["출발언어"] || problem["sourceLanguage"] || '한국어';
      const feedbackPrompt = `
당신은 숙련된 번역가입니다. 학생의 번역에 대해 구체적인 피드백을 아래 6개 항목으로 나눠서 작성해 주세요.

[CRITICAL 형식 규칙 - 절대 변경 금지]
- 각 항목은 정확히 "1. 종합 평가", "2. 좋은 점", "3. 아쉬운 점", "4. 추천 표현/개선", "5. 학습 제안", "6. 주요 표현/예문" 형식으로 시작
- 번호와 제목 사이에 점(.) 하나만 사용, 다른 기호나 별표(**) 절대 사용 금지
- 각 항목의 내용은 반드시 ‧ 기호로 시작하는 줄로 구성
- 각 ‧ 줄은 독립된 줄바꿈으로 구분
- "1. 종합 평가"는 피드백에 대한 전반적인 내용과 학생 격려 포함
- "2. 좋은 점"은 어휘 선택, 문맥 표현, 문법 등 전반적인 자연스러움에 대해 평가
- "3. 아쉬운 점"은 오역, 번역 부정확, 문맥 불일치 등 번역 오류에 대해 평가  
- "4. 추천 표현/개선"은 중국어 표현 개선 제안 포함
- "5. 학습 제안"은 "3. 아쉬운 점"에 기반하여 학습에 도움이 될 방법 제안안
- "6. 주요 표현/예문"에서는 반드시 아래 형식 준수:
  * ‧ 중요 표현: 한국어표현 → 중국어표현
  * ‧ 원문 예문 1: 한국어 예문
  * ‧ 예문 번역 1: 중국어 번역
  * ‧ 원문 예문 2: 한국어 예문
  * ‧ 예문 번역 2: 중국어 번역
  * (예문은 최소 2개, 최대 3개)

[출력 형식 예시]
1. 종합 평가
‧ 학생 번역은 원문의 의미를 잘 전달함
‧ 전달력이 좋고 자연스러움 유지 (8.5/10)

2. 좋은 점
‧ 어휘를 문맥에 맞게 잘 선택했어요
‧ "경제 통계" → "经济统计"를 올바르게 번역했어요

3. 아쉬운 점
‧ "혁신 기술"이 "기술 변화"로 번역되어 의미가 약화됨

4. 추천 표현/개선
‧ "경제 회복" → "经济复苏"가 더 자연스러움

5. 학습 제안
‧ 접속사 사용과 문장 분리 연습 권장

6. 주요 표현/예문
‧ 중요 표현: 경제 회복 → 经济复苏(jīng jì fù sū)
‧ 원문 예문 1: 정부는 경제 회복을 최우선 과제로 삼고 있다.
‧ 예문 번역 1: 政府将经济复苏作为首要任务。
‧ 원문 예문 2: 경제 회복 속도가 예상보다 빠르다.
‧ 예문 번역 2: 经济复苏的速度比预期의要快。

[입력 데이터]
- 원문 언어: ${sourceLanguage}
- 번역 언어: ${targetLanguage}

원문:
${problem["한국어"]}

학생 번역문:
${userTranslation}

AI 번역문:
${aiTranslations["ChatGPT_번역"] || aiTranslations["Gemini_번역"] || ''}

위 데이터를 참고하여 위 예시와 완전히 동일한 형식으로 피드백을 작성해 주세요.`;
      const data = {
        contents: [
          { parts: [ { text: feedbackPrompt } ] }
        ]
      };
      const response = await axios.post(url, data, { headers: { 'Content-Type': 'application/json' } });
      const feedbackText = response.data.candidates?.[0]?.content?.parts?.[0]?.text || '피드백을 받아오지 못했습니다.';
      setFeedback(feedbackText);
      localStorage.setItem('feedback', feedbackText);
      localStorage.setItem('original', problem["한국어"]);
      localStorage.setItem('user', userTranslation);
      localStorage.setItem('ai', aiTranslations["ChatGPT_번역"] || aiTranslations["Gemini_번역"] || '');
      localStorage.setItem('sourceLanguage', sourceLanguage);
      localStorage.setItem('targetLanguage', targetLanguage);
      navigate('/translation/feedback/result');
    } catch (err: any) {
      setFeedbackError('피드백 요청에 실패했습니다.');
    } finally {
      setFeedbackLoading(false);
    }
  };

  function renderOriginalTextWithHighlight(text: string) {
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

  // === [복구: 피드백 하이라이트용 상태 및 구문 추출] ===
  const normalizedFeedback = feedback.replace(/^[ \t]*[●•*-]/gm, '‧');
  const feedbackSections = parseFeedback6(normalizedFeedback);
  const allPhrases = Array.from(new Set([
    ...extractQuotedPhrases(feedbackSections.summary),
    ...extractQuotedPhrases(feedbackSections.good),
    ...extractQuotedPhrases(feedbackSections.bad),
    ...extractQuotedPhrases(feedbackSections.recommend),
    ...extractQuotedPhrases(feedbackSections.learn),
  ]));

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-2" style={{ fontFamily: `'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', 'SimSun', 'Noto Sans KR', 'Apple SD Gothic Neo', Arial, sans-serif` }}>
      <div className="w-full max-w-6xl mx-auto" style={{ minWidth: '1152px' }}>
        {/* 상단 이전 버튼 */}
        <button
          className="mb-4 flex items-center gap-1 text-blue-700 hover:text-blue-900 text-sm font-semibold px-3 py-1 rounded hover:bg-blue-100 transition"
          onClick={() => navigate('/')}
        >
          <span className="text-lg">🏠</span> &lt;- 이전
        </button>
        {showIntro && (
          <div className="mb-6 p-4 bg-yellow-50 border-l-4 border-yellow-400 rounded shadow flex items-start justify-between gap-4">
            <div>
              <div className="font-bold text-lg mb-1">📝 AI 피드백 결과 안내</div>
              <div className="text-gray-800 text-sm">
                이 페이지에서는 여러분이 제출한 번역에 대해 AI가 6가지 항목(종합 평가, 좋은 점, 아쉬운 점, 추천 표현/개선, 학습 제안, 주요 표현/예문)으로 상세하게 피드백을 제공합니다.<br/>
                각 항목별로 번역의 강점과 개선점을 확인하고, 실제 예문과 추천 표현을 통해 실력을 높일 수 있습니다.<br/>
                하이라이트된 구문에 마우스를 올리면 원문에서도 해당 부분이 강조되어, 번역의 포인트를 직관적으로 파악할 수 있습니다.
              </div>
            </div>
            <button className="ml-4 text-xs text-gray-500 hover:text-gray-700 px-2 py-1" onClick={() => setShowIntro(false)}>닫기 ✖</button>
          </div>
        )}
        {/* 필터 영역 */}
        <div className="flex flex-wrap gap-4 mb-6">
          <select className="bg-white text-black px-3 py-2 rounded-md border border-gray-300 appearance-none" value={difficulty} onChange={handleDifficultyChange}>
            {availableDifficulties.map((d, i) => (
              <option key={i} value={d}>{d === '전체' ? '난이도: 전체' : d}</option>
            ))}
          </select>
          <select className="bg-white text-black px-3 py-2 rounded-md border border-gray-300 appearance-none" value={domain} onChange={handleDomainChange}>
            {availableDomains.map((d, i) => (
              <option key={i} value={d}>{d === '전체' ? '분야: 전체' : d}</option>
            ))}
          </select>
          <select className="bg-white text-black px-3 py-2 rounded-md border border-gray-300 appearance-none" value={targetLanguage} onChange={handleTargetLanguageChange}>
            {languagePairs.map((pair, i) => (
              <option key={i} value={pair}>{i === 0 ? '언어쌍: ' + pair : pair}</option>
            ))}
          </select>
        </div>
        {problem ? (
          <>
            {/* 문제 카드 */}
            <div className="bg-white border border-gray-200 rounded-xl p-8 mb-6 shadow" style={{ minWidth: 0 }}>
              <p className="font-bold mb-4 text-gray-700 text-xl">아래 문장을 번역해 보세요.</p>
              <div className="bg-blue-100 border border-blue-300 rounded-lg px-6 py-4 text-blue-900 text-base flex items-center gap-4 mb-6" style={{minHeight:'120px'}}>
                <span className="font-medium text-lg flex-1">{renderOriginalTextWithHighlight(problem["한국어"])}</span>
                <button
                  className="bg-blue-400 text-white px-4 py-2 rounded-md text-sm hover:bg-blue-500 flex items-center gap-1 flex-shrink-0"
                  onClick={() => setShowHints(v => !v)}
                  type="button"
                >
                  <span className="mr-1">🔍</span> 힌트 보기
                </button>
              </div>
              {/* 힌트/어휘 */}
              {showHints && problem["주요어휘"] && Array.isArray(problem["주요어휘"]) && (
                <div className="flex flex-wrap gap-2 mb-4">
                  {problem["주요어휘"].map((vocab: any, idx: number) => (
                    <button
                      key={idx}
                      className={`px-3 py-1 rounded-full border border-blue-200 bg-blue-50 text-blue-800 text-sm font-medium hover:bg-blue-200 transition ${highlightWord === vocab.korean ? 'ring-2 ring-yellow-400' : ''}`}
                      onClick={() => {
                        if (highlightWord === vocab.korean) {
                          setHighlightWord(null); setSelectedVocab(null);
                        } else {
                          setHighlightWord(vocab.korean); setSelectedVocab(vocab);
                        }
                      }}
                      type="button"
                    >
                      {vocab.korean}
                    </button>
                  ))}
                </div>
              )}
              {/* 어휘 상세 */}
              {showHints && selectedVocab && (
                <div className="mt-3 p-4 bg-blue-50 border border-blue-200 rounded shadow-sm w-full max-w-md">
                  <div className="font-bold text-blue-900 mb-1">{selectedVocab.korean}</div>
                  <div className="text-sm mb-1"><b>중국어:</b> {selectedVocab.chinese}</div>
                  <div className="text-sm mb-1"><b>Pinyin:</b> {selectedVocab.pinyin}</div>
                  <div className="text-sm"><b>중요도:</b> {selectedVocab.importance}</div>
                </div>
              )}
              {/* 번역 입력 */}
              <textarea
                id="user-translation"
                className="w-full border border-gray-300 rounded-md p-3 mt-2 resize-y focus:outline-none focus:ring-2 focus:ring-blue-300"
                rows={3}
                value={userTranslation}
                onChange={e => setUserTranslation(e.target.value)}
                placeholder="여기에 번역 입력..."
                required
                style={{fontFamily: `'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', 'SimSun', 'Noto Sans KR', 'Apple SD Gothic Neo', Arial, sans-serif`}}
              />
              {/* 버튼 그룹 */}
              <div className="flex justify-center gap-3 mt-6">
                <button className="bg-white border border-gray-300 px-6 py-2 rounded-md text-gray-700 hover:bg-gray-100" onClick={() => setCurrentIndex(i => i - 1)} disabled={currentIndex === 0} type="button">← 이전 문제</button>
                <button className="bg-blue-600 text-white px-8 py-2 rounded-md font-bold hover:bg-blue-700" type="submit" onClick={handleSubmit} disabled={loading}>{loading ? 'AI 번역 결과 가져오는 중...' : '내 번역 제출하기'}</button>
                <button className="bg-white border border-gray-300 px-6 py-2 rounded-md text-gray-700 hover:bg-gray-100" onClick={() => setCurrentIndex(i => i + 1)} disabled={currentIndex === problems.length - 1} type="button">다음 문제 →</button>
              </div>
              <div className="text-center text-gray-500 mb-4">{currentIndex + 1} / {problems.length}</div>
              {error && <div className="text-red-500 mb-4">{error}</div>}
            </div>
            {/* AI 번역 결과 카드 */}
            {Object.keys(aiTranslations).length > 0 && (
              <div className="bg-white border border-gray-200 rounded-xl p-6 shadow mb-8">
                <h3 className="font-bold text-lg mb-4">AI 번역 결과</h3>
                <div className="flex flex-wrap gap-4 mt-2">
                  <div className="flex-1 min-w-[220px] bg-sky-50 border-2 border-sky-200 rounded-lg p-4">
                    <span className="font-bold block mb-2 text-gray-700">ChatGPT 번역</span>
                    <p className="text-gray-900 whitespace-pre-line">{aiTranslations["ChatGPT_번역"]}</p>
                  </div>
                  <div className="flex-1 min-w-[220px] bg-sky-50 border-2 border-sky-200 rounded-lg p-4">
                    <span className="font-bold block mb-2 text-gray-700">Gemini 번역</span>
                    <p className="text-gray-900 whitespace-pre-line">{aiTranslations["Gemini_번역"]}</p>
                  </div>
                  <div className="flex-1 min-w-[220px] bg-rose-50 border-2 border-rose-200 rounded-lg p-4">
                    <span className="font-bold block mb-2 text-gray-700">나의 번역</span>
                    <p className="text-gray-900 whitespace-pre-line">{userTranslation}</p>
                  </div>
                </div>
                <div className="text-center mt-6">
                  <button className="bg-blue-600 text-white px-6 py-2 rounded-md font-bold flex items-center justify-center gap-2 mx-auto hover:bg-blue-700" onClick={fetchGeminiFeedback} disabled={feedbackLoading}>
                    <span>📊</span> {feedbackLoading ? '피드백 생성 중...' : '비교 분석 피드백 받기'}
                  </button>
                  {feedbackError && <div className="text-red-500 mt-2">{feedbackError}</div>}
                  {feedback && (
                    <div className="mt-4 p-4 bg-yellow-50 border rounded whitespace-pre-line text-sm">
                      {renderFeedbackWithClickableQuotes(feedback, allPhrases, setHighlightWord)}
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="text-gray-500 text-center">문제가 없습니다.</div>
        )}
      </div>
    </div>
  );
} 