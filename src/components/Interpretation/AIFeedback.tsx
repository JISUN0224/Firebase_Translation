import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import axios from 'axios';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { getStorage, ref, getDownloadURL } from 'firebase/storage';
import { db } from '../../firebase';

interface AudioConstraints {
  echoCancellation: boolean;
  noiseSuppression: boolean;
  autoGainControl: boolean;
  sampleRate: number;
  channelCount: number;
}

interface TranscriptionResult {
  transcript: string;
  confidence: number;
  alternatives: string[];
  processingTime: number;
  isFinal: boolean;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  transcript: string;
  confidence: number;
}

interface AudioLevel {
  level: number;
  timestamp: number;
}

interface SpeechResult {
  transcript: string;
  confidence: number;
  alternatives?: string[];
}

interface InterpretationAnalysis {
  accuracy: number;
  fluency: number;
  grammar: number;
  completeness: number;
  overall_score: number;
  feedback: {
    strengths: string[];
    improvements: string[];
    overall_comment: string;
  };
  processing_time: number;
}

// Firebase 통역 연습 데이터 인터페이스
interface Problem {
  id?: string;
  title: string;
  category: string;
  author: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  description: string;
  total_segments: number;
  estimated_total_time: number;
  created_date: string;
  metadata: {
    source: string;
    language_pair: string;
    content_type: string;
    tags: string[];
  };
  segments: Array<{
    id: number;
    korean_text: string;
    chinese_interpretation_reference: string;
    char_count: number;
    difficulty_level: string;
    audio_timing: {
      start_time_sec: number;
      end_time_sec: number;
    };
    key_vocabulary: Array<{
      chinese: string;
      korean: string;
      pinyin: string;
      example_chinese: string;
      example_korean: string;
      note: string;
    }>;
    grammar_points: Array<{
      chinese_explanation: string;
      korean_pattern: string;
      example_chinese: string;
      example_korean: string;
    }>;
    interpreting_hints: string[];
    common_interpretation_challenges: string[];
    suggested_note_taking_points: string[];
    alternative_chinese_interpretations: string[];
    recommended_delivery_tone: string;
    cultural_context: string;
    difficulty_analysis: string;
  }>;
}

interface FilterOptions {
  difficulty: string;
  category: string;
}

