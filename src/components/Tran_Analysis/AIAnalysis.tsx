import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, orderBy, getDocs, limit } from 'firebase/firestore';
import { db, auth, googleProvider } from '../../firebase';
import { signInWithPopup, onAuthStateChanged } from 'firebase/auth';
import { Line, Radar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  RadialLinearScale,
  Filler,
} from 'chart.js';
import { useAIAnalysis } from '../../hooks/useAIAnalysis';
// 스켈레톤 컴포넌트들을 내부에 정의
const AIAdviceSkeleton: React.FC = () => (
  <div className="bg-gradient-to-r from-blue-500 to-purple-600 text-white p-5 rounded-xl relative overflow-hidden">
    <div className="absolute top-0 right-0 w-24 h-24 bg-white bg-opacity-10 rounded-full transform translate-x-6 -translate-y-6"></div>
    <div className="relative z-10">
      <div className="space-y-3 mb-3">
        <div className="h-4 bg-white bg-opacity-20 rounded animate-pulse"></div>
        <div className="h-4 bg-white bg-opacity-20 rounded animate-pulse" style={{ width: '85%' }}></div>
        <div className="h-4 bg-white bg-opacity-20 rounded animate-pulse" style={{ width: '70%' }}></div>
      </div>
      <div className="h-8 w-32 bg-white bg-opacity-20 rounded-full animate-pulse"></div>
    </div>
  </div>
);

const StyleAnalysisSkeleton: React.FC = () => (
  <div className="bg-white rounded-xl p-5 shadow-lg border border-gray-200">
    <div className="flex items-center mb-4">
      <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl flex items-center justify-center text-white text-2xl mx-auto mb-4 animate-pulse">🤖</div>
    </div>
    <div className="space-y-3">
      <div className="h-6 bg-gray-200 rounded animate-pulse"></div>
      <div className="h-4 bg-gray-200 rounded animate-pulse" style={{ width: '60%' }}></div>
      <div className="h-4 bg-gray-200 rounded animate-pulse" style={{ width: '80%' }}></div>
    </div>
  </div>
);

const MistakeAnalysisSkeleton: React.FC = () => (
  <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-200">
    <h3 className="text-xl font-semibold text-gray-900 mb-5 flex items-center gap-2">
      🔍 AI 실수 패턴 분석
    </h3>
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex items-center p-3 border-b border-gray-100">
          <div className="w-10 h-10 bg-gradient-to-r from-red-500 to-red-600 rounded-lg flex items-center justify-center text-white text-lg mr-3 animate-pulse">📊</div>
          <div className="flex-1">
            <div className="h-4 bg-gray-200 rounded animate-pulse mb-2"></div>
            <div className="h-3 bg-gray-200 rounded animate-pulse" style={{ width: '70%' }}></div>
          </div>
          <div className="h-6 w-16 bg-red-500 rounded-full animate-pulse"></div>
        </div>
      ))}
    </div>
  </div>
);

const PlanOptimizationSkeleton: React.FC = () => (
  <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-200">
    <h3 className="text-xl font-semibold text-gray-900 mb-5 flex items-center gap-2">
      🎯 AI 학습 계획 최적화
    </h3>
    <div className="space-y-3">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex items-center p-3 rounded-xl bg-gray-50">
          <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center text-gray-600 text-sm mr-3 animate-pulse">○</div>
          <div className="flex-1">
            <div className="h-4 bg-gray-200 rounded animate-pulse mb-1"></div>
            <div className="h-3 bg-gray-200 rounded animate-pulse" style={{ width: '60%' }}></div>
          </div>
          <div className="h-4 w-12 bg-gray-200 rounded animate-pulse"></div>
        </div>
      ))}
    </div>
  </div>
);

const AIEnhanced: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="relative">
    {children}
    <div className="absolute top-2 right-2 text-xs bg-blue-500 text-white px-2 py-1 rounded-full opacity-80">
      🤖 AI
    </div>
  </div>
);
import type { TranslationMistake } from '../../services/aiAnalysisService';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  RadialLinearScale,
  Filler
);

// StudySession 타입 정의
interface StudySession {
  id: string;
  date: string;
  gameType: string;
  totalScore: number;
  problemCount: number;
  studyTime: number;
  averageScore: number;
  metadata?: {
    difficulty?: string;
    domain?: string;
    targetLanguage?: string;
  };
}

// 새로운 인터페이스들 추가
interface WeeklyPlan {
  weekStart: string; // YYYY-MM-DD
  tasks: DailyTask[];
  overallProgress: number;
}

interface DailyTask {
  day: string; // 'monday', 'tuesday', etc.
  title: string;
  description: string;
  targetArea: string; // 약점 분야
  estimatedTime: number; // 분 단위
  status: 'completed' | 'in-progress' | 'pending';
  completedAt?: string;
}

interface Recommendation {
  id: string;
  type: 'improvement' | 'content' | 'challenge';
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  targetArea: string;
  actionUrl?: string;
  estimatedImpact: number; // 예상 점수 향상
}

// 레이더 차트 데이터 타입 정의
interface RadarChartData {
  vocabulary: number;      // 어휘력
  accuracy: number;        // 번역 정확도
  speed: number;          // 번역 속도
  context: number;        // 문맥 이해도
  bidirectional: number;  // 양방향 번역
  realtime: number;       // 실시간 번역
}

// 가상 AI 분석 데이터 생성 함수
const createAIDemoData = () => ({
  sessions: [
    {
      id: 'demo1',
      date: '2024-01-15T10:30:00Z',
      gameType: '문맥 어휘 퀴즈',
      totalScore: 85,
      problemCount: 10,
      studyTime: 1800,
      averageScore: 85,
      metadata: { domain: '어휘', difficulty: 'medium' }
    },
    {
      id: 'demo2',
      date: '2024-01-14T14:20:00Z',
      gameType: '비즈니스 번역',
      totalScore: 92,
      problemCount: 8,
      studyTime: 1200,
      averageScore: 92,
      metadata: { domain: '비즈니스', difficulty: 'hard' }
    },
    {
      id: 'demo3',
      date: '2024-01-13T09:15:00Z',
      gameType: '일상회화 번역',
      totalScore: 78,
      problemCount: 12,
      studyTime: 1500,
      averageScore: 78,
      metadata: { domain: '일상회화', difficulty: 'easy' }
    },
    {
      id: 'demo4',
      date: '2024-01-12T16:45:00Z',
      gameType: '기술 번역',
      totalScore: 88,
      problemCount: 6,
      studyTime: 900,
      averageScore: 88,
      metadata: { domain: '기술', difficulty: 'hard' }
    },
    {
      id: 'demo5',
      date: '2024-01-11T11:30:00Z',
      gameType: '의료 번역',
      totalScore: 75,
      problemCount: 15,
      studyTime: 2100,
      averageScore: 75,
      metadata: { domain: '의료', difficulty: 'hard' }
    }
  ],
  radarData: {
    vocabulary: 87,      // 어휘력
    accuracy: 92,        // 번역 정확도
    speed: 76,          // 번역 속도
    context: 84,        // 문맥 이해도
    bidirectional: 88,  // 양방향 번역
    realtime: 79       // 실시간 번역
  },
  growthPrediction: [85, 87, 89, 91, 93, 95, 97],
  optimalTime: { hour: 14, score: 88, timeRange: '14:00-15:00' },
  diagnosisScores: { styleScore: 87, contextScore: 90, speedScore: 76 },
  streakDays: 5,
  weeklyPlan: {
    weekStart: '2024-01-15',
    tasks: [
      {
        day: 'monday',
        title: '어휘력 강화',
        description: '문맥 어휘 퀴즈 20문제 완료',
        targetArea: '어휘',
        estimatedTime: 25,
        status: 'completed'
      },
      {
        day: 'tuesday', 
        title: '문법 정확성',
        description: '역번역 연습 15분',
        targetArea: '문법',
        estimatedTime: 15,
        status: 'completed'
      },
      {
        day: 'wednesday',
        title: '속도 향상', 
        description: '시간제한 번역 게임 3라운드',
        targetArea: '속도',
        estimatedTime: 20,
        status: 'in-progress'
      },
      {
        day: 'thursday',
        title: '실전 연습',
        description: '자막 번역 연습',
        targetArea: '실전 응용',
        estimatedTime: 30,
        status: 'pending' as const
      },
      {
        day: 'friday',
        title: '종합 복습',
        description: '일상회화 분야 집중 학습',
        targetArea: '일상회화',
        estimatedTime: 35,
        status: 'pending' as const
      }
    ],
    overallProgress: 40
  },
  improvementSuggestions: [
    {
      id: 'improvement-의료',
      type: 'improvement' as const,
      priority: 'high' as const,
      title: '의료 분야 집중 학습',
      description: '전문 용어 학습에 집중하세요',
      targetArea: '의료',
      estimatedImpact: 8
    },
    {
      id: 'improvement-속도',
      type: 'improvement' as const,
      priority: 'medium' as const,
      title: '속도 향상 훈련',
      description: '시간제한 게임으로 순발력 기르기',
      targetArea: '번역 속도',
      estimatedImpact: 6
    },
    {
      id: 'improvement-일상회화',
      type: 'improvement' as const,
      priority: 'low' as const,
      title: '일상회화 분야 집중 학습',
      description: '구어체 표현 학습을 늘려보세요',
      targetArea: '일상회화',
      estimatedImpact: 4
    }
  ],
  personalizedAdvice: [
    '5일 연속 학습 중! 일주일 연속을 목표로 조금만 더 힘내세요.',
    '비즈니스 분야에서 탁월한 성과를 보이고 있어요! 평균 92점을 달성했습니다.',
    '의료 분야 학습을 늘려보세요. 현재 75점으로 향상 여지가 큽니다.'
  ],
  contentRecommendations: [
    {
      id: 'content-번역속도',
      type: 'content' as const,
      priority: 'medium' as const,
      title: '시간제한 번역 게임',
      description: '번역 속도 향상에 최적',
      targetArea: '번역 속도',
      actionUrl: '/practice/timed',
      estimatedImpact: 5
    },
    {
      id: 'content-어휘력',
      type: 'content' as const,
      priority: 'medium' as const,
      title: '문맥 어휘 퀴즈',
      description: '어휘력 향상에 최적',
      targetArea: '어휘력',
      actionUrl: '/practice/vocabquiz',
      estimatedImpact: 5
    },
    {
      id: 'content-양방향번역',
      type: 'content' as const,
      priority: 'medium' as const,
      title: '역번역 연습',
      description: '양방향 번역 실력 향상에 최적',
      targetArea: '양방향 번역',
      actionUrl: '/practice/reverse-translation',
      estimatedImpact: 5
    }
  ],
  dailyChallenge: {
    id: 'daily-challenge',
    type: 'challenge' as const,
    priority: 'high' as const,
    title: '의료 용어 번역 15문제 완료',
    description: '전문 용어 정확도 향상시키기',
    targetArea: '의료',
    estimatedImpact: 5
  }
});

