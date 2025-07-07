import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';

// 단계 상수
const STEPS = {
  TIMER: 'timer',
  BLANKS: 'blanks', 
  REORDER: 'reorder',
  REPRODUCE: 'reproduce'
} as const;
type StepType = typeof STEPS[keyof typeof STEPS];

interface Exercise {
  id: string;
  level: number;
  title: string;
  duration: number;
  type: 'numbers' | 'names' | 'list' | 'process';
  category: 'business' | 'news' | 'academic' | 'diplomatic' | 'technology' | 'medical';
  content: {
    script: string;
    key_points: string[];
    segments: Array<{
      text: string;
      order: number;
    }>;
  };
}

// 2단계용 인터페이스
interface BlankItem {
  id: string;
  originalWord: string;
  userInput: string;
  isCorrect: boolean;
  showHint: boolean;
  position: { start: number; end: number };
}

// 3단계용 인터페이스
interface DragItem {
  id: string;
  text: string;
  originalOrder: number;
  currentPosition: number | null;
}

// 4단계용 인터페이스
interface AnalysisResult {
  keywordCoverage: number;
  structureSimilarity: number;
  contentCompleteness: number;
  languageFluency: number;
  overallScore: number;
  detailedFeedback: {
    matchedKeywords: string[];
    missedKeywords: string[];
    structureAnalysis: string;
    suggestions: string[];
  };
}

