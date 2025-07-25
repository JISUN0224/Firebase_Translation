import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs } from 'firebase/firestore';
import { getStorage, ref, getDownloadURL } from 'firebase/storage';
import { db, auth } from '../../firebase';
import { saveStudySession } from '../Tran_Analysis/studyDataUtils';
import axios from 'axios';

// 인터페이스 정의 - 통합된 JSON 구조에 맞게 업데이트
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
    source?: string;
    content_type?: string;
    tags?: string[];
  };
  segments: Array<{
    id: number;
    // 한국어 → 중국어 세그먼트 필드들
    original_text?: string;
    target_interpretation?: string;
    alternative_interpretations?: string[];
    // 중국어 → 한국어 세그먼트 필드들
    chinese_text?: string;
    korean_interpretation_reference?: string;
    alternative_korean_interpretations?: string[];
    // 공통 필드들
    char_count: number;
    difficulty_level: string;
    audio_timing: {
      start_time_sec: number;
      end_time_sec: number;
    };
    pinyin_for_segment?: string;
    key_vocabulary: Array<{
      chinese?: string;
      korean?: string;
      pinyin?: string;
      example_chinese?: string;
      example_korean?: string;
      note?: string;
      // 새로운 구조의 필드들
      source_text?: string;
      target_text?: string;
      source_example?: string;
      target_example?: string;
    }>;
    grammar_points: Array<{
      chinese_explanation?: string;
      korean_pattern?: string;
      example_chinese?: string;
      example_korean?: string;
      // 새로운 구조의 필드들
      chinese_pattern?: string;
      korean_explanation?: string;
    }>;
    interpreting_hints: string[];
    common_interpretation_challenges: string[];
    suggested_note_taking_points: string[];
    recommended_delivery_tone: string;
    cultural_context: string;
    difficulty_analysis: string;
    // 새로운 필드들
    source_info?: {
      source_file: string;
      original_id: number;
      language_pair: string;
    };
  }>;
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