// 레이더 차트 데이터 계산
const calculateRadarData = (sessions: StudySession[]): RadarChartData => {
  // 기본값 설정
  const defaultData: RadarChartData = {
    vocabulary: 75,      // 어휘력
    accuracy: 80,        // 번역 정확도
    speed: 70,          // 번역 속도
    context: 78,        // 문맥 이해도
    bidirectional: 75,  // 양방향 번역
    realtime: 72       // 실시간 번역
  };

  if (sessions.length === 0) {
    return defaultData;
  }

  // 어휘력 계산 (문맥 어휘 퀴즈 성과)
  const vocabSessions = sessions.filter(s => 
    s.gameType.includes('어휘') || s.gameType.includes('vocab')
  );
  const vocabulary = vocabSessions.length > 0 
    ? Math.round(vocabSessions.reduce((sum, s) => sum + s.averageScore, 0) / vocabSessions.length)
    : defaultData.vocabulary;

  // 번역 정확도 계산 (전체 평균)
  const accuracy = Math.round(
    sessions.reduce((sum, s) => sum + s.averageScore, 0) / sessions.length
  );

  // 번역 속도 계산 (시간제한 게임 성과)
  const speedSessions = sessions.filter(s => 
    s.gameType.includes('시간제한') || s.gameType.includes('timed')
  );
  const speed = speedSessions.length > 0 
    ? Math.round(speedSessions.reduce((sum, s) => sum + s.averageScore, 0) / speedSessions.length)
    : defaultData.speed;

  // 문맥 이해도 계산 (긴 문장 번역 정확도)
  const contextSessions = sessions.filter(s => s.problemCount > 10);
  const context = contextSessions.length > 0 
    ? Math.round(contextSessions.reduce((sum, s) => sum + s.averageScore, 0) / contextSessions.length)
    : defaultData.context;

  // 양방향 번역 계산 (역번역 연습 성과)
  const bidirectionalSessions = sessions.filter(s => 
    s.gameType.includes('역번역') || s.gameType.includes('reverse')
  );
  const bidirectional = bidirectionalSessions.length > 0 
    ? Math.round(bidirectionalSessions.reduce((sum, s) => sum + s.averageScore, 0) / bidirectionalSessions.length)
    : defaultData.bidirectional;

  // 실시간 번역 계산 (자막 번역 연습 성과)
  const realtimeSessions = sessions.filter(s => 
    s.gameType.includes('자막') || s.gameType.includes('subtitle')
  );
  const realtime = realtimeSessions.length > 0 
    ? Math.round(realtimeSessions.reduce((sum, s) => sum + s.averageScore, 0) / realtimeSessions.length)
    : defaultData.realtime;

  return {
    vocabulary,
    accuracy,
    speed,
    context,
    bidirectional,
    realtime
  };
};

// 성장 예측 계산
const calculateGrowthPrediction = (sessions: StudySession[]) => {
  if (sessions.length === 0) {
    // 세션 데이터가 없으면 기본 성장 예측 반환
    return [85, 87, 89, 91, 93, 95, 97];
  }
  
  // 월별 평균 점수 계산
  const monthlyScores = sessions.reduce((acc, session) => {
    const month = new Date(session.date).toISOString().slice(0, 7); // YYYY-MM
    if (!acc[month]) acc[month] = [];
    acc[month].push(session.averageScore);
    return acc;
  }, {} as Record<string, number[]>);
  
  const monthlyAvg = Object.entries(monthlyScores).map(([month, scores]) => ({
    month,
    avgScore: scores.reduce((sum, score) => sum + score, 0) / scores.length
  })).sort((a, b) => a.month.localeCompare(b.month));
  
  // 현재 점수 계산
  const currentScore = sessions.reduce((sum, s) => sum + s.averageScore, 0) / sessions.length;
  
  // 성장 추세 계산
  let trend = 2; // 기본 월 2점 상승
  
  if (monthlyAvg.length > 1) {
    const firstMonth = monthlyAvg[0].avgScore;
    const lastMonth = monthlyAvg[monthlyAvg.length - 1].avgScore;
    trend = (lastMonth - firstMonth) / monthlyAvg.length;
  }
  
  // 향후 6개월 예측 (현재 점수부터 시작)
  return Array.from({ length: 7 }, (_, i) => 
    Math.min(100, Math.max(80, Math.round(currentScore + (trend * i))))
  );
};

// 최적 학습 시간 분석
const findOptimalStudyTime = (sessions: StudySession[]) => {
  const hourlyPerformance = Array(24).fill(0).map(() => ({ total: 0, count: 0 }));
  
  sessions.forEach(session => {
    const hour = new Date(session.date).getHours();
    hourlyPerformance[hour].total += session.averageScore;
    hourlyPerformance[hour].count += 1;
  });
  
  const hourlyAvg = hourlyPerformance.map((data, hour) => ({
    hour,
    avgScore: data.count > 0 ? data.total / data.count : 0,
    sessions: data.count
  })).filter(data => data.sessions >= 3); // 최소 3번 이상 학습한 시간대만
  
  // 빈 배열인 경우 기본값 반환
  if (hourlyAvg.length === 0) {
    return {
      hour: 14, // 오후 2시를 기본값으로
      score: 85,
      timeRange: '14:00-15:00'
    };
  }
  
  const optimalTime = hourlyAvg.reduce((best, current) => 
    current.avgScore > best.avgScore ? current : best
  );
  
  return {
    hour: optimalTime.hour,
    score: Math.round(optimalTime.avgScore),
    timeRange: `${optimalTime.hour}:00-${optimalTime.hour + 1}:00`
  };
};

// 진단 점수 계산
const calculateDiagnosisScores = (sessions: StudySession[]) => {
  if (sessions.length === 0) {
    return {
      styleScore: 85,
      contextScore: 90,
      speedScore: 80
    };
  }
  
  // 번역 스타일 점수: 전체 평균
  const styleScore = Math.round(
    sessions.reduce((sum, s) => sum + s.averageScore, 0) / sessions.length
  );
  
  // 문맥 이해도: 긴 문장 번역 정확도
  const longTextSessions = sessions.filter(s => s.problemCount > 10);
  const contextScore = longTextSessions.length > 0 
    ? Math.round(longTextSessions.reduce((sum, s) => sum + s.averageScore, 0) / longTextSessions.length)
    : 90;
  
  // 번역 속도: 시간당 문제 해결 수
  const totalTime = sessions.reduce((sum, s) => sum + s.studyTime, 0);
  const totalProblems = sessions.reduce((sum, s) => sum + s.problemCount, 0);
  const problemsPerHour = totalTime > 0 ? (totalProblems / totalTime) * 3600 : 10;
  const speedScore = Math.min(100, Math.round(problemsPerHour * 10)); // 시간당 10문제 = 100점
  
  return { styleScore, contextScore, speedScore };
};