const MemoryTraining: React.FC = () => {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState<StepType>(STEPS.TIMER);
  const [currentExercise, setCurrentExercise] = useState<Exercise | null>(null);
  const [_exercises, _setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // 필터 상태
  const [selectedType, setSelectedType] = useState<string>('');
  
  // 1단계: 타이머 상태
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [isTimerPaused, setIsTimerPaused] = useState(false);
  const [timerCompleted, setTimerCompleted] = useState(false);
  
  // 2단계: 빈칸 채우기 상태 (미구현)
  const [_blanks, _setBlanks] = useState<BlankItem[]>([]);
  const [_processedScript, _setProcessedScript] = useState<string>('');
  const [_showAllAnswers, _setShowAllAnswers] = useState(false);
  
  // 3단계: 문장 재배열 상태 (미구현)
  const [_dragItems, _setDragItems] = useState<DragItem[]>([]);
  const [_dropZones, _setDropZones] = useState<(DragItem | null)[]>([]);
  const [_draggedItem, _setDraggedItem] = useState<DragItem | null>(null);
  const [_dragOverZone, _setDragOverZone] = useState<number | null>(null);
  const [_isCorrectOrder, _setIsCorrectOrder] = useState<boolean[]>([]);
  const [_showHints, _setShowHints] = useState(false);
  const [_showAnswer, _setShowAnswer] = useState(false);
  
  // 4단계: 스토리 재생산 상태 (미구현)
  const [_inputMode, _setInputMode] = useState<'text' | 'speech'>('text');
  const [_userInput, _setUserInput] = useState('');
  const [_isRecording, _setIsRecording] = useState(false);
  const [_isAnalyzing, _setIsAnalyzing] = useState(false);
  const [_analysisResult, _setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [_showOriginal, _setShowOriginal] = useState(false);
  
  // refs
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _textareaRef = useRef<HTMLTextAreaElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _mediaRecorderRef = useRef<MediaRecorder | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _chunksRef = useRef<Blob[]>([]);

  // Firestore에서 exercises 가져오기
  const fetchExercises = useCallback(async () => {
    if (!selectedType) return;

    setLoading(true);
    setError(null);
    
    try {
      const q = query(
        collection(db, 'memory_training_exercises'),
        where('type', '==', selectedType)
      );
      
      const querySnapshot = await getDocs(q);
      const exercisesList: Exercise[] = [];
      
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        exercisesList.push({
          id: doc.id,
          ...data
        } as Exercise);
      });
      
      if (exercisesList.length > 0) {
        _setExercises(exercisesList);
        // 랜덤하게 하나 선택
        const randomExercise = exercisesList[Math.floor(Math.random() * exercisesList.length)];
        setCurrentExercise(randomExercise);
        setTimeRemaining(randomExercise.duration);
      } else {
        setError('선택한 조건에 맞는 연습문제가 없습니다.');
        setCurrentExercise(null);
      }
    } catch (err) {
      console.error('데이터 가져오기 실패:', err);
      setError('데이터를 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  }, [selectedType]);

  // 필터 변경 시 데이터 가져오기
  useEffect(() => {
    fetchExercises();
  }, [fetchExercises]);

  // 컴포넌트 언마운트 시 타이머 정리
  useEffect(() => {
    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    };
  }, []);

  // 타이머 관련 함수들
  const startTimer = () => {
    if (!currentExercise || isTimerRunning) return;
    
    setIsTimerRunning(true);
    setIsTimerPaused(false);
    setTimerCompleted(false);
    
    timerIntervalRef.current = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          if (timerIntervalRef.current) {
            clearInterval(timerIntervalRef.current);
            timerIntervalRef.current = null;
          }
          setIsTimerRunning(false);
          setTimerCompleted(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const pauseTimer = () => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    setIsTimerRunning(false);
    setIsTimerPaused(true);
  };

  const resumeTimer = () => {
    if (isTimerPaused && timeRemaining > 0) {
      startTimer();
    }
  };

  // 시간 포맷팅
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // 진행률 계산
  const getProgress = () => {
    if (!currentExercise) return 0;
    return ((currentExercise.duration - timeRemaining) / currentExercise.duration) * 100;
  };

  // 다음 단계로 이동
  const handleNextStep = () => {
    switch (currentStep) {
      case STEPS.TIMER:
        setCurrentStep(STEPS.BLANKS);
        break;
      case STEPS.BLANKS:
        setCurrentStep(STEPS.REORDER);
        break;
      case STEPS.REORDER:
        setCurrentStep(STEPS.REPRODUCE);
        break;
    }
  };

  // 이전 단계로 이동
  const handlePrevStep = () => {
    switch (currentStep) {
      case STEPS.BLANKS:
        setCurrentStep(STEPS.TIMER);
        break;
      case STEPS.REORDER:
        setCurrentStep(STEPS.BLANKS);
        break;
      case STEPS.REPRODUCE:
        setCurrentStep(STEPS.REORDER);
        break;
    }
  };

  // 훈련 완료 처리 (미구현)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _handleComplete = (result: AnalysisResult) => {
    console.log('훈련 완료:', result);
    // 여기서 결과를 처리하거나 다른 페이지로 이동
  };

  // 단계별 렌더링
  const renderCurrentStep = () => {
    switch (currentStep) {
      case STEPS.TIMER:
        return renderTimerStep();
      case STEPS.BLANKS:
        return renderBlanksStep();
      case STEPS.REORDER:
        return renderReorderStep();
      case STEPS.REPRODUCE:
        return renderReproduceStep();
      default:
        return renderTimerStep();
    }
  };

  // 가이드 패널 컴포넌트
  const GuidePanel: React.FC = () => {
    const [showMethodology, setShowMethodology] = useState(true);
    
    return (
      <div className="guide-panel bg-white rounded-2xl shadow-lg p-6 flex flex-col gap-6 min-w-[350px] max-w-[400px]">
        {/* 헤더 */}
        <div className="guide-header flex items-center gap-2 mb-2 pb-3 border-b border-gray-100">
          <span className="text-2xl">🧠</span>
          <h3 className="text-2xl font-extrabold text-gray-900">메모리 훈련 가이드</h3>
        </div>

        {/* 훈련 목적 */}
        <div>
          <div className="text-gray-500 font-bold text-base mb-3">훈련 목적</div>
          <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
            <p className="text-blue-900 text-sm leading-relaxed text-justify">
              통역사에게 필수적인 <strong>순간 기억력</strong>과 <strong>정보 재구성 능력</strong>을 체계적으로 향상시킵니다.
            </p>
          </div>
        </div>

        {/* 학습 단계 */}
        <div>
          <div className="text-gray-500 font-bold text-base mb-3">학습 단계</div>
          <div className="flex flex-col gap-2">
            <div className="step-item flex items-center gap-3 bg-gray-50 rounded-lg px-4 py-2">
              <span className="step-number bg-blue-500 text-white w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold">1</span>
              <div className="step-info">
                <span className="step-text font-semibold text-gray-900 text-sm">타이머 학습</span>
                <span className="step-desc text-gray-500 text-xs block">집중해서 내용 기억</span>
              </div>
            </div>
            <div className="step-item flex items-center gap-3 bg-gray-50 rounded-lg px-4 py-2">
              <span className="step-number bg-orange-500 text-white w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold">2</span>
              <div className="step-info">
                <span className="step-text font-semibold text-gray-900 text-sm">빈칸 채우기</span>
                <span className="step-desc text-gray-500 text-xs block">핵심 단어 기억 테스트</span>
              </div>
            </div>
            <div className="step-item flex items-center gap-3 bg-gray-50 rounded-lg px-4 py-2">
              <span className="step-number bg-green-500 text-white w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold">3</span>
              <div className="step-info">
                <span className="step-text font-semibold text-gray-900 text-sm">문장 재배열</span>
                <span className="step-desc text-gray-500 text-xs block">논리적 순서 재구성</span>
              </div>
            </div>
            <div className="step-item flex items-center gap-3 bg-gray-50 rounded-lg px-4 py-2">
              <span className="step-number bg-purple-500 text-white w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold">4</span>
              <div className="step-info">
                <span className="step-text font-semibold text-gray-900 text-sm">스토리 재생산</span>
                <span className="step-desc text-gray-500 text-xs block">완전한 내용 복원</span>
              </div>
            </div>
          </div>
        </div>

        {/* 훈련 방법론 */}
        <div className={`mt-2 ${showMethodology ? 'border border-purple-300' : ''} rounded-xl bg-purple-50/30`}>
          <div className="methodology-header flex items-center gap-2 px-4 py-3 cursor-pointer select-none" onClick={() => setShowMethodology(v => !v)}>
            <span className="text-lg">📚</span>
            <h4 className="font-bold text-purple-700 text-base">훈련 방법론</h4>
            <span className="ml-auto text-lg">{showMethodology ? '▼' : '▲'}</span>
          </div>
          {showMethodology && (
            <div className="methodology-details px-5 pb-4 text-gray-700 text-[15px] leading-relaxed text-justify">
              <div className="mb-2"><strong>청킹(Chunking):</strong> 정보를 의미 단위로 묶어 기억</div>
              <div className="mb-2"><strong>시각화:</strong> 내용을 이미지로 변환하여 저장</div>
              <div><strong>연상 기법:</strong> 기존 지식과 연결하여 기억 강화</div>
            </div>
          )}
        </div>

        {/* 학습 효과 */}
        <div className="learning-effects bg-green-50 border border-green-200 rounded-xl px-5 py-4">
          <h4 className="flex items-center gap-2 text-green-800 font-bold text-base mb-2">
            <span>🎯</span>학습 효과
          </h4>
          <ul className="list-disc ml-5 text-green-900 text-[15px] space-y-1">
            <li>단기 기억력 향상</li>
            <li>정보 처리 속도 증가</li>
            <li>집중력 강화</li>
            <li>논리적 사고력 발달</li>
            <li>실전 통역 능력 향상</li>
          </ul>
        </div>
      </div>
    );
  };

  const renderTimerStep = () => (
    <div className="w-full mx-auto p-8 bg-sky-50/70 rounded-2xl shadow-lg flex flex-col gap-6">
      {/* 홈으로 버튼 */}
      <div className="flex justify-start mb-2">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-blue-600 hover:bg-white hover:shadow-md rounded-lg transition-all bg-white/80 backdrop-blur-sm"
        >
          <span className="text-lg">🏠</span>
          <span>홈으로</span>
        </button>
      </div>

      {/* 헤더 */}
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-gray-800 mb-2">
          🧠 통역 메모리 훈련
        </h1>
        <p className="text-lg text-gray-600">1단계: 타이머 학습</p>
      </div>

      {/* 단계 표시기 */}
      <div className="flex justify-center items-center mb-8">
        <div className="flex space-x-4">
          {[
            { key: STEPS.TIMER, label: '1', name: '타이머' },
            { key: STEPS.BLANKS, label: '2', name: '빈칸' },
            { key: STEPS.REORDER, label: '3', name: '재배열' },
            { key: STEPS.REPRODUCE, label: '4', name: '재생산' }
          ].map((step) => (
            <div
              key={step.key}
              className={`
                w-10 h-10 rounded-full flex items-center justify-center font-bold
                ${step.key === currentStep
                  ? 'bg-blue-500 text-white' 
                  : currentStep === STEPS.BLANKS && step.key === STEPS.TIMER
                  ? 'bg-green-500 text-white'
                  : currentStep === STEPS.REORDER && (step.key === STEPS.TIMER || step.key === STEPS.BLANKS)
                  ? 'bg-green-500 text-white'
                  : currentStep === STEPS.REPRODUCE && step.key !== STEPS.REPRODUCE
                  ? 'bg-green-500 text-white'
                  : 'bg-gray-200 text-gray-500'
                }
              `}
            >
              {currentStep === STEPS.BLANKS && step.key === STEPS.TIMER ? '✓' :
               currentStep === STEPS.REORDER && (step.key === STEPS.TIMER || step.key === STEPS.BLANKS) ? '✓' :
               currentStep === STEPS.REPRODUCE && step.key !== STEPS.REPRODUCE ? '✓' :
               step.label}
            </div>
          ))}
        </div>
      </div>

      {/* 필터 컨트롤 */}
      <div className="flex justify-center mb-8">
        {/* 타입 선택 */}
        <div className="bg-gray-50 p-4 rounded-lg max-w-sm w-full">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            🎯 유형 선택
          </label>
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="">선택하세요</option>
            <option value="numbers">숫자 중심</option>
            <option value="names">인명/지명</option>
            <option value="list">목록/순서</option>
            <option value="process">과정/절차</option>
          </select>
        </div>
      </div>

      {/* 연습문제 정보 */}
      {currentExercise && (
        <div className="bg-blue-50 p-4 rounded-lg mb-6">
          <h3 className="text-lg font-semibold text-blue-800 mb-2">
            {currentExercise.title}
          </h3>
          <div className="flex gap-4 text-sm text-blue-600">
            <span>⏱️ {currentExercise.duration}초</span>
            <span>🏷️ {currentExercise.category}</span>
            <span>🎯 {currentExercise.type}</span>
          </div>
        </div>
      )}

      {/* 스크립트 영역 */}
      <div className="bg-gray-800 text-white p-8 rounded-lg mb-8 min-h-[200px] flex items-center justify-center">
        {loading ? (
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-4"></div>
            <p>연습문제를 불러오는 중...</p>
          </div>
        ) : error ? (
          <div className="text-red-300 text-center">
            <p>⚠️ {error}</p>
          </div>
        ) : currentExercise ? (
          <div className="text-lg leading-relaxed text-center max-w-3xl">
            {timerCompleted ? (
              <div className="text-green-300">
                ✅ 학습 시간이 완료되었습니다!<br />
                이제 2단계에서 기억한 내용을 테스트해보세요.
              </div>
            ) : (
              currentExercise.content.script
            )}
          </div>
        ) : (
          <div className="text-gray-400 text-center">
            <p>필터를 모두 선택하면 연습문제가 표시됩니다</p>
          </div>
        )}
      </div>

      {/* 타이머 섹션 */}
      {currentExercise && (
        <div className="bg-gray-50 p-6 rounded-lg mb-6">
          <div className="text-center mb-4">
            <div className="text-4xl font-bold text-blue-600 mb-2">
              {formatTime(timeRemaining)}
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3 mb-4">
              <div
                className="bg-gradient-to-r from-blue-500 to-purple-600 h-3 rounded-full transition-all duration-1000 ease-linear"
                style={{ width: `${getProgress()}%` }}
              ></div>
            </div>
          </div>

          <div className="flex justify-center gap-4">
            {!timerCompleted ? (
              <>
                {!isTimerRunning && !isTimerPaused ? (
                  <button
                    onClick={startTimer}
                    className="px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-semibold hover:transform hover:scale-105 transition-all"
                  >
                    🚀 학습 시작
                  </button>
                ) : isTimerPaused ? (
                  <button
                    onClick={resumeTimer}
                    className="px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-semibold hover:transform hover:scale-105 transition-all"
                  >
                    ▶️ 재시작
                  </button>
                ) : (
                  <>
                    <button
                      onClick={pauseTimer}
                      className="px-6 py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-semibold hover:transform hover:scale-105 transition-all"
                    >
                      ⏸️ 일시정지
                    </button>
                    <button
                      onClick={handleNextStep}
                      className="px-6 py-3 bg-green-500 hover:bg-green-600 text-white rounded-lg font-semibold hover:transform hover:scale-105 transition-all"
                    >
                      ➡️ 다음 단계
                    </button>
                  </>
                )}
              </>
            ) : (
              <button
                onClick={handleNextStep}
                className="px-6 py-3 bg-green-500 hover:bg-green-600 text-white rounded-lg font-semibold hover:transform hover:scale-105 transition-all"
              >
                ➡️ 2단계로 이동
              </button>
            )}
          </div>
        </div>
      )}

      {/* 키 포인트 미리보기 (개발용) */}
      {currentExercise && process.env.NODE_ENV === 'development' && (
        <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
          <h4 className="font-semibold text-yellow-800 mb-2">🔍 개발용: 키 포인트</h4>
          <div className="flex flex-wrap gap-2">
            {currentExercise.content.key_points.map((point, index) => (
              <span
                key={index}
                className="px-2 py-1 bg-yellow-200 text-yellow-800 rounded text-sm"
              >
                {point}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  // 2단계: 빈칸 채우기
  const renderBlanksStep = () => {
    if (!currentExercise) return null;

    // 빈칸 데이터가 없으면 초기화 (미구현)
    const _blankItems: BlankItem[] = []; // 임시 빈 배열
    if (_blankItems.length === 0) {
      const keyPoints = currentExercise.content.key_points;
      const script = currentExercise.content.script;
      
      // 핵심 단어들을 스크립트에서 찾아서 빈칸으로 만들기
      const blanks: BlankItem[] = [];
      let modifiedScript = script;
      
      keyPoints.forEach((point, index) => {
        const regex = new RegExp(`\\b${point.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
        const match = script.match(regex);
        if (match) {
          const blank: BlankItem = {
            id: `blank-${index}`,
            originalWord: match[0],
            userInput: '',
            isCorrect: false,
            showHint: false,
            position: { start: 0, end: 0 }
          };
          blanks.push(blank);
          modifiedScript = modifiedScript.replace(regex, `[빈칸${index + 1}]`);
        }
      });
      
      // _setBlankItems(blanks); // 미구현
      // _setModifiedScript(modifiedScript); // 미구현
    }

    return (
      <div className="w-full mx-auto p-8 bg-sky-50/70 rounded-2xl shadow-lg flex flex-col gap-6">
        {/* 홈으로 버튼 */}
        <div className="flex justify-start mb-2">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-blue-600 hover:bg-white hover:shadow-md rounded-lg transition-all bg-white/80 backdrop-blur-sm"
          >
            <span className="text-lg">🏠</span>
            <span>홈으로</span>
          </button>
        </div>

        {/* 헤더 */}
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">
            🧠 통역 메모리 훈련
          </h1>
          <p className="text-lg text-gray-600">2단계: 빈칸 채우기</p>
        </div>

        {/* 단계 표시기 */}
        <div className="flex justify-center items-center mb-8">
          <div className="flex space-x-4">
            {[
              { key: STEPS.TIMER, label: '✓', name: '타이머' },
              { key: STEPS.BLANKS, label: '2', name: '빈칸' },
              { key: STEPS.REORDER, label: '3', name: '재배열' },
              { key: STEPS.REPRODUCE, label: '4', name: '재생산' }
            ].map((step) => (
              <div
                key={step.key}
                className={`
                  w-10 h-10 rounded-full flex items-center justify-center font-bold
                  ${step.key === currentStep
                    ? 'bg-blue-500 text-white' 
                    : step.key === STEPS.TIMER
                    ? 'bg-green-500 text-white'
                    : 'bg-gray-200 text-gray-500'
                  }
                `}
              >
                {step.label}
              </div>
            ))}
          </div>
        </div>

        {/* 연습문제 정보 */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <h3 className="text-lg font-semibold text-blue-800 mb-2">
            {currentExercise.title}
          </h3>
          <div className="flex gap-4 text-sm text-blue-600">
            <span>⏱️ {currentExercise.duration}초</span>
            <span>🏷️ {currentExercise.category}</span>
            <span>🎯 {currentExercise.type}</span>
          </div>
        </div>

        {/* 빈칸 문제 영역 */}
        <div className="bg-gray-50 p-6 rounded-lg mb-6">
          <h3 className="text-lg font-semibold mb-4 text-center">📝 핵심 단어를 기억해서 빈칸을 채워주세요</h3>
          
          {/* 빈칸이 있는 텍스트 */}
          <div className="bg-white p-6 rounded-lg border-2 border-gray-200 mb-6">
            <div className="text-lg leading-relaxed">
              {/* 임시로 첫 번째 키포인트를 빈칸으로 만든 예시 */}
              {currentExercise.content.script.replace(
                new RegExp(currentExercise.content.key_points[0], 'gi'),
                '________'
              )}
            </div>
          </div>

          {/* 빈칸 입력 섹션 */}
          <div className="space-y-4">
            <h4 className="font-semibold text-gray-700">빈칸에 들어갈 단어들:</h4>
            {currentExercise.content.key_points.slice(0, 3).map((point, index) => (
              <div key={index} className="flex items-center gap-4 bg-white p-4 rounded-lg border">
                <span className="bg-blue-500 text-white w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm">
                  {index + 1}
                </span>
                <input
                  type="text"
                  placeholder="단어를 입력하세요..."
                  className="flex-1 p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <button className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-md text-sm">
                  💡 힌트
                </button>
              </div>
            ))}
          </div>

          {/* 점수 표시 */}
          <div className="mt-6 text-center">
            <div className="inline-flex items-center gap-2 bg-green-50 border border-green-200 px-4 py-2 rounded-lg">
              <span className="text-green-600 font-semibold">정답률:</span>
              <span className="text-green-800 font-bold">0/3</span>
            </div>
          </div>
        </div>

        {/* 네비게이션 버튼 */}
        <div className="flex gap-4 justify-center">
          <button
            onClick={handlePrevStep}
            className="px-6 py-3 bg-gray-500 hover:bg-gray-600 text-white rounded-lg font-semibold hover:transform hover:scale-105 transition-all"
          >
            ← 1단계로
          </button>
          <button
            onClick={handleNextStep}
            className="px-6 py-3 bg-green-500 hover:bg-green-600 text-white rounded-lg font-semibold hover:transform hover:scale-105 transition-all"
          >
            ➡️ 3단계로
          </button>
        </div>
      </div>
    );
  };

  // 3단계: 문장 재배열
  const renderReorderStep = () => {
    if (!currentExercise) return null;

    // 세그먼트를 섞어서 드래그앤드롭용 아이템 생성
    const shuffledSegments = [...currentExercise.content.segments]
      .sort(() => Math.random() - 0.5)
      .map((segment, index) => ({
        id: `segment-${segment.order}`,
        text: segment.text,
        originalOrder: segment.order,
        currentPosition: index
      }));

         return (
       <div className="w-full mx-auto p-8 bg-sky-50/70 rounded-2xl shadow-lg flex flex-col gap-6">
         {/* 홈으로 버튼 */}
         <div className="flex justify-start mb-2">
           <button
             onClick={() => navigate('/')}
             className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-blue-600 hover:bg-white hover:shadow-md rounded-lg transition-all bg-white/80 backdrop-blur-sm"
           >
             <span className="text-lg">🏠</span>
             <span>홈으로</span>
           </button>
         </div>

         {/* 헤더 */}
         <div className="text-center mb-6">
           <h1 className="text-3xl font-bold text-gray-800 mb-2">
             🧠 통역 메모리 훈련
           </h1>
           <p className="text-lg text-gray-600">3단계: 문장 재배열</p>
         </div>

        {/* 단계 표시기 */}
        <div className="flex justify-center items-center mb-8">
          <div className="flex space-x-4">
            {[
              { key: STEPS.TIMER, label: '✓', name: '타이머' },
              { key: STEPS.BLANKS, label: '✓', name: '빈칸' },
              { key: STEPS.REORDER, label: '3', name: '재배열' },
              { key: STEPS.REPRODUCE, label: '4', name: '재생산' }
            ].map((step) => (
              <div
                key={step.key}
                className={`
                  w-10 h-10 rounded-full flex items-center justify-center font-bold
                  ${step.key === currentStep
                    ? 'bg-blue-500 text-white' 
                    : step.key === STEPS.TIMER || step.key === STEPS.BLANKS
                    ? 'bg-green-500 text-white'
                    : 'bg-gray-200 text-gray-500'
                  }
                `}
              >
                {step.label}
              </div>
            ))}
          </div>
        </div>

        {/* 연습문제 정보 */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <h3 className="text-lg font-semibold text-blue-800 mb-2">
            {currentExercise.title}
          </h3>
          <div className="flex gap-4 text-sm text-blue-600">
            <span>⏱️ {currentExercise.duration}초</span>
            <span>🏷️ {currentExercise.category}</span>
            <span>🎯 {currentExercise.type}</span>
          </div>
        </div>

        {/* 재배열 게임 영역 */}
        <div className="bg-gray-50 p-6 rounded-lg mb-6">
          <h3 className="text-lg font-semibold mb-4 text-center">🔄 문장들을 올바른 순서로 배열해주세요</h3>
          
          {/* 드래그 영역 안내 */}
          <div className="mb-6 text-center">
            <p className="text-gray-600 mb-4">아래 문장들을 드래그해서 논리적인 순서로 배치하세요</p>
            <div className="inline-flex items-center gap-2 bg-blue-50 border border-blue-200 px-4 py-2 rounded-lg">
              <span className="text-blue-600 font-semibold">목표:</span>
              <span className="text-blue-800 font-bold">{currentExercise.content.segments.length}개 문장 순서 맞추기</span>
            </div>
          </div>

          {/* 섞인 문장들 (드래그 소스) */}
          <div className="mb-6">
            <h4 className="font-semibold text-gray-700 mb-3">📦 섞인 문장들 (아래로 드래그하세요)</h4>
            <div className="bg-yellow-50 border-2 border-dashed border-yellow-300 rounded-lg p-4 min-h-[120px]">
              <div className="space-y-3">
                {shuffledSegments.map((item, index) => (
                  <div 
                    key={item.id}
                    className="bg-white p-3 rounded-lg border-2 border-gray-200 hover:border-blue-300 cursor-move transition-all shadow-sm hover:shadow-md"
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', item.id);
                      e.dataTransfer.setData('application/json', JSON.stringify(item));
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-gray-400 text-lg">⋮⋮</span>
                      <div className="flex-1 text-gray-800 leading-relaxed text-sm">
                        {item.text}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 정렬 영역 (드롭 존) */}
          <div className="mb-6">
            <h4 className="font-semibold text-gray-700 mb-3">🎯 올바른 순서로 배치하세요</h4>
            <div className="bg-green-50 border-2 border-dashed border-green-300 rounded-lg p-4 min-h-[300px]">
                             <div className="space-y-3">
                 {Array.from({ length: currentExercise.content.segments.length }, (_, i) => i + 1).map((position) => (
                  <div 
                    key={position}
                    className="bg-white border-2 border-gray-200 rounded-lg p-4 min-h-[80px] flex items-center transition-all hover:border-green-400"
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.currentTarget.classList.add('border-green-500', 'bg-green-100');
                    }}
                    onDragLeave={(e) => {
                      e.currentTarget.classList.remove('border-green-500', 'bg-green-100');
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.currentTarget.classList.remove('border-green-500', 'bg-green-100');
                      const droppedData = e.dataTransfer.getData('application/json');
                      if (droppedData) {
                        const item = JSON.parse(droppedData);
                        // 여기서 드롭된 아이템을 해당 위치에 배치하는 로직 구현 (미구현)
                        console.log(`위치 ${position}에 "${item.text}" 배치`);
                      }
                    }}
                  >
                    <div className="flex items-center gap-4 w-full">
                      <span className="bg-green-500 text-white w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm">
                        {position}
                      </span>
                      <div className="flex-1 text-gray-400 text-center">
                        여기에 문장을 드래그해주세요
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 점수 표시 */}
          <div className="mb-4 text-center">
                         <div className="inline-flex items-center gap-2 bg-blue-50 border border-blue-200 px-4 py-2 rounded-lg">
               <span className="text-blue-600 font-semibold">정확도:</span>
               <span className="text-blue-800 font-bold">0/{currentExercise.content.segments.length} 정렬 완료</span>
             </div>
          </div>

          {/* 힌트 및 도움말 */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <h4 className="flex items-center gap-2 text-yellow-800 font-semibold mb-2">
              <span>💡</span>재배열 힌트
            </h4>
            <ul className="text-yellow-700 text-sm space-y-1">
              <li>• 시간순서나 논리적 흐름을 고려하세요</li>
              <li>• 원인과 결과의 관계를 파악하세요</li>
              <li>• 도입-전개-결론 구조를 생각해보세요</li>
            </ul>
          </div>
        </div>

        {/* 네비게이션 버튼 */}
        <div className="flex gap-4 justify-center">
          <button
            onClick={handlePrevStep}
            className="px-6 py-3 bg-gray-500 hover:bg-gray-600 text-white rounded-lg font-semibold hover:transform hover:scale-105 transition-all"
          >
            ← 2단계로
          </button>
          <button
            onClick={handleNextStep}
            className="px-6 py-3 bg-green-500 hover:bg-green-600 text-white rounded-lg font-semibold hover:transform hover:scale-105 transition-all"
          >
            ➡️ 4단계로
          </button>
        </div>
      </div>
    );
  };

  // 4단계: 스토리 재생산
  const renderReproduceStep = () => {
    if (!currentExercise) return null;

    return (
      <div className="w-full mx-auto p-8 bg-sky-50/70 rounded-2xl shadow-lg flex flex-col gap-6">
        {/* 홈으로 버튼 */}
        <div className="flex justify-start mb-2">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-blue-600 hover:bg-white hover:shadow-md rounded-lg transition-all bg-white/80 backdrop-blur-sm"
          >
            <span className="text-lg">🏠</span>
            <span>홈으로</span>
          </button>
        </div>

        {/* 헤더 */}
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">
            🧠 통역 메모리 훈련
          </h1>
          <p className="text-lg text-gray-600">4단계: 스토리 재생산</p>
        </div>

        {/* 단계 표시기 */}
        <div className="flex justify-center items-center mb-8">
          <div className="flex space-x-4">
            {[
              { key: STEPS.TIMER, label: '✓', name: '타이머' },
              { key: STEPS.BLANKS, label: '✓', name: '빈칸' },
              { key: STEPS.REORDER, label: '✓', name: '재배열' },
              { key: STEPS.REPRODUCE, label: '4', name: '재생산' }
            ].map((step) => (
              <div
                key={step.key}
                className={`
                  w-10 h-10 rounded-full flex items-center justify-center font-bold
                  ${step.key === currentStep
                    ? 'bg-blue-500 text-white' 
                    : step.key !== STEPS.REPRODUCE
                    ? 'bg-green-500 text-white'
                    : 'bg-gray-200 text-gray-500'
                  }
                `}
              >
                {step.label}
              </div>
            ))}
          </div>
        </div>

        {/* 연습문제 정보 */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <h3 className="text-lg font-semibold text-blue-800 mb-2">
            {currentExercise.title}
          </h3>
          <div className="flex gap-4 text-sm text-blue-600">
            <span>⏱️ {currentExercise.duration}초</span>
            <span>🏷️ {currentExercise.category}</span>
            <span>🎯 {currentExercise.type}</span>
          </div>
        </div>

        {/* 스토리 재생산 영역 */}
        <div className="bg-gray-50 p-6 rounded-lg mb-6">
          <h3 className="text-lg font-semibold mb-4 text-center">✍️ 기억한 내용을 자신의 말로 재생산해주세요</h3>
          
          {/* 안내 메시지 */}
          <div className="mb-6 text-center">
            <p className="text-gray-600 mb-4">앞서 학습한 내용을 바탕으로 완전한 스토리를 작성하세요</p>
            <div className="inline-flex items-center gap-2 bg-purple-50 border border-purple-200 px-4 py-2 rounded-lg">
              <span className="text-purple-600 font-semibold">목표:</span>
              <span className="text-purple-800 font-bold">핵심 내용 포함한 완성된 스토리</span>
            </div>
          </div>

          {/* 작성 영역 */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              📝 스토리 작성
            </label>
            <textarea
              placeholder="여기에 기억한 내용을 자신의 말로 작성해주세요..."
              className="w-full h-40 p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              maxLength={1000}
            />
            <div className="text-right text-sm text-gray-500 mt-2">
              0 / 1000자
            </div>
          </div>

          {/* 체크리스트 */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <h4 className="flex items-center gap-2 text-blue-800 font-semibold mb-3">
              <span>✅</span>체크리스트
            </h4>
            <div className="space-y-2">
              {currentExercise.content.key_points.slice(0, 5).map((point, index) => (
                <label key={index} className="flex items-center gap-3 text-blue-700">
                  <input type="checkbox" className="rounded border-blue-300" />
                  <span className="text-sm">{point} 포함</span>
                </label>
              ))}
            </div>
          </div>

          {/* AI 분석 결과 (임시) */}
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <h4 className="flex items-center gap-2 text-green-800 font-semibold mb-3">
              <span>🤖</span>AI 분석 결과
            </h4>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">0%</div>
                <div className="text-sm text-green-700">핵심 키워드 포함률</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">0%</div>
                <div className="text-sm text-green-700">구조 유사도</div>
              </div>
            </div>
            <div className="text-sm text-green-700">
              ※ 작성 완료 후 분석 결과가 표시됩니다
            </div>
          </div>
        </div>

        {/* 액션 버튼 */}
        <div className="flex gap-4 justify-center">
          <button
            onClick={handlePrevStep}
            className="px-6 py-3 bg-gray-500 hover:bg-gray-600 text-white rounded-lg font-semibold hover:transform hover:scale-105 transition-all"
          >
            ← 3단계로
          </button>
          <button
            className="px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-semibold hover:transform hover:scale-105 transition-all"
          >
            🔍 AI 분석하기
          </button>
          <button
            className="px-6 py-3 bg-green-500 hover:bg-green-600 text-white rounded-lg font-semibold hover:transform hover:scale-105 transition-all"
          >
            🎉 훈련 완료
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col md:flex-row gap-6 max-w-7xl mx-auto mt-8 p-4 items-start">
      {/* 왼쪽: 메인 훈련 UI */}
      <div className="flex-1 max-w-4xl min-w-0">
        {renderCurrentStep()}
      </div>
      
      {/* 오른쪽: 가이드 패널 */}
      <div className="w-full md:w-96 flex-shrink-0">
        <GuidePanel />
      </div>
    </div>
  );
};

export default MemoryTraining; 