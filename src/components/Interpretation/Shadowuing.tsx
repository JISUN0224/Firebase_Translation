import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
// @ts-ignore
import * as speechsdk from 'microsoft-cognitiveservices-speech-sdk';

interface NewsSegment {
  id: number;
  start_time: string;
  end_time: string;
  text: string;
  pinyin: string;
}

// 1. 인터페이스 및 헬퍼 함수들 (컴포넌트 바깥에 위치)
interface PhonemeResult {
  phoneme: string;
  accuracyScore: number;
  offset: number;
  duration: number;
}
interface SyllableResult {
  syllable: string;
  accuracyScore: number;
  offset: number;
  duration: number;
  phonemes?: PhonemeResult[];
}
interface WordResult {
  word: string;
  accuracyScore: number;
  errorType: 'None' | 'Omission' | 'Insertion' | 'Mispronunciation' | 'UnexpectedBreak';
  syllables?: SyllableResult[];
  phonemes?: PhonemeResult[];
  offset: number;
  duration: number;
}
interface PronunciationResult {
  accuracyScore: number;
  fluencyScore: number;
  completenessScore: number;
  prosodyScore: number;
  words: WordResult[];
}

const analyzePronunciationResult = (jsonResult: any): PronunciationResult => {
  const pronunciationAssessment = jsonResult.NBest?.[0]?.PronunciationAssessment || {};
  const words: WordResult[] = (jsonResult.NBest?.[0]?.Words || []).map((word: any): WordResult => ({
    word: word.Word,
    accuracyScore: word.PronunciationAssessment?.AccuracyScore || 0,
    errorType: word.PronunciationAssessment?.ErrorType || 'None',
    syllables: word.Syllables?.map((syl: any): SyllableResult => ({
      syllable: syl.Syllable,
      accuracyScore: syl.PronunciationAssessment?.AccuracyScore || 0,
      offset: syl.Offset || 0,
      duration: syl.Duration || 0,
      phonemes: syl.Phonemes?.map((ph: any): PhonemeResult => ({
        phoneme: ph.Phoneme,
        accuracyScore: ph.PhonemeAssessment?.AccuracyScore || 0,
        offset: ph.Offset || 0,
        duration: ph.Duration || 0
      })) || []
    })) || [],
    phonemes: word.Phonemes?.map((ph: any): PhonemeResult => ({
      phoneme: ph.Phoneme,
      accuracyScore: ph.PronunciationAssessment?.AccuracyScore || 0,
      offset: ph.Offset || 0,
      duration: ph.Duration || 0
    })) || [],
    offset: word.Offset || 0,
    duration: word.Duration || 0
  }));
  return {
    accuracyScore: pronunciationAssessment.AccuracyScore || 0,
    fluencyScore: pronunciationAssessment.FluencyScore || 0,
    completenessScore: pronunciationAssessment.CompletenessScore || 0,
    prosodyScore: pronunciationAssessment.ProsodyScore || 0,
    words
  };
};
const getScoreColor = (score: number): string => {
  if (score >= 90) return 'text-green-600 bg-green-50 border-green-200';
  if (score >= 80) return 'text-blue-600 bg-blue-50 border-blue-200';
  if (score >= 70) return 'text-yellow-600 bg-yellow-50 border-yellow-200';
  if (score >= 60) return 'text-orange-600 bg-orange-50 border-orange-200';
  return 'text-red-600 bg-red-50 border-red-200';
};
const getErrorTypeInKorean = (errorType: string): string => {
  switch (errorType) {
    case 'Omission': return '누락';
    case 'Insertion': return '삽입';
    case 'Mispronunciation': return '잘못된 발음';
    case 'UnexpectedBreak': return '예상치 못한 중단';
    default: return '정상';
  }
};