const StepByStepInterpretation: React.FC = () => {
  // 라우터 네비게이션
  const navigate = useNavigate();
  
  // 단계 관리
  const [currentStep, setCurrentStep] = useState(1);
  
  // 문제 및 세그먼트 관리
  const [problems, setProblems] = useState<Problem[]>([]);
  const [selectedProblem, setSelectedProblem] = useState<Problem | null>(null);
  const [selectedSegmentIndex, setSelectedSegmentIndex] = useState(0);
  
  // 오디오 관리
  const [currentAudioUrl, setCurrentAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioLoading, setAudioLoading] = useState(false);
  const [_isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [_audioDuration, setAudioDuration] = useState(0);
  const [_audioCurrentTime, setAudioCurrentTime] = useState(0);
  
  // 녹음 관리
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [_audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [accumulatedText, setAccumulatedText] = useState('');
  const [currentText, setCurrentText] = useState('');
  
  // AI 분석 관리
  const [analysisResult, setAnalysisResult] = useState<InterpretationAnalysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  
  // TTS 관리
  const [currentTTSText, setCurrentTTSText] = useState<string | null>(null);
  const [isTTSPlaying, setIsTTSPlaying] = useState(false);
  
  // UI 상태 관리
  const [showOriginalText, setShowOriginalText] = useState(false);
  const [showLearningMaterials, setShowLearningMaterials] = useState(false);
  const [sourceLanguage, setSourceLanguage] = useState<'ko' | 'zh'>('ko');
  
  // 세션 관리
  const [sessionStartTime, setSessionStartTime] = useState<number>(Date.now());
  const [completedSegments, setCompletedSegments] = useState<number[]>([]);
  const [totalScore, setTotalScore] = useState(0);
  
  // 필터 및 에러 관리 (AIFeedback.tsx와 동일)
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [availableCategories, setAvailableCategories] = useState<string[]>(['전체']);
  const [filters, setFilters] = useState<{difficulty: string; category: string}>({
    difficulty: '전체',
    category: '전체'
  });
  const [audioError, setAudioError] = useState<string | null>(null);
  
  // Refs
  const practiceAudioRef = useRef<HTMLAudioElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recognitionRef = useRef<any>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isRecordingRef = useRef<boolean>(false);

  // 컴포넌트 마운트 시 데이터 로딩
  useEffect(() => {
    fetchProblems();
  }, []);

  // 컴포넌트 언마운트 시 TTS 정리
  useEffect(() => {
    return () => {
      if ('speechSynthesis' in window) {
        speechSynthesis.cancel();
      }
    };
  }, []);

  // 필터 변경 시 현재 선택된 문제가 조건에 맞지 않으면 해제
  useEffect(() => {
    if (selectedProblem) {
      const categoryMatch = filters.category === '전체' || selectedProblem.category === filters.category;
      
      let difficultyMatch = filters.difficulty === '전체';
      if (!difficultyMatch) {
        const problemDifficulty = selectedProblem.difficulty;
        difficultyMatch = problemDifficulty === filters.difficulty;
        
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

      // 현재 선택된 문제가 필터 조건에 맞지 않으면 선택 해제
      if (!categoryMatch || !difficultyMatch) {
        setSelectedProblem(null);
        setCurrentStep(1);
        setAccumulatedText('');
        setCurrentText('');
        setAnalysisResult(null);
        setRecordingTime(0);
      }
    }
  }, [filters.category, filters.difficulty]); // selectedProblem 제거



  // Firebase에서 통합 문제 데이터 가져오기
  const fetchProblems = async () => {
    try {
      setLoading(true);
      setError(null);
      
      console.log('Firebase 통합 데이터 로딩 중...');
      
      // interpreting_practice_files 컬렉션에서 개별 문서들을 가져오기
      const querySnapshot = await getDocs(collection(db, 'interpreting_practice_files'));
      const problemsData: Problem[] = [];
      
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        console.log(`문서 발견: ${doc.id}`, data);
        
        // 각 문서가 완전한 문제이므로 그대로 사용
        if (data.segments && Array.isArray(data.segments)) {
          // 기존 필드들을 그대로 사용하고 없는 경우 기본값 설정
          const problem: Problem = {
          id: doc.id, 
            title: data.title || '통역 연습',
            category: data.category || '통역 연습', 
            author: data.author || '미상',
            difficulty: (data.difficulty || 'intermediate') as 'beginner' | 'intermediate' | 'advanced',
            description: data.description || '통역 연습 문제',
            total_segments: data.total_segments || data.segments.length,
            estimated_total_time: data.estimated_total_time || data.audio_info?.total_duration_sec || 0,
            created_date: data.created_date || new Date().toISOString(),
            metadata: {
              source: data.source || doc.id,
              content_type: data.content_type || 'interpreting_practice',
              tags: data.tags || ['interpreting']
            },
            segments: data.segments
          };
          
          problemsData.push(problem);
        }
      });
      
      console.log(`총 ${problemsData.length}개 문제 로딩 완료`);
      setProblems(problemsData);
      
      // 실제 데이터에서 카테고리 추출
      const categories = Array.from(new Set(problemsData.map(p => p.category)));
      setAvailableCategories(['전체', ...categories]);
      
    } catch (error) {
      console.error('Firestore 데이터 로딩 실패:', error);
      handleFirebaseError(error);
    } finally {
      setLoading(false);
    }
  };

  // Firebase 연결 실패 시 fallback (AIFeedback.tsx와 동일)
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

  // 오디오 파일 로딩 (AIFeedback.tsx와 동일)
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
      // 봉준호 인터뷰 관련
      else if (title.includes('봉준호') || title.includes('미키') || title.includes('mickey') ||
               author.includes('봉준호') || title.includes('인터뷰') || title.includes('interview')) {
        audioFileName = 'Mickey17_Interview.mp3';
      }
      // 한국 외교부 관련 (기본값이므로 명시적으로 설정)
      else if (title.includes('외교부') || title.includes('유엔') || 
               title.includes('기조연설') || title.includes('한국')) {
        audioFileName = 'KoreanSpeech.mp3';
      }
      

    }

    try {
      setAudioLoading(true);
      setAudioError(null);
      
      const storage = getStorage();
      
      const audioRef = ref(storage, audioFileName);
      const audioUrl = await getDownloadURL(audioRef);
      
      setCurrentAudioUrl(audioUrl);
      
    } catch (error: any) {
      console.error('음성 파일 로딩 실패:', error);
      
      if (error.code === 'storage/unauthorized') {
        setAudioError('음성 파일 접근 권한이 없습니다. Firebase Storage 보안 규칙을 확인해주세요.');
      } else if (error.code === 'storage/object-not-found') {
        setAudioError(`${audioFileName} 파일을 찾을 수 없습니다.`);
      } else {
        setAudioError('음성 파일을 불러올 수 없습니다. 네트워크 연결을 확인해주세요.');
      }
    } finally {
      setAudioLoading(false);
    }
  };

  // 문제 선택 핸들러 (AIFeedback.tsx와 동일)
  const handleProblemSelect = (problem: Problem) => {
    setSelectedProblem(problem);
    setSelectedSegmentIndex(0);
    setShowOriginalText(false);
    setShowLearningMaterials(false);
    setAccumulatedText('');
    setCurrentText('');
    setAnalysisResult(null);
    setRecordingTime(0);
    setCurrentStep(1); // 문제 선택 시 1단계로 리셋
    
    // 세션 초기화
    setSessionStartTime(Date.now());
    setCompletedSegments([]);
    setTotalScore(0);
    
    // 선택된 문제의 음성 파일 로드
    loadAudioFile(problem);
    
    // 음성 인식 언어 설정 (통역 결과 언어로 설정)
    // 첫 번째 세그먼트의 필드를 확인하여 언어쌍 판단
    const firstSegment = problem.segments[0];
    
    if (firstSegment) {
      let targetLanguage: 'ko' | 'zh' = 'ko'; // 기본값
      
      // 어떤 필드가 있는지 확인하여 언어쌍 판단
      if (firstSegment.chinese_text && !firstSegment.original_text) {
        // 중국어 원문 → 한국어 통역
        targetLanguage = 'ko';
      } else if (firstSegment.original_text && !firstSegment.chinese_text) {
        // 한국어 원문 → 중국어 통역  
        targetLanguage = 'zh';
      } else {
        // source_info의 language_pair로 판단 (fallback)
        const languagePair = firstSegment?.source_info?.language_pair;
        if (languagePair && languagePair.includes('->')) {
        const parts = languagePair.split('->');
        if (parts.length === 2) {
          const target = parts[1].trim();
          targetLanguage = target.startsWith('zh') ? 'zh' : 'ko';
        }
        }
      }
      
      setSourceLanguage(targetLanguage);
      console.log(`언어쌍 설정: ${firstSegment.chinese_text ? '중국어' : '한국어'} → ${targetLanguage === 'zh' ? '중국어' : '한국어'}, 음성 인식: ${targetLanguage === 'zh' ? '중국어' : '한국어'}`);
    }
    
    console.log(`문제 선택: ${problem.title} (${problem.segments?.length || 0}개 세그먼트)`);
  };

  // 유틸리티 함수들 (AIFeedback.tsx와 동일)
  const getDifficultyText = (difficulty: string) => {
    switch (difficulty) {
      case 'beginner': return '초급';
      case 'intermediate': return '중급';
      case 'advanced': return '고급';
      default: return difficulty;
    }
  };

  const getDifficultyBadge = (difficulty: string) => {
     switch(difficulty.toLowerCase()) {
       case 'beginner':
       case '초급':
         return 'bg-green-500 text-white';
       case 'intermediate':
       case '중급':
         return 'bg-orange-500 text-white';
       case 'advanced':
       case '고급':
         return 'bg-red-500 text-white';
       default:
         return 'bg-gray-500 text-white';
    }
  };

  // 단계 이동 함수
  const goToStep = (step: number) => {
    setCurrentStep(step);
  };

  // 세그먼트 오디오 재생 (전체 모드 지원)
  const playSegmentAudio = (segmentIndex?: number) => {
    if (!currentAudioUrl || !selectedProblem) return;
    
    const index = segmentIndex !== undefined ? segmentIndex : selectedSegmentIndex;
    const audioElement = practiceAudioRef.current;
    
    if (audioElement) {
      audioElement.src = currentAudioUrl;
      
      // 전체 세그먼트 모드인 경우 (-1)
      if (index === -1) {
        // 전체 파일 재생 (처음부터 끝까지)
        audioElement.currentTime = 0;
        audioElement.play();
        
        // 전체 재생 모드에서는 자동 정지하지 않음
        setIsPlaying(true);
        setIsAudioPlaying(true);
      } else {
        // 개별 세그먼트 재생
        const segment = selectedProblem.segments[index];
        if (!segment) return;
        
        audioElement.currentTime = segment.audio_timing.start_time_sec;
        audioElement.play();
        
        // 세그먼트 종료 시간에 자동 정지
        const handleTimeUpdate = () => {
          if (audioElement.currentTime >= segment.audio_timing.end_time_sec) {
            audioElement.pause();
            audioElement.removeEventListener('timeupdate', handleTimeUpdate);
            setIsPlaying(false);
            setIsAudioPlaying(false);
          }
        };
        
        audioElement.addEventListener('timeupdate', handleTimeUpdate);
        setIsPlaying(true);
        setIsAudioPlaying(true);
      }
    }
  };

  // 오디오 정지 (AIFeedback.tsx와 동일)
  const stopSegmentAudio = () => {
    if (practiceAudioRef.current) {
      practiceAudioRef.current.pause();
      setIsPlaying(false);
      setIsAudioPlaying(false);
    }
  };

  // 오디오 재생/일시정지 토글
  const toggleAudio = () => {
    if (isPlaying) {
      stopSegmentAudio();
    } else {
      playSegmentAudio();
    }
  };

  // 녹음 토글
  const toggleRecording = async () => {
    if (!isRecordingRef.current) {
      await startRecording();
    } else {
      stopRecording();
    }
  };

  // 녹음 시작
  const startRecording = async () => {
    try {
      console.log('녹음 시작 시도...');
      
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert('이 브라우저는 미디어 녹음을 지원하지 않습니다.');
        return;
      }

      if (!streamRef.current) {
        console.log('마이크 접근 권한 요청 중...');
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          }
        });
        streamRef.current = stream;
        console.log('마이크 접근 성공');
      }

      const mediaRecorder = new MediaRecorder(streamRef.current);
      mediaRecorderRef.current = mediaRecorder;
      const chunks: BlobPart[] = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/wav' });
        setAudioBlob(blob);
        console.log('녹음 완료, 파일 크기:', blob.size);
      };

      mediaRecorder.start();
      setIsRecording(true);
      isRecordingRef.current = true;
      setRecordingTime(0);
      console.log('MediaRecorder 시작됨');

      // 타이머 시작
      intervalRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

      // 음성 인식 시작
      startSpeechRecognition();

    } catch (error: any) {
      console.error('녹음 시작 실패:', error);
      
      if (error.name === 'NotAllowedError') {
        alert('마이크 접근 권한이 거부되었습니다. 브라우저 설정에서 마이크 권한을 허용해주세요.');
      } else if (error.name === 'NotFoundError') {
        alert('마이크를 찾을 수 없습니다. 마이크가 연결되어 있는지 확인해주세요.');
      } else {
        alert(`녹음 오류: ${error.message || error}`);
      }
    }
  };

  // 녹음 중지
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecordingRef.current) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      isRecordingRef.current = false;

      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }

      if (recognitionRef.current) {
        recognitionRef.current.abort();
        recognitionRef.current = null;
      }
    }
  };

  // 음성 인식 시작
  const startSpeechRecognition = () => {
    console.log('음성 인식 시작 시도...');
    
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.error('이 브라우저는 음성 인식을 지원하지 않습니다.');
      alert('이 브라우저는 음성 인식을 지원하지 않습니다. Chrome 브라우저를 사용해주세요.');
      return;
    }

    console.log(`음성 인식 언어 설정: ${sourceLanguage === 'ko' ? 'ko-KR' : 'zh-CN'}`);

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = sourceLanguage === 'ko' ? 'ko-KR' : 'zh-CN';

    recognition.onstart = () => {
      console.log('음성 인식이 시작되었습니다.');
    };

    recognition.onresult = (event: any) => {
      console.log('음성 인식 결과 수신:', event);
      let finalTranscript = '';
      let interimTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }

      console.log('최종 텍스트:', finalTranscript, '임시 텍스트:', interimTranscript);

      if (finalTranscript) {
        setAccumulatedText(prev => prev + finalTranscript + ' ');
      }
      setCurrentText(interimTranscript);
    };

    recognition.onerror = (event: any) => {
      console.error('음성 인식 오류:', event.error);
      
      if (event.error === 'not-allowed') {
        alert('마이크 접근 권한이 필요합니다. 브라우저 설정에서 마이크 권한을 허용해주세요.');
      } else if (event.error === 'no-speech') {
        console.log('음성이 감지되지 않았습니다.');
      } else if (event.error === 'network') {
        alert('네트워크 오류가 발생했습니다. 인터넷 연결을 확인해주세요.');
      } else {
        alert(`음성 인식 오류: ${event.error}`);
      }
    };

    recognition.onend = () => {
      console.log('음성 인식이 종료되었습니다.');
      if (isRecordingRef.current) {
        console.log('녹음 중이므로 음성 인식을 재시작합니다.');
        setTimeout(() => {
          if (isRecordingRef.current) {
            try {
              recognition.start();
            } catch (err) {
              console.error('음성 인식 재시작 실패:', err);
            }
          }
        }, 100);
      }
    };

    try {
    recognition.start();
    recognitionRef.current = recognition;
      console.log('음성 인식 시작 성공');
    } catch (error) {
      console.error('음성 인식 시작 실패:', error);
      alert('음성 인식을 시작할 수 없습니다.');
    }
  };

  // AI 분석 실행
  const analyzeInterpretation = async () => {
    if (!selectedProblem || !accumulatedText.trim()) {
      setAnalysisError('분석할 텍스트가 없습니다.');
      return;
    }

    setIsAnalyzing(true);
    setAnalysisError(null);
    setAnalysisResult(null);

    try {
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error('Gemini API 키가 설정되지 않았습니다.');
      }

      // 언어쌍 정보를 제대로 파악
      let originalText: string;
      let actualSourceLang: string;
      let actualTargetLang: string;
      let langPair: string;
      
      // 언어 쌍 자동 감지를 위한 헬퍼 함수
      const detectLanguagePair = (segment: any) => {
        if (segment.chinese_text && !segment.original_text) {
          return { source: 'zh', target: 'ko', sourceText: segment.chinese_text };
        } else if (segment.original_text && !segment.chinese_text) {
          return { source: 'ko', target: 'zh', sourceText: segment.original_text };
        }
        // 기본값 (한국어 → 중국어)
        return { source: 'ko', target: 'zh', sourceText: segment.original_text || '' };
      };
      
      if (selectedSegmentIndex === -1) {
        // 전체 세그먼트 모드: 모든 세그먼트의 원문 통합
        const firstSegment = selectedProblem.segments[0];
        const langInfo = detectLanguagePair(firstSegment);
        
        originalText = selectedProblem.segments.map((segment, index) => {
          const segmentInfo = detectLanguagePair(segment);
          return `[세그먼트 ${index + 1}] ${segmentInfo.sourceText}`;
        }).join('\n\n');
        
        actualSourceLang = langInfo.source === 'zh' ? '중국어' : '한국어';
        actualTargetLang = langInfo.target === 'zh' ? '중국어' : '한국어';
        langPair = `${actualSourceLang} → ${actualTargetLang}`;
      } else {
        // 개별 세그먼트 모드
        const currentSegment = selectedProblem.segments[selectedSegmentIndex];
        const langInfo = detectLanguagePair(currentSegment);
        
        originalText = langInfo.sourceText;
        actualSourceLang = langInfo.source === 'zh' ? '중국어' : '한국어';
        actualTargetLang = langInfo.target === 'zh' ? '중국어' : '한국어';
        langPair = `${actualSourceLang} → ${actualTargetLang}`;
      }

      const prompt = `당신은 전문 통역 평가자입니다. ${langPair} 통역을 다음 4개 항목으로 0-100점 평가해주세요.

**원문(${actualSourceLang}):** ${originalText}
**통역문(${actualTargetLang}):** ${accumulatedText.trim()}

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
}`;

      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
      const response = await axios.post(url, {
        contents: [{ parts: [{ text: prompt }] }]
      }, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000
      });

      const text = response.data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const jsonStart = text.indexOf('{');
      const jsonEnd = text.lastIndexOf('}');
      
      if (jsonStart === -1 || jsonEnd === -1) {
        throw new Error('유효한 JSON 응답을 받지 못했습니다.');
      }

      const jsonStr = text.substring(jsonStart, jsonEnd + 1);
      const analysis = JSON.parse(jsonStr);

      setAnalysisResult({
        ...analysis,
        processing_time: 2.5
      });

      // 점수 업데이트 및 완료된 세그먼트 추가
      const currentScore = analysis.overall_score || 0;
      setTotalScore(prev => prev + currentScore);
      
      if (selectedSegmentIndex >= 0) {
        setCompletedSegments(prev => [...prev, selectedSegmentIndex]);
      }

    } catch (error: any) {
      console.error('분석 오류:', error);
      setAnalysisError('분석 중 오류가 발생했습니다. 다시 시도해주세요.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // 시간 포맷팅
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // TTS 음성 재생 함수
  const playText = (text: string, language: 'ko' | 'zh') => {
    // 현재 재생 중인 것이 있으면 중지
    if (isTTSPlaying) {
      stopTTS();
      return;
    }

    // Web Speech API 지원 확인
    if (!('speechSynthesis' in window)) {
      alert('이 브라우저는 음성 합성을 지원하지 않습니다.');
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    
    // 언어 설정
    utterance.lang = language === 'ko' ? 'ko-KR' : 'zh-CN';
    utterance.rate = 0.9; // 약간 느리게
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    // 이벤트 리스너
    utterance.onstart = () => {
      setIsTTSPlaying(true);
      setCurrentTTSText(text);
    };

    utterance.onend = () => {
      setIsTTSPlaying(false);
      setCurrentTTSText(null);
    };

    utterance.onerror = () => {
      setIsTTSPlaying(false);
      setCurrentTTSText(null);
      alert('음성 재생 중 오류가 발생했습니다.');
    };

    // 음성 재생
    speechSynthesis.speak(utterance);
  };

  // TTS 정지 함수
  const stopTTS = () => {
    if ('speechSynthesis' in window) {
      speechSynthesis.cancel();
      setIsTTSPlaying(false);
      setCurrentTTSText(null);
    }
  };

  // 세션 저장 함수
  const saveInterpretationSession = async () => {
    if (!auth.currentUser || !selectedProblem || completedSegments.length === 0) {
      return;
    }

    try {
      const studyTime = Math.floor((Date.now() - sessionStartTime) / 1000);
      const averageScore = totalScore / completedSegments.length;
      
      const sessionData = {
        date: new Date().toISOString().split('T')[0],
        gameType: '단계별_통역',
        totalScore: totalScore,
        problemCount: completedSegments.length,
        studyTime: studyTime,
        averageScore: averageScore,
        metadata: {
          difficulty: selectedProblem.difficulty,
          domain: selectedProblem.category,
          targetLanguage: sourceLanguage === 'ko' ? '한국어' : '중국어',
          problemTitle: selectedProblem.title,
          totalSegments: selectedProblem.segments.length,
          completedSegments: completedSegments.length,
          completionRate: (completedSegments.length / selectedProblem.segments.length) * 100
        }
      };

      await saveStudySession(sessionData);
      console.log('단계별 통역 세션 저장 완료:', sessionData);
      
      // 성공 알림
      alert('🎉 학습 데이터가 저장되었습니다! 대시보드에서 확인할 수 있습니다.');
      
    } catch (error) {
      console.error('세션 저장 실패:', error);
      alert('❌ 데이터 저장에 실패했습니다. 나중에 다시 시도해주세요.');
    }
  };

  // 현재 세그먼트 정보 (전체 모드일 때는 null)
  const currentSegment = selectedProblem?.segments[selectedSegmentIndex >= 0 ? selectedSegmentIndex : 0];

  // 통합된 헤더 컴포넌트 (필터 옵션 + 단계 진행 표시)
  const Header = () => (
    <header className="bg-white shadow-sm border-b rounded-3xl shadow-2xl mb-8">
      <div className="max-w-6xl mx-auto px-6 py-6">
        {/* 제목과 필터 옵션 */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">🎙️ 단계별 통역 연습</h1>
            <p className="text-sm text-gray-600">3단계 체계적 통역 훈련</p>
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

        {/* 단계 진행 표시 */}
        <div className="flex items-center justify-between">
          
          {/* Step 1 */}
          <div className="flex items-center flex-1">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold transition-all duration-300 ${
              currentStep === 1 
                ? 'bg-gradient-to-r from-blue-500 to-blue-700 text-white shadow-xl animate-pulse' 
                : currentStep > 1
                ? 'bg-gradient-to-r from-green-500 to-green-600 text-white shadow-lg'
                : 'bg-gray-200 text-gray-500'
            }`}>
              {currentStep > 1 ? '✓' : '🔊'}
            </div>
            <div className="ml-4 flex-1">
              <div className="font-semibold text-gray-800">원문 듣기</div>
              <div className="text-sm text-gray-500">{sourceLanguage === 'ko' ? '중국어' : '한국어'} 원문을 들어보세요</div>
            </div>
          </div>

          {/* Progress Line 1 */}
          <div className="h-1 bg-gray-200 rounded-full mx-6 flex-1 overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-green-400 to-green-600 rounded-full transition-all duration-500"
              style={{ width: currentStep > 1 ? '100%' : '0%' }}
            ></div>
          </div>

          {/* Step 2 */}
          <div className="flex items-center flex-1">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold transition-all duration-300 ${
              currentStep === 2 
                ? 'bg-gradient-to-r from-blue-500 to-blue-700 text-white shadow-xl animate-pulse' 
                : currentStep > 2
                ? 'bg-gradient-to-r from-green-500 to-green-600 text-white shadow-lg'
                : 'bg-gray-200 text-gray-500'
            }`}>
              {currentStep > 2 ? '✓' : '🎙️'}
            </div>
            <div className="ml-4 flex-1">
              <div className="font-semibold text-gray-800">통역 녹음</div>
              <div className="text-sm text-gray-500">{sourceLanguage === 'ko' ? '한국어' : '중국어'}로 통역해보세요</div>
            </div>
          </div>

          {/* Progress Line 2 */}
          <div className="h-1 bg-gray-200 rounded-full mx-6 flex-1 overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-green-400 to-green-600 rounded-full transition-all duration-500"
              style={{ width: currentStep > 2 ? '100%' : '0%' }}
            ></div>
          </div>

          {/* Step 3 */}
          <div className="flex items-center flex-1">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold transition-all duration-300 ${
              currentStep === 3 
                ? 'bg-gradient-to-r from-blue-500 to-blue-700 text-white shadow-xl animate-pulse' 
                : currentStep > 3
                ? 'bg-gradient-to-r from-green-500 to-green-600 text-white shadow-lg'
                : 'bg-gray-200 text-gray-500'
            }`}>
              {currentStep > 3 ? '✓' : '🤖'}
            </div>
            <div className="ml-4 flex-1">
              <div className="font-semibold text-gray-800">AI 분석</div>
              <div className="text-sm text-gray-500">AI 피드백을 받아보세요</div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );



  // 문제 선택 + 현재 문제 진행 상황 통합 컴포넌트
  const ProblemAndProgressCard = () => {
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
    }).sort((a, b) => {
      // 난이도별 정렬: 초급 → 중급 → 고급
      const difficultyOrder = { 'beginner': 0, 'intermediate': 1, 'advanced': 2 };
      const aOrder = difficultyOrder[a.difficulty] ?? 3;
      const bOrder = difficultyOrder[b.difficulty] ?? 3;
      return aOrder - bOrder;
    });

    return (
      <div className="bg-white rounded-2xl shadow-lg p-6 mb-8">
        {/* 문제 선택 부분 */}
        {!selectedProblem && (
          <div>
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
                    className="p-4 border rounded-lg cursor-pointer transition-all border-gray-200 hover:border-gray-300 hover:bg-gray-50"
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
                        <p className="text-sm text-gray-600 text-left">👤 {problem.author}</p>
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
        )}

        {/* 현재 문제 진행 상황 */}
        {selectedProblem && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-800">📋 선택된 문제</h3>
              <button
                onClick={() => {
                  setSelectedProblem(null);
                  setCurrentStep(1);
                  setAccumulatedText('');
                  setCurrentText('');
                  setAnalysisResult(null);
                  setRecordingTime(0);
                }}
                className="px-3 py-1 bg-gray-500 text-white rounded hover:bg-gray-600 text-sm"
              >
                다른 문제 선택
              </button>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${getDifficultyBadge(selectedProblem.difficulty)}`}>
                    {getDifficultyText(selectedProblem.difficulty)}
                  </span>
                  <span className="text-sm text-gray-500">{selectedProblem.segments[0]?.source_info?.language_pair || '한국어 → 중국어'}</span>
                </div>
                <h2 className="text-xl font-bold text-gray-800">{selectedProblem.title}</h2>
                <p className="text-gray-600 text-left">{selectedProblem.author} • {selectedProblem.description}</p>
              </div>
              <div className="w-20 h-20 relative">
                <svg className="w-20 h-20 transform -rotate-90" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="40" stroke="#e5e7eb" strokeWidth="8" fill="none"/>
                  <circle 
                    cx="50" cy="50" r="40" 
                    stroke="#3b82f6" strokeWidth="8" fill="none" 
                    strokeDasharray="251.2" 
                    strokeDashoffset={251.2 - (((selectedSegmentIndex + 1) / selectedProblem.total_segments) * 100 / 100) * 251.2}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-lg font-bold text-gray-800">
                    {selectedSegmentIndex === -1 ? '전체' : `${selectedSegmentIndex + 1}/${selectedProblem.total_segments}`}
                  </span>
                </div>
              </div>
            </div>

            {/* 세그먼트 선택 */}
            {selectedProblem.segments && selectedProblem.segments.length > 1 && (
              <div className="mt-4">
                <h4 className="text-sm font-medium text-gray-700 mb-2">
                  세그먼트 선택: (총 {selectedProblem.segments.length}개)
                </h4>
                
                {/* 가로 스크롤 가능한 세그먼트 버튼들 */}
                <div className="overflow-x-auto py-2">
                  <div className="flex gap-2 min-w-max">
                    {selectedProblem.segments.map((_segment, index) => (
                      <button
                        key={index}
                        onClick={() => {
                          setSelectedSegmentIndex(index);
                          setCurrentStep(1);
                          setAccumulatedText('');
                          setCurrentText('');
                          setAnalysisResult(null);
                          setRecordingTime(0);
                        }}
                        className={`px-3 py-1 rounded-lg text-sm font-medium transition-all min-w-[40px] flex-shrink-0 ${
                          selectedSegmentIndex === index
                            ? 'bg-blue-500 text-white'
                            : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                        }`}
                      >
                        {index + 1}
                      </button>
                    ))}
                    
                    {/* 전체 세그먼트 버튼 */}
                    <button
                      onClick={() => {
                        setSelectedSegmentIndex(-1); // -1은 전체 세그먼트를 의미
                        setCurrentStep(1);
                        setAccumulatedText('');
                        setCurrentText('');
                        setAnalysisResult(null);
                        setRecordingTime(0);
                      }}
                      className={`px-4 py-1 rounded-lg text-sm font-medium transition-all min-w-[50px] flex-shrink-0 ${
                        selectedSegmentIndex === -1
                          ? 'bg-purple-500 text-white'
                          : 'bg-purple-100 text-purple-700 hover:bg-purple-200'
                      }`}
                    >
                      전체
                    </button>
                  </div>
                </div>
                
                {/* 스크롤 안내 메시지 */}
                {selectedProblem.segments.length > 8 && (
                  <div className="mt-1 text-xs text-gray-500 text-center">
                    ← → 스크롤하여 모든 세그먼트 보기 (마지막에 '전체' 버튼 있음)
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen" style={{
      background: 'linear-gradient(135deg, rgba(135, 206, 235, 0.3) 0%, rgba(173, 216, 230, 0.2) 100%)',
      padding: '20px'
    }}>
      <div className="max-w-6xl mx-auto">
        
        {/* 홈으로 버튼 */}
        <div className="mb-6">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-blue-600 hover:bg-white hover:shadow-md rounded-lg transition-all bg-white/80 backdrop-blur-sm"
          >
            <span className="text-lg">🏠</span>
            <span>홈으로</span>
          </button>
        </div>
        
        {/* 헤더 */}
        <Header />
        
                <div className="py-8 px-4">
          {/* 문제 선택 + 현재 문제 진행 상황 */}
          <ProblemAndProgressCard />

        {/* Step 1: 원문 듣기 */}
        {selectedProblem && currentStep === 1 && (
          <div className="bg-white rounded-3xl shadow-2xl p-10">
            <div className="text-center mb-8">
              <h3 className="text-3xl font-bold text-gray-800 mb-4">
                🔊 {selectedProblem?.title || '문제를 선택해주세요'}
              </h3>
              {selectedSegmentIndex === -1 ? (
                <p className="text-lg text-gray-600">
                  전체 세그먼트 (모든 구간을 연속으로 재생)
                </p>
              ) : (
                currentSegment && (
                  <p className="text-lg text-gray-600">
                    세그먼트 {selectedSegmentIndex + 1} / {selectedProblem?.total_segments} 
                  </p>
                )
              )}
            </div>

            {/* 대형 재생 버튼 */}
            <div className="text-center mb-8">
              <div className="flex flex-col items-center">
                <button
                  onClick={toggleAudio}
                  disabled={audioLoading || !currentAudioUrl}
                  className={`w-32 h-32 rounded-full text-6xl font-bold transition-all duration-300 shadow-2xl flex items-center justify-center ${
                    audioLoading 
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      : isPlaying
                      ? 'bg-gradient-to-r from-orange-500 to-orange-600 text-white hover:scale-105 animate-pulse'
                      : 'bg-gradient-to-r from-blue-500 to-blue-700 text-white hover:scale-105'
                  }`}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  {audioLoading ? '⏳' : isPlaying ? '⏸️' : '▶️'}
                </button>
                <div className="text-lg text-gray-600 mt-4">
                  {audioLoading ? '음성 로딩 중...' : 
                   audioError ? '음성 로딩 실패' :
                   isPlaying ? '재생 중...' : 
                   '원문 재생'}
                </div>
              </div>
              
              {/* 오디오 에러 표시 */}
              {audioError && (
                <div className="text-sm text-red-600 mt-2 text-center">
                  {audioError}
                </div>
              )}
            </div>

            {/* 원문 보기 토글 */}
            <div className="mb-6">
              <button
                onClick={() => setShowOriginalText(!showOriginalText)}
                className="w-full py-4 px-6 bg-gradient-to-r from-yellow-400 to-yellow-500 text-yellow-900 font-semibold rounded-xl hover:from-yellow-500 hover:to-yellow-600 transition-all duration-300 shadow-lg"
              >
                {showOriginalText ? '🙈 원문 숨기기' : '👁️ 원문 보기'}
              </button>
              
              {showOriginalText && (
                <div className="mt-4 p-6 bg-yellow-50 border-2 border-yellow-200 rounded-xl">
                  <p className="text-lg text-gray-800 leading-relaxed">
                    {selectedSegmentIndex === -1 ? (
                      // 전체 세그먼트 모드: 모든 세그먼트의 원문 통합
                      selectedProblem?.segments.map((segment, index) => {
                        // 언어 쌍에 따라 적절한 필드 선택
                        const getOriginalText = (segment: any) => {
                          if (segment.chinese_text) {
                            return segment.chinese_text; // 중국어 → 한국어
                          } else if (segment.original_text) {
                            return segment.original_text; // 한국어 → 중국어
                          }
                          return `세그먼트 ${index + 1} 데이터 없음`;
                        };
                        
                        const text = getOriginalText(segment);
                        return (
                          <div key={index} className="mb-4">
                            <div className="text-sm font-medium text-gray-600 mb-2">
                              세그먼트 {index + 1}:
                            </div>
                            <div className="text-gray-800">{text}</div>
                          </div>
                        );
                      })
                    ) : (
                      // 개별 세그먼트 모드: 해당 세그먼트의 원문만
                      currentSegment && (
                        currentSegment.chinese_text || currentSegment.original_text || '원문 데이터가 없습니다.'
                      )
                    )}
                  </p>
                </div>
              )}
            </div>

            {/* 학습 자료 토글 */}
            <div className="mb-8">
              <button
                onClick={() => setShowLearningMaterials(!showLearningMaterials)}
                className="w-full py-4 px-6 bg-gradient-to-r from-green-400 to-green-500 text-green-900 font-semibold rounded-xl hover:from-green-500 hover:to-green-600 transition-all duration-300 shadow-lg"
              >
                💡 학습 자료 보기 (핵심 어휘, 문법, 힌트)
              </button>
              
              {showLearningMaterials && (
                <div className="mt-4 p-6 bg-green-50 border-2 border-green-200 rounded-xl">
                  {selectedSegmentIndex === -1 ? (
                    // 전체 세그먼트 모드: 모든 세그먼트의 학습 자료 통합
                    selectedProblem?.segments.map((segment, segmentIndex) => (
                      <div key={segmentIndex} className="mb-6 pb-4 border-b border-green-200 last:border-b-0">
                        <h4 className="font-bold text-green-800 mb-3">
                          세그먼트 {segmentIndex + 1} 학습 자료:
                        </h4>
                        
                        {/* 핵심 어휘 */}
                        {segment.key_vocabulary.length > 0 && (
                          <div className="mb-4">
                            <h5 className="font-semibold text-green-700 mb-2">핵심 어휘:</h5>
                            {segment.key_vocabulary.slice(0, 3).map((vocab, index) => (
                              <div key={index} className="mb-2">
                                • {vocab.source_text || vocab.chinese} ({vocab.pinyin}) - {vocab.target_text || vocab.korean}
                              </div>
                            ))}
                          </div>
                        )}
                        
                        {/* 통역 힌트 */}
                        {segment.interpreting_hints.length > 0 && (
                          <div className="mb-4">
                            <h5 className="font-semibold text-green-700 mb-2">통역 힌트:</h5>
                            {segment.interpreting_hints.slice(0, 2).map((hint, index) => (
                              <div key={index} className="mb-1">• {hint}</div>
                            ))}
                          </div>
                        )}
                        
                        {/* 문화적 맥락 */}
                        {segment.cultural_context && (
                          <div>
                            <h5 className="font-semibold text-green-700 mb-2">문화적 맥락:</h5>
                            <div>{segment.cultural_context}</div>
                          </div>
                        )}
                      </div>
                    ))
                  ) : (
                    // 개별 세그먼트 모드: 해당 세그먼트의 학습 자료만
                    currentSegment && (
                      <>
                        {/* 핵심 어휘 */}
                        {currentSegment.key_vocabulary.length > 0 && (
                          <div className="mb-4">
                            <h4 className="font-bold text-green-800 mb-2">핵심 어휘:</h4>
                            {currentSegment.key_vocabulary.slice(0, 3).map((vocab, index) => (
                              <div key={index} className="mb-2">
                                • {vocab.source_text || vocab.chinese} ({vocab.pinyin}) - {vocab.target_text || vocab.korean}
                              </div>
                            ))}
                          </div>
                        )}
                        
                        {/* 통역 힌트 */}
                        {currentSegment.interpreting_hints.length > 0 && (
                          <div className="mb-4">
                            <h4 className="font-bold text-green-800 mb-2">통역 힌트:</h4>
                            {currentSegment.interpreting_hints.slice(0, 2).map((hint, index) => (
                              <div key={index} className="mb-1">• {hint}</div>
                            ))}
                          </div>
                        )}
                        
                        {/* 문화적 맥락 */}
                        {currentSegment.cultural_context && (
                          <div>
                            <h4 className="font-bold text-green-800 mb-2">문화적 맥락:</h4>
                            <div>{currentSegment.cultural_context}</div>
                          </div>
                        )}
                      </>
                    )
                  )}
                </div>
              )}
            </div>

            {/* 다음 단계 버튼 */}
            <div className="text-center">
              <button
                onClick={() => goToStep(2)}
                className="px-8 py-4 bg-gradient-to-r from-blue-500 to-blue-700 text-white font-semibold text-lg rounded-xl hover:from-blue-600 hover:to-blue-800 transition-all duration-300 shadow-lg hover:shadow-xl hover:-translate-y-1"
              >
                다음: 통역 녹음 →
              </button>
            </div>
          </div>
        )}

        {/* Step 2: 통역 녹음 */}
        {selectedProblem && currentStep === 2 && (
          <div className="bg-white rounded-3xl shadow-2xl p-10">
                      <div className="text-center mb-8">
            <h3 className="text-3xl font-bold text-gray-800 mb-4">
              🎙️ {sourceLanguage === 'ko' ? '한국어' : '중국어'}로 통역해보세요
            </h3>
          </div>

            {/* 대형 녹음 버튼 */}
            <div className="text-center mb-8">
              <div className="flex flex-col items-center">
                <button
                  onClick={toggleRecording}
                  className={`w-32 h-32 rounded-full text-6xl font-bold transition-all duration-300 shadow-2xl flex items-center justify-center ${
                    isRecording
                      ? 'bg-gradient-to-r from-red-500 to-red-600 text-white animate-pulse hover:scale-105'
                      : 'bg-gradient-to-r from-blue-500 to-blue-700 text-white hover:scale-105'
                  }`}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  {isRecording ? '⏹️' : '🎙️'}
                </button>
              </div>
              
              {/* 타이머 */}
              <div className="text-4xl font-mono font-bold text-gray-700 mt-4">
                {formatTime(recordingTime)}
              </div>
              
              <div className="text-lg text-gray-600 mt-2">
                {isRecording ? `녹음 중... ${sourceLanguage === 'ko' ? '한국어' : '중국어'}로 말해주세요` : '녹음 버튼을 눌러 시작하세요'}
              </div>
            </div>

            {/* 실시간 음성 인식 결과 */}
            <div className="bg-gray-50 border-2 border-gray-200 rounded-xl p-6 mb-8 min-h-[120px]">
              <div className="text-sm font-medium text-gray-700 mb-2">실시간 음성 인식:</div>
              {(accumulatedText || currentText) ? (
                <div className="text-lg text-gray-800 leading-relaxed">
                  <span className="font-medium">{accumulatedText}</span>
                  <span className="text-gray-500 italic">{currentText}</span>
                </div>
              ) : (
                <div className="text-gray-400 italic text-center py-4">
                  {isRecording ? '말씀해주세요...' : '녹음을 시작하면 음성 인식 결과가 여기에 표시됩니다'}
                </div>
              )}
            </div>

            {/* 텍스트 초기화 버튼 */}
            {(accumulatedText || currentText) && (
              <div className="text-center mb-6">
                <button
                  onClick={() => {
                    setAccumulatedText('');
                    setCurrentText('');
                    setRecordingTime(0);
                  }}
                  className="px-6 py-3 bg-red-500 hover:bg-red-600 text-white font-medium rounded-xl transition-all duration-300 shadow-lg hover:shadow-xl"
                >
                  🗑️ 텍스트 초기화
                </button>
              </div>
            )}

            {/* 네비게이션 버튼 */}
            <div className="flex gap-4">
              <button
                onClick={() => goToStep(1)}
                className="flex-1 py-4 px-6 bg-gray-200 text-gray-700 font-semibold rounded-xl hover:bg-gray-300 transition-all duration-300"
              >
                ← 이전: 다시 듣기
              </button>
              <button
                onClick={() => goToStep(3)}
                disabled={!accumulatedText.trim()}
                className={`flex-1 py-4 px-6 font-semibold rounded-xl transition-all duration-300 ${
                  accumulatedText.trim()
                    ? 'bg-gradient-to-r from-blue-500 to-blue-700 text-white hover:from-blue-600 hover:to-blue-800 hover:-translate-y-1'
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                }`}
              >
                다음: AI 분석 →
              </button>
            </div>
          </div>
        )}

        {/* Step 3: AI 분석 */}
        {selectedProblem && currentStep === 3 && (
          <div className="bg-white rounded-3xl shadow-2xl p-10">
            <div className="text-center mb-8">
              <h3 className="text-3xl font-bold text-gray-800 mb-4">🤖 AI 분석 및 피드백</h3>
            </div>

            {/* AI 분석 버튼 */}
            {!analysisResult && (
              <div className="text-center mb-8">
                <button
                  onClick={analyzeInterpretation}
                  disabled={isAnalyzing}
                  className="px-8 py-4 bg-gradient-to-r from-purple-500 to-purple-700 text-white font-semibold text-lg rounded-xl hover:from-purple-600 hover:to-purple-800 transition-all duration-300 shadow-lg hover:shadow-xl hover:-translate-y-1 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isAnalyzing ? (
                    <div className="flex items-center gap-3">
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      분석 중...
                    </div>
                  ) : (
                    '🚀 AI 분석 시작'
                  )}
                </button>
                
                {analysisError && (
                  <div className="mt-4 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg">
                    {analysisError}
                  </div>
                )}
              </div>
            )}

            {/* 분석 결과 */}
            {analysisResult && (
              <div className="bg-gradient-to-r from-purple-50 to-blue-50 border-2 border-purple-200 rounded-2xl p-8">
                {/* 진행 상황 표시 */}
                <div className="bg-white rounded-xl p-4 mb-6 border border-purple-200">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-purple-600 font-semibold">📊 진행 상황:</span>
                      <span className="text-gray-700">
                        {completedSegments.length}/{selectedProblem?.segments.length || 0} 세그먼트 완료
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-purple-600 font-semibold">🎯 총 점수:</span>
                      <span className="text-gray-700 font-bold">{totalScore.toFixed(1)}점</span>
                    </div>
                  </div>
                  <div className="mt-2 bg-gray-200 rounded-full h-2">
                    <div 
                      className="bg-gradient-to-r from-purple-500 to-blue-500 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${(completedSegments.length / (selectedProblem?.segments.length || 1)) * 100}%` }}
                    ></div>
                  </div>
                </div>

                {/* 점수 표시 */}
                <div className="text-center mb-8">
                  <div className="w-24 h-24 bg-gradient-to-r from-green-500 to-green-600 rounded-full flex items-center justify-center text-3xl font-bold text-white mx-auto mb-4 shadow-lg">
                    {analysisResult.overall_score}
                  </div>
                  <div className="text-xl font-semibold text-gray-800">
                    {analysisResult.overall_score >= 90 ? '🎉 탁월한 통역입니다!' :
                     analysisResult.overall_score >= 80 ? '👏 우수한 통역입니다!' :
                     analysisResult.overall_score >= 70 ? '👍 좋은 통역입니다!' :
                     analysisResult.overall_score >= 60 ? '📈 향상이 필요합니다' :
                     '💪 더 연습해보세요'}
                  </div>
                </div>

                {/* 세부 점수 */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-red-600">{analysisResult.accuracy}</div>
                    <div className="text-sm text-gray-600">정확성</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-orange-600">{analysisResult.fluency}</div>
                    <div className="text-sm text-gray-600">유창성</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">{analysisResult.grammar}</div>
                    <div className="text-sm text-gray-600">문법</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600">{analysisResult.completeness}</div>
                    <div className="text-sm text-gray-600">완성도</div>
                  </div>
                </div>

                {/* 피드백 */}
                <div className="grid md:grid-cols-2 gap-6 mb-8">
                  {/* 잘한 점 */}
                  <div className="bg-green-50 border border-green-200 rounded-xl p-6">
                    <h4 className="font-bold text-green-800 mb-3 flex items-center gap-2">
                      <span>✅</span> 잘한 점
                    </h4>
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
                  <div className="bg-orange-50 border border-orange-200 rounded-xl p-6">
                    <h4 className="font-bold text-orange-800 mb-3 flex items-center gap-2">
                      <span>💡</span> 개선점
                    </h4>
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
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 mb-8">
                  <h4 className="font-bold text-blue-800 mb-3 flex items-center gap-2">
                    <span>📝</span> 종합 평가
                  </h4>
                  <p className="text-blue-700 leading-relaxed">
                    {analysisResult.feedback.overall_comment}
                  </p>
                </div>

                {/* 1. 모범 답안 비교 (언어쌍에 따라 선택) */}
                {(() => {
                  const targetLanguage = sourceLanguage === 'ko' ? '한국어' : '중국어';
                  
                  if (selectedSegmentIndex === -1) {
                    // 전체 세그먼트 모드: 모든 세그먼트의 모범 답안 표시
                    const hasAnyAlternatives = selectedProblem?.segments.some(segment => {
                      // 언어 쌍에 따라 적절한 필드 확인
                      return (segment.alternative_korean_interpretations && segment.alternative_korean_interpretations.length > 0) ||
                             (segment.alternative_interpretations && segment.alternative_interpretations.length > 0);
                    });
                    
                    return hasAnyAlternatives && (
                      <div className="bg-purple-50 border border-purple-200 rounded-xl p-6 mb-6">
                        <h4 className="font-bold text-purple-800 mb-4 flex items-center gap-2">
                          <span>⭐</span> 전체 모범 {targetLanguage} 통역 답안
                        </h4>
                        <div className="space-y-6">
                          {selectedProblem?.segments.map((segment, segmentIndex) => {
                            // 언어 쌍에 따라 적절한 대안 번역 가져오기
                            const alternatives = segment.alternative_korean_interpretations || segment.alternative_interpretations || [];
                              
                            return alternatives.length > 0 && (
                              <div key={segmentIndex} className="border-b border-purple-200 pb-4 last:border-b-0">
                                <h5 className="font-semibold text-purple-700 mb-3">
                                  세그먼트 {segmentIndex + 1} 모범 답안:
                                </h5>
                                <div className="space-y-2">
                                  {alternatives.slice(0, 2).map((alternative: string, index: number) => (
                                    <div key={index} className="bg-white border border-purple-200 rounded-lg p-3">
                                      <div className="flex items-start gap-3">
                                        <div className="w-5 h-5 bg-purple-500 text-white rounded-full flex items-center justify-center text-xs font-bold">
                                          {index + 1}
                                        </div>
                                        <div className="flex-1">
                                          <p className="text-gray-800 text-sm leading-relaxed">{alternative}</p>
                                        </div>
                                        <button
                                          onClick={() => playText(alternative, sourceLanguage === 'ko' ? 'ko' : 'zh')}
                                          disabled={!alternative.trim()}
                                          className={`ml-2 p-1 rounded-full transition-all duration-200 ${
                                            isTTSPlaying && currentTTSText === alternative
                                              ? 'bg-red-500 hover:bg-red-600 text-white'
                                              : 'bg-purple-100 hover:bg-purple-200 text-purple-600'
                                          } disabled:opacity-50 disabled:cursor-not-allowed`}
                                        >
                                          {isTTSPlaying && currentTTSText === alternative ? (
                                            <span className="text-xs">⏹️</span>
                                          ) : (
                                            <span className="text-xs">🔊</span>
                                          )}
                                        </button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        <div className="mt-4 p-3 bg-purple-100 rounded-lg">
                          <p className="text-sm text-purple-700">
                            💡 <strong>활용 팁:</strong> 위의 모범 {targetLanguage} 답안들과 여러분의 통역을 비교해보세요. 
                            세그먼트별로 표현 방식과 핵심 어휘를 참고하여 다음 연습에 적용해보세요.
                          </p>
                        </div>
                      </div>
                    );
                  } else {
                    // 개별 세그먼트 모드: 해당 세그먼트의 모범 답안만
                    const getAlternativeInterpretations = () => {
                      if (!currentSegment) return null;
                      
                      // 언어 쌍에 따라 적절한 대안 번역 반환
                      return currentSegment.alternative_korean_interpretations || currentSegment.alternative_interpretations || [];
                    };
                    
                    const alternatives = getAlternativeInterpretations();
                    
                    return alternatives && alternatives.length > 0 && (
                      <div className="bg-purple-50 border border-purple-200 rounded-xl p-6 mb-6">
                        <h4 className="font-bold text-purple-800 mb-4 flex items-center gap-2">
                          <span>⭐</span> 모범 {targetLanguage} 통역 답안
                        </h4>
                        <div className="space-y-3">
                          {alternatives.slice(0, 3).map((alternative: string, index: number) => (
                            <div key={index} className="bg-white border border-purple-200 rounded-lg p-4">
                              <div className="flex items-start gap-3">
                                <div className="w-6 h-6 bg-purple-500 text-white rounded-full flex items-center justify-center text-sm font-bold">
                                  {index + 1}
                                </div>
                                <div className="flex-1">
                                  <p className="text-gray-800 leading-relaxed">{alternative}</p>
                                </div>
                                <button
                                  onClick={() => playText(alternative, sourceLanguage === 'ko' ? 'ko' : 'zh')}
                                  disabled={!alternative.trim()}
                                  className={`ml-2 p-2 rounded-full transition-all duration-200 ${
                                    isTTSPlaying && currentTTSText === alternative
                                      ? 'bg-red-500 hover:bg-red-600 text-white'
                                      : 'bg-purple-100 hover:bg-purple-200 text-purple-600'
                                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                                  title={isTTSPlaying && currentTTSText === alternative ? '음성 정지' : '음성 재생'}
                                >
                                  {isTTSPlaying && currentTTSText === alternative ? (
                                    <span className="text-sm">⏹️</span>
                                  ) : (
                                    <span className="text-sm">🔊</span>
                                  )}
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="mt-4 p-3 bg-purple-100 rounded-lg">
                          <p className="text-sm text-purple-700">
                            💡 <strong>활용 팁:</strong> 위의 모범 {targetLanguage} 답안들과 여러분의 통역을 비교해보세요. 
                            표현 방식, 어순, 핵심 어휘 선택 등을 참고하여 다음 연습에 적용해보세요.<br/>
                            🔊 <strong>음성 듣기:</strong> 스피커 버튼을 클릭하면 정확한 발음과 억양을 들을 수 있습니다.
                          </p>
                        </div>
                      </div>
                    );
                  }
                })()}

                {/* 2. 통역 시 주의사항 (common_interpretation_challenges) */}
                {(() => {
                  if (selectedSegmentIndex === -1) {
                    // 전체 세그먼트 모드
                    const hasAnyChallenges = selectedProblem?.segments.some(segment => 
                      segment?.common_interpretation_challenges?.length > 0
                    );
                    
                    return hasAnyChallenges && (
                      <div className="bg-orange-50 border border-orange-200 rounded-xl p-6 mb-6">
                        <h4 className="font-bold text-orange-800 mb-4 flex items-center gap-2">
                          <span>⚠️</span> 전체 구간에서 놓치기 쉬운 포인트
                        </h4>
                        <div className="space-y-6">
                          {selectedProblem?.segments.map((segment, segmentIndex) => {
                            const challenges = segment?.common_interpretation_challenges || [];
                            
                            return challenges.length > 0 && (
                              <div key={segmentIndex} className="border-b border-orange-200 pb-4 last:border-b-0">
                                <h5 className="font-semibold text-orange-700 mb-3">
                                  세그먼트 {segmentIndex + 1} 주의사항:
                                </h5>
                                <div className="space-y-2">
                                  {challenges.slice(0, 3).map((challenge, index) => (
                                    <div key={index} className="flex items-start gap-3 bg-white border border-orange-200 rounded-lg p-3">
                                      <div className="w-5 h-5 bg-orange-500 text-white rounded-full flex items-center justify-center text-xs font-bold mt-0.5">
                                        !
                                      </div>
                                      <div className="flex-1">
                                        <p className="text-gray-800 text-sm leading-relaxed">{challenge}</p>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        <div className="mt-4 p-3 bg-orange-100 rounded-lg">
                          <p className="text-sm text-orange-700">
                            🎯 <strong>체크 포인트:</strong> 위의 주의사항들을 참고하여 자신의 통역에서 
                            각 세그먼트별 포인트들이 제대로 처리되었는지 확인해보세요.
                          </p>
                        </div>
                      </div>
                    );
                  } else {
                    // 개별 세그먼트 모드
                    return currentSegment?.common_interpretation_challenges && currentSegment.common_interpretation_challenges.length > 0 && (
                      <div className="bg-orange-50 border border-orange-200 rounded-xl p-6 mb-6">
                        <h4 className="font-bold text-orange-800 mb-4 flex items-center gap-2">
                          <span>⚠️</span> 이 구간에서 놓치기 쉬운 포인트
                        </h4>
                        <div className="space-y-3">
                          {currentSegment.common_interpretation_challenges.slice(0, 4).map((challenge, index) => (
                            <div key={index} className="flex items-start gap-3 bg-white border border-orange-200 rounded-lg p-4">
                              <div className="w-6 h-6 bg-orange-500 text-white rounded-full flex items-center justify-center text-sm font-bold mt-0.5">
                                !
                              </div>
                              <div className="flex-1">
                                <p className="text-gray-800 leading-relaxed">{challenge}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="mt-4 p-3 bg-orange-100 rounded-lg">
                          <p className="text-sm text-orange-700">
                            🎯 <strong>체크 포인트:</strong> 위의 주의사항들을 참고하여 자신의 통역에서 
                            해당 부분들이 제대로 처리되었는지 확인해보세요.
                          </p>
                        </div>
                      </div>
                    );
                  }
                })()}

                {/* 3. 문법 포인트 (grammar_points) */}
                {(() => {
                  if (selectedSegmentIndex === -1) {
                    // 전체 세그먼트 모드
                    const hasAnyGrammar = selectedProblem?.segments.some(segment => 
                      segment?.grammar_points?.length > 0
                    );
                    
                    return hasAnyGrammar && (
                      <div className="bg-green-50 border border-green-200 rounded-xl p-6 mb-6">
                        <h4 className="font-bold text-green-800 mb-4 flex items-center gap-2">
                          <span>📚</span> 전체 핵심 문법 포인트
                        </h4>
                        <div className="space-y-6">
                          {selectedProblem?.segments.map((segment, segmentIndex) => {
                            const grammarPoints = segment?.grammar_points || [];
                            
                            return grammarPoints.length > 0 && (
                              <div key={segmentIndex} className="border-b border-green-200 pb-4 last:border-b-0">
                                <h5 className="font-semibold text-green-700 mb-3">
                                  세그먼트 {segmentIndex + 1} 문법 포인트:
                                </h5>
                                <div className="space-y-3">
                                  {grammarPoints.slice(0, 2).map((grammar, index) => (
                                    <div key={index} className="bg-white border border-green-200 rounded-lg p-3">
                                      <div className="flex items-start gap-3">
                                        <div className="w-5 h-5 bg-green-500 text-white rounded-full flex items-center justify-center text-xs font-bold">
                                          📝
                                        </div>
                                        <div className="flex-1 space-y-2">
                                          {grammar.korean_pattern && (
                                            <div>
                                              <span className="text-xs font-medium text-green-700">한국어 패턴:</span>
                                              <p className="text-gray-800 text-sm font-medium">{grammar.korean_pattern}</p>
                                            </div>
                                          )}
                                          {grammar.chinese_explanation && (
                                            <div>
                                              <span className="text-xs font-medium text-green-700">중국어 설명:</span>
                                              <p className="text-gray-800 text-sm">{grammar.chinese_explanation}</p>
                                            </div>
                                          )}
                                          <div className="grid md:grid-cols-2 gap-2 mt-2">
                                            {grammar.example_korean && (
                                              <div className="bg-green-100 p-2 rounded">
                                                <span className="text-xs font-medium text-green-600">한국어 예문</span>
                                                <p className="text-gray-800 text-xs mt-1">{grammar.example_korean}</p>
                                              </div>
                                            )}
                                            {grammar.example_chinese && (
                                              <div className="bg-green-100 p-2 rounded">
                                                <span className="text-xs font-medium text-green-600">중국어 예문</span>
                                                <p className="text-gray-800 text-xs mt-1">{grammar.example_chinese}</p>
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        <div className="mt-4 p-3 bg-green-100 rounded-lg">
                          <p className="text-sm text-green-700">
                            📖 <strong>학습 가이드:</strong> 위의 문법 패턴들을 숙지하고, 
                            유사한 구조가 나올 때 정확하게 적용할 수 있도록 연습해보세요.
                          </p>
                        </div>
                      </div>
                    );
                  } else {
                    // 개별 세그먼트 모드
                    return currentSegment?.grammar_points && currentSegment.grammar_points.length > 0 && (
                      <div className="bg-green-50 border border-green-200 rounded-xl p-6 mb-6">
                        <h4 className="font-bold text-green-800 mb-4 flex items-center gap-2">
                          <span>📚</span> 핵심 문법 포인트
                        </h4>
                        <div className="space-y-4">
                          {currentSegment.grammar_points.slice(0, 3).map((grammar, index) => (
                            <div key={index} className="bg-white border border-green-200 rounded-lg p-4">
                              <div className="flex items-start gap-3">
                                <div className="w-6 h-6 bg-green-500 text-white rounded-full flex items-center justify-center text-sm font-bold">
                                  📝
                                </div>
                                <div className="flex-1 space-y-2">
                                  {grammar.korean_pattern && (
                                    <div>
                                      <span className="text-sm font-medium text-green-700">한국어 패턴:</span>
                                      <p className="text-gray-800 font-medium">{grammar.korean_pattern}</p>
                                    </div>
                                  )}
                                  {grammar.chinese_explanation && (
                                    <div>
                                      <span className="text-sm font-medium text-green-700">중국어 설명:</span>
                                      <p className="text-gray-800">{grammar.chinese_explanation}</p>
                                    </div>
                                  )}
                                  <div className="grid md:grid-cols-2 gap-3 mt-3">
                                    {grammar.example_korean && (
                                      <div className="bg-green-100 p-3 rounded-lg">
                                        <span className="text-xs font-medium text-green-600">한국어 예문</span>
                                        <p className="text-gray-800 text-sm mt-1">{grammar.example_korean}</p>
                                      </div>
                                    )}
                                    {grammar.example_chinese && (
                                      <div className="bg-green-100 p-3 rounded-lg">
                                        <span className="text-xs font-medium text-green-600">중국어 예문</span>
                                        <p className="text-gray-800 text-sm mt-1">{grammar.example_chinese}</p>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="mt-4 p-3 bg-green-100 rounded-lg">
                          <p className="text-sm text-green-700">
                            📖 <strong>학습 가이드:</strong> 위의 문법 패턴들을 숙지하고, 
                            유사한 구조가 나올 때 정확하게 적용할 수 있도록 연습해보세요.
                          </p>
                        </div>
                      </div>
                    );
                  }
                })()}

                {/* 4. 노트테이킹 포인트 (suggested_note_taking_points) */}
                {(() => {
                  if (selectedSegmentIndex === -1) {
                    // 전체 세그먼트 모드
                    const hasAnyNotes = selectedProblem?.segments.some(segment => 
                      segment?.suggested_note_taking_points?.length > 0
                    );
                    
                    return hasAnyNotes && (
                      <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-6 mb-6">
                        <h4 className="font-bold text-indigo-800 mb-4 flex items-center gap-2">
                          <span>✏️</span> 전체 핵심 노트테이킹 포인트
                        </h4>
                        <div className="space-y-6">
                          {selectedProblem?.segments.map((segment, segmentIndex) => {
                            const notePoints = segment?.suggested_note_taking_points || [];
                            
                            return notePoints.length > 0 && (
                              <div key={segmentIndex} className="border-b border-indigo-200 pb-4 last:border-b-0">
                                <h5 className="font-semibold text-indigo-700 mb-3">
                                  세그먼트 {segmentIndex + 1} 노트테이킹:
                                </h5>
                                <div className="space-y-2">
                                  {notePoints.slice(0, 3).map((point, index) => (
                                    <div key={index} className="flex items-start gap-3 bg-white border border-indigo-200 rounded-lg p-3">
                                      <div className="w-5 h-5 bg-indigo-500 text-white rounded-full flex items-center justify-center text-xs font-bold">
                                        ✓
                                      </div>
                                      <div className="flex-1">
                                        <p className="text-gray-800 text-sm leading-relaxed">{point}</p>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        <div className="mt-4 p-3 bg-indigo-100 rounded-lg">
                          <p className="text-sm text-indigo-700">
                            📝 <strong>노트테이킹 팁:</strong> 실제 통역 시에는 위의 포인트들을 미리 예상하고 
                            핵심 정보를 빠르게 기록할 수 있도록 연습하세요.
                          </p>
                        </div>
                      </div>
                    );
                  } else {
                    // 개별 세그먼트 모드
                    return currentSegment?.suggested_note_taking_points && currentSegment.suggested_note_taking_points.length > 0 && (
                      <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-6 mb-6">
                        <h4 className="font-bold text-indigo-800 mb-4 flex items-center gap-2">
                          <span>✏️</span> 핵심 노트테이킹 포인트
                        </h4>
                        <div className="space-y-3">
                          {currentSegment.suggested_note_taking_points.slice(0, 5).map((point, index) => (
                            <div key={index} className="flex items-start gap-3 bg-white border border-indigo-200 rounded-lg p-4">
                              <div className="w-6 h-6 bg-indigo-500 text-white rounded-full flex items-center justify-center text-sm font-bold">
                                ✓
                              </div>
                              <div className="flex-1">
                                <p className="text-gray-800 leading-relaxed">{point}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="mt-4 p-3 bg-indigo-100 rounded-lg">
                          <p className="text-sm text-indigo-700">
                            📝 <strong>노트테이킹 팁:</strong> 실제 통역 시에는 위의 포인트들을 미리 예상하고 
                            핵심 정보를 빠르게 기록할 수 있도록 연습하세요.
                          </p>
                        </div>
                      </div>
                    );
                  }
                })()}

                {/* 5. 어조 및 전달 방식 (recommended_delivery_tone) */}
                {(() => {
                  if (selectedSegmentIndex === -1) {
                    // 전체 세그먼트 모드
                    const hasAnyTone = selectedProblem?.segments.some(segment => 
                      segment?.recommended_delivery_tone
                    );
                    
                    return hasAnyTone && (
                      <div className="bg-pink-50 border border-pink-200 rounded-xl p-6 mb-6">
                        <h4 className="font-bold text-pink-800 mb-4 flex items-center gap-2">
                          <span>🎭</span> 전체 권장 어조 및 전달 방식
                        </h4>
                        <div className="space-y-6">
                          {selectedProblem?.segments.map((segment, segmentIndex) => {
                            const tone = segment?.recommended_delivery_tone;
                            
                            return tone && (
                              <div key={segmentIndex} className="border-b border-pink-200 pb-4 last:border-b-0">
                                <h5 className="font-semibold text-pink-700 mb-3">
                                  세그먼트 {segmentIndex + 1} 어조:
                                </h5>
                                <div className="bg-white border border-pink-200 rounded-lg p-3">
                                  <div className="flex items-start gap-3">
                                    <div className="w-5 h-5 bg-pink-500 text-white rounded-full flex items-center justify-center text-xs font-bold">
                                      🗣️
                                    </div>
                                    <div className="flex-1">
                                      <p className="text-gray-800 text-sm leading-relaxed">{tone}</p>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        <div className="mt-4 p-3 bg-pink-100 rounded-lg">
                          <p className="text-sm text-pink-700">
                            🎙️ <strong>전달 가이드:</strong> 통역할 때는 단순히 내용만이 아니라 화자의 의도와 
                            상황에 맞는 어조로 전달하는 것이 중요합니다.
                          </p>
                        </div>
                      </div>
                    );
                  } else {
                    // 개별 세그먼트 모드
                    return currentSegment?.recommended_delivery_tone && (
                      <div className="bg-pink-50 border border-pink-200 rounded-xl p-6 mb-6">
                        <h4 className="font-bold text-pink-800 mb-4 flex items-center gap-2">
                          <span>🎭</span> 권장 어조 및 전달 방식
                        </h4>
                        <div className="bg-white border border-pink-200 rounded-lg p-4">
                          <div className="flex items-start gap-3">
                            <div className="w-6 h-6 bg-pink-500 text-white rounded-full flex items-center justify-center text-sm font-bold">
                              🗣️
                            </div>
                            <div className="flex-1">
                              <p className="text-gray-800 leading-relaxed">{currentSegment.recommended_delivery_tone}</p>
                            </div>
                          </div>
                        </div>
                        <div className="mt-4 p-3 bg-pink-100 rounded-lg">
                          <p className="text-sm text-pink-700">
                            🎙️ <strong>전달 가이드:</strong> 통역할 때는 단순히 내용만이 아니라 화자의 의도와 
                            상황에 맞는 어조로 전달하는 것이 중요합니다.
                          </p>
                        </div>
                      </div>
                    );
                  }
                })()}

                {/* 다음 세그먼트 버튼 */}
                <div className="text-center">
                  <button
                    onClick={() => {
                      if (selectedSegmentIndex === -1) {
                        // 전체 세그먼트에서 첫 번째 세그먼트로 이동
                        setSelectedSegmentIndex(0);
                        setCurrentStep(1);
                        setAccumulatedText('');
                        setCurrentText('');
                        setAnalysisResult(null);
                        setRecordingTime(0);
                      } else {
                        // 다음 세그먼트로 이동 또는 완료
                        if (selectedSegmentIndex < (selectedProblem?.segments.length || 1) - 1) {
                          setSelectedSegmentIndex(prev => prev + 1);
                          setCurrentStep(1);
                          setAccumulatedText('');
                          setCurrentText('');
                          setAnalysisResult(null);
                          setRecordingTime(0);
                        } else {
                          // 모든 세그먼트 완료 시 세션 저장
                          saveInterpretationSession();
                        }
                      }
                    }}
                    className="px-8 py-4 bg-gradient-to-r from-green-500 to-green-700 text-white font-semibold text-lg rounded-xl hover:from-green-600 hover:to-green-800 transition-all duration-300 shadow-lg hover:shadow-xl hover:-translate-y-1"
                  >
                    ✨ {selectedSegmentIndex === -1 ? '첫 번째 세그먼트로' : 
                        selectedSegmentIndex < (selectedProblem?.segments.length || 1) - 1 ? '다음 세그먼트' : '연습 완료'}
                  </button>
                </div>
              </div>
            )}

            {/* 네비게이션 버튼 */}
            <div className="flex gap-4 mt-8">
              <button
                onClick={() => {
                  // 다시 녹음할 때 기존 텍스트 초기화
                  setAccumulatedText('');
                  setCurrentText('');
                  setRecordingTime(0);
                  setAnalysisResult(null);
                  goToStep(2);
                }}
                className="flex-1 py-4 px-6 bg-gray-200 text-gray-700 font-semibold rounded-xl hover:bg-gray-300 transition-all duration-300"
              >
                ← 이전: 다시 녹음
              </button>
              
              {/* 수동 저장 버튼 - 로그인된 사용자만 표시 */}
              {auth.currentUser && completedSegments.length > 0 && (
                <button
                  onClick={saveInterpretationSession}
                  className="py-4 px-6 bg-gradient-to-r from-green-500 to-green-600 text-white font-semibold rounded-xl hover:from-green-600 hover:to-green-700 transition-all duration-300 shadow-lg hover:shadow-xl"
                >
                  💾 학습 기록 저장
                </button>
              )}
            </div>
          </div>
        )}

          {/* 오디오 엘리먼트 */}
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
              onPlay={() => {
                setIsPlaying(true);
                setIsAudioPlaying(true);
              }}
              onPause={() => {
                setIsPlaying(false);
                setIsAudioPlaying(false);
              }}
              onEnded={() => {
                setIsPlaying(false);
                setIsAudioPlaying(false);
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default StepByStepInterpretation; 