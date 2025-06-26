import { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import { Radar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
} from 'chart.js';
import { collection, getDocs, QuerySnapshot, type DocumentData } from 'firebase/firestore';
import { db } from '../../firebase';
import { useNavigate } from 'react-router-dom';
import ChatbotWidget from '../../ChatbotWidget';

ChartJS.register(RadialLinearScale, PointElement, LineElement, Filler, Tooltip, Legend);

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

export default function SimilarityAnalysis() {
  const [problems, setProblems] = useState<TranslationProblem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [difficulty, setDifficulty] = useState<string>('전체');
  const [domain, setDomain] = useState<string>('전체');
  const [userTranslation, setUserTranslation] = useState('');
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showHints, setShowHints] = useState(false);
  const [highlightWord, setHighlightWord] = useState<string | null>(null);
  const [selectedVocab, setSelectedVocab] = useState<any | null>(null);
  const navigate = useNavigate();
  const [availableDomains, setAvailableDomains] = useState<string[]>(['전체']);
  const radarRef = useRef<any>(null);
  const [targetLanguage, setTargetLanguage] = useState<string>('한-중');
  const languagePairs = ['한-중', '중-한'];

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

  const handleAnalyze = async () => {
    if (!problem) {
      setError('문제가 없습니다.');
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
      const analysisPrompt = `당신은 전문 번역 평가자입니다. 사용자의 한중 번역을 다음 기준으로 0-100점 척도로 평가하고, 번역 스타일을 분석해주세요.

[평가 기준 상세]
1. 어휘 일치도 (0-100점)
  - 핵심 어휘의 정확성 (40점): 전문용어, 고유명사의 정확한 번역
  - 어휘 선택의 적절성 (30점): 문맥에 맞는 어휘 선택
  - 동의어 활용도 (20점): 다양한 표현 사용 능력
  - 누락/오역 어휘 (-10점): 빠뜨리거나 잘못 번역한 핵심 어휘

2. 문법 정확도 (0-100점)
  - 중국어 어순 정확성 (35점): 주어+술어+목적어, 수식어 위치
  - 문법 구조 적절성 (25점): 시제, 조사, 연결어 사용
  - 문장 완성도 (25점): 문법적으로 완전한 문장 구성
  - 한국어 간섭 최소화 (15점): 한국어식 표현 회피

3. 의미 일치도 (0-100점)
  - 핵심 의미 전달 (50점): 원문의 주요 내용 정확한 전달
  - 뉘앙스 보존 (25점): 원문의 어조, 강조점 유지
  - 논리적 일관성 (15점): 문맥상 자연스러운 연결
  - 정보 누락/추가 (-10점): 원문에 없는 정보 추가나 누락

[번역문 적합성 평가 기준]
해당 원문의 특성을 고려하여 가장 적합한 번역문을 선정:
- 텍스트 유형: 공식문서/교육자료/일상대화/기술문서 등
- 대상 독자: 전문가/일반인/학습자 등  
- 번역 목적: 정보전달/학습/소통 등
- 문체 요구사항: 격식/비격식, 직역/의역 선호도

[원문]
${problem["한국어"]}

[ChatGPT 번역]
${problem.ChatGPT_번역 || ''}

[Gemini 번역]  
${problem.Gemini_번역 || ''}

[사용자 번역]
${userTranslation}

[출력 형식 - 반드시 아래 JSON 구조로 응답]
{
 "scores": {
   "vocabulary_match": 숫자 (60~100),
   "grammar_accuracy": 숫자 (60~100),
   "semantic_similarity": 숫자 (60~100),
   "overall_score": 숫자 (60~100)
 },
 "style_analysis": {
   "closest_ai": "ChatGPT" 또는 "Gemini",
   "similarity_to_chatgpt": 숫자 (60~100),
   "similarity_to_gemini": 숫자 (60~100),
   "style_description": "사용자의 번역 스타일을 2-3문장으로 구체적으로 설명. 반드시 ✅, ❌ 등 이모지로 bullet point로 항목화."
 },
 "best_translation": {
   "winner": "ChatGPT" 또는 "Gemini" 또는 "사용자",
   "reason": ["✅ 핵심 성분 정확 번역", "✅ 자연스러운 어휘 선택", "❌ 일부 전문용어 번역 아쉬움"],
   "context_analysis": ["✅ 교육 자료의 특성상 명확성과 전달력이 중요", "✅ 학습자가 이해하기 쉬운 표현 요구"]
 },
 "detailed_feedback": {
   "strengths": ["✅ 구체적인 잘된 점1", "✅ 구체적인 잘된 점2"],
   "improvements": ["❌ 구체적인 개선점1", "❌ 구체적인 개선점2"],
   "style_characteristics": ["✅ 번역 스타일 특징1", "✅ 번역 스타일 특징2"]
 }
}

주의사항:
- 모든 점수는 구체적인 근거와 함께 평가
- 번역문 적합성은 원문의 성격과 목적을 종합적으로 고려
- 각 평가 항목별로 명확한 기준 적용
- 객관적이고 건설적인 피드백 제공
- 반드시 모든 bullet point에 ✅ 또는 ❌ 이모지를 붙여 항목화
- 모든 배열 항목은 한 줄씩 구분
`;
      const data = { contents: [{ parts: [{ text: analysisPrompt }] }] };
      const response = await axios.post(url, data, { headers: { 'Content-Type': 'application/json' } });
      const text = response.data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const jsonStart = text.indexOf('{');
      const jsonEnd = text.lastIndexOf('}');
      if (jsonStart === -1 || jsonEnd === -1) throw new Error('JSON 응답이 올바르지 않습니다.');
      const analysis = JSON.parse(text.substring(jsonStart, jsonEnd + 1));
      setResult(analysis);
    } catch (err: any) {
      setError('분석 요청 또는 결과 파싱에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleDomainChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setDomain(e.target.value);
  };

  const availableDifficulties = ['전체', '상', '중', '하'];
  const handleDifficultyChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setDifficulty(e.target.value);
  };

  const handleTargetLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setTargetLanguage(e.target.value);
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

  // Radar Chart 데이터
  const radarData = result ? {
    labels: ['어휘 일치도', '문법 정확도', '의미 일치도'],
    datasets: [
      {
        label: '번역 일치도',
        data: [
          result.scores.vocabulary_match,
          result.scores.grammar_accuracy,
          result.scores.semantic_similarity
        ],
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59, 130, 246, 0.3)',
        borderWidth: 2,
        pointBackgroundColor: '#3b82f6',
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        pointRadius: 6
      }
    ]
  } : undefined;

  const radarOptions = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      r: {
        beginAtZero: true,
        max: 100,
        ticks: {
          stepSize: 20,
          color: '#6b7280'
        },
        grid: {
          color: '#e5e7eb'
        },
        pointLabels: {
          color: '#374151',
          font: {
            size: 11,
            weight: 'bold' as const
          }
        }
      }
    },
    plugins: {
      legend: { display: false }
    }
  };

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
                <button className="bg-blue-600 text-white px-8 py-2 rounded-md font-bold hover:bg-blue-700" type="submit" onClick={handleAnalyze} disabled={loading}>{loading ? 'AI 분석 중...' : 'AI번역과 유사율 보기'}</button>
                <button className="bg-white border border-gray-300 px-6 py-2 rounded-md text-gray-700 hover:bg-gray-100" onClick={() => setCurrentIndex(i => i + 1)} disabled={currentIndex === problems.length - 1} type="button">다음 문제 →</button>
              </div>
              <div className="text-center text-gray-500 mb-4">{currentIndex + 1} / {problems.length}</div>
              {error && <div className="text-red-500 mb-4">{error}</div>}
            </div>

            {/* AI 번역 결과 카드: result가 있을 때만 노출 */}
            {result && (
              <div className="bg-white border border-gray-200 rounded-xl p-6 shadow mb-8">
                <h3 className="font-bold text-lg mb-4">AI 번역 결과</h3>
                <div className="flex flex-wrap gap-4 mt-2">
                  <div className="flex-1 min-w-[220px] bg-sky-50 border-2 border-sky-200 rounded-lg p-4">
                    <span className="font-bold block mb-2 text-gray-700">ChatGPT 번역</span>
                    <p className="text-gray-900 whitespace-pre-line">{problem.ChatGPT_번역 || '번역 없음'}</p>
                  </div>
                  <div className="flex-1 min-w-[220px] bg-sky-50 border-2 border-sky-200 rounded-lg p-4">
                    <span className="font-bold block mb-2 text-gray-700">Gemini 번역</span>
                    <p className="text-gray-900 whitespace-pre-line">{problem.Gemini_번역 || '번역 없음'}</p>
                  </div>
                  <div className="flex-1 min-w-[220px] bg-rose-50 border-2 border-rose-200 rounded-lg p-4">
                    <span className="font-bold block mb-2 text-gray-700">나의 번역</span>
                    <p className="text-gray-900 whitespace-pre-line">{userTranslation || '번역 입력 필요'}</p>
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="text-gray-500 text-center">문제가 없습니다.</div>
        )}

        {/* 분석 결과 */}
        {result && (
          <div className="max-w-6xl mx-auto">
            <h1 className="text-center text-gray-900 text-2xl font-bold mb-8">🎯 번역 분석 결과</h1>
            
            {/* 상단: Progress Bar + Radar Chart */}
            <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                {/* Progress Bar */}
                <div>
                  <div className="font-bold text-lg text-center mb-6">📊 세부 점수</div>
                  {[
                    { label: '어휘 일치도', value: result.scores.vocabulary_match, color: 'bg-green-500' },
                    { label: '문법 정확도', value: result.scores.grammar_accuracy, color: 'bg-blue-500' },
                    { label: '의미 일치도', value: result.scores.semantic_similarity, color: 'bg-purple-500' },
                    { label: '종합 점수', value: result.scores.overall_score, color: 'bg-yellow-400' },
                  ].map((item, i) => (
                    <div className="mb-3" key={i}>
                      <div className="flex justify-between mb-2">
                        <span className="font-medium text-gray-700 text-sm">{item.label}</span>
                        <span className="font-bold text-gray-900 text-sm">{item.value}/100</span>
                      </div>
                      <div className="w-full h-2.5 bg-gray-200 rounded-full overflow-hidden">
                        <div className={`h-2.5 rounded-full transition-all duration-1500 ease-out ${item.color}`} style={{ width: `${item.value}%` }}></div>
                      </div>
                    </div>
                  ))}
                </div>
                {/* Radar Chart */}
                <div>
                  <div className="font-bold text-lg text-center mb-6">📡 역량 분석</div>
                  <div className="w-full h-[250px] flex items-center justify-center">
                    <Radar data={radarData!} options={radarOptions} ref={radarRef} />
                  </div>
                </div>
              </div>
            </div>

            {/* AI 비교 */}
            <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
              <div className="font-bold text-lg text-center mb-6">🤖 AI 비교</div>
              <div className="space-y-3">
                <div className="flex items-center gap-4">
                  <span className="w-20 font-medium text-gray-700">ChatGPT</span>
                  <div className="flex-1 h-5 bg-gray-200 rounded-full relative overflow-hidden">
                    <div className="h-5 rounded-full bg-green-500 transition-all duration-1500 ease-out relative" style={{ width: `${result.style_analysis.similarity_to_chatgpt}%` }}>
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-white text-xs font-bold">{result.style_analysis.similarity_to_chatgpt}%</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className="w-20 font-medium text-gray-700">Gemini</span>
                  <div className="flex-1 h-5 bg-gray-200 rounded-full relative overflow-hidden">
                    <div className="h-5 rounded-full bg-blue-500 transition-all duration-1500 ease-out relative" style={{ width: `${result.style_analysis.similarity_to_gemini}%` }}>
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-white text-xs font-bold">{result.style_analysis.similarity_to_gemini}%</span>
                    </div>
                  </div>
                </div>
                <div className="mt-4 p-3 bg-gradient-to-r from-yellow-100 to-yellow-200 rounded-lg text-center font-bold text-yellow-800">
                  🏆 더 유사한 AI: {result.style_analysis.closest_ai} ({result.style_analysis.closest_ai === 'ChatGPT' ? result.style_analysis.similarity_to_chatgpt : result.style_analysis.similarity_to_gemini}% 일치)
                </div>
              </div>
            </div>

            {/* 상세 피드백 */}
            <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
              <div className="font-bold text-lg text-center mb-6">📋 상세 분석</div>
              {/* 최적 번역문 */}
              <div className="mb-4 p-4 rounded-lg bg-yellow-50 border-l-4 border-yellow-400">
                <div className="font-bold mb-2 flex items-center gap-2" style={{ fontSize: '1.25rem' }}>
                  <span className="text-lg">🏆</span>
                  최적 번역문: {result.best_translation.winner}
                </div>
                <div className="text-gray-700 text-justify" style={{ fontSize: '1.125rem', textAlign: 'justify' }}>
                  <div className="mb-1 font-semibold">선정 이유:</div>
                  <ul className="mb-2 list-none pl-0 text-justify" style={{ textAlign: 'justify' }}>
                    {Array.isArray(result.best_translation.reason)
                      ? result.best_translation.reason.map((item: string, idx: number) => <li key={idx}>{item}</li>)
                      : <li>{result.best_translation.reason}</li>}
                  </ul>
                  <div className="mb-1 font-semibold">원문 분석:</div>
                  <ul className="mb-2 list-none pl-0 text-justify" style={{ textAlign: 'justify' }}>
                    {Array.isArray(result.best_translation.context_analysis)
                      ? result.best_translation.context_analysis.map((item: string, idx: number) => <li key={idx}>{item}</li>)
                      : <li>{result.best_translation.context_analysis}</li>}
                  </ul>
                </div>
              </div>
              {/* 번역 스타일 */}
              <div className="mb-4 p-4 rounded-lg bg-purple-50 border-l-4 border-purple-400">
                <div className="font-bold mb-2 flex items-center gap-2" style={{ fontSize: '1.25rem' }}>
                  <span className="text-lg">✨</span>
                  당신의 번역 스타일
                </div>
                <ul className="text-gray-700 text-justify" style={{ fontSize: '1.125rem', textAlign: 'justify' }}>
                  {Array.isArray(result.style_analysis.style_description)
                    ? result.style_analysis.style_description.map((item: string, idx: number) => <li key={idx}>{item}</li>)
                    : result.style_analysis.style_description.split(/\n|<br\s*\/?>/g).map((item: string, idx: number) => <li key={idx}>{item}</li>)}
                </ul>
              </div>
              {/* 잘된 점 */}
              <div className="mb-4 p-4 rounded-lg bg-green-50 border-l-4 border-green-400">
                <div className="font-bold mb-2 flex items-center gap-2" style={{ fontSize: '1.25rem' }}>
                  <span className="text-lg">👍</span>
                  잘된 점
                </div>
                <ul className="text-gray-700 text-justify" style={{ fontSize: '1.125rem', textAlign: 'justify' }}>
                  {result.detailed_feedback.strengths.map((item: string, idx: number) => <li key={idx}>{item}</li>)}
                </ul>
              </div>
              {/* 개선점 */}
              <div className="mb-4 p-4 rounded-lg bg-red-50 border-l-4 border-red-400">
                <div className="font-bold mb-2 flex items-center gap-2" style={{ fontSize: '1.25rem' }}>
                  <span className="text-lg">💡</span>
                  개선점
                </div>
                <ul className="text-gray-700 text-justify" style={{ fontSize: '1.125rem', textAlign: 'justify' }}>
                  {result.detailed_feedback.improvements.map((item: string, idx: number) => <li key={idx}>{item}</li>)}
                </ul>
              </div>
              {/* 스타일 특징 */}
              <div className="mb-2 p-4 rounded-lg bg-blue-50 border-l-4 border-blue-400">
                <div className="font-bold mb-2 flex items-center gap-2" style={{ fontSize: '1.25rem' }}>
                  <span className="text-lg">🎨</span>
                  스타일 특징
                </div>
                <ul className="text-gray-700 text-justify" style={{ fontSize: '1.125rem', textAlign: 'justify' }}>
                  {result.detailed_feedback.style_characteristics.map((item: string, idx: number) => <li key={idx}>{item}</li>)}
                </ul>
              </div>
            </div>

            {/* --- Chatbot Widget Section --- */}
            <div className="flex flex-col items-center mt-10 mb-8">
              <div className="w-full max-w-2xl">
                <ChatbotWidget initialContext={result ? JSON.stringify(result, null, 2) : ''} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
} 