import React, { useState, useRef, useEffect } from 'react';
import { collection, getDocs, QuerySnapshot, type DocumentData } from 'firebase/firestore';
import { db } from '../../firebase';
import { useNavigate } from 'react-router-dom';
import ChatbotWidget from '../../ChatbotWidget';

interface Vocab {
  chinese: string;
  pinyin: string;
  korean: string;
  importance: string;
  category?: string;
}

interface VocabQuiz {
  vocabulary: Vocab;
  quiz: {
    question: string;
    options: string[];
    correct_answer: string;
    explanation: string;
  };
}

interface ProblemData {
  중국어: string;
  주요어휘: Vocab[];
  어휘퀴즈: VocabQuiz[];
  분야?: string;
  한국어?: string;
}

interface QuizSettings {
  questionCount: 5 | 10 | 15 | 20;
  difficulty: 'easy' | 'normal' | 'hard' | 'all';
  category: 'kpop' | 'business' | 'daily' | 'all';
  hintsEnabled: boolean;
  timeLimit?: number;
}

// 샘플 데이터
const sampleProblems: ProblemData[] = [
  {
    중국어: '此时,急于直接向尹某了解冤狱的真相。',
    주요어휘: [
      { chinese: '冤狱', pinyin: 'yuānyù', korean: '억울한 옥살이', importance: '높음', category: 'business' },
    ],
    어휘퀴즈: [
      {
        vocabulary: { chinese: '冤狱', pinyin: 'yuānyù', korean: '억울한 옥살이', importance: '높음', category: 'business' },
        quiz: {
          question: "'冤狱(yuānyù)'의 의미는?",
          options: ['억울한 옥살이', '감옥 생활', '법정 다툼', '무죄 판결'],
          correct_answer: 'A',
          explanation: '冤狱는 억울하게 옥살이를 하는 것을 의미합니다.'
        }
      }
    ],
    분야: 'business',
  }
];

const optionLabels = ['A', 'B', 'C', 'D'];

// 문제 필터링 함수
const filterProblems = (allProblems: ProblemData[], settings: QuizSettings): ProblemData[] => {
  console.log('필터링 시작:', { 
    전체문제수: allProblems.length, 
    설정: settings 
  }); // 디버깅용
  
  // 어휘퀴즈가 있는 문제만 먼저 필터링
  const validProblems = allProblems.filter(problem => {
    const hasVocabQuiz = problem.어휘퀴즈 && problem.어휘퀴즈.length > 0;
    if (!hasVocabQuiz) {
      console.log('어휘퀴즈 없는 문제 제외:', problem.중국어?.substring(0, 20) + '...');
    }
    return hasVocabQuiz;
  });
  
  console.log('어휘퀴즈 있는 문제 수:', validProblems.length);
  
  let filtered = [...validProblems];
  
  // 분야 필터링
  if (settings.category !== 'all') {
    const beforeCount = filtered.length;
    filtered = filtered.filter(problem => {
      const matches = problem.분야 && problem.분야.toLowerCase() === settings.category.toLowerCase();
      if (!matches) {
        console.log('분야 불일치로 제외:', {
          문제분야: problem.분야,
          선택분야: settings.category,
          문제: problem.중국어?.substring(0, 20) + '...'
        });
      }
      return matches;
    });
    console.log(`분야 필터링 후: ${beforeCount} -> ${filtered.length}`);
  }
  
  // 난이도 필터링 (주요어휘의 importance 기준)
  if (settings.difficulty !== 'all') {
    const beforeCount = filtered.length;
    filtered = filtered.filter(problem => {
      if (!problem.주요어휘 || problem.주요어휘.length === 0) {
        console.log('주요어휘 없는 문제 제외:', problem.중국어?.substring(0, 20) + '...');
        return false;
      }
      
      const importanceLevels = problem.주요어휘.map(vocab => vocab.importance);
      let matches = false;
      
      switch (settings.difficulty) {
        case 'easy':
          matches = importanceLevels.some(level => 
            level === '낮음' || level === '쉬움' || level === 'easy' || level === 'Easy'
          );
          break;
        case 'normal':
          matches = importanceLevels.some(level => 
            level === '중간' || level === '보통' || level === 'normal' || level === 'Normal'
          );
          break;
        case 'hard':
          matches = importanceLevels.some(level => 
            level === '높음' || level === '어려움' || level === 'hard' || level === 'Hard'
          );
          break;
        default:
          matches = true;
      }
      
      if (!matches) {
        console.log('난이도 불일치로 제외:', {
          문제난이도: importanceLevels,
          선택난이도: settings.difficulty,
          문제: problem.중국어?.substring(0, 20) + '...'
        });
      }
      
      return matches;
    });
    console.log(`난이도 필터링 후: ${beforeCount} -> ${filtered.length}`);
  }
  
  // 조건에 맞는 문제가 없으면 랜덤으로 문제 제공
  if (filtered.length === 0) {
    console.log('⚠️ 조건에 맞는 문제가 없어서 랜덤으로 문제를 선택합니다.');
    filtered = [...validProblems];
  }
  
  // 문제를 무작위로 섞기
  filtered = filtered.sort(() => Math.random() - 0.5);
  
  // 설정된 문제 수만큼 자르기
  const result = filtered.slice(0, settings.questionCount);
  console.log(`최종 선택된 문제 수: ${result.length}`);
  
  return result;
};

