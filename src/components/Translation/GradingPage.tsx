import React, { useState, useEffect } from 'react';
import { collection, getDocs, QuerySnapshot } from 'firebase/firestore';
import type { DocumentData } from 'firebase/firestore';
import { db } from '../../firebase';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import ChatbotWidget from '../../ChatbotWidget';

const TOTAL_STEPS = 5;
const translations = ['A', 'B', 'C'];
const categories = [
  { key: 'vocab', label: '어휘' },
  { key: 'grammar', label: '문법' },
  { key: 'naturalness', label: '자연스러움' },
  { key: 'spelling', label: '맞춤법' },
];
const translators = [
  { key: 'chatgpt', label: 'ChatGPT' },
  { key: 'gemini', label: 'Gemini' },
  { key: 'human', label: '인간 번역자' },
];

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

// Gemini API 호출 (실제 평가)
async function callGeminiEvaluation(originalText: string, translations: any, userEval: any) {
  const prompt = `
당신은 한국어-중국어 번역 전문가입니다. 다음 번역 평가를 수행해주세요.

**원문:** ${originalText}

**번역문들:**
- 번역문 A: ${translations.A}
- 번역문 B: ${translations.B}
- 번역문 C: ${translations.C}

**평가 기준:**
1. 어휘 선택의 정확성과 적절성
2. 문법적 정확성과 구조
3. 자연스러운 표현과 유창성
4. 맞춤법과 표기법

**요구사항:**
1. 각 번역문을 1-5점으로 정확히 평가
2. 가장 문제가 많은 번역문을 선택하고 구체적인 문제점 3가지 이상 제시
3. 실제로 개선된 번역문을 제시 (추상적 설명 금지)
4. 순위를 매기고 각각에 대한 구체적인 근거 제시

**응답 형식:**
{
  "improvement": {
    "worstTranslation": "A|B|C",
    "problems": "• 문제점 1\n• 문제점 2\n• 문제점 3",
    "suggestion": "실제 개선된 번역문 전체",
    "reasoning": "• 근거 1\n• 근거 2\n"
  },
  "scores": {
    "A": {"vocab": 점수, "grammar": 점수, "naturalness": 점수, "spelling": 점수},
    "B": {"vocab": 점수, "grammar": 점수, "naturalness": 점수, "spelling": 점수},
    "C": {"vocab": 점수, "grammar": 점수, "naturalness": 점수, "spelling": 점수}
  },
  "ranking": {
    "first": {"translation": "A|B|C", "reason": "• 이유 1\n• 이유 2"},
    "second": {"translation": "A|B|C", "reason": "• 이유 1\n• 이유 2"},
    "third": {"translation": "A|B|C", "reason": "• 이유 1\n• 이유 2"}
  }
}

**중요:** 모든 문자열 값에서 문제점과 이유는 '• '로 시작하는 불릿 포인트 형식으로 작성해주세요.
`;

  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  const data = { contents: [{ parts: [{ text: prompt }] }] };

  try {
    console.log('Gemini API 호출 시도 1/3');
    const response = await axios.post(url, data, { 
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000
    });
    const text = response.data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    // Gemini가 코드블록(```json ... ```)으로 감싸는 경우도 있으니 파싱
    const jsonStart = text.indexOf('{');
    const jsonEnd = text.lastIndexOf('}');
    if (jsonStart === -1 || jsonEnd === -1) throw new Error('Gemini 응답이 올바르지 않습니다.');
    return JSON.parse(text.substring(jsonStart, jsonEnd + 1));
  } catch (err: any) {
    console.error('Gemini API 오류:', err.message);
    if (err.response?.status === 503) {
      throw new Error('Gemini AI 서비스가 일시적으로 사용할 수 없습니다. 잠시 후 다시 시도해주세요.');
    }
    throw new Error('Gemini 평가 요청에 실패했습니다. 네트워크 연결을 확인해주세요.');
  }
}

