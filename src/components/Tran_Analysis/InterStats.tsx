import React, { useEffect, useState, useMemo } from 'react';
import { collection, query, orderBy, getDocs, limit } from 'firebase/firestore';
import { db, auth, googleProvider } from '../../firebase';
import { signInWithPopup } from 'firebase/auth';
import { Line, Bar, Radar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  RadialLinearScale,
  Filler,
} from 'chart.js';
import { onAuthStateChanged } from 'firebase/auth';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  RadialLinearScale,
  Filler
);

// 통역 학습 세션 타입 정의 - 기존 컴포넌트들과 통합
interface TranslationSession {
  id: string;
  date: string;
  sessionType: 'shadowing' | 'stepbystep' | 'visual' | 'ppt' | 'memory' | 'translation';
  totalScore: number;
  problemCount: number;
  studyTime: number;
  averageScore: number;
  accuracy: number;
  fluency: number;
  completeness: number;
  sourceLanguage: string;
  targetLanguage: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  domain: string;
  category: string;
  metadata?: {
    translationType?: '직역' | '의역' | '자유번역';
    errorTypes?: string[];
    improvementAreas?: string[];
    emotionalState?: {
      confidence: number;
      nervousness: number;
      excitement: number;
    };
    toneAnalysis?: Array<{
      word: string;
      detectedTone: number;
      expectedTone: number;
      accuracy: number;
    }>;
    pronunciationErrors?: Array<{
      word: string;
      errorType: string;
      score: number;
    }>;
  };
}

const initialStats = {
  totalProblems: 0,
  totalStudyTime: 0,
  totalScore: 0,
  totalSessions: 0,
  averageAccuracy: 0,
  averageFluency: 0,
  averageCompleteness: 0,
};