// 주간 학습 계획 생성
const generateWeeklyPlan = (sessions: StudySession[], radarData: RadarChartData): WeeklyPlan => {
  // 약점 분야 상위 3개 추출
  const areas = [
    { label: '어휘력', score: radarData.vocabulary },
    { label: '번역 정확도', score: radarData.accuracy },
    { label: '번역 속도', score: radarData.speed },
    { label: '문맥 이해도', score: radarData.context },
    { label: '양방향 번역', score: radarData.bidirectional },
    { label: '실시간 번역', score: radarData.realtime }
  ];
  const weakestAreas = areas
    .sort((a, b) => a.score - b.score)
    .slice(0, 3);
  
  // 요일별 학습 계획 생성
  const dailyPlans: DailyTask[] = [
    {
      day: 'monday',
      title: '어휘력 강화',
      description: `${weakestAreas[0]?.label || '어휘'} 퀴즈 20문제 완료`,
      targetArea: weakestAreas[0]?.label || '어휘',
      estimatedTime: 25,
      status: 'completed' as const
    },
    {
      day: 'tuesday', 
      title: '문법 정확성',
      description: '역번역 연습 15분',
      targetArea: '문법',
      estimatedTime: 15,
      status: 'completed' as const
    },
    {
      day: 'wednesday',
      title: '속도 향상', 
      description: '시간제한 번역 게임 3라운드',
      targetArea: weakestAreas[1]?.label || '속도',
      estimatedTime: 20,
      status: 'in-progress' as const
    },
    {
      day: 'thursday',
      title: '실전 연습',
      description: '자막 번역 연습',
      targetArea: '실전 응용',
      estimatedTime: 30,
      status: 'pending' as const
    },
    {
      day: 'friday',
      title: '종합 복습',
      description: `${weakestAreas[2]?.label || '일상회화'} 분야 집중 학습`,
      targetArea: weakestAreas[2]?.label || '일상회화',
      estimatedTime: 35,
      status: 'pending' as const
    }
  ];

  const completedTasks = dailyPlans.filter(task => task.status === 'completed').length;
  
  return {
    weekStart: new Date().toISOString().split('T')[0], // 오늘 날짜를 주 시작으로
    tasks: dailyPlans,
    overallProgress: (completedTasks / dailyPlans.length) * 100
  };
};

// 개선 제안 생성
const generateImprovementSuggestions = (
  radarData: RadarChartData, 
  sessions: StudySession[]
): Recommendation[] => {
  const recommendations: Recommendation[] = [];
  
  // 가장 낮은 점수 3개 영역
  const areas = [
    { label: '어휘력', score: radarData.vocabulary },
    { label: '번역 정확도', score: radarData.accuracy },
    { label: '번역 속도', score: radarData.speed },
    { label: '문맥 이해도', score: radarData.context },
    { label: '양방향 번역', score: radarData.bidirectional },
    { label: '실시간 번역', score: radarData.realtime }
  ];
  const weakestAreas = areas
    .sort((a, b) => a.score - b.score)
    .slice(0, 3);
  
  weakestAreas.forEach((area, index) => {
    const priority = index === 0 ? 'high' : index === 1 ? 'medium' : 'low';
    const impact = Math.max(5, 100 - area.score); // 점수가 낮을수록 향상 여지 큼
    
    recommendations.push({
      id: `improvement-${area.label}`,
      type: 'improvement',
      priority,
      title: `${area.label} 분야 집중 학습`,
      description: getImprovementDescription(area.label, area.score),
      targetArea: area.label,
      estimatedImpact: Math.round(impact * 0.3) // 30% 반영
    });
  });
  
  // 속도 개선 제안 (시간제한 게임 정확도가 낮은 경우)
  const timedGameSessions = sessions.filter(s => 
    s.gameType.includes('시간제한') || s.gameType.includes('timed')
  );
  
  if (timedGameSessions.length > 0) {
    const avgTimedScore = timedGameSessions.reduce((sum, s) => sum + s.averageScore, 0) / timedGameSessions.length;
    const normalSessions = sessions.filter(s => !s.gameType.includes('시간제한'));
    const avgNormalScore = normalSessions.length > 0 
      ? normalSessions.reduce((sum, s) => sum + s.averageScore, 0) / normalSessions.length 
      : 85;
    
    if (avgTimedScore < avgNormalScore - 10) {
      recommendations.push({
        id: 'speed-improvement',
        type: 'improvement',
        priority: 'medium',
        title: '속도 향상 훈련',
        description: '시간제한 게임으로 순발력 기르기',
        targetArea: '번역 속도',
        estimatedImpact: Math.round((avgNormalScore - avgTimedScore) * 0.5)
      });
    }
  }
  
  return recommendations;
};

const getImprovementDescription = (area: string, score: number): string => {
  const descriptions: Record<string, string> = {
    'K-POP': '가장 낮은 점수 분야, 하루 15분 투자 추천',
    '의료': '전문 용어 학습에 집중하세요',
    '기술': 'IT 관련 번역 연습이 필요합니다',
    '일상회화': '구어체 표현 학습을 늘려보세요',
    '비즈니스': '격식체 번역 연습을 추천합니다',
    '문법': '문법 규칙 복습이 필요합니다',
    '어휘': '어휘력 향상을 위한 학습이 필요합니다',
    '관용어': '관용어 표현 학습을 늘려보세요',
    '문맥': '문맥 이해력 향상이 필요합니다',
    '속도': '번역 속도 향상이 필요합니다',
    '짧은글': '짧은 글 번역 연습이 필요합니다',
    '중간글': '중간 길이 글 번역 연습이 필요합니다',
    '긴글': '긴 글 번역 연습이 필요합니다',
    '대화': '대화체 번역 연습이 필요합니다',
    '시간제한': '시간제한 번역 연습이 필요합니다'
  };
  
  return descriptions[area] || `${score}점대로 개선이 필요한 분야입니다`;
};

// 학습 조언 생성
const generatePersonalizedAdvice = (
  sessions: StudySession[], 
  streakDays: number,
  radarData: RadarChartData
): string[] => {
  const advice: string[] = [];
  
  // 연속 학습일 기반 조언
  if (streakDays >= 7) {
    advice.push(`${streakDays}일 연속 학습 중이에요! 꾸준함이 실력 향상의 비결입니다. 이 페이스를 유지해보세요.`);
  } else if (streakDays >= 3) {
    advice.push(`${streakDays}일 연속 학습 중! 일주일 연속을 목표로 조금만 더 힘내세요.`);
  } else {
    advice.push('꾸준한 학습이 실력 향상의 핵심이에요. 매일 조금씩이라도 학습해보세요.');
  }
  
  // 강한 분야 기반 격려
  const areas = [
    { label: '어휘력', score: radarData.vocabulary },
    { label: '번역 정확도', score: radarData.accuracy },
    { label: '번역 속도', score: radarData.speed },
    { label: '문맥 이해도', score: radarData.context },
    { label: '양방향 번역', score: radarData.bidirectional },
    { label: '실시간 번역', score: radarData.realtime }
  ];
  const strongestArea = areas.sort((a, b) => b.score - a.score)[0];
  if (strongestArea && strongestArea.score >= 85) {
    advice.push(`${strongestArea.label} 분야에서 탁월한 성과를 보이고 있어요! 평균 ${strongestArea.score}점을 달성했습니다.`);
  }
  
  // 약한 분야 기반 조언
  const weakestArea = areas.sort((a, b) => a.score - b.score)[0];
  if (weakestArea && weakestArea.score < 75) {
    advice.push(`${weakestArea.label} 분야 학습을 늘려보세요. 현재 ${weakestArea.score}점으로 향상 여지가 큽니다.`);
  }
  
  // 최근 성과 분석
  const recentSessions = sessions.slice(0, 5);
  const olderSessions = sessions.slice(5, 10);
  
  if (recentSessions.length >= 3 && olderSessions.length >= 3) {
    const recentAvg = recentSessions.reduce((sum, s) => sum + s.averageScore, 0) / recentSessions.length;
    const olderAvg = olderSessions.reduce((sum, s) => sum + s.averageScore, 0) / olderSessions.length;
    
    if (recentAvg > olderAvg + 3) {
      const improvement = Math.round(((recentAvg - olderAvg) / olderAvg) * 100);
      advice.push(`최근 성과가 ${improvement}% 향상되었어요! 노력의 결과가 나타나고 있습니다.`);
    } else if (recentAvg < olderAvg - 3) {
      advice.push('최근 컨디션이 좋지 않은 것 같아요. 충분한 휴식 후 다시 도전해보세요.');
    }
  }
  
  return advice.slice(0, 3); // 최대 3개
};

