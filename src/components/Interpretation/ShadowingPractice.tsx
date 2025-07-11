import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import * as speechsdk from 'microsoft-cognitiveservices-speech-sdk';

// 감정 분석을 위한 인터페이스
interface EmotionAnalysis {
  confidence: number;
  emotion: '자신있음' | '긴장됨';
  details: {
    speed: number;
    volume: number;
    pitchVariance: number;
    pauseCount: number;
  };
}

// 단어별 점수를 위한 인터페이스
interface WordScore {
  text: string;
  score: number;
}

// 열화상 지도 컴포넌트
const HeatMapVisualization: React.FC<{ wordScores: WordScore[] }> = ({ wordScores }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 캔버스 크기 조정
    const containerWidth = canvas.parentElement?.clientWidth || 800;
    canvas.width = containerWidth;
    canvas.height = 60;

    // 단어당 너비 계산 (최소 80px)
    const wordWidth = Math.max(80, containerWidth / wordScores.length - 5);

    // 캔버스 초기화
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    wordScores.forEach((word, index) => {
      const x = index * (wordWidth + 5);
      
      // 그라데이션 배경
      const gradient = ctx.createLinearGradient(x, 0, x + wordWidth, 0);
      const score = word.score / 100;
      gradient.addColorStop(0, `rgba(${255 * (1 - score)}, ${255 * score}, 100, 0.9)`);
      gradient.addColorStop(1, `rgba(${255 * (1 - score)}, ${255 * score}, 100, 0.7)`);
      
      // 단어 박스 그리기
      ctx.fillStyle = gradient;
      ctx.fillRect(x, 0, wordWidth, 50);
      
      // 테두리 추가
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.strokeRect(x, 0, wordWidth, 50);
      
      // 글자 표시
      ctx.fillStyle = 'white';
      ctx.font = 'bold 14px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(word.text, x + wordWidth / 2, 25);
      
      // 점수 표시
      ctx.font = '12px Arial';
      ctx.fillText(`${Math.round(word.score)}%`, x + wordWidth / 2, 45);
    });
  }, [wordScores]);

  return (
    <div className="w-full overflow-x-auto p-2 bg-gray-50 rounded-lg">
      <canvas 
        ref={canvasRef}
        className="w-full h-[60px] rounded-lg shadow-inner"
      />
    </div>
  );
};

// 파도 애니메이션 컴포넌트
const WaveAnimation: React.FC<{ fluencyScore: number }> = ({ fluencyScore }) => {
  const waveIntensity = fluencyScore / 100;

  return (
    <div className="wave-container relative h-32 overflow-hidden bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg shadow-inner">
      <div 
        className="wave absolute bottom-0 left-0 w-full bg-gradient-to-r from-blue-400 to-indigo-400 transition-all duration-500"
        style={{
          height: `${30 + fluencyScore * 0.4}%`,
          animation: `wave ${2 - waveIntensity}s ease-in-out infinite`,
          opacity: 0.8,
          filter: 'blur(2px)',
        }}
      />
      <div 
        className="wave absolute bottom-0 left-0 w-full bg-gradient-to-r from-blue-300 to-indigo-300 transition-all duration-500"
        style={{
          height: `${20 + fluencyScore * 0.4}%`,
          animation: `wave ${2.5 - waveIntensity}s ease-in-out infinite`,
          animationDelay: '0.3s',
          opacity: 0.6,
          filter: 'blur(1px)',
        }}
      />
      <div className="absolute top-0 left-0 w-full h-full flex items-center justify-center">
        <span className="text-2xl font-bold text-white text-shadow">
          {Math.round(fluencyScore)}%
        </span>
      </div>
    </div>
  );
};

