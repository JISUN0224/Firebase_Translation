import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import * as speechsdk from 'microsoft-cognitiveservices-speech-sdk';

// 뉴스 데이터 인터페이스
interface NewsSegment {
  id: number;
  start_time: string;
  end_time: string;
  text: string;
  pinyin: string;
}

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

// 단어별 점수를 위한 인터페이스 (확장)
interface WordScore {
  text: string;
  score: number;
  errorType?: string;
  phonemes?: Array<{
    phoneme: string;
    accuracyScore: number;
  }>;
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
  const shouldAnimate = fluencyScore > 0; // 점수가 0보다 클 때만 애니메이션

  return (
    <div className="wave-container relative h-32 overflow-hidden bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg shadow-inner">
      {/* 명확한 레이블 추가 */}
      <div className="absolute top-2 left-2 text-xs text-gray-600 font-medium">
        말하기 리듬감
      </div>
      
      <div 
        className="wave absolute bottom-0 left-0 w-full bg-gradient-to-r from-blue-400 to-indigo-400 transition-all duration-500"
        style={{
          height: `${30 + fluencyScore * 0.4}%`,
          animation: shouldAnimate ? `wave ${2 - waveIntensity}s ease-in-out infinite` : 'none',
          opacity: 0.8,
          filter: 'blur(2px)',
        }}
      />
      <div 
        className="wave absolute bottom-0 left-0 w-full bg-gradient-to-r from-blue-300 to-indigo-300 transition-all duration-500"
        style={{
          height: `${20 + fluencyScore * 0.4}%`,
          animation: shouldAnimate ? `wave ${2.5 - waveIntensity}s ease-in-out infinite` : 'none',
          animationDelay: '0.3s',
          opacity: 0.6,
          filter: 'blur(1px)',
        }}
      />
      <div className="absolute top-0 left-0 w-full h-full flex items-center justify-center">
        <div className="text-center">
          <span className="text-2xl font-bold text-white text-shadow">
            {Math.round(fluencyScore)}%
          </span>
          <div className="text-xs text-white opacity-80 mt-1">
            {fluencyScore >= 90 ? '매우 자연스러움' : 
             fluencyScore >= 70 ? '자연스러움' : '개선 필요'}
          </div>
        </div>
      </div>
    </div>
  );
};