const AIFeedback: React.FC = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  // 음성 인식 관련 상태
  const [accumulatedText, setAccumulatedText] = useState(''); // 누적된 전체 텍스트
  const [currentText, setCurrentText] = useState(''); // 현재 실시간 텍스트
  const [speechSupported, setSpeechSupported] = useState(false);
  const recognitionRef = useRef<any>(null);

  // 통역 분석 관련 상태
  const [originalText, setOriginalText] = useState('');
  const [userInterpretation, setUserInterpretation] = useState('');
  const [sourceLanguage, setSourceLanguage] = useState<'ko' | 'zh'>('ko');
  const [analysisResult, setAnalysisResult] = useState<InterpretationAnalysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  // Firebase 통역 연습 관련 상태
  const [problems, setProblems] = useState<Problem[]>([]);
  const [selectedProblem, setSelectedProblem] = useState<Problem | null>(null);
  const [selectedSegmentIndex, setSelectedSegmentIndex] = useState(0);
  const [showOriginalText, setShowOriginalText] = useState(false);
  const [showVocabulary, setShowVocabulary] = useState(false);
  const [showHints, setShowHints] = useState(false);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [audioCurrentTime, setAudioCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [isLoadingProblems, setIsLoadingProblems] = useState(false);
  const [filters, setFilters] = useState<FilterOptions>({
    difficulty: '전체',
    category: '전체'
  });

  // 요청된 새로운 상태 변수들
  const [loading, setLoading] = useState(false);
  const [availableCategories, setAvailableCategories] = useState<string[]>(['전체']);
  const [currentAudioUrl, setCurrentAudioUrl] = useState<string | null>(null);
  const [audioLoading, setAudioLoading] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [isButtonDisabled, setIsButtonDisabled] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const animationRef = useRef<number | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const speechRecognitionRef = useRef<any>(null);
  const animationIdRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const isRecordingRef = useRef<boolean>(false);
  const isPausedRef = useRef<boolean>(false);
  const noSpeechCountRef = useRef<number>(0);
  
  // Firebase 통역 연습 관련 ref
  const practiceAudioRef = useRef<HTMLAudioElement | null>(null);
  const userInterpretationRef = useRef<HTMLTextAreaElement | null>(null);

  // 추가 상태 변수들
  const [showAllSegments, setShowAllSegments] = useState(false);

  // 오디오 제약 조건
  const audioConstraints: AudioConstraints = {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    sampleRate: 44100,
    channelCount: 1
  };

  const maxRecordingTime = 300000; // 5분
  const silenceThreshold = 0.01;

  // 컴포넌트 마운트 시 데이터 로딩
  useEffect(() => {
    fetchProblems();
    loadAudioFile(); // 기본 음성 파일 로드
  }, []);

  // 데이터 로딩 완료 후 디버깅 로그
  useEffect(() => {
    if (problems.length > 0) {
      console.log('=== Firebase 데이터 구조 분석 ===');
      console.log('총 문제 수:', problems.length);
      console.log('첫 번째 문제 전체 구조:', problems[0]);
      
      // 문서 키 분석
      console.log('문서 최상위 키들:', Object.keys(problems[0]));
      
      // 세그먼트 구조 분석
      if (problems[0].segments && problems[0].segments.length > 0) {
        console.log('첫 번째 세그먼트 구조:', problems[0].segments[0]);
        console.log('세그먼트 키들:', Object.keys(problems[0].segments[0]));
      }
      
      // 메타데이터 구조 분석
      if (problems[0].metadata) {
        console.log('메타데이터 구조:', problems[0].metadata);
      }
      
      // 사용 가능한 값들 분석
      console.log('사용 가능한 난이도:', Array.from(new Set(problems.map(p => p.difficulty))));
      console.log('사용 가능한 카테고리:', Array.from(new Set(problems.map(p => p.category))));
      console.log('사용 가능한 언어 쌍:', Array.from(new Set(problems.map(p => p.metadata?.language_pair).filter(Boolean))));
      console.log('================================');
    }
  }, [problems]);

  // 실제 데이터 기반 필터링
  const getFilteredProblems = useMemo(() => {
    return problems.filter(problem => {
      const difficultyMatch = filters.difficulty === '전체' || 
        problem.difficulty === filters.difficulty;
      const categoryMatch = filters.category === '전체' || 
        problem.category === filters.category;
      
      return difficultyMatch && categoryMatch;
    });
  }, [problems, filters]);

  // Firestore에서 interpreting_data 컬렉션의 모든 문서 가져오기
  const fetchProblems = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const querySnapshot = await getDocs(collection(db, 'interpreting_data'));
      const problemsData: Problem[] = [];
      
      console.log('=== 원본 Firebase 데이터 분석 ===');
      console.log('총 문서 수:', querySnapshot.size);
      
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        console.log(`문서 ID: ${doc.id}`);
        console.log('문서 최상위 키들:', Object.keys(data));
        console.log('전체 문서 데이터:', data);
        
        // 세그먼트 구조 분석
        const segmentKeys = Object.keys(data).filter(key => 
          key.includes('segment') || key === 'segments'
        );
        console.log('세그먼트 관련 키들:', segmentKeys);
        
        if (segmentKeys.length > 0) {
          console.log('첫 번째 세그먼트 키의 데이터:', data[segmentKeys[0]]);
        }
        

        
        console.log('---');
        
        // 기존 Problem 구조로 변환 시도
        problemsData.push({ 
          id: doc.id, 
          ...data 
        } as Problem);
      });
      
      console.log('변환된 problemsData:', problemsData);
      console.log('================================');
      
      setProblems(problemsData);
      
      // 실제 데이터에서 카테고리 추출
      const categories = Array.from(new Set(problemsData.map(p => p.category)));
      setAvailableCategories(['전체', ...categories]);
      
      console.log('추출된 카테고리:', categories);
      
    } catch (error) {
      console.error('Firestore 데이터 로딩 실패:', error);
      handleFirebaseError(error);
    } finally {
      setLoading(false);
    }
  };

  // Firebase Storage에서 음성 파일 URL 가져오기 (문제별 개별 파일)
  const loadAudioFile = async (problem?: Problem) => {
    // 문제 내용에 따른 음성 파일 매핑
    let audioFileName = 'KoreanSpeech.mp3'; // 기본값: 한국 외교부장관 유엔총회 기조연설
    
    // 전달받은 문제 또는 현재 선택된 문제 사용
    const targetProblem = problem || selectedProblem;
    
    if (targetProblem) {
      const title = targetProblem.title.toLowerCase();
      const author = targetProblem.author?.toLowerCase() || '';
      
      // 마윈 연설 관련
      if (title.includes('마윈') || title.includes('jack ma') || 
          author.includes('마윈') || author.includes('jack ma') ||
          title.includes('yanjiang') || title.includes('알리바바')) {
        audioFileName = 'yanjiang_Chinese.mp3';
      }
      // 한국 외교부 관련 (기본값이므로 명시적으로 설정)
      else if (title.includes('외교부') || title.includes('유엔') || 
               title.includes('기조연설') || title.includes('한국')) {
        audioFileName = 'KoreanSpeech.mp3';
      }
      
      console.log(`문제 "${targetProblem.title}" → 음성파일: ${audioFileName}`);
    }

    try {
      setAudioLoading(true);
      setAudioError(null);
      
      const storage = getStorage();
      
      const audioRef = ref(storage, audioFileName);
      const audioUrl = await getDownloadURL(audioRef);
      
      setCurrentAudioUrl(audioUrl);
      console.log(`음성 파일 로딩 성공 (${audioFileName}):`, audioUrl);
      
    } catch (error: any) {
      console.error('음성 파일 로딩 실패:', error);
      
      if (error.code === 'storage/unauthorized') {
        setAudioError('음성 파일 접근 권한이 없습니다. Firebase Storage 보안 규칙을 확인해주세요.');
      } else if (error.code === 'storage/object-not-found') {
        const fileName = problemId === 'JEIBOYr3vC5dHfRDG9u1' ? 'yanjiang_Chinese.mp3' : 
                        problemId ? `${problemId}.mp3` : 'KoreanSpeech.mp3';
        setAudioError(`${fileName} 파일을 찾을 수 없습니다.`);
      } else {
        setAudioError('음성 파일을 불러올 수 없습니다. 네트워크 연결을 확인해주세요.');
      }
    } finally {
      setAudioLoading(false);
    }
  };

  // Firebase 연결 실패 시 fallback
  const handleFirebaseError = (error: any) => {
    console.error('Firebase 오류:', error);
    
    if (error.code === 'permission-denied') {
      setError('데이터베이스 접근 권한이 없습니다.');
    } else if (error.code === 'unavailable') {
      setError('Firebase 서비스를 사용할 수 없습니다. 잠시 후 다시 시도해주세요.');
    } else {
      setError('데이터를 불러오는 중 오류가 발생했습니다.');
    }
  };

  // 문제 선택 시 처리
  const handleProblemSelect = (problem: Problem) => {
    setSelectedProblem(problem);
    setSelectedSegmentIndex(0);
    setShowOriginalText(false);
    setShowVocabulary(false);
    setShowHints(false);
    setUserInterpretation('');
    setOriginalText('');
    
    // 선택된 문제의 음성 파일 로드
    loadAudioFile(problem.id);
    
    // 음성 인식 언어 설정 (통역 결과 언어로 설정)
    const languagePair = problem.metadata?.language_pair;
    if (languagePair) {
      let targetLanguage: 'ko' | 'zh' = 'ko'; // 기본값
      
      if (languagePair.includes('->')) {
        // "ko-KR -> zh-CN" 형태
        const parts = languagePair.split('->');
        if (parts.length === 2) {
          const target = parts[1].trim();
          targetLanguage = target.startsWith('zh') ? 'zh' : 'ko';
        }
      } else if (languagePair.includes('-') && !languagePair.includes('->')) {
        // "ko-zh" 형태
        const parts = languagePair.split('-');
        if (parts.length === 2) {
          const secondPart = parts[1];
          targetLanguage = secondPart.startsWith('zh') ? 'zh' : 'ko';
        }
      }
      
      console.log(`[${problem.title}] 통역 언어 설정:`, targetLanguage, `(language_pair: ${languagePair})`);
      setSourceLanguage(targetLanguage);
    }
    
    console.log('선택된 문제:', problem.title);
    console.log('문제 ID:', problem.id);
    console.log('총 세그먼트 수:', problem.total_segments);
  };

  // 문제 선택 핸들러 (기존)
  const handleProblemSelectCallback = useCallback((problem: Problem) => {
    setSelectedProblem(problem);
    setSelectedSegmentIndex(0);
    setShowOriginalText(false);
    setShowVocabulary(false);
    setShowHints(false);
    setUserInterpretation('');
    setOriginalText('');
    setAudioCurrentTime(0);
    setAudioDuration(0);
    
    // 선택된 문제의 음성 파일 로드
    loadAudioFile(problem.id);
    
    // 음성 인식 언어 설정 (통역 결과 언어로 설정)
    const languagePair = problem.metadata?.language_pair;
    if (languagePair) {
      let targetLanguage: 'ko' | 'zh' = 'ko'; // 기본값
      
      if (languagePair.includes('->')) {
        // "ko-KR -> zh-CN" 형태
        const parts = languagePair.split('->');
        if (parts.length === 2) {
          const target = parts[1].trim();
          targetLanguage = target.startsWith('zh') ? 'zh' : 'ko';
        }
      } else if (languagePair.includes('-') && !languagePair.includes('->')) {
        // "ko-zh" 형태
        const parts = languagePair.split('-');
        if (parts.length === 2) {
          const secondPart = parts[1];
          targetLanguage = secondPart.startsWith('zh') ? 'zh' : 'ko';
        }
      }
      
      console.log(`[${problem.title}] 통역 언어 설정:`, targetLanguage, `(language_pair: ${languagePair})`);
      setSourceLanguage(targetLanguage);
    }
  }, []);

  // 세그먼트 선택 핸들러
  const handleSegmentSelect = useCallback((index: number) => {
    setSelectedSegmentIndex(index);
    setShowOriginalText(false);
    setShowVocabulary(false);
    setShowHints(false);
    setUserInterpretation('');
    setOriginalText('');
    
    // 오디오 시간 설정
    if (practiceAudioRef.current && selectedProblem) {
      const segment = selectedProblem.segments[index];
      practiceAudioRef.current.currentTime = segment.audio_timing.start_time_sec;
      setAudioCurrentTime(segment.audio_timing.start_time_sec);
    }
  }, [selectedProblem]);

  // 원문을 입력창에 자동 입력
  const handleAutoFillOriginalText = useCallback(() => {
    if (selectedProblem && selectedProblem.segments[selectedSegmentIndex]) {
      const currentSegment = selectedProblem.segments[selectedSegmentIndex];
      let originalText: string;
      
      // 마윈 연설의 경우 chinese_text 사용
      if (selectedProblem.id === 'JEIBOYr3vC5dHfRDG9u1') {
        originalText = (currentSegment as any)?.chinese_text;
      } else {
        // 다른 문제들은 korean_text 사용
        originalText = currentSegment.korean_text;
      }
      
      setOriginalText(originalText || '원문 데이터 없음');
    } else {
      setOriginalText('원문 데이터를 찾을 수 없습니다.');
    }
  }, [selectedProblem, selectedSegmentIndex]);

  // 선택된 세그먼트의 시간대로 오디오 이동
  const playSegmentAudio = (segmentIndex?: number) => {
    if (!currentAudioUrl || !selectedProblem) return;
    
    const index = segmentIndex !== undefined ? segmentIndex : selectedSegmentIndex;
    const segment = selectedProblem.segments[index];
    if (!segment) return;
    
    const audioElement = practiceAudioRef.current;
    if (audioElement) {
      audioElement.src = currentAudioUrl;
      audioElement.currentTime = segment.audio_timing.start_time_sec;
      audioElement.play();
      
      // 세그먼트 종료 시간에 자동 정지
      const handleTimeUpdate = () => {
        if (audioElement.currentTime >= segment.audio_timing.end_time_sec) {
          audioElement.pause();
          audioElement.removeEventListener('timeupdate', handleTimeUpdate);
          setIsAudioPlaying(false);
        }
      };
      
      audioElement.addEventListener('timeupdate', handleTimeUpdate);
      setIsAudioPlaying(true);
      
      console.log(`세그먼트 ${index + 1} 재생: ${segment.audio_timing.start_time_sec}초 - ${segment.audio_timing.end_time_sec}초`);
    }
  };

  // 오디오 정지
  const stopSegmentAudio = useCallback(() => {
    if (practiceAudioRef.current) {
      practiceAudioRef.current.pause();
      setIsAudioPlaying(false);
    }
  }, []);

  // 필터링된 문제 목록
  const filteredProblems = problems.filter(problem => {
    const difficultyMatch = filters.difficulty === '전체' || problem.difficulty === filters.difficulty;
    const categoryMatch = filters.category === '전체' || problem.category === filters.category;
    return difficultyMatch && categoryMatch;
  });

  // 난이도 색상 반환
  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'beginner': return 'bg-green-500 text-white';
      case 'intermediate': return 'bg-yellow-500 text-white';
      case 'advanced': return 'bg-red-500 text-white';
      default: return 'bg-gray-500 text-white';
    }
  };

  // 난이도 한글 변환
  const getDifficultyText = (difficulty: string) => {
    switch (difficulty) {
      case 'beginner': return '초급';
      case 'intermediate': return '중급';
      case 'advanced': return '고급';
      default: return difficulty;
    }
  };

  // Firebase Storage 오디오 URL 생성 (더 이상 사용되지 않음 - loadAudioFile 사용)
  const getAudioUrl = (problemId: string) => {
    const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID || 'your-project-id';
    
    // 기본값: 한국 외교부장관 유엔총회 기조연설
    let audioFileName = 'KoreanSpeech.mp3';
    
    return `https://firebasestorage.googleapis.com/v0/b/${projectId}.appspot.com/o/${encodeURIComponent(audioFileName)}?alt=media`;
  };

  // Web Speech API 지원 체크
  const checkSpeechSupport = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    setSpeechSupported(!!SpeechRecognition);
    return !!SpeechRecognition;
  }, []);

  // 실시간 음성 인식 시작
  const startSpeechRecognition = useCallback(() => {
    if (!checkSpeechSupport()) {
      setError('음성 인식을 지원하지 않는 브라우저입니다.');
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    
    recognition.continuous = true; // 연속 인식
    recognition.interimResults = true; // 중간 결과도 받기
    recognition.lang = sourceLanguage === 'ko' ? 'ko-KR' : 'zh-CN';
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: any) => {
      // 음성이 인식되면 no-speech 카운터 리셋
      noSpeechCountRef.current = 0;
      
      let finalTranscript = '';
      let interimTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }

      // 확정된 텍스트는 누적하고, 임시 텍스트는 현재 표시
      if (finalTranscript) {
        setAccumulatedText(prev => prev + finalTranscript + ' ');
      }
      setCurrentText(interimTranscript);
    };

    recognition.onend = () => {
      console.log('recognition.onend 호출됨');
      
      // ✅ 간단한 재시작 조건 - HTML 예제처럼 단순하게
      if (isRecordingRef.current && !isPausedRef.current) {
        setTimeout(() => {
          if (isRecordingRef.current && !isPausedRef.current) {
            try {
              recognition.start();
            } catch (err) {
              console.error('음성 인식 재시작 실패:', err);
            }
          }
        }, 100);
      }
    };

    recognition.onerror = (event: any) => {
      console.error('음성 인식 오류:', event.error);
      
      // ✅ 간단한 오류 처리 - HTML 예제처럼 단순하게
      if (event.error === 'no-speech' || event.error === 'aborted') {
        // no-speech와 aborted는 정상 상황으로 처리
        return;
      }
      
      // 다른 오류는 표시
      setError(`음성 인식 오류: ${event.error}`);
    };

    recognition.start();
    recognitionRef.current = recognition;
    console.log(`🎙️ 음성 인식 시작`);
    console.log(`   설정 언어: ${sourceLanguage === 'ko' ? '한국어 (ko-KR)' : '중국어 (zh-CN)'}`);
    console.log(`   recognition.lang: ${recognition.lang}`);
  }, [checkSpeechSupport, sourceLanguage]);

  // 브라우저 호환성 체크
  const checkBrowserSupport = useCallback(() => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setError('이 브라우저는 음성 녹음을 지원하지 않습니다.');
      return false;
    }
    if (!window.MediaRecorder) {
      setError('이 브라우저는 MediaRecorder를 지원하지 않습니다.');
      return false;
    }
    return true;
  }, []);

  // 마이크 권한 요청
  const requestMicrophonePermission = useCallback(async () => {
    if (!checkBrowserSupport()) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints
      });
      
      streamRef.current = stream;
      setPermissionGranted(true);
      setError(null);

      // AudioContext 설정
      audioContextRef.current = new AudioContext({ sampleRate: audioConstraints.sampleRate });
      const source = audioContextRef.current.createMediaStreamSource(stream);
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      source.connect(analyserRef.current);

      console.log('마이크 권한이 승인되었습니다.');
    } catch (err: any) {
      console.error('마이크 권한 오류:', err);
      if (err.name === 'NotAllowedError') {
        setError('마이크 권한이 거부되었습니다. 브라우저 설정에서 마이크 접근을 허용해주세요.');
      } else if (err.name === 'NotFoundError') {
        setError('마이크를 찾을 수 없습니다.');
      } else {
        setError('마이크에 접근할 수 없습니다: ' + err.message);
      }
    }
  }, [audioConstraints, checkBrowserSupport]);

  // 오디오 레벨 모니터링
  const monitorAudioLevel = useCallback(() => {
    if (!analyserRef.current) return;

    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(dataArray);
    
    const average = dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length;
    const normalizedLevel = average / 255;
    
    setAudioLevel(normalizedLevel);

    if (isRecording) {
      animationRef.current = requestAnimationFrame(monitorAudioLevel);
    }
  }, [isRecording]);

  // 녹음 시작 함수
  const startRecording = useCallback(async () => {
    console.log('🎙️ startRecording 호출됨');
    console.log('   streamRef.current 존재:', !!streamRef.current);
    console.log('   permissionGranted:', permissionGranted);
    
    // 스트림이 없거나 비활성화된 경우 새로 생성
    const needNewStream = !streamRef.current || 
      !streamRef.current.active ||
      streamRef.current.getTracks().every(track => track.readyState !== 'live');
    
    if (needNewStream) {
      console.log('   새 스트림 생성 필요 - 마이크 권한 요청');
      await requestMicrophonePermission();
      
      // 스트림 생성 후 다시 확인
      if (!streamRef.current) {
        console.error('   스트림 생성 실패');
        return;
      }
    }

    try {
      console.log('   녹음 시작 프로세스 시작');
      const options = {
        mimeType: 'audio/webm;codecs=opus'
      };
      
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        options.mimeType = 'audio/mp4';
      }

      // 최종 스트림 존재 확인
      if (!streamRef.current) {
        console.error('   스트림이 여전히 없음 - 녹음 시작 실패');
        setError('마이크 스트림을 생성할 수 없습니다.');
        return;
      }

      mediaRecorderRef.current = new MediaRecorder(streamRef.current, options);
      const chunks: BlobPart[] = [];

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      mediaRecorderRef.current.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/wav' });
        setAudioBlob(blob);
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        console.log('녹음 완료');
      };

      mediaRecorderRef.current.onerror = (event: any) => {
        console.error('녹음 오류:', event.error);
        setError('녹음 중 오류가 발생했습니다: ' + event.error.message);
        stopRecording();
      };

      // 녹음 시작
      console.log('   MediaRecorder.start() 호출');
      mediaRecorderRef.current.start(100);
      
      // 상태 업데이트
      console.log('   상태 업데이트: isRecording = true, isRecordingRef = true');
      setIsRecording(true);
      isRecordingRef.current = true;
      setRecordingTime(0);
      setError(null);

      // 타이머 시작
      const startTime = Date.now();
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      
      intervalRef.current = setInterval(() => {
        if (isRecordingRef.current) {
          const elapsed = Date.now() - startTime;
          setRecordingTime(elapsed);
          
          if (elapsed >= maxRecordingTime) {
            stopRecording();
          }
        }
      }, 100);

      // 오디오 레벨 모니터링 시작
      monitorAudioLevel();
      
      // 음성 인식 시작
      startSpeechRecognition();
      
    } catch (err: any) {
      console.error('녹음 시작 오류:', err);
      setError('녹음을 시작할 수 없습니다: ' + err.message);
    }
  }, [requestMicrophonePermission, monitorAudioLevel, startSpeechRecognition]);

  // 녹음 중지 함수
  const stopRecording = useCallback(() => {
    console.log('⏹️ stopRecording 호출됨');
    console.log('   mediaRecorderRef.current 존재:', !!mediaRecorderRef.current);
    console.log('   isRecordingRef.current:', isRecordingRef.current);
    
    if (mediaRecorderRef.current && isRecordingRef.current) {
      console.log('   실제 중지 프로세스 시작');
      
      // MediaRecorder 중지
      try {
        console.log('   MediaRecorder 중지 시도');
        mediaRecorderRef.current.stop();
        console.log('   MediaRecorder 중지 성공');
      } catch (err) {
        console.error('MediaRecorder 중지 실패:', err);
      }
      
      // ref 즉시 변경
      console.log('   isRecordingRef.current = false 설정');
      isRecordingRef.current = false;
      
      // 스트림 완전 정리
      if (streamRef.current) {
        console.log('   스트림 완전 정리');
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
        console.log('   스트림 참조 제거 완료');
      }
      
      // 타이머 중지
      if (intervalRef.current) {
        console.log('   타이머 정리');
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      
      // 음성 인식 중지
      if (recognitionRef.current) {
        try {
          console.log('   음성 인식 중지');
          recognitionRef.current.abort();
          recognitionRef.current = null;
        } catch (err) {
          console.warn('음성 인식 중지 실패:', err);
        }
      }
      
      // 애니메이션 정리
      if (animationRef.current) {
        console.log('   애니메이션 정리');
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      
      // React 상태 업데이트
      console.log('   React 상태 업데이트');
      setIsRecording(false);
      setIsPaused(false);
      setAudioLevel(0);
      setCurrentText('');
      
      console.log('✅ 녹음 중지 완료');
    } else {
      console.log('❌ 중지 조건 불만족 - 강제 중지 시도');
      console.log('   mediaRecorderRef.current:', mediaRecorderRef.current);
      console.log('   isRecordingRef.current:', isRecordingRef.current);
      
      // 강제 상태 초기화
      console.log('   강제 상태 초기화 시작');
      isRecordingRef.current = false;
      setIsRecording(false);
      setIsPaused(false);
      setAudioLevel(0);
      setCurrentText('');
      
      // 모든 리소스 정리
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
          recognitionRef.current = null;
        } catch (err) {
          console.warn('강제 음성 인식 중지 실패:', err);
        }
      }
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
             if (streamRef.current) {
         streamRef.current.getTracks().forEach(track => track.stop());
         streamRef.current = null;
       }
      
      console.log('✅ 강제 중지 완료');
    }
  }, []);

  // 녹음 토글 함수 - 디바운싱 및 상태 기반으로 변경
  const toggleRecording = useCallback(() => {
    console.log('🔄 toggleRecording 호출됨');
    console.log('   isRecordingRef.current:', isRecordingRef.current);
    console.log('   isRecording state:', isRecording);
    console.log('   isButtonDisabled:', isButtonDisabled);
    
    // 버튼이 비활성화된 경우 무시
    if (isButtonDisabled) {
      console.log('   ❌ 버튼 비활성화 상태 - 무시');
      return;
    }
    
    // 버튼 임시 비활성화 (300ms)
    setIsButtonDisabled(true);
    setTimeout(() => {
      setIsButtonDisabled(false);
      console.log('   ✅ 버튼 다시 활성화');
    }, 300);
    
    // ref와 state 모두 확인하여 더 안정적으로 처리
    const currentlyRecording = isRecordingRef.current || isRecording;
    console.log('   currentlyRecording:', currentlyRecording);
    
    if (!currentlyRecording) {
      console.log('   → startRecording 호출');
      startRecording();
    } else {
      console.log('   → stopRecording 호출');
      stopRecording();
    }
  }, [startRecording, stopRecording, isRecording, isButtonDisabled]);

  // 텍스트 초기화
  const clearTexts = useCallback(() => {
    setAccumulatedText('');
    setCurrentText('');
  }, []);

  // 오디오 재생
  const playAudio = useCallback(() => {
    if (audioUrl) {
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
        audioPlayerRef.current.currentTime = 0;
      }
      
      audioPlayerRef.current = new Audio(audioUrl);
      audioPlayerRef.current.onplay = () => setIsPlaying(true);
      audioPlayerRef.current.onpause = () => setIsPlaying(false);
      audioPlayerRef.current.onended = () => setIsPlaying(false);
      
      audioPlayerRef.current.play().catch(err => {
        console.error('재생 오류:', err);
        setError('오디오 재생 중 오류가 발생했습니다.');
      });
    }
  }, [audioUrl]);

  // 오디오 재생 중지
  const stopAudio = useCallback(() => {
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current.currentTime = 0;
      setIsPlaying(false);
    }
  }, []);

  // 오류 초기화
  const clearError = useCallback(() => {
    setError(null);
    clearTexts();
  }, [clearTexts]);

  // 시간 포맷팅
  const formatTime = (milliseconds: number) => {
    const seconds = Math.floor(milliseconds / 1000);
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // 신뢰도 색상 계산
  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'text-green-600';
    if (confidence >= 0.6) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getConfidenceBarColor = (confidence: number) => {
    if (confidence >= 0.8) return 'bg-green-500';
    if (confidence >= 0.6) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  // Gemini API를 이용한 통역 품질 분석
  const analyzeInterpretation = async () => {
    if (!originalText.trim() || !userInterpretation.trim()) {
      setAnalysisError('원문과 통역문을 모두 입력해주세요.');
      return;
    }

    setIsAnalyzing(true);
    setAnalysisError(null);
    setAnalysisResult(null);

    const startTime = Date.now();

    try {
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error('Gemini API 키가 설정되지 않았습니다.');
      }

      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
      
      const langPair = sourceLanguage === 'ko' ? '한국어 → 중국어' : '중국어 → 한국어';
      const sourceLang = sourceLanguage === 'ko' ? '한국어' : '중국어';
      const targetLang = sourceLanguage === 'ko' ? '중국어' : '한국어';

      const prompt = `당신은 전문 통역 평가자입니다. ${langPair} 통역을 다음 4개 항목으로 0-100점 평가해주세요.

**원문(${sourceLang}):** ${originalText}
**통역문(${targetLang}):** ${userInterpretation}

다음 JSON 형식으로만 응답해주세요:
{
  "accuracy": 정확성점수(0-100),
  "fluency": 유창성점수(0-100), 
  "grammar": 문법점수(0-100),
  "completeness": 완성도점수(0-100),
  "overall_score": 종합점수(0-100),
  "feedback": {
    "strengths": ["잘한점1", "잘한점2"],
    "improvements": ["개선점1", "개선점2"], 
    "overall_comment": "종합평가 (2-3문장)"
  }
}

**평가기준:**
- 정확성: 의미 전달, 누락/오역 체크
- 유창성: 자연스러운 표현
- 문법: 문법 정확성
- 완성도: 종합적 품질`;

      const data = {
        contents: [{ parts: [{ text: prompt }] }]
      };

      const response = await axios.post(url, data, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000
      });

      const text = response.data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      console.log('Gemini 응답:', text);

      // JSON 파싱
      const jsonStart = text.indexOf('{');
      const jsonEnd = text.lastIndexOf('}');
      
      if (jsonStart === -1 || jsonEnd === -1) {
        throw new Error('유효한 JSON 응답을 받지 못했습니다.');
      }

      const jsonStr = text.substring(jsonStart, jsonEnd + 1);
      const analysis = JSON.parse(jsonStr);

      const endTime = Date.now();
      const processingTime = (endTime - startTime) / 1000;

      setAnalysisResult({
        ...analysis,
        processing_time: processingTime
      });

    } catch (error: any) {
      console.error('분석 오류:', error);
      if (error.response?.status === 429) {
        setAnalysisError('API 요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요.');
      } else if (error.response?.status === 403) {
        setAnalysisError('API 키가 유효하지 않습니다.');
      } else if (error.message?.includes('JSON')) {
        setAnalysisError('응답 처리 중 오류가 발생했습니다.');
      } else {
        setAnalysisError('분석 중 오류가 발생했습니다. 다시 시도해주세요.');
      }
    } finally {
      setIsAnalyzing(false);
    }
  };

  // 원형 차트 컴포넌트
  const CircularScore = ({ score, label, color }: { score: number; label: string; color: string }) => {
    const circumference = 2 * Math.PI * 40;
    const strokeDasharray = circumference;
    const strokeDashoffset = circumference - (score / 100) * circumference;

    return (
      <div className="flex flex-col items-center">
        <div className="relative w-24 h-24">
          <svg className="w-24 h-24 -rotate-90" viewBox="0 0 100 100">
            <circle
              cx="50"
              cy="50"
              r="40"
              stroke="#e5e7eb"
              strokeWidth="8"
              fill="none"
            />
            <circle
              cx="50"
              cy="50"
              r="40"
              stroke={color}
              strokeWidth="8"
              fill="none"
              strokeDasharray={strokeDasharray}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              className="transition-all duration-1000 ease-out"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-lg font-bold text-gray-800">{score}</span>
          </div>
        </div>
        <span className="text-sm font-medium text-gray-600 mt-2">{label}</span>
      </div>
    );
  };

  // 난이도별 배지 색상
  const getDifficultyBadge = (difficulty: string) => {
    switch(difficulty) {
      case 'beginner': return 'bg-green-100 text-green-800';
      case 'intermediate': return 'bg-yellow-100 text-yellow-800';
      case 'advanced': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  // 세그먼트 표시 로직
  const displayedSegments = showAllSegments 
    ? selectedProblem?.segments 
    : selectedProblem?.segments.slice(0, 2);

  // 원문 보기/숨기기 토글
  const toggleOriginalText = () => {
    console.log('👁️ toggleOriginalText 호출됨');
    console.log('   현재 showOriginalText:', showOriginalText);
    console.log('   변경 후 상태:', !showOriginalText);
    setShowOriginalText(!showOriginalText);
  };

  // ✅ 간단한 useEffect들 - HTML 예제처럼 단순하게
  useEffect(() => {
    checkSpeechSupport();
    requestMicrophonePermission();
  }, []);
  
  // eslint-disable-next-line react-hooks/exhaustive-deps

  // userInterpretation 상태 변경 모니터링
  useEffect(() => {
    console.log('🔄 userInterpretation 상태 변경됨:', userInterpretation);
  }, [userInterpretation]);

  // showOriginalText 상태 변경 모니터링
  useEffect(() => {
    console.log('🔄 showOriginalText 상태 변경됨:', showOriginalText);
  }, [showOriginalText]);

  // isRecording 상태 변경 모니터링
  useEffect(() => {
    console.log('🔄 isRecording 상태 변경됨:', isRecording);
  }, [isRecording]);

  useEffect(() => {
    return () => {
      // 컴포넌트 언마운트 시 정리
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch (err) {
          console.warn('cleanup 실패:', err);
        }
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // 헤더 섹션
  const Header = () => (
    <header className="bg-white shadow-sm border-b">
      <div className="max-w-6xl mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">🎙️ AI 통역 연습</h1>
            <p className="text-sm text-gray-600">음성 인식 기반 통역 훈련</p>
          </div>
          
          <div className="flex items-center gap-6">
            <select 
              value={filters.category}
              onChange={(e) => setFilters(prev => ({ ...prev, category: e.target.value }))}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              {availableCategories.map(category => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
            
            <select
              value={filters.difficulty}
              onChange={(e) => setFilters(prev => ({ ...prev, difficulty: e.target.value }))}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="전체">전체</option>
              <option value="초급">초급</option>
              <option value="중급">중급</option>
              <option value="고급">고급</option>
            </select>
            

          </div>
        </div>
      </div>
    </header>
  );

  // 문제 선택 컴포넌트
  const ProblemSelector = () => {
    const filteredProblems = problems.filter(problem => {
      const categoryMatch = filters.category === '전체' || problem.category === filters.category;
      
      // difficulty 필터링 - 다양한 형태의 데이터 대응
      let difficultyMatch = filters.difficulty === '전체';
      if (!difficultyMatch) {
        const problemDifficulty = problem.difficulty;
        // 직접 매칭
        difficultyMatch = problemDifficulty === filters.difficulty;
        
        // 영어-한국어 매칭 시도
        if (!difficultyMatch) {
          const difficultyMap: { [key: string]: string } = {
            'beginner': '초급',
            'intermediate': '중급', 
            'advanced': '고급',
            '초급': 'beginner',
            '중급': 'intermediate',
            '고급': 'advanced'
          };
          difficultyMatch = difficultyMap[problemDifficulty] === filters.difficulty || 
                           difficultyMap[filters.difficulty] === problemDifficulty;
        }
      }
      
      return categoryMatch && difficultyMatch;
    });

    return (
      <div className="bg-white rounded-2xl shadow-lg p-6 mb-8">
        <h3 className="text-lg font-bold text-gray-800 mb-4">📚 문제 선택</h3>
        
        {/* 로딩 상태 */}
        {loading && (
          <div className="flex justify-center items-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            <span className="ml-3 text-gray-600">Firebase에서 문제 로딩 중...</span>
          </div>
        )}

        {/* 에러 상태 */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
            <div className="flex items-center justify-between">
              <span>{error}</span>
              <button 
                onClick={() => { setError(null); fetchProblems(); }}
                className="bg-red-500 text-white px-3 py-1 rounded text-sm hover:bg-red-600"
              >
                다시 시도
              </button>
            </div>
          </div>
        )}

        {/* 문제 목록 */}
        {!loading && !error && filteredProblems.length > 0 && (
          <div className="grid gap-3">
            {filteredProblems.map((problem) => (
              <div
                key={problem.id}
                onClick={() => handleProblemSelect(problem)}
                className={`p-4 border rounded-lg cursor-pointer transition-all ${
                  selectedProblem?.id === problem.id
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`px-3 py-1 rounded-full text-sm font-medium ${getDifficultyBadge(problem.difficulty)}`}>
                        {getDifficultyText(problem.difficulty)}
                      </span>
                      <span className="text-sm text-gray-600">{problem.category}</span>
                    </div>
                    <h4 className="font-medium text-gray-800">{problem.title}</h4>
                    <p className="text-sm text-gray-600">👤 {problem.author}</p>
                  </div>
                  <div className="text-right text-sm text-gray-500">
                    <div>📊 {problem.total_segments}개</div>
                    <div>⏱️ {Math.round(problem.estimated_total_time)}초</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 문제 없음 메시지 */}
        {!loading && !error && filteredProblems.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            <div className="text-2xl mb-2">📝</div>
            <div>선택한 조건에 맞는 문제가 없습니다.</div>
          </div>
        )}
      </div>
    );
  };

  // 현재 문제 진행 상황
  const CurrentProblemCard = () => {
    if (!selectedProblem) return null;

    const progress = ((selectedSegmentIndex + 1) / selectedProblem.total_segments) * 100;

    return (
      <div className="bg-white rounded-2xl shadow-lg p-6 mb-8">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${getDifficultyBadge(selectedProblem.difficulty)}`}>
                {getDifficultyText(selectedProblem.difficulty)}
              </span>
              <span className="text-sm text-gray-500">{selectedProblem.metadata?.language_pair || '한국어 → 중국어'}</span>
            </div>
            <h2 className="text-xl font-bold text-gray-800">{selectedProblem.title}</h2>
            <p className="text-gray-600">{selectedProblem.author} • {selectedProblem.description}</p>
          </div>
          <div className="w-20 h-20 relative">
            <svg className="w-20 h-20 transform -rotate-90" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="40" stroke="#e5e7eb" strokeWidth="8" fill="none"/>
              <circle 
                cx="50" cy="50" r="40" 
                stroke="#3b82f6" strokeWidth="8" fill="none" 
                strokeDasharray="251.2" 
                strokeDashoffset={251.2 - (progress / 100) * 251.2}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-lg font-bold text-gray-800">
                {selectedSegmentIndex + 1}/{selectedProblem.total_segments}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // 연습 영역
  const PracticeArea = () => (
    <div className="grid lg:grid-cols-2 gap-8 mb-8">
      {/* 왼쪽: 음성 듣기 섹션 */}
      <div className="bg-white rounded-xl shadow-lg p-6">
        <h3 className="text-xl font-bold text-gray-800 mb-4">🔊 음성 듣기</h3>
        
        {selectedProblem && selectedProblem.segments[selectedSegmentIndex] ? (
          <div className="space-y-4">
            {/* 현재 세그먼트 정보 */}
            <div className="bg-blue-50 rounded-lg p-4">
              <div className="flex items-center justify-center">
                <span className="font-medium text-blue-800">
                  세그먼트 {selectedSegmentIndex + 1} / {selectedProblem.segments.length}
                </span>
              </div>
            </div>

            {/* 음성 재생 컨트롤 */}
            <div className="flex items-center gap-4">
              <button
                onClick={isAudioPlaying ? stopSegmentAudio : () => playSegmentAudio()}
                disabled={!currentAudioUrl}
                className={`px-6 py-3 rounded-lg font-medium transition-all ${
                  !currentAudioUrl
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : isAudioPlaying
                    ? 'bg-red-500 hover:bg-red-600 text-white'
                    : 'bg-green-500 hover:bg-green-600 text-white'
                }`}
              >
                {!currentAudioUrl ? '🔇 음성 없음' : isAudioPlaying ? '⏹️ 정지' : '▶️ 재생'}
              </button>
              
              <button
                onClick={() => playSegmentAudio()}
                disabled={!currentAudioUrl}
                className={`px-4 py-3 rounded-lg font-medium transition-all ${
                  !currentAudioUrl
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-blue-500 hover:bg-blue-600 text-white'
                }`}
              >
                🔄 다시듣기
              </button>
            </div>

            {/* 진행바 */}
            {audioDuration > 0 && (
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="h-3 bg-gradient-to-r from-green-400 to-red-500 rounded-full transition-all"
                  style={{ width: `${(audioCurrentTime / audioDuration) * 100}%` }}
                ></div>
              </div>
            )}

            {/* 원문 보기/숨기기 */}
            <div>
              <button
                onClick={(e) => {
                  console.log('🖱️ 원문 보기 버튼 클릭 이벤트 발생');
                  console.log('   이벤트 대상:', e.target);
                  console.log('   현재 showOriginalText:', showOriginalText);
                  e.preventDefault();
                  e.stopPropagation();
                  toggleOriginalText();
                }}
                className={`w-full py-3 rounded-lg font-medium transition-all ${
                  showOriginalText
                    ? 'bg-gray-500 hover:bg-gray-600 text-white'
                    : 'bg-yellow-500 hover:bg-yellow-600 text-white'
                }`}
              >
                {showOriginalText ? '🙈 원문 숨기기' : '👁️ 원문 보기'}
              </button>

              <div className="mt-3">
                {showOriginalText ? (
                  <div className="revealed-content bg-yellow-50 border-2 border-yellow-200 rounded-lg p-4">

                    <p className="text-gray-800 leading-relaxed mb-3">
                      {(() => {
                        const currentSegment = selectedProblem.segments[selectedSegmentIndex];
                        // 마윈 연설의 경우 chinese_text 사용
                        if (selectedProblem.id === 'JEIBOYr3vC5dHfRDG9u1') {
                          return (currentSegment as any)?.chinese_text || '원문 데이터가 없습니다.';
                        }
                        // 다른 문제들은 korean_text 사용
                        return currentSegment?.korean_text || '원문 데이터가 없습니다.';
                      })()}
                    </p>
                    <button
                      onClick={handleAutoFillOriginalText}
                      className="px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg text-sm font-medium"
                    >
                      📋 원문을 아래 입력창에 복사
                    </button>
                  </div>
                ) : (
                  <div className="hidden-content bg-gray-100 border-2 border-dashed border-gray-300 rounded-lg p-4 text-center text-gray-500">
                    <div className="text-lg mb-2">🔒</div>
                    <div>원문이 숨겨져 있습니다</div>
                    <div className="text-sm">먼저 음성을 듣고 통역해보세요!</div>
                  </div>
                )}
              </div>
            </div>

            {/* 학습 힌트 토글 버튼들 */}
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setShowVocabulary(!showVocabulary)}
                className={`py-2 px-3 rounded-lg font-medium transition-all ${
                  showVocabulary
                    ? 'bg-green-500 text-white'
                    : 'bg-green-100 text-green-700 hover:bg-green-200'
                }`}
              >
                💡 주요 어휘 {showVocabulary ? '숨기기' : '보기'}
              </button>
              
              <button
                onClick={() => setShowHints(!showHints)}
                className={`py-2 px-3 rounded-lg font-medium transition-all ${
                  showHints
                    ? 'bg-blue-500 text-white'
                    : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                }`}
              >
                🎯 통역 힌트 {showHints ? '숨기기' : '보기'}
              </button>
            </div>

            {/* 어휘 힌트 표시 */}
            {showVocabulary && selectedProblem.segments[selectedSegmentIndex].key_vocabulary.length > 0 && (
              <div className="space-y-2">
                {selectedProblem.segments[selectedSegmentIndex].key_vocabulary.slice(0, 3).map((vocab, index) => (
                  <div key={index} className="bg-green-100 border border-green-300 rounded-lg p-3">
                    <div className="font-medium text-green-800">
                      {vocab.chinese} ({vocab.pinyin})
                    </div>
                    <div className="text-green-700">{vocab.korean}</div>
                  </div>
                ))}
              </div>
            )}

            {/* 통역 힌트 표시 */}
            {showHints && selectedProblem.segments[selectedSegmentIndex].interpreting_hints.length > 0 && (
              <div className="space-y-2">
                {selectedProblem.segments[selectedSegmentIndex].interpreting_hints.slice(0, 2).map((hint, index) => (
                  <div key={index} className="bg-blue-100 border border-blue-300 rounded-lg p-3">
                    <div className="text-blue-700">• {hint}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">
            <div className="text-2xl mb-2">🎯</div>
            <div>위에서 문제와 세그먼트를 선택해주세요</div>
          </div>
        )}
      </div>

      {/* 오른쪽: 녹음 섹션 */}
      <div className="bg-white rounded-xl shadow-lg p-6">
        <h3 className="text-xl font-bold text-gray-800 mb-4">🎙️ 녹음 연습</h3>
        
        <div className="text-center space-y-4">
          {/* 녹음 시간 표시 */}
          <div className={`text-4xl font-mono font-bold transition-all ${
            isRecording ? 'text-red-600' : 'text-gray-400'
          }`}>
            {formatTime(recordingTime)}
          </div>

          {/* 녹음 버튼 */}
          <button
            onClick={(e) => {
              console.log('🖱️ 녹음 버튼 클릭 이벤트 발생');
              console.log('   이벤트 대상:', e.target);
              console.log('   disabled 상태:', !permissionGranted);
              console.log('   현재 isRecording:', isRecording);
              e.preventDefault();
              e.stopPropagation();
              toggleRecording();
            }}
            disabled={!permissionGranted || isButtonDisabled}
            className={`w-32 h-32 rounded-full font-bold text-lg transition-colors ${
              !permissionGranted || isButtonDisabled
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : isRecording
                ? 'bg-red-500 hover:bg-red-600 text-white shadow-lg'
                : 'bg-blue-500 hover:bg-blue-600 text-white shadow-md'
            }`}
          >
            {!permissionGranted ? '🔇 권한 없음' : 
             isButtonDisabled ? '⏳ 처리중' :
             isRecording ? '⏹️ 중지' : '🎙️ 녹음'}
          </button>

          {/* 상태 메시지 */}
          <div className={`text-lg font-medium ${
            isRecording ? 'text-red-600' : 'text-gray-600'
          }`}>
            {!permissionGranted ? '마이크 권한을 허용해주세요' :
             isRecording ? '녹음 중...' : '녹음 버튼을 눌러 시작하세요'}
          </div>

          {/* 음성 레벨 표시 */}
          {isRecording && (
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div 
                className="h-3 bg-gradient-to-r from-green-400 to-red-500 rounded-full transition-all"
                style={{ width: `${Math.min(audioLevel * 100, 100)}%` }}
              ></div>
            </div>
          )}

          {/* 실시간 음성 인식 결과 */}
          <div className="bg-gray-50 rounded-lg p-4 min-h-[120px] text-left">
            <div className="text-sm font-medium text-gray-700 mb-2">실시간 음성 인식:</div>
            {(accumulatedText || currentText) ? (
              <div className="space-y-2">
                <div className="text-gray-800">
                  <span className="font-medium">{accumulatedText}</span>
                  <span className="text-gray-500 italic">{currentText}</span>
                </div>
                {accumulatedText && (
                  <button
                    onClick={() => {
                      console.log('📝 통역문에 입력 버튼 클릭됨');
                      console.log('   accumulatedText:', accumulatedText);
                      console.log('   accumulatedText.trim():', accumulatedText.trim());
                      console.log('   현재 userInterpretation:', userInterpretation);
                      
                      try {
                        setUserInterpretation(accumulatedText.trim());
                        console.log('✅ setUserInterpretation 호출 성공');
                        
                        // textarea에 포커스 (약간의 지연 후)
                        setTimeout(() => {
                          if (userInterpretationRef.current) {
                            userInterpretationRef.current.focus();
                            console.log('✅ 통역문 textarea에 포커스 설정됨');
                          }
                        }, 100);
                      } catch (error) {
                        console.error('❌ setUserInterpretation 호출 실패:', error);
                      }
                    }}
                    className="text-sm px-3 py-1 bg-purple-500 text-white rounded hover:bg-purple-600"
                  >
                    📝 통역문에 입력
                  </button>
                )}
              </div>
            ) : (
              <div className="text-gray-400 text-center py-4">
                {isRecording ? '말씀해주세요...' : '녹음을 시작하면 음성 인식 결과가 여기에 표시됩니다'}
              </div>
            )}
          </div>

          {/* 컨트롤 버튼들 */}
          <div className="flex gap-2 justify-center">
            <button
              onClick={clearTexts}
              className="px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-lg text-sm"
            >
              🗑️ 텍스트 초기화
            </button>
            
            {audioBlob && (
              <button
                onClick={isPlaying ? stopAudio : playAudio}
                className={`px-4 py-2 rounded-lg text-sm font-medium ${
                  isPlaying 
                    ? 'bg-red-500 hover:bg-red-600 text-white' 
                    : 'bg-green-500 hover:bg-green-600 text-white'
                }`}
              >
                {isPlaying ? '⏹️ 정지' : '▶️ 재생'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  // AI 분석 섹션
  const AnalysisArea = () => (
    <div className="bg-white rounded-xl shadow-lg p-6">
      <h3 className="text-xl font-bold text-gray-800 mb-6">🤖 AI 분석</h3>
      
      {/* 원문/통역문 입력 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            원문 ({sourceLanguage === 'ko' ? '한국어' : '중국어'})
          </label>
          <textarea
            value={originalText}
            onChange={(e) => setOriginalText(e.target.value)}
            className="w-full h-32 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
            placeholder={`${sourceLanguage === 'ko' ? '한국어' : '중국어'} 원문을 입력하세요...`}
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            통역문 ({sourceLanguage === 'ko' ? '중국어' : '한국어'})
          </label>
          <textarea
            ref={userInterpretationRef}
            value={userInterpretation}
            onChange={(e) => setUserInterpretation(e.target.value)}
            className="w-full h-32 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
            placeholder={`${sourceLanguage === 'ko' ? '중국어' : '한국어'} 통역문을 입력하세요...`}
          />
        </div>
      </div>

      {/* AI 분석 버튼 */}
      <div className="text-center mb-6">
        <button
          onClick={analyzeInterpretation}
          disabled={isAnalyzing || !originalText.trim() || !userInterpretation.trim()}
          className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-8 py-3 rounded-lg font-medium text-lg hover:from-purple-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg hover:shadow-xl"
        >
          {isAnalyzing ? (
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              분석 중...
            </div>
          ) : (
            '🚀 AI 통역 분석 시작'
          )}
        </button>
        
        {analysisError && (
          <div className="mt-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded-lg">
            {analysisError}
          </div>
        )}
      </div>

      {/* 분석 결과 */}
      {analysisResult && (
        <div className="border-t pt-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="bg-gradient-to-r from-purple-500 to-indigo-500 rounded-full p-2">
              <span className="text-white text-xl">🤖</span>
            </div>
            <div>
              <h4 className="text-xl font-bold text-gray-800">AI 분석 결과</h4>
              <p className="text-gray-600">처리 시간: {analysisResult.processing_time.toFixed(2)}초</p>
            </div>
          </div>

          {/* 점수 차트 */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-6 mb-8">
            <CircularScore score={analysisResult.accuracy} label="정확성" color="#ef4444" />
            <CircularScore score={analysisResult.fluency} label="유창성" color="#f59e0b" />
            <CircularScore score={analysisResult.grammar} label="문법" color="#10b981" />
            <CircularScore score={analysisResult.completeness} label="완성도" color="#3b82f6" />
            <CircularScore score={analysisResult.overall_score} label="종합 점수" color="#8b5cf6" />
          </div>

          {/* 피드백 카드 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            {/* 잘한 점 */}
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <h5 className="text-lg font-semibold text-green-800 mb-3 flex items-center gap-2">
                <span>✅</span> 잘한 점
              </h5>
              <ul className="space-y-2">
                {analysisResult.feedback.strengths.map((strength, index) => (
                  <li key={index} className="text-green-700 flex items-start gap-2">
                    <span className="text-green-500">•</span>
                    <span>{strength}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* 개선점 */}
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
              <h5 className="text-lg font-semibold text-orange-800 mb-3 flex items-center gap-2">
                <span>💡</span> 개선점
              </h5>
              <ul className="space-y-2">
                {analysisResult.feedback.improvements.map((improvement, index) => (
                  <li key={index} className="text-orange-700 flex items-start gap-2">
                    <span className="text-orange-500">•</span>
                    <span>{improvement}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* 종합 평가 */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h5 className="text-lg font-semibold text-blue-800 mb-3 flex items-center gap-2">
              <span>📝</span> 종합 평가
            </h5>
            <p className="text-blue-700 leading-relaxed">
              {analysisResult.feedback.overall_comment}
            </p>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="max-w-full mx-auto">
        
        {/* 헤더 */}
        <Header />
        
        <div className="max-w-6xl mx-auto py-8 px-4">
          {/* 문제 선택 */}
          <ProblemSelector />
        
          {/* 현재 문제 진행 상황 */}
          <CurrentProblemCard />
          
          {/* 연습 영역 */}
          <PracticeArea />
          
          {/* AI 분석 영역 */}
          <AnalysisArea />

          {/* Firebase Storage 오디오 엘리먼트 */}
          {currentAudioUrl && (
            <audio
              ref={practiceAudioRef}
              preload="metadata"
              onLoadedMetadata={(e) => {
                const audio = e.target as HTMLAudioElement;
                setAudioDuration(audio.duration);
              }}
              onTimeUpdate={(e) => {
                const audio = e.target as HTMLAudioElement;
                setAudioCurrentTime(audio.currentTime);
              }}
              onPlay={() => setIsAudioPlaying(true)}
              onPause={() => setIsAudioPlaying(false)}
              onEnded={() => setIsAudioPlaying(false)}
            />
          )}
        </div>
        
      </div>
    </div>
  );
};

export default AIFeedback;