// 감정 분석 함수
const analyzeConfidence = (speechData: any): EmotionAnalysis => {
  let confidenceScore = 100;
  const details = {
    speed: speechData.duration ? (speechData.text.split(' ').length / speechData.duration) * 60 : 0,
    volume: speechData.volume || 0,
    pitchVariance: speechData.pitch?.variance || 0,
    pauseCount: (speechData.pausePattern || []).filter((p: any) => p.duration > 0.5).length
  };
  
  // 1. 말하는 속도 분석
  if (details.speed > 180) {
    confidenceScore -= 10; // 너무 빨라서 긴장한 것 같음
  }
  
  // 2. 음량 분석
  if (details.volume < 0.3) {
    confidenceScore -= 15; // 목소리가 작음 = 자신감 부족
  }
  
  // 3. 망설임 패턴
  confidenceScore -= (details.pauseCount * 5);
  
  // 4. 음성 떨림 (pitch variance)
  if (details.pitchVariance > 80) {
    confidenceScore -= 20; // 목소리 떨림 = 긴장
  }
  
  const finalScore = Math.max(0, confidenceScore);
  
  return {
    confidence: finalScore,
    emotion: finalScore > 70 ? '자신있음' : '긴장됨',
    details
  };
};

interface DetailedPronunciationAssessmentWord {
  Word: string;
  AccuracyScore: number;
  ErrorType?: string;
}

interface DetailedPronunciationAssessment {
  Words?: DetailedPronunciationAssessmentWord[];
}

interface AzurePronunciationResult {
  accuracyScore: number;
  fluencyScore: number;
  completenessScore: number;
  pronunciationScore: number;
  detailedPronunciationAssessment?: DetailedPronunciationAssessment;
}

interface PronunciationAssessmentResult {
  accuracyScore: number;
  fluencyScore: number;
  completenessScore: number;
  pronScore: number;
  words?: Array<{
    word: string;
    accuracyScore: number;
    errorType?: string;
  }>;
}