// 콘텐츠 추천 시스템
const generateContentRecommendations = (
  weakestAreas: string[],
  userLevel: number
): Recommendation[] => {
  // 새로운 레이더 차트 축에 맞춘 콘텐츠 매핑
  const contentMapping: Record<string, {title: string, url: string, description: string}> = {
    '어휘력': {
      title: '문맥 어휘 퀴즈',
      url: '/practice/vocabquiz',
      description: '어휘력 향상에 최적'
    },
    '번역 정확도': {
      title: '역번역 연습',
      url: '/practice/reverse-translation',
      description: '번역 정확도 향상에 최적'
    },
    '번역 속도': {
      title: '시간제한 번역 게임',
      url: '/practice/timed',
      description: '번역 속도 향상에 최적'
    },
    '문맥 이해도': {
      title: '문맥 어휘 퀴즈',
      url: '/practice/vocabquiz',
      description: '문맥 이해도 향상에 최적'
    },
    '양방향 번역': {
      title: '역번역 연습',
      url: '/practice/reverse-translation',
      description: '양방향 번역 실력 향상에 최적'
    },
    '실시간 번역': {
      title: '자막 번역 연습',
      url: '/subtitle-intro',
      description: '실시간 번역 실력 향상에 최적'
    }
  };
  
  const recommendations: Recommendation[] = [];
  
  weakestAreas.slice(0, 3).forEach((area, index) => {
    const content = contentMapping[area] || {
      title: '문맥 어휘 퀴즈',
      url: '/practice/vocabquiz',
      description: '전반적인 실력 향상에 최적'
    };
    
    recommendations.push({
      id: `content-${area}-${index}`,
      type: 'content',
      priority: 'medium',
      title: content.title,
      description: content.description,
      targetArea: area,
      actionUrl: content.url,
      estimatedImpact: 5
    });
  });
  
  return recommendations;
};

// 오늘의 도전 과제 생성
const generateDailyChallenge = (
  weakestArea: string,
  currentScore: number
): Recommendation => {
  const challenges: Record<string, {title: string, description: string, action: string}> = {
    '어휘': {
      title: '문맥 어휘 퀴즈 15문제 완료',
      description: '어휘력 향상 및 문맥 이해도 증진',
      action: '어휘 퀴즈 도전'
    },
    '의료': {
      title: '의료 용어 번역 15문제 완료',
      description: '전문 용어 정확도 향상시키기',
      action: '의료 번역 도전'
    },
    '속도': {
      title: '시간제한 번역 3라운드 완료',
      description: '평균 시간 10% 단축하기',
      action: '속도 향상 도전'
    },
    '일상회화': {
      title: '드라마 자막 번역 20문제 완료',
      description: '일상 대화 번역 실력 향상',
      action: '일상회화 도전'
    },
    '비즈니스': {
      title: '회의록 번역 5문제 완료',
      description: '비즈니스 번역 정확도 향상',
      action: '비즈니스 도전'
    }
  };
  
  const challenge = challenges[weakestArea] || challenges['어휘'];
  
  return {
    id: 'daily-challenge',
    type: 'challenge',
    priority: 'high',
    title: challenge.title,
    description: challenge.description,
    targetArea: weakestArea,
    estimatedImpact: 5
  };
};

