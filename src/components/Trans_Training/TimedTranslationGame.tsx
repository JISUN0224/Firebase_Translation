import React, { useState, useEffect, useRef } from 'react';
import { collection, getDocs, QuerySnapshot, type DocumentData } from 'firebase/firestore';
import { db } from '../../firebase';
import ChatbotWidget from '../../ChatbotWidget';
import { useNavigate } from 'react-router-dom';

interface Problem {
  id: string;
  분야: string;
  한국어: string;
  중국어: string;
  ChatGPT_번역?: string;
  Gemini_번역?: string;
  난이도: string;
  중국어_글자수: number;
  주요어휘: Array<{
    chinese: string;
    pinyin: string;
    korean: string;
    importance: string;
  }>;
  한국어_어절수?: number;
}

interface EvaluationResult {
  userAnswer: string;
  similarities: {
    chatgpt: number;
    gemini: number;
    human: number;
  };
  timeUsage: {
    percentage: number;
    category: 'fast' | 'optimal' | 'slow';
  };
  score: number;
  feedback: string;
  isPerfectMatch: boolean;
}

interface GameState {
  remainingTime: number;
  totalTime: number;
  currentProblem: number;
  totalProblems: number;
  userAnswer: string;
  gameStatus: 'ready' | 'playing' | 'paused' | 'finished';
  score: number;
  usedHints: number;
  usedExtensions: number;
  problems: Problem[];
  currentProblemIndex: number;
  userAnswers: string[];
  submissions: boolean[];
  consecutiveCorrect: number;
  consecutiveWrong: number;
  averageAccuracy: number;
  timeAdjustment: number;
  problemStartTime: number;
  availableExtensions: number;
  availableHints: number;
  availablePasses: number;
  usedItemsPerProblem: Record<number, {
    usedHint: boolean;
    usedExtension: boolean;
    usedPass: boolean;
  }>;
  currentHint: string | null;
  showAutoHint: boolean;
  evaluationResult: EvaluationResult | null;
  showEvaluation: boolean;
  currentScore: number;
  evaluationHistory: EvaluationResult[];
}

// 샘플 문제 데이터
const sampleProblems: Problem[] = [
  {
    id: "KO-ZH-2020-KPOP-000001",
    분야: "K-POP(한류)/대중문화공연콘텐츠",
    한국어: "그 시점에서는 윤 씨에게 직접 억울한 옥살이 실상을 듣는 것이 다급했다.",
    중국어: "此时,急于直接向尹某了解冤狱的真相。",
    ChatGPT_번역: "当时，急于直接向尹某了解冤狱的真相。",
    Gemini_번역: "在那个时候，急于直接向尹某了解冤狱的真相。",
    난이도: "중",
    중국어_글자수: 16,
    주요어휘: [
      {
        chinese: "冤狱",
        pinyin: "yuānyù",
        korean: "억울한 옥살이",
        importance: "높음"
      }
    ]
  },
  {
    id: "KO-ZH-2020-KPOP-000002",
    분야: "일상/회화",
    한국어: "오늘은 날씨가 맑아요.",
    중국어: "今天的天气很晴朗。",
    ChatGPT_번역: "今天的天气很晴朗。",
    Gemini_번역: "今天天气很晴朗。",
    난이도: "하",
    중국어_글자수: 9,
    주요어휘: []
  }
];

// 어절수 계산 함수
const getKoreanWordCount = (text: string): number => {
  return text.trim().split(/\s+/).length;
};

// 시간 계산 함수 (한국어 어절수 기반)
const calculateBaseTime = (problem: Problem): number => {
  const wordCount = problem.한국어_어절수 ?? getKoreanWordCount(problem.한국어);
  const baseTime = wordCount * 3;
  const difficultyMultiplier: Record<string, number> = {
    '상': 1.5,
    '중': 1.2,
    '하': 1.0
  };
  const vocabularyBonus = problem.주요어휘.length * 4;
  const calculatedTime = baseTime * (difficultyMultiplier[problem.난이도] || 1.0) + vocabularyBonus;
  return Math.max(20, Math.min(120, Math.round(calculatedTime)));
};

// 문제 데이터에 어절수 필드 보장 (샘플 데이터/불러올 때)
const ensureKoreanWordCount = (problem: any): Problem & { 한국어_어절수: number } => {
  return {
    ...problem,
    한국어_어절수: problem.한국어_어절수 ?? getKoreanWordCount(problem.한국어)
  };
};

const calculateDynamicTime = (baseTime: number, gameState: GameState): number => {
  let adjustedTime = baseTime;
  adjustedTime -= gameState.consecutiveCorrect * 5;
  adjustedTime += gameState.consecutiveWrong * 5;
  if (gameState.averageAccuracy < 0.7) {
    adjustedTime *= 1.1;
  }
  adjustedTime += gameState.timeAdjustment;
  return Math.max(15, Math.min(150, Math.round(adjustedTime)));
};

const getTimerColor = (percentage: number): string => {
  if (percentage >= 0.8) return '#4ade80'; // 초록
  if (percentage >= 0.5) return '#fbbf24'; // 노랑
  if (percentage >= 0.3) return '#f97316'; // 주황
  return '#ef4444'; // 빨강
};

