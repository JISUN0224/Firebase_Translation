import { useEffect, useState } from 'react'
import axios from 'axios'
import { collection, getDocs, QuerySnapshot, type DocumentData } from 'firebase/firestore'
import { db } from './firebase'
import './index.css'
import './App.css'
import { Route, Routes, useNavigate } from 'react-router-dom'
import FeedbackPage from './FeedbackPage'

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

function App() {
  const [problems, setProblems] = useState<TranslationProblem[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [difficulty, setDifficulty] = useState<string>('전체')
  const [domain, setDomain] = useState<string>('전체')
  const [userTranslation, setUserTranslation] = useState('')
  const [aiTranslations, setAiTranslations] = useState<{ [model: string]: string }>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [targetLanguage, setTargetLanguage] = useState<string>('한-중')
  const [feedback, setFeedback] = useState<string>('')
  const [feedbackLoading, setFeedbackLoading] = useState(false)
  const [feedbackError, setFeedbackError] = useState<string | null>(null)
  const [showHints, setShowHints] = useState(false)
  const [highlightWord, setHighlightWord] = useState<string | null>(null)
  const [selectedVocab, setSelectedVocab] = useState<any | null>(null)
  const navigate = useNavigate();

  // Firestore에서 문제 전체 불러오기 (난이도/분야 필터 적용)
  useEffect(() => {
    const fetchProblems = async () => {
      try {
        const querySnapshot: QuerySnapshot<DocumentData> = await getDocs(collection(db, 'translationContents'))
        let loadedProblems: TranslationProblem[] = []
        querySnapshot.forEach((doc) => {
          const data = doc.data()
          loadedProblems.push({ id: doc.id, ...data } as TranslationProblem)
        })
        // 분야 목록 추출 (중복 제거)
        const allDomains = Array.from(new Set(loadedProblems.map(p => typeof p["분야"] === 'string' ? p["분야"] : null).filter((v): v is string => !!v)))
        setAvailableDomains(['전체', ...allDomains])
        // 필터 적용
        let filtered = loadedProblems
        if (difficulty !== '전체') {
          filtered = filtered.filter(p => p["난이도"] === difficulty)
        }
        if (domain !== '전체') {
          filtered = filtered.filter(p => p["분야"] === domain)
        }
        setProblems(filtered)
        setCurrentIndex(0)
      } catch (err) {
        setProblems([])
      }
    }
    fetchProblems()
  }, [difficulty, domain])

  const [availableDomains, setAvailableDomains] = useState<string[]>(['전체'])

  const problem = problems[currentIndex] || null

  // 제출 핸들러: AI 번역을 json에서 바로 불러오기
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setAiTranslations({})
    if (!problem) {
      setError('문제가 없습니다.')
      setLoading(false)
      return
    }
    // AI 번역을 문제 json에서 바로 세팅
    setAiTranslations({
      'ChatGPT_번역': problem.ChatGPT_번역 || '',
      'Gemini_번역': problem.Gemini_번역 || ''
    })
    setLoading(false)
  }

  // 분야 필터 핸들러
  const handleDomainChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setDomain(e.target.value)
  }

  // 난이도 옵션을 상, 중, 하로 고정
  const availableDifficulties = ['전체', '상', '중', '하'];

  // 난이도 드롭다운에서 availableDifficulties 사용
  const handleDifficultyChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setDifficulty(e.target.value)
  }

  // 언어쌍 옵션 고정
  const languagePairs = ['한-중', '중-한'];

  // 언어쌍 드롭다운
  const handleTargetLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setTargetLanguage(e.target.value)
  }

  // Gemini 비교 분석 피드백 요청 함수
  const fetchGeminiFeedback = async () => {
    if (!problem) return;
    setFeedback('')
    setFeedbackError(null)
    setFeedbackLoading(true)
    try {
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
      // 출발 언어(원문 언어) 추출: 문제 데이터에 있으면 사용, 없으면 '한국어'
      const sourceLanguage = problem["출발언어"] || problem["sourceLanguage"] || '한국어';
      const feedbackPrompt = `
당신은 숙련된 번역가입니다. 학생의 번역에 대해 구체적인 피드백을 아래 6개 항목으로 나눠서 작성해 주세요.

[중요 지시]
- 각 항목은 반드시 "1. 종합 평가", "2. 좋은 점", "3. 아쉬운 점", "4. 추천 표현/개선", "5. 학습 제안", "6. 주요 표현/예문"처럼 번호+제목(마크다운 굵게)으로 시작해 주세요.
- 각 항목의 내용은 반드시 ● 기호로 시작하는 문장(●와 문장 사이에 공백)으로 한 줄씩 나열해 주세요.
- 각 항목의 ● 문장들은 줄바꿈(엔터)로 구분해 주세요.
- "2. 좋은 점", "3. 아쉬운 점", "4. 추천 표현/개선"에서는 AI번역, 원문과의 비교를 통해 구체적 예시를 들어주세요.
- 마크다운에서 굵게(**), 기울임(*), 따옴표(")는 번역/원문 표현에만 사용하고, 그 외에는 사용하지 마세요.
- 각 항목의 제목과 ● 문장 사이에는 빈 줄(한 줄 띄우기)을 넣지 마세요.

[출력 예시]
1. 종합 평가
● 학생 번역은 원문의 의미를 잘 전달함
● 전달력이 좋고 자연스러움 유지 (8.5/10)

2. 좋은 점
● 어휘를 문맥에 맞게 잘 선택했어요
● "경제 통계" → "经济统计"를 올바르게 번역했어요.

3. 아쉬운 점
● "혁신 기술"이 "기술 변화"로 번역되어 의미가 약화됨

4. 추천 표현/개선
● "경제 회복" → "经济复苏"가 더 자연스러움

5. 학습 제안
● 접속사 사용과 문장 분리 연습 권장

6. 주요 표현/예문
● 중요 표현: **경제 회복**
  원문 예문: "정부는 경제 회복을 최우선 과제로 삼고 있다."
  예문 번역: "政府将经济复苏作为首要任务。"

[입력 데이터]
- 원문 언어: ${sourceLanguage}
- 번역 언어: ${targetLanguage}

원문:
${sourceLanguage}

학생 번역문:
${userTranslation}

AI 번역문:
${aiTranslations["ChatGPT_번역"] || aiTranslations["Gemini_번역"] || ''}

위 데이터를 참고하여 위 예시와 완전히 동일한 마크다운 형식으로 피드백을 작성해 주세요.`;
      const data = {
        contents: [
          { parts: [ { text: feedbackPrompt } ] }
        ]
      };
      const response = await axios.post(url, data, { headers: { 'Content-Type': 'application/json' } });
      const feedbackText = response.data.candidates?.[0]?.content?.parts?.[0]?.text || '피드백을 받아오지 못했습니다.';
      setFeedback(feedbackText)
      // localStorage에 데이터 저장
      localStorage.setItem('feedback', feedbackText)
      localStorage.setItem('original', problem["한국어"])
      localStorage.setItem('user', userTranslation)
      localStorage.setItem('ai', aiTranslations["ChatGPT_번역"] || aiTranslations["Gemini_번역"] || '')
      localStorage.setItem('sourceLanguage', sourceLanguage)
      localStorage.setItem('targetLanguage', targetLanguage)
      navigate('/feedback')
    } catch (err: any) {
      setFeedbackError('피드백 요청에 실패했습니다.')
    } finally {
      setFeedbackLoading(false)
    }
  }

  // 원문 하이라이트 렌더링
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

  return (
    <div className="min-h-screen bg-[#f4f6f8] py-8">
      <div className="max-w-4xl w-full mx-auto px-8">
        <h1 className="text-3xl font-bold text-center mb-8">번역 연습</h1>
        {/* 난이도/도착언어/분야 선택 */}
        <div className="flex flex-col md:flex-row gap-6 mb-6">
          <div className="flex-1">
            <label className="font-semibold mb-1 block" htmlFor="difficulty">난이도 선택</label>
            <select
              id="difficulty"
              className="w-full bg-white text-black border rounded shadow-sm p-2"
              value={difficulty}
              onChange={handleDifficultyChange}
            >
              {availableDifficulties.map((d, i) => (
                <option key={i} value={d}>{d}</option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <label className="font-semibold mb-1 block" htmlFor="domain">분야 선택</label>
            <select
              id="domain"
              className="w-full bg-white text-black border rounded shadow-sm p-2"
              value={domain}
              onChange={handleDomainChange}
            >
              {availableDomains.map((d, i) => (
                <option key={i} value={d}>{d}</option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <label className="font-semibold mb-1 block" htmlFor="language-pair">언어쌍</label>
            <select
              id="language-pair"
              className="w-full bg-white text-black border rounded shadow-sm p-2"
              value={targetLanguage}
              onChange={handleTargetLanguageChange}
            >
              {languagePairs.map((pair, i) => (
                <option key={i} value={pair}>{pair}</option>
              ))}
            </select>
          </div>
        </div>
        {/* 문제 표시 */}
        {problem ? (
          <>
            {/* 난이도/분야 */}
            <div className="meta-info mb-1">
              <span className="difficulty">난이도: {problem["난이도"]}</span>
              {problem["분야"] && <span className="domain ml-2">분야: {problem["분야"]}</span>}
            </div>
            {/* 원문 강조 + 하이라이트 */}
            <div className="original-text fade-in mb-2 text-lg">
              {renderOriginalTextWithHighlight(problem["한국어"])}
            </div>
            {/* 힌트 보기 버튼 및 주요 어휘 */}
            {problem["주요어휘"] && Array.isArray(problem["주요어휘"]) && (
              <div className="mb-4">
                <button
                  className="bg-blue-100 text-blue-700 px-4 py-2 rounded shadow-sm font-semibold mb-2 hover:bg-blue-200 transition"
                  onClick={() => setShowHints(v => !v)}
                >
                  {showHints ? '힌트 닫기' : '힌트 보기'}
                </button>
                {showHints && (
                  <div className="flex flex-wrap gap-2 mt-2">
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
                {/* 어휘 상세 정보 카드 */}
                {selectedVocab && (
                  <div className="mt-3 p-4 bg-blue-50 border border-blue-200 rounded shadow-sm w-full max-w-md">
                    <div className="font-bold text-blue-900 mb-1">{selectedVocab.korean}</div>
                    <div className="text-sm mb-1"><b>중국어:</b> {selectedVocab.chinese}</div>
                    <div className="text-sm mb-1"><b>Pinyin:</b> {selectedVocab.pinyin}</div>
                    <div className="text-sm"><b>중요도:</b> {selectedVocab.importance}</div>
                  </div>
                )}
              </div>
            )}
            {/* 나의 번역 입력 */}
            <label className="font-semibold mb-1 block text-left" htmlFor="user-translation">나의 번역</label>
            <textarea
              id="user-translation"
              className="w-full border rounded p-2 mb-2 min-h-[100px]"
              value={userTranslation}
              onChange={e => setUserTranslation(e.target.value)}
              placeholder="여기에 번역을 입력하세요..."
              required
            />
            {/* 버튼 그룹: 모두 동일한 스타일(노란색, 흰색 텍스트, 굵은 글씨, 크기 동일) */}
            <div className="btn-group flex justify-between mt-6 mb-2 gap-4">
              <button
                className="submit-btn flex-1 bg-yellow-400 hover:bg-yellow-500 text-white font-bold py-3 rounded text-lg transition"
                onClick={() => setCurrentIndex(i => i - 1)}
                disabled={currentIndex === 0}
                type="button"
                style={{ minWidth: 0 }}
              >
                이전 문제
              </button>
              <button
                className="submit-btn flex-1 bg-yellow-400 hover:bg-yellow-500 text-white font-bold py-3 rounded text-lg transition"
                type="submit"
                onClick={handleSubmit}
                disabled={loading}
                style={{ minWidth: 0 }}
              >
                {loading ? 'AI 번역 결과 가져오는 중...' : '내 번역 제출하기'}
              </button>
              <button
                className="submit-btn flex-1 bg-yellow-400 hover:bg-yellow-500 text-white font-bold py-3 rounded text-lg transition"
                onClick={() => setCurrentIndex(i => i + 1)}
                disabled={currentIndex === problems.length - 1}
                type="button"
                style={{ minWidth: 0 }}
              >
                다음 문제
              </button>
            </div>
            <div className="text-center text-gray-500 mb-4">{currentIndex + 1} / {problems.length}</div>
            {error && <div className="text-red-500 mb-4">{error}</div>}
            {/* AI/피드백 영역 */}
            {Object.keys(aiTranslations).length > 0 && (
              <div className="ai-section fade-in mt-8">
                <div className="font-semibold mb-2">AI 번역 결과</div>
                <div className="flex flex-row gap-4 mb-6">
                  {/* ChatGPT 번역 */}
                  <div className="flex-1 bg-gray-50 border rounded p-4">
                    <div className="text-xs text-gray-500 mb-1 font-bold">ChatGPT 번역</div>
                    <div>{aiTranslations["ChatGPT_번역"]}</div>
                  </div>
                  {/* Gemini 번역 */}
                  <div className="flex-1 bg-gray-50 border rounded p-4">
                    <div className="text-xs text-gray-500 mb-1 font-bold">Gemini 번역</div>
                    <div>{aiTranslations["Gemini_번역"]}</div>
                  </div>
                  {/* 나의 번역 */}
                  <div className="flex-1 bg-blue-50 border rounded p-4">
                    <div className="text-xs text-blue-700 mb-1 font-bold">나의 번역</div>
                    <div>{userTranslation}</div>
                  </div>
                </div>
                {/* 비교 분석 피드백 받기 버튼 및 결과 */}
                <div className="mt-8 feedback-section fade-in">
                  <button
                    className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 transition"
                    onClick={fetchGeminiFeedback}
                    disabled={feedbackLoading}
                  >
                    {feedbackLoading ? '피드백 생성 중...' : '비교 분석 피드백 받기'}
                  </button>
                  {feedbackError && <div className="text-red-500 mt-2">{feedbackError}</div>}
                  {feedback && (
                    <div className="mt-4 p-4 bg-yellow-50 border rounded whitespace-pre-line text-sm">
                      {feedback.split(/(✅|⚠️|💡|\*\*|\*|\-|\n)/g).map((part, idx) => {
                        if (part === '✅' || part === '⚠️' || part === '💡') {
                          return <span key={idx} className="feedback-highlight">{part}</span>;
                        }
                        if (part.startsWith('- ')) {
                          return <span key={idx} className="feedback-suggestion">{part}</span>;
                        }
                        return part;
                      })}
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
  )
}

export default App
