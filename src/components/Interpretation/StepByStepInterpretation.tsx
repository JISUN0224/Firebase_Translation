import React, { useState, useEffect, useRef, useCallback } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { getStorage, ref, getDownloadURL } from 'firebase/storage';
import { db } from '../../firebase';
import axios from 'axios';

// 인터페이스 정의
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
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [audioDuration, setAudioDuration] = useState(0);
  const [audioCurrentTime, setAudioCurrentTime] = useState(0);
  
  // 녹음 관리
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [accumulatedText, setAccumulatedText] = useState('');
  const [currentText, setCurrentText] = useState('');
  
  // AI 분석 관리
  const [analysisResult, setAnalysisResult] = useState<InterpretationAnalysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  
  // UI 상태 관리
  const [showOriginalText, setShowOriginalText] = useState(false);
  const [showLearningMaterials, setShowLearningMaterials] = useState(false);
  const [sourceLanguage, setSourceLanguage] = useState<'ko' | 'zh'>('ko');
  
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
        console.log(`필터 변경으로 인해 "${selectedProblem.title}" 문제 선택 해제`);
        setSelectedProblem(null);
        setCurrentStep(1);
        setAccumulatedText('');
        setCurrentText('');
        setAnalysisResult(null);
        setRecordingTime(0);
      }
    }
  }, [filters.category, filters.difficulty, selectedProblem]);



  // Firebase에서 문제 데이터 가져오기 (AIFeedback.tsx와 동일)
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
    
    // 선택된 문제의 음성 파일 로드
    loadAudioFile(problem);
    
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
    switch(difficulty) {
      case 'beginner': return 'bg-green-100 text-green-800';
      case 'intermediate': return 'bg-yellow-100 text-yellow-800';
      case 'advanced': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  // 단계 이동 함수
  const goToStep = (step: number) => {
    setCurrentStep(step);
  };

  // 세그먼트 오디오 재생 (AIFeedback.tsx와 동일)
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
          setIsPlaying(false);
          setIsAudioPlaying(false);
        }
      };
      
      audioElement.addEventListener('timeupdate', handleTimeUpdate);
      setIsPlaying(true);
      setIsAudioPlaying(true);
      
      console.log(`세그먼트 ${index + 1} 재생: ${segment.audio_timing.start_time_sec}초 - ${segment.audio_timing.end_time_sec}초`);
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
      if (!streamRef.current) {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          }
        });
        streamRef.current = stream;
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
      };

      mediaRecorder.start();
      setIsRecording(true);
      isRecordingRef.current = true;
      setRecordingTime(0);

      // 타이머 시작
      intervalRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

      // 음성 인식 시작
      startSpeechRecognition();

    } catch (error) {
      console.error('녹음 시작 실패:', error);
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
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = sourceLanguage === 'ko' ? 'ko-KR' : 'zh-CN';

    recognition.onresult = (event: any) => {
      let finalTranscript = '';
      let interimTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }

      if (finalTranscript) {
        setAccumulatedText(prev => prev + finalTranscript + ' ');
      }
      setCurrentText(interimTranscript);
    };

    recognition.onend = () => {
      if (isRecordingRef.current) {
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

    recognition.start();
    recognitionRef.current = recognition;
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

      const currentSegment = selectedProblem.segments[selectedSegmentIndex];
      let originalText: string;
      
      if (selectedProblem.id === 'JEIBOYr3vC5dHfRDG9u1') {
        originalText = (currentSegment as any)?.chinese_text || '';
      } else {
        originalText = currentSegment?.korean_text || '';
      }

      const langPair = sourceLanguage === 'ko' ? '한국어 → 중국어' : '중국어 → 한국어';
      const sourceLang = sourceLanguage === 'ko' ? '한국어' : '중국어';
      const targetLang = sourceLanguage === 'ko' ? '중국어' : '한국어';

      const prompt = `당신은 전문 통역 평가자입니다. ${langPair} 통역을 다음 4개 항목으로 0-100점 평가해주세요.

**원문(${sourceLang}):** ${originalText}
**통역문(${targetLang}):** ${accumulatedText.trim()}

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

  // 현재 세그먼트 정보
  const currentSegment = selectedProblem?.segments[selectedSegmentIndex];

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
              <div className="text-sm text-gray-500">{sourceLanguage === 'ko' ? '한국어' : '중국어'} 원문을 들어보세요</div>
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
              <div className="text-sm text-gray-500">{sourceLanguage === 'ko' ? '중국어' : '한국어'}로 통역해보세요</div>
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
                    strokeDashoffset={251.2 - (((selectedSegmentIndex + 1) / selectedProblem.total_segments) * 100 / 100) * 251.2}
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

            {/* 세그먼트 선택 */}
            {selectedProblem.segments.length > 1 && (
              <div className="mt-4">
                <h4 className="text-sm font-medium text-gray-700 mb-2">세그먼트 선택:</h4>
                <div className="flex flex-wrap gap-2">
                  {selectedProblem.segments.map((segment, index) => (
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
                      className={`px-3 py-1 rounded-lg text-sm font-medium transition-all ${
                        selectedSegmentIndex === index
                          ? 'bg-blue-500 text-white'
                          : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                      }`}
                    >
                      {index + 1}
                    </button>
                  ))}
                </div>
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
              {currentSegment && (
                <p className="text-lg text-gray-600">
                  세그먼트 {selectedSegmentIndex + 1} / {selectedProblem?.total_segments} 
                  ({currentSegment.audio_timing.start_time_sec}초 - {currentSegment.audio_timing.end_time_sec}초)
                </p>
              )}
            </div>

            {/* 대형 재생 버튼 */}
            <div className="text-center mb-8">
              <button
                onClick={toggleAudio}
                disabled={audioLoading || !currentAudioUrl}
                className={`w-32 h-32 rounded-full text-5xl font-bold transition-all duration-300 shadow-2xl ${
                  audioLoading 
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : isPlaying
                    ? 'bg-gradient-to-r from-orange-500 to-orange-600 text-white hover:scale-105 animate-pulse'
                    : 'bg-gradient-to-r from-blue-500 to-blue-700 text-white hover:scale-105'
                }`}
              >
                {audioLoading ? '⏳' : isPlaying ? '⏸️' : '▶️'}
              </button>
              <div className="text-lg text-gray-600 mt-4">
                {audioLoading ? '음성 로딩 중...' : 
                 audioError ? '음성 로딩 실패' :
                 isPlaying ? '재생 중...' : 
                 '원문 재생'}
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
              
              {showOriginalText && currentSegment && (
                <div className="mt-4 p-6 bg-yellow-50 border-2 border-yellow-200 rounded-xl">
                  <p className="text-lg text-gray-800 leading-relaxed">
                    {selectedProblem?.id === 'JEIBOYr3vC5dHfRDG9u1' 
                      ? (currentSegment as any)?.chinese_text || '원문 데이터가 없습니다.'
                      : currentSegment?.korean_text || '원문 데이터가 없습니다.'}
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
              
              {showLearningMaterials && currentSegment && (
                <div className="mt-4 p-6 bg-green-50 border-2 border-green-200 rounded-xl">
                  {/* 핵심 어휘 */}
                  {currentSegment.key_vocabulary.length > 0 && (
                    <div className="mb-4">
                      <h4 className="font-bold text-green-800 mb-2">핵심 어휘:</h4>
                      {currentSegment.key_vocabulary.slice(0, 3).map((vocab, index) => (
                        <div key={index} className="mb-2">
                          • {vocab.chinese} ({vocab.pinyin}) - {vocab.korean}
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
                🎙️ {sourceLanguage === 'ko' ? '중국어' : '한국어'}로 통역해보세요
              </h3>
            </div>

            {/* 대형 녹음 버튼 */}
            <div className="text-center mb-8">
              <button
                onClick={toggleRecording}
                className={`w-32 h-32 rounded-full text-5xl font-bold transition-all duration-300 shadow-2xl ${
                  isRecording
                    ? 'bg-gradient-to-r from-red-500 to-red-600 text-white animate-pulse hover:scale-105'
                    : 'bg-gradient-to-r from-blue-500 to-blue-700 text-white hover:scale-105'
                }`}
              >
                {isRecording ? '⏹️' : '🎙️'}
              </button>
              
              {/* 타이머 */}
              <div className="text-4xl font-mono font-bold text-gray-700 mt-4">
                {formatTime(recordingTime)}
              </div>
              
              <div className="text-lg text-gray-600 mt-2">
                {isRecording ? `녹음 중... ${sourceLanguage === 'ko' ? '중국어' : '한국어'}로 말해주세요` : '녹음 버튼을 눌러 시작하세요'}
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

                {/* 다음 세그먼트 버튼 */}
                <div className="text-center">
                  <button
                    onClick={() => {
                      // 다음 세그먼트로 이동 또는 완료
                      if (selectedSegmentIndex < (selectedProblem?.segments.length || 1) - 1) {
                        setSelectedSegmentIndex(prev => prev + 1);
                        setCurrentStep(1);
                        setAccumulatedText('');
                        setCurrentText('');
                        setAnalysisResult(null);
                        setRecordingTime(0);
                      } else {
                        alert('모든 세그먼트를 완료했습니다! 🎉');
                      }
                    }}
                    className="px-8 py-4 bg-gradient-to-r from-green-500 to-green-700 text-white font-semibold text-lg rounded-xl hover:from-green-600 hover:to-green-800 transition-all duration-300 shadow-lg hover:shadow-xl hover:-translate-y-1"
                  >
                    ✨ {selectedSegmentIndex < (selectedProblem?.segments.length || 1) - 1 ? '다음 세그먼트' : '연습 완료'}
                  </button>
                </div>
              </div>
            )}

            {/* 네비게이션 버튼 */}
            <div className="flex gap-4 mt-8">
              <button
                onClick={() => goToStep(2)}
                className="flex-1 py-4 px-6 bg-gray-200 text-gray-700 font-semibold rounded-xl hover:bg-gray-300 transition-all duration-300"
              >
                ← 이전: 다시 녹음
              </button>
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