// 통역 특화 유틸 함수들
const calculateTranslationStreak = (sessions: TranslationSession[]): number => {
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

const calculateLanguagePairStats = (sessions: TranslationSession[]) => {
  const languagePairs = sessions.reduce((acc, session) => {
    const pair = `${session.sourceLanguage}-${session.targetLanguage}`;
    if (!acc[pair]) {
      acc[pair] = { 
        scores: [], 
        accuracy: [], 
        fluency: [], 
        completeness: [],
        problemCount: 0,
        sessions: 0
      };
    }
    acc[pair].scores.push(session.averageScore);
    acc[pair].accuracy.push(session.accuracy);
    acc[pair].fluency.push(session.fluency);
    acc[pair].completeness.push(session.completeness);
    acc[pair].problemCount += session.problemCount;
    acc[pair].sessions += 1;
    return acc;
  }, {} as Record<string, any>);

  return Object.entries(languagePairs).map(([pair, data]) => ({
    languagePair: pair,
    averageScore: Math.round(data.scores.reduce((sum: number, score: number) => sum + score, 0) / data.scores.length * 10) / 10,
    averageAccuracy: Math.round(data.accuracy.reduce((sum: number, acc: number) => sum + acc, 0) / data.accuracy.length * 10) / 10,
    averageFluency: Math.round(data.fluency.reduce((sum: number, flu: number) => sum + flu, 0) / data.fluency.length * 10) / 10,
    averageCompleteness: Math.round(data.completeness.reduce((sum: number, comp: number) => sum + comp, 0) / data.completeness.length * 10) / 10,
    problemCount: data.problemCount,
    sessions: data.sessions,
    rank: 0
  })).sort((a, b) => b.averageScore - a.averageScore);
};

const calculateDifficultyProgress = (sessions: TranslationSession[]) => {
  const difficultyStats = sessions.reduce((acc, session) => {
    if (!acc[session.difficulty]) {
      acc[session.difficulty] = { scores: [], problemCount: 0, sessions: 0 };
    }
    acc[session.difficulty].scores.push(session.averageScore);
    acc[session.difficulty].problemCount += session.problemCount;
    acc[session.difficulty].sessions += 1;
    return acc;
  }, {} as Record<string, any>);

  return Object.entries(difficultyStats).map(([difficulty, data]) => ({
    difficulty,
    averageScore: Math.round(data.scores.reduce((sum: number, score: number) => sum + score, 0) / data.scores.length * 10) / 10,
    problemCount: data.problemCount,
    sessions: data.sessions
  }));
};

const calculateDomainPerformance = (sessions: TranslationSession[]) => {
  const domainStats = sessions.reduce((acc, session) => {
    if (!acc[session.domain]) {
      acc[session.domain] = { 
        scores: [], 
        accuracy: [], 
        fluency: [], 
        completeness: [],
        problemCount: 0 
      };
    }
    acc[session.domain].scores.push(session.averageScore);
    acc[session.domain].accuracy.push(session.accuracy);
    acc[session.domain].fluency.push(session.fluency);
    acc[session.domain].completeness.push(session.completeness);
    acc[session.domain].problemCount += session.problemCount;
    return acc;
  }, {} as Record<string, any>);

  return Object.entries(domainStats).map(([domain, data]) => ({
    domain,
    averageScore: Math.round(data.scores.reduce((sum: number, score: number) => sum + score, 0) / data.scores.length * 10) / 10,
    averageAccuracy: Math.round(data.accuracy.reduce((sum: number, acc: number) => sum + acc, 0) / data.accuracy.length * 10) / 10,
    averageFluency: Math.round(data.fluency.reduce((sum: number, flu: number) => sum + flu, 0) / data.fluency.length * 10) / 10,
    averageCompleteness: Math.round(data.completeness.reduce((sum: number, comp: number) => sum + comp, 0) / data.completeness.length * 10) / 10,
    problemCount: data.problemCount,
    rank: 0
  })).sort((a, b) => b.averageScore - a.averageScore);
};

const calculateWeeklyTranslationProgress = (sessions: TranslationSession[]) => {
  const weeklyData: Record<string, { 
    scores: number[]; 
    accuracy: number[]; 
    fluency: number[]; 
    completeness: number[];
    problems: number; 
    time: number 
  }> = {};
  
  sessions.forEach(session => {
    const date = new Date(session.date);
    const weekStart = new Date(date);
    weekStart.setDate(date.getDate() - date.getDay());
    const weekKey = weekStart.toISOString().split('T')[0];
    if (!weeklyData[weekKey]) {
      weeklyData[weekKey] = { scores: [], accuracy: [], fluency: [], completeness: [], problems: 0, time: 0 };
    }
    weeklyData[weekKey].scores.push(session.averageScore);
    weeklyData[weekKey].accuracy.push(session.accuracy);
    weeklyData[weekKey].fluency.push(session.fluency);
    weeklyData[weekKey].completeness.push(session.completeness);
    weeklyData[weekKey].problems += session.problemCount;
    weeklyData[weekKey].time += session.studyTime;
  });
  
  return Object.entries(weeklyData)
    .map(([week, data]) => ({
      week: `${new Date(week).getMonth() + 1}월 ${Math.ceil(new Date(week).getDate() / 7)}주차`,
      averageScore: Math.round(data.scores.reduce((sum, score) => sum + score, 0) / data.scores.length * 10) / 10,
      averageAccuracy: Math.round(data.accuracy.reduce((sum, acc) => sum + acc, 0) / data.accuracy.length * 10) / 10,
      averageFluency: Math.round(data.fluency.reduce((sum, flu) => sum + flu, 0) / data.fluency.length * 10) / 10,
      averageCompleteness: Math.round(data.completeness.reduce((sum, comp) => sum + comp, 0) / data.completeness.length * 10) / 10,
      totalProblems: data.problems,
      studyTime: data.time,
      improvement: calculateTranslationImprovement(data.scores)
    }))
    .sort((a, b) => b.week.localeCompare(a.week))
    .slice(0, 4);
};

const calculateTranslationImprovement = (scores: number[]): string => {
  if (scores.length < 2) return '+0%';
  const recent = scores.slice(0, Math.ceil(scores.length / 2));
  const older = scores.slice(Math.ceil(scores.length / 2));
  const recentAvg = recent.reduce((sum, score) => sum + score, 0) / recent.length;
  const olderAvg = older.reduce((sum, score) => sum + score, 0) / older.length;
  if (olderAvg === 0) return '+0%';
  const improvement = ((recentAvg - olderAvg) / olderAvg * 100);
  return `${improvement >= 0 ? '+' : ''}${Math.round(improvement)}%`;
};

const calculateDailyTranslationTime = (sessions: TranslationSession[]): number[] => {
  const dailyTime = Array(7).fill(0);
  const today = new Date();
  sessions.forEach(session => {
    const sessionDate = new Date(session.date);
    const daysDiff = Math.floor((today.getTime() - sessionDate.getTime()) / (1000 * 60 * 60 * 24));
    if (daysDiff >= 0 && daysDiff < 7) {
      dailyTime[6 - daysDiff] += Math.round(session.studyTime / 60);
    }
  });
  return dailyTime;
};

const getTranslationActivityIcon = (sessionType: string) => {
  if (sessionType.includes('shadowing'))
    return { icon: '🎤', bg: 'linear-gradient(135deg, #667eea, #764ba2)', name: '섀도잉 연습' };
  if (sessionType.includes('stepbystep'))
    return { icon: '📝', bg: 'linear-gradient(135deg, #4facfe, #00f2fe)', name: '단계별 통역' };
  if (sessionType.includes('visual'))
    return { icon: '🎬', bg: 'linear-gradient(135deg, #f093fb, #f5576c)', name: '영상 통역' };
  if (sessionType.includes('ppt'))
    return { icon: '📊', bg: 'linear-gradient(135deg, #43e97b, #38f9d7)', name: 'PPT 통역' };
  if (sessionType.includes('memory'))
    return { icon: '🧠', bg: 'linear-gradient(135deg, #ffecd2, #fcb69f)', name: '기억력 훈련' };
  if (sessionType.includes('translation'))
    return { icon: '🔄', bg: 'linear-gradient(135deg, #a8edea, #fed6e3)', name: '번역 연습' };
  return { icon: '📝', bg: 'linear-gradient(135deg, #667eea, #764ba2)', name: '통역 연습' };
};

const generateTranslationInsights = (sessions: TranslationSession[], domainStats: any[], streakDays: number): string[] => {
  const insights: string[] = [];
  
  // 세션 타입별 분석
  const sessionTypeStats = sessions.reduce((acc, session) => {
    if (!acc[session.sessionType]) {
      acc[session.sessionType] = { count: 0, totalScore: 0, totalTime: 0 };
    }
    acc[session.sessionType].count++;
    acc[session.sessionType].totalScore += session.averageScore;
    acc[session.sessionType].totalTime += session.studyTime;
    return acc;
  }, {} as Record<string, any>);

  // 가장 많이 사용한 연습 타입
  const mostUsedType = Object.entries(sessionTypeStats)
    .sort(([,a], [,b]) => b.count - a.count)[0];
  if (mostUsedType) {
    const iconInfo = getTranslationActivityIcon(mostUsedType[0]);
    insights.push(`${iconInfo.name}을 가장 많이 연습하고 있어요! 총 ${mostUsedType[1].count}회 연습했습니다.`);
  }
  
  if (domainStats.length > 0) {
    const bestDomain = domainStats[0];
    insights.push(`${bestDomain.domain} 분야에서 탁월한 성과를 보이고 있어요! 평균 ${bestDomain.averageScore}점을 달성했습니다.`);
  }
  
  if (streakDays >= 7) {
    insights.push(`${streakDays}일 연속 통역 연습! 꾸준한 연습이 실력 향상의 비결입니다.`);
  }
  
  // 감정 상태 분석
  const sessionsWithEmotion = sessions.filter(s => s.metadata?.emotionalState);
  if (sessionsWithEmotion.length > 0) {
    const avgConfidence = sessionsWithEmotion.reduce((sum, s) => 
      sum + (s.metadata?.emotionalState?.confidence || 0), 0) / sessionsWithEmotion.length;
    if (avgConfidence > 70) {
      insights.push('자신감 있는 발표를 하고 있어요! 평균 자신감 지수가 70%를 넘습니다.');
    }
  }
  
  // 발음 오류 분석
  const sessionsWithPronunciation = sessions.filter(s => s.metadata?.pronunciationErrors);
  if (sessionsWithPronunciation.length > 0) {
    const totalErrors = sessionsWithPronunciation.reduce((sum, s) => 
      sum + (s.metadata?.pronunciationErrors?.length || 0), 0);
    if (totalErrors < 10) {
      insights.push('발음 정확도가 매우 높아요! 지속적인 개선이 이루어지고 있습니다.');
    }
  }
  
  return insights.slice(0, 3);
};

const formatTime = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}시간 ${minutes}분`;
  }
  return `${minutes}분`;
};

// 예시 데이터 생성 - 기존 컴포넌트들과 통합
const createTranslationDemoData = () => ({
  totalProblems: 156,
  averageAccuracy: 89.2,
  averageFluency: 85.7,
  averageCompleteness: 87.3,
  totalStudyTime: 12420, // 초단위 (3시간 27분)
  totalSessions: 23,
  streakDays: 8,
  weeklyProgress: [
    { week: '12월 1주차', averageScore: 82.5, averageAccuracy: 85.2, averageFluency: 80.1, averageCompleteness: 82.3, totalProblems: 15, studyTime: 1800, improvement: '+5%' },
    { week: '11월 4주차', averageScore: 78.3, averageAccuracy: 82.1, averageFluency: 75.8, averageCompleteness: 79.0, totalProblems: 18, studyTime: 2100, improvement: '+3%' },
    { week: '11월 3주차', averageScore: 75.9, averageAccuracy: 79.5, averageFluency: 72.4, averageCompleteness: 76.8, totalProblems: 12, studyTime: 1500, improvement: '+2%' },
    { week: '11월 2주차', averageScore: 74.2, averageAccuracy: 77.8, averageFluency: 70.9, averageCompleteness: 74.1, totalProblems: 14, studyTime: 1680, improvement: '+1%' },
  ],
  dailyStudyTime: [45, 60, 30, 75, 90, 45, 60],
  domainStats: [
    { domain: '비즈니스', averageScore: 91.2, averageAccuracy: 93.5, averageFluency: 88.7, averageCompleteness: 91.4, problemCount: 45, rank: 1 },
    { domain: '뉴스', averageScore: 87.8, averageAccuracy: 89.2, averageFluency: 86.1, averageCompleteness: 88.3, problemCount: 38, rank: 2 },
    { domain: '기술', averageScore: 84.5, averageAccuracy: 86.7, averageFluency: 82.9, averageCompleteness: 84.1, problemCount: 32, rank: 3 },
    { domain: '일상', averageScore: 82.1, averageAccuracy: 84.3, averageFluency: 80.5, averageCompleteness: 81.6, problemCount: 41, rank: 4 },
  ],
  languagePairStats: [
    { languagePair: '한국어-중국어', averageScore: 89.5, averageAccuracy: 91.2, averageFluency: 87.8, averageCompleteness: 89.6, problemCount: 78, sessions: 12, rank: 1 },
    { languagePair: '중국어-한국어', averageScore: 86.3, averageAccuracy: 88.1, averageFluency: 84.5, averageCompleteness: 86.7, problemCount: 65, sessions: 10, rank: 2 },
    { languagePair: '한국어-영어', averageScore: 83.7, averageAccuracy: 85.4, averageFluency: 82.1, averageCompleteness: 83.5, problemCount: 13, sessions: 1, rank: 3 },
  ],
  difficultyStats: [
    { difficulty: 'intermediate', averageScore: 87.2, problemCount: 89, sessions: 15 },
    { difficulty: 'beginner', averageScore: 91.5, problemCount: 45, sessions: 6 },
    { difficulty: 'advanced', averageScore: 78.9, problemCount: 22, sessions: 2 },
  ],
  sessionTypeStats: [
    { sessionType: 'shadowing', count: 8, averageScore: 85.2, totalTime: 3600 },
    { sessionType: 'stepbystep', count: 6, averageScore: 82.1, totalTime: 4200 },
    { sessionType: 'visual', count: 4, averageScore: 88.7, totalTime: 2400 },
    { sessionType: 'ppt', count: 3, averageScore: 90.3, totalTime: 1800 },
    { sessionType: 'memory', count: 2, averageScore: 79.5, totalTime: 420 },
  ],
  insights: [
    '섀도잉 연습을 가장 많이 연습하고 있어요! 총 8회 연습했습니다.',
    '비즈니스 분야에서 탁월한 성과를 보이고 있어요! 평균 91.2점을 달성했습니다.',
    '8일 연속 통역 연습! 꾸준한 연습이 실력 향상의 비결입니다.',
  ]
});

const InterStats: React.FC = () => {
  const [sessions, setSessions] = useState<TranslationSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  
  // Google 로그인 함수
  const handleGoogleLogin = async () => {
    try {
      googleProvider.setCustomParameters({
        prompt: 'select_account'
      });
      
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

  // 데이터 fetch (로그인된 경우에만)
  useEffect(() => {
    const fetchSessions = async () => {
      if (!auth.currentUser || !isLoggedIn) return;
      setLoading(true);
      setError(null);
      try {
        const userId = auth.currentUser.uid;
        const sessionsRef = collection(db, 'translationSessions');
        const q = query(sessionsRef, orderBy('date', 'desc'), limit(100));
        const querySnapshot = await getDocs(q);
        const fetchedSessions: TranslationSession[] = [];
        querySnapshot.forEach((doc) => {
          fetchedSessions.push({ id: doc.id, ...doc.data() } as TranslationSession);
        });
        setSessions(fetchedSessions);
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

  // 예시 데이터 생성
  const demoStats = useMemo(() => createTranslationDemoData(), []);
  
  // 통계 계산 (useMemo로 캐싱) - 로그인 안된 경우 예시 데이터 사용
  const stats = useMemo(() => {
    // 로그인 안된 경우 예시 데이터 반환
    if (!isLoggedIn) {
      return demoStats;
    }
    
    if (!sessions.length) return null;
    
    // 한 번의 루프로 통계 계산
    let totalProblems = 0, totalStudyTime = 0, totalScore = 0;
    sessions.forEach(s => {
      totalProblems += s.problemCount || 0;
      totalStudyTime += s.studyTime || 0;
      totalScore += s.averageScore || 0;
    });
    
    const averageAccuracy = sessions.reduce((sum, session) => sum + session.accuracy, 0) / sessions.length;
    const averageFluency = sessions.reduce((sum, session) => sum + session.fluency, 0) / sessions.length;
    const averageCompleteness = sessions.reduce((sum, session) => sum + session.completeness, 0) / sessions.length;
    const streakDays = calculateTranslationStreak(sessions);
    const weeklyProgress = calculateWeeklyTranslationProgress(sessions);
    const dailyStudyTime = calculateDailyTranslationTime(sessions);
    const domainStats = calculateDomainPerformance(sessions);
    const languagePairStats = calculateLanguagePairStats(sessions);
    const difficultyStats = calculateDifficultyProgress(sessions);
    const insights = generateTranslationInsights(sessions, domainStats, streakDays);
    
    // 세션 타입별 통계 계산
    const sessionTypeStats = sessions.reduce((acc, session) => {
      if (!acc[session.sessionType]) {
        acc[session.sessionType] = { count: 0, totalScore: 0, totalTime: 0 };
      }
      acc[session.sessionType].count++;
      acc[session.sessionType].totalScore += session.averageScore;
      acc[session.sessionType].totalTime += session.studyTime;
      return acc;
    }, {} as Record<string, any>);

    const sessionTypeStatsArray = Object.entries(sessionTypeStats).map(([sessionType, data]) => ({
      sessionType,
      count: data.count,
      averageScore: Math.round(data.totalScore / data.count * 10) / 10,
      totalTime: data.totalTime
    }));
    
    return {
      totalProblems,
      totalStudyTime,
      totalScore,
      totalSessions: sessions.length,
      averageAccuracy,
      averageFluency,
      averageCompleteness,
      streakDays,
      weeklyProgress,
      dailyStudyTime,
      domainStats,
      languagePairStats,
      difficultyStats,
      sessionTypeStats: sessionTypeStatsArray,
      insights
    };
  }, [sessions, isLoggedIn, demoStats]);

  // 사용자 이름
  const userName = auth.currentUser?.displayName || auth.currentUser?.email?.split('@')[0] || '학습자';

  // 로딩/에러/빈 상태 처리
  if (loading && isLoggedIn) {
    return <div style={{ minHeight: '100vh', width: '100%', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: 'white', fontSize: 24 }}>학습 데이터를 불러오는 중...</div>
    </div>;
  }
  if (error && isLoggedIn) {
    return <div style={{ minHeight: '100vh', width: '100%', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: 'white', fontSize: 20 }}>{error}</div>
    </div>;
  }
  if (!stats && isLoggedIn) {
    return <div style={{ minHeight: '100vh', width: '100%', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: 'white', fontSize: 20, textAlign: 'center' }}>
        학습 기록이 없습니다.<br />
        <button style={{ marginTop: 16, padding: '10px 24px', background: '#fff', color: '#667eea', borderRadius: 8, fontWeight: 600, fontSize: 16, border: 'none', cursor: 'pointer' }} onClick={() => window.location.href = '/'}>
          학습 시작하기
        </button>
      </div>
    </div>;
  }

  // UI 렌더링 (StudyStats와 동일한 스타일)
  return (
    <div style={{ minHeight: '100vh', width: '100%', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', padding: '20px', boxSizing: 'border-box', overflowX: 'hidden' }}>
      {/* 로그인 안내 오버레이 */}
      {showLoginPrompt && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ background: 'white', borderRadius: '20px', padding: '40px', maxWidth: '600px', width: '100%', textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ fontSize: '48px', marginBottom: '20px' }}>🔒</div>
            <h2 style={{ fontSize: '28px', color: '#1a202c', marginBottom: '16px', fontWeight: '700' }}>
              아직 로그인을 안 하셨네요?
            </h2>
            <p style={{ fontSize: '18px', color: '#718096', marginBottom: '24px', lineHeight: '1.6' }}>
              아래 화면은 대시보드 예시입니다.<br/>
              로그인하시면 <strong>사용자 맞춤형 통역 분석</strong>이 제공됩니다.
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
              💡 팁: 로그인하면 통역 진도, 성과 분석, 개인별 추천 등 더 많은 기능을 이용할 수 있어요!
            </p>
          </div>
        </div>
      )}
      <div className="dashboard-container" style={{ maxWidth: '1400px', width: '100%', margin: '0 auto', background: 'rgba(255,255,255,0.95)', borderRadius: 28, padding: '32px', boxShadow: '0 20px 60px rgba(0,0,0,0.1)', backdropFilter: 'blur(20px)', boxSizing: 'border-box', position: 'relative' }} id="dashboard-root">
        {/* 헤더 */}
        <div className="header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, paddingBottom: 15, borderBottom: '2px solid #f8fafc' }}>
          <div className="welcome-section">
            <h1 style={{ fontSize: 28, color: '#1a202c', marginBottom: 6, fontWeight: 700 }}>안녕하세요, {isLoggedIn ? userName : '김학습'}님! 👋</h1>
            <p style={{ color: '#718096', fontSize: 14 }}>오늘의 통역 학습 현황을 확인해보세요</p>
          </div>
          <div className="user-stats" style={{ display: 'flex', gap: 15, alignItems: 'center' }}>
            <div className="streak-info" style={{ background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)', color: 'white', padding: '12px 16px', borderRadius: 12, textAlign: 'center', boxShadow: '0 6px 20px rgba(79,172,254,0.3)' }}>
              <div className="streak-number" style={{ fontSize: 20, fontWeight: 700, marginBottom: 3 }}>{stats?.streakDays || 0}</div>
              <div className="streak-label" style={{ fontSize: 11, opacity: 0.9 }}>연속 학습일</div>
            </div>
            {/* PDF로 다운받기 버튼을 streak-info 오른쪽에 배치 */}
            <button
              style={{ background: 'linear-gradient(135deg, #667eea, #764ba2)', color: 'white', border: 'none', borderRadius: 16, padding: '10px 22px', fontWeight: 700, fontSize: 15, boxShadow: '0 4px 15px rgba(102,126,234,0.15)', cursor: 'pointer', transition: 'all 0.2s' }}
              onClick={async () => {
                const dashboard = document.getElementById('dashboard-root');
                if (!dashboard) return;
                const html2canvas = (await import('html2canvas')).default;
                const jsPDF = (await import('jspdf')).default;
                const canvas = await html2canvas(dashboard, { useCORS: true, scale: 2 });
                const imgData = canvas.toDataURL('image/png');
                const pdf = new jsPDF('p', 'mm', 'a4');
                const pageWidth = pdf.internal.pageSize.getWidth();
                const pageHeight = pdf.internal.pageSize.getHeight();
                const imgProps = { width: canvas.width, height: canvas.height };
                const ratio = Math.min(pageWidth / imgProps.width, pageHeight / imgProps.height);
                const pdfWidth = imgProps.width * ratio;
                const pdfHeight = imgProps.height * ratio;
                pdf.addImage(imgData, 'PNG', (pageWidth - pdfWidth) / 2, 10, pdfWidth, pdfHeight - 20);
                pdf.save('dashboard.pdf');
              }}
            >PDF로 다운받기</button>
          </div>
        </div>
        {/* 메인 그리드 */}
        <div className="main-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 18, marginBottom: 20 }}>
          {/* 통계 카드들 */}
          <div className="stats-section" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 15 }}>
            <div className="stat-card" style={{ background: 'white', borderRadius: 12, padding: 18, boxShadow: '0 6px 20px rgba(0,0,0,0.08)', border: '1px solid #e2e8f0', position: 'relative', overflow: 'hidden', marginBottom: 8 }}>
              <div className="stat-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div className="stat-icon" style={{ width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, background: 'linear-gradient(135deg, #667eea, #764ba2)', color: 'white', boxShadow: '0 6px 15px rgba(102,126,234,0.3)' }}>📚</div>
              </div>
              <div className="stat-value" style={{ fontSize: 28, fontWeight: 700, color: '#1a202c', margin: '8px 0' }}>{stats?.totalProblems || 0}</div>
              <div className="stat-label" style={{ color: '#718096', fontSize: 12, marginBottom: 6 }}>학습한 문제</div>
            </div>
            <div className="stat-card" style={{ background: 'white', borderRadius: 12, padding: 18, boxShadow: '0 6px 20px rgba(0,0,0,0.08)', border: '1px solid #e2e8f0', position: 'relative', overflow: 'hidden', marginBottom: 8 }}>
              <div className="stat-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div className="stat-icon" style={{ width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, background: 'linear-gradient(135deg, #667eea, #764ba2)', color: 'white', boxShadow: '0 6px 15px rgba(102,126,234,0.3)' }}>🎯</div>
              </div>
              <div className="stat-value" style={{ fontSize: 28, fontWeight: 700, color: '#1a202c', margin: '8px 0' }}>{stats?.averageAccuracy?.toFixed(1) || '0.0'}%</div>
              <div className="stat-label" style={{ color: '#718096', fontSize: 12, marginBottom: 6 }}>통역 정확도</div>
            </div>
            <div className="stat-card" style={{ background: 'white', borderRadius: 12, padding: 18, boxShadow: '0 6px 20px rgba(0,0,0,0.08)', border: '1px solid #e2e8f0', position: 'relative', overflow: 'hidden', marginBottom: 8 }}>
              <div className="stat-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div className="stat-icon" style={{ width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, background: 'linear-gradient(135deg, #667eea, #764ba2)', color: 'white', boxShadow: '0 6px 15px rgba(102,126,234,0.3)' }}>⏱️</div>
              </div>
              <div className="stat-value" style={{ fontSize: 28, fontWeight: 700, color: '#1a202c', margin: '8px 0' }}>{formatTime(stats?.totalStudyTime || 0)}</div>
              <div className="stat-label" style={{ color: '#718096', fontSize: 12, marginBottom: 6 }}>총 학습 시간</div>
            </div>
            <div className="stat-card" style={{ background: 'white', borderRadius: 12, padding: 18, boxShadow: '0 6px 20px rgba(0,0,0,0.08)', border: '1px solid #e2e8f0', position: 'relative', overflow: 'hidden', marginBottom: 8 }}>
              <div className="stat-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div className="stat-icon" style={{ width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, background: 'linear-gradient(135deg, #667eea, #764ba2)', color: 'white', boxShadow: '0 6px 15px rgba(102,126,234,0.3)' }}>🏆</div>
              </div>
              <div className="stat-value" style={{ fontSize: 28, fontWeight: 700, color: '#1a202c', margin: '8px 0' }}>{stats?.totalSessions || 0}</div>
              <div className="stat-label" style={{ color: '#718096', fontSize: 12, marginBottom: 6 }}>완료한 연습</div>
            </div>


          </div>
          {/* 주간 목표 진행도 */}
          <div className="chart-section" style={{ background: 'white', borderRadius: 12, padding: 18, boxShadow: '0 6px 20px rgba(0,0,0,0.08)', border: '1px solid #e2e8f0' }}>
            <div className="chart-header" style={{ marginBottom: 15 }}>
              <h3 className="chart-title" style={{ fontSize: 16, fontWeight: 600, color: '#1a202c' }}>📅 주간 목표 진행도</h3>
            </div>
            <div className="circular-progress" style={{ position: 'relative', width: 160, height: 160, margin: '0 auto' }}>
              <svg className="progress-ring" width="160" height="160" style={{ transform: 'rotate(-90deg)' }}>
                <defs>
                  <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#667eea" />
                    <stop offset="100%" stopColor="#764ba2" />
                  </linearGradient>
                </defs>
                <circle className="progress-bg" cx="80" cy="80" r="70" stroke="#e2e8f0" strokeWidth="10" fill="none" />
                <circle className="progress-bar" cx="80" cy="80" r="70" stroke="url(#progressGradient)" strokeWidth="10" fill="none" strokeDasharray={2 * Math.PI * 70} strokeDashoffset={2 * Math.PI * 70 * (1 - (stats?.weeklyProgress?.length || 0) / 4)} strokeLinecap="round" style={{ transition: 'stroke-dashoffset 1s ease' }} />
              </svg>
              <div className="progress-text" style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center' }}>
                <div className="progress-percentage" style={{ fontSize: 24, fontWeight: 700, color: '#667eea' }}>{Math.round((stats?.weeklyProgress?.length || 0) / 4 * 100)}%</div>
                <div className="progress-label" style={{ fontSize: 12, color: '#718096', marginTop: 3 }}>목표 달성</div>
              </div>
            </div>
          </div>
          {/* 일일 학습 시간 차트 */}
          <div className="chart-section" style={{ background: 'white', borderRadius: 12, padding: 18, boxShadow: '0 6px 20px rgba(0,0,0,0.08)', border: '1px solid #e2e8f0' }}>
            <div className="chart-header" style={{ marginBottom: 15 }}>
              <h3 className="chart-title" style={{ fontSize: 16, fontWeight: 600, color: '#1a202c' }}>📊 일일 학습 시간</h3>
            </div>
            <div className="chart-container" style={{ position: 'relative', height: 200, marginBottom: 15 }}>
              <Line data={{
                labels: ['월', '화', '수', '목', '금', '토', '일'],
                datasets: [{
                  label: '학습 시간',
                  data: stats?.dailyStudyTime?.length ? stats.dailyStudyTime : [0,0,0,0,0,0,0],
                  borderColor: '#667eea',
                  backgroundColor: 'rgba(102, 126, 234, 0.1)',
                  borderWidth: 3,
                  fill: true,
                  tension: 0.4,
                  pointBackgroundColor: '#667eea',
                  pointBorderColor: '#fff',
                  pointBorderWidth: 3,
                  pointRadius: 6,
                }]
              }} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { color: '#718096' } }, x: { grid: { display: false }, ticks: { color: '#718096', maxTicksLimit: window.innerWidth < 768 ? 5 : 7 } } } }} height={200} />
            </div>
          </div>
        </div>
        {/* 성과 분석 */}
        <div className="performance-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginBottom: 20 }}>
          <div className="performance-card" style={{ background: 'white', borderRadius: 12, padding: 18, boxShadow: '0 6px 20px rgba(0,0,0,0.08)', border: '1px solid #e2e8f0' }}>
            <h3 className="section-title" style={{ fontSize: 16, fontWeight: 600, color: '#1a202c', marginBottom: 15, display: 'flex', alignItems: 'center', gap: 8 }}>📈 주간 성과 추이</h3>
            <div className="chart-container" style={{ position: 'relative', height: 280, marginBottom: 5 }}>
              <Bar data={{
                labels: stats?.weeklyProgress?.map(w => w.week) || [],
                datasets: [
                  {
                    label: '통역 정확도',
                    data: stats?.weeklyProgress?.map(w => w.averageScore) || [],
                    backgroundColor: 'rgba(102, 126, 234, 0.8)',
                    borderColor: '#667eea',
                    borderWidth: 2,
                    borderRadius: 8,
                  },
                  {
                    label: '학습 시간',
                    data: stats?.weeklyProgress?.map(w => Math.round(w.studyTime / 60)) || [],
                    backgroundColor: 'rgba(118, 75, 162, 0.8)',
                    borderColor: '#764ba2',
                    borderWidth: 2,
                    borderRadius: 8,
                    yAxisID: 'y1',
                  },
                ]
              }} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top', labels: { usePointStyle: true, color: '#718096' } } }, scales: { y: { type: 'linear', display: true, position: 'left', grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { color: '#718096' } }, y1: { type: 'linear', display: true, position: 'right', grid: { drawOnChartArea: false }, ticks: { color: '#718096' } }, x: { grid: { display: false }, ticks: { color: '#718096', maxTicksLimit: window.innerWidth < 768 ? 5 : 7 } } } }} height={280} />
            </div>
          </div>
          <div className="leaderboard" style={{ background: 'white', borderRadius: 12, padding: 18, boxShadow: '0 6px 20px rgba(0,0,0,0.08)', border: '1px solid #e2e8f0' }}>
            <h3 className="section-title" style={{ fontSize: 16, fontWeight: 600, color: '#1a202c', marginBottom: 15, display: 'flex', alignItems: 'center', gap: 8 }}>🏆 분야별 성과 랭킹</h3>
            {stats?.domainStats?.slice(0, 4).map((item, i) => (
              <div key={i} className="leaderboard-item" style={{ display: 'flex', alignItems: 'center', padding: '12px 0', borderBottom: i === (stats?.domainStats?.length || 0) - 1 ? 'none' : '1px solid #f7fafc' }}>
                <div className={`rank-badge rank-${item.rank <= 3 ? item.rank : 'other'}`} style={{ width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, marginRight: 12, fontSize: 14, color: item.rank === 1 ? '#744210' : item.rank === 2 ? '#2d3748' : item.rank === 3 ? 'white' : '#718096', background: item.rank === 1 ? 'linear-gradient(135deg, #ffd700, #ffed4e)' : item.rank === 2 ? 'linear-gradient(135deg, #c0c0c0, #e2e8f0)' : item.rank === 3 ? 'linear-gradient(135deg, #cd7f32, #d69e2e)' : '#edf2f7' }}>{item.rank}</div>
                <div className="subject-info" style={{ flex: 1 }}>
                  <div className="subject-name" style={{ fontWeight: 600, color: '#1a202c', marginBottom: 3, fontSize: 14 }}>{item.domain}</div>
                  <div className="subject-progress" style={{ fontSize: 11, color: '#718096' }}>{item.problemCount}문제 완료</div>
                </div>
                <div className="subject-score" style={{ textAlign: 'right' }}>
                  <div className="score-value" style={{ fontSize: 16, fontWeight: 700, color: '#667eea' }}>{item.averageScore}</div>
                  <div className="score-unit" style={{ fontSize: 10, color: '#718096' }}>%</div>
                </div>
              </div>
            ))}
          </div>
        </div>
        {/* 최근 활동 & AI 인사이트 */}
        <div className="activity-section" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 18 }}>
          <div className="recent-activity" style={{ background: 'white', borderRadius: 12, padding: 18, boxShadow: '0 6px 20px rgba(0,0,0,0.08)', border: '1px solid #e2e8f0' }}>
            <h3 className="section-title" style={{ fontSize: 16, fontWeight: 600, color: '#1a202c', marginBottom: 15, display: 'flex', alignItems: 'center', gap: 8 }}>📋 최근 통역 활동</h3>
            {stats?.sessionTypeStats?.slice(0, 4).map((item, i) => {
              const iconInfo = getTranslationActivityIcon(item.sessionType);
              return (
                <div key={i} className="activity-item" style={{ display: 'flex', alignItems: 'center', padding: '10px 0', borderBottom: i === (stats?.sessionTypeStats?.length || 0) - 1 ? 'none' : '1px solid #f7fafc' }}>
                  <div className={`activity-icon`} style={{ width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, marginRight: 12, color: 'white', background: iconInfo.bg }}>{iconInfo.icon}</div>
                  <div className="activity-details" style={{ flex: 1 }}>
                    <div className="activity-title" style={{ fontWeight: 600, color: '#1a202c', marginBottom: 3, fontSize: 14 }}>{iconInfo.name}</div>
                    <div className="activity-meta" style={{ fontSize: 11, color: '#718096' }}>{item.count}회 연습 • {formatTime(item.totalTime)}</div>
                  </div>
                  <div className="activity-score" style={{ textAlign: 'right' }}>
                    <div className="activity-points" style={{ fontSize: 16, fontWeight: 700, color: '#1a202c' }}>{item.averageScore}점</div>
                    <div className="activity-time" style={{ fontSize: 10, color: '#a0aec0' }}>평균 점수</div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="insights-card" style={{ background: 'white', borderRadius: 12, padding: 18, boxShadow: '0 6px 20px rgba(0,0,0,0.08)', border: '1px solid #e2e8f0' }}>
            <h3 className="section-title" style={{ fontSize: 16, fontWeight: 600, color: '#1a202c', marginBottom: 15, display: 'flex', alignItems: 'center', gap: 8 }}>💡 학습 인사이트</h3>
            {stats?.insights?.map((text, i) => (
              <div key={i} className="insight-item" style={{ background: 'linear-gradient(135deg, #667eea, #764ba2)', color: 'white', padding: 15, borderRadius: 10, marginBottom: 12, position: 'relative', overflow: 'hidden' }}>
                <div className="insight-text" style={{ fontSize: 12, lineHeight: 1.5, marginBottom: 10, position: 'relative', zIndex: 1 }}>{text}</div>
                <button className="insight-action" style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', padding: '6px 12px', borderRadius: 15, fontSize: 10, fontWeight: 500, cursor: 'pointer', transition: 'all 0.3s ease', position: 'relative', zIndex: 1 }}>자세히 보기</button>
              </div>
            ))}
          </div>
        </div>
        
        {/* 다시 로그인 버튼 (로그인 안된 경우에만) */}
        {!isLoggedIn && (
          <div style={{ marginTop: '30px', textAlign: 'center', padding: '20px', background: 'linear-gradient(135deg, #f3f4f6, #e5e7eb)', borderRadius: '16px', border: '2px dashed #d1d5db' }}>
            <h3 style={{ fontSize: '20px', color: '#374151', marginBottom: '8px', fontWeight: '600' }}>
              🎯 더 정확한 분석이 필요하신가요?
            </h3>
            <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '16px' }}>
              지금 로그인하시면 개인별 맞춤 통역 분석과 진도 관리를 받을 수 있어요!
            </p>
            <button 
              style={{ 
                background: 'linear-gradient(135deg, #667eea, #764ba2)', 
                color: 'white', 
                border: 'none', 
                borderRadius: '12px', 
                padding: '12px 24px', 
                fontSize: '16px', 
                fontWeight: '600', 
                cursor: 'pointer',
                boxShadow: '0 6px 20px rgba(102,126,234,0.3)',
                transition: 'all 0.3s ease'
              }}
              onMouseOver={(e) => {
                const target = e.target as HTMLButtonElement;
                target.style.transform = 'translateY(-2px)';
                target.style.boxShadow = '0 8px 25px rgba(102,126,234,0.4)';
              }}
              onMouseOut={(e) => {
                const target = e.target as HTMLButtonElement;
                target.style.transform = 'translateY(0)';
                target.style.boxShadow = '0 6px 20px rgba(102,126,234,0.3)';
              }}
              onClick={() => setShowLoginPrompt(true)}
            >
              💫 나만의 대시보드 만들기
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default InterStats; 