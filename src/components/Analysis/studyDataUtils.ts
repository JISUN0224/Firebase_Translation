import { doc, setDoc, addDoc, collection, updateDoc, getDoc, getDocs, query, where, orderBy, limit } from 'firebase/firestore';
import { db, auth } from '../../firebase';

export interface StudySession {
  id?: string;
  date: string;
  gameType: string;
  totalScore: number;
  problemCount: number;
  studyTime: number;
  averageScore: number;
  problems?: Array<{
    problemId: string;
    userAnswer: string;
    correctAnswer: string;
    score: number;
    timeUsed: number;
    difficulty: string;
  }>;
  metadata?: {
    difficulty: string;
    domain: string;
    targetLanguage: string;
  };
}

export interface UserProfile {
  displayName: string;
  email: string;
  joinDate: string;
  totalStudyTime: number;
  totalProblems: number;
  totalSessions: number;
  averageScore: number;
  lastLogin: string;
}

// 사용자 프로필 저장/업데이트
export const saveUserProfile = async (profile: Partial<UserProfile>) => {
  if (!auth.currentUser) {
    throw new Error('사용자가 로그인되지 않았습니다.');
  }

  const userId = auth.currentUser.uid;
  const userRef = doc(db, 'users', userId);
  
  await setDoc(userRef, {
    ...profile,
    lastLogin: new Date().toISOString(),
  }, { merge: true });
};

// 학습 세션 저장
export const saveStudySession = async (session: StudySession) => {
  if (!auth.currentUser) {
    throw new Error('사용자가 로그인되지 않았습니다.');
  }

  const userId = auth.currentUser.uid;
  const sessionsRef = collection(db, 'users', userId, 'sessions');
  
  const docRef = await addDoc(sessionsRef, {
    ...session,
    createdAt: new Date().toISOString(),
  });

  // 사용자 프로필 통계 업데이트
  await updateUserStats(userId, session);

  return docRef.id;
};

// 사용자 통계 업데이트
const updateUserStats = async (userId: string, session: StudySession) => {
  const userRef = doc(db, 'users', userId);
  const userDoc = await getDoc(userRef);
  
  if (userDoc.exists()) {
    const currentData = userDoc.data();
    const newStats = {
      totalStudyTime: (currentData.totalStudyTime || 0) + session.studyTime,
      totalProblems: (currentData.totalProblems || 0) + session.problemCount,
      totalSessions: (currentData.totalSessions || 0) + 1,
      averageScore: calculateNewAverage(
        currentData.averageScore || 0,
        currentData.totalSessions || 0,
        session.averageScore
      ),
    };
    
    await updateDoc(userRef, newStats);
  }
};

// 새로운 평균 점수 계산
const calculateNewAverage = (currentAvg: number, currentCount: number, newScore: number): number => {
  if (currentCount === 0) return newScore;
  return (currentAvg * currentCount + newScore) / (currentCount + 1);
};

// 사용자 학습 세션 가져오기
export const getUserSessions = async (limitCount: number = 50) => {
  if (!auth.currentUser) {
    throw new Error('사용자가 로그인되지 않았습니다.');
  }

  const userId = auth.currentUser.uid;
  const sessionsRef = collection(db, 'users', userId, 'sessions');
  const q = query(sessionsRef, orderBy('date', 'desc'), limit(limitCount));
  
  const querySnapshot = await getDocs(q);
  const sessions: StudySession[] = [];
  
  querySnapshot.forEach((doc) => {
    sessions.push({ id: doc.id, ...doc.data() } as StudySession);
  });
  
  return sessions;
};

// 사용자 프로필 가져오기
export const getUserProfile = async () => {
  if (!auth.currentUser) {
    throw new Error('사용자가 로그인되지 않았습니다.');
  }

  const userId = auth.currentUser.uid;
  const userRef = doc(db, 'users', userId);
  const userDoc = await getDoc(userRef);
  
  if (userDoc.exists()) {
    return userDoc.data() as UserProfile;
  }
  
  return null;
};

// 주간 통계 생성
export const generateWeeklyStats = async () => {
  if (!auth.currentUser) {
    throw new Error('사용자가 로그인되지 않았습니다.');
  }

  const userId = auth.currentUser.uid;
  const sessionsRef = collection(db, 'users', userId, 'sessions');
  
  // 최근 7일 세션 가져오기
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  
  const q = query(
    sessionsRef,
    where('date', '>=', weekAgo.toISOString()),
    orderBy('date', 'desc')
  );
  
  const querySnapshot = await getDocs(q);
  const sessions: StudySession[] = [];
  
  querySnapshot.forEach((doc) => {
    sessions.push({ id: doc.id, ...doc.data() } as StudySession);
  });

  // 주간 통계 계산
  const weeklyStats = {
    totalSessions: sessions.length,
    totalStudyTime: sessions.reduce((sum, session) => sum + session.studyTime, 0),
    totalProblems: sessions.reduce((sum, session) => sum + session.problemCount, 0),
    averageScore: sessions.length > 0 
      ? sessions.reduce((sum, session) => sum + session.averageScore, 0) / sessions.length 
      : 0,
    weekStart: weekAgo.toISOString(),
    weekEnd: new Date().toISOString(),
  };

  // 주간 통계 저장
  const weeklyStatsRef = collection(db, 'users', userId, 'weeklyStats');
  await addDoc(weeklyStatsRef, {
    ...weeklyStats,
    createdAt: new Date().toISOString(),
  });

  return weeklyStats;
};

// 데이터 정리 (오래된 데이터 삭제)
export const cleanupOldData = async (daysToKeep: number = 90) => {
  if (!auth.currentUser) {
    throw new Error('사용자가 로그인되지 않았습니다.');
  }

  const userId = auth.currentUser.uid;
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
  
  const sessionsRef = collection(db, 'users', userId, 'sessions');
  const q = query(
    sessionsRef,
    where('date', '<', cutoffDate.toISOString())
  );
  
  const querySnapshot = await getDocs(q);
  
  // 오래된 세션 데이터 삭제 (실제 구현에서는 배치 삭제 사용)
  console.log(`${querySnapshot.size}개의 오래된 세션 데이터가 정리 대상입니다.`);
  
  return querySnapshot.size;
};

// 학습 데이터 내보내기 (JSON)
export const exportStudyData = async () => {
  if (!auth.currentUser) {
    throw new Error('사용자가 로그인되지 않았습니다.');
  }

  const userId = auth.currentUser.uid;
  const profile = await getUserProfile();
  const sessions = await getUserSessions(1000); // 최대 1000개 세션
  
  const exportData = {
    profile,
    sessions,
    exportedAt: new Date().toISOString(),
  };
  
  return exportData;
}; 