// 감정 분석 함수
const analyzeConfidence = (speechData: any): EmotionAnalysis => {
  // 실제 음성 데이터가 없으면 기본값 반환
  if (!speechData.text || speechData.text.trim() === '') {
    return {
      confidence: 0,
      emotion: '긴장됨',
      details: {
        speed: 0,
        volume: 0,
        pitchVariance: 0,
        pauseCount: 0
      }
    };
  }

  // 실제 음성 데이터가 있는지 확인 (시뮬레이션 데이터가 아닌지)
  const isRealSpeechData = speechData.isRealData || 
                           (speechData.duration && speechData.duration > 0 && 
                            speechData.volume && speechData.volume > 0);
  
  if (!isRealSpeechData) {
    return {
      confidence: 0,
      emotion: '긴장됨',
      details: {
        speed: 0,
        volume: 0,
        pitchVariance: 0,
        pauseCount: 0
      }
    };
  }

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

// 1단계: Azure 평가 결과 타입 및 파싱 함수 추가

// Azure 평가 결과 타입 정의
interface AzurePhoneme {
  Phoneme: string;
  AccuracyScore: number;
}

interface AzureWord {
  Word: string;
  AccuracyScore: number;
  ErrorType: 'None' | 'Mispronunciation' | 'Omission' | 'Insertion';
  Phonemes?: AzurePhoneme[];
}

interface PronunciationAssessmentResult {
  accuracyScore: number;
  fluencyScore: number;
  completenessScore: number;
  pronScore: number;
  words: Array<{
    word: string;
    accuracyScore: number;
    errorType: 'None' | 'Mispronunciation' | 'Omission' | 'Insertion';
    phonemes?: Array<{ phoneme: string; accuracyScore: number }>;
  }>;
  rawData?: any;
}

// Azure 평가 결과 파싱 함수
const parseAzureAssessment = (azureResponse: any): PronunciationAssessmentResult | null => {
  try {
    console.log('parseAzureAssessment 시작:', azureResponse);
    
    // Azure 응답 구조 확인
    if (!azureResponse) {
      console.log('azureResponse가 null입니다');
      return null;
    }

    // NBest 배열 확인
    if (!azureResponse.NBest || !Array.isArray(azureResponse.NBest) || azureResponse.NBest.length === 0) {
      console.log('NBest 배열이 없거나 비어있습니다:', azureResponse.NBest);
      return null;
    }

    const bestResult = azureResponse.NBest[0];
    console.log('bestResult:', bestResult);

    // PronunciationAssessment 확인
    if (!bestResult?.PronunciationAssessment) {
      console.log('PronunciationAssessment가 없습니다. bestResult:', bestResult);
      return null;
    }

    const assessment = bestResult.PronunciationAssessment;
    console.log('assessment:', assessment);

    const scores = {
      accuracyScore: assessment.AccuracyScore || 0,
      fluencyScore: assessment.FluencyScore || 0,
      completenessScore: assessment.CompletenessScore || 0,
      pronScore: assessment.PronScore || 0
    };

    console.log('scores:', scores);

    const words = (bestResult.Words || []).map((word: any) => ({
      word: word.Word || '',
      accuracyScore: word.PronunciationAssessment?.AccuracyScore || scores.accuracyScore,
      errorType: word.PronunciationAssessment?.ErrorType || 'None',
      phonemes: (word.PronunciationAssessment?.Phonemes || []).map((p: any) => ({
        phoneme: p.Phoneme,
        accuracyScore: p.AccuracyScore
      }))
    }));

    console.log('words:', words);

    const result = { ...scores, words, rawData: assessment };
    console.log('최종 파싱 결과:', result);
    return result;
  } catch (error) {
    console.error('Azure 평가 결과 파싱 실패:', error);
    return null;
  }
};

// 처리된 평가 결과 타입
interface ProcessedAssessmentResult {
  overallScores: {
    accuracy: number;
    fluency: number;
    completeness: number;
    pronunciation: number;
  };
  wordAnalysis: {
    word: string;
    accuracyScore: number;
    errorType: string;
    errorDescription: string;
    suggestions: string[];
    phonemes?: { phoneme: string; score: number; isCorrect: boolean }[];
  }[];
  errorStatistics: {
    totalWords: number;
    correctWords: number;
    mispronounced: number;
    omitted: number;
    inserted: number;
    accuracy: number;
  };
  recommendations: {
    strengths: string[];
    improvements: string[];
    nextSteps: string[];
  };
}

// 3단계: 향상된 시각화 컴포넌트들 추가

// 종합 점수 대시보드 컴포넌트
const ScoreDashboard: React.FC<{ assessment: PronunciationAssessmentResult }> = ({ assessment }) => {
  const scoreItems = [
    { 
      label: '정확도', 
      score: assessment.accuracyScore, 
      icon: '🎯',
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
      description: '발음의 정확성'
    },
    { 
      label: '유창성', 
      score: assessment.fluencyScore, 
      icon: '🌊',
      color: 'text-green-600',
      bgColor: 'bg-green-50',
      description: '말하기 자연스러움'
    },
    { 
      label: '완성도', 
      score: assessment.completenessScore, 
      icon: '✅',
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
      description: '텍스트 완주율'
    },
    { 
      label: '종합점수', 
      score: assessment.pronScore, 
      icon: '🏆',
      color: 'text-orange-600',
      bgColor: 'bg-orange-50',
      description: '전체 발음 점수'
    }
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      {scoreItems.map((item, index) => (
        <div key={index} className={`${item.bgColor} rounded-xl p-4 text-center`}>
          <div className="text-2xl mb-2">{item.icon}</div>
          <div className={`text-3xl font-bold ${item.color} mb-1`}>
            {Math.round(item.score)}
          </div>
          <div className="text-sm font-medium text-gray-700 mb-1">
            {item.label}
          </div>
          <div className="text-xs text-gray-500">
            {item.description}
          </div>
        </div>
      ))}
    </div>
  );
};

// 단어별 상세 분석 컴포넌트
const WordAnalysisTable: React.FC<{ words: Array<{word: string, accuracyScore: number, errorType: string, phonemes?: any[]}> }> = ({ words }) => {
  const getErrorTypeColor = (errorType: string) => {
    switch (errorType) {
      case 'None': return 'text-green-600 bg-green-50';
      case 'Mispronunciation': return 'text-red-600 bg-red-50';
      case 'Omission': return 'text-yellow-600 bg-yellow-50';
      case 'Insertion': return 'text-purple-600 bg-purple-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  const getErrorTypeText = (errorType: string) => {
    switch (errorType) {
      case 'None': return '정확';
      case 'Mispronunciation': return '발음 오류';
      case 'Omission': return '누락';
      case 'Insertion': return '삽입';
      default: return '알 수 없음';
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-6">
      <div className="bg-gray-50 px-6 py-3 border-b border-gray-200">
        <h4 className="font-semibold text-gray-800">단어별 상세 분석</h4>
      </div>
      <div className="max-h-80 overflow-y-auto">
        <table className="w-full">
          <thead className="bg-gray-50 sticky top-0">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                단어
              </th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                점수
              </th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                상태
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {words.map((word, index) => (
              <tr key={index} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="font-medium text-gray-900">{word.word}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-center">
                  <div className={`inline-flex px-2 py-1 text-sm font-semibold rounded-full ${
                    word.accuracyScore >= 90 ? 'text-green-800 bg-green-100' :
                    word.accuracyScore >= 70 ? 'text-yellow-800 bg-yellow-100' :
                    'text-red-800 bg-red-100'
                  }`}>
                    {Math.round(word.accuracyScore)}점
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-center">
                  <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getErrorTypeColor(word.errorType)}`}>
                    {getErrorTypeText(word.errorType)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// 1단계: 레이더 차트 컴포넌트 추가
interface RadarChartProps {
  data: {
    accuracy: number;
    fluency: number;
    completeness: number;
    confidence: number;
    speed: number;
  };
  previousData?: {
    accuracy: number;
    fluency: number;
    completeness: number;
    confidence: number;
    speed: number;
  };
  size?: number;
}

const RadarChart: React.FC<RadarChartProps> = ({ data, previousData, size = 300 }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [animationProgress, setAnimationProgress] = useState(0);

  useEffect(() => {
    // 애니메이션 효과
    const startTime = Date.now();
    const duration = 1500; // 1.5초 애니메이션

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // easeOutCubic 애니메이션 함수
      const easeProgress = 1 - Math.pow(1 - progress, 3);
      setAnimationProgress(easeProgress);

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    animate();
  }, [data]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 캔버스 크기 설정
    canvas.width = size;
    canvas.height = size;

    const centerX = size / 2;
    const centerY = size / 2;
    const radius = size * 0.35;

    // 축 라벨과 각도
    const axes = [
      { label: '정확도', angle: -Math.PI / 2, key: 'accuracy' },
      { label: '유창성', angle: -Math.PI / 2 + (2 * Math.PI) / 5, key: 'fluency' },
      { label: '완성도', angle: -Math.PI / 2 + (4 * Math.PI) / 5, key: 'completeness' },
      { label: '자신감', angle: -Math.PI / 2 + (6 * Math.PI) / 5, key: 'confidence' },
      { label: '속도', angle: -Math.PI / 2 + (8 * Math.PI) / 5, key: 'speed' }
    ];

    // 캔버스 클리어
    ctx.clearRect(0, 0, size, size);

    // 배경 그리드 그리기
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1;
    
    for (let i = 1; i <= 5; i++) {
      const gridRadius = (radius * i) / 5;
      ctx.beginPath();
      
      axes.forEach((axis, index) => {
        const x = centerX + Math.cos(axis.angle) * gridRadius;
        const y = centerY + Math.sin(axis.angle) * gridRadius;
        
        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });
      
      ctx.closePath();
      ctx.stroke();
    }

    // 축 선 그리기
    ctx.strokeStyle = '#d1d5db';
    ctx.lineWidth = 1;
    
    axes.forEach(axis => {
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.lineTo(
        centerX + Math.cos(axis.angle) * radius,
        centerY + Math.sin(axis.angle) * radius
      );
      ctx.stroke();
    });

    // 이전 데이터 그리기 (회색)
    if (previousData) {
      ctx.strokeStyle = '#9ca3af';
      ctx.fillStyle = 'rgba(156, 163, 175, 0.1)';
      ctx.lineWidth = 2;
      
      ctx.beginPath();
      axes.forEach((axis, index) => {
        const value = previousData[axis.key as keyof typeof previousData] / 100;
        const x = centerX + Math.cos(axis.angle) * radius * value;
        const y = centerY + Math.sin(axis.angle) * radius * value;
        
        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // 현재 데이터 그리기 (애니메이션 적용)
    const gradient = ctx.createLinearGradient(centerX - radius, centerY - radius, centerX + radius, centerY + radius);
    gradient.addColorStop(0, 'rgba(59, 130, 246, 0.3)');
    gradient.addColorStop(1, 'rgba(147, 51, 234, 0.3)');
    
    ctx.strokeStyle = '#3b82f6';
    ctx.fillStyle = gradient;
    ctx.lineWidth = 3;
    
    ctx.beginPath();
    axes.forEach((axis, index) => {
      let value = data[axis.key as keyof typeof data];
      
      // 속도는 200을 100으로 정규화 (200 단어/분을 최대값으로 가정)
      if (axis.key === 'speed') {
        value = Math.min(value / 2, 100); // 200을 100으로 정규화
      } else {
        value = Math.min(value, 100); // 다른 값들은 100을 넘지 않도록
      }
      
      const normalizedValue = (value / 100) * animationProgress;
      const x = centerX + Math.cos(axis.angle) * radius * normalizedValue;
      const y = centerY + Math.sin(axis.angle) * radius * normalizedValue;
      
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 데이터 포인트 그리기
    axes.forEach(axis => {
      let value = data[axis.key as keyof typeof data];
      
      // 속도는 200을 100으로 정규화
      if (axis.key === 'speed') {
        value = Math.min(value / 2, 100);
      } else {
        value = Math.min(value, 100);
      }
      
      const normalizedValue = (value / 100) * animationProgress;
      const x = centerX + Math.cos(axis.angle) * radius * normalizedValue;
      const y = centerY + Math.sin(axis.angle) * radius * normalizedValue;
      
      // 포인트 원
      ctx.fillStyle = '#3b82f6';
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, 2 * Math.PI);
      ctx.fill();
      
      // 포인트 테두리
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
      
      // 점수 표시
      ctx.font = '10px Inter, sans-serif';
      ctx.fillStyle = '#6b7280';
      const score = Math.round(data[axis.key as keyof typeof data] * animationProgress);
      ctx.fillText(`${score}`, labelX, labelY + 15);
    });

  }, [data, previousData, size, animationProgress]);

  return (
    <div className="flex flex-col items-center">
      <canvas 
        ref={canvasRef}
        className="drop-shadow-lg"
        style={{ maxWidth: '100%', height: 'auto' }}
      />
      <div className="mt-4 text-center">
        <div className="text-sm text-gray-600">발음 프로필</div>
        {previousData && (
          <div className="text-xs text-gray-500 mt-1">
            <span className="inline-block w-3 h-3 bg-gray-400 rounded mr-1"></span>
            이전 연습
            <span className="inline-block w-3 h-3 bg-blue-500 rounded ml-3 mr-1"></span>
            현재 연습
          </div>
        )}
      </div>
    </div>
  );
};

// 2단계: 고급 히트맵 컴포넌트 추가
interface EnhancedHeatMapProps {
  wordScores: Array<{
    text: string;
    score: number;
    errorType?: string;
    phonemes?: Array<{
      phoneme: string;
      accuracyScore: number;
    }>;
  }>;
  onWordClick?: (word: string, index: number) => void;
}

const EnhancedHeatMap: React.FC<EnhancedHeatMapProps> = ({ wordScores, onWordClick }) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const getScoreColor = (score: number) => {
    if (score >= 90) return 'from-green-400 to-green-600';
    if (score >= 80) return 'from-lime-400 to-lime-600';
    if (score >= 70) return 'from-yellow-400 to-yellow-600';
    if (score >= 60) return 'from-orange-400 to-orange-600';
    return 'from-red-400 to-red-600';
  };

  const getErrorIcon = (errorType?: string) => {
    switch (errorType) {
      case 'None': return '✅';
      case 'Mispronunciation': return '🔄';
      case 'Omission': return '❌';
      case 'Insertion': return '➕';
      default: return '❓';
    }
  };

  const getScoreGrade = (score: number) => {
    if (score >= 95) return { grade: 'S', color: 'text-purple-600' };
    if (score >= 90) return { grade: 'A+', color: 'text-green-600' };
    if (score >= 85) return { grade: 'A', color: 'text-green-500' };
    if (score >= 80) return { grade: 'B+', color: 'text-lime-600' };
    if (score >= 75) return { grade: 'B', color: 'text-yellow-600' };
    if (score >= 70) return { grade: 'C+', color: 'text-orange-500' };
    if (score >= 65) return { grade: 'C', color: 'text-orange-600' };
    return { grade: 'D', color: 'text-red-600' };
  };

  return (
    <div className="w-full">
      <div className="flex flex-wrap gap-2 p-4 bg-gray-50 rounded-lg">
        {wordScores.map((wordData, index) => {
          const { grade, color } = getScoreGrade(wordData.score);
          const isHovered = hoveredIndex === index;
          const isSelected = selectedIndex === index;

          return (
            <div
              key={index}
              className="relative group"
              onMouseEnter={() => setHoveredIndex(index)}
              onMouseLeave={() => setHoveredIndex(null)}
              onClick={() => {
                setSelectedIndex(index);
                onWordClick?.(wordData.text, index);
              }}
            >
              {/* 메인 단어 카드 */}
              <div
                className={`
                  relative px-4 py-3 rounded-lg cursor-pointer transition-all duration-300
                  bg-gradient-to-br ${getScoreColor(wordData.score)}
                  hover:scale-105 hover:shadow-lg
                  ${isSelected ? 'ring-4 ring-blue-300 ring-opacity-50' : ''}
                  ${isHovered ? 'shadow-xl transform -translate-y-1' : 'shadow-md'}
                `}
                style={{
                  minWidth: '80px',
                  animation: isSelected ? 'pulse 2s infinite' : 'none'
                }}
              >
                {/* 오류 타입 아이콘 */}
                <div className="absolute -top-2 -right-2 text-lg">
                  {getErrorIcon(wordData.errorType)}
                </div>

                {/* 단어 텍스트 */}
                <div className="text-center">
                  <div className="text-white font-bold text-lg mb-1">
                    {wordData.text}
                  </div>
                  <div className="text-white text-sm opacity-90">
                    {Math.round(wordData.score)}점
                  </div>
                  <div className={`text-xs font-bold ${color} bg-white bg-opacity-20 rounded px-2 py-1 mt-1`}>
                    {grade}
                  </div>
                </div>

                {/* 호버 시 상세 정보 */}
                {isHovered && (
                  <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 z-10">
                    <div className="bg-gray-900 text-white text-xs rounded-lg px-3 py-2 whitespace-nowrap shadow-xl">
                      <div className="font-semibold">{wordData.text}</div>
                      <div>점수: {Math.round(wordData.score)}/100</div>
                      <div>상태: {wordData.errorType === 'None' ? '정확' : '오류'}</div>
                      {wordData.phonemes && (
                        <div className="mt-1 pt-1 border-t border-gray-600">
                          <div className="text-xs opacity-75">음소별 점수:</div>
                          {wordData.phonemes.slice(0, 3).map((phoneme, pIndex) => (
                            <div key={pIndex} className="text-xs">
                              {phoneme.phoneme}: {Math.round(phoneme.accuracyScore)}
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
                    </div>
                  </div>
                )}
              </div>

              {/* 선택 시 상세 패널 */}
              {isSelected && wordData.phonemes && wordData.phonemes.length > 0 && (
                <div className="absolute top-full left-0 mt-2 z-20 w-64 bg-white rounded-lg shadow-xl border border-gray-200 p-4">
                  <div className="text-sm font-semibold text-gray-800 mb-3">
                    "{wordData.text}" 음소별 분석
                  </div>
                  <div className="space-y-2">
                    {wordData.phonemes.map((phoneme, pIndex) => (
                      <div key={pIndex} className="flex items-center justify-between">
                        <span className="text-sm text-gray-600">
                          {phoneme.phoneme}
                        </span>
                        <div className="flex items-center gap-2">
                          <div className="w-16 bg-gray-200 rounded-full h-2">
                            <div
                              className={`h-2 rounded-full bg-gradient-to-r ${getScoreColor(phoneme.accuracyScore)}`}
                              style={{ width: `${phoneme.accuracyScore}%` }}
                            ></div>
                          </div>
                          <span className="text-xs font-medium text-gray-700 w-8">
                            {Math.round(phoneme.accuracyScore)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedIndex(null);
                    }}
                    className="mt-3 text-xs text-gray-500 hover:text-gray-700"
                  >
                    닫기
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 범례 */}
      <div className="mt-4 flex justify-center">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="text-sm font-medium text-gray-700 mb-2">점수 범례</div>
          <div className="flex gap-4 text-xs">
            <div className="flex items-center gap-1">
              <div className="w-4 h-4 rounded bg-gradient-to-r from-green-400 to-green-600"></div>
              <span>90-100 (우수)</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-4 h-4 rounded bg-gradient-to-r from-yellow-400 to-yellow-600"></div>
              <span>70-89 (보통)</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-4 h-4 rounded bg-gradient-to-r from-red-400 to-red-600"></div>
              <span>0-69 (개선필요)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// 3단계: 실시간 진행도 시각화 컴포넌트 추가
interface RealTimeProgressProps {
  scores: {
    overall: number;
    accuracy: number;
    fluency: number;
    completeness: number;
  };
  isRecording?: boolean;
}

const RealTimeProgress: React.FC<RealTimeProgressProps> = ({ scores, isRecording }) => {
  const [animatedScores, setAnimatedScores] = useState(scores);
  const [pulseIntensity, setPulseIntensity] = useState(0);

  // 점수 애니메이션
  useEffect(() => {
    const duration = 1000;
    const startTime = Date.now();
    const startScores = animatedScores;

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // easeOutQuart
      const easeProgress = 1 - Math.pow(1 - progress, 4);

      setAnimatedScores({
        overall: startScores.overall + (scores.overall - startScores.overall) * easeProgress,
        accuracy: startScores.accuracy + (scores.accuracy - startScores.accuracy) * easeProgress,
        fluency: startScores.fluency + (scores.fluency - startScores.fluency) * easeProgress,
        completeness: startScores.completeness + (scores.completeness - startScores.completeness) * easeProgress,
      });

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    animate();
  }, [scores]);

  // 녹음 중 펄스 효과
  useEffect(() => {
    if (!isRecording) {
      setPulseIntensity(0);
      return;
    }

    const interval = setInterval(() => {
      setPulseIntensity(prev => (prev + 0.1) % (Math.PI * 2));
    }, 50);

    return () => clearInterval(interval);
  }, [isRecording]);

  const circumference = 2 * Math.PI * 45; // radius = 45

  return (
    <div className="flex gap-8 items-center justify-center">
      {/* 종합 점수 원형 차트 */}
      <div className="relative">
        <svg width="120" height="120" className="transform -rotate-90">
          {/* 배경 원 */}
          <circle
            cx="60"
            cy="60"
            r="45"
            stroke="#e5e7eb"
            strokeWidth="8"
            fill="transparent"
          />
          
          {/* 진행률 원 */}
          <circle
            cx="60"
            cy="60"
            r="45"
            stroke="url(#overallGradient)"
            strokeWidth="8"
            fill="transparent"
            strokeDasharray={circumference}
            strokeDashoffset={circumference - (circumference * animatedScores.overall) / 100}
            strokeLinecap="round"
            className="transition-all duration-1000 ease-out"
            style={{
              filter: isRecording ? `drop-shadow(0 0 ${5 + Math.sin(pulseIntensity) * 3}px #3b82f6)` : 'none'
            }}
          />
          
          {/* 그라디언트 정의 */}
          <defs>
            <linearGradient id="overallGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#3b82f6" />
              <stop offset="100%" stopColor="#8b5cf6" />
            </linearGradient>
          </defs>
        </svg>
        
        {/* 중앙 점수 표시 */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <div className={`text-2xl font-bold text-gray-800 ${isRecording ? 'animate-pulse' : ''}`}>
              {Math.round(animatedScores.overall)}
            </div>
            <div className="text-xs text-gray-500">종합점수</div>
          </div>
        </div>
      </div>

      {/* 개별 점수 막대 그래프 */}
      <div className="space-y-4">
        {[
          { label: '정확도', value: animatedScores.accuracy, color: 'bg-blue-500', icon: '🎯' },
          { label: '유창성', value: animatedScores.fluency, color: 'bg-green-500', icon: '🌊' },
          { label: '완성도', value: animatedScores.completeness, color: 'bg-purple-500', icon: '✅' }
        ].map((item, index) => (
          <div key={index} className="flex items-center gap-3 w-48">
            <span className="text-lg">{item.icon}</span>
            <div className="flex-1">
              <div className="flex justify-between items-center mb-1">
                <span className="text-sm font-medium text-gray-700">{item.label}</span>
                <span className="text-sm font-bold text-gray-800">
                  {Math.round(item.value)}%
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className={`h-2 rounded-full ${item.color} transition-all duration-1000 ease-out`}
                  style={{ 
                    width: `${item.value}%`,
                    boxShadow: isRecording ? `0 0 8px ${item.color.replace('bg-', '#').replace('-500', '')}` : 'none'
                  }}
                ></div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// 1단계: 중국어 성조 분석 시스템 추가
interface ToneAnalysisResult {
  detectedTone: 1 | 2 | 3 | 4 | 0; // 0은 경성
  confidence: number;
  pitchCurve: number[];
  expectedTone: 1 | 2 | 3 | 4 | 0;
  accuracy: number;
}

interface ChineseToneAnalyzerInterface {
  analyzeTones: (audioData: Float32Array, sampleRate: number, text: string) => ToneAnalysisResult[];
  visualizePitchCurve: (pitchData: number[]) => void;
}

class ChineseToneAnalyzer implements ChineseToneAnalyzerInterface {
  private audioContext: AudioContext;
  private analyser: AnalyserNode;
  
  // 중국어 성조 패턴 정의
  private tonePatterns = {
    1: { start: 0.8, end: 0.8, shape: 'flat' },      // 1성: 평평
    2: { start: 0.3, end: 0.9, shape: 'rising' },    // 2성: 상승
    3: { start: 0.5, end: 0.2, shape: 'falling-rising' }, // 3성: 하강-상승
    4: { start: 0.9, end: 0.1, shape: 'falling' },   // 4성: 하강
    0: { start: 0.4, end: 0.4, shape: 'neutral' }    // 경성: 짧고 가벼움
  };

  constructor() {
    this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 2048;
  }

  // 음성에서 피치 추출
  private extractPitch(audioData: Float32Array, sampleRate: number): number[] {
    const pitchData: number[] = [];
    const windowSize = 1024;
    const hopSize = 512;
    
    for (let i = 0; i < audioData.length - windowSize; i += hopSize) {
      const window = audioData.slice(i, i + windowSize);
      const pitch = this.detectPitch(window, sampleRate);
      pitchData.push(pitch);
    }
    
    return this.smoothPitchData(pitchData);
  }

  // 자기상관함수를 이용한 피치 검출
  private detectPitch(window: Float32Array, sampleRate: number): number {
    const autocorrelation = this.autocorrelate(window);
    const minPeriod = Math.floor(sampleRate / 800); // 최대 800Hz
    const maxPeriod = Math.floor(sampleRate / 80);  // 최소 80Hz
    
    let maxCorr = 0;
    let period = 0;
    
    for (let p = minPeriod; p < maxPeriod && p < autocorrelation.length; p++) {
      if (autocorrelation[p] > maxCorr) {
        maxCorr = autocorrelation[p];
        period = p;
      }
    }
    
    return period > 0 ? sampleRate / period : 0;
  }

  // 자기상관함수 계산
  private autocorrelate(data: Float32Array): Float32Array {
    const result = new Float32Array(data.length);
    
    for (let lag = 0; lag < data.length; lag++) {
      let sum = 0;
      for (let i = 0; i < data.length - lag; i++) {
        sum += data[i] * data[i + lag];
      }
      result[lag] = sum / (data.length - lag);
    }
    
    return result;
  }

  // 피치 데이터 스무딩
  private smoothPitchData(pitchData: number[]): number[] {
    const smoothed: number[] = [];
    const windowSize = 5;
    
    for (let i = 0; i < pitchData.length; i++) {
      let sum = 0;
      let count = 0;
      
      for (let j = Math.max(0, i - windowSize); j <= Math.min(pitchData.length - 1, i + windowSize); j++) {
        if (pitchData[j] > 0) {
          sum += pitchData[j];
          count++;
        }
      }
      
      smoothed[i] = count > 0 ? sum / count : 0;
    }
    
    return smoothed;
  }

  // 성조 패턴 분석
  private analyzeTonePattern(pitchCurve: number[]): { tone: number; confidence: number } {
    if (pitchCurve.length === 0) return { tone: 0, confidence: 0 };
    
    // 피치 곡선 정규화 (0-1 범위)
    const validPitches = pitchCurve.filter(p => p > 0);
    if (validPitches.length === 0) return { tone: 0, confidence: 0 };
    
    const minPitch = Math.min(...validPitches);
    const maxPitch = Math.max(...validPitches);
    const range = maxPitch - minPitch;
    
    if (range < 20) return { tone: 1, confidence: 0.8 }; // 1성: 평평한 톤
    
    const normalizedCurve = pitchCurve.map(p => 
      p > 0 ? (p - minPitch) / range : 0
    );
    
    // 각 성조 패턴과의 유사도 계산
    const similarities = {
      1: this.calculateToneSimilarity(normalizedCurve, 1),
      2: this.calculateToneSimilarity(normalizedCurve, 2),
      3: this.calculateToneSimilarity(normalizedCurve, 3),
      4: this.calculateToneSimilarity(normalizedCurve, 4)
    };
    
    const bestMatch = Object.entries(similarities).reduce((a, b) => 
      similarities[parseInt(a[0]) as keyof typeof similarities] > similarities[parseInt(b[0]) as keyof typeof similarities] ? a : b
    );
    
    return {
      tone: parseInt(bestMatch[0]),
      confidence: bestMatch[1] as number
    };
  }

  // 성조 패턴 유사도 계산
  private calculateToneSimilarity(curve: number[], targetTone: number): number {
    const pattern = this.tonePatterns[targetTone as keyof typeof this.tonePatterns];
    const expectedCurve = this.generateExpectedCurve(pattern, curve.length);
    
    let similarity = 0;
    let validPoints = 0;
    
    for (let i = 0; i < Math.min(curve.length, expectedCurve.length); i++) {
      if (curve[i] > 0) {
        const diff = Math.abs(curve[i] - expectedCurve[i]);
        similarity += Math.max(0, 1 - diff);
        validPoints++;
      }
    }
    
    return validPoints > 0 ? similarity / validPoints : 0;
  }

  // 예상 성조 곡선 생성
  private generateExpectedCurve(pattern: any, length: number): number[] {
    const curve: number[] = [];
    
    for (let i = 0; i < length; i++) {
      const progress = i / (length - 1);
      let value: number;
      
      switch (pattern.shape) {
        case 'flat':
          value = pattern.start;
          break;
        case 'rising':
          value = pattern.start + (pattern.end - pattern.start) * progress;
          break;
        case 'falling':
          value = pattern.start + (pattern.end - pattern.start) * progress;
          break;
        case 'falling-rising':
          if (progress < 0.7) {
            value = pattern.start + (0.2 - pattern.start) * (progress / 0.7);
          } else {
            value = 0.2 + (pattern.end - 0.2) * ((progress - 0.7) / 0.3);
          }
          break;
        default:
          value = pattern.start;
      }
      
      curve.push(value);
    }
    
    return curve;
  }

  // 중국어 단어의 예상 성조 가져오기
  private getExpectedTones(text: string): number[] {
    // 실제로는 중국어 성조 사전을 사용해야 함
    // 여기서는 샘플 데이터 사용
    const toneMap: { [key: string]: number[] } = {
      '坚持': [1, 2],
      '目标': [4, 1],
      '导向': [3, 4],
      '问题': [4, 2],
      '结合': [2, 2],
      '时俱进': [2, 4, 4],
      '完善': [2, 4],
      '党政': [3, 4],
      '机关': [1, 1],
      '经费': [1, 4],
      '管理': [3, 3]
    };
    
    return toneMap[text] || [1]; // 기본값은 1성
  }

  // 메인 분석 함수
  public analyzeTones(audioData: Float32Array, sampleRate: number, text: string): ToneAnalysisResult[] {
    const pitchCurve = this.extractPitch(audioData, sampleRate);
    
    // 중국어 한자만 추출 (구두점 제외)
    const chineseChars = text.split('').filter(char => /[\u4e00-\u9fff]/.test(char));
    
    if (chineseChars.length === 0) return [];
    
    // 각 한자별로 성조 분석
    const segmentLength = Math.floor(pitchCurve.length / chineseChars.length);
    const results: ToneAnalysisResult[] = [];
    
    chineseChars.forEach((char, index) => {
      const start = index * segmentLength;
      const end = Math.min((index + 1) * segmentLength, pitchCurve.length);
      const charPitchCurve = pitchCurve.slice(start, end);
      
      const toneAnalysis = this.analyzeTonePattern(charPitchCurve);
      const expectedTones = this.getExpectedTones(char);
      const expectedTone = expectedTones[0] || 1;
      
      const accuracy = toneAnalysis.tone === expectedTone ? toneAnalysis.confidence * 100 : 
                      Math.max(0, 100 - Math.abs(toneAnalysis.tone - expectedTone) * 25);
      
      results.push({
        detectedTone: toneAnalysis.tone as 1 | 2 | 3 | 4 | 0,
        confidence: toneAnalysis.confidence,
        pitchCurve: charPitchCurve,
        expectedTone: expectedTone as 1 | 2 | 3 | 4 | 0,
        accuracy: accuracy
      });
    });
    
    return results;
  }

  // 피치 곡선 시각화
  public visualizePitchCurve(pitchData: number[]): void {
    // 이 함수는 별도의 시각화 컴포넌트에서 사용됩니다
    console.log('피치 곡선 데이터:', pitchData);
  }
}

// 2단계: 학습 패턴 분석 시스템 추가
interface LearningSession {
  id: string;
  timestamp: number;
  duration: number;
  scores: {
    accuracy: number;
    fluency: number;
    completeness: number;
    overall: number;
  };
  mistakes: Array<{
    word: string;
    errorType: string;
    frequency: number;
  }>;
  improvements: Array<{
    area: string;
    beforeScore: number;
    afterScore: number;
  }>;
}

interface LearningProfile {
  userId: string;
  totalSessions: number;
  totalStudyTime: number;
  averageScores: {
    accuracy: number;
    fluency: number;
    completeness: number;
    overall: number;
  };
  weakAreas: Array<{
    category: string;
    severity: number;
    improvement: number;
  }>;
  strengths: string[];
  learningStyle: 'visual' | 'auditory' | 'kinesthetic' | 'mixed';
  preferredDifficulty: 'beginner' | 'intermediate' | 'advanced';
  goals: Array<{
    target: string;
    current: number;
    target_value: number;
    deadline: string;
  }>;
}

class LearningAnalytics {
  private sessions: LearningSession[] = [];
  private profile: LearningProfile | null = null;

  constructor() {
    this.loadFromStorage();
  }

  // 세션 추가 및 분석
  public addSession(session: LearningSession): void {
    this.sessions.push(session);
    this.updateProfile();
    this.saveToStorage();
  }

  // 학습 프로필 업데이트
  private updateProfile(): void {
    if (this.sessions.length === 0) return;

    const recentSessions = this.sessions.slice(-10); // 최근 10세션
    
    // 평균 점수 계산
    const avgScores = recentSessions.reduce(
      (acc, session) => ({
        accuracy: acc.accuracy + session.scores.accuracy,
        fluency: acc.fluency + session.scores.fluency,
        completeness: acc.completeness + session.scores.completeness,
        overall: acc.overall + session.scores.overall
      }),
      { accuracy: 0, fluency: 0, completeness: 0, overall: 0 }
    );

    Object.keys(avgScores).forEach(key => {
      avgScores[key as keyof typeof avgScores] /= recentSessions.length;
    });

    // 약점 영역 분석
    const weakAreas = this.analyzeWeakAreas();
    
    // 강점 분석
    const strengths = this.analyzeStrengths();

    // 학습 스타일 분석
    const learningStyle = this.analyzeLearningStyle();

    this.profile = {
      userId: 'current_user',
      totalSessions: this.sessions.length,
      totalStudyTime: this.sessions.reduce((sum, s) => sum + s.duration, 0),
      averageScores: avgScores,
      weakAreas,
      strengths,
      learningStyle,
      preferredDifficulty: this.analyzePreferredDifficulty(),
      goals: this.generatePersonalizedGoals()
    };
  }

  // 약점 영역 분석
  private analyzeWeakAreas(): Array<{ category: string; severity: number; improvement: number }> {
    const areas = ['accuracy', 'fluency', 'completeness'];
    const weakAreas: Array<{ category: string; severity: number; improvement: number }> = [];

    areas.forEach(area => {
      const recentScores = this.sessions.slice(-5).map(s => s.scores[area as keyof typeof s.scores]);
      const average = recentScores.reduce((sum, score) => sum + score, 0) / recentScores.length;
      
      if (average < 75) {
        const olderScores = this.sessions.slice(-10, -5).map(s => s.scores[area as keyof typeof s.scores]);
        const olderAverage = olderScores.length > 0 ? 
          olderScores.reduce((sum, score) => sum + score, 0) / olderScores.length : average;
        
        const improvement = average - olderAverage;
        const severity = (75 - average) / 75; // 0-1 범위

        weakAreas.push({
          category: area,
          severity,
          improvement
        });
      }
    });

    return weakAreas.sort((a, b) => b.severity - a.severity);
  }

  // 강점 분석
  private analyzeStrengths(): string[] {
    const strengths: string[] = [];
    const recentSession = this.sessions[this.sessions.length - 1];
    
    if (!recentSession) return strengths;

    if (recentSession.scores.accuracy >= 90) strengths.push('정확한 발음');
    if (recentSession.scores.fluency >= 85) strengths.push('자연스러운 유창성');
    if (recentSession.scores.completeness >= 95) strengths.push('완벽한 텍스트 완주');
    
    // 일관성 분석
    const consistencyThreshold = 5; // 점수 편차 임계값
    const recentScores = this.sessions.slice(-5).map(s => s.scores.overall);
    const variance = this.calculateVariance(recentScores);
    
    if (variance < consistencyThreshold) {
      strengths.push('일관된 성능');
    }

    // 개선 속도 분석
    if (this.sessions.length >= 3) {
      const improvementRate = this.calculateImprovementRate();
      if (improvementRate > 2) {
        strengths.push('빠른 학습 속도');
      }
    }

    return strengths;
  }

  // 학습 스타일 분석
  private analyzeLearningStyle(): 'visual' | 'auditory' | 'kinesthetic' | 'mixed' {
    // 실제로는 더 복잡한 분석이 필요하지만, 여기서는 간단한 휴리스틱 사용
    const recentSessions = this.sessions.slice(-5);
    
    if (recentSessions.length === 0) return 'mixed';

    const avgAccuracy = recentSessions.reduce((sum, s) => sum + s.scores.accuracy, 0) / recentSessions.length;
    const avgFluency = recentSessions.reduce((sum, s) => sum + s.scores.fluency, 0) / recentSessions.length;
    
    if (avgAccuracy > avgFluency + 10) return 'visual'; // 정확도가 높으면 시각적 학습자
    if (avgFluency > avgAccuracy + 10) return 'auditory'; // 유창성이 높으면 청각적 학습자
    
    return 'mixed';
  }

  // 선호 난이도 분석
  private analyzePreferredDifficulty(): 'beginner' | 'intermediate' | 'advanced' {
    const avgScore = this.profile?.averageScores.overall || 0;
    
    if (avgScore >= 85) return 'advanced';
    if (avgScore >= 70) return 'intermediate';
    return 'beginner';
  }

  // 개인화된 목표 생성
  private generatePersonalizedGoals(): Array<{ target: string; current: number; target_value: number; deadline: string }> {
    const goals: Array<{ target: string; current: number; target_value: number; deadline: string }> = [];
    const currentScores = this.profile?.averageScores;
    
    if (!currentScores) return goals;

    const oneWeekLater = new Date();
    oneWeekLater.setDate(oneWeekLater.getDate() + 7);
    const oneMonthLater = new Date();
    oneMonthLater.setMonth(oneMonthLater.getMonth() + 1);

    // 약점 영역 개선 목표
    if (currentScores.accuracy < 85) {
      goals.push({
        target: '발음 정확도 향상',
        current: Math.round(currentScores.accuracy),
        target_value: Math.min(100, Math.round(currentScores.accuracy + 10)),
        deadline: oneWeekLater.toISOString().split('T')[0]
      });
    }

    // 전체적인 향상 목표
    goals.push({
      target: '종합 점수 향상',
      current: Math.round(currentScores.overall),
      target_value: Math.min(100, Math.round(currentScores.overall + 5)),
      deadline: oneMonthLater.toISOString().split('T')[0]
    });

    return goals;
  }

  // 분산 계산
  private calculateVariance(scores: number[]): number {
    const mean = scores.reduce((sum, score) => sum + score, 0) / scores.length;
    const variance = scores.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) / scores.length;
    return Math.sqrt(variance);
  }

  // 개선 속도 계산
  private calculateImprovementRate(): number {
    if (this.sessions.length < 3) return 0;
    
    const recent = this.sessions.slice(-3).map(s => s.scores.overall);
    const older = this.sessions.slice(-6, -3).map(s => s.scores.overall);
    
    if (older.length === 0) return 0;
    
    const recentAvg = recent.reduce((sum, score) => sum + score, 0) / recent.length;
    const olderAvg = older.reduce((sum, score) => sum + score, 0) / older.length;
    
    return recentAvg - olderAvg;
  }

  // 맞춤형 조언 생성
  public generatePersonalizedAdvice(): Array<{ type: string; message: string; priority: number }> {
    const advice: Array<{ type: string; message: string; priority: number }> = [];
    
    if (!this.profile) return advice;

    // 약점 기반 조언
    this.profile.weakAreas.forEach(area => {
      let message = '';
      switch (area.category) {
        case 'accuracy':
          message = '발음 정확도 향상을 위해 천천히 또박또박 연습해보세요. 특히 어려운 발음이 포함된 단어들을 반복 연습하는 것이 도움됩니다.';
          break;
        case 'fluency':
          message = '유창성 향상을 위해 원어민 속도에 맞춰 따라 말하기 연습을 늘려보세요. 문장 전체의 리듬감을 익히는 것이 중요합니다.';
          break;
        case 'completeness':
          message = '텍스트 완주율을 높이기 위해 처음부터 끝까지 모든 단어를 놓치지 않고 읽는 연습을 해보세요.';
          break;
      }
      
      advice.push({
        type: 'improvement',
        message,
        priority: Math.round(area.severity * 10)
      });
    });

    // 학습 스타일 기반 조언
    switch (this.profile.learningStyle) {
      case 'visual':
        advice.push({
          type: 'learning_style',
          message: '시각적 학습자이시네요! 텍스트를 보면서 연습하고, 발음 기호나 입모양 그림을 활용해보세요.',
          priority: 5
        });
        break;
      case 'auditory':
        advice.push({
          type: 'learning_style',
          message: '청각적 학습자이시네요! 반복 듣기와 따라 말하기를 중심으로 연습하시면 효과적입니다.',
          priority: 5
        });
        break;
    }

    // 연속 학습 격려
    if (this.sessions.length >= 5) {
      const lastSession = this.sessions[this.sessions.length - 1];
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      
      if (lastSession.timestamp > yesterday.getTime()) {
        advice.push({
          type: 'motivation',
          message: '꾸준한 학습 습관을 유지하고 계시네요! 이 페이스를 계속 유지하시면 더 큰 발전이 있을 것입니다.',
          priority: 3
        });
      }
    }

    return advice.sort((a, b) => b.priority - a.priority);
  }

  // 로컬 스토리지 저장
  private saveToStorage(): void {
    try {
      localStorage.setItem('learning_sessions', JSON.stringify(this.sessions));
      localStorage.setItem('learning_profile', JSON.stringify(this.profile));
    } catch (error) {
      console.error('학습 데이터 저장 실패:', error);
    }
  }

  // 로컬 스토리지 로드
  private loadFromStorage(): void {
    try {
      const sessionsData = localStorage.getItem('learning_sessions');
      const profileData = localStorage.getItem('learning_profile');
      
      if (sessionsData) {
        this.sessions = JSON.parse(sessionsData);
      }
      
      if (profileData) {
        this.profile = JSON.parse(profileData);
      }
    } catch (error) {
      console.error('학습 데이터 로드 실패:', error);
    }
  }

  // 공개 메서드들
  public getProfile(): LearningProfile | null {
    return this.profile;
  }

  public getSessions(): LearningSession[] {
    return this.sessions;
  }

  public getRecentProgress(days: number = 7): LearningSession[] {
    const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
    return this.sessions.filter(session => session.timestamp >= cutoff);
  }
}

// 3단계: 감정/자신감 분석 시스템 추가
interface EmotionalState {
  confidence: number;
  nervousness: number;
  excitement: number;
  frustration: number;
  motivation: number;
}

interface VoiceCharacteristics {
  averagePitch: number;
  pitchVariance: number;
  volume: number;
  speechRate: number;
  pauseFrequency: number;
  voiceShakiness: number;
}

class EmotionalAnalyzer {
  // 음성에서 감정 특성 추출
  public analyzeEmotion(audioData: Float32Array, sampleRate: number, duration: number): EmotionalState {
    const voiceChars = this.extractVoiceCharacteristics(audioData, sampleRate, duration);
    return this.interpretEmotionalState(voiceChars);
  }

  // 음성 특성 추출
  private extractVoiceCharacteristics(audioData: Float32Array, sampleRate: number, duration: number): VoiceCharacteristics {
    const pitchData = this.extractPitchContour(audioData, sampleRate);
    const volumeData = this.extractVolumeContour(audioData);
    const pauseData = this.detectPauses(audioData, sampleRate);
    
    return {
      averagePitch: this.calculateAverage(pitchData.filter(p => p > 0)),
      pitchVariance: this.calculateVariance(pitchData.filter(p => p > 0)),
      volume: this.calculateAverage(volumeData),
      speechRate: this.calculateSpeechRate(audioData, duration),
      pauseFrequency: pauseData.length / duration,
      voiceShakiness: this.calculateVoiceShakiness(pitchData)
    };
  }

  // 피치 윤곽선 추출
  private extractPitchContour(audioData: Float32Array, sampleRate: number): number[] {
    const windowSize = 1024;
    const hopSize = 512;
    const pitchContour: number[] = [];
    
    for (let i = 0; i < audioData.length - windowSize; i += hopSize) {
      const window = audioData.slice(i, i + windowSize);
      const pitch = this.detectPitchYin(window, sampleRate);
      pitchContour.push(pitch);
    }
    
    return pitchContour;
  }

  // YIN 알고리즘을 이용한 피치 검출
  private detectPitchYin(buffer: Float32Array, sampleRate: number): number {
    const yinBuffer = new Float32Array(buffer.length / 2);
    const threshold = 0.15;
    let tau: number;
    
    // 1단계: 차이 함수 계산
    for (tau = 0; tau < yinBuffer.length; tau++) {
      yinBuffer[tau] = 0;
      for (let i = 0; i < yinBuffer.length; i++) {
        const delta = buffer[i] - buffer[i + tau];
        yinBuffer[tau] += delta * delta;
      }
    }
    
    // 2단계: 누적 평균 정규화 차이 함수
    yinBuffer[0] = 1;
    let runningSum = 0;
    for (tau = 1; tau < yinBuffer.length; tau++) {
      runningSum += yinBuffer[tau];
      yinBuffer[tau] *= tau / runningSum;
    }
    
    // 3단계: 절대 임계값 검색
    for (tau = 2; tau < yinBuffer.length; tau++) {
      if (yinBuffer[tau] < threshold) {
        while (tau + 1 < yinBuffer.length && yinBuffer[tau + 1] < yinBuffer[tau]) {
          tau++;
        }
        // 포물선 보간으로 정확도 향상
        return this.parabolicInterpolation(yinBuffer, tau, sampleRate);
      }
    }
    
    return 0; // 피치를 찾을 수 없음
  }

  // 포물선 보간
  private parabolicInterpolation(array: Float32Array, peakIndex: number, sampleRate: number): number {
    if (peakIndex === 0 || peakIndex === array.length - 1) {
      return sampleRate / peakIndex;
    }
    
    const y1 = array[peakIndex - 1];
    const y2 = array[peakIndex];
    const y3 = array[peakIndex + 1];
    
    const a = (y1 - 2 * y2 + y3) / 2;
    const b = (y3 - y1) / 2;
    
    if (a !== 0) {
      const xv = -b / (2 * a);
      const betterPeak = peakIndex + xv;
      return sampleRate / betterPeak;
    }
    
    return sampleRate / peakIndex;
  }

  // 볼륨 윤곽선 추출
  private extractVolumeContour(audioData: Float32Array): number[] {
    const windowSize = 1024;
    const hopSize = 512;
    const volumeContour: number[] = [];
    
    for (let i = 0; i < audioData.length - windowSize; i += hopSize) {
      const window = audioData.slice(i, i + windowSize);
      const rms = Math.sqrt(window.reduce((sum, val) => sum + val * val, 0) / window.length);
      volumeContour.push(rms);
    }
    
    return volumeContour;
  }

  // 일시정지 구간 감지
  private detectPauses(audioData: Float32Array, sampleRate: number): Array<{start: number, duration: number}> {
    const windowSize = 1024;
    const hopSize = 512;
    const silenceThreshold = 0.01;
    const minPauseDuration = 0.2; // 200ms
    
    const pauses: Array<{start: number, duration: number}> = [];
    let currentPauseStart = -1;
    
    for (let i = 0; i < audioData.length - windowSize; i += hopSize) {
      const window = audioData.slice(i, i + windowSize);
      const energy = window.reduce((sum, val) => sum + val * val, 0) / window.length;
      const currentTime = i / sampleRate;
      
      if (energy < silenceThreshold) {
        if (currentPauseStart === -1) {
          currentPauseStart = currentTime;
        }
      } else {
        if (currentPauseStart !== -1) {
          const pauseDuration = currentTime - currentPauseStart;
          if (pauseDuration >= minPauseDuration) {
            pauses.push({
              start: currentPauseStart,
              duration: pauseDuration
            });
          }
          currentPauseStart = -1;
        }
      }
    }
    
    return pauses;
  }

  // 말하기 속도 계산
  private calculateSpeechRate(audioData: Float32Array, duration: number): number {
    // 음성 구간만 추출하여 실제 말하기 시간 계산
    const volumeContour = this.extractVolumeContour(audioData);
    const silenceThreshold = 0.01;
    const speechTime = volumeContour.filter(vol => vol > silenceThreshold).length * 0.512 / 1000; // hop size 기반
    
    // 대략적인 음절 수 추정 (볼륨 피크 기반)
    const syllableCount = this.estimateSyllableCount(volumeContour);
    
    return speechTime > 0 ? syllableCount / speechTime : 0; // 초당 음절 수
  }

  // 음절 수 추정
  private estimateSyllableCount(volumeContour: number[]): number {
    let syllableCount = 0;
    const threshold = this.calculateAverage(volumeContour) * 0.7;
    let inSyllable = false;
    
    for (const volume of volumeContour) {
      if (volume > threshold && !inSyllable) {
        syllableCount++;
        inSyllable = true;
      } else if (volume <= threshold) {
        inSyllable = false;
      }
    }
    
    return syllableCount;
  }

  // 목소리 떨림 계산
  private calculateVoiceShakiness(pitchData: number[]): number {
    const validPitches = pitchData.filter(p => p > 0);
    if (validPitches.length < 2) return 0;
    
    let totalVariation = 0;
    for (let i = 1; i < validPitches.length; i++) {
      totalVariation += Math.abs(validPitches[i] - validPitches[i-1]);
    }
    
    return totalVariation / (validPitches.length - 1);
  }

  // 감정 상태 해석
  private interpretEmotionalState(characteristics: VoiceCharacteristics): EmotionalState {
    // 자신감 계산 (음량, 안정된 피치, 적절한 속도)
    const confidence = this.calculateConfidence(characteristics);
    
    // 긴장감 계산 (피치 변동, 목소리 떨림, 빠른 말하기)
    const nervousness = this.calculateNervousness(characteristics);
    
    // 흥분도 계산 (높은 피치, 빠른 속도, 큰 음량)
    const excitement = this.calculateExcitement(characteristics);
    
    // 좌절감 계산 (낮은 음량, 느린 속도, 많은 일시정지)
    const frustration = this.calculateFrustration(characteristics);
    
    // 동기부여 계산 (전반적인 에너지, 일관성)
    const motivation = this.calculateMotivation(characteristics);
    
    return {
      confidence: Math.max(0, Math.min(100, confidence)),
      nervousness: Math.max(0, Math.min(100, nervousness)),
      excitement: Math.max(0, Math.min(100, excitement)),
      frustration: Math.max(0, Math.min(100, frustration)),
      motivation: Math.max(0, Math.min(100, motivation))
    };
  }

  private calculateConfidence(chars: VoiceCharacteristics): number {
    let score = 50; // 기본 점수
    
    // 음량이 적절한 경우 (+)
    if (chars.volume > 0.3 && chars.volume < 0.8) score += 20;
    else if (chars.volume < 0.2) score -= 30; // 너무 작으면 자신감 부족
    
    // 피치 변동이 적절한 경우 (+)
    if (chars.pitchVariance > 10 && chars.pitchVariance < 50) score += 15;
    else if (chars.pitchVariance > 80) score -= 25; // 너무 많은 변동은 긴장
    
    // 말하기 속도가 적절한 경우 (+)
    if (chars.speechRate > 2 && chars.speechRate < 6) score += 15;
    else if (chars.speechRate > 8) score -= 20; // 너무 빠르면 긴장
    
    // 일시정지가 적절한 경우 (+)
    if (chars.pauseFrequency < 3) score += 10;
    else score -= chars.pauseFrequency * 5; // 너무 많은 일시정지는 망설임
    
    return score;
  }

  private calculateNervousness(chars: VoiceCharacteristics): number {
    let score = 0;
    
    // 목소리 떨림
    score += chars.voiceShakiness * 2;
    
    // 과도한 피치 변동
    if (chars.pitchVariance > 60) score += (chars.pitchVariance - 60) * 0.5;
    
    // 너무 빠른 말하기
    if (chars.speechRate > 7) score += (chars.speechRate - 7) * 10;
    
    // 너무 많은 일시정지
    if (chars.pauseFrequency > 3) score += (chars.pauseFrequency - 3) * 15;
    
    // 너무 작은 음량 (긴장으로 인한 움츠림)
    if (chars.volume < 0.3) score += (0.3 - chars.volume) * 100;
    
    return score;
  }

  private calculateExcitement(chars: VoiceCharacteristics): number {
    let score = 0;
    
    // 높은 평균 피치
    if (chars.averagePitch > 200) score += (chars.averagePitch - 200) * 0.2;
    
    // 빠른 말하기 속도
    if (chars.speechRate > 5) score += (chars.speechRate - 5) * 10;
    
    // 큰 음량
    if (chars.volume > 0.6) score += (chars.volume - 0.6) * 50;
    
    // 피치 변동 (흥분 시 다양한 억양)
    if (chars.pitchVariance > 30 && chars.pitchVariance < 80) score += 20;
    
    return score;
  }

  private calculateFrustration(chars: VoiceCharacteristics): number {
    let score = 0;
    
    // 낮은 음량 (의기소침)
    if (chars.volume < 0.3) score += (0.3 - chars.volume) * 60;
    
    // 느린 말하기 속도
    if (chars.speechRate < 2) score += (2 - chars.speechRate) * 20;
    
    // 많은 일시정지 (망설임, 포기)
    if (chars.pauseFrequency > 4) score += (chars.pauseFrequency - 4) * 20;
    
    // 낮은 피치 (우울한 톤)
    if (chars.averagePitch < 150) score += (150 - chars.averagePitch) * 0.3;
    
    return score;
  }

  private calculateMotivation(chars: VoiceCharacteristics): number {
    let score = 50;
    
    // 적절한 음량과 에너지
    if (chars.volume > 0.4 && chars.volume < 0.8) score += 20;
    
    // 안정적인 피치 (집중도)
    if (chars.voiceShakiness < 20) score += 15;
    
    // 적절한 말하기 속도 (차분하고 명확)
    if (chars.speechRate > 2.5 && chars.speechRate < 5.5) score += 15;
    
    // 적절한 일시정지 (사려깊은 말하기)
    if (chars.pauseFrequency > 1 && chars.pauseFrequency < 3) score += 10;
    
    return score;
  }

  // 유틸리티 메서드들
  private calculateAverage(data: number[]): number {
    if (data.length === 0) return 0;
    return data.reduce((sum, val) => sum + val, 0) / data.length;
  }

  private calculateVariance(data: number[]): number {
    if (data.length === 0) return 0;
    const mean = this.calculateAverage(data);
    const variance = data.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / data.length;
    return Math.sqrt(variance);
  }

  // 감정 변화 추적
  public trackEmotionalProgress(emotionalHistory: EmotionalState[]): {
    trend: 'improving' | 'declining' | 'stable';
    recommendations: string[];
  } {
    if (emotionalHistory.length < 2) {
      return { trend: 'stable', recommendations: [] };
    }

    const recent = emotionalHistory.slice(-3);
    const older = emotionalHistory.slice(-6, -3);
    
    if (older.length === 0) {
      return { trend: 'stable', recommendations: [] };
    }

    const recentAvg = {
      confidence: this.calculateAverage(recent.map(e => e.confidence)),
      nervousness: this.calculateAverage(recent.map(e => e.nervousness)),
      motivation: this.calculateAverage(recent.map(e => e.motivation))
    };

    const olderAvg = {
      confidence: this.calculateAverage(older.map(e => e.confidence)),
      nervousness: this.calculateAverage(older.map(e => e.nervousness)),
      motivation: this.calculateAverage(older.map(e => e.motivation))
    };

    const confidenceChange = recentAvg.confidence - olderAvg.confidence;
    const nervousnessChange = recentAvg.nervousness - olderAvg.nervousness;
    const motivationChange = recentAvg.motivation - olderAvg.motivation;

    let trend: 'improving' | 'declining' | 'stable' = 'stable';
    const recommendations: string[] = [];

    // 전반적인 개선/악화 판단
    const overallChange = confidenceChange - nervousnessChange + motivationChange;
    
    if (overallChange > 10) {
      trend = 'improving';
      recommendations.push('훌륭한 진전을 보이고 있습니다! 현재의 학습 패턴을 유지하세요.');
    } else if (overallChange < -10) {
      trend = 'declining';
      recommendations.push('조금 힘든 시기인 것 같네요. 충분한 휴식과 함께 천천히 연습해보세요.');
    }

    // 구체적인 권장사항
    if (recentAvg.nervousness > 60) {
      recommendations.push('긴장도가 높습니다. 깊은 호흡과 함께 천천히 말하는 연습을 해보세요.');
    }

    if (recentAvg.confidence < 40) {
      recommendations.push('자신감이 부족해 보입니다. 쉬운 텍스트부터 시작해서 성공 경험을 늘려보세요.');
    }

    if (recentAvg.motivation < 50) {
      recommendations.push('동기부여가 필요해 보입니다. 작은 목표를 설정하고 달성해보세요.');
    }

    return { trend, recommendations };
  }
}

// 5단계: 고급 분석 결과 UI 컴포넌트들 추가
const ToneAnalysisDisplay: React.FC<{ toneAnalysis: ToneAnalysisResult[], actualWords: string[] }> = ({ toneAnalysis, actualWords }) => {
  const getToneColor = (tone: number) => {
    const colors = {
      1: '#4CAF50', // 1성: 초록
      2: '#2196F3', // 2성: 파랑
      3: '#FF9800', // 3성: 주황
      4: '#F44336', // 4성: 빨강
      0: '#9E9E9E'  // 경성: 회색
    };
    return colors[tone as keyof typeof colors] || '#9E9E9E';
  };

  const getToneName = (tone: number) => {
    const names = {
      1: '1성 (평평)',
      2: '2성 (상승)',
      3: '3성 (하강-상승)',
      4: '4성 (하강)',
      0: '경성'
    };
    return names[tone as keyof typeof names] || '알 수 없음';
  };

  const getToneDescription = (tone: number): string => {
    const descriptions = {
      1: '높고 평평하게 발음하세요',
      2: '낮은 곳에서 높은 곳으로 올려 발음하세요',
      3: '중간에서 낮게 내린 후 다시 올려 발음하세요',
      4: '높은 곳에서 낮게 내려 발음하세요'
    };
    return descriptions[tone as keyof typeof descriptions] || '성조를 확인해보세요';
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6 mb-6">
      <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center">
        <span className="mr-2">🎵</span>
        중국어 성조 분석
        <span className="ml-2 text-sm text-gray-500">(중국어 발음의 높낮이 패턴)</span>
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {toneAnalysis
          .filter(result => result.accuracy < 80) // 80점 미만인 것만 필터링
          .map((result, index) => {
            const originalIndex = toneAnalysis.findIndex(r => r === result);
            return (
              <div key={originalIndex} className="bg-red-50 border border-red-200 rounded-lg p-4">
                {/* 실제 한자 표시 */}
                <div className="text-center mb-3">
                  <div className="text-2xl font-bold text-gray-800 mb-1">
                    {actualWords[originalIndex] || `한자 ${originalIndex + 1}`}
                  </div>
                  <div className="text-sm text-gray-600">
                    개선이 필요한 한자
                  </div>
                </div>
                
                {/* 성조 비교 */}
                <div className="flex justify-between items-center mb-3">
                  <div className="text-center">
                    <div className={`text-lg font-bold ${getToneColor(result.detectedTone)}`}>
                      {result.detectedTone}성
                    </div>
                    <div className="text-xs text-gray-500">실제 발음</div>
                  </div>
                  <div className="text-2xl">→</div>
                  <div className="text-center">
                    <div className={`text-lg font-bold ${getToneColor(result.expectedTone)}`}>
                      {result.expectedTone}성
                    </div>
                    <div className="text-xs text-gray-500">정확한 성조</div>
                  </div>
                </div>
                
                {/* 결과 해석 */}
                <div className="text-center p-2 rounded bg-red-100">
                  <div className="font-medium text-red-700">
                    ❌ 연습이 필요해요 ({Math.round(result.accuracy)}점)
                  </div>
                  <div className="text-sm text-red-600 mt-1">
                    {getToneDescription(result.expectedTone)}
                  </div>
                </div>
              </div>
            );
          })}
      </div>
      
      {/* 개선이 필요한 성조가 없을 때 */}
      {toneAnalysis.filter(result => result.accuracy < 80).length === 0 && (
        <div className="text-center py-8 bg-green-50 rounded-lg">
          <div className="text-4xl mb-2">🎉</div>
          <div className="text-lg font-semibold text-green-700 mb-2">완벽한 성조 발음!</div>
          <div className="text-sm text-green-600">모든 한자의 성조가 정확하게 발음되었습니다.</div>
        </div>
      )}
      
      {/* 성조 가이드 */}
      <div className="mt-6 p-4 bg-blue-50 rounded-lg">
        <h4 className="font-semibold text-blue-800 mb-2">성조 가이드</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
          <div>1성: 평평하게 ‾</div>
          <div>2성: 올라가며 ∕</div>
          <div>3성: 내려갔다 올라감 ∨</div>
          <div>4성: 내려가며 ∖</div>
        </div>
      </div>
    </div>
  );
};

const EmotionalAnalysisDisplay: React.FC<{ emotionalState: EmotionalState }> = ({ emotionalState }) => {
  const getEmotionColor = (value: number) => {
    if (value >= 80) return '#4CAF50';
    if (value >= 60) return '#8BC34A';
    if (value >= 40) return '#FFC107';
    if (value >= 20) return '#FF9800';
    return '#F44336';
  };

  const getEmotionIcon = (type: string) => {
    const icons = {
      confidence: '😊',
      nervousness: '😰',
      excitement: '😃',
      frustration: '😤',
      motivation: '💪'
    };
    return icons[type as keyof typeof icons] || '😐';
  };

  const getEmotionLabel = (type: string) => {
    const labels = {
      confidence: '자신감',
      nervousness: '긴장도',
      excitement: '흥분도',
      frustration: '좌절감',
      motivation: '동기부여'
    };
    return labels[type as keyof typeof labels] || type;
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6 mb-6">
      <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center">
        <span className="mr-2">🎭</span>
        감정/자신감 분석
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {Object.entries(emotionalState).map(([key, value]) => (
          <div key={key} className="text-center">
            <div className="text-3xl mb-2">{getEmotionIcon(key)}</div>
            <div className="text-sm font-medium text-gray-700 mb-2">
              {getEmotionLabel(key)}
            </div>
            <div className="relative bg-gray-200 rounded-full h-3 mb-2">
              <div
                className="h-3 rounded-full transition-all duration-500"
                style={{
                  width: `${value}%`,
                  backgroundColor: getEmotionColor(value)
                }}
              />
            </div>
            <div className="text-lg font-bold" style={{ color: getEmotionColor(value) }}>
              {Math.round(value)}%
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const LearningProfileDisplay: React.FC<{ profile: LearningProfile; advice: Array<{ type: string; message: string; priority: number }> }> = ({ profile, advice }) => {
  return (
    <div className="bg-white rounded-lg shadow-md p-6 mb-6">
      <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center">
        <span className="mr-2">📊</span>
        학습 프로필 & 맞춤 조언
      </h3>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 학습 프로필 */}
        <div>
          <h4 className="text-lg font-semibold text-gray-700 mb-3">학습 통계</h4>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-600">총 세션 수:</span>
              <span className="font-medium">{profile.totalSessions}회</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">총 학습 시간:</span>
              <span className="font-medium">{Math.round(profile.totalStudyTime / 60)}분</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">학습 스타일:</span>
              <span className="font-medium">
                {profile.learningStyle === 'visual' ? '시각적' :
                 profile.learningStyle === 'auditory' ? '청각적' :
                 profile.learningStyle === 'kinesthetic' ? '운동감각적' : '혼합형'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">선호 난이도:</span>
              <span className="font-medium">
                {profile.preferredDifficulty === 'beginner' ? '초급' :
                 profile.preferredDifficulty === 'intermediate' ? '중급' : '고급'}
              </span>
            </div>
          </div>

          {/* 강점 */}
          {profile.strengths.length > 0 && (
            <div className="mt-4">
              <h5 className="text-md font-semibold text-gray-700 mb-2">강점</h5>
              <div className="flex flex-wrap gap-2">
                {profile.strengths.map((strength, index) => (
                  <span key={index} className="bg-green-100 text-green-800 px-2 py-1 rounded-full text-sm">
                    {strength}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* 약점 영역 */}
          {profile.weakAreas.length > 0 && (
            <div className="mt-4">
              <h5 className="text-md font-semibold text-gray-700 mb-2">개선 영역</h5>
              <div className="space-y-2">
                {profile.weakAreas.map((area, index) => (
                  <div key={index} className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">
                      {area.category === 'accuracy' ? '발음 정확도' :
                       area.category === 'fluency' ? '유창성' : '완성도'}
                    </span>
                    <div className="flex items-center space-x-2">
                      <div className="w-20 bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-red-500 h-2 rounded-full"
                          style={{ width: `${area.severity * 100}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-500">
                        {Math.round(area.severity * 100)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 맞춤 조언 */}
        <div>
          <h4 className="text-lg font-semibold text-gray-700 mb-3">맞춤 조언</h4>
          <div className="space-y-3">
            {advice.slice(0, 5).map((item, index) => (
              <div key={index} className="bg-blue-50 rounded-lg p-3 border-l-4 border-blue-400">
                <div className="flex items-start">
                  <span className="text-blue-500 mr-2">
                    {item.type === 'improvement' ? '💡' :
                     item.type === 'learning_style' ? '🎯' :
                     item.type === 'motivation' ? '🌟' : '💬'}
                  </span>
                  <p className="text-sm text-gray-700">{item.message}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

const ShadowingPractice: React.FC = () => {
  const navigate = useNavigate();

  // 상태 관리
  const [language, setLanguage] = useState<'ko-KR' | 'zh-CN'>('zh-CN');
  const [showText, setShowText] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [currentText, setCurrentText] = useState('');
  const [recordedText, setRecordedText] = useState('');
  const [finalSegments, setFinalSegments] = useState<string[]>([]);
  const [realTimeText, setRealTimeText] = useState(''); // 실시간 인식 중인 텍스트
  const [azureAssessmentData, setAzureAssessmentData] = useState<any>(null);
  const [allAzureResults, setAllAzureResults] = useState<any[]>([]); // 모든 Azure 결과를 누적
  const [allRecognizedSegments, setAllRecognizedSegments] = useState<string[]>([]); // 모든 인식된 구문들
  const [isSessionActive, setIsSessionActive] = useState(false); // 세션 활성 상태
  const [assessmentResult, setAssessmentResult] = useState<PronunciationAssessmentResult | null>(null);
  const [processedAssessment, setProcessedAssessment] = useState<ProcessedAssessmentResult>({
    overallScores: { accuracy: 0, fluency: 0, completeness: 0, pronunciation: 0 },
    wordAnalysis: [],
    errorStatistics: { totalWords: 0, correctWords: 0, mispronounced: 0, omitted: 0, inserted: 0, accuracy: 0 },
    recommendations: { strengths: [], improvements: [], nextSteps: [] }
  });
  const [emotionResult, setEmotionResult] = useState<EmotionAnalysis | null>(null);
  const [wordScores, setWordScores] = useState<WordScore[]>([]);
  const [newsData, setNewsData] = useState<NewsSegment[]>([]);
  const [currentCharIndex, setCurrentCharIndex] = useState(0);
  const [isAssessmentCompleted, setIsAssessmentCompleted] = useState(false);
  const [actualWords, setActualWords] = useState<string[]>([]);

  // 맞춤형 피드백 생성 함수
  const generatePersonalizedFeedback = (words: any[], scores: any) => {
    const mispronounced = words.filter(w => w.errorType === 'Mispronunciation');
    const strengths = [];
    const improvements = [];
    const nextSteps = [];

    // 실제 데이터 기반 피드백
    if (scores.accuracyScore >= 85) {
      strengths.push('발음이 매우 정확합니다!');
    }
    if (scores.fluencyScore >= 90) {
      strengths.push('말하기 속도가 자연스럽습니다');
    }

    if (mispronounced.length > 0) {
      improvements.push(`${mispronounced.map(w => w.word).join(', ')} 단어의 발음을 개선해보세요`);
      nextSteps.push(`특히 "${mispronounced[0].word}" 단어를 반복 연습하세요`);
    }

    if (scores.fluencyScore < 70) {
      improvements.push('말하기 속도를 조금 더 자연스럽게 해보세요');
      nextSteps.push('원어민 속도에 맞춰 따라 읽기 연습을 해보세요');
    }

    // 기본 피드백 (조건에 맞지 않을 때)
    if (strengths.length === 0) {
      strengths.push('꾸준한 연습으로 더 좋아질 거예요!');
    }
    if (improvements.length === 0) {
      improvements.push('발음 정확도를 높이기 위해 연습이 필요합니다');
    }
    if (nextSteps.length === 0) {
      nextSteps.push('어려운 단어들을 반복 연습해보세요');
    }

    return { strengths, improvements, nextSteps };
  };

  // Azure Speech SDK 설정
  const speechConfig = useRef<speechsdk.SpeechConfig | null>(null);
  const audioConfig = useRef<speechsdk.AudioConfig | null>(null);
  const recognizer = useRef<speechsdk.SpeechRecognizer | null>(null);
  const player = useRef<HTMLAudioElement | null>(null);
  const highlightInterval = useRef<NodeJS.Timeout | null>(null);

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
        
        // 전체 텍스트 결합
        const fullText = data.map((segment: NewsSegment) => segment.text).join('');
        setCurrentText(fullText);
      } catch (error) {
        console.error('뉴스 데이터 로드 실패:', error);
      }
    };

    loadNewsData();
  }, []);

  // 시간 문자열을 초로 변환하는 함수 (00:00:00,920 -> 0.920)
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

    // 현재 세그먼트 이전의 모든 글자 수 계산
    const previousSegmentsLength = newsData
      .filter(segment => segment.id < currentSegment.id)
      .reduce((total, segment) => total + segment.text.length, 0);

    // 현재 세그먼트 내 진행률
    const progress = getProgressInSegment(currentTime, currentSegment);
    
    // 현재 세그먼트 내 글자 위치
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

    // 100ms마다 하이라이트 업데이트 (부드러운 동기화)
    const interval = setInterval(updateHighlight, 100);

    return () => clearInterval(interval);
  }, [isPlaying, newsData, currentText]);

  // 기존 글자별 하이라이트 타이머 제거됨

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
      
      // 발음 평가 설정 - 실제 말할 텍스트를 기준으로 설정
      const referenceText = currentText || sampleTexts[language];
      console.log('평가 기준 텍스트:', referenceText);
      
      const pronunciationConfig = new speechsdk.PronunciationAssessmentConfig(
        referenceText,
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

      // 실시간 텍스트 표시만 (평가는 녹음 정지 시에만)
      recognizer.current.recognized = (s: unknown, e: speechsdk.SpeechRecognitionEventArgs) => {
        const result = e.result;
        console.log('인식 이벤트 발생:', result.reason, result.text);
        
        if (result.reason === speechsdk.ResultReason.NoMatch) {
          console.log('No speech could be recognized');
          return;
        }

        if (result.reason === speechsdk.ResultReason.RecognizedSpeech && result.text.trim()) {
          console.log('확정된 구문:', result.text);
          
          // 새로운 구문을 배열에 추가
          setAllRecognizedSegments(prev => {
            const newSegments = [...prev, result.text.trim()];
            console.log('현재까지 누적된 구문들:', newSegments);
            return newSegments;
          });
          
          // 전체 텍스트도 업데이트 (공백으로 연결)
          setRecordedText(prev => {
            const allText = prev ? `${prev} ${result.text.trim()}` : result.text.trim();
            console.log('누적된 전체 텍스트:', allText);
            return allText;
          });
          
          // 실시간 텍스트 초기화
          setRealTimeText('');

          // Azure 평가 결과 저장 (즉시 평가하지 않음)
          try {
            const jsonResponse = JSON.parse(
              result.properties.getProperty(
                speechsdk.PropertyId.SpeechServiceResponse_JsonResult
              )
            );
            console.log('Azure 평가 결과 저장:', jsonResponse);
            
            // 모든 결과를 누적
            setAllAzureResults(prev => {
              const newResults = [...prev, jsonResponse];
              console.log(`Azure 결과 ${newResults.length}개 누적됨`);
              return newResults;
            });
            
          } catch (error) {
            console.error('Azure 평가 결과 파싱 실패:', error);
          }
        }
      };

      // 실시간 인식 결과 (중간 결과)
      recognizer.current.recognizing = (s: unknown, e: speechsdk.SpeechRecognitionEventArgs) => {
        const result = e.result;
        console.log('실시간 인식 중:', result.text);
        // 실시간 인식 중인 텍스트만 별도로 관리
        if (result.text && result.text.trim()) {
          setRealTimeText(result.text.trim());
        }
      };

      // 세션 재시작 처리 (중요!)
      recognizer.current.sessionStarted = (s: unknown, e: speechsdk.SessionEventArgs) => {
        console.log('새로운 음성 세션 시작됨:', e.sessionId);
        setIsSessionActive(true);
      };

      recognizer.current.sessionStopped = (s: unknown, e: speechsdk.SessionEventArgs) => {
        console.log('음성 세션 종료됨:', e.sessionId);
        
        // 세션이 종료되었지만 아직 녹음 중이라면 자동으로 재시작
        if (isRecording && isSessionActive) {
          console.log('침묵으로 인한 세션 종료 - 자동 재시작');
          setTimeout(async () => {
            try {
              await recognizer.current?.startContinuousRecognitionAsync();
              console.log('음성 인식 자동 재시작됨');
            } catch (error) {
              console.error('자동 재시작 실패:', error);
            }
          }, 100);
        }
      };

      // 에러 처리
      recognizer.current.canceled = (s: unknown, e: speechsdk.SpeechRecognitionCanceledEventArgs) => {
        console.log('인식 취소됨:', e.reason);
        if (e.reason === speechsdk.CancellationReason.Error) {
          console.error('에러 상세:', e.errorDetails);
        }
        setIsRecording(false);
        setIsSessionActive(false);
      };

      setIsRecording(true);
      // 모든 상태 초기화
      setAllRecognizedSegments([]);
      setRecordedText('');
      setRealTimeText('');
      setAzureAssessmentData(null);
      setAllAzureResults([]);
      setIsAssessmentCompleted(false);
      setIsSessionActive(true);
      setProcessedAssessment({
        overallScores: { accuracy: 0, fluency: 0, completeness: 0, pronunciation: 0 },
        wordAnalysis: [],
        errorStatistics: { totalWords: 0, correctWords: 0, mispronounced: 0, omitted: 0, inserted: 0, accuracy: 0 },
        recommendations: { strengths: [], improvements: [], nextSteps: [] }
      });
      setEmotionResult(null);
      setWordScores([]);
      setIsAssessmentCompleted(false);
      await recognizer.current.startContinuousRecognitionAsync();
      console.log('녹음 시작됨');

    } catch (error) {
      console.error('녹음 시작 실패:', error);
      alert('녹음을 시작할 수 없습니다.');
      setIsRecording(false);
    }
  };

  // 전체 Azure 결과를 통합하여 평가하는 함수
  const performAssessmentWithAllAzureData = (allResults: any[]) => {
    if (isAssessmentCompleted) {
      console.log('⚠️ 이미 평가가 완료되었습니다. 중복 처리 방지.');
      return;
    }
    
    console.log('🔥 performAssessmentWithAllAzureData 시작');
    console.log('📊 전체 Azure 결과 수:', allResults.length);
    console.log('📝 실제 인식된 텍스트:', recordedText);
    
    if (allResults.length === 0) {
      console.error('❌ Azure 결과가 없습니다.');
      alert('⚠️ Azure 평가 결과가 없습니다. 다시 시도해주세요.');
      return;
    }
    
    // 실제 인식된 텍스트가 없으면 기본 텍스트 사용
    const actualSpokenText = recordedText.trim() || currentText || sampleTexts[language];
    console.log('🎯 실제 평가 기준 텍스트:', actualSpokenText);
    
    // 실제 인식된 텍스트를 단어로 분리
    const actualWords = actualSpokenText.split(/[\s，。！？；：""''（）【】]/).filter(word => word.trim());
    console.log('🎯 실제 말한 단어들:', actualWords);
    
    // 모든 결과에서 단어들을 수집
    let allWords: any[] = [];
    let totalAccuracy = 0;
    let totalFluency = 0;
    let totalCompleteness = 0;
    let totalPron = 0;
    let totalDuration = 0;
    
    allResults.forEach((result, index) => {
      console.log(`📋 결과 ${index + 1} 파싱 중...`);
      const parsedAssessment = parseAzureAssessment(result);
      
      if (parsedAssessment && parsedAssessment.words) {
        console.log(`✅ 결과 ${index + 1} 파싱 성공:`, {
          단어수: parsedAssessment.words.length,
          정확도: parsedAssessment.accuracyScore,
          유창성: parsedAssessment.fluencyScore
        });
        
        // 실제 말한 단어들과 매칭
        const matchedWords = parsedAssessment.words.filter(word => 
          actualWords.some(actualWord => 
            actualWord.includes(word.word) || word.word.includes(actualWord)
          )
        );
        
        console.log(`🎯 매칭된 단어들:`, matchedWords.map(w => w.word));
        
        allWords = [...allWords, ...matchedWords];
        totalAccuracy += parsedAssessment.accuracyScore;
        totalFluency += parsedAssessment.fluencyScore;
        totalCompleteness += parsedAssessment.completenessScore;
        totalPron += parsedAssessment.pronScore;
        totalDuration += result.Duration || 0;
      } else {
        console.warn(`⚠️ 결과 ${index + 1} 파싱 실패`);
      }
    });
    
    if (allWords.length === 0) {
      console.warn('파싱된 단어가 없습니다.');
      alert('⚠️ Azure 평가 결과를 파싱할 수 없습니다. 다시 시도해주세요.');
      return;
    }
    
    // 평균 점수 계산
    const avgAccuracy = Math.round(totalAccuracy / allResults.length);
    const avgFluency = Math.round(totalFluency / allResults.length);
    const avgCompleteness = Math.round(totalCompleteness / allResults.length);
    const avgPron = Math.round(totalPron / allResults.length);
    
    console.log('📊 최종 통합 점수:', {
      정확도: avgAccuracy,
      유창성: avgFluency,
      완성도: avgCompleteness,
      종합점수: avgPron,
      전체단어수: allWords.length
    });
    
    // 통합된 평가 결과 생성
    const integratedAssessment: PronunciationAssessmentResult = {
      accuracyScore: avgAccuracy,
      fluencyScore: avgFluency,
      completenessScore: avgCompleteness,
      pronScore: avgPron,
      words: allWords,
      rawData: allResults
    };
    
    console.log('🎯 통합 평가 결과 완성:', integratedAssessment);
    setAssessmentResult(integratedAssessment);
    
    // 실제 오류 타입 및 phonemes 사용
    const realWordScores = allWords.map(word => ({
      text: word.word,
      score: word.accuracyScore,
      errorType: word.errorType,
      phonemes: word.phonemes
    }));
    setWordScores(realWordScores);
    
    // 감정 분석 (통합된 데이터 기반 계산)
    const emotionAnalysis: EmotionAnalysis = {
      confidence: Math.min(100, avgAccuracy + 10),
      emotion: avgAccuracy > 75 ? '자신있음' : '긴장됨',
      details: {
        speed: Math.floor(recordedText.length / 5 * 60), // 대략적인 속도 계산
        volume: 70, // 기본값
        pitchVariance: Math.floor((100 - avgFluency) * 0.8),
        pauseCount: allResults.length // 구간 수를 일시정지 횟수로 근사
      }
    };
    setEmotionResult(emotionAnalysis);
    
    // ProcessedAssessmentResult 업데이트
    const processedResult: ProcessedAssessmentResult = {
      overallScores: {
        accuracy: Math.round(avgAccuracy),
        fluency: Math.round(avgFluency),
        completeness: Math.round(avgCompleteness),
        pronunciation: Math.round(avgPron)
      },
      wordAnalysis: allWords.map(word => ({
        word: word.word,
        accuracyScore: word.accuracyScore,
        errorType: word.errorType,
        errorDescription: word.errorType === 'None' ? '정확한 발음' : 
                        word.errorType === 'Mispronunciation' ? '발음 오류' :
                        word.errorType === 'Omission' ? '단어 누락' : '단어 삽입',
        suggestions: word.errorType === 'None' ? [] : 
                   word.errorType === 'Mispronunciation' ? ['이 단어의 발음을 다시 연습해보세요'] :
                   word.errorType === 'Omission' ? ['누락된 단어를 포함해서 다시 말해보세요'] :
                   ['불필요한 단어를 제거하고 다시 말해보세요'],
        phonemes: word.phonemes?.map((p: any) => ({
          phoneme: p.phoneme,
          score: p.accuracyScore,
          isCorrect: p.accuracyScore >= 80
        })) || []
      })),
      errorStatistics: {
        totalWords: allWords.length,
        correctWords: allWords.filter(w => w.errorType === 'None').length,
        mispronounced: allWords.filter(w => w.errorType === 'Mispronunciation').length,
        omitted: allWords.filter(w => w.errorType === 'Omission').length,
        inserted: allWords.filter(w => w.errorType === 'Insertion').length,
        accuracy: Math.round(avgAccuracy)
      },
      recommendations: generatePersonalizedFeedback(allWords, integratedAssessment)
    };
    setProcessedAssessment(processedResult);
    
    console.log('🎉 통합 Azure 기반 평가 완료!');
    
    // 평가 완료 플래그 설정
    setIsAssessmentCompleted(true);
    
    // 고급 분석 시스템 실행 (평가 결과 직접 전달)
    performAdvancedAnalysis(integratedAssessment);
  };

  // 기존 함수 (단일 결과용 - 호환성 유지)
  const performAssessmentWithAzureData = (azureData: any) => {
    performAssessmentWithAllAzureData([azureData]);
  };

  // 화면에 표시할 텍스트 결합 함수
  const getDisplayText = () => {
    const confirmedText = recordedText || '';
    const liveText = realTimeText || '';
    
    if (confirmedText && liveText) {
      return `${confirmedText} ${liveText}`;
    }
    return confirmedText || liveText || '';
  };

  // 텍스트 표시 컴포넌트
  const renderRecognizedText = () => {
    const displayText = getDisplayText();
    
    if (!displayText) {
      return (
        <div className="text-gray-500 text-center py-8">
          {isRecording ? '말씀하세요...' : '녹음을 시작하세요'}
        </div>
      );
    }

    return (
      <div className="bg-blue-50 rounded-lg p-4 min-h-[100px]">
        <h4 className="text-sm font-medium text-gray-700 mb-2">
          {isRecording ? '인식 중...' : '인식된 텍스트:'}
        </h4>
        <p className="text-lg text-gray-800 leading-relaxed">
          {/* 확정된 텍스트는 검은색 */}
          <span className="text-gray-800">{recordedText}</span>
          {/* 실시간 텍스트는 파란색으로 구분 */}
          {realTimeText && (
            <span className="text-blue-600 ml-1">{realTimeText}</span>
          )}
        </p>
        
        {/* 누적 상태 표시 */}
        <div className="mt-2 text-xs text-gray-500">
          구문 수: {allRecognizedSegments.length} | 
          Azure 결과: {allAzureResults.length}개 | 
          총 글자: {displayText.length}자
        </div>
      </div>
    );
  };

  const stopRecording = async () => {
    if (!recognizer.current) return;

    try {
      console.log('녹음 중지 시작...');
      setIsSessionActive(false);
      
      await recognizer.current.stopContinuousRecognitionAsync();
      setIsRecording(false);
      console.log('녹음 중지 완료');

      // 최종 누적된 텍스트 확인
      console.log('최종 누적된 구문들:', allRecognizedSegments);
      console.log('최종 전체 텍스트:', recordedText);
      console.log('누적된 Azure 결과 수:', allAzureResults.length);

      // 인식된 텍스트가 있는지 확인
      if (!recordedText || recordedText.trim() === '') {
        console.warn('인식된 텍스트가 없습니다');
        alert('⚠️ 음성이 인식되지 않았습니다. 다시 시도해주세요.');
        return;
      }

      // Azure 결과가 있는지 확인
      if (allAzureResults.length === 0) {
        console.warn('Azure 평가 결과가 없습니다');
        alert('⚠️ 평가 데이터가 없습니다. 다시 시도해주세요.');
        return;
      }

      // 모든 Azure 결과로 통합 평가 실행
      console.log('=== 전체 평가 시작 ===');
      console.log('평가할 텍스트:', recordedText);
      console.log('Azure 결과 수:', allAzureResults.length);
      
      performAssessmentWithAllAzureData(allAzureResults);

    } catch (error) {
      console.error('녹음 중지 및 평가 실패:', error);
      alert('❌ 평가 중 오류가 발생했습니다. 다시 시도해주세요.');
    }
  };

  // 고급 분석 수행 함수
  const performAdvancedAnalysis = async (assessmentData?: PronunciationAssessmentResult) => {
    try {
      // 전달받은 평가 데이터 또는 상태의 평가 결과 사용
      const currentAssessment = assessmentData || assessmentResult;
      
      if (!currentAssessment) {
        console.log('Azure 평가 결과가 없어서 고급 분석을 건너뜁니다.');
        return;
      }

      // 시뮬레이션된 오디오 데이터 사용 (실제 구현에서는 녹음된 데이터 사용)
      const simulatedAudioData = new Float32Array(44100 * 5); // 5초 분량
      for (let i = 0; i < simulatedAudioData.length; i++) {
        simulatedAudioData[i] = (Math.random() - 0.5) * 0.1; // 작은 노이즈
      }
      
      const audioData = simulatedAudioData;
      const sampleRate = 44100;
      const duration = 5;

      // 1. 중국어 성조 분석
      const toneResults = toneAnalyzer.analyzeTones(audioData, sampleRate, currentText);
      setToneAnalysis(toneResults);
      
      // 실제 한자 추출하여 전달
      const chineseChars = currentText.split('').filter(char => /[\u4e00-\u9fff]/.test(char));
      setActualWords(chineseChars);

      // 2. 감정/자신감 분석
      const emotionalResult = emotionalAnalyzer.analyzeEmotion(audioData, sampleRate, duration);
      setEmotionalState(emotionalResult);

      // 3. 학습 세션 데이터 생성 및 저장 (실제 Azure 점수 사용)
      const sessionData: LearningSession = {
        id: Date.now().toString(),
        timestamp: Date.now(),
        duration: duration,
        scores: {
          accuracy: currentAssessment.accuracyScore,
          fluency: currentAssessment.fluencyScore,
          completeness: currentAssessment.completenessScore,
          overall: currentAssessment.pronScore
        },
        mistakes: currentAssessment.words.filter((word: any) => word.errorType !== 'None')
          .map((word: any) => ({
            word: word.word,
            errorType: word.errorType,
            frequency: 1
          })),
        improvements: []
      };

      learningAnalytics.addSession(sessionData);
      
      // 4. 학습 프로필 업데이트
      const profile = learningAnalytics.getProfile();
      setLearningProfile(profile);

      // 5. 맞춤형 조언 생성
      const advice = learningAnalytics.generatePersonalizedAdvice();
      setPersonalizedAdvice(advice);

    } catch (error) {
      console.error('고급 분석 중 오류:', error);
    }
  };

  const toggleAudio = () => {
    if (!player.current) return;
    
    if (isPlaying) {
      // 일시정지
      player.current.pause();
      setIsPlaying(false);
    } else {
      // 재생 - 딜레이 없이 바로 시작
      setIsPlaying(true);
      setCurrentCharIndex(0); // 처음부터 시작
      player.current.play();
    }
  };

  // 한자와 병음을 매칭하여 렌더링하는 함수
  const renderTextWithPinyin = () => {
    if (!currentText || !newsData.length) return null;

    let charIndex = 0; // 전체 텍스트에서의 현재 글자 인덱스
    
    return (
      <div className="bg-gray-50 rounded-lg p-4 leading-relaxed">
        {newsData.map((segment, segmentIndex) => {
          const segmentText = segment.text;
          // 병음에서 구두점 제거 후 공백으로 분리
          const segmentPinyin = segment.pinyin
            .replace(/[,。，；：！？"”'《》]/g, '') // 모든 구두점 제거
            .split(/\s+/) // 공백으로 분리
            .filter(p => p.trim() !== ''); // 빈 문자열 제거
          
          // console.log(`세그먼트 ${segmentIndex + 1}:`, {
          //   text: segmentText,
          //   originalPinyin: segment.pinyin,
          //   cleanedPinyin: segmentPinyin,
          //   chineseCharCount: segmentText.split('').filter(char => /[\u4e00-\u9fff]/.test(char)).length,
          //   pinyinCount: segmentPinyin.length
          // });
          
          // 구두점과 한자를 분리하여 처리
          const segmentElements = segmentText.split('').map((char, localIndex) => {
            const globalIndex = charIndex + localIndex;
            const isHighlighted = globalIndex === currentCharIndex;
            const isPast = globalIndex < currentCharIndex;
            
            // 한자인 경우
            if (/[\u4e00-\u9fff]/.test(char)) {
              // 현재 세그먼트에서 이 한자가 몇 번째 한자인지 찾기
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
            } else {
              // 구두점이나 공백인 경우
              return (
                <span
                  key={`${segmentIndex}-${localIndex}`}
                  className={`inline-block transition-all duration-200 text-2xl ${
                    isHighlighted
                      ? 'bg-yellow-300 text-black'
                      : isPast
                      ? 'bg-green-100 text-gray-800'
                      : 'text-gray-400'
                  }`}
                  style={{
                    transition: 'all 0.2s ease-in-out',
                    marginLeft: char === ',' || char === '。' ? '0.25rem' : '0',
                    marginRight: char === ',' || char === '。' ? '0.5rem' : '0',
                    fontFamily: '"Microsoft YaHei", "SimHei", "PingFang SC", "Hiragino Sans GB", "WenQuanYi Micro Hei", Arial, sans-serif',
                    fontWeight: 'normal',
                    textRendering: 'optimizeLegibility',
                    WebkitFontSmoothing: 'antialiased',
                    MozOsxFontSmoothing: 'grayscale'
                  }}
                >
                  {char === ' ' ? '\u00A0' : char}
                </span>
              );
            }
          });
          
          charIndex += segmentText.length; // 다음 세그먼트를 위해 인덱스 업데이트
          
          return (
            <span key={segmentIndex} className="inline">
              {segmentElements}
              {segmentIndex < newsData.length - 1 && (
                <span className="inline-block w-4"></span> // 세그먼트 간 간격
              )}
            </span>
          );
        })}
      </div>
    );
  };

  // 4단계: 고급 분석 시스템 통합
  const toneAnalyzer = useMemo(() => new ChineseToneAnalyzer(), []);
  const learningAnalytics = useMemo(() => new LearningAnalytics(), []);
  const emotionalAnalyzer = useMemo(() => new EmotionalAnalyzer(), []);

  // 고급 분석 결과 상태
  const [toneAnalysis, setToneAnalysis] = useState<ToneAnalysisResult[]>([]);
  const [emotionalState, setEmotionalState] = useState<EmotionalState | null>(null);
  const [learningProfile, setLearningProfile] = useState<LearningProfile | null>(null);
  const [personalizedAdvice, setPersonalizedAdvice] = useState<Array<{ type: string; message: string; priority: number }>>([]);

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
            🎯 뉴스 쉐도잉 연습
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
                {language === 'zh-CN' && newsData.length > 0 ? (
                  renderTextWithPinyin()
                ) : (
                  <p className="text-2xl text-gray-800" style={{ 
                    fontFamily: '"Microsoft YaHei", "SimHei", "PingFang SC", "Hiragino Sans GB", "WenQuanYi Micro Hei", Arial, sans-serif',
                    fontWeight: 'normal',
                    textRendering: 'optimizeLegibility',
                    WebkitFontSmoothing: 'antialiased',
                    MozOsxFontSmoothing: 'grayscale'
                  }}>
                    {sampleTexts[language]}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* 컨트롤 버튼 */}
          <div className="flex justify-center gap-4 mb-8">
            <button
              onClick={toggleAudio}
              className={`px-6 py-3 rounded-lg font-medium ${
                isPlaying
                  ? 'bg-orange-500 text-white hover:bg-orange-600'
                  : 'bg-blue-500 text-white hover:bg-blue-600'
              }`}
            >
              {isPlaying ? '⏸️ 일시정지' : '▶️ 재생'}
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
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-gray-700 mb-3">인식된 텍스트</h3>
            {renderRecognizedText()}
          </div>

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
                <EnhancedHeatMap 
                  wordScores={wordScores}
                  onWordClick={(word, index) => {
                    // 실제 클릭 핸들링: 예시로 alert 표시
                    alert(`'${word}' 단어의 상세 분석을 확인하세요.`);
                  }}
                />
              </div>
              <div>
                <h4 className="text-sm font-medium text-gray-600 mb-2">유창성 흐름</h4>
                <WaveAnimation fluencyScore={processedAssessment?.overallScores.fluency || 0} />
              </div>
            </div>
          )}

          {/* 평가 결과 */}
          {assessmentResult && (
            <div className="bg-blue-50 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-6">발음 평가 결과</h3>
              
              {/* 레이더 차트 */}
              <div className="mb-8">
                <h4 className="text-lg font-semibold text-gray-700 mb-4">발음 프로필 분석</h4>
                <RadarChart 
                  data={{
                    accuracy: assessmentResult.accuracyScore,
                    fluency: assessmentResult.fluencyScore,
                    completeness: assessmentResult.completenessScore,
                    confidence: emotionResult?.confidence || 0,
                    speed: emotionResult?.details.speed || 0
                  }}
                />
              </div>

              {/* 실시간 진행도 시각화 */}
              <div className="mb-8">
                <h4 className="text-lg font-semibold text-gray-700 mb-4">실시간 점수 현황</h4>
                <RealTimeProgress 
                  scores={{
                    overall: assessmentResult.pronScore,
                    accuracy: assessmentResult.accuracyScore,
                    fluency: assessmentResult.fluencyScore,
                    completeness: assessmentResult.completenessScore
                  }}
                  isRecording={isRecording}
                />
              </div>
              
              {/* 점수 그리드 */}
              <ScoreDashboard assessment={assessmentResult} />

              {/* 단어별 상세 분석 */}
              <WordAnalysisTable words={assessmentResult.words} />

              {/* AI 개선 제안 */}
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-6">
                <h4 className="font-semibold text-gray-700 mb-4 flex items-center gap-2">
                  <span>🤖</span> AI 개선 제안
                </h4>
                
                <div className="grid md:grid-cols-3 gap-4">
                  {/* 강점 */}
                  {processedAssessment.recommendations.strengths.length > 0 && (
                    <div className="bg-white rounded-lg p-4">
                      <h5 className="font-medium text-green-700 mb-2 flex items-center gap-1">
                        <span>✅</span> 강점
                      </h5>
                      <ul className="text-sm space-y-1">
                        {processedAssessment.recommendations.strengths.map((strength: any, index: number) => (
                          <li key={index} className="text-green-600">• {strength}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  
                  {/* 개선점 */}
                  {processedAssessment.recommendations.improvements.length > 0 && (
                    <div className="bg-white rounded-lg p-4">
                      <h5 className="font-medium text-orange-700 mb-2 flex items-center gap-1">
                        <span>⚠️</span> 개선점
                      </h5>
                      <ul className="text-sm space-y-1">
                        {processedAssessment.recommendations.improvements.map((improvement: any, index: number) => (
                          <li key={index} className="text-orange-600">• {improvement}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  
                  {/* 다음 단계 */}
                  {processedAssessment.recommendations.nextSteps.length > 0 && (
                    <div className="bg-white rounded-lg p-4">
                      <h5 className="font-medium text-blue-700 mb-2 flex items-center gap-1">
                        <span>🚀</span> 다음 단계
                      </h5>
                      <ul className="text-sm space-y-1">
                        {processedAssessment.recommendations.nextSteps.map((step: any, index: number) => (
                          <li key={index} className="text-blue-600">• {step}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 6단계: 고급 분석 결과 표시 */}
          {toneAnalysis.length > 0 && (
            <ToneAnalysisDisplay 
              toneAnalysis={toneAnalysis}
              actualWords={actualWords}
            />
          )}

          {emotionalState && (
            <EmotionalAnalysisDisplay emotionalState={emotionalState} />
          )}

          {learningProfile && personalizedAdvice.length > 0 && (
            <LearningProfileDisplay profile={learningProfile} advice={personalizedAdvice} />
          )}
        </div>
      </div>

      {/* 오디오 플레이어 */}
      <audio
        ref={player}
        onEnded={() => {
          setIsPlaying(false);
          setCurrentCharIndex(0);
        }}
        onPlay={() => {
          setIsPlaying(true);
        }}
        onPause={() => {
          setIsPlaying(false);
        }}
        onTimeUpdate={() => {
          // timeupdate 이벤트로도 하이라이트 업데이트 (추가 동기화)
          if (isPlaying && newsData.length && currentText) {
            const currentTime = player.current?.currentTime || 0;
            const newCharIndex = calculateCharIndex(currentTime);
            setCurrentCharIndex(newCharIndex);
          }
        }}
        style={{ display: 'none' }}
      >
        <source src="/news_audio.mp3" type="audio/mpeg" />
      </audio>
    </div>
  );
};

export default ShadowingPractice; 