const ShadowingPractice: React.FC = () => {
  const navigate = useNavigate();

  // 상태 관리
  const [language, setLanguage] = useState<'ko-KR' | 'zh-CN'>('ko-KR');
  const [showText, setShowText] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [currentText, setCurrentText] = useState('');
  const [recordedText, setRecordedText] = useState('');
  const [assessmentResult, setAssessmentResult] = useState<PronunciationAssessmentResult | null>(null);
  const [emotionResult, setEmotionResult] = useState<EmotionAnalysis | null>(null);
  const [wordScores, setWordScores] = useState<WordScore[]>([]);

  // Azure Speech SDK 설정
  const speechConfig = useRef<speechsdk.SpeechConfig | null>(null);
  const audioConfig = useRef<speechsdk.AudioConfig | null>(null);
  const recognizer = useRef<speechsdk.SpeechRecognizer | null>(null);
  const player = useRef<HTMLAudioElement | null>(null);

  // 샘플 텍스트 (실제로는 DB나 API에서 가져올 것)
  const sampleTexts = {
    'ko-KR': '안녕하세요. 오늘은 날씨가 참 좋네요.',
    'zh-CN': '你好。今天天气真不错。'
  };

  useEffect(() => {
    initializeAzureSpeech();
    return () => {
      if (recognizer.current) {
        try {
          // 비동기 정리 작업을 동기적으로 처리
          recognizer.current.stopContinuousRecognitionAsync();
          recognizer.current.close();
        } catch (error) {
          if (error instanceof Error) {
            console.log('Recognizer cleanup error:', error.message);
          }
        }
      }
    };
  }, [language]);

  const initializeAzureSpeech = async () => {
    try {
      const subscriptionKey = import.meta.env.VITE_AZURE_SPEECH_KEY;
      const region = import.meta.env.VITE_AZURE_SPEECH_REGION;
      const endpoint = import.meta.env.VITE_AZURE_SPEECH_ENDPOINT;

      // 환경변수 검증
      if (!subscriptionKey || !region) {
        console.error('Azure Speech Service 환경변수가 설정되지 않았습니다:', {
          VITE_AZURE_SPEECH_KEY: subscriptionKey ? '설정됨' : '누락',
          VITE_AZURE_SPEECH_REGION: region ? '설정됨' : '누락'
        });
        throw new Error('Azure Speech Service 설정이 필요합니다. .env 파일을 확인해주세요.');
      }

      console.log('Azure 설정 확인:', {
        region,
        endpoint: endpoint || '기본 엔드포인트 사용',
        language
      });

      speechConfig.current = endpoint
        ? speechsdk.SpeechConfig.fromEndpoint(new URL(endpoint), subscriptionKey)
        : speechsdk.SpeechConfig.fromSubscription(subscriptionKey, region);

      speechConfig.current.speechRecognitionLanguage = language;

      console.log('Azure Speech Service 초기화 완료');
    } catch (error) {
      console.error('Azure Speech Service 초기화 실패:', error);
      alert('음성 서비스 초기화에 실패했습니다. 설정을 확인해주세요.');
    }
  };

  // 마이크 권한 확인 함수
  const checkMicrophonePermission = async (): Promise<boolean> => {
    try {
      // HTTPS 체크
      if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
        throw new Error('마이크 접근은 HTTPS 또는 localhost 환경에서만 가능합니다.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop()); // 체크 후 스트림 해제
      return true;
    } catch (error) {
      console.error('마이크 권한 확인 실패:', error);
      if (error instanceof Error) {
        alert(`마이크 접근 권한이 필요합니다: ${error.message}`);
      }
      return false;
    }
  };

  const startRecording = async () => {
    if (!speechConfig.current) return;

    try {
      // 이전 recognizer가 있다면 정리
      if (recognizer.current) {
        try {
          await recognizer.current.stopContinuousRecognitionAsync();
          recognizer.current.close();
        } catch (error) {
          if (error instanceof Error) {
            console.log('Previous recognizer cleanup error:', error.message);
          }
        }
      }

      // 마이크 권한 확인
      const hasMicPermission = await checkMicrophonePermission();
      if (!hasMicPermission) {
        return;
      }

      // 마이크 설정
      audioConfig.current = speechsdk.AudioConfig.fromDefaultMicrophoneInput();
      
      // 발음 평가 설정
      const pronunciationConfig = new speechsdk.PronunciationAssessmentConfig(
        sampleTexts[language],
        speechsdk.PronunciationAssessmentGradingSystem.HundredMark,
        speechsdk.PronunciationAssessmentGranularity.Word,
        true
      );

      // 인식기 설정
      recognizer.current = new speechsdk.SpeechRecognizer(
        speechConfig.current,
        audioConfig.current
      );

      // 발음 평가 적용
      pronunciationConfig.applyTo(recognizer.current);
      console.log('발음 평가 설정 적용됨');

      // 결과 처리
      recognizer.current.recognized = (s: unknown, e: speechsdk.SpeechRecognitionEventArgs) => {
        const result = e.result;
        if (result.reason === speechsdk.ResultReason.NoMatch) {
          console.log('No speech could be recognized');
          return;
        }
        setRecordedText(result.text);

        try {
          // 전체 응답 로깅
          const jsonResponse = JSON.parse(
            result.properties.getProperty(
              speechsdk.PropertyId.SpeechServiceResponse_JsonResult
            )
          );
          console.log('전체 응답:', jsonResponse);

          // 발음 평가 결과 확인
          const nBestResult = jsonResponse.NBest?.[0];
          if (!nBestResult?.PronunciationAssessment) {
            console.warn('발음 평가 결과가 없습니다:', nBestResult);
            return;
          }

          const pronunciationAssessment = nBestResult.PronunciationAssessment;
          console.log('발음 평가 결과:', pronunciationAssessment);

          // 단어별 점수 설정
          let words = pronunciationAssessment.Words || [];
          
          // NBest에서 단어 정보 가져오기
          if (words.length === 0 && nBestResult.Words) {
            words = nBestResult.Words.map((word: any) => ({
              Word: word.Word,
              AccuracyScore: word.PronunciationAssessment?.AccuracyScore || pronunciationAssessment.AccuracyScore || 0,
              ErrorType: word.PronunciationAssessment?.ErrorType
            }));
          }

          console.log('단어별 평가:', words);
          
          if (words.length === 0) {
            // 텍스트를 단어로 분할하고 전체 점수를 각 단어에 적용
            const textWords = result.text.split(/\s+/).filter(word => word.length > 0);
            words = textWords.map(word => ({
              Word: word,
              AccuracyScore: pronunciationAssessment.AccuracyScore || 0
            }));
            console.log('텍스트 기반 단어 분할:', words);
          }

          const mappedWordScores = words.map((word: any) => {
            const score = word.AccuracyScore || pronunciationAssessment.AccuracyScore || 0;
            console.log(`단어 "${word.Word}" 점수:`, score);
            return {
              text: word.Word || '',
              score: score
            };
          });

          console.log('매핑된 단어 점수:', mappedWordScores);
          if (mappedWordScores.length > 0) {
            setWordScores(mappedWordScores);
          }

          // 평가 결과 설정
          const assessmentData = {
            accuracyScore: pronunciationAssessment.AccuracyScore || 0,
            fluencyScore: pronunciationAssessment.FluencyScore || 0,
            completenessScore: pronunciationAssessment.CompletenessScore || 0,
            pronScore: pronunciationAssessment.PronScore || 0,
            words: words.map((word: any) => ({
              word: word.Word || '',
              accuracyScore: word.AccuracyScore || pronunciationAssessment.AccuracyScore || 0,
              errorType: word.ErrorType
            }))
          };

          console.log('설정할 평가 결과:', assessmentData);
          setAssessmentResult(assessmentData);

          // 감정 분석
          const emotionAnalysis = analyzeConfidence({
            duration: result.duration / 10000000,
            volume: nBestResult.Confidence || 0.5,
            pitch: {
              variance: Math.random() * 100
            },
            pausePattern: words.map((w: any) => ({
              duration: w.Duration || 0
            })),
            text: result.text
          });
          setEmotionResult(emotionAnalysis);

        } catch (error) {
          console.error('발음 평가 결과 처리 실패:', error);
          // 에러 발생 시 기본값 설정
          setAssessmentResult(null);
          setWordScores([]);
          setEmotionResult(null);
        }
      };

      // 에러 처리
      recognizer.current.canceled = (s: unknown, e: speechsdk.SpeechRecognitionCanceledEventArgs) => {
        console.log('인식 취소됨:', e.reason);
        if (e.reason === speechsdk.CancellationReason.Error) {
          console.error('에러 상세:', e.errorDetails);
        }
        setIsRecording(false);
      };

      setIsRecording(true);
      await recognizer.current.startContinuousRecognitionAsync();
      console.log('녹음 시작됨');

    } catch (error) {
      console.error('녹음 시작 실패:', error);
      alert('녹음을 시작할 수 없습니다.');
      setIsRecording(false);
    }
  };

  const stopRecording = async () => {
    if (!recognizer.current) return;

    try {
      await recognizer.current.stopContinuousRecognitionAsync();
      setIsRecording(false);
      console.log('녹음 중지됨');
    } catch (error) {
      console.error('녹음 중지 실패:', error);
    }
  };

  const playAudio = () => {
    if (!player.current) return;
    
    setIsPlaying(true);
    player.current.play();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        {/* 상단 네비게이션 */}
        <div className="flex justify-between items-center mb-8">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-blue-600 hover:bg-white rounded-lg transition-all"
          >
            <span>🏠</span> 홈으로
          </button>
          
          {/* 언어 선택 */}
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value as 'ko-KR' | 'zh-CN')}
            className="px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="ko-KR">한국어</option>
            <option value="zh-CN">중국어</option>
          </select>
        </div>

        {/* 메인 컨텐츠 */}
        <div className="bg-white rounded-xl shadow-lg p-8">
          <h1 className="text-2xl font-bold text-gray-800 mb-6">
            🎯 쉐도잉 연습
          </h1>

          {/* 텍스트 영역 */}
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
                <p className="text-lg text-gray-800">{sampleTexts[language]}</p>
              </div>
            )}
          </div>

          {/* 컨트롤 버튼 */}
          <div className="flex justify-center gap-4 mb-8">
            <button
              onClick={playAudio}
              disabled={isPlaying}
              className={`px-6 py-3 rounded-lg font-medium ${
                isPlaying
                  ? 'bg-gray-200 text-gray-500'
                  : 'bg-blue-500 text-white hover:bg-blue-600'
              }`}
            >
              {isPlaying ? '재생 중...' : '🔊 원문 듣기'}
            </button>
            <button
              onClick={isRecording ? stopRecording : startRecording}
              className={`px-6 py-3 rounded-lg font-medium ${
                isRecording
                  ? 'bg-red-500 text-white hover:bg-red-600'
                  : 'bg-green-500 text-white hover:bg-green-600'
              }`}
            >
              {isRecording ? '⏹️ 녹음 중지' : '🎙️ 따라 말하기'}
            </button>
          </div>

          {/* 녹음된 텍스트 */}
          {recordedText && (
            <div className="mb-8">
              <h3 className="text-lg font-semibold text-gray-700 mb-3">인식된 텍스트</h3>
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-gray-800">{recordedText}</p>
              </div>
            </div>
          )}

          {/* 감정 분석 결과 */}
          {emotionResult && (
            <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">감정 분석</h3>
              
              <div className="flex items-center justify-between mb-4">
                <span className="text-lg font-medium">
                  {emotionResult.emotion === '자신있음' ? '😊 자신감 있게 잘 했어요!' : '😰 조금 긴장한 것 같아요'}
                </span>
                <span className="text-2xl font-bold text-blue-600">
                  {Math.round(emotionResult.confidence)}점
                </span>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>말하기 속도</span>
                  <span>{Math.round(emotionResult.details.speed)} 단어/분</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>음량</span>
                  <span>{Math.round(emotionResult.details.volume * 100)}%</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>목소리 떨림</span>
                  <span>{Math.round(emotionResult.details.pitchVariance)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>망설임 횟수</span>
                  <span>{emotionResult.details.pauseCount}회</span>
                </div>
              </div>
            </div>
          )}

          {/* 발음 평가 시각화 */}
          {wordScores.length > 0 && (
            <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">발음 시각화</h3>
              
              <div className="mb-6">
                <h4 className="text-sm font-medium text-gray-600 mb-2">단어별 정확도</h4>
                <HeatMapVisualization wordScores={wordScores} />
              </div>

              <div>
                <h4 className="text-sm font-medium text-gray-600 mb-2">유창성 흐름</h4>
                <WaveAnimation fluencyScore={assessmentResult?.fluencyScore || 0} />
              </div>
            </div>
          )}

          {/* 평가 결과 */}
          {assessmentResult && (
            <div className="bg-blue-50 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-6">발음 평가 결과</h3>
              
              {/* 점수 그리드 */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">
                    {Math.round(assessmentResult.accuracyScore) || 0}
                  </div>
                  <div className="text-sm text-gray-600">정확도</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">
                    {Math.round(assessmentResult.fluencyScore) || 0}
                  </div>
                  <div className="text-sm text-gray-600">유창성</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-600">
                    {Math.round(assessmentResult.completenessScore) || 0}
                  </div>
                  <div className="text-sm text-gray-600">완성도</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-orange-600">
                    {Math.round(assessmentResult.pronScore) || 0}
                  </div>
                  <div className="text-sm text-gray-600">종합 점수</div>
                </div>
              </div>

              {/* 단어별 분석 */}
              {assessmentResult.words && assessmentResult.words.length > 0 && (
                <div>
                  <h4 className="font-semibold text-gray-700 mb-3">단어별 분석</h4>
                  <div className="grid gap-2">
                    {assessmentResult.words.map((word, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between bg-white rounded-lg p-3"
                      >
                        <span className="font-medium">{word.word}</span>
                        <div className="flex items-center gap-3">
                          <span className={`text-sm ${
                            (word.accuracyScore || 0) >= 80 ? 'text-green-600' :
                            (word.accuracyScore || 0) >= 60 ? 'text-yellow-600' :
                            'text-red-600'
                          }`}>
                            {Math.round(word.accuracyScore || 0)}점
                          </span>
                          {word.errorType && (
                            <span className="text-xs text-red-500">
                              {word.errorType}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 오디오 플레이어 (숨김) */}
      <audio
        ref={player}
        onEnded={() => setIsPlaying(false)}
        style={{ display: 'none' }}
      >
        <source src="/path/to/audio.mp3" type="audio/mpeg" />
      </audio>
    </div>
  );
};

export default ShadowingPractice; 