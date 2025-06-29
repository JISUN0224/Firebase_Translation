import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { db, auth } from '../../firebase';
import { useNavigate } from 'react-router-dom';
import ChatbotWidget from '../../ChatbotWidget';

interface StudySession {
  id: string;
  date: string;
  gameType: string;
  totalScore: number;
  problemCount: number;
  studyTime: number;
  averageScore: number;
  improvement?: string;
}

interface WeeklyProgress {
  week: string;
  averageScore: number;
  totalProblems: number;
  studyTime: number;
  improvement: string;
}

interface UserStats {
  totalSessions: number;
  totalStudyTime: number;
  averageScore: number;
  totalProblems: number;
  weakestArea: string;
  strongestArea: string;
  weeklyProgress: WeeklyProgress[];
  recentSessions: StudySession[];
}

const StudyStats: React.FC = () => {
  const [userStats, setUserStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState<'week' | 'month' | 'year'>('week');
  const navigate = useNavigate();

  useEffect(() => {
    const fetchUserStats = async () => {
      if (!auth.currentUser) {
        navigate('/');
        return;
      }

      try {
        setLoading(true);
        const userId = auth.currentUser.uid;
        
        // 사용자 학습 세션 데이터 가져오기
        const sessionsRef = collection(db, 'users', userId, 'sessions');
        const sessionsQuery = query(
          sessionsRef,
          orderBy('date', 'desc'),
          limit(50)
        );
        
        const querySnapshot = await getDocs(sessionsQuery);
        const sessions: StudySession[] = [];
        
        querySnapshot.forEach((doc) => {
          sessions.push({ id: doc.id, ...doc.data() } as StudySession);
        });

        // 통계 계산
        const stats = calculateStats(sessions);
        setUserStats(stats);
      } catch (error) {
        console.error('학습 통계 로드 실패:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchUserStats();
  }, [navigate]);

  const calculateStats = (sessions: StudySession[]): UserStats => {
    if (sessions.length === 0) {
      return {
        totalSessions: 0,
        totalStudyTime: 0,
        averageScore: 0,
        totalProblems: 0,
        weakestArea: '데이터 없음',
        strongestArea: '데이터 없음',
        weeklyProgress: [],
        recentSessions: []
      };
    }

    const totalSessions = sessions.length;
    const totalStudyTime = sessions.reduce((sum, session) => sum + session.studyTime, 0);
    const totalProblems = sessions.reduce((sum, session) => sum + session.problemCount, 0);
    const averageScore = sessions.reduce((sum, session) => sum + session.averageScore, 0) / totalSessions;

    // 주간 진행률 계산
    const weeklyProgress = calculateWeeklyProgress(sessions);

    // 강점/약점 분석 (게임 타입별)
    const gameTypeStats = sessions.reduce((acc, session) => {
      if (!acc[session.gameType]) {
        acc[session.gameType] = { total: 0, count: 0 };
      }
      acc[session.gameType].total += session.averageScore;
      acc[session.gameType].count += 1;
      return acc;
    }, {} as Record<string, { total: number; count: number }>);

    const gameTypeAverages = Object.entries(gameTypeStats).map(([type, stats]) => ({
      type,
      average: stats.total / stats.count
    }));

    const strongestArea = gameTypeAverages.length > 0 
      ? gameTypeAverages.reduce((max, current) => 
          current.average > max.average ? current : max
        ).type
      : '데이터 없음';

    const weakestArea = gameTypeAverages.length > 0
      ? gameTypeAverages.reduce((min, current) => 
          current.average < min.average ? current : min
        ).type
      : '데이터 없음';

    return {
      totalSessions,
      totalStudyTime,
      averageScore: Math.round(averageScore * 10) / 10,
      totalProblems,
      weakestArea,
      strongestArea,
      weeklyProgress,
      recentSessions: sessions.slice(0, 10)
    };
  };

  const calculateWeeklyProgress = (sessions: StudySession[]): WeeklyProgress[] => {
    const weeklyData: Record<string, { scores: number[]; problems: number; time: number }> = {};
    
    sessions.forEach(session => {
      const date = new Date(session.date);
      const weekKey = `${date.getFullYear()}-W${Math.ceil((date.getDate() + date.getDay()) / 7)}`;
      
      if (!weeklyData[weekKey]) {
        weeklyData[weekKey] = { scores: [], problems: 0, time: 0 };
      }
      
      weeklyData[weekKey].scores.push(session.averageScore);
      weeklyData[weekKey].problems += session.problemCount;
      weeklyData[weekKey].time += session.studyTime;
    });

    return Object.entries(weeklyData)
      .map(([week, data]) => ({
        week,
        averageScore: Math.round(data.scores.reduce((sum, score) => sum + score, 0) / data.scores.length * 10) / 10,
        totalProblems: data.problems,
        studyTime: data.time,
        improvement: calculateImprovement(data.scores)
      }))
      .sort((a, b) => b.week.localeCompare(a.week))
      .slice(0, 8); // 최근 8주
  };

  const calculateImprovement = (scores: number[]): string => {
    if (scores.length < 2) return '+0%';
    
    const recent = scores.slice(0, Math.ceil(scores.length / 2));
    const older = scores.slice(Math.ceil(scores.length / 2));
    
    const recentAvg = recent.reduce((sum, score) => sum + score, 0) / recent.length;
    const olderAvg = older.reduce((sum, score) => sum + score, 0) / older.length;
    
    if (olderAvg === 0) return '+0%';
    
    const improvement = ((recentAvg - olderAvg) / olderAvg * 100);
    return `${improvement >= 0 ? '+' : ''}${Math.round(improvement)}%`;
  };

  const formatTime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}시간 ${minutes}분`;
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString('ko-KR', {
      month: 'short',
      day: 'numeric'
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">학습 통계를 불러오는 중...</p>
        </div>
      </div>
    );
  }

  if (!userStats) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 mb-4">학습 데이터가 없습니다.</p>
          <button
            onClick={() => navigate('/')}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            학습 시작하기
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 헤더 */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <button
              onClick={() => navigate('/')}
              className="flex items-center gap-2 text-blue-600 hover:text-blue-800 font-semibold"
            >
              <span>←</span>
              <span>홈으로 돌아가기</span>
            </button>
            <h1 className="text-2xl font-bold text-gray-900">📊 학습 분석</h1>
            <div className="w-20"></div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* 전체 통계 카드 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="p-2 bg-blue-100 rounded-lg">
                <span className="text-2xl">📚</span>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">총 학습 세션</p>
                <p className="text-2xl font-bold text-gray-900">{userStats.totalSessions}회</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="p-2 bg-green-100 rounded-lg">
                <span className="text-2xl">⏱️</span>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">총 학습 시간</p>
                <p className="text-2xl font-bold text-gray-900">{formatTime(userStats.totalStudyTime)}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="p-2 bg-yellow-100 rounded-lg">
                <span className="text-2xl">🎯</span>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">평균 점수</p>
                <p className="text-2xl font-bold text-gray-900">{userStats.averageScore}점</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="p-2 bg-purple-100 rounded-lg">
                <span className="text-2xl">📝</span>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">총 문제 수</p>
                <p className="text-2xl font-bold text-gray-900">{userStats.totalProblems}문제</p>
              </div>
            </div>
          </div>
        </div>

        {/* 강점/약점 분석 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">💪 강점 영역</h3>
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <p className="text-green-800 font-medium">{userStats.strongestArea}</p>
              <p className="text-green-600 text-sm mt-1">이 영역에서 뛰어난 성과를 보이고 있습니다!</p>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">🎯 개선 영역</h3>
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
              <p className="text-orange-800 font-medium">{userStats.weakestArea}</p>
              <p className="text-orange-600 text-sm mt-1">이 영역을 더 연습하면 좋겠습니다!</p>
            </div>
          </div>
        </div>

        {/* 주간 진행률 */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">📈 주간 진행률</h3>
          <div className="space-y-4">
            {userStats.weeklyProgress.map((week, index) => (
              <div key={week.week} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-4">
                  <span className="text-sm font-medium text-gray-600">{week.week}</span>
                  <span className="text-lg font-bold text-gray-900">{week.averageScore}점</span>
                </div>
                <div className="flex items-center gap-6 text-sm text-gray-600">
                  <span>{week.totalProblems}문제</span>
                  <span>{formatTime(week.studyTime)}</span>
                  <span className={`font-semibold ${week.improvement.startsWith('+') ? 'text-green-600' : 'text-red-600'}`}>
                    {week.improvement}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 최근 학습 세션 */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">🕒 최근 학습 세션</h3>
          <div className="space-y-3">
            {userStats.recentSessions.map((session) => (
              <div key={session.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-4">
                  <span className="text-sm text-gray-600">{formatDate(session.date)}</span>
                  <span className="font-medium text-gray-900">{session.gameType}</span>
                </div>
                <div className="flex items-center gap-6 text-sm text-gray-600">
                  <span>{session.problemCount}문제</span>
                  <span className="font-bold text-gray-900">{session.averageScore}점</span>
                  <span>{formatTime(session.studyTime)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 챗봇 위젯 */}
      <ChatbotWidget 
        initialContext={`학습 분석 결과:
        
총 학습 세션: ${userStats.totalSessions}회
총 학습 시간: ${formatTime(userStats.totalStudyTime)}
평균 점수: ${userStats.averageScore}점
총 문제 수: ${userStats.totalProblems}문제

강점 영역: ${userStats.strongestArea}
개선 영역: ${userStats.weakestArea}

최근 주간 진행률: ${userStats.weeklyProgress.length > 0 ? userStats.weeklyProgress[0].improvement : '데이터 없음'}

학습 분석에 대한 질문이나 개선 방향에 대한 조언을 구하시면 언제든 물어보세요!`}
      />
    </div>
  );
};

export default StudyStats; 