const shouldShowUrgencyEffect = (remainingTime: number, totalTime: number): boolean => {
  return (remainingTime / totalTime) < 0.3;
};

// 간단한 문자열 유사도 계산 (Levenshtein 거리 기반)
const calculateSimilarity = (text1: string, text2: string): number => {
  const len1 = text1.length;
  const len2 = text2.length;
  
  if (len1 === 0) return len2 === 0 ? 100 : 0;
  if (len2 === 0) return 0;
  
  const matrix = Array(len1 + 1).fill(null).map(() => Array(len2 + 1).fill(null));
  
  for (let i = 0; i <= len1; i++) matrix[i][0] = i;
  for (let j = 0; j <= len2; j++) matrix[0][j] = j;
  
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = text1[i - 1] === text2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  
  const distance = matrix[len1][len2];
  const similarity = (1 - distance / Math.max(len1, len2)) * 100;
  return Math.max(0, Math.round(similarity));
};

// AI 피드백 생성 (간단명료)
const generateFeedback = (evaluation: Omit<EvaluationResult, 'feedback'>): string => {
  const { similarities, timeUsage, isPerfectMatch } = evaluation;
  const maxSimilarity = Math.max(...Object.values(similarities));
  
  let feedback = '';
  
  // 정확도 피드백
  if (isPerfectMatch) {
    feedback += '🎯 완벽한 번역! ';
  } else if (maxSimilarity >= 90) {
    feedback += '👍 아주 좋은 번역! ';
  } else if (maxSimilarity >= 80) {
    feedback += '✅ 좋은 번역! ';
  } else if (maxSimilarity >= 70) {
    feedback += '📝 괜찮은 번역! ';
  } else {
    feedback += '💪 더 연습해보세요! ';
  }
  
  // 시간 피드백
  if (timeUsage.category === 'fast') {
    feedback += '⚡ 빠른 속도!';
  } else if (timeUsage.category === 'optimal') {
    feedback += '⏰ 적정 속도!';
  } else {
    feedback += '🐌 좀 더 빠르게!';
  }
  
  return feedback;
};

// 답안 평가
const evaluateAnswer = (userAnswer: string, problem: Problem, timeUsed: number, totalTime: number, consecutiveCorrect: number): EvaluationResult => {
  const cleanUserAnswer = userAnswer.trim().replace(/\s+/g, '');
  
  // 기준 번역들과 유사도 계산
  const similarities = {
    chatgpt: calculateSimilarity(cleanUserAnswer, problem.ChatGPT_번역?.replace(/\s+/g, '') || ''),
    gemini: calculateSimilarity(cleanUserAnswer, problem.Gemini_번역?.replace(/\s+/g, '') || ''),
    human: calculateSimilarity(cleanUserAnswer, problem.중국어.replace(/\s+/g, ''))
  };
  
  // 시간 사용량 분석
  const timePercentage = (timeUsed / totalTime) * 100;
  const timeCategory: 'fast' | 'optimal' | 'slow' = timePercentage <= 50 ? 'fast' : timePercentage <= 70 ? 'optimal' : 'slow';
  
  // 완벽 매칭 확인
  const isPerfectMatch = similarities.human === 100 || 
                        similarities.chatgpt === 100 || 
                        similarities.gemini === 100;
  
  // 점수 계산
  const maxSimilarity = Math.max(...Object.values(similarities));
  let score = 70; // 기본 점수
  
  // 시간 보너스
  if (timeCategory === 'fast') score += 20;
  else if (timeCategory === 'optimal') score += 10;
  
  // 유사도 보너스
  if (maxSimilarity >= 90) score += 20;
  else if (maxSimilarity >= 80) score += 10;
  
  // 완벽 매칭 보너스
  if (isPerfectMatch) score += 30;
  
  // 연속 정답 보너스
  score += consecutiveCorrect * 5;
  
  const evaluationData = {
    userAnswer,
    similarities,
    timeUsage: { percentage: timePercentage, category: timeCategory },
    score,
    isPerfectMatch
  };
  
  const feedback = generateFeedback(evaluationData);
  
  return {
    ...evaluationData,
    feedback
  };
};

const initialGameState: GameState = {
  remainingTime: 60,
  totalTime: 60,
  currentProblem: 1,
  totalProblems: sampleProblems.length,
  userAnswer: '',
  gameStatus: 'ready',
  score: 0,
  usedHints: 0,
  usedExtensions: 0,
  problems: [],
  currentProblemIndex: 0,
  userAnswers: Array(sampleProblems.length).fill(''),
  submissions: Array(sampleProblems.length).fill(false),
  consecutiveCorrect: 0,
  consecutiveWrong: 0,
  averageAccuracy: 1,
  timeAdjustment: 0,
  problemStartTime: 0,
  availableExtensions: 1,
  availableHints: 1,
  availablePasses: 1,
  usedItemsPerProblem: {},
  currentHint: null,
  showAutoHint: false,
  evaluationResult: null,
  showEvaluation: false,
  currentScore: 0,
  evaluationHistory: []
};