const ContextVocabQuizGame: React.FC<{onBack?: () => void}> = ({ onBack }) => {
  const [gameStatus, setGameStatus] = useState<'ready' | 'playing' | 'results'>('ready');
  const [settings, setSettings] = useState<QuizSettings>({
    questionCount: 5,
    difficulty: 'easy',
    category: 'all',
    hintsEnabled: true,
    timeLimit: undefined,
  });
  const [problems, setProblems] = useState<ProblemData[]>([]);  const [isLoading, setIsLoading] = useState(true);
  const [filteredProblems, setFilteredProblems] = useState<ProblemData[]>([]);
  const [availableCategories, setAvailableCategories] = useState<string[]>(['business', 'daily', 'kpop']);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentQuizIndex, setCurrentQuizIndex] = useState(0); // 현재 문장 내에서 몇 번째 퀴즈인지
  const [score, setScore] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [showTranslation, setShowTranslation] = useState(false); // 원문 의미 보기 상태
  const [isCorrect, setIsCorrect] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [questionStartTime, setQuestionStartTime] = useState<number>(Date.now());
  // 추가 상태
  const [wrongProblems, setWrongProblems] = useState<{problem: ProblemData, quiz: VocabQuiz, userAnswer: string}[]>([]);
  const [gameResults, setGameResults] = useState<{total: number, correct: number, wrong: number, score: number, accuracy: number}>({total: 0, correct: 0, wrong: 0, score: 0, accuracy: 0});
  const [isReviewMode, setIsReviewMode] = useState(false);
  const navigate = useNavigate();

  const currentProblem = filteredProblems[currentIndex];
  const currentQuiz = currentProblem?.어휘퀴즈?.[currentQuizIndex];
  const totalQuizzesInCurrentProblem = currentProblem?.어휘퀴즈?.length || 0;

  // Firestore에서 문제 불러오기
  useEffect(() => {
    const fetchProblems = async () => {
      setIsLoading(true);
      try {
        const querySnapshot: QuerySnapshot<DocumentData> = await getDocs(collection(db, 'translationContents'));
        let loadedProblems: ProblemData[] = [];
        
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          console.log('Firestore 문서 데이터:', data); // 디버깅용
          loadedProblems.push({ ...data } as ProblemData);
        });
        
        console.log('로드된 문제들:', loadedProblems); // 디버깅용
        
        if (loadedProblems.length > 0) {
          setProblems(loadedProblems);
          
          // 실제 데이터에서 분야 목록 추출
          const categories = Array.from(new Set(
            loadedProblems
              .map(p => p.분야)
              .filter((category): category is string => typeof category === 'string' && !!category)
          ));
          console.log('추출된 분야들:', categories); // 디버깅용
          setAvailableCategories(categories);
          
          // 초기 필터링된 문제들도 실제 데이터로 설정
          const initialFiltered = filterProblems(loadedProblems, settings);
          setFilteredProblems(initialFiltered);
        } else {
          console.log('Firestore에서 데이터를 찾을 수 없습니다.');
          // 샘플 데이터 사용
          setProblems(sampleProblems);
          setAvailableCategories(['business', 'daily', 'kpop']);
          const initialFiltered = filterProblems(sampleProblems, settings);
          setFilteredProblems(initialFiltered);
        }
      } catch (err) {
        console.error('문제 로딩 실패:', err);
        console.log('샘플 데이터를 사용합니다.');
        // 오류 시 샘플 데이터 사용
        setProblems(sampleProblems);
        setAvailableCategories(['business', 'daily', 'kpop']);
        const initialFiltered = filterProblems(sampleProblems, settings);
        setFilteredProblems(initialFiltered);
      } finally {
        setIsLoading(false);
      }
    };
    fetchProblems();
  }, []);

  // 타이머 효과
  useEffect(() => {
    let timer: NodeJS.Timeout;
    
    if (gameStatus === 'playing' && settings.timeLimit && timeLeft !== null && timeLeft > 0 && !showResult) {
      timer = setTimeout(() => {
        setTimeLeft(prev => {
          if (prev && prev <= 1) {
            // 시간 초과
            setShowResult(true);
            setIsCorrect(false);
            setTimeout(() => {
              moveToNextQuiz();
            }, 2000);
            return 0;
          }
          return prev ? prev - 1 : null;
        });
      }, 1000);
    }
    
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [gameStatus, timeLeft, showResult, settings.timeLimit, currentIndex, filteredProblems.length, score]);

  // 게임 시작
  const startGame = (newSettings: QuizSettings, customProblems?: ProblemData[], reviewMode = false) => {
    setSettings(newSettings);
    // 문제 필터링
    const filtered = customProblems ? customProblems : filterProblems(problems, newSettings);
    setFilteredProblems(filtered);
    setGameStatus('playing');
    setCurrentIndex(0);
    setCurrentQuizIndex(0); // 퀴즈 인덱스 초기화
    setScore(0);
    setSelectedAnswer(null);
    setShowResult(false);
    setShowTranslation(false); // 번역 상태 초기화
    setTimeLeft(newSettings.timeLimit || null);
    setQuestionStartTime(Date.now());
    setWrongProblems([]);
    setIsReviewMode(reviewMode);
  };

  // 답안 선택
  const handleAnswerSelect = (label: string) => {
    if (showResult) return;
    setSelectedAnswer(label);
    setShowResult(true);
    const correct = currentQuiz?.quiz.correct_answer === label;
    setIsCorrect(correct);
    let scoreGain = 0;
    if (correct) {
      // 시간 보너스 계산
      const timeTaken = Date.now() - questionStartTime;
      const baseScore = 10;
      const timeBonus = settings.timeLimit ? Math.max(0, Math.floor((settings.timeLimit * 1000 - timeTaken) / 1000)) : 0;
      scoreGain = baseScore + timeBonus;
      setScore(prev => prev + scoreGain);
    } else {
      // 틀린 문제 저장
      setWrongProblems(prev => ([...prev, {problem: currentProblem, quiz: currentQuiz, userAnswer: label}]));
    }
    // 3초 후 다음 문제/퀴즈 (또는 시간초과시 2초 후)
    const nextDelay = timeLeft === 0 ? 2000 : 3000;
    setTimeout(() => {
      moveToNextQuiz(scoreGain);
    }, nextDelay);
  };

  // 다음 퀴즈로 이동
  const moveToNextQuiz = (scoreGain: number = 0) => {
    const isLastQuizInProblem = currentQuizIndex + 1 >= totalQuizzesInCurrentProblem;
    const isLastProblem = currentIndex + 1 >= filteredProblems.length;
    if (!isLastQuizInProblem) {
      setCurrentQuizIndex(prev => prev + 1);
      setSelectedAnswer(null);
      setShowResult(false);
      setShowTranslation(false);
      setTimeLeft(settings.timeLimit || null);
      setQuestionStartTime(Date.now());
    } else if (!isLastProblem) {
      setCurrentIndex(prev => prev + 1);
      setCurrentQuizIndex(0);
      setSelectedAnswer(null);
      setShowResult(false);
      setShowTranslation(false);
      setTimeLeft(settings.timeLimit || null);
      setQuestionStartTime(Date.now());
    } else {
      // 게임 종료: 결과 요약 페이지로 이동
      // 총 퀴즈 수 계산
      let total = 0;
      let correct = 0;
      filteredProblems.forEach(problem => {
        if (problem.어휘퀴즈) total += problem.어휘퀴즈.length;
      });
      correct = total - wrongProblems.length;
      const wrong = wrongProblems.length;
      const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;
      setGameResults({total, correct, wrong, score: score + scoreGain, accuracy});
      setGameStatus('results');
    }
  };

  // 문장 내 어휘 하이라이트 (여러 어휘 지원)
  const highlightVocabularyInSentence = (sentence: string, vocabulary: string): React.ReactNode => {
    if (!vocabulary) return sentence;
    
    // 현재 퀴즈의 어휘만 하이라이트
    const parts = sentence.split(vocabulary);
    return parts.map((part, index) => (
      <React.Fragment key={index}>
        {part}
        {index < parts.length - 1 && (
          <span className="highlighted-vocab current-quiz">{vocabulary}</span>
        )}
      </React.Fragment>
    ));
  };

  // 문장 내 모든 어휘 하이라이트 (참고용)
  const highlightAllVocabularyInSentence = (sentence: string, vocabList: Vocab[]): React.ReactNode => {
    if (!vocabList || vocabList.length === 0) return sentence;
    
    let result = sentence;
    let elements: React.ReactNode[] = [];
    let lastIndex = 0;
    
    // 모든 어휘 위치 찾기
    const vocabPositions: Array<{start: number, end: number, vocab: string, isCurrent: boolean}> = [];
    
    vocabList.forEach(vocab => {
      let searchIndex = 0;
      while (true) {
        const index = result.indexOf(vocab.chinese, searchIndex);
        if (index === -1) break;
        
        const isCurrent = vocab.chinese === currentQuiz?.vocabulary.chinese;
        vocabPositions.push({
          start: index,
          end: index + vocab.chinese.length,
          vocab: vocab.chinese,
          isCurrent
        });
        searchIndex = index + vocab.chinese.length;
      }
    });
    
    // 위치별로 정렬
    vocabPositions.sort((a, b) => a.start - b.start);
    
    // 겹치는 부분 제거
    const cleanPositions: Array<{start: number, end: number, vocab: string, isCurrent: boolean}> = [];
    for (let i = 0; i < vocabPositions.length; i++) {
      const current = vocabPositions[i];
      const isOverlapping = cleanPositions.some(pos => 
        (current.start >= pos.start && current.start < pos.end) ||
        (current.end > pos.start && current.end <= pos.end)
      );
      if (!isOverlapping) {
        cleanPositions.push(current);
      }
    }
    
    // 하이라이트된 텍스트 생성
    cleanPositions.forEach((pos, index) => {
      // 이전 텍스트
      if (pos.start > lastIndex) {
        elements.push(
          <span key={`text-${index}`}>
            {result.substring(lastIndex, pos.start)}
          </span>
        );
      }
      
      // 하이라이트된 어휘
      elements.push(
        <span 
          key={`vocab-${index}`} 
          className={`highlighted-vocab ${pos.isCurrent ? 'current-quiz' : 'other-vocab'}`}
        >
          {pos.vocab}
        </span>
      );
      
      lastIndex = pos.end;
    });
    
    // 남은 텍스트
    if (lastIndex < result.length) {
      elements.push(
        <span key="final-text">
          {result.substring(lastIndex)}
        </span>
      );
    }
    
    return elements.length > 0 ? elements : sentence;
  };

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4">
      <div className="max-w-4xl mx-auto">
        {isLoading ? (
          // 로딩 화면
          <div className="bg-white rounded-xl shadow-lg p-8 text-center">
            <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-indigo-600 mx-auto mb-4"></div>
            <h2 className="text-xl font-semibold text-gray-700 mb-2">데이터를 불러오고 있습니다...</h2>
            <p className="text-gray-500">Firebase에서 문제 데이터를 가져오는 중입니다.</p>
          </div>
        ) : gameStatus === 'ready' ? (
          // 설정 화면
          <div className="bg-white rounded-xl shadow-lg p-8">
            {/* 홈으로 버튼 */}
            <div className="mb-6">
              <button
                onClick={() => {
                  if (onBack) {
                    onBack();
                  } else {
                    navigate('/');
                  }
                }}
                className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-indigo-600 hover:bg-gray-50 rounded-lg transition-all"
              >
                <span className="text-lg">←</span>
                <span className="text-lg">🏠</span>
                <span>홈으로</span>
              </button>
            </div>
            <h1 className="text-3xl font-bold text-center text-indigo-700 mb-6">
              📖 중국어 문맥 어휘 퀴즈
            </h1>
            <p className="text-center text-gray-600 mb-8">
              중국어 문장을 읽고 밑줄 친 어휘의 정확한 의미를 선택하세요.
            </p>
            
            <div className="space-y-6">
              {/* 문제 수 설정 */}
              <div>
                <label className="block text-lg font-semibold mb-3">📝 문제 수</label>
                <div className="flex gap-3">
                  {[5, 10, 15, 20].map(count => (
                    <button
                      key={count}
                      className={`px-4 py-2 rounded-lg border-2 transition-all ${
                        settings.questionCount === count 
                          ? 'bg-indigo-500 text-white border-indigo-500' 
                          : 'bg-white border-gray-300 hover:border-indigo-300'
                      }`}
                      onClick={() => setSettings(prev => ({ ...prev, questionCount: count as any }))}
                    >
                      {count}문제
                    </button>
                  ))}
                </div>
              </div>

              {/* 난이도 설정 */}
              <div>
                <label className="block text-lg font-semibold mb-3">🎯 난이도</label>
                <div className="flex gap-3">
                  {[
                    { value: 'easy', label: '쉬움' },
                    { value: 'normal', label: '보통' },
                    { value: 'hard', label: '어려움' },
                    { value: 'all', label: '전체' }
                  ].map(diff => (
                    <button
                      key={diff.value}
                      className={`px-4 py-2 rounded-lg border-2 transition-all ${
                        settings.difficulty === diff.value 
                          ? 'bg-green-500 text-white border-green-500' 
                          : 'bg-white border-gray-300 hover:border-green-300'
                      }`}
                      onClick={() => setSettings(prev => ({ ...prev, difficulty: diff.value as any }))}
                    >
                      {diff.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 분야 설정 */}
              <div>
                <label className="block text-lg font-semibold mb-3">📚 분야</label>
                <select
                  className="w-full p-3 border-2 border-gray-300 rounded-lg focus:border-indigo-500 focus:outline-none bg-white text-gray-900"
                  value={settings.category}
                  onChange={e => setSettings(prev => ({ ...prev, category: e.target.value as any }))}
                >
                  <option value="all">전체 분야</option>
                  {availableCategories.map(category => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </select>
              </div>

              {/* 옵션 설정 */}
              <div>
                <label className="block text-lg font-semibold mb-3">⚙️ 게임 옵션</label>
                <div className="space-y-3">
                  <label className="flex items-center cursor-pointer gap-2">
                    <input
                      type="checkbox"
                      checked={settings.hintsEnabled}
                      onChange={e => setSettings(prev => ({ ...prev, hintsEnabled: e.target.checked }))}
                      className="w-5 h-5 accent-indigo-500 border-gray-300 rounded focus:ring-2 focus:ring-indigo-400 transition-all bg-transparent"
                    />
                    <span className="ml-1">힌트 허용 (점수 차감)</span>
                  </label>
                  <label className="flex items-center cursor-pointer gap-2">
                    <input
                      type="checkbox"
                      checked={!!settings.timeLimit}
                      onChange={e => setSettings(prev => ({ ...prev, timeLimit: e.target.checked ? 30 : undefined }))}
                      className="w-5 h-5 accent-indigo-500 border-gray-300 rounded focus:ring-2 focus:ring-indigo-400 transition-all bg-transparent"
                    />
                    <span className="ml-1">시간 제한 (문제당 30초) ⏱️</span>
                  </label>
                  <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
                    <p className="text-sm text-blue-800">
                      📝 <strong>참고:</strong> 한 문장에 여러 어휘 퀴즈가 있으면 모두 출제됩니다.
                    </p>
                  </div>
                </div>
              </div>

              {/* 시작 버튼 */}
              <div className="text-center pt-6">
                <button
                  className="bg-gradient-to-r from-indigo-500 to-purple-600 text-white px-8 py-4 rounded-xl text-xl font-bold hover:from-indigo-600 hover:to-purple-700 transition-all transform hover:scale-105 shadow-lg"
                  onClick={() => startGame(settings)}
                >
                  🚀 게임 시작하기
                </button>
              </div>
            </div>
          </div>
        ) : gameStatus === 'results' ? (
          // 결과 요약 페이지
          <div className="bg-white rounded-xl shadow-lg p-8 text-center space-y-8">
            <h1 className="text-3xl font-bold text-indigo-700 mb-2">퀴즈 결과 요약</h1>
            {isReviewMode && (
              <div className="mb-4">
                <span className="inline-block bg-yellow-100 text-yellow-800 px-4 py-2 rounded-full font-semibold text-lg">복습 모드</span>
              </div>
            )}
            <div className="text-2xl font-bold text-green-700">총 점수: {gameResults.score}점</div>
            <div className="flex flex-col md:flex-row justify-center gap-8 text-lg font-medium">
              <div>정답: <span className="text-blue-700 font-bold">{gameResults.correct}</span> / {gameResults.total} ({gameResults.accuracy}%)</div>
              <div>틀린 문제: <span className="text-red-600 font-bold">{gameResults.wrong}</span></div>
            </div>
            <div className="flex flex-col md:flex-row justify-center gap-4 mt-6">
              <button
                className="bg-yellow-400 hover:bg-yellow-500 text-white px-6 py-3 rounded-lg font-bold text-lg transition-all"
                onClick={() => {
                  // 틀린 문제만으로 복습 모드 시작
                  if (wrongProblems.length === 0) return;
                  // 틀린 문제들에서 ProblemData[]로 변환 (중복 허용, 각 퀴즈별로)
                  const reviewProblems: ProblemData[] = wrongProblems.map(wp => {
                    // 단일 어휘퀴즈만 포함하는 ProblemData 생성
                    return {
                      ...wp.problem,
                      어휘퀴즈: [wp.quiz],
                    };
                  });
                  startGame(settings, reviewProblems, true);
                }}
                disabled={wrongProblems.length === 0}
              >
                틀린 문제 다시 풀기
              </button>
              <button
                className="bg-indigo-500 hover:bg-indigo-600 text-white px-6 py-3 rounded-lg font-bold text-lg transition-all"
                onClick={() => startGame(settings)}
              >
                새로운 세트 도전
              </button>
              <button
                className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-6 py-3 rounded-lg font-bold text-lg transition-all"
                onClick={() => setGameStatus('ready')}
              >
                옵션으로 돌아가기
              </button>
            </div>
            {wrongProblems.length > 0 && (
              <div className="mt-8 text-left">
                <h2 className="text-xl font-bold text-red-700 mb-2">틀린 문제 목록</h2>
                <ul className="space-y-2">
                  {wrongProblems.map((wp, idx) => (
                    <li key={idx} className="bg-red-50 border-l-4 border-red-400 p-4 rounded">
                      <div className="font-bold text-red-800">{wp.quiz.vocabulary.chinese}</div>
                      <div className="text-gray-700">{wp.quiz.quiz.question}</div>
                      <div className="text-gray-500 text-sm">내 답: {wp.userAnswer} / 정답: {wp.quiz.quiz.correct_answer}</div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          // 게임 화면
          <div className="space-y-6">
            {/* 이전으로 버튼 */}
            <div className="flex justify-start">
              <button
                onClick={() => setGameStatus('ready')}
                className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-indigo-600 hover:bg-white hover:shadow-md rounded-lg transition-all bg-white/80 backdrop-blur-sm"
              >
                <span className="text-lg">←</span>
                <span>이전으로</span>
                <span className="text-lg">🏠</span>
              </button>
            </div>
            {/* Gemini 챗봇 위젯 */}
            <ChatbotWidget initialContext={currentQuiz?.quiz.explanation || currentProblem?.중국어 || ''} />
            {/* 게임 헤더 */}
            <div className="bg-white rounded-xl shadow-lg p-6">
              <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold text-indigo-700">🧠 문맥 기반 어휘 퀴즈</h1>
                <div className="text-xl font-semibold">점수: {score}</div>
              </div>
              <div className="mt-4 bg-gray-200 rounded-full h-3">
                <div 
                  className="bg-indigo-500 h-3 rounded-full transition-all duration-300"
                  style={{ width: `${((currentIndex + 1) / filteredProblems.length) * 100}%` }}
                />
              </div>
              <div className="flex justify-between items-center mt-2">
                <div className="text-gray-600">
                  문제 {currentIndex + 1} / {filteredProblems.length}
                  {totalQuizzesInCurrentProblem > 1 && (
                    <span className="ml-2 text-purple-600 font-semibold">
                      (퀴즈 {currentQuizIndex + 1}/{totalQuizzesInCurrentProblem})
                    </span>
                  )}
                </div>
                {settings.timeLimit && timeLeft !== null && (
                  <div className={`font-bold px-4 py-2 rounded-full flex items-center gap-2 ${
                    timeLeft <= 5 ? 'bg-red-100 text-red-800 animate-pulse' : 
                    timeLeft <= 10 ? 'bg-orange-100 text-orange-800' : 
                    'bg-blue-100 text-blue-800'
                  }`}>
                    <span className="text-lg">
                      {timeLeft <= 5 ? '🚨' : timeLeft <= 10 ? '⚠️' : '⏱️'}
                    </span>
                    <span className="text-lg font-mono">{timeLeft}초</span>
                    {timeLeft <= 5 && (
                      <span className="text-xs">서두르세요!</span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* 퀴즈 영역 */}
            {!currentQuiz ? (
              <div className="bg-white rounded-xl shadow-lg p-8 text-center">
                <div className="text-xl text-gray-600">
                  데이터를 불러오는 중입니다...
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-xl shadow-lg p-8">
                {/* 문장 표시 */}
                <div className="bg-blue-50 border-l-4 border-blue-500 p-6 mb-6 rounded-lg">
                  <div className="text-xl text-center font-bold text-blue-900 leading-relaxed">
                    {currentProblem.주요어휘 
                      ? highlightAllVocabularyInSentence(currentProblem.중국어, currentProblem.주요어휘)
                      : highlightVocabularyInSentence(currentProblem.중국어, currentQuiz.vocabulary.chinese)
                    }
                  </div>
                  {totalQuizzesInCurrentProblem > 1 && (
                    <div className="mt-4 text-center">
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-purple-100 text-purple-800">
                        현재 풀고 있는 어휘: <span className="ml-1 font-bold">{currentQuiz.vocabulary.chinese}</span>
                      </span>
                    </div>
                  )}
                </div>

                {/* 문제 */}
                <div className="bg-yellow-50 border-l-4 border-yellow-500 p-4 mb-6 rounded">
                  <div className="text-lg font-semibold text-gray-700">
                    {currentQuiz.quiz.question}
                  </div>
                </div>

                {/* 선택지 */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                  {currentQuiz.quiz.options.map((option, idx) => {
                    const label = optionLabels[idx];
                    const isSelected = selectedAnswer === label;
                    const correctAnswer = currentQuiz.quiz.correct_answer;
                    const isCurrentCorrect = correctAnswer === label;
                    
                    let buttonClass = "w-full p-4 text-left border-2 rounded-lg font-semibold transition-all ";
                    if (showResult) {
                      if (isCurrentCorrect) {
                        buttonClass += "bg-green-100 border-green-500 text-green-800";
                      } else if (isSelected) {
                        buttonClass += "bg-red-100 border-red-500 text-red-800";
                      } else {
                        buttonClass += "bg-gray-100 border-gray-300 text-gray-600";
                      }
                    } else {
                      buttonClass += isSelected 
                        ? "bg-indigo-100 border-indigo-500 text-indigo-800" 
                        : "bg-white border-gray-300 hover:border-indigo-300";
                    }

                    return (
                      <button
                        key={label}
                        className={buttonClass}
                        onClick={() => handleAnswerSelect(label)}
                        disabled={showResult}
                      >
                        <span className="font-bold mr-2">{label}.</span>
                        {option}
                        {showResult && isCurrentCorrect && <span className="ml-2 text-green-600">✓</span>}
                        {showResult && isSelected && !isCurrentCorrect && <span className="ml-2 text-red-600">✗</span>}
                      </button>
                    );
                  })}
                </div>

                {/* 결과 표시 */}
                {showResult && (
                  <div className={`p-6 rounded-lg border-2 ${
                    timeLeft === 0 ? 'bg-orange-50 border-orange-300' :
                    isCorrect ? 'bg-green-50 border-green-300' : 'bg-red-50 border-red-300'
                  }`}>
                    <div className={`text-lg font-bold mb-3 ${
                      timeLeft === 0 ? 'text-orange-800' :
                      isCorrect ? 'text-green-800' : 'text-red-800'
                    }`}>
                      {timeLeft === 0 ? '⏰ 시간 초과!' : isCorrect ? '🎉 정답!' : '❌ 오답'}
                    </div>
                    
                    <div className="text-gray-700 mb-4">
                      <strong>해설:</strong> {currentQuiz?.quiz.explanation}
                    </div>
                    
                    {/* 원문 의미 보기 버튼 */}
                    <div className="flex gap-3 items-center">
                      <button
                        onClick={() => setShowTranslation(!showTranslation)}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-all transform hover:scale-105 shadow-md"
                      >
                        <span>🇨🇳→🇰🇷</span>
                        <span>{showTranslation ? '원문 의미 숨기기' : '원문 의미 보기'}</span>
                      </button>
                      
                      {showTranslation && (
                        <div className="flex-1 bg-blue-50 border border-blue-200 rounded-lg p-4">
                          <div className="text-blue-800 font-medium">
                            <span className="text-sm text-blue-600">한국어 번역:</span>
                            <div className="mt-1 text-lg leading-relaxed">
                              {currentProblem.한국어 || '한국어 번역을 찾을 수 없습니다.'}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <style>{`
        .highlighted-vocab {
          padding: 2px 6px;
          border-radius: 4px;
          font-weight: bold;
          margin: 0 1px;
          transition: all 0.3s ease;
        }
        
        .highlighted-vocab.current-quiz {
          background-color: #fef08a;
          color: #dc2626;
          box-shadow: 0 0 0 2px #fde68a;
          animation: currentQuizPulse 2s ease-in-out infinite;
        }
        
        .highlighted-vocab.other-vocab {
          background-color: #e0e7ff;
          color: #4338ca;
          box-shadow: 0 0 0 1px #c7d2fe;
        }
        
        .custom-checkbox {
          appearance: none;
          -webkit-appearance: none;
          -moz-appearance: none;
          background-color: transparent;
          border: 2px solid #9ca3af;
          border-radius: 3px;
          cursor: pointer;
          position: relative;
          transition: all 0.3s ease;
          width: 16px;
          height: 16px;
          min-width: 16px;
          min-height: 16px;
          flex-shrink: 0;
          margin-right: 12px;
        }
        
        .custom-checkbox:checked {
          background-color: #4f46e5;
          border-color: #4f46e5;
        }
        
        .custom-checkbox:checked::after {
          content: '✓';
          position: absolute;
          left: 2px;
          top: -1px;
          color: white;
          font-size: 10px;
          font-weight: bold;
          line-height: 1;
        }
        
        .custom-checkbox:hover {
          border-color: #6366f1;
        }
        
        .custom-checkbox:focus {
          outline: none;
          box-shadow: 0 0 0 2px #c7d2fe;
        }
        
        @keyframes currentQuizPulse {
          0%, 100% {
            box-shadow: 0 0 0 2px #fde68a;
          }
          50% {
            box-shadow: 0 0 0 4px #fbbf24;
          }
        }
        
        .animate-pulse {
          animation: pulse 1s ease-in-out infinite;
        }
        
        @keyframes pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.7;
          }
        }
      `}</style>
    </div>
  );
};

export default ContextVocabQuizGame;