export default function GradingPage() {
  // 문제 관련 상태
  const [problems, setProblems] = useState<TranslationProblem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [difficulty, setDifficulty] = useState<string>('전체');
  const [domain, setDomain] = useState<string>('전체');
  const [targetLanguage, setTargetLanguage] = useState<string>('한-중');
  const [availableDomains, setAvailableDomains] = useState<string[]>(['전체']);
  const languagePairs = ['한-중', '중-한'];
  const availableDifficulties = ['전체', '상', '중', '하'];

  // 평가 단계 상태
  const [currentStep, setCurrentStep] = useState(1);
  const [userEvaluation, setUserEvaluation] = useState<any>({});
  const [aiEvaluation, setAiEvaluation] = useState<any>(null);
  const [loadingAI, setLoadingAI] = useState(false);
  const [aiError, setAIError] = useState('');

  // 1단계: 개선 제안 상태
  const [improvement, setImprovement] = useState({
    worstTranslation: '',
    problems: '',
    suggestion: '',
    reasoning: ''
  });
  const [step1Error, setStep1Error] = useState('');
  // 2단계: 점수 상태
  const [scores, setScores] = useState<any>({
    A: { vocab: 0, grammar: 0, naturalness: 0, spelling: 0 },
    B: { vocab: 0, grammar: 0, naturalness: 0, spelling: 0 },
    C: { vocab: 0, grammar: 0, naturalness: 0, spelling: 0 },
  });
  const [step2Error, setStep2Error] = useState('');
  // 3단계: 순위 상태
  const [ranking, setRanking] = useState({ first: '', second: '', third: '' });
  const [step3Error, setStep3Error] = useState('');
  // 4단계: 번역자 맞추기 상태
  const [guess, setGuess] = useState<{ [key: string]: string }>({ A: '', B: '', C: '' });
  const [step4Error, setStep4Error] = useState('');

  const navigate = useNavigate();
  // AI 순위 상세 토글 상태 (5단계용)
  const [aiRankDetailOpen, setAiRankDetailOpen] = useState<{ [key: string]: boolean }>({});

  // 5단계에서 대응되는 섹션들의 높이를 맞추는 효과
  useEffect(() => {
    if (currentStep === 5 && !loadingAI && !aiError && aiEvaluation) {
      const adjustSectionHeights = () => {
        const container = document.querySelector('.comparison-container');
        if (!container) return;
        
        // 1. 메인 섹션들 높이 맞추기
        const userSections = container.querySelectorAll('.bg-blue-50 .comparison-section');
        const aiSections = container.querySelectorAll('.bg-green-50 .comparison-section');
        
        for (let i = 0; i < Math.min(userSections.length, aiSections.length); i++) {
          const userSection = userSections[i] as HTMLElement;
          const aiSection = aiSections[i] as HTMLElement;
          
          // 기존 min-height 초기화
          userSection.style.minHeight = 'auto';
          aiSection.style.minHeight = 'auto';
          
          // 실제 높이 측정
          const userHeight = userSection.offsetHeight;
          const aiHeight = aiSection.offsetHeight;
          const maxHeight = Math.max(userHeight, aiHeight);
          
          // 더 긴 쇭에 맞춰서 높이 설정
          userSection.style.minHeight = `${maxHeight}px`;
          aiSection.style.minHeight = `${maxHeight}px`;
        }
        
        // 2. 개선 제안 섹션 내부 세부 항목들 높이 맞추기
        const improvementItems = ['problems', 'suggestion', 'reasoning'];
        improvementItems.forEach(item => {
          const userItem = container.querySelector(`.improvement-${item}-user`) as HTMLElement;
          const aiItem = container.querySelector(`.improvement-${item}-ai`) as HTMLElement;
          
          if (userItem && aiItem) {
            // 기존 min-height 초기화
            userItem.style.minHeight = 'auto';
            aiItem.style.minHeight = 'auto';
            
            // 실제 높이 측정
            const userHeight = userItem.offsetHeight;
            const aiHeight = aiItem.offsetHeight;
            const maxHeight = Math.max(userHeight, aiHeight);
            
            // 더 긴 쇭에 맞춰서 높이 설정
            userItem.style.minHeight = `${maxHeight}px`;
            aiItem.style.minHeight = `${maxHeight}px`;
          }
        });
      };
      
      // DOM이 완전히 렌더링된 후 실행
      const timer = setTimeout(adjustSectionHeights, 200);
      // 추가로 한번 더 실행하여 확실하게 적용
      const timer2 = setTimeout(adjustSectionHeights, 500);
      return () => {
        clearTimeout(timer);
        clearTimeout(timer2);
      };
    }
  }, [currentStep, loadingAI, aiError, aiEvaluation, aiRankDetailOpen]);
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

  // 번역문 카드용: 문제 json에서 3개 추출
  let translationCards: { key: string; text: string }[] = [];
  if (problem) {
    translationCards = [
      { key: 'A', text: problem.ChatGPT_번역 || '' },
      { key: 'B', text: problem.Gemini_번역 || '' },
      { key: 'C', text: (problem as any)["중국어"] || (problem as any)["인간"] || '' },
    ];
  }

  // 필터 변경 핸들러
  const handleDifficultyChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setDifficulty(e.target.value);
  };
  const handleDomainChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setDomain(e.target.value);
  };
  const handleTargetLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setTargetLanguage(e.target.value);
  };

  // 문제 이동
  const handlePrevProblem = () => {
    setCurrentIndex(i => Math.max(0, i - 1));
  };
  const handleNextProblem = () => {
    setCurrentIndex(i => Math.min(problems.length - 1, i + 1));
  };

  // 평가 단계 이동 함수 (기존 nextStep, prevStep 그대로)
  const nextStep = async () => {
    if (currentStep === 1) {
      if (!improvement.worstTranslation || !improvement.problems || !improvement.suggestion || !improvement.reasoning) {
        setStep1Error('모든 항목을 입력해주세요.');
        return;
      }
      setUserEvaluation((prev: any) => ({ ...prev, improvement }));
      setStep1Error('');
    }
    if (currentStep === 2) {
      let valid = true;
      for (const t of translations) {
        for (const c of categories) {
          if (!scores[t][c.key]) valid = false;
        }
      }
      if (!valid) {
        setStep2Error('모든 항목에 점수를 입력해주세요.');
        return;
      }
      setUserEvaluation((prev: any) => ({ ...prev, scores }));
      setStep2Error('');
    }
    if (currentStep === 3) {
      const values = [ranking.first, ranking.second, ranking.third];
      const unique = new Set(values);
      if (values.includes('') || unique.size !== 3) {
        setStep3Error('1~3위를 모두 중복 없이 선택해주세요.');
        return;
      }
      setUserEvaluation((prev: any) => ({ ...prev, ranking }));
      setStep3Error('');
    }
    if (currentStep === 4) {
      if (!guess.A || !guess.B || !guess.C) {
        setStep4Error('모든 번역문의 번역자를 선택해주세요.');
        return;
      }
      setUserEvaluation((prev: any) => ({ ...prev, guess }));
      setStep4Error('');
      setLoadingAI(true);
      setAIError('');
      try {
        const aiResult = await callGeminiEvaluation(problem ? problem["한국어"] : '원문 예시', {A:problem?.ChatGPT_번역,B:problem?.Gemini_번역,C:'(인간번역 예시)'}, userEvaluation);
        setAiEvaluation(aiResult);
      } catch (e) {
        setAIError('Gemini 평가 요청에 실패했습니다.');
      } finally {
        setLoadingAI(false);
      }
    }
    if (currentStep < TOTAL_STEPS) {
      setCurrentStep(currentStep + 1);
    }
  };
  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  // 별점, 순위, 번역자 버튼 렌더링 함수(생략, 기존과 동일)
  function renderStars(value: number, onChange: (v: number) => void) {
    return (
      <div className="flex gap-1">
        {[1,2,3,4,5].map(star => (
          <span
            key={star}
            className={`cursor-pointer text-2xl ${value >= star ? 'text-yellow-400' : 'text-gray-300'}`}
            onClick={() => onChange(star)}
            role="button"
            aria-label={`${star}점`}
          >★</span>
        ))}
      </div>
    );
  }
  function renderRankButton(rank: 'first'|'second'|'third', t: string) {
    const selected = ranking[rank] === t;
    const disabled = Object.entries(ranking).some(([k, v]) => k !== rank && v === t);
    return (
      <button
        key={t}
        className={`rank-btn px-4 py-2 rounded-full border-2 mx-1 font-semibold transition-all ${selected ? 'bg-indigo-500 text-white border-indigo-600' : 'bg-white text-gray-700 border-gray-300'} ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
        onClick={() => !disabled && setRanking(r => ({ ...r, [rank]: t }))}
        disabled={disabled}
        type="button"
      >
        번역문 {t}
      </button>
    );
  }
  function renderGuessButton(t: string, trKey: string, label: string) {
    const selected = guess[t] === trKey;
    return (
      <button
        key={trKey}
        className={`px-4 py-2 rounded-full border-2 mx-1 font-semibold transition-all ${selected ? 'bg-green-500 text-white border-green-600' : 'bg-white text-gray-700 border-gray-300'}`}
        onClick={() => setGuess(g => ({ ...g, [t]: trKey }))}
        type="button"
      >
        {label}
      </button>
    );
  }

  // 진행률 계산
  const progress = (currentStep / TOTAL_STEPS) * 100;

  // 4단계 번역자 중복 선택 방지용: 이미 선택된 번역자
  const selectedTranslators = Object.values(guess);

  // 번역문 카드 렌더링 함수 (1~4단계 공통)
  function renderTranslationCards() {
    return (
      <div className="flex flex-col gap-4 mb-6">
        {translationCards.map((card) => (
          <label key={card.key} className={`flex items-center gap-4 p-4 rounded-xl border-2 transition-all cursor-pointer bg-white ${improvement.worstTranslation === card.key ? 'border-pink-500 ring-2 ring-pink-400' : 'border-transparent'}`}> 
            <input
              type="radio"
              name="worstTranslation"
              className="custom-radio appearance-none focus:outline-none transition-colors duration-200"
              checked={improvement.worstTranslation === card.key}
              onChange={() => setImprovement(impr => ({ ...impr, worstTranslation: card.key }))}
              disabled={currentStep !== 1}
            />
            <span className="flex-1 text-gray-900 text-base whitespace-pre-line">{card.text}</span>
          </label>
        ))}
      </div>
    );
  }

  // 별점 렌더링 함수 (읽기 전용)
  function renderReadOnlyStars(value: number) {
    return (
      <div className="flex">
        {[1,2,3,4,5].map(star => (
          <span
            key={star}
            className={`text-sm ${value >= star ? 'text-yellow-400 star-filled' : 'text-gray-300 star-empty'}`}
          >★</span>
        ))}
      </div>
    );
  }

  // 개선 제안 섹션 렌더링
  function renderImprovementSection(improvement: any, type: string) {
    if (!improvement) return null;
    const isUser = type === 'user';
    const bgColor = isUser ? 'bg-blue-50' : 'bg-green-50';
    const borderColor = isUser ? 'border-blue-200' : 'border-green-200';
    const textColor = isUser ? 'text-blue-800' : 'text-green-800';
    const accentColor = isUser ? 'text-blue-700' : 'text-green-700';
    
    // 불릿 포인트 처리 함수
    const renderBulletPoints = (text: string) => {
      if (!text) return null;
      const lines = text.split('\n').filter(line => line.trim());
      if (lines.length === 1 && !text.includes('•')) {
        // 불릿 포인트가 없는 단일 텍스트
        return <span className="text-sm text-gray-700">{text}</span>;
      }
      return (
        <div className="space-y-1">
          {lines.map((line, idx) => {
            const cleanLine = line.replace(/^[•\-\*]\s*/, '').trim();
            return cleanLine ? (
              <div key={idx} className="flex items-start gap-2">
                <span className="text-red-500 mt-1 text-xs">•</span>
                <span className="text-sm text-gray-700 flex-1">{cleanLine}</span>
              </div>
            ) : null;
          })}
        </div>
      );
    };
    
    return (
      <div className={`p-4 ${bgColor} rounded-lg border ${borderColor}`}>
        <h4 className={`font-semibold ${textColor} mb-3 flex items-center gap-2`}>
          <span>🔍</span>개선 제안
        </h4>
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <span className={`text-sm font-medium ${accentColor}`}>아쉬운 번역문:</span>
            <span className={`px-3 py-1 ${isUser ? 'bg-blue-100' : 'bg-green-100'} rounded-full text-sm font-bold ${textColor}`}>
              번역문 {improvement.worstTranslation}
            </span>
          </div>
          
          <div className={`improvement-problems-${type}`}>
            <div className={`text-sm font-medium ${accentColor} mb-2 flex items-center gap-1`}>
              <span>❌</span>문제점
            </div>
            <div className="bg-white p-3 rounded border leading-relaxed">
              {renderBulletPoints(improvement.problems)}
            </div>
          </div>
          
          <div className={`improvement-suggestion-${type}`}>
            <div className={`text-sm font-medium ${accentColor} mb-2 flex items-center gap-1`}>
              <span>✨</span>개선안
            </div>
            <div className={`bg-white p-3 rounded border text-sm text-gray-800 font-medium ${isUser ? 'border-l-4 border-l-blue-400' : 'border-l-4 border-l-green-400'}`}>
              "{improvement.suggestion}"
            </div>
          </div>
          
          <div className={`improvement-reasoning-${type}`}>
            <div className={`text-sm font-medium ${accentColor} mb-2 flex items-center gap-1`}>
              <span>💡</span>근거
            </div>
            <div className="bg-white p-3 rounded border text-sm text-gray-600 italic">
              {improvement.reasoning}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 점수 비교 섹션 렌더링
  function renderScoresSection(scores: any, type: string) {
    if (!scores) return null;
    const isUser = type === 'user';
    const bgColor = isUser ? 'bg-blue-50' : 'bg-green-50';
    const borderColor = isUser ? 'border-blue-200' : 'border-green-200';
    const textColor = isUser ? 'text-blue-800' : 'text-green-800';
    
    return (
      <div className={`p-4 ${bgColor} rounded-lg border ${borderColor}`}>
        <h4 className={`font-semibold ${textColor} mb-3 flex items-center gap-2`}>
          <span>⭐</span>점수 평가
        </h4>
        <div className="space-y-3">
          {['A', 'B', 'C'].map(translation => {
            const total = categories.reduce((sum, cat) => sum + (scores[translation]?.[cat.key] || 0), 0);
            const average = (total / categories.length).toFixed(1);
            
            return (
              <div key={translation} className="bg-white rounded-lg p-3 border">
                <div className="flex justify-between items-center mb-2">
                  <span className="font-bold text-sm">번역문 {translation}</span>
                  <span className={`text-lg font-bold ${isUser ? 'text-blue-600' : 'text-green-600'}`}>
                    평균 {average}점
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {categories.map(cat => (
                    <div key={cat.key} className="flex justify-between items-center text-xs">
                      <span className="text-gray-600">{cat.label}</span>
                      <div className="flex items-center gap-1">
                        {renderReadOnlyStars(scores[translation]?.[cat.key] || 0)}
                        <span className="text-gray-500 ml-1">{scores[translation]?.[cat.key] || 0}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // 순위 섹션 렌더링 (사용자용)
  function renderUserRankingSection(ranking: any) {
    if (!ranking) return null;
    const rankOrder = [
      { key: 'first', label: '1위', emoji: '🥇', bgColor: 'bg-yellow-100', textColor: 'text-yellow-800' },
      { key: 'second', label: '2위', emoji: '🥈', bgColor: 'bg-gray-100', textColor: 'text-gray-700' },
      { key: 'third', label: '3위', emoji: '🥉', bgColor: 'bg-orange-100', textColor: 'text-orange-700' }
    ];
    return (
      <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
        <h4 className="font-semibold text-blue-800 mb-3 flex items-center gap-2">
          <span>🏆</span>순위 평가
        </h4>
        <div className="space-y-3">
          {rankOrder.map(rank => (
            <div key={rank.key} className={`${rank.bgColor} rounded-lg p-3 flex items-center gap-3`}>
              <span className="text-2xl">{rank.emoji}</span>
              <span className={`font-bold ${rank.textColor}`}>{rank.label}:번역문 {ranking[rank.key]}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // 순위 섹션 렌더링 (AI용)
  function renderAIRankingSection(ranking: any, openDetail: { [key: string]: boolean }, setOpenDetail: (f: (prev: { [key: string]: boolean }) => { [key: string]: boolean }) => void) {
    if (!ranking) return null;
    const rankOrder = [
      { key: 'first', label: '1위', emoji: '🥇', bgColor: 'bg-yellow-100', textColor: 'text-yellow-800' },
      { key: 'second', label: '2위', emoji: '🥈', bgColor: 'bg-gray-100', textColor: 'text-gray-700' },
      { key: 'third', label: '3위', emoji: '🥉', bgColor: 'bg-orange-100', textColor: 'text-orange-700' }
    ];
    // 불릿 포인트 처리 함수
    const renderReasonPoints = (reason: string) => {
      if (!reason) return null;
      const lines = reason.split('\n').filter(line => line.trim());
      if (lines.length === 1 && !reason.includes('•')) {
        return <span className="text-sm text-gray-600 italic">{reason}</span>;
      }
      return (
        <div className="space-y-1">
          {lines.map((line, idx) => {
            const cleanLine = line.replace(/^[•\-\*]\s*/, '').trim();
            return cleanLine ? (
              <div key={idx} className="flex items-start gap-2">
                <span className="text-green-500 mt-1 text-xs">•</span>
                <span className="text-sm text-gray-600 flex-1">{cleanLine}</span>
              </div>
            ) : null;
          })}
        </div>
      );
    };
    return (
      <div className="p-4 bg-green-50 rounded-lg border border-green-200">
        <h4 className="font-semibold text-green-800 mb-3 flex items-center gap-2">
          <span>🏆</span>순위 평가
        </h4>
        <div className="space-y-3">
          {rankOrder.map(rank => {
            const translation = ranking[rank.key]?.translation;
            const reason = ranking[rank.key]?.reason;
            const isOpen = openDetail[rank.key] || false;
            return (
              <div key={rank.key} className={`${rank.bgColor} rounded-lg p-3`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{rank.emoji}</span>
                    <span className={`font-bold ${rank.textColor}`}>{rank.label}:번역문 {translation}</span>
                  </div>
                  {reason && (
                    <button
                      className="ml-2 px-3 py-1 rounded bg-white border border-green-300 text-green-700 text-xs font-semibold hover:bg-green-100 transition"
                      onClick={() => setOpenDetail(prev => ({ ...prev, [rank.key]: !isOpen }))}
                      type="button"
                    >
                      {isOpen ? '상세 내용 닫기' : '상세 내용 보기'}
                    </button>
                  )}
                </div>
                {reason && isOpen && (
                  <div className="bg-white p-2 rounded border-l-4 border-l-green-400 mt-2">
                    {renderReasonPoints(reason)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // 번역자 추측 섹션 렌더링
  function renderGuessSection(guess: any) {
    if (!guess) return null;
    const translatorLabels: { [key: string]: string } = {
      'chatgpt': 'ChatGPT',
      'gemini': 'Gemini',
      'human': '인간 번역자'
    };
    const translatorIcons: { [key: string]: string } = {
      'chatgpt': '🤖',
      'gemini': '✨',
      'human': '👤'
    };
    return (
      <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
        <h4 className="font-semibold text-blue-800 mb-3 flex items-center gap-2">
          <span>🤔</span>번역자 추측
        </h4>
        <div className="space-y-3">
          {['A', 'B', 'C'].map(translation => {
            const translatorKey = guess[translation];
            const translatorName = translatorLabels[translatorKey] || '미선택';
            const icon = translatorIcons[translatorKey] || '❓';
            
            return (
              <div key={translation} className="bg-white rounded-lg p-3 flex items-center justify-between border">
                <span className="font-medium text-gray-700">번역문 {translation}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xl">{icon}</span>
                  <span className="px-3 py-1 bg-blue-100 rounded-full text-blue-800 font-medium text-sm">
                    {translatorName}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // AI 평가 영역 내 번역자 추측 정답 섹션 추가
  function renderCorrectTranslatorsSection(problem: any) {
    if (!problem) return null;
    const translatorLabels = {
      'ChatGPT_번역': 'ChatGPT',
      'Gemini_번역': 'Gemini',
      'human': '인간 번역자',
    };
    const translatorIcons = {
      'ChatGPT_번역': '🤖',
      'Gemini_번역': '✨',
      'human': '👤',
    };
    // 번역문 A: ChatGPT, B: Gemini, C: 인간 번역자(예시)
    const mapping = [
      { key: 'A', trKey: 'ChatGPT_번역' },
      { key: 'B', trKey: 'Gemini_번역' },
      { key: 'C', trKey: 'human' },
    ];
    return (
      <div className="p-4 bg-green-50 rounded-lg border border-green-200">
        <h4 className="font-semibold text-green-800 mb-3 flex items-center gap-2">
          <span>🤖</span>번역자 추측 정답
        </h4>
        <div className="space-y-3">
          {mapping.map(({ key, trKey }) => (
            <div key={key} className="bg-white rounded-lg p-3 flex items-center justify-between border">
              <span className="font-medium text-gray-700">번역문 {key}</span>
              <div className="flex items-center gap-2">
                <span className="text-xl">{translatorIcons[trKey as keyof typeof translatorIcons]}</span>
                <span className="px-3 py-1 bg-green-100 rounded-full text-green-800 font-medium text-sm">
                  {translatorLabels[trKey as keyof typeof translatorLabels]}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-2" style={{ fontFamily: `'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', 'SimSun', 'Noto Sans KR', 'Apple SD Gothic Neo', Arial, sans-serif` }}>
      {/* 5단계: 다른 문제 풀러가기 버튼 */}
      {currentStep === 5 && (
        <button
          className="mb-4 flex items-center gap-2 text-blue-700 hover:text-blue-900 text-base font-semibold px-4 py-2 rounded hover:bg-blue-100 transition"
          onClick={() => {
            // 단계 초기화
            setCurrentStep(1);
            setUserEvaluation({});
            setAiEvaluation(null);
            setImprovement({ worstTranslation: '', problems: '', suggestion: '', reasoning: '' });
            setScores({
              A: { vocab: 0, grammar: 0, naturalness: 0, spelling: 0 },
              B: { vocab: 0, grammar: 0, naturalness: 0, spelling: 0 },
              C: { vocab: 0, grammar: 0, naturalness: 0, spelling: 0 },
            });
            setRanking({ first: '', second: '', third: '' });
            setGuess({ A: '', B: '', C: '' });
            setAiRankDetailOpen({});
            setStep1Error('');
            setStep2Error('');
            setStep3Error('');
            setStep4Error('');
            setAIError('');
          }}
        >
          <span className="text-xl">🔄</span> 다른 문제 풀러가기
        </button>
      )}
      {/* 1단계: 상단 필터 카드 바로 위에 홈(이전으로) 버튼 */}
      {currentStep === 1 && (
        <button
          className="mb-2 flex items-center gap-2 text-blue-700 hover:text-blue-900 text-base font-semibold px-4 py-2 rounded hover:bg-blue-100 transition"
          onClick={() => navigate('/')}
        >
          <span className="text-xl">🏠</span> 이전으로
        </button>
      )}
      <div className="w-full max-w-7xl mx-auto" style={{ minWidth: '1000px' }}>
        {/* 상단 필터/문제 카드 */}
        <div className="bg-white border border-gray-200 rounded-xl p-8 mb-8 shadow" style={{ minWidth: 0 }}>
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
              <div className="mb-4">
                <p className="font-bold mb-2 text-gray-700 text-xl">아래 문장을 번역 평가해 주세요.</p>
                <div className="bg-blue-100 border border-blue-300 rounded-lg px-6 py-4 text-blue-900 text-base flex items-center gap-4 mb-2" style={{minHeight:'80px'}}>
                  <span className="font-medium text-lg flex-1" style={{whiteSpace:'normal', display:'flex', alignItems:'center'}}>{problem["한국어"]}</span>
                </div>
              </div>
              <div className="flex justify-center gap-3 mt-2">
                <button className="bg-white border border-gray-300 px-6 py-2 rounded-md text-gray-700 hover:bg-gray-100" onClick={handlePrevProblem} disabled={currentIndex === 0} type="button">← 이전 문제</button>
                <button className="bg-white border border-gray-300 px-6 py-2 rounded-md text-gray-700 hover:bg-gray-100" onClick={handleNextProblem} disabled={currentIndex === problems.length - 1} type="button">다음 문제 →</button>
              </div>
              <div className="text-center text-gray-500 mb-2">{problems.length > 0 ? `${currentIndex + 1} / ${problems.length}` : ''}</div>
            </>
          ) : (
            <div className="text-gray-500 text-center">문제가 없습니다. 필터를 변경해 보세요.</div>
          )}
        </div>
        {/* 평가 단계 카드 */}
        <div className="max-w-6xl mx-auto rounded-2xl shadow-lg p-0" style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', minWidth: '1000px' }}>
          <div className="p-8">
            {/* 헤더/진행률 */}
            <div className="mb-8">
              <h1 className="text-2xl font-bold text-center mb-2 text-white">🎯 AI 번역 평가자</h1>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div
                  className="bg-green-500 h-3 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                ></div>
              </div>
              <div className="flex justify-center gap-4 mt-4">
                {[1,2,3,4,5].map(step => (
                  <div key={step} className={`flex flex-col items-center ${currentStep === step ? 'font-bold text-indigo-600' : 'text-gray-400'}`}> 
                    <div className={`w-8 h-8 flex items-center justify-center rounded-full border-2 ${currentStep === step ? 'border-indigo-600 bg-indigo-100' : 'border-gray-300 bg-white'}`}>{step}</div>
                    <span className="text-xs mt-1">{['개선제안','채점','순위','번역자','비교'][step-1]}</span>
                  </div>
                ))}
              </div>
            </div>
            {/* 진행 인디케이터 아래에 1단계 안내 문구(흰색 텍스트, 배경 없음) */}
            {currentStep === 1 && (
              <div className="w-full max-w-xl mx-auto mt-8 mb-6">
                <span className="font-bold text-white block text-lg text-center">1단계 🎯 AI 번역 평가: 아래 3개의 번역문 중 가장 아쉬운 번역을 골라주세요.</span>
              </div>
            )}
            {/* 단계별 UI (기존 평가 단계 UI 그대로) */}
            <div className="relative min-h-[300px] flex flex-col items-center justify-center w-full">
              {/* 1~4단계 모두 번역문 카드 상단 고정 */}
              {currentStep >= 1 && currentStep <= 4 && renderTranslationCards()}
              {currentStep === 1 && (
                <div className="w-full max-w-xl">
                  <div className="mb-4">
                    <label className="block font-semibold mb-1 text-white">문제점 분석</label>
                    <textarea
                      className="w-full border rounded px-3 py-2 min-h-[60px]"
                      placeholder="구체적인 문제점을 1-2줄로 작성해주세요."
                      value={improvement.problems}
                      onChange={e => setImprovement(impr => ({ ...impr, problems: e.target.value }))}
                    />
                  </div>
                  <div className="mb-4">
                    <label className="block font-semibold mb-1 text-white">개선안</label>
                    <textarea
                      className="w-full border rounded px-3 py-2 min-h-[60px]"
                      placeholder="구체적인 개선된 번역문을 작성해주세요."
                      value={improvement.suggestion}
                      onChange={e => setImprovement(impr => ({ ...impr, suggestion: e.target.value }))}
                    />
                  </div>
                  <div className="mb-4">
                    <label className="block font-semibold mb-1 text-white">개선 근거</label>
                    <textarea
                      className="w-full border rounded px-3 py-2 min-h-[40px]"
                      placeholder="왜 이렇게 수정했는지 1줄로 작성해주세요."
                      value={improvement.reasoning}
                      onChange={e => setImprovement(impr => ({ ...impr, reasoning: e.target.value }))}
                    />
                  </div>
                  {step1Error && <div className="text-red-200 font-semibold mb-2">{step1Error}</div>}
                </div>
              )}
              {currentStep === 2 && (
                <div className="w-full max-w-2xl">
                  <h2 className="text-lg font-bold mb-4 text-white">2단계: 아래 4개 항목에 점수를 매겨주세요</h2>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {translations.map(t => (
                      <div key={t} className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                        <div className="font-bold mb-2">번역문 {t}</div>
                        {categories.map(cat => (
                          <div key={cat.key} className="mb-3">
                            <div className="text-sm font-semibold mb-1">{cat.label}</div>
                            {renderStars(scores[t][cat.key], v => setScores((prev: any) => ({ ...prev, [t]: { ...prev[t], [cat.key]: v } })))}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                  {step2Error && <div className="text-red-500 font-semibold mt-4">{step2Error}</div>}
                </div>
              )}
              {currentStep === 3 && (
                <div className="w-full max-w-xl">
                  <h2 className="text-lg font-bold mb-4 text-white">3단계: 번역 품질 순위 매기기</h2>
                  <div className="mb-6">
                    <div className="font-semibold mb-2">🥇 1위 (가장 좋은 번역)</div>
                    <div className="flex justify-center gap-4 mb-4">
                      {translations.map(t => renderRankButton('first', t))}
                    </div>
                    <div className="font-semibold mb-2">🥈 2위</div>
                    <div className="flex justify-center gap-4 mb-4">
                      {translations.map(t => renderRankButton('second', t))}
                    </div>
                    <div className="font-semibold mb-2">🥉 3위</div>
                    <div className="flex justify-center gap-4 mb-4">
                      {translations.map(t => renderRankButton('third', t))}
                    </div>
                    {step3Error && <div className="text-red-500 font-semibold mt-2">{step3Error}</div>}
                  </div>
                </div>
              )}
              {currentStep === 4 && (
                <div className="w-full max-w-xl">
                  <h2 className="text-lg font-bold mb-4 text-white">4단계: 번역자 맞추기</h2>
                  {translations.map(t => (
                    <div key={t} className="mb-4">
                      <div className="font-semibold mb-2">번역문 {t}의 번역자는?</div>
                      <div className="flex justify-center gap-4">
                        {translators.map(tr => {
                          // 이미 다른 번역문에서 선택된 번역자는 비활성화
                          const disabled = Object.entries(guess).some(([otherT, v]) => otherT !== t && v === tr.key);
                          const selected = guess[t] === tr.key;
                          return (
                            <button
                              key={tr.key}
                              className={`px-4 py-2 rounded-full border-2 mx-1 font-semibold transition-all ${selected ? 'bg-green-500 text-white border-green-600' : 'bg-white text-gray-700 border-gray-300'} ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                              onClick={() => !disabled && setGuess(g => ({ ...g, [t]: tr.key }))}
                              disabled={disabled}
                              type="button"
                            >
                              {tr.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                  {step4Error && <div className="text-red-500 font-semibold mt-2">{step4Error}</div>}
                </div>
              )}
              {currentStep === 5 && (
                <div className="w-full max-w-6xl mx-auto">
                  <div className="bg-white rounded-xl shadow-lg overflow-hidden">
                    <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-6">
                      <h2 className="text-2xl font-bold text-center text-white mb-2">📊 평가 결과 비교</h2>
                      <p className="text-center text-indigo-100">사용자 평가와 AI 평가를 비교해보세요</p>
                    </div>
                    
                    <div className="p-6">
                      {loadingAI && (
                        <div className="text-center py-12">
                          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mb-4"></div>
                          <p className="text-lg text-gray-600 font-medium">AI 평가 결과를 불러오는 중...</p>
                        </div>
                      )}
                      {aiError && (
                        <div className="text-center py-12">
                          <div className="text-red-500 text-lg font-semibold mb-2">⚠️ 오류 발생</div>
                          <p className="text-red-400">{aiError}</p>
                        </div>
                      )}
                      {!loadingAI && !aiError && aiEvaluation && (
                        <div className="space-y-8">
                          {/* 비교 요약 섹션 */}
                          <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg p-6 border border-blue-200">
                            <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                              <span className="text-2xl">⚖️</span>평가 결과 요약
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                              <div className="text-center">
                                <div className="text-sm text-gray-600 mb-1">아쉬운 번역문</div>
                                <div className="flex justify-center gap-4">
                                  <div className="bg-blue-100 px-3 py-1 rounded-full">
                                    <span className="text-sm font-medium text-blue-800">👤 {userEvaluation.improvement?.worstTranslation}</span>
                                  </div>
                                  <div className="bg-green-100 px-3 py-1 rounded-full">
                                    <span className="text-sm font-medium text-green-800">🤖 {aiEvaluation.improvement?.worstTranslation}</span>
                                  </div>
                                </div>
                              </div>
                              <div className="text-center">
                                <div className="text-sm text-gray-600 mb-1">1위 번역문</div>
                                <div className="flex justify-center gap-4">
                                  <div className="bg-blue-100 px-3 py-1 rounded-full">
                                    <span className="text-sm font-medium text-blue-800">👤 {userEvaluation.ranking?.first}</span>
                                  </div>
                                  <div className="bg-green-100 px-3 py-1 rounded-full">
                                    <span className="text-sm font-medium text-green-800">🤖 {aiEvaluation.ranking?.first?.translation}</span>
                                  </div>
                                </div>
                              </div>
                              <div className="text-center">
                                <div className="text-sm text-gray-600 mb-1">평가 일치도</div>
                                <div className="text-2xl font-bold">
                                  {userEvaluation.ranking?.first === aiEvaluation.ranking?.first?.translation ? 
                                    <span className="text-green-600">✅ 일치</span> : 
                                    <span className="text-orange-600">❌ 불일치</span>
                                  }
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* 상세 비교 영역 */}
                          <div className="comparison-container grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* 사용자 평가 */}
                            <div className="bg-blue-50 rounded-xl p-6 border border-blue-200 flex flex-col">
                              <div className="flex items-center gap-3 mb-6">
                                <div className="bg-blue-500 rounded-full p-2">
                                  <span className="text-white text-xl">👤</span>
                                </div>
                                <h3 className="text-xl font-bold text-blue-800">사용자 평가</h3>
                              </div>
                              <div className="space-y-4 flex-1 flex flex-col">
                                <div className="comparison-section flex-shrink-0">
                                  {renderImprovementSection(userEvaluation.improvement, "user")}
                                </div>
                                <div className="comparison-section flex-shrink-0">
                                  {renderScoresSection(userEvaluation.scores, "user")}
                                </div>
                                <div className="comparison-section flex-shrink-0">
                                  {renderUserRankingSection(userEvaluation.ranking)}
                                </div>
                                <div className="flex-shrink-0">
                                  {renderGuessSection(userEvaluation.guess)}
                                </div>
                              </div>
                            </div>
                            
                            {/* AI 평가 */}
                            <div className="bg-green-50 rounded-xl p-6 border border-green-200 flex flex-col">
                              <div className="flex items-center gap-3 mb-6">
                                <div className="bg-green-500 rounded-full p-2">
                                  <span className="text-white text-xl">🤖</span>
                                </div>
                                <h3 className="text-xl font-bold text-green-800">AI 평가</h3>
                              </div>
                              <div className="space-y-4 flex-1 flex flex-col">
                                <div className="comparison-section flex-shrink-0">
                                  {renderImprovementSection(aiEvaluation.improvement, "ai")}
                                </div>
                                <div className="comparison-section flex-shrink-0">
                                  {renderScoresSection(aiEvaluation.scores, "ai")}
                                </div>
                                <div className="comparison-section flex-shrink-0">
                                  {renderAIRankingSection(aiEvaluation.ranking, aiRankDetailOpen, setAiRankDetailOpen)}
                                </div>
                                <div className="flex-shrink-0">
                                  {renderCorrectTranslatorsSection(problem)}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
              {/* Gemini 평가 로딩 오버레이 (4단계에서 다음 누를 때) */}
              {loadingAI && (
                <div className="absolute inset-0 bg-white/80 flex flex-col items-center justify-center z-50">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mb-4"></div>
                  <div className="text-lg font-semibold text-indigo-700">AI로부터 피드백을 불러오는 중입니다...</div>
                </div>
              )}
            </div>
            {/* 네비게이션 버튼 (공통) */}
            <div className="flex justify-between mt-8">
              <button onClick={prevStep} disabled={currentStep === 1} className="px-6 py-2 rounded bg-gray-200 text-gray-700 font-semibold disabled:opacity-50">이전</button>
              {currentStep < TOTAL_STEPS ? (
                <button onClick={nextStep} disabled={!problem} className="px-6 py-2 rounded bg-indigo-600 text-white font-semibold disabled:opacity-50">다음</button>
              ) : (
                <button 
                  onClick={() => navigate('/')}
                  className="px-6 py-2 rounded bg-green-600 text-white font-semibold hover:bg-green-700 transition flex items-center gap-2"
                >
                  <span>🏠</span>평가 완료!
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
      {/* 5단계: 챗봇 위젯 (우측 하단 고정) */}
      {currentStep === 5 && (
        <div style={{ position: 'fixed', bottom: 32, right: 32, zIndex: 101, width: 360, maxWidth: '90vw' }}>
          <ChatbotWidget
            initialContext={
              aiEvaluation && aiEvaluation.improvement
                ? `AI 평가 요약\n- 아쉬운 번역문: ${aiEvaluation.improvement.worstTranslation}\n- 문제점: ${aiEvaluation.improvement.problems}\n- 개선안: ${aiEvaluation.improvement.suggestion}\n- 근거: ${aiEvaluation.improvement.reasoning}`
                : 'AI 평가 결과가 준비되면 요약이 제공됩니다.'
            }
          />
        </div>
      )}
    </div>
  );
} 