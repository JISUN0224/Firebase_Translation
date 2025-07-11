import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db, auth } from '../../firebase';
import { saveStudySession } from '../Tran_Analysis/studyDataUtils';

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
  const [exerciseSelected, setExerciseSelected] = useState(false);
  
  // 1단계: 타이머 상태
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [isTimerPaused, setIsTimerPaused] = useState(false);
  const [timerCompleted, setTimerCompleted] = useState(false);
  
  // 2단계: 빈칸 채우기 상태
  const [blanks, setBlanks] = useState<BlankItem[]>([]);
  const [processedScript, setProcessedScript] = useState<string>('');
  const [showAllAnswers, setShowAllAnswers] = useState(false);
  
  // 3단계: 문장 재배열 상태
  const [dragItems, setDragItems] = useState<DragItem[]>([]);
  const [dropZones, setDropZones] = useState<(DragItem | null)[]>([]);
  const [draggedItem, setDraggedItem] = useState<DragItem | null>(null);
  const [dragOverZone, setDragOverZone] = useState<number | null>(null);
  const [isCorrectOrder, setIsCorrectOrder] = useState<boolean[]>([]);
  const [showHints, setShowHints] = useState(false);
  const [showAnswer, setShowAnswer] = useState(false);
  
  // 4단계: 스토리 재생산 상태
  const [inputMode, setInputMode] = useState<'text' | 'speech'>('text');
  const [userInput, setUserInput] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  
  // 세션 관리
  const [sessionStartTime, setSessionStartTime] = useState<number>(Date.now());
  const [completedSteps, setCompletedSteps] = useState<StepType[]>([]);
  const [totalScore, setTotalScore] = useState(0);
  
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
        // 아직 문제가 선택되지 않았을 때만 새로 선택
        if (!exerciseSelected) {
          // 랜덤하게 하나 선택
          const randomExercise = exercisesList[Math.floor(Math.random() * exercisesList.length)];
          setCurrentExercise(randomExercise);
          setTimeRemaining(randomExercise.duration);
          setExerciseSelected(true);
        }
      } else {
        setError('선택한 조건에 맞는 연습문제가 없습니다.');
        setCurrentExercise(null);
        setExerciseSelected(false);
      }
    } catch (err) {
      console.error('데이터 가져오기 실패:', err);
      setError('데이터를 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  }, [selectedType, exerciseSelected]);

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

  // 빈칸 초기화 함수
  const initializeBlanks = useCallback(() => {
    if (!currentExercise) return;

    const keyPoints = currentExercise.content.key_points;
    const script = currentExercise.content.script;
    
    // 핵심 단어들을 스크립트에서 찾아서 빈칸으로 만들기
    const newBlanks: BlankItem[] = [];
    let modifiedScript = script;
    let blankCounter = 1;
    
    keyPoints.forEach((point, index) => {
      // 특수 문자 이스케이프 처리
      const escapedPoint = point.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\b${escapedPoint}\\b`, 'gi');
      const matches = [...script.matchAll(new RegExp(regex, 'gi'))];
      
      if (matches.length > 0) {
        const match = matches[0];
        const blank: BlankItem = {
          id: `blank-${index}`,
          originalWord: match[0],
          userInput: '',
          isCorrect: false,
          showHint: false,
          position: { start: match.index || 0, end: (match.index || 0) + match[0].length }
        };
        newBlanks.push(blank);
        
        // 첫 번째 매치만 빈칸으로 변경
        modifiedScript = modifiedScript.replace(regex, `____${blankCounter}____`);
        blankCounter++;
      } else {
        // 단어 경계 없이 시도
        const simpleRegex = new RegExp(escapedPoint, 'gi');
        const simpleMatches = [...script.matchAll(simpleRegex)];
        
        if (simpleMatches.length > 0) {
          const match = simpleMatches[0];
          const blank: BlankItem = {
            id: `blank-${index}`,
            originalWord: match[0],
            userInput: '',
            isCorrect: false,
            showHint: false,
            position: { start: match.index || 0, end: (match.index || 0) + match[0].length }
          };
          newBlanks.push(blank);
          
          modifiedScript = modifiedScript.replace(simpleRegex, `____${blankCounter}____`);
          blankCounter++;
        }
      }
    });
    
    setBlanks(newBlanks);
    setProcessedScript(modifiedScript);
  }, [currentExercise]);

  // 드래그 앤 드롭 초기화 함수
  const initializeDragItems = useCallback(() => {
    if (!currentExercise) return;

    const segments = currentExercise.content.segments;
    
    // 세그먼트를 섞어서 드래그 아이템 생성
    const shuffledItems = [...segments]
      .sort(() => Math.random() - 0.5)
      .map((segment, index) => ({
        id: `segment-${segment.order}`,
        text: segment.text,
        originalOrder: segment.order,
        currentPosition: null
      }));

    setDragItems(shuffledItems);
    
    // 드롭 존 초기화 (모든 위치를 null로)
    setDropZones(new Array(segments.length).fill(null));
    
    // 정답 체크 배열 초기화
    setIsCorrectOrder(new Array(segments.length).fill(false));
  }, [currentExercise]);

  // 드래그 핸들러
  const handleDragStart = (e: React.DragEvent, item: DragItem) => {
    setDraggedItem(item);
    e.dataTransfer.setData('text/plain', item.id);
    e.dataTransfer.setData('application/json', JSON.stringify(item));
  };

  const handleDragOver = (e: React.DragEvent, zoneIndex: number) => {
    e.preventDefault();
    setDragOverZone(zoneIndex);
  };

  const handleDragLeave = () => {
    setDragOverZone(null);
  };

  const handleDrop = (e: React.DragEvent, zoneIndex: number) => {
    e.preventDefault();
    setDragOverZone(null);
    
    const droppedData = e.dataTransfer.getData('application/json');
    if (droppedData && draggedItem) {
      const item = JSON.parse(droppedData);
      
      // 새로운 드롭 존 배열 생성
      const newDropZones = [...dropZones];
      
      // 기존에 해당 아이템이 다른 위치에 있었다면 제거
      const existingIndex = newDropZones.findIndex(zone => zone && zone.id === item.id);
      if (existingIndex !== -1) {
        newDropZones[existingIndex] = null;
      }
      
      // 새 위치에 아이템 배치
      newDropZones[zoneIndex] = item;
      setDropZones(newDropZones);
      
      // 드래그 아이템 리스트에서 제거
      setDragItems(prev => prev.filter(dragItem => dragItem.id !== item.id));
      
      // 정답 체크
      checkCorrectOrder(newDropZones);
    }
    
    setDraggedItem(null);
  };

  // 드롭 존에서 아이템 제거 (다시 드래그 리스트로)
  const removeFromDropZone = (zoneIndex: number) => {
    const item = dropZones[zoneIndex];
    if (item) {
      // 드롭 존에서 제거
      const newDropZones = [...dropZones];
      newDropZones[zoneIndex] = null;
      setDropZones(newDropZones);
      
      // 드래그 아이템 리스트에 다시 추가
      setDragItems(prev => [...prev, item]);
      
      // 정답 체크
      checkCorrectOrder(newDropZones);
    }
  };

  // 정답 순서 체크
  const checkCorrectOrder = (zones: (DragItem | null)[]) => {
    const newIsCorrect = zones.map((zone, index) => {
      if (!zone) return false;
      return zone.originalOrder === index + 1;
    });
    setIsCorrectOrder(newIsCorrect);
  };

  // 정답률 계산
  const getDragScore = () => {
    const correct = isCorrectOrder.filter(Boolean).length;
    const total = dropZones.filter(zone => zone !== null).length;
    return { correct, total, maxTotal: dropZones.length };
  };

  // 다음 단계로 이동
  const handleNextStep = () => {
    // 현재 단계 완료 처리
    if (!completedSteps.includes(currentStep)) {
      setCompletedSteps(prev => [...prev, currentStep]);
      
      // 단계별 점수 계산
      let stepScore = 0;
      if (currentStep === STEPS.TIMER) {
        stepScore = timerCompleted ? 100 : 0;
             } else if (currentStep === STEPS.BLANKS) {
         const blankScore = getBlankScore();
         stepScore = (blankScore.correct / blankScore.total) * 100;
       } else if (currentStep === STEPS.REORDER) {
         const dragScore = getDragScore();
         stepScore = (dragScore.correct / dragScore.maxTotal) * 100;
      } else if (currentStep === STEPS.REPRODUCE) {
        stepScore = analysisResult?.overallScore || 0;
      }
      
      setTotalScore(prev => prev + stepScore);
    }
    
    switch (currentStep) {
      case STEPS.TIMER:
        setCurrentStep(STEPS.BLANKS);
        initializeBlanks(); // 빈칸 초기화
        break;
      case STEPS.BLANKS:
        setCurrentStep(STEPS.REORDER);
        initializeDragItems(); // 드래그 아이템 초기화
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

  // AI 분석 함수
  const handleAnalyzeText = async () => {
    if (!userInput.trim() || !currentExercise) return;
    
    setIsAnalyzing(true);
    
    try {
      // 실제 AI 분석 대신 간단한 키워드 매칭 분석 구현
      const keyPoints = currentExercise.content.key_points;
      const originalScript = currentExercise.content.script;
      
      // 키워드 매칭 분석
      const matchedKeywords = keyPoints.filter(keyword => 
        userInput.toLowerCase().includes(keyword.toLowerCase())
      );
      const missedKeywords = keyPoints.filter(keyword => 
        !userInput.toLowerCase().includes(keyword.toLowerCase())
      );
      
      // 점수 계산
      const keywordCoverage = (matchedKeywords.length / keyPoints.length) * 100;
      const lengthRatio = Math.min(userInput.length / originalScript.length, 1);
      const structureSimilarity = lengthRatio * 70 + (keywordCoverage * 0.3);
      const contentCompleteness = keywordCoverage;
      const languageFluency = userInput.length > 50 ? 85 : 60;
      const overallScore = (keywordCoverage + structureSimilarity + contentCompleteness + languageFluency) / 4;
      
      const result: AnalysisResult = {
        keywordCoverage,
        structureSimilarity,
        contentCompleteness,
        languageFluency,
        overallScore,
        detailedFeedback: {
          matchedKeywords,
          missedKeywords,
          structureAnalysis: `전체 길이: ${userInput.length}자, 원문 대비 ${Math.round(lengthRatio * 100)}%`,
          suggestions: [
            missedKeywords.length > 0 ? `누락된 키워드: ${missedKeywords.join(', ')}` : '모든 키워드가 포함되었습니다',
            userInput.length < 100 ? '더 자세한 설명을 추가해보세요' : '적절한 길이입니다',
            '논리적 순서를 확인해보세요'
          ]
        }
      };
      
      setAnalysisResult(result);
    } catch (error) {
      console.error('분석 실패:', error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // 세션 저장 함수
  const saveMemoryTrainingSession = async () => {
    if (!auth.currentUser || !currentExercise || completedSteps.length === 0) {
      return;
    }

    try {
      const studyTime = Math.floor((Date.now() - sessionStartTime) / 1000);
      const averageScore = totalScore / completedSteps.length;
      
      const sessionData = {
        date: new Date().toISOString().split('T')[0],
        gameType: '메모리_훈련',
        totalScore: totalScore,
        problemCount: completedSteps.length,
        studyTime: studyTime,
        averageScore: averageScore,
        metadata: {
          difficulty: currentExercise.level === 1 ? '초급' : currentExercise.level === 2 ? '중급' : '고급',
          domain: currentExercise.category,
          targetLanguage: '한국어',
          exerciseType: currentExercise.type,
          exerciseTitle: currentExercise.title,
          totalSteps: 4,
          completedSteps: completedSteps.length,
          completionRate: (completedSteps.length / 4) * 100
        }
      };

      await saveStudySession(sessionData);
      console.log('메모리 훈련 세션 저장 완료:', sessionData);
      
    } catch (error) {
      console.error('세션 저장 실패:', error);
    }
  };

  // 훈련 완료 처리
  const handleComplete = () => {
    // 세션 저장
    saveMemoryTrainingSession();
    
    alert('🎉 메모리 훈련이 완료되었습니다!\n\n결과를 확인하고 다시 도전해보세요.');
    // 초기화
    setCurrentStep(STEPS.TIMER);
    setExerciseSelected(false);
    setCurrentExercise(null);
    setUserInput('');
    setAnalysisResult(null);
    setCompletedSteps([]);
    setTotalScore(0);
    setSessionStartTime(Date.now());
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
          <div className="space-y-2">
            <div className="bg-gray-50 rounded-lg px-4 py-2">
              <div className="flex items-center">
                <span className="bg-blue-500 text-white w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold">1</span>
                <span className="font-semibold text-gray-900 text-sm">타이머학습</span>
              </div>
              <div className="flex items-center">
                <span className="bg-blue-500 text-white w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold invisible">1</span>
                <span className="text-gray-500 text-xs">집중해서 내용 기억</span>
              </div>
            </div>
            <div className="bg-gray-50 rounded-lg px-4 py-2">
              <div className="flex items-center">
                <span className="bg-orange-500 text-white w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold">2</span>
                <span className="font-semibold text-gray-900 text-sm">빈칸채우기</span>
              </div>
              <div className="flex items-center">
                <span className="bg-orange-500 text-white w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold invisible">2</span>
                <span className="text-gray-500 text-xs">핵심 단어 기억 테스트</span>
              </div>
            </div>
            <div className="bg-gray-50 rounded-lg px-4 py-2">
              <div className="flex items-center">
                <span className="bg-green-500 text-white w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold">3</span>
                <span className="font-semibold text-gray-900 text-sm">문장재배열</span>
              </div>
              <div className="flex items-center">
                <span className="bg-green-500 text-white w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold invisible">3</span>
                <span className="text-gray-500 text-xs">논리적 순서 재구성</span>
              </div>
            </div>
            <div className="bg-gray-50 rounded-lg px-4 py-2">
              <div className="flex items-center">
                <span className="bg-purple-500 text-white w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold">4</span>
                <span className="font-semibold text-gray-900 text-sm">스토리재생산</span>
              </div>
              <div className="flex items-center">
                <span className="bg-purple-500 text-white w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold invisible">4</span>
                <span className="text-gray-500 text-xs">완전한 내용 복원</span>
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
              <div className="mb-2"><strong>청킹(Chunking):</strong> 정보를 의미 단위로 기억</div>
              <div className="mb-2"><strong>시각화:</strong> 내용을 이미지로 변환하여 저장</div>
              <div><strong>연상 기법:</strong> 기존 지식과 연결하여 기억 강화</div>
            </div>
          )}
        </div>

        {/* 학습 효과 */}
        <div className="learning-effects bg-green-50 border border-green-200 rounded-xl px-5 py-4 text-left">
          <h4 className="text-green-800 font-bold text-base mb-2">
            <span>🎯</span>학습 효과
          </h4>
          <ul className="list-disc ml-5 text-green-900 text-[15px] space-y-1 text-left">
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
              onChange={(e) => {
                setSelectedType(e.target.value);
                setExerciseSelected(false); // 새로운 타입 선택 시 문제 재선택 허용
                setCurrentStep(STEPS.TIMER); // 1단계로 리셋
              }}
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

  // 빈칸 입력 처리 함수
  const handleBlankInput = (blankId: string, value: string) => {
    setBlanks(prev => prev.map(blank => 
      blank.id === blankId 
        ? { 
            ...blank, 
            userInput: value,
            isCorrect: value.trim().toLowerCase() === blank.originalWord.toLowerCase()
          }
        : blank
    ));
  };

  // 힌트 토글 함수
  const toggleHint = (blankId: string) => {
    setBlanks(prev => prev.map(blank => 
      blank.id === blankId 
        ? { ...blank, showHint: !blank.showHint }
        : blank
    ));
  };

  // 정답률 계산
  const getBlankScore = () => {
    if (blanks.length === 0) return { correct: 0, total: 0 };
    const correct = blanks.filter(blank => blank.isCorrect).length;
    return { correct, total: blanks.length };
  };

  // 2단계: 빈칸 채우기
  const renderBlanksStep = () => {
    if (!currentExercise) return null;

    const score = getBlankScore();

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
              {blanks.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <p>빈칸이 생성되지 않았습니다.</p>
                  <p>1단계에서 2단계로 넘어올 때 빈칸이 자동으로 생성됩니다.</p>
                  <button
                    onClick={() => initializeBlanks()}
                    className="mt-4 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                  >
                    빈칸 수동 생성
                  </button>
                </div>
              ) : (
                <div>
                  {(() => {
                    if (!processedScript) return currentExercise.content.script;
                    
                    // ____1____, ____2____ 등을 노란색 배경의 빈칸으로 변경
                    let displayText = processedScript;
                    blanks.forEach((blank, index) => {
                      const blankMarker = `____${index + 1}____`;
                      const styledBlank = `<span style="background-color: #fef3c7; padding: 2px 8px; border-radius: 4px; color: #92400e; font-weight: 600;">빈칸${index + 1}</span>`;
                      displayText = displayText.replace(blankMarker, styledBlank);
                    });
                    
                    return <div dangerouslySetInnerHTML={{ __html: displayText }} />;
                  })()}
                </div>
              )}
            </div>
          </div>

          {/* 빈칸 입력 섹션 */}
          {blanks.length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
              <h4 className="text-lg font-semibold text-blue-800 mb-4 text-center">
                📝 빈칸에 들어갈 단어들을 입력하세요
              </h4>
              <div className="space-y-4">
                {blanks.map((blank, index) => (
                  <div key={blank.id} className="flex items-center gap-4 bg-white p-4 rounded-lg border shadow-sm">
                    <span className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${
                      blank.isCorrect ? 'bg-green-500 text-white' : 'bg-blue-500 text-white'
                    }`}>
                      {blank.isCorrect ? '✓' : index + 1}
                    </span>
                    <div className="flex-1">
                      <input
                        type="text"
                        value={blank.userInput}
                        onChange={(e) => handleBlankInput(blank.id, e.target.value)}
                        placeholder={`빈칸 ${index + 1}에 들어갈 단어를 입력하세요...`}
                        className={`w-full p-3 border-2 rounded-lg focus:outline-none focus:ring-2 transition-all ${
                          blank.userInput && blank.isCorrect
                            ? 'border-green-500 focus:ring-green-500 bg-green-50 text-green-800 font-semibold'
                            : blank.userInput && !blank.isCorrect
                            ? 'border-red-500 focus:ring-red-500 bg-red-50 text-red-800'
                            : 'border-gray-300 focus:ring-blue-500'
                        }`}
                      />
                      {blank.userInput && blank.isCorrect && (
                        <div className="mt-1 text-sm text-green-600 font-medium">
                          ✅ 정답입니다!
                        </div>
                      )}
                      {blank.userInput && !blank.isCorrect && blank.userInput.length > 0 && (
                        <div className="mt-1 text-sm text-red-600">
                          ❌ 다시 시도해보세요
                        </div>
                      )}
                    </div>
                    <button 
                      onClick={() => toggleHint(blank.id)}
                      className="px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-white rounded-lg font-medium transition-all"
                    >
                      💡 힌트
                    </button>
                    {blank.showHint && (
                      <div className="absolute mt-16 bg-yellow-100 border-2 border-yellow-300 rounded-lg p-3 text-sm text-yellow-800 z-10 shadow-lg">
                        <strong>힌트:</strong> 첫 글자는 "{blank.originalWord.charAt(0)}"입니다
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 점수 표시 */}
          <div className="mt-6 text-center">
            <div className="inline-flex items-center gap-2 bg-green-50 border border-green-200 px-4 py-2 rounded-lg">
              <span className="text-green-600 font-semibold">정답률:</span>
              <span className="text-green-800 font-bold">{score.correct}/{score.total}</span>
            </div>
          </div>

          {/* 정답 보기 버튼 */}
          <div className="mt-4 text-center">
            <button
              onClick={() => setShowAllAnswers(!showAllAnswers)}
              className="px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-white rounded-lg font-semibold"
            >
              {showAllAnswers ? '정답 숨기기' : '정답 보기'}
            </button>
          </div>

          {/* 정답 표시 */}
          {showAllAnswers && (
            <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <h4 className="font-semibold text-yellow-800 mb-2">정답:</h4>
              <div className="space-y-2">
                {blanks.map((blank, index) => (
                  <div key={blank.id} className="flex items-center gap-2">
                    <span className="bg-yellow-500 text-white w-6 h-6 rounded-full flex items-center justify-center font-bold text-sm">
                      {index + 1}
                    </span>
                    <span className="text-yellow-800 font-semibold">{blank.originalWord}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
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

    const score = getDragScore();

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
          
          {/* 점수 표시 */}
          <div className="mb-6 text-center">
            <div className="inline-flex items-center gap-2 bg-blue-50 border border-blue-200 px-4 py-2 rounded-lg">
              <span className="text-blue-600 font-semibold">정확도:</span>
              <span className="text-blue-800 font-bold">{score.correct}/{score.maxTotal} 정렬 완료</span>
            </div>
          </div>

          {/* 드래그 아이템들이 없을 때 초기화 버튼 */}
          {dragItems.length === 0 && dropZones.every(zone => zone === null) && (
            <div className="text-center py-8">
              <p className="text-gray-500 mb-4">드래그 아이템이 생성되지 않았습니다.</p>
              <button
                onClick={() => initializeDragItems()}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
              >
                드래그 아이템 생성
              </button>
            </div>
          )}

          {/* 섞인 문장들 (드래그 소스) */}
          {dragItems.length > 0 && (
            <div className="mb-6">
              <h4 className="font-semibold text-gray-700 mb-3">📦 섞인 문장들 (아래로 드래그하세요)</h4>
              <div className="bg-yellow-50 border-2 border-dashed border-yellow-300 rounded-lg p-4 min-h-[120px]">
                <div className="space-y-3">
                  {dragItems.map((item) => (
                    <div 
                      key={item.id}
                      className="bg-white p-3 rounded-lg border-2 border-gray-200 hover:border-blue-300 cursor-move transition-all shadow-sm hover:shadow-md"
                      draggable
                      onDragStart={(e) => handleDragStart(e, item)}
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
          )}

          {/* 정렬 영역 (드롭 존) */}
          <div className="mb-6">
            <h4 className="font-semibold text-gray-700 mb-3">🎯 올바른 순서로 배치하세요</h4>
            <div className="bg-green-50 border-2 border-dashed border-green-300 rounded-lg p-4 min-h-[300px]">
              <div className="space-y-3">
                {dropZones.map((zone, index) => (
                  <div 
                    key={index}
                    className={`border-2 rounded-lg p-4 min-h-[80px] flex items-center transition-all ${
                      dragOverZone === index 
                        ? 'border-green-500 bg-green-100' 
                        : zone 
                        ? isCorrectOrder[index] 
                          ? 'border-green-500 bg-green-50 shadow-md' 
                          : 'border-red-500 bg-red-50 shadow-md'
                        : 'border-gray-200 hover:border-green-400 bg-white'
                    }`}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, index)}
                  >
                    <div className="flex items-center gap-4 w-full">
                      <span className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shadow-sm ${
                        zone 
                          ? isCorrectOrder[index] 
                            ? 'bg-green-500 text-white' 
                            : 'bg-red-500 text-white'
                          : 'bg-gray-400 text-white'
                      }`}>
                        {zone && isCorrectOrder[index] ? '✓' : index + 1}
                      </span>
                      <div className="flex-1">
                        {zone ? (
                          <div className="flex items-center justify-between">
                            <div className={`text-sm leading-relaxed font-medium ${
                              isCorrectOrder[index] 
                                ? 'text-green-800' 
                                : 'text-red-800'
                            }`}>
                              {zone.text}
                              {isCorrectOrder[index] && (
                                <span className="ml-2 text-green-600 font-bold">✓ 정답!</span>
                              )}
                              {!isCorrectOrder[index] && (
                                <span className="ml-2 text-red-600 font-bold">✗ 틀림</span>
                              )}
                            </div>
                            <button
                              onClick={() => removeFromDropZone(index)}
                              className="ml-2 px-2 py-1 bg-red-500 hover:bg-red-600 text-white rounded text-xs transition-colors"
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <div className="text-gray-400 text-center">
                            여기에 문장을 드래그해주세요
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 컨트롤 버튼 */}
          <div className="flex gap-4 justify-center mb-4">
            <button
              onClick={() => setShowHints(!showHints)}
              className="px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-white rounded-lg font-semibold"
            >
              {showHints ? '힌트 숨기기' : '💡 힌트 보기'}
            </button>
            <button
              onClick={() => setShowAnswer(!showAnswer)}
              className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-semibold"
            >
              {showAnswer ? '정답 숨기기' : '📝 정답 보기'}
            </button>
            <button
              onClick={() => initializeDragItems()}
              className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-semibold"
            >
              🔄 다시 섞기
            </button>
          </div>

          {/* 힌트 표시 */}
          {showHints && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
              <h4 className="flex items-center gap-2 text-yellow-800 font-semibold mb-2">
                <span>💡</span>재배열 힌트
              </h4>
              <ul className="text-yellow-700 text-sm space-y-1">
                <li>• 시간순서나 논리적 흐름을 고려하세요</li>
                <li>• 원인과 결과의 관계를 파악하세요</li>
                <li>• 도입-전개-결론 구조를 생각해보세요</li>
              </ul>
            </div>
          )}

          {/* 정답 표시 */}
          {showAnswer && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <h4 className="font-semibold text-green-800 mb-2 text-center">📝 정답 순서:</h4>
              <div className="space-y-2">
                {currentExercise.content.segments
                  .sort((a, b) => a.order - b.order)
                  .map((segment, index) => (
                    <div key={segment.order} className="flex items-center gap-2 text-left">
                      <span className="bg-green-500 text-white w-6 h-6 rounded-full flex items-center justify-center font-bold text-sm">
                        {index + 1}
                      </span>
                      <span className="text-green-800 text-sm text-left">{segment.text}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}
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
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              placeholder="여기에 기억한 내용을 자신의 말로 작성해주세요..."
              className="w-full h-40 p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              maxLength={1000}
            />
            <div className="text-right text-sm text-gray-500 mt-2">
              {userInput.length} / 1000자
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

          {/* AI 분석 결과 */}
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <h4 className="flex items-center gap-2 text-green-800 font-semibold mb-3">
              <span>🤖</span>AI 분석 결과
            </h4>
            {analysisResult ? (
              <div>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">{Math.round(analysisResult.keywordCoverage)}%</div>
                    <div className="text-sm text-green-700">핵심 키워드 포함률</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">{Math.round(analysisResult.structureSimilarity)}%</div>
                    <div className="text-sm text-green-700">구조 유사도</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">{Math.round(analysisResult.contentCompleteness)}%</div>
                    <div className="text-sm text-green-700">내용 완성도</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">{Math.round(analysisResult.languageFluency)}%</div>
                    <div className="text-sm text-green-700">언어 유창성</div>
                  </div>
                </div>
                <div className="text-center mb-4">
                  <div className="text-3xl font-bold text-purple-600">{Math.round(analysisResult.overallScore)}%</div>
                  <div className="text-sm text-purple-700 font-semibold">종합 점수</div>
                </div>
                
                {/* 상세 피드백 */}
                <div className="bg-white rounded-lg p-4 border border-green-300">
                  <h5 className="font-semibold text-green-800 mb-2">📊 상세 분석</h5>
                  <div className="space-y-2 text-sm">
                    <div>
                      <span className="font-medium text-green-700">매칭된 키워드:</span>
                      <span className="ml-2 text-green-600">
                        {analysisResult.detailedFeedback.matchedKeywords.length > 0 
                          ? analysisResult.detailedFeedback.matchedKeywords.join(', ')
                          : '없음'}
                      </span>
                    </div>
                    <div>
                      <span className="font-medium text-red-700">누락된 키워드:</span>
                      <span className="ml-2 text-red-600">
                        {analysisResult.detailedFeedback.missedKeywords.length > 0 
                          ? analysisResult.detailedFeedback.missedKeywords.join(', ')
                          : '없음'}
                      </span>
                    </div>
                    <div>
                      <span className="font-medium text-blue-700">구조 분석:</span>
                      <span className="ml-2 text-blue-600">{analysisResult.detailedFeedback.structureAnalysis}</span>
                    </div>
                  </div>
                  
                  <div className="mt-4">
                    <h6 className="font-medium text-orange-700 mb-2">💡 개선 제안</h6>
                    <ul className="text-sm text-orange-600 space-y-1">
                      {analysisResult.detailedFeedback.suggestions.map((suggestion, index) => (
                        <li key={index}>• {suggestion}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-sm text-green-700">
                ※ 작성 완료 후 '🔍 AI 분석하기' 버튼을 눌러주세요
              </div>
            )}
          </div>
        </div>

        {/* 컨트롤 버튼 */}
        <div className="flex gap-4 justify-center mb-4">
          <button
            onClick={() => setShowOriginal(!showOriginal)}
            className="px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-white rounded-lg font-semibold"
          >
            {showOriginal ? '원본 숨기기' : '📄 원본 보기'}
          </button>
          <button
            onClick={() => setUserInput('')}
            className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg font-semibold"
          >
            🗑️ 초기화
          </button>
        </div>

        {/* 원본 스크립트 표시 */}
        {showOriginal && (
          <div className="bg-gray-100 border border-gray-300 rounded-lg p-4 mb-6">
            <h4 className="font-semibold text-gray-800 mb-2">📄 원본 스크립트 (참고용)</h4>
            <div className="text-sm text-gray-700 leading-relaxed">
              {currentExercise.content.script}
            </div>
          </div>
        )}

        {/* 액션 버튼 */}
        <div className="flex gap-4 justify-center">
          <button
            onClick={handlePrevStep}
            className="px-6 py-3 bg-gray-500 hover:bg-gray-600 text-white rounded-lg font-semibold hover:transform hover:scale-105 transition-all"
          >
            ← 3단계로
          </button>
          <button
            onClick={handleAnalyzeText}
            disabled={!userInput.trim() || isAnalyzing}
            className={`px-6 py-3 rounded-lg font-semibold hover:transform hover:scale-105 transition-all ${
              !userInput.trim() || isAnalyzing
                ? 'bg-gray-400 cursor-not-allowed text-gray-200'
                : 'bg-blue-500 hover:bg-blue-600 text-white'
            }`}
          >
            {isAnalyzing ? '🔄 분석 중...' : '🔍 AI 분석하기'}
          </button>
          <button
            onClick={handleComplete}
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