// RadarChartProps 및 RadarChart 컴포넌트 추가 (ShadowingPractice.tsx에서 이식)
interface RadarChartProps {
  data: {
    accuracy: number;
    fluency: number;
    completeness: number;
    prosody: number;
    confidence: number; // 5번째 축: 자신감
  };
  size?: number;
}
const RadarChart: React.FC<RadarChartProps> = ({ data, size = 300 }) => {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const [animationProgress, setAnimationProgress] = useState(0);

  useEffect(() => {
    const startTime = Date.now();
    const duration = 1200;
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easeProgress = 1 - Math.pow(1 - progress, 3);
      setAnimationProgress(easeProgress);
      if (progress < 1) requestAnimationFrame(animate);
    };
    animate();
  }, [data]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const centerX = size / 2;
    const centerY = size / 2;
    const radius = size * 0.35;
    // 5개 축(정확도, 유창성, 완성도, 억양, 자신감)
    const axes = [
      { label: '정확도', angle: -Math.PI / 2, key: 'accuracy' },
      { label: '유창성', angle: -Math.PI / 2 + (2 * Math.PI) / 5, key: 'fluency' },
      { label: '완성도', angle: -Math.PI / 2 + (4 * Math.PI) / 5, key: 'completeness' },
      { label: '억양', angle: -Math.PI / 2 + (6 * Math.PI) / 5, key: 'prosody' },
      { label: '자신감', angle: -Math.PI / 2 + (8 * Math.PI) / 5, key: 'confidence' }
    ];
    ctx.clearRect(0, 0, size, size);
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1;
    for (let i = 1; i <= 5; i++) {
      const gridRadius = (radius * i) / 5;
      ctx.beginPath();
      axes.forEach((axis, index) => {
        const x = centerX + Math.cos(axis.angle) * gridRadius;
        const y = centerY + Math.sin(axis.angle) * gridRadius;
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.stroke();
    }
    ctx.strokeStyle = '#d1d5db';
    axes.forEach(axis => {
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.lineTo(centerX + Math.cos(axis.angle) * radius, centerY + Math.sin(axis.angle) * radius);
      ctx.stroke();
    });
    // 현재 데이터 그리기
    const gradient = ctx.createLinearGradient(centerX - radius, centerY - radius, centerX + radius, centerY + radius);
    gradient.addColorStop(0, 'rgba(59, 130, 246, 0.3)');
    gradient.addColorStop(1, 'rgba(147, 51, 234, 0.3)');
    ctx.strokeStyle = '#3b82f6';
    ctx.fillStyle = gradient;
    ctx.lineWidth = 3;
    ctx.beginPath();
    axes.forEach((axis, index) => {
      let value = data[axis.key as keyof typeof data];
      value = Math.min(value, 100);
      const normalizedValue = (value / 100) * animationProgress;
      const x = centerX + Math.cos(axis.angle) * radius * normalizedValue;
      const y = centerY + Math.sin(axis.angle) * radius * normalizedValue;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // 데이터 포인트 그리기
    axes.forEach(axis => {
      let value = data[axis.key as keyof typeof data];
      value = Math.min(value, 100);
      const normalizedValue = (value / 100) * animationProgress;
      const x = centerX + Math.cos(axis.angle) * radius * normalizedValue;
      const y = centerY + Math.sin(axis.angle) * radius * normalizedValue;
      ctx.fillStyle = '#3b82f6';
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, 2 * Math.PI);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
    });
    // 축 라벨 그리기
    ctx.fillStyle = '#374151';
    ctx.font = 'bold 12px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    axes.forEach(axis => {
      const labelX = centerX + Math.cos(axis.angle) * (radius + 25);
      const labelY = centerY + Math.sin(axis.angle) * (radius + 25);
      ctx.fillText(axis.label, labelX, labelY);
      ctx.font = '10px Inter, sans-serif';
      ctx.fillStyle = '#6b7280';
      const score = Math.round(data[axis.key as keyof typeof data] * animationProgress);
      ctx.fillText(`${score}`, labelX, labelY + 15);
    });
  }, [data, size, animationProgress]);
  return (
    <div className="flex flex-col items-center">
      <canvas 
        ref={canvasRef}
        width={size}
        height={size}
        className="drop-shadow-lg"
        style={{ width: `${size}px`, height: `${size}px` }}
      />
      <div className="mt-4 text-center">
        <div className="text-sm text-gray-600">발음 프로필</div>
      </div>
    </div>
  );
};

// 상세 에러 분석 인터페이스
interface DetailedErrorAnalysis {
  errorType: string;
  problematicPhonemes: string[];
  errorCategory: 'tone' | 'consonant' | 'vowel' | 'rhythm';
  severity: 'low' | 'medium' | 'high';
  koreanPattern: string;
  improvementMethod: string;
  practiceExample: string;
}
// 한국인 특화 음소/성조 에러 분석 함수
const analyzePhonemeErrors = (word: WordResult): DetailedErrorAnalysis => {
  const problematicPhonemes = word.phonemes?.filter(p => p.accuracyScore < 70).map(p => p.phoneme) || [];
  // zh/ch/sh
  if (problematicPhonemes.includes('zh')) {
    return {
      errorType: word.errorType,
      problematicPhonemes: ['zh'],
      errorCategory: 'consonant',
      severity: 'high',
      koreanPattern: '권설음을 설치음(z)으로 발음하는 경향',
      improvementMethod: '혀를 뒤로 말아서 "쥐" 소리 내기 연습',
      practiceExample: 'zhōng guó(중국) 천천히 5번 반복'
    };
  }
  if (problematicPhonemes.includes('ü')) {
    return {
      errorType: word.errorType,
      problematicPhonemes: ['ü'],
      errorCategory: 'vowel',
      severity: 'high',
      koreanPattern: 'ü 발음을 u로 혼동',
      improvementMethod: '입술을 앞으로 내밀고 "위" 소리 내기',
      practiceExample: 'lǜ(녹색), nǚ(여자) 반복 연습'
    };
  }
  if (problematicPhonemes.includes('r')) {
    return {
      errorType: word.errorType,
      problematicPhonemes: ['r'],
      errorCategory: 'consonant',
      severity: 'medium',
      koreanPattern: 'r 발음이 약하거나 l로 대체',
      improvementMethod: '혀끝을 입천장에 대지 않고 "르" 소리 내기',
      practiceExample: 'rén(사람), rì(날) 반복 연습'
    };
  }
  // 성조 문제
  if (word.errorType === 'Mispronunciation' && word.accuracyScore < 60) {
    return {
      errorType: 'Mispronunciation',
      problematicPhonemes: [],
      errorCategory: 'tone',
      severity: 'high',
      koreanPattern: '성조 구분 실패',
      improvementMethod: '손으로 성조 곡선 그리며 연습',
      practiceExample: '1성(평), 2성(올림), 3성(V자), 4성(내림) 각각 5번씩'
    };
  }
  // 기타: 경미한 오류
  if (problematicPhonemes.length > 0) {
    return {
      errorType: word.errorType,
      problematicPhonemes,
      errorCategory: 'consonant',
      severity: 'medium',
      koreanPattern: '일부 음소 정확도 부족',
      improvementMethod: '문제 음소를 천천히 반복 연습',
      practiceExample: `${problematicPhonemes.join(', ')} 발음 10회 반복`
    };
  }
  // 정상
  return {
    errorType: word.errorType,
    problematicPhonemes: [],
    errorCategory: 'consonant',
    severity: 'low',
    koreanPattern: '',
    improvementMethod: '',
    practiceExample: ''
  };
};