const languagePairs = ['한-중', '중-한'];
const availableDifficulties = ['전체', '상', '중', '하'];

const TimedTranslationGame: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>(initialGameState);
  const [streakNotification, setStreakNotification] = useState('');
  const [notification, setNotification] = useState<{ message: string; type: string } | null>(null);
  const [difficulty, setDifficulty] = useState<string>('전체');
  const [domain, setDomain] = useState<string>('전체');
  const [targetLanguage, setTargetLanguage] = useState<string>('한-중');
  const [availableDomains, setAvailableDomains] = useState<string[]>(['전체']);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const navigate = useNavigate();

  // Firebase에서 문제 데이터 불러오기 및 필터링
  useEffect(() => {
    const fetchProblems = async () => {
      try {
        const querySnapshot: QuerySnapshot<DocumentData> = await getDocs(collection(db, 'translationContents'));
        let loadedProblems: Problem[] = [];
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          loadedProblems.push(ensureKoreanWordCount(data) as Problem);
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
        setGameState(prev => ({
          ...prev,
          problems: filtered,
          totalProblems: filtered.length,
          userAnswers: Array(filtered.length).fill(''),
          submissions: Array(filtered.length).fill(false),
          usedItemsPerProblem: {},
          currentProblemIndex: 0,
          userAnswer: '',
          currentHint: null,
          showAutoHint: false,
          evaluationResult: null,
          showEvaluation: false,
          currentScore: 0,
          evaluationHistory: [],
          gameStatus: 'ready',
        }));
      } catch (err) {
        setGameState(prev => ({ 
          ...prev, 
          problems: [], 
          totalProblems: 0, 
          evaluationResult: null,
          showEvaluation: false,
          currentScore: 0,
          evaluationHistory: [],
          gameStatus: 'ready' 
        }));
      }
    };
    fetchProblems();
  }, [difficulty, domain]);

  // 타이머 useEffect 개선
  useEffect(() => {
    if (gameState.gameStatus === 'playing') {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        setGameState(prev => {
          // 자동 힌트 체크
          const timePercentage = prev.remainingTime / prev.totalTime;
          const currentProblemItems = prev.usedItemsPerProblem[prev.currentProblemIndex] || {};
          let autoHintState = {};
          if (
            timePercentage <= 0.3 &&
            !prev.showAutoHint &&
            !currentProblemItems.usedHint &&
            prev.problems[prev.currentProblemIndex]?.주요어휘.length > 0
          ) {
            const autoHint = prev.problems[prev.currentProblemIndex].주요어휘[0];
            autoHintState = {
              currentHint: `🎁 자동 힌트: ${autoHint.chinese}(${autoHint.pinyin})`,
              showAutoHint: true
            };
            showNotification('🎁 자동 힌트가 제공되었습니다!', 'info');
          }
          if (prev.remainingTime <= 1) {
            clearInterval(timerRef.current!);
            return { ...prev, remainingTime: 0, gameStatus: 'finished', ...autoHintState };
          }
          return {
            ...prev,
            remainingTime: prev.remainingTime - 1,
            ...autoHintState
          };
        });
      }, 1000);
      return () => {
        if (timerRef.current) clearInterval(timerRef.current);
      };
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [gameState.gameStatus, gameState.currentProblemIndex, gameState.totalTime]);

  // 문제 시작 시 동적 시간 계산 및 타이머/아이템 상태 초기화
  const startNewProblem = (problemIndex: number, status: 'ready' | 'playing' = 'ready') => {
    const currentProblem = gameState.problems[problemIndex];
    if (!currentProblem) return;
    const baseTime = calculateBaseTime(currentProblem);
    const dynamicTime = calculateDynamicTime(baseTime, gameState);
    setGameState(prev => ({
      ...prev,
      totalTime: dynamicTime,
      remainingTime: dynamicTime,
      problemStartTime: Date.now(),
      currentProblemIndex: problemIndex,
      userAnswer: prev.userAnswers[problemIndex] || '',
      currentHint: null,
      showAutoHint: false,
      gameStatus: status,
    }));
  };

  // 연속 정답/오답 통계 업데이트
  const updateConsecutiveStats = (isCorrect: boolean) => {
    setGameState(prev => {
      const newCorrect = isCorrect ? prev.consecutiveCorrect + 1 : 0;
      const newWrong = !isCorrect ? prev.consecutiveWrong + 1 : 0;
      return {
        ...prev,
        consecutiveCorrect: newCorrect,
        consecutiveWrong: newWrong
      };
    });
    if (isCorrect && gameState.consecutiveCorrect + 1 >= 3) {
      setStreakNotification(`🔥 ${gameState.consecutiveCorrect + 1}연속 정답!`);
      setTimeout(() => setStreakNotification(''), 1500);
    }
  };

  // 평균 정답률 계산
  const updateAverageAccuracy = () => {
    const total = gameState.submissions.filter(Boolean).length;
    if (total === 0) return;
    const correct = gameState.userAnswers.reduce((acc, ans, idx) => {
      if (!gameState.submissions[idx]) return acc;
      return acc + (ans.trim() === gameState.problems[idx]?.중국어.trim() ? 1 : 0);
    }, 0);
    setGameState(prev => ({ ...prev, averageAccuracy: correct / total }));
  };

  // 알림 표시 함수
  const showNotification = (message: string, type: string) => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 1500);
  };

  // 시간연장 사용
  const useTimeExtension = () => {
    if (
      gameState.availableExtensions > 0 &&
      gameState.remainingTime <= 10 &&
      !(gameState.usedItemsPerProblem[gameState.currentProblemIndex]?.usedExtension)
    ) {
      setGameState(prev => ({
        ...prev,
        availableExtensions: prev.availableExtensions - 1,
        remainingTime: prev.remainingTime + 15,
        totalTime: prev.totalTime + 15,
        usedItemsPerProblem: {
          ...prev.usedItemsPerProblem,
          [prev.currentProblemIndex]: {
            ...prev.usedItemsPerProblem[prev.currentProblemIndex],
            usedExtension: true
          }
        }
      }));
      showNotification('⏰ 시간 연장! +15초', 'success');
    }
  };

  // 힌트 사용
  const useHint = () => {
    if (
      gameState.availableHints > 0 &&
      !gameState.usedItemsPerProblem[gameState.currentProblemIndex]?.usedHint &&
      gameState.problems[gameState.currentProblemIndex]?.주요어휘.length > 0
    ) {
      const vocab = gameState.problems[gameState.currentProblemIndex].주요어휘[0];
      setGameState(prev => ({
        ...prev,
        availableHints: prev.availableHints - 1,
        currentHint: `💡 ${vocab.chinese}(${vocab.pinyin}) = ${vocab.korean}`,
        usedItemsPerProblem: {
          ...prev.usedItemsPerProblem,
          [prev.currentProblemIndex]: {
            ...prev.usedItemsPerProblem[prev.currentProblemIndex],
            usedHint: true
          }
        },
        showAutoHint: false
      }));
      showNotification('💡 힌트 사용!', 'info');
    }
  };

  // 패스 사용
  const usePass = () => {
    if (
      gameState.availablePasses > 0 &&
      !gameState.usedItemsPerProblem[gameState.currentProblemIndex]?.usedPass
    ) {
      setGameState(prev => ({
        ...prev,
        availablePasses: prev.availablePasses - 1,
        score: Math.max(0, prev.score - 10),
        usedItemsPerProblem: {
          ...prev.usedItemsPerProblem,
          [prev.currentProblemIndex]: {
            ...prev.usedItemsPerProblem[prev.currentProblemIndex],
            usedPass: true
          }
        }
      }));
      showNotification('⏭️ 문제 패스! (-10점)', 'warning');
      setTimeout(() => {
        if (gameState.currentProblemIndex < gameState.totalProblems - 1) {
          startNewProblem(gameState.currentProblemIndex + 1, 'ready');
        }
      }, 500);
    }
  };

  // 문제 제출
  const submitAnswer = () => {
    const problem = gameState.problems[gameState.currentProblemIndex];
    if (!problem) return;
    
    const timeUsed = gameState.totalTime - gameState.remainingTime;
    const evaluation = evaluateAnswer(gameState.userAnswer, problem, timeUsed, gameState.totalTime, gameState.consecutiveCorrect);
    
    const newAnswers = [...gameState.userAnswers];
    const newSubmissions = [...gameState.submissions];
    newAnswers[gameState.currentProblemIndex] = gameState.userAnswer;
    newSubmissions[gameState.currentProblemIndex] = true;
    
    const isCorrect = evaluation.isPerfectMatch || evaluation.similarities.human >= 80;
    updateConsecutiveStats(isCorrect);
    
    setGameState(prev => ({
      ...prev,
      userAnswers: newAnswers,
      submissions: newSubmissions,
      userAnswer: '',
      score: prev.score + evaluation.score,
      currentScore: prev.currentScore + evaluation.score,
      evaluationResult: evaluation,
      showEvaluation: true,
      evaluationHistory: Array.isArray(prev.evaluationHistory) ? [...prev.evaluationHistory, evaluation] : [evaluation],
      currentHint: null,
      showAutoHint: false
    }));
  };

  // 엔터키 제출
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!gameState.submissions[gameState.currentProblemIndex]) submitAnswer();
    }
  };

  // 이전/다음 문제 이동
  const goToNextProblem = () => {
    if (gameState.currentProblemIndex < gameState.totalProblems - 1) {
      startNewProblem(gameState.currentProblemIndex + 1, 'ready');
    }
  };
  const goToPreviousProblem = () => {
    if (gameState.currentProblemIndex > 0) {
      startNewProblem(gameState.currentProblemIndex - 1, 'ready');
    }
  };

  // 입력 변경
  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setGameState(prev => ({ ...prev, userAnswer: e.target.value }));
  };

  // 컨트롤 버튼 핸들러 (기존 유지)
  const handleStart = () => {
    if (gameState.problems.length > 0) {
      startNewProblem(gameState.currentProblemIndex, 'playing');
    }
  };
  const handlePause = () => setGameState(prev => ({ ...prev, gameStatus: 'paused' }));
  const handleResume = () => setGameState(prev => ({ ...prev, gameStatus: 'playing' }));

  // 필터 핸들러
  const handleDifficultyChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setDifficulty(e.target.value);
  };
  const handleDomainChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setDomain(e.target.value);
  };
  const handleTargetLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setTargetLanguage(e.target.value);
  };

  // 타이머 퍼센트 및 색상
  const timerPercent = (gameState.remainingTime / gameState.totalTime);
  const timerColor = getTimerColor(timerPercent);
  const urgency = shouldShowUrgencyEffect(gameState.remainingTime, gameState.totalTime);
  const timerClass = urgency ? 'animate-pulse' : '';

  // 개선된 가이드 패널
  const GuidePanel: React.FC = () => {
    // 실제 남은 횟수 state 연동
    const remainExtension = gameState.availableExtensions;
    const remainHint = gameState.availableHints;
    const remainPass = gameState.availablePasses;
    // 시간 계산 방식 접기/펼치기 state
    const [showTimeCalc, setShowTimeCalc] = useState(true);
    return (
      <div className="guide-panel bg-white rounded-2xl shadow-lg p-6 flex flex-col gap-7 min-w-[320px] max-w-[370px]">
        {/* 헤더 */}
        <div className="guide-header flex items-center gap-2 mb-2 pb-3 border-b border-gray-100">
          <span className="text-2xl">📚</span>
          <h3 className="text-2xl font-extrabold text-gray-900">게임 가이드</h3>
        </div>
        {/* 사용 가능한 도구 */}
        <div>
          <div className="text-gray-500 font-bold text-base mb-3">사용 가능한 도구</div>
          <div className="flex flex-col gap-3">
            <div className="action-item flex items-center justify-between bg-gray-50 rounded-xl px-5 py-3">
              <div className="action-info flex items-center gap-3">
                <span className="action-icon text-xl">⏰</span>
                <div className="action-details flex flex-col">
                  <span className="action-text font-bold text-gray-900 text-base">시간 연장</span>
                  <span className="action-desc text-gray-500 text-sm">+15초 추가</span>
                </div>
              </div>
              <span className="action-count bg-indigo-600 text-white px-4 py-1 rounded-full text-sm font-bold">{remainExtension}회 남음</span>
            </div>
            <div className="action-item flex items-center justify-between bg-gray-50 rounded-xl px-5 py-3">
              <div className="action-info flex items-center gap-3">
                <span className="action-icon text-xl">💡</span>
                <div className="action-details flex flex-col">
                  <span className="action-text font-bold text-gray-900 text-base">힌트 보기</span>
                  <span className="action-desc text-gray-500 text-sm">주요어휘 표시</span>
                </div>
              </div>
              <span className="action-count bg-indigo-600 text-white px-4 py-1 rounded-full text-sm font-bold">{remainHint}회 남음</span>
            </div>
            <div className="action-item flex items-center justify-between bg-gray-50 rounded-xl px-5 py-3">
              <div className="action-info flex items-center gap-3">
                <span className="action-icon text-xl">⏭️</span>
                <div className="action-details flex flex-col">
                  <span className="action-text font-bold text-gray-900 text-base">문제 패스</span>
                  <span className="action-desc text-gray-500 text-sm">건너뛰기 (-10점)</span>
                </div>
              </div>
              <span className="action-count bg-indigo-600 text-white px-4 py-1 rounded-full text-sm font-bold">{remainPass}회 남음</span>
            </div>
          </div>
        </div>
        {/* 시간 계산 방식 */}
        <div className={`mt-2 ${showTimeCalc ? 'border border-purple-300' : ''} rounded-xl bg-purple-50/30`}> 
          <div className="calculation-header flex items-center gap-2 px-4 py-3 cursor-pointer select-none" onClick={() => setShowTimeCalc(v => !v)}>
            <span className="text-lg">⏱️</span>
            <h4 className="font-bold text-purple-700 text-base">시간 계산 방식</h4>
            <span className="ml-auto text-lg">{showTimeCalc ? '▼' : '▲'}</span>
          </div>
          {showTimeCalc && (
            <div className="calculation-details px-5 pb-4 text-gray-700 text-[15px] leading-relaxed text-justify">
              <div><b>기본시간:</b> 한국어 어절수 × 3초</div>
              <div><b>난이도:</b> 상급(1.5배), 중급(1.2배), 하급(1.0배)</div>
              <div><b>어휘보너스:</b> 주요어휘 × 4초</div>
            </div>
          )}
        </div>
        {/* 학습 효과 */}
        <div className="learning-tips bg-green-50 border border-green-200 rounded-xl px-5 py-4">
          <h4 className="flex items-center gap-2 text-green-800 font-bold text-base mb-2"><span>🎯</span>학습 효과</h4>
          <ul className="list-disc ml-5 text-green-900 text-[15px] space-y-1 text-justify">
            <li>빠른 사고력과 집중력 향상</li>
            <li>실전 통역 감각 훈련</li>
            <li>핵심 어휘 학습 강화</li>
            <li>시간 압박 상황 적용</li>
          </ul>
        </div>
      </div>
    );
  };

  // 렌더링 부분 (gameStatus === 'ready' 조건부 안내 제거)
  return (
    <div className="flex flex-col md:flex-row gap-8 max-w-6xl mx-auto mt-10 p-4 items-start">
      {/* 왼쪽: 기존 게임 UI */}
      <div className="flex-1 min-w-0">
        {/* 상단 홈으로 돌아가기 버튼 */}
        <div className="w-full flex items-center mb-2">
          <button
            className="flex items-center gap-1 text-indigo-700 font-bold text-base hover:underline hover:text-indigo-900 transition-colors px-2 py-1 rounded focus:outline-none"
            onClick={() => navigate('/')}
          >
            <span className="text-xl">🏠</span>
            <span>&lt;-이전으로</span>
          </button>
        </div>
        {/* 기존 게임 UI 전체를 이 div 안에 넣음 (상단 필터~챗봇까지) */}
        <div className="max-w-2xl w-full mx-auto p-8 bg-white rounded-2xl shadow-lg flex flex-col items-center gap-8">
          {/* 상단 필터 영역 */}
          <div className="flex flex-wrap gap-3 mb-4 w-full justify-center">
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
          {/* 문제 헤더 */}
          <div className="w-full flex flex-col gap-1 mb-2">
            <div className="flex justify-between items-center">
              <span className="text-gray-500 text-sm">분야: {gameState.problems[gameState.currentProblemIndex]?.분야 || '-'}</span>
              <span className="text-gray-500 text-sm">난이도: {gameState.problems[gameState.currentProblemIndex]?.난이도 || '-'}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-500 text-sm">문제 {gameState.currentProblemIndex + 1} / {gameState.totalProblems}</span>
              <span className="text-gray-500 text-sm">점수: {gameState.currentScore}</span>
            </div>
          </div>
          {/* 타이머 및 스트릭/알림 */}
          <div className="relative w-32 h-32 flex items-center justify-center">
            <svg className={`w-full h-full rotate-[-90deg] ${timerClass}`} viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="45" fill="none" stroke="#e5e7eb" strokeWidth="10" />
              <circle
                cx="50" cy="50" r="45" fill="none"
                strokeWidth="10"
                style={{ stroke: timerColor }}
                strokeDasharray={2 * Math.PI * 45}
                strokeDashoffset={2 * Math.PI * 45 * (1 - timerPercent)}
                strokeLinecap="round"
              />
            </svg>
            <span className="absolute text-2xl font-bold text-gray-700">{gameState.remainingTime}s</span>
            {urgency && (
              <span className="absolute bottom-2 left-1/2 -translate-x-1/2 text-xs text-red-500 font-bold animate-pulse">⏰ 시간 부족!</span>
            )}
            {streakNotification && (
              <span className="absolute top-2 left-1/2 -translate-x-1/2 bg-orange-100 text-orange-700 px-3 py-1 rounded-full text-xs font-bold streak-notification" style={{animation: 'slideInRight 0.3s ease-out'}}> {streakNotification} </span>
            )}
          </div>
          {/* 게임 아이템 버튼들 (타이머 밑에 항상 표시) */}
          <div className="game-items flex gap-3 w-full justify-center mt-2">
            <button
              onClick={useTimeExtension}
              disabled={gameState.gameStatus !== 'playing' || gameState.availableExtensions === 0 || gameState.remainingTime > 10 || gameState.usedItemsPerProblem[gameState.currentProblemIndex]?.usedExtension}
              className={`item-button ${gameState.remainingTime <= 10 ? 'urgent' : ''}`}
            >
              ⏰ 시간연장 ({gameState.availableExtensions})
            </button>
            <button
              onClick={useHint}
              disabled={gameState.gameStatus !== 'playing' || gameState.availableHints === 0 || gameState.usedItemsPerProblem[gameState.currentProblemIndex]?.usedHint || !(gameState.problems[gameState.currentProblemIndex]?.주요어휘.length > 0)}
              className="item-button"
            >
              💡 힌트 ({gameState.availableHints})
            </button>
            <button
              onClick={usePass}
              disabled={gameState.gameStatus !== 'playing' || gameState.availablePasses === 0 || gameState.usedItemsPerProblem[gameState.currentProblemIndex]?.usedPass}
              className="item-button pass-button"
            >
              ⏭️ 패스 ({gameState.availablePasses})
            </button>
          </div>
          {/* 힌트 표시 영역 */}
          {gameState.currentHint && (
            <div className="hint-display">
              {gameState.currentHint}
            </div>
          )}
          
          {/* 평가 결과 패널 */}
          {gameState.showEvaluation && gameState.evaluationResult && (
            <div className="evaluation-panel bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-xl p-6 w-full">
              <h3 className="text-xl font-bold text-blue-900 mb-4 text-center">평가 결과</h3>
              
              {/* 피드백 */}
              <div className="feedback bg-white rounded-lg p-4 mb-4 text-center text-lg font-semibold text-gray-800">
                {gameState.evaluationResult.feedback}
              </div>
              
              {/* 점수 */}
              <div className="score-display bg-gradient-to-r from-green-400 to-blue-500 text-white rounded-lg p-3 mb-4 text-center text-2xl font-bold">
                +{gameState.evaluationResult.score}점
              </div>
              
              {/* 유사도 비교 */}
              <div className="similarity-comparison bg-white rounded-lg p-4 mb-4">
                <h4 className="text-lg font-semibold text-gray-800 mb-3 text-center">번역 비교</h4>
                <div className="space-y-3">
                  <div className="translation-item flex justify-between items-center p-2 bg-gray-50 rounded">
                    <span className="font-medium text-gray-700">인간 번역:</span>
                    <span className="text-sm text-gray-600 flex-1 mx-2 text-center">{gameState.problems[gameState.currentProblemIndex]?.중국어}</span>
                    <span className={`similarity font-bold px-2 py-1 rounded ${gameState.evaluationResult.similarities.human >= 90 ? 'bg-green-100 text-green-700' : gameState.evaluationResult.similarities.human >= 80 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                      {gameState.evaluationResult.similarities.human}%
                    </span>
                  </div>
                  <div className="translation-item flex justify-between items-center p-2 bg-gray-50 rounded">
                    <span className="font-medium text-gray-700">ChatGPT:</span>
                    <span className="text-sm text-gray-600 flex-1 mx-2 text-center">{gameState.problems[gameState.currentProblemIndex]?.ChatGPT_번역}</span>
                    <span className={`similarity font-bold px-2 py-1 rounded ${gameState.evaluationResult.similarities.chatgpt >= 90 ? 'bg-green-100 text-green-700' : gameState.evaluationResult.similarities.chatgpt >= 80 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                      {gameState.evaluationResult.similarities.chatgpt}%
                    </span>
                  </div>
                  <div className="translation-item flex justify-between items-center p-2 bg-gray-50 rounded">
                    <span className="font-medium text-gray-700">Gemini:</span>
                    <span className="text-sm text-gray-600 flex-1 mx-2 text-center">{gameState.problems[gameState.currentProblemIndex]?.Gemini_번역}</span>
                    <span className={`similarity font-bold px-2 py-1 rounded ${gameState.evaluationResult.similarities.gemini >= 90 ? 'bg-green-100 text-green-700' : gameState.evaluationResult.similarities.gemini >= 80 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                      {gameState.evaluationResult.similarities.gemini}%
                    </span>
                  </div>
                </div>
              </div>
              
              {/* 시간 사용량 */}
              <div className="time-usage bg-white rounded-lg p-3 mb-4 text-center">
                <span className="font-semibold text-gray-700">시간 사용: </span>
                <span className={`font-bold ${gameState.evaluationResult.timeUsage.category === 'fast' ? 'text-green-600' : gameState.evaluationResult.timeUsage.category === 'optimal' ? 'text-yellow-600' : 'text-red-600'}`}>
                  {Math.round(gameState.evaluationResult.timeUsage.percentage)}%
                </span>
                <span className="text-sm text-gray-500 ml-2">
                  ({gameState.evaluationResult.timeUsage.category === 'fast' ? '빠름' : gameState.evaluationResult.timeUsage.category === 'optimal' ? '적정' : '느림'})
                </span>
              </div>
              
              <div className="flex gap-3 justify-center">
                <button 
                  onClick={() => setGameState(prev => ({ ...prev, showEvaluation: false }))}
                  className="px-6 py-2 bg-blue-500 text-white font-semibold rounded-lg hover:bg-blue-600"
                >
                  다음 문제로
                </button>
                {gameState.currentProblemIndex < gameState.totalProblems - 1 && (
                  <button 
                    onClick={() => {
                      setGameState(prev => ({ ...prev, showEvaluation: false }));
                      setTimeout(() => {
                        startNewProblem(gameState.currentProblemIndex + 1, 'ready');
                      }, 100);
                    }}
                    className="px-6 py-2 bg-green-500 text-white font-semibold rounded-lg hover:bg-green-600 transition-colors"
                  >
                    자동 진행
                  </button>
                )}
              </div>
            </div>
          )}
          {/* 문제 본문 */}
          {!gameState.showEvaluation && (
            <div className="w-full bg-blue-50 rounded-lg p-4 text-xl text-center font-bold text-blue-900 min-h-[56px] flex items-center justify-center">
              {gameState.problems[gameState.currentProblemIndex]?.한국어 || ''}
            </div>
          )}
          {/* 답안 입력 영역 */}
          {!gameState.showEvaluation && (
            <textarea
              className="w-full border border-gray-300 rounded-lg p-3 text-base min-h-[60px] focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="중국어로 번역해주세요"
              value={gameState.userAnswer}
              onChange={handleInput}
              onKeyDown={handleKeyPress}
              disabled={gameState.submissions[gameState.currentProblemIndex]}
            />
          )}
          {/* 하단 버튼 */}
          {!gameState.showEvaluation && (
            <div className="w-full flex flex-wrap gap-3 justify-center mt-2">
              <button
                className="px-4 py-2 rounded bg-gray-200 text-gray-700 font-semibold disabled:opacity-50"
                onClick={goToPreviousProblem}
                disabled={gameState.currentProblemIndex === 0}
              >이전문제</button>
              {!gameState.submissions[gameState.currentProblemIndex] && (
                <button
                  className="px-4 py-2 rounded bg-indigo-500 text-white font-semibold hover:bg-indigo-600"
                  onClick={submitAnswer}
                  disabled={gameState.userAnswer.trim() === '' || gameState.gameStatus !== 'playing'}
                >제출하기</button>
              )}
              <button
                className="px-4 py-2 rounded bg-gray-200 text-gray-700 font-semibold disabled:opacity-50"
                onClick={goToNextProblem}
                disabled={gameState.currentProblemIndex === gameState.totalProblems - 1}
              >다음문제</button>
            </div>
          )}
          {/* 기존 컨트롤 버튼들 (시작, 일시정지 등) */}
          <div className="w-full flex flex-wrap gap-3 justify-center mt-2">
            {gameState.gameStatus === 'ready' && (
              <button className="px-6 py-2 rounded-lg bg-green-500 text-white font-bold shadow hover:bg-green-600" onClick={handleStart}>시작하기</button>
            )}
            {gameState.gameStatus === 'playing' && (
              <button className="px-4 py-2 rounded bg-indigo-500 text-white font-semibold hover:bg-indigo-600" onClick={handlePause}>일시정지</button>
            )}
            {gameState.gameStatus === 'paused' && (
              <button className="px-6 py-2 rounded-lg bg-indigo-400 text-white font-bold shadow hover:bg-indigo-500" onClick={handleResume}>재개</button>
            )}
            {gameState.gameStatus === 'finished' && (
              <button className="px-6 py-2 rounded-lg bg-green-500 text-white font-bold shadow hover:bg-green-600" onClick={() => setGameState(initialGameState)}>다시하기</button>
            )}
          </div>
          {/* 알림 표시 */}
          {notification && (
            <div className={`fixed top-8 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-lg font-bold text-white shadow-lg ${notification.type === 'success' ? 'bg-green-500' : notification.type === 'info' ? 'bg-blue-500' : notification.type === 'warning' ? 'bg-yellow-500' : 'bg-red-500'}`}>{notification.message}</div>
          )}
          {/* 타이머 긴급 효과용 애니메이션 스타일 및 아이템/힌트 스타일 */}
          <style>{`
            .animate-pulse { animation: pulse 0.5s infinite alternate; }
            @keyframes pulse { 0% { opacity: 1; } 100% { opacity: 0.6; } }
            .streak-notification { animation: slideInRight 0.3s ease-out; }
            @keyframes slideInRight { from { transform: translateX(80px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
            .item-button {
              padding: 8px 16px;
              border: 2px solid #e5e7eb;
              border-radius: 8px;
              background: white;
              transition: all 0.2s;
            }
            .item-button:disabled {
              opacity: 0.5;
              cursor: not-allowed;
            }
            .item-button.urgent {
              border-color: #ef4444;
              animation: pulse 1s infinite;
            }
            .pass-button {
              border-color: #f59e0b;
              color: #f59e0b;
            }
            .hint-display {
              background: #fef3c7;
              border: 1px solid #fbbf24;
              border-radius: 8px;
              padding: 12px;
              margin: 8px 0;
              animation: slideDown 0.3s ease-out;
            }
            @keyframes slideDown { from { transform: translateY(-20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
          `}</style>
          
          {/* Gemini 챗봇 - 상시 노출 */}
          <ChatbotWidget 
            initialContext={gameState.evaluationResult ? 
              `번역 평가 결과:
              
문제: ${gameState.problems[gameState.currentProblemIndex]?.한국어}
사용자 답안: ${gameState.evaluationResult.userAnswer}
정답: ${gameState.problems[gameState.currentProblemIndex]?.중국어}

평가 점수: ${gameState.evaluationResult.score}점
피드백: ${gameState.evaluationResult.feedback}

유사도 비교:
- 인간 번역: ${gameState.evaluationResult.similarities.human}%
- ChatGPT: ${gameState.evaluationResult.similarities.chatgpt}%
- Gemini: ${gameState.evaluationResult.similarities.gemini}%

시간 사용량: ${Math.round(gameState.evaluationResult.timeUsage.percentage)}% (${gameState.evaluationResult.timeUsage.category === 'fast' ? '빠름' : gameState.evaluationResult.timeUsage.category === 'optimal' ? '적정' : '느림'})` 
              : 
              `번역 연습 게임에 오신 것을 환영합니다!

현재 상태:
- 문제: ${gameState.currentProblemIndex + 1} / ${gameState.totalProblems}
- 현재 점수: ${gameState.currentScore}점
- 게임 상태: ${gameState.gameStatus === 'ready' ? '준비' : gameState.gameStatus === 'playing' ? '진행 중' : gameState.gameStatus === 'paused' ? '일시정지' : '종료'}

번역 연습에 대한 질문이나 도움이 필요하시면 언제든 물어보세요!`}
          />
        </div>
      </div>
      {/* 오른쪽: 시간 안내 박스 */}
      <div className="w-full md:w-80 flex-shrink-0">
        <GuidePanel />
      </div>
    </div>
  );
};

export default TimedTranslationGame; 