// 연속 학습일 계산
const calculateStreakDays = (sessions: StudySession[]): number => {
  if (sessions.length === 0) return 0;
  const uniqueDays = [...new Set(sessions.map(s => s.date.split('T')[0]))];
  uniqueDays.sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
  let streak = 0;
  const today = new Date().toISOString().split('T')[0];
  let currentDate = new Date(today);
  for (let i = 0; i < uniqueDays.length; i++) {
    const sessionDate = currentDate.toISOString().split('T')[0];
    if (uniqueDays.includes(sessionDate)) {
      streak++;
      currentDate.setDate(currentDate.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
};

// 기존 연습 페이지들로 연결하는 함수들
const getRandomPracticePage = (excludeDomains: string[] = []) => {
  const practicePages = [
    '/practice/vocabquiz', // 문맥 어휘 퀴즈
    '/subtitle-intro', // 자막 번역 연습
    '/practice/reverse-translation', // 역번역 연습
    '/practice/timed', // 시간제한 번역 게임
    '/translation/visual-interpretation', // 영상 통역
    '/translation/ppt-interpretation', // PPT 통역
    '/interpreting/memory', // 메모리 트레이닝
    '/interpreting/shadowing', // 쉐도잉 평가
  ];
  
  // 제외할 도메인에 해당하는 페이지들 필터링
  const availablePages = practicePages.filter(page => {
    if (excludeDomains.includes('시간제한') && page.includes('timed')) return false;
    if (excludeDomains.includes('자막') && page.includes('subtitle')) return false;
    if (excludeDomains.includes('역번역') && page.includes('reverse')) return false;
    if (excludeDomains.includes('어휘') && page.includes('vocabquiz')) return false;
    return true;
  });
  
  // 사용 가능한 페이지가 없으면 전체 목록에서 랜덤 선택
  const pagesToUse = availablePages.length > 0 ? availablePages : practicePages;
  return pagesToUse[Math.floor(Math.random() * pagesToUse.length)];
};

const getWeakestAreaPage = (weakestAreas: string[]) => {
  const areaToPageMap: Record<string, string> = {
    '의료': '/subtitle-intro', // 자막 번역으로 연결
    '기술': '/practice/reverse-translation', // 역번역으로 연결
    '일상회화': '/practice/vocabquiz', // 어휘 퀴즈로 연결
    '비즈니스': '/subtitle-intro', // 자막 번역으로 연결
    '문법': '/practice/reverse-translation', // 역번역으로 연결
    '어휘': '/practice/vocabquiz', // 어휘 퀴즈로 연결
    '관용어': '/practice/vocabquiz', // 어휘 퀴즈로 연결
    '문맥': '/practice/vocabquiz', // 어휘 퀴즈로 연결
    '속도': '/practice/timed', // 시간제한 게임으로 연결
  };
  
  // 가장 약한 분야에 해당하는 페이지 반환
  for (const area of weakestAreas) {
    if (areaToPageMap[area]) {
      return areaToPageMap[area];
    }
  }
  
  // 기본값
  return '/practice/vocabquiz';
};

const getWeeklyPlanPage = (task: DailyTask) => {
  const taskToPageMap: Record<string, string> = {
    '어휘력 강화': '/practice/vocabquiz',
    '문법 정확성': '/practice/reverse-translation',
    '속도 향상': '/practice/timed',
    '실전 연습': '/subtitle-intro',
    '종합 복습': '/practice/vocabquiz',
  };
  
  return taskToPageMap[task.title] || '/practice/vocabquiz';
};

const getDailyChallengePage = (challenge: Recommendation) => {
  const challengeToPageMap: Record<string, string> = {
    '의료': '/subtitle-intro',
    '속도': '/practice/timed',
    '일상회화': '/practice/vocabquiz',
    '비즈니스': '/subtitle-intro',
    '기술': '/practice/reverse-translation',
    '문법': '/practice/reverse-translation',
    '어휘': '/practice/vocabquiz',
    '관용어': '/practice/vocabquiz',
    '문맥': '/practice/vocabquiz',
    '번역 속도': '/practice/timed',
    '번역 스타일': '/subtitle-intro',
  };
  
  return challengeToPageMap[challenge.targetArea] || '/practice/vocabquiz';
};

const AIAnalysis: React.FC = () => {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<StudySession[]>([]);
  const [loading, setLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [weeklyPlan, setWeeklyPlan] = useState<WeeklyPlan | null>(null);
  const [taskStatuses, setTaskStatuses] = useState<Record<string, 'completed' | 'in-progress' | 'pending'>>({});
  const [translationSamples, setTranslationSamples] = useState<TranslationMistake[]>([]);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  
  // AI 분석 훅
  const { aiResponses, loading: aiLoading, error: aiError, generateAdvice, analyzeStyle, analyzeMistakes, optimizePlan } = useAIAnalysis();

  // Google 로그인
  const handleGoogleLogin = async () => {
    try {
      googleProvider.setCustomParameters({ prompt: 'select_account' });
      const result = await signInWithPopup(auth, googleProvider);
      console.log('로그인 성공:', result.user);
      setShowLoginPrompt(false);
    } catch (err: any) {
      console.error('로그인 실패:', err);
      if (err.code !== 'auth/popup-closed-by-user') {
        alert('로그인에 실패했습니다. 다시 시도해주세요.');
      }
    }
  };

  // 로그인 상태 감지
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setIsLoggedIn(true);
        setShowLoginPrompt(false);
      } else {
        setIsLoggedIn(false);
        setShowLoginPrompt(true);
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  // 데이터 fetch
  useEffect(() => {
    const fetchSessions = async () => {
      if (!auth.currentUser || !isLoggedIn) return;
      setLoading(true);
      setError(null);
      try {
        const userId = auth.currentUser.uid;
        const sessionsRef = collection(db, 'users', userId, 'sessions');
        const sessionsQuery = query(sessionsRef, orderBy('date', 'desc'), limit(100));
        const querySnapshot = await getDocs(sessionsQuery);
        const fetched: StudySession[] = [];
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          if (data.date && data.gameType && typeof data.averageScore === 'number') {
            fetched.push({ id: doc.id, ...data } as StudySession);
          }
        });
        setSessions(fetched);
      } catch (err: any) {
        setError('학습 데이터 로드 실패: ' + (err.message || err));
      } finally {
        setLoading(false);
      }
    };
    
    if (isLoggedIn) {
      fetchSessions();
    }
  }, [isLoggedIn]);

  // 가상 데이터 생성
  const demoData = useMemo(() => createAIDemoData(), []);
  
  // 계산된 데이터들 - 로그인 안된 경우 가상 데이터 사용
  const radarData = useMemo(() => {
    if (!isLoggedIn) return demoData.radarData;
    return calculateRadarData(sessions);
  }, [sessions, isLoggedIn, demoData.radarData]);
  
  const growthPrediction = useMemo(() => {
    if (!isLoggedIn) return demoData.growthPrediction;
    return calculateGrowthPrediction(sessions);
  }, [sessions, isLoggedIn, demoData.growthPrediction]);
  
  const optimalTime = useMemo(() => {
    if (!isLoggedIn) return demoData.optimalTime;
    return findOptimalStudyTime(sessions);
  }, [sessions, isLoggedIn, demoData.optimalTime]);
  
  const diagnosisScores = useMemo(() => {
    if (!isLoggedIn) return demoData.diagnosisScores;
    return calculateDiagnosisScores(sessions);
  }, [sessions, isLoggedIn, demoData.diagnosisScores]);
  
  const streakDays = useMemo(() => {
    if (!isLoggedIn) return demoData.streakDays;
    return calculateStreakDays(sessions);
  }, [sessions, isLoggedIn, demoData.streakDays]);
  
  // 새로운 계산된 데이터들
  const weeklyPlanData = useMemo(() => {
    if (!isLoggedIn) return demoData.weeklyPlan;
    return generateWeeklyPlan(sessions, radarData);
  }, [sessions, radarData, isLoggedIn, demoData.weeklyPlan]);
  
  const improvementSuggestions = useMemo(() => {
    if (!isLoggedIn) return demoData.improvementSuggestions;
    return generateImprovementSuggestions(radarData, sessions);
  }, [radarData, sessions, isLoggedIn, demoData.improvementSuggestions]);
  
  const personalizedAdvice = useMemo(() => {
    if (!isLoggedIn) return demoData.personalizedAdvice;
    return generatePersonalizedAdvice(sessions, streakDays, radarData);
  }, [sessions, streakDays, radarData, isLoggedIn, demoData.personalizedAdvice]);
  
  const weakestAreas = useMemo(() => {
    const areas = [
      { label: '어휘력', score: radarData.vocabulary },
      { label: '번역 정확도', score: radarData.accuracy },
      { label: '번역 속도', score: radarData.speed },
      { label: '문맥 이해도', score: radarData.context },
      { label: '양방향 번역', score: radarData.bidirectional },
      { label: '실시간 번역', score: radarData.realtime }
    ];
    return areas.sort((a, b) => a.score - b.score).slice(0, 3).map(item => item.label);
  }, [radarData]);
  
  const contentRecommendations = useMemo(() => {
    if (!isLoggedIn) return demoData.contentRecommendations;
    return generateContentRecommendations(weakestAreas, diagnosisScores.styleScore);
  }, [weakestAreas, diagnosisScores.styleScore, isLoggedIn, demoData.contentRecommendations]);
  
  const dailyChallenge = useMemo(() => {
    if (!isLoggedIn) return demoData.dailyChallenge;
    return generateDailyChallenge(weakestAreas[0] || '어휘', diagnosisScores.styleScore);
  }, [weakestAreas, diagnosisScores.styleScore, isLoggedIn, demoData.dailyChallenge]);
  
  // AI 분석 트리거 (로그인된 경우에만)
  useEffect(() => {
    if (sessions.length > 0 && isLoggedIn) {
      // 사용자 프로필 생성
      const areas = [
        { label: '어휘력', score: radarData.vocabulary },
        { label: '번역 정확도', score: radarData.accuracy },
        { label: '번역 속도', score: radarData.speed },
        { label: '문맥 이해도', score: radarData.context },
        { label: '양방향 번역', score: radarData.bidirectional },
        { label: '실시간 번역', score: radarData.realtime }
      ];
      const userProfile = {
        totalSessions: sessions.length,
        averageScore: sessions.reduce((sum, s) => sum + s.averageScore, 0) / sessions.length,
        strongAreas: areas.sort((a, b) => b.score - a.score).slice(0, 2).map(item => item.label),
        weakAreas: weakestAreas,
        streakDays: streakDays
      };
      
      const recentPerformance = {
        scores: sessions.slice(0, 5).map(s => s.averageScore),
        studyTime: sessions.slice(0, 5).map(s => s.studyTime)
      };
      
      // AI 조언 생성
      generateAdvice(userProfile, recentPerformance);
      
      // 번역 샘플이 있다면 스타일 분석도 실행
      if (translationSamples.length > 0) {
        analyzeStyle(translationSamples);
      }
    }
      }, [sessions, isLoggedIn, radarData, weakestAreas, streakDays, translationSamples, generateAdvice, analyzeStyle]);

  // 차트 데이터
  const predictionChartData = useMemo(() => ({
    labels: ['현재', '1개월', '2개월', '3개월', '4개월', '5개월', '6개월'],
    datasets: [
      {
        label: '예상 성과',
        data: growthPrediction,
        borderColor: '#667eea',
        backgroundColor: 'rgba(102, 126, 234, 0.1)',
        borderWidth: 3,
        fill: true,
        tension: 0.4,
        pointBackgroundColor: '#667eea',
        pointBorderColor: '#fff',
        pointBorderWidth: 3,
        pointRadius: 6,
      },
      {
        label: '현재 수준 유지',
        data: Array(7).fill(growthPrediction[0]),
        borderColor: '#e2e8f0',
        backgroundColor: 'transparent',
        borderWidth: 2,
        borderDash: [5, 5],
        pointRadius: 0,
      }
    ]
  }), [growthPrediction]);

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(0,0,0,0.8)',
        titleColor: 'white',
        bodyColor: 'white',
        borderColor: '#667eea',
        borderWidth: 1,
        cornerRadius: 8,
        displayColors: false
      }
    },
    scales: {
      y: {
        beginAtZero: false,
        min: 80,
        max: 100,
        grid: { 
          color: 'rgba(0,0,0,0.05)',
          drawBorder: false
        },
        ticks: {
          color: '#718096',
          font: { size: 12 },
          callback: function(value: any) {
            return value + '점';
          }
        }
      },
      x: {
        grid: { display: false },
        ticks: { 
          color: '#718096',
          font: { size: 12 }
        }
      }
    },
    elements: {
      point: { 
        hoverRadius: 8,
        radius: 4
      },
      line: {
        tension: 0.4
      }
    },
    interaction: {
      intersect: false,
      mode: 'index' as const
    }
  };



  // 사용자 이름
  const userName = isLoggedIn ? (auth.currentUser?.displayName || auth.currentUser?.email?.split('@')[0] || '학습자') : '김학습';

  // LocalStorage에서 진행 상황 로드
  useEffect(() => {
    const savedTaskStatuses = localStorage.getItem('aiAnalysisTaskStatuses');
    if (savedTaskStatuses) {
      setTaskStatuses(JSON.parse(savedTaskStatuses));
    }
  }, []);

  // 작업 상태 변경 함수
  const handleTaskStatusChange = (taskId: string, newStatus: 'completed' | 'in-progress' | 'pending') => {
    const newStatuses = { ...taskStatuses, [taskId]: newStatus };
    setTaskStatuses(newStatuses);
    localStorage.setItem('aiAnalysisTaskStatuses', JSON.stringify(newStatuses));
  };

  // 요일별 상태 아이콘
  const getStatusIcon = (status: 'completed' | 'in-progress' | 'pending') => {
    switch (status) {
      case 'completed':
        return { icon: '✓', bg: 'bg-green-500', text: '완료' };
      case 'in-progress':
        return { icon: '📍', bg: 'bg-orange-400', text: '진행중' };
      case 'pending':
        return { icon: '○', bg: 'bg-gray-300', text: '예정' };
    }
  };

  // 우선순위별 색상
  const getPriorityColor = (priority: 'high' | 'medium' | 'low') => {
    switch (priority) {
      case 'high':
        return 'bg-red-500';
      case 'medium':
        return 'bg-orange-500';
      case 'low':
        return 'bg-green-500';
    }
  };

  // 로딩 상태 (로그인된 경우에만)
  if (loading && isLoggedIn) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
        <div className="text-white text-2xl">AI 분석 데이터를 불러오는 중...</div>
      </div>
    );
  }

  // 에러 상태 (로그인된 경우에만)
  if (error && isLoggedIn) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
        <div className="text-white text-xl">{error}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-500 to-purple-600 p-5">
      {/* 로그인 안내 오버레이 */}
      {showLoginPrompt && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ background: 'white', borderRadius: '20px', padding: '40px', maxWidth: '600px', width: '100%', textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ fontSize: '48px', marginBottom: '20px' }}>🤖</div>
            <h2 style={{ fontSize: '28px', color: '#1a202c', marginBottom: '16px', fontWeight: '700' }}>
              아직 로그인을 안 하셨네요?
            </h2>
            <p style={{ fontSize: '18px', color: '#718096', marginBottom: '24px', lineHeight: '1.6' }}>
              아래 화면은 AI 분석 예시입니다.<br/>
              로그인하시면 <strong>개인화된 AI 학습 분석</strong>이 제공됩니다.
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button 
                style={{ 
                  background: 'linear-gradient(135deg, #667eea, #764ba2)', 
                  color: 'white', 
                  border: 'none', 
                  borderRadius: '12px', 
                  padding: '16px 32px', 
                  fontSize: '18px', 
                  fontWeight: '600', 
                  cursor: 'pointer',
                  boxShadow: '0 8px 25px rgba(102,126,234,0.3)',
                  transition: 'all 0.3s ease'
                }}
                onMouseOver={(e) => {
                  const target = e.target as HTMLButtonElement;
                  target.style.transform = 'translateY(-2px)';
                }}
                onMouseOut={(e) => {
                  const target = e.target as HTMLButtonElement;
                  target.style.transform = 'translateY(0)';
                }}
                onClick={handleGoogleLogin}
              >
                🚀 지금 로그인하기
              </button>
              <button 
                style={{ 
                  background: 'transparent', 
                  color: '#667eea', 
                  border: '2px solid #667eea', 
                  borderRadius: '12px', 
                  padding: '16px 32px', 
                  fontSize: '18px', 
                  fontWeight: '600', 
                  cursor: 'pointer',
                  transition: 'all 0.3s ease'
                }}
                onMouseOver={(e) => {
                  const target = e.target as HTMLButtonElement;
                  target.style.background = '#667eea';
                  target.style.color = 'white';
                }}
                onMouseOut={(e) => {
                  const target = e.target as HTMLButtonElement;
                  target.style.background = 'transparent';
                  target.style.color = '#667eea';
                }}
                onClick={() => setShowLoginPrompt(false)}
              >
                👀 예시 먼저 보기
              </button>
            </div>
            <p style={{ fontSize: '14px', color: '#a0aec0', marginTop: '20px' }}>
              💡 팁: 로그인하면 AI 코치, 맞춤형 학습 계획, 실시간 분석 등 더 많은 기능을 이용할 수 있어요!
            </p>
          </div>
        </div>
      )}
      <div className="max-w-7xl mx-auto bg-white bg-opacity-95 rounded-3xl p-8 shadow-2xl backdrop-blur-xl">
        {/* 예시 라벨 (로그인 안된 경우에만) */}
        {!isLoggedIn && (
          <div style={{ position: 'absolute', top: '10px', right: '20px', background: 'linear-gradient(135deg, #fbbf24, #f59e0b)', color: 'white', padding: '8px 16px', borderRadius: '20px', fontSize: '14px', fontWeight: '600', boxShadow: '0 4px 15px rgba(251,191,36,0.3)' }}>
            🤖 예시 AI 분석
          </div>
        )}
        {/* 헤더 */}
        <div className="flex justify-between items-center mb-8 pb-5 border-b-2 border-gray-100">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">🤖 AI 학습 분석</h1>
            <p className="text-gray-600">
              {isLoggedIn ? '인공지능이 분석한 맞춤형 학습 인사이트를 확인해보세요' : 'AI 분석 예시를 확인해보세요'}
            </p>
          </div>
          <div className="bg-gradient-to-r from-blue-400 to-cyan-400 text-white px-6 py-4 rounded-xl text-center shadow-lg">
            <div className="text-lg font-semibold mb-1">🧠 AI 코치</div>
            <div className="text-sm opacity-90">활성화됨</div>
          </div>
        </div>

        {/* 메인 그리드: AI 코치 & 학습 계획 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* AI 코치 섹션 */}
          <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-200">
            <h3 className="text-xl font-semibold text-gray-900 mb-5 flex items-center gap-2">
              🎯 {isLoggedIn ? '개인화된 AI 학습 코치' : 'AI 학습 코치 예시'}
            </h3>
            
            <div className="space-y-4">
              {aiLoading.advice ? (
                <AIAdviceSkeleton />
              ) : aiError.advice ? (
                <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl">
                  {aiError.advice}
                </div>
              ) : aiResponses.advice ? (
                <AIEnhanced>
                  {aiResponses.advice.map((advice: string, index: number) => {
                    const gradients = [
                      'from-blue-500 to-purple-600',
                      'from-blue-400 to-cyan-400',
                      'from-pink-400 to-red-400'
                    ];
                    const gradient = gradients[index % gradients.length];
                    
                    return (
                      <div key={index} className={`bg-gradient-to-r ${gradient} text-white p-5 rounded-xl relative overflow-hidden`}>
                        <div className="absolute top-0 right-0 w-24 h-24 bg-white bg-opacity-10 rounded-full transform translate-x-6 -translate-y-6"></div>
                        <div className="relative z-10">
                          <div className="text-sm leading-relaxed mb-3">
                            {advice}
                          </div>
                          <button 
                            className="bg-white bg-opacity-20 border-none text-white px-4 py-2 rounded-full text-sm font-medium cursor-pointer transition-all hover:bg-opacity-30 hover:-translate-y-0.5"
                            onClick={() => {
                                                          if (index === 0) {
                              // 추천 학습 시작하기 - 약한 분야 제외하고 랜덤
                              const areas = [
                                { label: '어휘력', score: radarData.vocabulary },
                                { label: '번역 정확도', score: radarData.accuracy },
                                { label: '번역 속도', score: radarData.speed },
                                { label: '문맥 이해도', score: radarData.context },
                                { label: '양방향 번역', score: radarData.bidirectional },
                                { label: '실시간 번역', score: radarData.realtime }
                              ];
                              const strongAreas = areas.sort((a, b) => b.score - a.score).slice(0, 2).map(item => item.label);
                                const randomPage = getRandomPracticePage(strongAreas);
                                navigate(randomPage);
                              } else if (index === 1) {
                                // 집중력 훈련 시작 - 시간제한 게임
                                navigate('/practice/timed');
                              } else {
                                // 목표 완주하기 - 주간 계획의 다음 할 일
                                const nextTask = weeklyPlanData.tasks.find(task => task.status === 'pending') as DailyTask | undefined;
                                if (nextTask) {
                                  const taskPage = getWeeklyPlanPage(nextTask);
                                  navigate(taskPage);
                                } else {
                                  navigate('/practice/vocabquiz');
                                }
                              }
                            }}
                          >
                            {index === 0 ? '추천 학습 시작하기' : index === 1 ? '집중력 훈련 시작' : '목표 완주하기'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </AIEnhanced>
              ) : (
                // 폴백: 기존 규칙 기반 조언
                personalizedAdvice.map((advice, index) => {
                  const gradients = [
                    'from-blue-500 to-purple-600',
                    'from-blue-400 to-cyan-400',
                    'from-pink-400 to-red-400'
                  ];
                  const gradient = gradients[index % gradients.length];
                  
                  return (
                    <div key={index} className={`bg-gradient-to-r ${gradient} text-white p-5 rounded-xl relative overflow-hidden`}>
                      <div className="absolute top-0 right-0 w-24 h-24 bg-white bg-opacity-10 rounded-full transform translate-x-6 -translate-y-6"></div>
                      <div className="relative z-10">
                        <div className="text-sm leading-relaxed mb-3">
                          {advice}
                        </div>
                        <button 
                          className="bg-white bg-opacity-20 border-none text-white px-4 py-2 rounded-full text-sm font-medium cursor-pointer transition-all hover:bg-opacity-30 hover:-translate-y-0.5"
                          onClick={() => {
                            if (index === 0) {
                              // 추천 학습 시작하기 - 약한 분야 제외하고 랜덤
                              const areas = [
                                { label: '어휘력', score: radarData.vocabulary },
                                { label: '번역 정확도', score: radarData.accuracy },
                                { label: '번역 속도', score: radarData.speed },
                                { label: '문맥 이해도', score: radarData.context },
                                { label: '양방향 번역', score: radarData.bidirectional },
                                { label: '실시간 번역', score: radarData.realtime }
                              ];
                              const strongAreas = areas.sort((a, b) => b.score - a.score).slice(0, 2).map(item => item.label);
                              const randomPage = getRandomPracticePage(strongAreas);
                              navigate(randomPage);
                            } else if (index === 1) {
                              // 집중력 훈련 시작 - 시간제한 게임
                              navigate('/practice/timed');
                            } else {
                              // 목표 완주하기 - 주간 계획의 다음 할 일
                              const nextTask = weeklyPlanData.tasks.find(task => task.status === 'pending') as DailyTask | undefined;
                              if (nextTask) {
                                const taskPage = getWeeklyPlanPage(nextTask);
                                navigate(taskPage);
                              } else {
                                navigate('/practice/vocabquiz');
                              }
                            }
                          }}
                        >
                          {index === 0 ? '추천 학습 시작하기' : index === 1 ? '집중력 훈련 시작' : '목표 완주하기'}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* 학습 계획 섹션 */}
          <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-200">
            <h3 className="text-xl font-semibold text-gray-900 mb-5 flex items-center gap-2">
              📅 {isLoggedIn ? '맞춤형 학습 계획' : '학습 계획 예시'}
            </h3>
            
            <div className="mb-5">
              <div className="flex justify-between items-center mb-2">
                <span className="font-semibold text-gray-900">이번 주 학습 로드맵</span>
                <span className="text-blue-500 text-sm">
                  {weeklyPlanData.tasks.length}일 중 {weeklyPlanData.tasks.filter(task => task.status === 'completed').length}일 완료
                </span>
              </div>
              <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-blue-500 to-purple-600 rounded-full transition-all duration-1000" 
                  style={{ width: `${weeklyPlanData.overallProgress}%` }}
                ></div>
              </div>
            </div>

            <div className="space-y-3">
              {weeklyPlanData.tasks.map((task, index) => {
                const status = taskStatuses[task.day] || task.status;
                const statusInfo = getStatusIcon(status);
                const isToday = index === 2; // 수요일을 오늘로 가정
                
                return (
                  <div 
                    key={task.day}
                    className={`flex items-center p-3 rounded-xl cursor-pointer transition-all hover:bg-opacity-80 ${
                      status === 'completed' ? 'bg-blue-50' : 
                      status === 'in-progress' ? 'bg-orange-50 border-2 border-orange-300' : 
                      'bg-gray-50'
                    }`}
                    onClick={() => {
                      const nextStatus = status === 'completed' ? 'pending' : 
                                      status === 'pending' ? 'in-progress' : 'completed';
                      handleTaskStatusChange(task.day, nextStatus);
                    }}
                  >
                    <div className={`w-8 h-8 ${statusInfo.bg} rounded-full flex items-center justify-center text-white text-sm mr-3`}>
                      {statusInfo.icon}
                    </div>
                    <div className="flex-1">
                      <div className={`font-semibold text-sm ${
                        status === 'pending' ? 'text-gray-500' : 'text-gray-900'
                      }`}>
                        {task.title}
                      </div>
                      <div className={`text-xs ${
                        status === 'pending' ? 'text-gray-400' : 'text-gray-600'
                      }`}>
                        {task.description}
                      </div>
                    </div>
                    <div className={`text-xs font-semibold ${
                      status === 'completed' ? 'text-green-500' : 
                      status === 'in-progress' ? 'text-orange-500' : 
                      'text-gray-400'
                    }`}>
                      {statusInfo.text}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* 심화 실력 진단 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
          <div className="bg-white rounded-xl p-5 shadow-lg border border-gray-200 text-center">
            <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl flex items-center justify-center text-white text-2xl mx-auto mb-4">📊</div>
            <div className="text-3xl font-bold text-blue-500 mb-2">
              {aiLoading.style ? '...' : aiResponses.style?.score || diagnosisScores.styleScore}
            </div>
            <div className="text-gray-600 text-sm mb-3">번역 스타일 점수</div>
            <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden mb-2">
              <div className="h-full bg-gradient-to-r from-blue-500 to-purple-600 rounded-full transition-all duration-1000" style={{ width: `${aiResponses.style?.score || diagnosisScores.styleScore}%` }}></div>
            </div>
            <div className="text-xs text-blue-500 font-semibold">
              {aiLoading.style ? '분석 중...' : aiResponses.style ? `${aiResponses.style.style} • ${aiResponses.style.tendency}` : 
               diagnosisScores.styleScore >= 85 ? '의역형 • 격식체' :
               diagnosisScores.styleScore >= 70 ? '직역형 • 구어체' : '혼합형 • 중간체'}
            </div>
          </div>

          <div className="bg-white rounded-xl p-5 shadow-lg border border-gray-200 text-center">
            <div className="w-12 h-12 bg-gradient-to-r from-blue-400 to-cyan-400 rounded-xl flex items-center justify-center text-white text-2xl mx-auto mb-4">🎯</div>
            <div className="text-3xl font-bold text-blue-400 mb-2">{diagnosisScores.contextScore}</div>
            <div className="text-gray-600 text-sm mb-3">문맥 이해도</div>
            <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden mb-2">
              <div className="h-full bg-gradient-to-r from-blue-400 to-cyan-400 rounded-full transition-all duration-1000" style={{ width: `${diagnosisScores.contextScore}%` }}></div>
            </div>
            <div className="text-xs text-blue-400 font-semibold">
              {diagnosisScores.contextScore >= 90 ? '상위 5%' : 
               diagnosisScores.contextScore >= 80 ? '상위 20%' : 
               diagnosisScores.contextScore >= 70 ? '상위 50%' : '개선 필요'}
            </div>
          </div>

          <div className="bg-white rounded-xl p-5 shadow-lg border border-gray-200 text-center">
            <div className="w-12 h-12 bg-gradient-to-r from-pink-400 to-red-400 rounded-xl flex items-center justify-center text-white text-2xl mx-auto mb-4">⚡</div>
            <div className="text-3xl font-bold text-red-400 mb-2">{diagnosisScores.speedScore}</div>
            <div className="text-gray-600 text-sm mb-3">번역 속도</div>
            <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden mb-2">
              <div className="h-full bg-gradient-to-r from-pink-400 to-red-400 rounded-full transition-all duration-1000" style={{ width: `${diagnosisScores.speedScore}%` }}></div>
            </div>
            <div className="text-xs text-red-400 font-semibold">
              {diagnosisScores.speedScore >= 85 ? '우수' : 
               diagnosisScores.speedScore >= 70 ? '양호' : 
               diagnosisScores.speedScore >= 60 ? '보통' : '개선 필요'}
            </div>
          </div>
        </div>

        {/* 강약점 분석 & 성장 예측 */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* 레이더 차트 */}
          <div className="lg:col-span-2 bg-white rounded-2xl p-6 shadow-lg border border-gray-200">
            <h3 className="text-xl font-semibold text-gray-900 mb-5 flex items-center gap-2">
              📊 {isLoggedIn ? '번역 역량 분석' : '번역 역량 분석 예시'}
            </h3>
            <div className="h-80">
              <Radar 
                data={{
                  labels: ['어휘력', '번역 정확도', '번역 속도', '문맥 이해도', '양방향 번역', '실시간 번역'],
                  datasets: [
                    {
                      label: '현재 역량',
                      data: [
                        radarData.vocabulary,
                        radarData.accuracy,
                        radarData.speed,
                        radarData.context,
                        radarData.bidirectional,
                        radarData.realtime
                      ],
                      backgroundColor: 'rgba(102, 126, 234, 0.2)',
                      borderColor: 'rgba(102, 126, 234, 1)',
                      borderWidth: 2,
                      pointBackgroundColor: 'rgba(102, 126, 234, 1)',
                      pointBorderColor: '#fff',
                      pointBorderWidth: 2,
                      pointRadius: 4,
                    },
                    {
                      label: '목표 역량',
                      data: [90, 90, 90, 90, 90, 90],
                      backgroundColor: 'rgba(255, 99, 132, 0.1)',
                      borderColor: 'rgba(255, 99, 132, 0.5)',
                      borderWidth: 1,
                      borderDash: [5, 5],
                      pointRadius: 0,
                    }
                  ]
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: {
                      display: true,
                      position: 'top' as const,
                    },
                    tooltip: {
                      backgroundColor: 'rgba(0,0,0,0.8)',
                      titleColor: 'white',
                      bodyColor: 'white',
                      borderColor: '#667eea',
                      borderWidth: 1,
                      cornerRadius: 8,
                      callbacks: {
                        label: function(context: any) {
                          return `${context.dataset.label}: ${context.parsed.r}점`;
                        }
                      }
                    }
                  },
                  scales: {
                    r: {
                      beginAtZero: true,
                      max: 100,
                      min: 0,
                      ticks: {
                        stepSize: 20,
                        color: '#718096',
                        font: { size: 12 }
                      },
                      grid: {
                        color: 'rgba(0,0,0,0.1)'
                      },
                                             pointLabels: {
                         color: '#4a5568',
                         font: { size: 12, weight: 'bold' as const }
                       }
                    }
                  }
                }}
              />
            </div>
            <div className="mt-4 text-center text-sm text-gray-600">
              <span className="inline-block px-3 py-1 bg-blue-100 text-blue-800 rounded-full mr-2">현재 역량</span>
              <span className="inline-block px-3 py-1 bg-pink-100 text-pink-800 rounded-full">목표 역량</span>
            </div>
          </div>

          {/* 성장 예측 */}
          <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-200">
            <h3 className="text-xl font-semibold text-gray-900 mb-5 flex items-center gap-2">
              📈 {isLoggedIn ? '성장 예측' : '성장 예측 예시'}
            </h3>
            <div className="h-48 mb-4">
              <Line data={predictionChartData} options={chartOptions} />
            </div>
            <div className="p-3 bg-blue-50 rounded-xl">
              <div className="text-xs text-blue-500 font-semibold mb-1">예상 성과</div>
              <div className="text-sm text-gray-900">현재 페이스로 학습 시 <strong>3개월 후 {Math.max(...growthPrediction)}점</strong> 달성 예상</div>
            </div>
          </div>
        </div>

        {/* 추천 시스템 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 개선 제안 */}
          <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-200">
            <h3 className="text-xl font-semibold text-gray-900 mb-5 flex items-center gap-2">
              💡 {isLoggedIn ? '개선 제안' : '개선 제안 예시'}
            </h3>
            
            {aiLoading.mistakes ? (
              <MistakeAnalysisSkeleton />
            ) : aiError.mistakes ? (
              <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl">
                {aiError.mistakes}
              </div>
            ) : aiResponses.mistakes ? (
              <AIEnhanced>
                <div className="space-y-4">
                  {aiResponses.mistakes.patterns?.map((pattern: string, index: number) => {
                    const icons = ['🎯', '⚡', '📚'];
                    const gradients = [
                      'from-red-500 to-red-600',
                      'from-orange-400 to-orange-500',
                      'from-green-500 to-green-600'
                    ];
                    
                    return (
                      <div key={index} className="flex items-center p-3 border-b border-gray-100 last:border-b-0">
                        <div className={`w-10 h-10 bg-gradient-to-r ${gradients[index % gradients.length]} rounded-lg flex items-center justify-center text-white text-lg mr-3`}>
                          {icons[index % icons.length]}
                        </div>
                        <div className="flex-1">
                          <div className="font-semibold text-gray-900 text-sm">실수 패턴 {index + 1}</div>
                          <div className="text-gray-600 text-xs">{pattern}</div>
                        </div>
                        <div className="bg-red-500 text-white px-2 py-1 rounded-full text-xs font-semibold">
                          높음
                        </div>
                      </div>
                    );
                  })}
                </div>
              </AIEnhanced>
            ) : (
              <div className="space-y-4">
                {improvementSuggestions.map((suggestion, index) => {
                  const icons = ['🎯', '⚡', '📚'];
                  const gradients = [
                    'from-red-500 to-red-600',
                    'from-orange-400 to-orange-500',
                    'from-green-500 to-green-600'
                  ];
                  
                  return (
                    <div key={suggestion.id} className="flex items-center p-3 border-b border-gray-100 last:border-b-0">
                      <div className={`w-10 h-10 bg-gradient-to-r ${gradients[index % gradients.length]} rounded-lg flex items-center justify-center text-white text-lg mr-3`}>
                        {icons[index % icons.length]}
                      </div>
                      <div className="flex-1">
                        <div className="font-semibold text-gray-900 text-sm">{suggestion.title}</div>
                        <div className="text-gray-600 text-xs">{suggestion.description}</div>
                      </div>
                      <div className={`${getPriorityColor(suggestion.priority)} text-white px-2 py-1 rounded-full text-xs font-semibold`}>
                        {suggestion.priority === 'high' ? '높음' : suggestion.priority === 'medium' ? '중간' : '낮음'}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex justify-between items-center bg-gradient-to-r from-pink-400 to-red-400 text-white p-4 rounded-xl mt-6">
              <div className="text-center">
                <div className="text-xl font-bold">{optimalTime.timeRange}</div>
                <div className="text-xs opacity-90">최적 학습 시간</div>
              </div>
              <div className="text-2xl">⏰</div>
              <div className="text-center">
                <div className="text-xl font-bold">{optimalTime.score}%</div>
                <div className="text-xs opacity-90">집중도 예상</div>
              </div>
            </div>
          </div>

          {/* 콘텐츠 추천 */}
          <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-200">
            <h3 className="text-xl font-semibold text-gray-900 mb-5 flex items-center gap-2">
              🎁 {isLoggedIn ? '콘텐츠 추천' : '콘텐츠 추천 예시'}
            </h3>
            
            <div className="space-y-4">
              {contentRecommendations.map((content, index) => {
                const icons = ['🎵', '📺', '📰'];
                const gradients = [
                  'from-purple-500 to-purple-600',
                  'from-cyan-500 to-cyan-600',
                  'from-orange-500 to-orange-600'
                ];
                const badges = ['NEW', '인기', '추천'];
                
                return (
                  <div 
                    key={content.id} 
                    className="flex items-center p-3 border-b border-gray-100 last:border-b-0 cursor-pointer hover:bg-gray-50 transition-colors"
                    onClick={() => {
                      const challengePage = getDailyChallengePage(content);
                      navigate(challengePage);
                    }}
                  >
                    <div className={`w-10 h-10 bg-gradient-to-r ${gradients[index % gradients.length]} rounded-lg flex items-center justify-center text-white text-lg mr-3`}>
                      {icons[index % icons.length]}
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold text-gray-900 text-sm">{content.title}</div>
                      <div className="text-gray-600 text-xs">{content.description}</div>
                    </div>
                    <div 
                      className={`${index === 0 ? 'bg-purple-500' : index === 1 ? 'bg-cyan-500' : 'bg-orange-500'} text-white px-2 py-1 rounded-full text-xs font-semibold`}
                    >
                      {badges[index % badges.length]}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-6 p-4 bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl text-white">
              <div className="text-sm font-semibold mb-2">🎯 오늘의 도전 과제</div>
              <div className="text-xs leading-relaxed mb-3">
                {dailyChallenge.title}
              </div>
              <button 
                className="bg-white bg-opacity-20 border-none text-white px-4 py-2 rounded-full text-xs font-semibold cursor-pointer transition-all hover:bg-opacity-30"
                onClick={() => {
                  const challengePage = getDailyChallengePage(dailyChallenge);
                  navigate(challengePage);
                }}
              >
                도전하기 🚀
              </button>
            </div>
          </div>
        </div>

        {/* 홈으로 돌아가기 버튼 */}
        <div className="mt-8 text-center">
          <button
            onClick={() => navigate('/')}
            className="px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors font-medium"
          >
            홈으로 돌아가기
          </button>
        </div>
      </div>
    </div>
  );
};

export default AIAnalysis; 