const Shadowuing: React.FC = () => {
  const navigate = useNavigate();
  const [language, setLanguage] = useState<'ko-KR' | 'zh-CN'>('zh-CN');
  const [showText, setShowText] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentText, setCurrentText] = useState('');
  const [newsData, setNewsData] = useState<NewsSegment[]>([]);
  const [currentCharIndex, setCurrentCharIndex] = useState(0);
  const player = useRef<HTMLAudioElement | null>(null);

  // 음성 인식 관련
  const speechConfig = useRef<any>(null);
  const audioConfig = useRef<any>(null);
  const recognizer = useRef<any>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedText, setRecordedText] = useState('');
  const [realTimeText, setRealTimeText] = useState('');
  const [allRecognizedSegments, setAllRecognizedSegments] = useState<string[]>([]);
  // 고급 발음 평가 상태
  const [currentEvaluation, setCurrentEvaluation] = useState<PronunciationResult | null>(null);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  // 샘플 텍스트 (실제로는 DB나 API에서 가져올 것)
  const sampleTexts = {
    'ko-KR': '안녕하세요. 오늘은 날씨가 참 좋네요.',
    'zh-CN': '你好。今天天气真不错。'
  };

  // 뉴스 데이터 로드
  useEffect(() => {
    const loadNewsData = async () => {
      try {
        const response = await fetch('/xinwenlianbo_01.json');
        const data = await response.json();
        setNewsData(data);
        const fullText = data.map((segment: NewsSegment) => segment.text).join('');
        setCurrentText(fullText);
      } catch (error) {
        console.error('뉴스 데이터 로드 실패:', error);
      }
    };
    loadNewsData();
  }, []);

  // 시간 문자열을 초로 변환
  const timeToSeconds = (timeStr: string): number => {
    const parts = timeStr.split(':');
    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    const secondsParts = parts[2].split(',');
    const seconds = parseInt(secondsParts[0], 10);
    const milliseconds = parseInt(secondsParts[1], 10) / 1000;
    return hours * 3600 + minutes * 60 + seconds + milliseconds;
  };

  // 현재 재생 중인 세그먼트 찾기
  const getCurrentSegment = (currentTime: number) => {
    return newsData.find(segment => {
      const start = timeToSeconds(segment.start_time);
      const end = timeToSeconds(segment.end_time);
      return currentTime >= start && currentTime <= end;
    });
  };

  // 세그먼트 내 진행률 계산 (0~1)
  const getProgressInSegment = (currentTime: number, segment: NewsSegment) => {
    const start = timeToSeconds(segment.start_time);
    const end = timeToSeconds(segment.end_time);
    const duration = end - start;
    const elapsed = currentTime - start;
    return Math.min(Math.max(elapsed / duration, 0), 1);
  };

  // 전체 텍스트에서의 글자 인덱스 계산
  const calculateCharIndex = (currentTime: number) => {
    const currentSegment = getCurrentSegment(currentTime);
    if (!currentSegment) return 0;
    const previousSegmentsLength = newsData
      .filter(segment => segment.id < currentSegment.id)
      .reduce((total, segment) => total + segment.text.length, 0);
    const progress = getProgressInSegment(currentTime, currentSegment);
    const charInSegment = Math.floor(progress * currentSegment.text.length);
    return previousSegmentsLength + charInSegment;
  };

  // 실시간 하이라이트 업데이트
  useEffect(() => {
    if (!player.current || !isPlaying || !newsData.length || !currentText) return;
    const updateHighlight = () => {
      const currentTime = player.current?.currentTime || 0;
      const newCharIndex = calculateCharIndex(currentTime);
      setCurrentCharIndex(newCharIndex);
    };
    const interval = setInterval(updateHighlight, 100);
    return () => clearInterval(interval);
  }, [isPlaying, newsData, currentText]);

  // 오디오 컨트롤
  const toggleAudio = () => {
    if (!player.current) return;
    if (isPlaying) {
      player.current.pause();
      setIsPlaying(false);
    } else {
      setIsPlaying(true);
      setCurrentCharIndex(0);
      player.current.play();
    }
  };

  // Azure Speech 초기화
  const initializeAzureSpeech = async () => {
    try {
      const subscriptionKey = import.meta.env.VITE_AZURE_SPEECH_KEY;
      const region = import.meta.env.VITE_AZURE_SPEECH_REGION;
      const endpoint = import.meta.env.VITE_AZURE_SPEECH_ENDPOINT;
      if (!subscriptionKey || !region) {
        alert('Azure Speech Service 설정이 필요합니다. .env 파일을 확인해주세요.');
        return;
      }
      speechConfig.current = endpoint
        ? speechsdk.SpeechConfig.fromEndpoint(new URL(endpoint), subscriptionKey)
        : speechsdk.SpeechConfig.fromSubscription(subscriptionKey, region);
      speechConfig.current.speechRecognitionLanguage = language;
    } catch (error) {
      alert('음성 서비스 초기화에 실패했습니다. 설정을 확인해주세요.');
    }
  };

  // 마이크 권한 확인
  const checkMicrophonePermission = async (): Promise<boolean> => {
    try {
      if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
        throw new Error('마이크 접근은 HTTPS 또는 localhost 환경에서만 가능합니다.');
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());
      return true;
    } catch (error) {
      alert('마이크 접근 권한이 필요합니다.');
      return false;
    }
  };

  // 상세 분석 결과 표시 컴포넌트
  const renderDetailedAnalysis = () => {
    if (!currentEvaluation) return null;
    const { accuracyScore, fluencyScore, completenessScore, prosodyScore, words } = currentEvaluation;
    // 망설임 횟수: 인식된 문장 수 - 1 (최소 0)
    const pauseCount = Math.max(0, allRecognizedSegments.length - 1);
    // 자신감 점수: 100 - pauseCount*10 (최소 0)
    const confidenceScore = Math.max(0, 100 - pauseCount * 10);
    // 피드백 분석 (강점, 개선점, 문제 단어, 조언 등)
    const strongPoints: string[] = [];
    const improvementAreas: string[] = [];
    if (accuracyScore >= 80) strongPoints.push('정확한 발음');
    else if (accuracyScore < 60) improvementAreas.push('기본 발음 정확성');
    if (fluencyScore >= 80) strongPoints.push('좋은 유창성');
    else if (fluencyScore < 60) improvementAreas.push('말하기 속도와 리듬');
    if (completenessScore >= 80) strongPoints.push('완전한 문장 구사');
    else if (completenessScore < 60) improvementAreas.push('문장 완성도');
    if (prosodyScore >= 80) strongPoints.push('자연스러운 억양');
    else if (prosodyScore < 60) improvementAreas.push('성조와 억양');
    const problematicWords = words.filter(w => w.accuracyScore < 70).map(w => w.word);
    // 점수별 맞춤 조언
    let scoreAdvice = '';
    const avgScore = (accuracyScore + fluencyScore + completenessScore + prosodyScore) / 4;
    if (avgScore >= 90) scoreAdvice = '원어민 수준에 근접했습니다! 다양한 주제로 연습을 확장해보세요.';
    else if (avgScore >= 80) scoreAdvice = '매우 좋은 발음이에요. 성조와 억양을 조금 더 다듬으면 완벽해질 것 같아요.';
    else if (avgScore >= 70) scoreAdvice = '좋은 발음이지만 몇 가지 개선점이 있어요. 성조와 음소 구분을 연습해보세요.';
    else if (avgScore >= 60) scoreAdvice = '기본기는 갖추었지만 더 많은 연습이 필요해요. 성조와 기본 음소를 반복 연습하세요.';
    else if (avgScore >= 40) scoreAdvice = '발음에 상당한 개선이 필요합니다. 성조와 기본 음소부터 차근차근 연습해보세요.';
    else scoreAdvice = '기초부터 다시 시작하는 것을 권장합니다. 성조와 기본 음소의 개념부터 학습하세요.';
    return (
      <div className="mt-6 space-y-4">
        {/* 5각형 레이더차트 시각화 */}
        <RadarChart
          data={{
            accuracy: accuracyScore,
            fluency: fluencyScore,
            completeness: completenessScore,
            prosody: prosodyScore,
            confidence: confidenceScore
          }}
          size={280}
        />
        {/* 기존 종합 점수 테이블 유지 */}
        <div className="bg-gray-50 rounded-lg p-4 border">
          <h3 className="text-lg font-bold text-gray-800 mb-3">📊 세부 점수</h3>
          <div className="grid grid-cols-5 gap-3">
            <div className={`text-center p-3 rounded-lg border ${getScoreColor(accuracyScore)}`}>
              <div className="text-xl font-bold">{accuracyScore.toFixed(1)}</div>
              <div className="text-xs">정확도</div>
            </div>
            <div className={`text-center p-3 rounded-lg border ${getScoreColor(fluencyScore)}`}>
              <div className="text-xl font-bold">{fluencyScore.toFixed(1)}</div>
              <div className="text-xs">유창성</div>
            </div>
            <div className={`text-center p-3 rounded-lg border ${getScoreColor(completenessScore)}`}>
              <div className="text-xl font-bold">{completenessScore.toFixed(1)}</div>
              <div className="text-xs">완전성</div>
            </div>
            <div className={`text-center p-3 rounded-lg border ${getScoreColor(prosodyScore)}`}>
              <div className="text-xl font-bold">{prosodyScore.toFixed(1)}</div>
              <div className="text-xs">억양</div>
            </div>
            <div className="text-center p-3 rounded-lg border border-blue-200 bg-blue-50 text-blue-700">
              <div className="text-xl font-bold">{pauseCount}</div>
              <div className="text-xs">망설임 횟수</div>
            </div>
          </div>
        </div>
        {/* 단어/음절/음소 상세 분석 */}
        <div className="bg-white rounded-lg p-4 border border-gray-200">
          <h3 className="text-lg font-bold text-gray-800 mb-3">🔍 단어별 상세 분석</h3>
          <div className="space-y-3 max-h-80 overflow-y-auto">
            {words.map((word, index) => {
              const errorAnalysis = analyzePhonemeErrors(word);
              return (
                <div key={index} className={`rounded-lg p-4 border-2 ${
                  errorAnalysis.severity === 'high' ? 'bg-red-50 border-red-300' :
                  errorAnalysis.severity === 'medium' ? 'bg-orange-50 border-orange-300' :
                  'bg-green-50 border-green-200'
                }`}>
                  {/* 기존 단어 정보 */}
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-lg font-medium">{word.word}</span>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-1 rounded-full text-sm font-medium border ${getScoreColor(word.accuracyScore)}`}>{word.accuracyScore.toFixed(1)}점</span>
                      {word.errorType !== 'None' && (
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          errorAnalysis.severity === 'high' ? 'bg-red-200 text-red-800' :
                          errorAnalysis.severity === 'medium' ? 'bg-orange-200 text-orange-800' :
                          'bg-yellow-200 text-yellow-800'
                        }`}>
                          {getErrorTypeInKorean(word.errorType)}
                        </span>
                      )}
                    </div>
                  </div>
                  {/* 🔥 새로 추가: 구체적 에러 분석 */}
                  {word.errorType !== 'None' && errorAnalysis.severity !== 'low' && (
                    <div className="bg-white rounded-lg p-3 border border-gray-200 mb-3">
                      <div className="grid md:grid-cols-2 gap-3">
                        <div>
                          <h5 className="text-sm font-semibold text-gray-700 mb-1">🔍 문제 분석</h5>
                          <p className="text-sm text-gray-600">{errorAnalysis.koreanPattern}</p>
                          {errorAnalysis.problematicPhonemes.length > 0 && (
                            <div className="mt-1">
                              <span className="text-xs text-red-600">문제 음소: </span>
                              {errorAnalysis.problematicPhonemes.map(phoneme => (
                                <span key={phoneme} className="text-xs bg-red-100 text-red-700 px-1 rounded mr-1">
                                  {phoneme}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <div>
                          <h5 className="text-sm font-semibold text-gray-700 mb-1">💡 개선 방법</h5>
                          <p className="text-sm text-blue-600">{errorAnalysis.improvementMethod}</p>
                          <p className="text-xs text-blue-500 mt-1">{errorAnalysis.practiceExample}</p>
                        </div>
                      </div>
                    </div>
                  )}
                  {/* 기존 음절/음소 분석 유지 */}
                  {word.syllables && word.syllables.length > 0 && (
                    <div className="mb-2">
                      <h5 className="text-sm font-medium text-gray-600 mb-1">음절:</h5>
                      <div className="flex flex-wrap gap-1">
                        {word.syllables.map((syllable, sIndex) => (
                          <span
                            key={sIndex}
                            className={`px-2 py-1 rounded text-sm border ${getScoreColor(syllable.accuracyScore)}`}
                            title={`${syllable.syllable}: ${syllable.accuracyScore.toFixed(1)}점`}
                          >
                            {syllable.syllable}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {word.phonemes && word.phonemes.length > 0 && (
                    <div>
                      <h5 className="text-sm font-medium text-gray-600 mb-1">음소:</h5>
                      <div className="flex flex-wrap gap-1">
                        {word.phonemes.map((phoneme, pIndex) => (
                          <span
                            key={pIndex}
                            className={`px-1 py-0.5 rounded text-xs font-mono border ${getScoreColor(phoneme.accuracyScore)}`}
                            title={`${phoneme.phoneme}: ${phoneme.accuracyScore.toFixed(1)}점`}
                          >
                            {phoneme.phoneme}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        {/* 맞춤형 학습 조언 */}
        <div className="bg-white rounded-lg p-6 border border-gray-200 mt-6">
          <h3 className="text-lg font-bold text-gray-800 mb-4">💡 맞춤형 학습 조언</h3>
          <div className="text-blue-700 font-semibold mb-2">{scoreAdvice}</div>
        </div>
        {/* 강점과 개선점 */}
        <div className="grid md:grid-cols-2 gap-4 mt-6">
          {/* 강점 */}
          {strongPoints.length > 0 && (
            <div className="bg-green-50 rounded-lg p-4 border border-green-200">
              <h4 className="font-bold text-green-800 mb-3">✨ 잘하고 있는 부분</h4>
              <div className="space-y-2">
                {strongPoints.map((point, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <span className="text-green-500">✓</span>
                    <span className="text-green-700">{point}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {/* 개선점 */}
          {improvementAreas.length > 0 && (
            <div className="bg-orange-50 rounded-lg p-4 border border-orange-200">
              <h4 className="font-bold text-orange-800 mb-3">📈 개선이 필요한 부분</h4>
              <div className="space-y-2">
                {improvementAreas.map((area, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <span className="text-orange-500">▲</span>
                    <span className="text-orange-700">{area}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        {/* 문제 단어 집중 분석 */}
        {problematicWords.length > 0 && (
          <div className="bg-yellow-50 rounded-lg p-6 border border-yellow-200 mt-6">
            <h3 className="text-lg font-bold text-yellow-800 mb-4">🔍 집중 연습이 필요한 단어들</h3>
            <div className="flex flex-wrap gap-2 mb-4">
              {problematicWords.map((word, index) => (
                <span key={index} className="px-3 py-1 bg-yellow-200 text-yellow-800 rounded-full text-sm font-medium">
                  {word}
                </span>
              ))}
            </div>
            <div className="text-sm text-yellow-700">
              <p><strong>연습 방법:</strong> 위 단어들을 개별적으로 천천히 반복 연습한 후, 문장 안에서 자연스럽게 발음해보세요.</p>
            </div>
          </div>
        )}
      </div>
    );
  };

  // 녹음 시작
  const startRecording = async () => {
    if (!speechConfig.current) return;
    try {
      if (recognizer.current) {
        try {
          await recognizer.current.stopContinuousRecognitionAsync();
          recognizer.current.close();
        } catch {}
      }
      const hasMicPermission = await checkMicrophonePermission();
      if (!hasMicPermission) return;
      // MediaRecorder로 브라우저에 음성 녹음 시작
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      recordedChunksRef.current = [];
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunksRef.current.push(e.data);
      };
      mediaRecorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: 'audio/webm' });
        if (recordedAudioUrl) URL.revokeObjectURL(recordedAudioUrl);
        setRecordedAudioUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach(track => track.stop());
      };
      mediaRecorder.start();
      mediaRecorderRef.current = mediaRecorder;
      audioConfig.current = speechsdk.AudioConfig.fromDefaultMicrophoneInput();
      const referenceText = currentText || sampleTexts[language];
      const pronunciationConfig = new speechsdk.PronunciationAssessmentConfig(
        referenceText,
        speechsdk.PronunciationAssessmentGradingSystem.HundredMark,
        speechsdk.PronunciationAssessmentGranularity.Phoneme,
        true
      );
      pronunciationConfig.enableProsodyAssessment = true;
      recognizer.current = new speechsdk.SpeechRecognizer(
        speechConfig.current,
        audioConfig.current
      );
      pronunciationConfig.applyTo(recognizer.current);
      recognizer.current.recognized = (s: unknown, e: any) => {
        const result = e.result;
        if (result.reason === speechsdk.ResultReason.RecognizedSpeech && result.text.trim()) {
          setAllRecognizedSegments((prev: string[]) => {
            if (prev.length === 0 || prev[prev.length - 1] !== result.text.trim()) {
              return [...prev, result.text.trim()];
            }
            return prev;
          });
          setRecordedText((prev: string) => prev ? `${prev} ${result.text.trim()}` : result.text.trim());
          setRealTimeText('');
          let jsonResponse = null;
          try {
            jsonResponse = JSON.parse(
              result.properties.getProperty(
                speechsdk.PropertyId.SpeechServiceResponse_JsonResult
              )
            );
            const analysis = analyzePronunciationResult(jsonResponse);
            setCurrentEvaluation(analysis);
            console.log('🎯 분석 결과:', analysis);
            console.log('📄 Azure 원본:', jsonResponse);
            console.log('📊 단어 수:', analysis.words.length);
          } catch (error) {
            console.error('발음 분석 오류:', error);
            console.error('원본 응답:', jsonResponse);
          }
        }
      };
      recognizer.current.recognizing = (s: unknown, e: any) => {
        const result = e.result;
        if (result.text && result.text.trim()) {
          setRealTimeText(result.text.trim());
        }
      };
      setIsRecording(true);
      setAllRecognizedSegments([]);
      setRecordedText('');
      setRealTimeText('');
      setCurrentEvaluation(null);
      setRecordedAudioUrl(null); // 새 녹음 시작 시 이전 오디오 URL 제거
      await recognizer.current.startContinuousRecognitionAsync();
    } catch (error) {
      alert('녹음을 시작할 수 없습니다.');
      setIsRecording(false);
    }
  };

  // 녹음 중지
  const stopRecording = async () => {
    if (!recognizer.current) return;
    try {
      await recognizer.current.stopContinuousRecognitionAsync();
      setIsRecording(false);
      // MediaRecorder 녹음 중지
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      // 녹음이 끝나면 상세 분석 자동 표시
      if (currentEvaluation) {
        setShowAnalysis(true);
      }
    } catch {
      alert('녹음 중지 중 오류가 발생했습니다.');
    }
  };

  // 텍스트 표시
  const getDisplayText = () => {
    const confirmedText = recordedText || '';
    const liveText = realTimeText || '';
    if (confirmedText && liveText) {
      return `${confirmedText} ${liveText}`;
    }
    return confirmedText || liveText || '';
  };

  // 텍스트 렌더링
  const renderRecognizedText = () => {
    const displayText = getDisplayText();
    if (!displayText) {
      return (
        <div className="text-gray-500 text-center py-8">
          {isRecording ? '🎤 말씀하세요...' : '녹음을 시작하세요'}
        </div>
      );
    }
    return (
      <div className="space-y-4">
        <div className="bg-blue-50 rounded-lg p-4 min-h-[100px]">
          <h4 className="text-sm font-medium text-gray-700 mb-2">
            {isRecording ? '🔄 실시간 인식 중...' : '✅ 인식 완료'}
          </h4>
          <p className="text-lg text-gray-800 leading-relaxed">
            <span className="text-gray-800">{recordedText}</span>
            {realTimeText && (
              <span className="text-blue-600 ml-1 animate-pulse">{realTimeText}</span>
            )}
          </p>
          <div className="mt-2 text-xs text-gray-500 flex justify-between">
            <span>총 글자: {displayText.length}자</span>
          </div>
        </div>
        {/* 상세 분석 버튼 없이, 평가 결과가 있으면 바로 피드백 표시 */}
        {currentEvaluation && renderDetailedAnalysis()}
        {/* 녹음이 끝나면 다시 듣기 버튼 표시 */}
        {recordedAudioUrl && !isRecording && (
          <div className="flex flex-col items-center mt-4">
            <div className="font-bold text-base text-gray-700 mb-1">내 셰도잉 다시 듣기</div>
            <audio controls src={recordedAudioUrl} />
            <div className="text-xs text-gray-500 mt-1">(이 오디오는 브라우저에만 임시 저장됩니다)</div>
          </div>
        )}
      </div>
    );
  };

  // 한자+병음 하이라이트 렌더링
  const renderTextWithPinyin = () => {
    if (!currentText || !newsData.length) return null;
    let charIndex = 0;
    return (
      <div className="bg-gray-50 rounded-lg p-4 leading-relaxed">
        {newsData.map((segment, segmentIndex) => {
          const segmentText = segment.text;
          const segmentPinyin = segment.pinyin
            .replace(/[,。，；：！？"”'《》]/g, '')
            .split(/\s+/)
            .filter(p => p.trim() !== '');
          const segmentElements = segmentText.split('').map((char, localIndex) => {
            const globalIndex = charIndex + localIndex;
            const isHighlighted = globalIndex === currentCharIndex;
            const isPast = globalIndex < currentCharIndex;
            if (/[  -  ]/.test(char)) {
              return (
                <span key={`${segmentIndex}-${localIndex}`}>{char}</span>
              );
            }
            if (/[  -  ]/.test(char)) {
              return (
                <span key={`${segmentIndex}-${localIndex}`}>{char}</span>
              );
            }
            if (/[  -  ]/.test(char)) {
              return (
                <span key={`${segmentIndex}-${localIndex}`}>{char}</span>
              );
            }
            if (/[  -  ]/.test(char)) {
              return (
                <span key={`${segmentIndex}-${localIndex}`}>{char}</span>
              );
            }
            if (/[  -  ]/.test(char)) {
              return (
                <span key={`${segmentIndex}-${localIndex}`}>{char}</span>
              );
            }
            if (/[  -  ]/.test(char)) {
              return (
                <span key={`${segmentIndex}-${localIndex}`}>{char}</span>
              );
            }
            if (/[  -  ]/.test(char)) {
              return (
                <span key={`${segmentIndex}-${localIndex}`}>{char}</span>
              );
            }
            if (/[  -  ]/.test(char)) {
              return (
                <span key={`${segmentIndex}-${localIndex}`}>{char}</span>
              );
            }
            if (/[  -  ]/.test(char)) {
              return (
                <span key={`${segmentIndex}-${localIndex}`}>{char}</span>
              );
            }
            if (/[  -  ]/.test(char)) {
              return (
                <span key={`${segmentIndex}-${localIndex}`}>{char}</span>
              );
            }
            if (/[  -  ]/.test(char)) {
              return (
                <span key={`${segmentIndex}-${localIndex}`}>{char}</span>
              );
            }
            if (/[  -  ]/.test(char)) {
              return (
                <span key={`${segmentIndex}-${localIndex}`}>{char}</span>
              );
            }
            if (/[  -  ]/.test(char)) {
              return (
                <span key={`${segmentIndex}-${localIndex}`}>{char}</span>
              );
            }
            if (/[  -  ]/.test(char)) {
              return (
                <span key={`${segmentIndex}-${localIndex}`}>{char}</span>
              );
            }
            if (/[  -  ]/.test(char)) {
              return (
                <span key={`${segmentIndex}-${localIndex}`}>{char}</span>
              );
            }
            if (/[  -  ]/.test(char)) {
              return (
                <span key={`${segmentIndex}-${localIndex}`}>{char}</span>
              );
            }
            if (/[  -  ]/.test(char)) {
              return (
                <span key={`${segmentIndex}-${localIndex}`}>{char}</span>
              );
            }
            if (/[  -  ]/.test(char)) {
              return (
                <span key={`${segmentIndex}-${localIndex}`}>{char}</span>
              );
            }
            if (/[  -  ]/.test(char)) {
              return (
                <span key={`${segmentIndex}-${localIndex}`}>{char}</span>
              );
            }
            if (/[  -  ]/.test(char)) {
              return (
                <span key={`${segmentIndex}-${localIndex}`}>{char}</span>
              );
            }
            if (/[  -  ]/.test(char)) {
              return (
                <span key={`${segmentIndex}-${localIndex}`}>{char}</span>
              );
            }
            if (/[  -  ]/.test(char)) {
              return (
                <span key={`${segmentIndex}-${localIndex}`}>{char}</span>
              );
            }
            // 한자인 경우
            if (/[  -  ]/.test(char)) {
              return (
                <span key={`${segmentIndex}-${localIndex}`}>{char}</span>
              );
            }
            // 한자인 경우
            const chineseIndex = segmentText.substring(0, localIndex + 1)
              .split('')
              .filter(c => /[\u4e00-\u9fff]/.test(c)).length - 1;
            const pinyin = segmentPinyin[chineseIndex] || '';
            return (
              <div 
                key={`${segmentIndex}-${localIndex}`}
                className={`inline-block text-center mx-0.5 transition-all duration-200 ${
                  isHighlighted
                    ? 'bg-yellow-300 text-black transform scale-110'
                    : isPast
                    ? 'bg-green-100 text-gray-800'
                    : 'text-gray-400'
                }`}
                style={{
                  transition: 'all 0.2s ease-in-out',
                  minWidth: '2rem',
                  fontFamily: '"Microsoft YaHei", "SimHei", "PingFang SC", "Hiragino Sans GB", "WenQuanYi Micro Hei", Arial, sans-serif',
                  fontWeight: 'normal',
                  textRendering: 'optimizeLegibility',
                  WebkitFontSmoothing: 'antialiased',
                  MozOsxFontSmoothing: 'grayscale'
                }}
              >
                <div className="text-2xl font-medium">{char}</div>
                <div className="text-xs text-blue-600 leading-tight" style={{ fontSize: '11px' }}>
                  {pinyin}
                </div>
              </div>
            );
          });
          charIndex += segmentText.length;
          return (
            <span key={segmentIndex} className="inline">
              {segmentElements}
              {segmentIndex < newsData.length - 1 && (
                <span className="inline-block w-4"></span>
              )}
            </span>
          );
        })}
      </div>
    );
  };

  // 컴포넌트 마운트 시 Azure 초기화
  useEffect(() => {
    initializeAzureSpeech();
    return () => {
      if (recognizer.current) {
        try {
          recognizer.current.stopContinuousRecognitionAsync();
          recognizer.current.close();
        } catch {}
      }
    };
  }, [language]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <div className="flex justify-between items-center mb-8">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-blue-600 hover:bg-white rounded-lg transition-all"
          >
            <span>🏠</span> 홈으로
          </button>
          <select
            value={language}
            onChange={e => setLanguage(e.target.value as 'ko-KR' | 'zh-CN')}
            className="px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="ko-KR">한국어</option>
            <option value="zh-CN">중국어</option>
          </select>
        </div>
        <div className="bg-white rounded-xl shadow-lg p-8">
          <h1 className="text-2xl font-bold text-gray-800 mb-6">🎯 뉴스 쉐도잉 연습</h1>
          <div className="mb-8">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold text-gray-700">연습 텍스트</h2>
              <button
                onClick={() => setShowText(!showText)}
                className="px-4 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
              >
                {showText ? '텍스트 숨기기' : '텍스트 보기'}
              </button>
            </div>
            {showText && (
              <div className="bg-gray-50 rounded-lg p-4">
                {language === 'zh-CN' && newsData.length > 0 ? (
                  renderTextWithPinyin()
                ) : (
                  <p className="text-2xl text-gray-800" style={{ fontFamily: '"Microsoft YaHei", "SimHei", "PingFang SC", "Hiragino Sans GB", "WenQuanYi Micro Hei", Arial, sans-serif', fontWeight: 'normal', textRendering: 'optimizeLegibility', WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale' }}>
                    {sampleTexts[language]}
                  </p>
                )}
              </div>
            )}
          </div>
          <div className="flex justify-center gap-4 mb-8">
            <button
              onClick={toggleAudio}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg shadow hover:bg-blue-700 transition-all"
            >
              {isPlaying ? '⏸️ 일시정지' : '▶️ 오디오 재생'}
            </button>
            <button
              onClick={isRecording ? stopRecording : startRecording}
              className={`px-6 py-2 rounded-lg shadow transition-all ${isRecording ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-green-500 text-white hover:bg-green-600'}`}
            >
              {isRecording ? '■ 분석 중지 및 평가' : '🎤 녹음 시작'}
            </button>
          </div>
          <div className="mb-8">
            {renderRecognizedText()}
          </div>
          <audio ref={player} src="/news_audio.mp3" preload="auto" onEnded={() => setIsPlaying(false)} style={{ display: 'none' }} />
        </div>
      </div>
    </div>
  );
};

export default Shadowuing; 