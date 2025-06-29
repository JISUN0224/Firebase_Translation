import React, { useState, useEffect } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db, auth } from '../../firebase';
import ChatbotWidget from '../../ChatbotWidget';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { saveStudySession } from '../Analysis/studyDataUtils';

// 단계 상수
const STEPS = {
  START: 'start',
  KO_TO_ZH: 'ko-to-zh',
  KO_ZH_RESULT: 'ko-zh-result',
  KO_ZH_IMPROVE: 'ko-zh-improve',
  ZH_TO_KO: 'zh-to-ko',
  ZH_KO_RESULT: 'zh-ko-result',
  ZH_KO_IMPROVE: 'zh-ko-improve',
  FINAL_RESULT: 'final-result',
} as const;
type StepType = typeof STEPS[keyof typeof STEPS];

interface Problem {
  id: string;
  korean: string;
  chinese: string;
  ChatGPT_번역?: string;
  difficulty: string;
  field: string;
}

interface CompletedTranslation {
  id: string;
  originalKorean: string;
  correctChinese: string;
  userKoToZh: string;
  userZhToKo: string;
  koToZhScore: number;
  zhToKoScore: number;
  difficulty: string;
  field: string;
  completedAt: Date;
  timeSpent: number;
}

interface SessionStats {
  totalProblems: number;
  totalScore: number;
  averageScore: number;
  bestStreak: number;
  timeSpent: number;
  accuracyRate: number;
  difficultyStats: Record<'상'|'중'|'하', { attempted: number; average: number }>;
  weakWords: string[];
  strongFields: string[];
}

// 텍스트 유사도 계산 (개선된 버전)
function calculateSimilarity(text1: string, text2: string): number {
  if (!text1 || !text2) return 0;
  if (text1 === text2) return 1;
  
  // 중국어와 한국어, 영어 모두 포함하여 단어 분리
  const words1 = text1.trim()
    .replace(/[\s()（）【】\[\].,。，？！?!]/g, ' ')  // 구두점을 공백으로
    .split(/\s+/)
    .filter(word => word.length > 0);
  
  const words2 = text2.trim()
    .replace(/[\s()（）【】\[\].,。，？！?!]/g, ' ')  // 구두점을 공백으로
    .split(/\s+/)
    .filter(word => word.length > 0);
  
  if (words1.length === 0 && words2.length === 0) return 1;
  if (words1.length === 0 || words2.length === 0) return 0;
  
  const set1 = new Set(words1);
  const set2 = new Set(words2);
  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);
  
  return intersection.size / union.size;
}

// 점수 계산
function calculateScore(userText: string, correctText: string, difficulty: string): number {
  const similarity = calculateSimilarity(userText, correctText);
  let baseScore = 10;
  if (difficulty === '상') baseScore = 20;
  else if (difficulty === '중') baseScore = 15;
  if (similarity >= 0.9) return baseScore + 10;
  if (similarity >= 0.7) return baseScore;
  if (similarity >= 0.5) return Math.floor(baseScore * 0.7);
  return 0;
}

function calculateBestStreak(completed: CompletedTranslation[]): number {
  let best = 0, current = 0;
  for (const t of completed) {
    // 평균 점수가 70점 이상이면 연속으로 카운트
    if (((t.koToZhScore + t.zhToKoScore) / 2) >= 70) current++;
    else current = 0;
    if (current > best) best = current;
  }
  return best;
}

function calculateSessionStats(completedTranslations: CompletedTranslation[]): SessionStats {
  if (completedTranslations.length === 0) {
    return {
      totalProblems: 0,
      totalScore: 0,
      averageScore: 0,
      bestStreak: 0,
      timeSpent: 0,
      accuracyRate: 0,
      difficultyStats: { 상: { attempted: 0, average: 0 }, 중: { attempted: 0, average: 0 }, 하: { attempted: 0, average: 0 } },
      weakWords: [],
      strongFields: []
    };
  }
  const totalScore = completedTranslations.reduce((sum, t) => sum + t.koToZhScore + t.zhToKoScore, 0);
  const averageScore = totalScore / (completedTranslations.length * 2);
  const timeSpent = completedTranslations.reduce((sum, t) => sum + t.timeSpent, 0);
  // 정확도 계산: 각 번역별로 평균 70점 이상이면 정답으로 인정
  const goodScores = completedTranslations.filter(t => ((t.koToZhScore + t.zhToKoScore) / 2) >= 70).length;
  const accuracyRate = goodScores / completedTranslations.length;
  const difficultyStats = { 상: { attempted: 0, average: 0 }, 중: { attempted: 0, average: 0 }, 하: { attempted: 0, average: 0 } };
  ['상', '중', '하'].forEach(difficulty => {
    const filtered = completedTranslations.filter(t => t.difficulty === difficulty);
    if (filtered.length > 0) {
      difficultyStats[difficulty as '상'|'중'|'하'].attempted = filtered.length;
      difficultyStats[difficulty as '상'|'중'|'하'].average = filtered.reduce((sum, t) => sum + (t.koToZhScore + t.zhToKoScore) / 2, 0) / filtered.length;
    }
  });
  const weakTranslations = completedTranslations.filter(t => t.koToZhScore < 70 || t.zhToKoScore < 70);
  const weakWords = [...new Set(
    weakTranslations.flatMap(t => [
      ...(t.userKoToZh.match(/[\u4e00-\u9fff]+/g) || []),
      ...(t.userZhToKo.match(/[가-힣]+/g) || [])
    ])
  )].slice(0, 10);
  const strongTranslations = completedTranslations.filter(t => t.koToZhScore >= 80 && t.zhToKoScore >= 80);
  const strongFields = [...new Set(strongTranslations.map(t => t.field))];
  return {
    totalProblems: completedTranslations.length,
    totalScore,
    averageScore,
    bestStreak: calculateBestStreak(completedTranslations),
    timeSpent,
    accuracyRate,
    difficultyStats,
    weakWords,
    strongFields
  };
}

// Helper for type-safe access
const getDifficultyStats = (
  stats: Record<'상'|'중'|'하', { attempted: number; average: number }>,
  difficulty: '상'|'중'|'하'
) => stats[difficulty];

const difficulties: { key: string; statsKey: '상'|'중'|'하' }[] = [
  { key: '상', statsKey: '상' },
  { key: '중', statsKey: '중' },
  { key: '하', statsKey: '하' },
];

// Helper for type guard
function isDifficultyKey(key: string): key is '상'|'중'|'하' {
  return key === '상' || key === '중' || key === '하';
}

// 1. 차이점 분석 (mock, 실제론 AI 활용)
function getDifferences(original: string, correct: string): string[] {
  // 실제론 AI 분석 결과를 사용, 여기선 간단 비교
  if (!original || !correct) return [];
  if (original === correct) return ['거의 동일합니다!'];
  return [
    '어휘 선택이 다릅니다.',
    '문장 구조가 다릅니다.',
    '표현 방식이 다릅니다.'
  ];
}

// Gemini AI 피드백 함수
async function getAIFeedback(
  originalText: string,
  userTranslation: string,
  direction: 'ko-to-zh' | 'zh-to-ko'
): Promise<{ error: string; improvement: string; hint: string }> {
  let prompt = '';
  if (direction === 'ko-to-zh') {
    prompt = `한국어 원문: ${originalText}\n사용자의 중국어 번역: ${userTranslation}\n\n한국어를 중국어로 번역한 결과를 평가해주세요. 다음 형식으로 간결하게 답해주세요:\n오류: [문법, 어순, 어휘 선택 등의 주요 오류 1개, 없으면 \"없음\"]\n개선점: [더 자연스러운 중국어 표현을 위한 핵심 개선점 1개]\n힌트: [중국어 번역 시 주의할 점이나 팁 1개]\n\n각 항목은 한 문장으로만 작성.`;
  } else {
    prompt = `중국어 원문: ${originalText}\n사용자의 한국어 번역: ${userTranslation}\n\n중국어를 한국어로 번역한 결과를 평가해주세요. 다음 형식으로 간결하게 답해주세요:\n오류: [문법, 어순, 뉘앙스 등의 주요 오류 1개, 없으면 \"없음\"]\n개선점: [더 자연스러운 한국어 표현을 위한 핵심 개선점 1개]\n힌트: [중국어에서 한국어로 번역 시 주의할 점이나 팁 1개]\n\n각 항목은 한 문장으로만 작성.`;
  }
  try {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const response = await axios.post(url, {
      contents: [{ parts: [{ text: prompt }] }]
    }, { timeout: 20000 });
    const text = response.data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const lines = text.split('\n').filter((line: string) => line.trim());
    const error = lines.find((line: string) => line.includes('오류:'))?.replace('오류:', '').trim() || '분석 중 오류 발생';
    const improvement = lines.find((line: string) => line.includes('개선점:'))?.replace('개선점:', '').trim() || '계속 연습하세요';
    const hint = lines.find((line: string) => line.includes('힌트:'))?.replace('힌트:', '').trim() || '다음에 더 신중하게 번역해보세요';
    return { error, improvement, hint };
  } catch (err) {
    console.error('AI 피드백 요청 실패:', err);
    return {
      error: '문법이나 어휘를 다시 확인해보세요',
      improvement: '정답과 비교하며 차이점을 찾아보세요',
      hint: '핵심 단어의 정확한 의미를 파악해보세요'
    };
  }
}

const ReverseTranslation: React.FC = () => {
  const [step, setStep] = useState<StepType>(STEPS.START);
  const [problems, setProblems] = useState<Problem[]>([]);
  const [problemIndex, setProblemIndex] = useState(0);
  const [userKoToZh, setUserKoToZh] = useState('');
  const [userZhToKo, setUserZhToKo] = useState('');
  const [koToZhScore, setKoToZhScore] = useState(0);
  const [finalScore, setFinalScore] = useState(0);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [loading, setLoading] = useState(true);
  const [completedTranslations, setCompletedTranslations] = useState<CompletedTranslation[]>([]);
  const [activeTab, setActiveTab] = useState<'result' | 'dashboard'>('result');

  // 개선 입력 및 결과 상태 (한→중)
  const [koToZhImproved, setKoToZhImproved] = useState('');
  const [koToZhImprovementResult, setKoToZhImprovementResult] = useState<any>(null);
  const [koToZhImprovementLoading, setKoToZhImprovementLoading] = useState(false);
  const [koToZhImprovementError, setKoToZhImprovementError] = useState<string | null>(null);
  const [showKoZhImprovement, setShowKoZhImprovement] = useState(false);

  // 개선 입력 및 결과 상태 (중→한)
  const [zhToKoImproved, setZhToKoImproved] = useState('');
  const [zhToKoImprovementResult, setZhToKoImprovementResult] = useState<any>(null);
  const [zhToKoImprovementLoading, setZhToKoImprovementLoading] = useState(false);
  const [zhToKoImprovementError, setZhToKoImprovementError] = useState<string | null>(null);
  const [showZhKoImprovement, setShowZhKoImprovement] = useState(false);

  const [feedbackLoading, setFeedbackLoading] = useState(false);

  // AI 피드백 상태
  const [koToZhFeedback, setKoToZhFeedback] = useState<{error: string; improvement: string; hint: string} | null>(null);
  const [zhToKoFeedback, setZhToKoFeedback] = useState<{error: string; improvement: string; hint: string} | null>(null);

  const navigate = useNavigate();

  // 문제 로딩 (ChatGPT_번역 필드 우선)
  useEffect(() => {
    const fetchProblems = async () => {
      try {
        const querySnapshot = await getDocs(collection(db, 'translationContents'));
        const loadedProblems: Problem[] = [];
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          loadedProblems.push({
            id: doc.id,
            korean: data["한국어"] || '',
            chinese: data["중국어"] || data.ChatGPT_번역 || '',
            ChatGPT_번역: data.ChatGPT_번역 || data["중국어"] || '',
            difficulty: data["난이도"] || '중',
            field: data["분야"] || '일반',
          });
        });
        setProblems(loadedProblems.filter(p => p.korean && (p.chinese || p.ChatGPT_번역)));
      } catch (error) {
        setProblems([]);
      } finally {
        setLoading(false);
      }
    };
    fetchProblems();
  }, []);

  // 현재 문제
  const current = problems[problemIndex];
  const mainAnswer = current?.ChatGPT_번역 || current?.chinese || '';

  // 챌린지 시작
  const startChallenge = () => {
    setStep(STEPS.KO_TO_ZH);
    setUserKoToZh('');
    setUserZhToKo('');
    setKoToZhScore(0);
    setFinalScore(0);
  };

  const analyzeImprovement = (original: string, improved: string, correct: string) => {
    const originalScore = calculateSimilarity(original, correct);
    const improvedScore = calculateSimilarity(improved, correct);
    const improvement = improvedScore - originalScore;
    return {
      originalScore: Math.round(originalScore * 100),
      improvedScore: Math.round(improvedScore * 100),
      improvement: Math.round(improvement * 100),
      hasImproved: improvement > 0.1,
      message: improvement > 0.2 ? "🎉 크게 개선되었습니다!" :
               improvement > 0.1 ? "👍 조금 개선되었네요!" :
               improvement > -0.1 ? "🤔 비슷한 수준이에요" :
               "😅 다시 한번 시도해보세요"
    };
  };

  // 개선된 번역 점수 계산 함수
  const getFinalKoToZhScore = () => {
    if (koToZhImprovementResult && koToZhImproved.trim()) {
      return calculateScore(koToZhImproved, mainAnswer, current?.difficulty || '중');
    }
    return koToZhScore;
  };

  const getFinalZhToKoScore = () => {
    if (zhToKoImprovementResult && zhToKoImproved.trim()) {
      return calculateScore(zhToKoImproved, current?.korean || '', current?.difficulty || '중');
    }
    return finalScore;
  };

  // 최종 번역 텍스트 가져오기
  const getFinalKoToZhText = () => {
    return (koToZhImproved.trim() && showKoZhImprovement) ? koToZhImproved : userKoToZh;
  };

  const getFinalZhToKoText = () => {
    return (zhToKoImproved.trim() && showZhKoImprovement) ? zhToKoImproved : userZhToKo;
  };

  // 한→중 번역 제출 (AI 피드백)
  const handleKoToZhSubmit = async () => {
    if (!userKoToZh.trim()) {
      alert('중국어 번역을 입력해주세요!');
      return;
    }
    const score = calculateScore(userKoToZh, mainAnswer, current?.difficulty || '중');
    setKoToZhScore(score);
    setFeedbackLoading(true);
    setShowKoZhImprovement(false);
    setKoToZhImproved('');
    setKoToZhImprovementResult(null);
    try {
      const feedback = await getAIFeedback(current?.korean || '', userKoToZh, 'ko-to-zh');
      setKoToZhFeedback(feedback);
    } catch (err) {
      setKoToZhFeedback({
        error: '문법이나 어휘를 다시 확인해보세요',
        improvement: '정답과 비교하며 차이점을 찾아보세요',
        hint: '핵심 단어의 정확한 의미를 파악해보세요'
      });
    } finally {
      setFeedbackLoading(false);
    }
    setStep(STEPS.KO_ZH_RESULT);
  };

  // 한→중 개선 제출
  const handleKoZhImprovementSubmit = async () => {
    if (!koToZhImproved.trim()) {
      alert('개선된 번역을 입력해주세요!');
      return;
    }
    setKoToZhImprovementLoading(true);
    setKoToZhImprovementError(null);
    try {
      const result = analyzeImprovement(userKoToZh, koToZhImproved, mainAnswer);
      setKoToZhImprovementResult(result);
      setShowKoZhImprovement(true);
    } catch (err) {
      setKoToZhImprovementError('AI 피드백을 불러오는데 실패했습니다.');
    } finally {
      setKoToZhImprovementLoading(false);
    }
  };

  // 중→한 번역 제출 (AI 피드백)
  const handleZhToKoSubmit = async () => {
    if (!userZhToKo.trim()) {
      alert('한국어 번역을 입력해주세요!');
      return;
    }
    const score = calculateScore(userZhToKo, current?.korean || '', current?.difficulty || '중');
    setFinalScore(score);
    setFeedbackLoading(true);
    setShowZhKoImprovement(false);
    setZhToKoImproved('');
    setZhToKoImprovementResult(null);
    try {
      const feedback = await getAIFeedback(mainAnswer, userZhToKo, 'zh-to-ko');
      setZhToKoFeedback(feedback);
    } catch (err) {
      setZhToKoFeedback({
        error: '문법이나 어휘를 다시 확인해보세요',
        improvement: '정답과 비교하며 차이점을 찾아보세요',
        hint: '핵심 단어의 정확한 의미를 파악해보세요'
      });
    } finally {
      setFeedbackLoading(false);
    }
    setStep(STEPS.ZH_KO_RESULT);
  };

  // 중→한 개선 제출
  const handleZhKoImprovementSubmit = async () => {
    if (!zhToKoImproved.trim()) {
      alert('개선된 번역을 입력해주세요!');
      return;
    }
    setZhToKoImprovementLoading(true);
    setZhToKoImprovementError(null);
    try {
      const result = analyzeImprovement(userZhToKo, zhToKoImproved, current?.korean || '');
      setZhToKoImprovementResult(result);
      setShowZhKoImprovement(true);
    } catch (err) {
      setZhToKoImprovementError('AI 피드백을 불러오는데 실패했습니다.');
    } finally {
      setZhToKoImprovementLoading(false);
    }
  };

  // 다음 문제로 이동
  const nextProblem = () => {
    // 현재 문제를 완료된 번역 목록에 추가
    if (current) {
      const finalKoZhScore = getFinalKoToZhScore();
      const finalZhKoScore = getFinalZhToKoScore();
      const finalKoZhText = getFinalKoToZhText();
      const finalZhKoText = getFinalZhToKoText();
      
      const completed: CompletedTranslation = {
        id: current.id,
        originalKorean: current.korean,
        correctChinese: mainAnswer,
        userKoToZh: finalKoZhText,  // 개선된 번역 또는 원래 번역
        userZhToKo: finalZhKoText,  // 개선된 번역 또는 원래 번역
        koToZhScore: finalKoZhScore, // 개선된 점수 또는 원래 점수
        zhToKoScore: finalZhKoScore, // 개선된 점수 또는 원래 점수
        difficulty: current.difficulty,
        field: current.field,
        completedAt: new Date(),
        timeSpent: 0
      };
      setCompletedTranslations(prev => [...prev, completed]);
      setScore(prev => prev + finalKoZhScore + finalZhKoScore);
      if (finalKoZhScore >= 70 && finalZhKoScore >= 70) {
        setStreak(prev => prev + 1);
      } else {
        setStreak(0);
      }
    }

    if (problemIndex < problems.length - 1) {
      setProblemIndex(i => i + 1);
      setStep(STEPS.KO_TO_ZH);
      setUserKoToZh('');
      setUserZhToKo('');
      setKoToZhScore(0);
      setFinalScore(0);
      setKoToZhFeedback(null);
      setZhToKoFeedback(null);
      // 개선 상태 초기화
      setKoToZhImproved('');
      setZhToKoImproved('');
      setKoToZhImprovementResult(null);
      setZhToKoImprovementResult(null);
      setShowKoZhImprovement(false);
      setShowZhKoImprovement(false);
    } else {
      // 마지막 문제면 재시작
      setProblemIndex(0);
      setStep(STEPS.START);
      setScore(0);
      setStreak(0);
      
      // 게임 결과 저장
      setTimeout(() => {
        saveGameResults();
      }, 100);
      
      setCompletedTranslations([]);
    }
    setActiveTab('result');
  };

  const sessionStats = calculateSessionStats(completedTranslations);

  // 게임 결과 저장 함수
  const saveGameResults = async () => {
    if (!auth.currentUser || completedTranslations.length === 0) return;
    
    try {
      const sessionData = {
        date: new Date().toISOString().split('T')[0], // "2025-01-20"
        gameType: '양방향_번역',
        totalScore: sessionStats.totalScore,
        problemCount: sessionStats.totalProblems,
        studyTime: sessionStats.timeSpent,
        averageScore: sessionStats.averageScore,
        metadata: {
          difficulty: '혼합',
          domain: '양방향번역',
          targetLanguage: '중국어',
          accuracyRate: sessionStats.accuracyRate,
          bestStreak: sessionStats.bestStreak,
          completedCount: completedTranslations.length
        }
      };
      
      await saveStudySession(sessionData);
      console.log('양방향 번역 결과 저장 완료:', sessionData);
    } catch (error) {
      console.error('양방향 번역 결과 저장 실패:', error);
    }
  };

  // 최근 번역 결과 요약 (간단 버전)
  const lastFeedback = completedTranslations.length > 0
    ? `마지막 번역 문제: ${completedTranslations[completedTranslations.length-1].originalKorean}\n내 번역: ${completedTranslations[completedTranslations.length-1].userKoToZh}\n정답: ${completedTranslations[completedTranslations.length-1].correctChinese}`
    : '아직 번역 결과가 없습니다.';

  // 이전 스텝으로 이동
  const goToPrevStep = () => {
    switch (step) {
      case STEPS.KO_TO_ZH:
        setStep(STEPS.START);
        break;
      case STEPS.KO_ZH_RESULT:
        setStep(STEPS.KO_TO_ZH);
        break;
      case STEPS.ZH_TO_KO:
        setStep(STEPS.KO_ZH_RESULT);
        break;
      case STEPS.FINAL_RESULT:
        setStep(STEPS.ZH_TO_KO);
        break;
      default:
        break;
    }
  };

  // 메인 레이아웃
  return (
    <>
      {/* AI 피드백 로딩 오버레이 */}
      {feedbackLoading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4 p-10 bg-white/80 rounded-2xl shadow-2xl border-2 border-purple-300">
            <div className="animate-spin rounded-full h-14 w-14 border-b-4 border-purple-600 mb-2"></div>
            <div className="text-xl font-bold text-purple-700">AI피드백을 불러오는 중입니다..</div>
          </div>
        </div>
      )}
      {/* Gemini 챗봇 위젯: START 화면 제외하고 항상 표시 */}
      {step !== STEPS.START && (
        <ChatbotWidget initialContext={lastFeedback} />
      )}
      <div className="min-h-screen bg-gradient-to-br from-blue-500 via-purple-500 to-pink-400 py-10 px-2">
        <div className="w-full max-w-7xl mx-auto" style={{ minWidth: '1000px' }}>
          {/* 네비게이션 바 (START 제외) */}
          {step !== STEPS.START && (
            <div className="flex items-center justify-between mb-8 px-2 py-3 bg-white/30 backdrop-blur-md rounded-xl shadow-md">
              <button
                className="flex items-center gap-1 text-lg font-bold text-gray-700 hover:text-blue-700 px-4 py-2 rounded transition"
                onClick={goToPrevStep}
              >
                <span className="text-2xl">←</span>
                <span>이전</span>
              </button>
              <button
                className="flex items-center gap-2 text-lg font-bold text-gray-700 hover:text-green-700 px-4 py-2 rounded transition"
                onClick={() => navigate('/')}
              >
                <span className="text-2xl">🏠</span>
                <span>홈으로</span>
              </button>
              <div className="w-16" /> {/* 오른쪽 공간 맞춤용 */}
            </div>
          )}
          {/* 점수 상태 바 */}
          {step !== STEPS.START && current && (
            <div className="flex justify-between items-center bg-white/10 backdrop-blur-sm rounded-lg p-4 mb-6">
              <div className="text-white">
                <span className="text-lg">점수: </span>
                <span className="text-2xl font-bold text-yellow-300">{score}</span>
              </div>
              <div className="text-white">
                <span className="text-lg">연속 정답: </span>
                <span className="text-2xl font-bold text-green-300">{streak}</span>
              </div>
              <div className="text-white">
                <span className="text-lg">문제: </span>
                <span className="text-xl font-bold">{problemIndex + 1}/{problems.length}</span>
              </div>
            </div>
          )}
          {/* 카드 영역 */}
          <div className="max-w-4xl mx-auto">
            {/* 시작 화면 */}
            {step === STEPS.START && (
              <div className="text-center space-y-6 bg-gradient-to-br from-blue-600 to-purple-600 rounded-2xl shadow-lg p-12 mt-12">
                <h1 className="text-4xl font-bold text-white">🔄 양방향 번역 챌린지</h1>
                <p className="text-xl text-white/90">같은 문장, 두 방향으로 완벽하게!</p>
                <p className="text-lg text-white/80">
                  하나의 문장을 한국어에서 중국어로, 그리고 다시 중국어에서 한국어로 번역하며<br/>
                  언어의 깊이를 경험해보세요.
                </p>
                <button 
                  className="bg-green-500 hover:bg-green-600 text-white px-8 py-4 rounded-xl text-xl font-bold mt-6"
                  onClick={startChallenge}
                  disabled={loading || problems.length === 0}
                >
                  {loading ? '문제 불러오는 중...' : '챌린지 시작'}
                </button>
                {problems.length === 0 && !loading && (
                  <div className="text-red-200 font-bold mt-4">문제가 없습니다.</div>
                )}
              </div>
            )}
            {/* 한→중 번역 입력 */}
            {step === STEPS.KO_TO_ZH && current && (
              <div className="space-y-6 animate-fade-in">
                <div className="bg-white rounded-xl p-6 border-2 border-blue-200">
                  <h3 className="text-lg font-bold text-gray-700 mb-3">🇰🇷 한국어 원문</h3>
                  <div className="bg-blue-50 p-4 rounded-lg text-lg font-medium text-blue-900">{current.korean}</div>
                </div>
                <div className="bg-white rounded-xl p-6">
                  <h3 className="text-lg font-bold text-gray-700 mb-3">🇨🇳 중국어 번역</h3>
                  <textarea
                    className="w-full p-4 border-2 border-gray-300 rounded-lg text-lg"
                    rows={4}
                    value={userKoToZh}
                    onChange={e => setUserKoToZh(e.target.value)}
                    placeholder="중국어로 번역해주세요..."
                  />
                  <div className="text-right text-sm text-gray-500 mt-2">{userKoToZh.length}자</div>
                </div>
                <button
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-xl text-xl font-bold"
                  onClick={handleKoToZhSubmit}
                  disabled={!userKoToZh.trim()}
                >
                  번역 제출
                </button>
              </div>
            )}
            {/* 1단계 결과 + AI 피드백 + 즉시 개선 */}
            {step === STEPS.KO_ZH_RESULT && current && (
              <div className="max-w-4xl mx-auto space-y-6">
                <div className="bg-green-50 rounded-xl p-6 border-2 border-green-200">
                  <h2 className="text-xl font-bold text-green-800 mb-4">✅ 1단계 완료: 한국어 → 중국어</h2>
                  <div className="space-y-4">
                    <div className="bg-blue-50 p-4 rounded-lg">
                      <h4 className="font-bold text-blue-800 mb-2">🇨🇳 당신의 번역:</h4>
                      <p className="text-lg">{userKoToZh}</p>
                    </div>
                    <div className="bg-yellow-50 p-4 rounded-lg">
                      <h4 className="font-bold text-yellow-800 mb-2">✅ ChatGPT 번역 (참고):</h4>
                      <p className="text-lg">{mainAnswer}</p>
                    </div>
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <h4 className="font-bold text-gray-800 mb-2">📖 실제 정답:</h4>
                      <p className="text-lg">{current.chinese}</p>
                    </div>
                  </div>
                  <div className="text-center mt-6">
                    <div className="text-2xl font-bold text-green-600 mb-4">
                      {koToZhScore > 0 ? `+${koToZhScore}점 획득!` : '다시 도전해보세요!'}
                    </div>
                  </div>
                </div>
                {/* 기본 AI 피드백 표시 (개선 입력 전에도 항상 표시) */}
                {koToZhFeedback && (
                  <div className="bg-white p-6 rounded-xl border">
                    <h4 className="font-bold text-purple-800 mb-3 flex items-center gap-2">
                      <span>🤖</span>AI 피드백
                    </h4>
                    <div className="space-y-2 text-base">
                      <p><span className="font-bold text-red-600">오류:</span> {koToZhFeedback.error}</p>
                      <p><span className="font-bold text-blue-600">개선점:</span> {koToZhFeedback.improvement}</p>
                      <p><span className="font-bold text-green-600">힌트:</span> {koToZhFeedback.hint}</p>
                    </div>
                  </div>
                )}
                {/* 즉시 개선 입력란 */}
                {!showKoZhImprovement && (
                  <div className="bg-white p-6 rounded-xl border">
                    <h3 className="text-lg font-bold text-gray-700 mb-3">✨ 정답을 참고해서 내 번역을 더 좋게 고쳐보세요</h3>
                    <textarea
                      className="w-full p-4 border-2 border-purple-300 rounded-lg text-lg"
                      rows={3}
                      value={koToZhImproved}
                      onChange={e => setKoToZhImproved(e.target.value)}
                      placeholder="정답을 참고해서 더 나은 번역을 만들어보세요..."
                    />
                    <button
                      className="w-full bg-purple-600 hover:bg-purple-700 text-white py-4 rounded-xl text-xl font-bold mt-4"
                      onClick={handleKoZhImprovementSubmit}
                      disabled={!koToZhImproved.trim() || koToZhImprovementLoading}
                    >
                      {koToZhImprovementLoading ? '개선 분석 중...' : '개선된 번역 제출'}
                    </button>
                    {koToZhImprovementError && (
                      <div className="text-red-600 text-sm bg-red-50 p-3 rounded mt-2">{koToZhImprovementError}</div>
                    )}
                  </div>
                )}
                {/* 개선 전후 비교/점수/AI 피드백 */}
                {showKoZhImprovement && koToZhImprovementResult && (
                  <div className="bg-indigo-50 p-6 rounded-xl border border-indigo-200 mt-6">
                    <h4 className="font-bold text-indigo-800 mb-3">📊 개선 효과 분석</h4>
                    <div className="flex gap-4">
                      <div className="flex-1 text-center">
                        <div className="text-lg font-bold text-gray-700 mb-1">개선 전</div>
                        <div className="text-2xl text-red-600 font-bold">{koToZhImprovementResult.originalScore}점</div>
                        <div className="text-sm mt-2">{userKoToZh}</div>
                      </div>
                      <div className="flex-1 text-center">
                        <div className="text-lg font-bold text-gray-700 mb-1">개선 후</div>
                        <div className="text-2xl text-green-600 font-bold">{koToZhImprovementResult.improvedScore}점</div>
                        <div className="text-sm mt-2">{koToZhImproved}</div>
                      </div>
                    </div>
                    <div className="text-center mt-4 text-xl font-bold">{koToZhImprovementResult.message}</div>
                    {koToZhFeedback && (
                      <div className="mt-6 bg-white p-4 rounded-lg border">
                        <h4 className="font-bold text-purple-800 mb-3 flex items-center gap-2">
                          <span>🤖</span>AI 피드백
                        </h4>
                        <div className="space-y-2 text-base">
                          <p><span className="font-bold text-red-600">오류:</span> {koToZhFeedback.error}</p>
                          <p><span className="font-bold text-blue-600">개선점:</span> {koToZhFeedback.improvement}</p>
                          <p><span className="font-bold text-green-600">힌트:</span> {koToZhFeedback.hint}</p>
                        </div>
                      </div>
                    )}
                    <button
                      className="w-full bg-purple-700 hover:bg-purple-800 text-white py-4 rounded-xl text-xl font-bold mt-6"
                      onClick={() => setStep(STEPS.ZH_TO_KO)}
                    >
                      🔄 역방향 도전 시작
                    </button>
                  </div>
                )}
              </div>
            )}
            {/* 중→한 번역 입력 */}
            {step === STEPS.ZH_TO_KO && current && (
              <div className="space-y-6 animate-fade-in">
                <div className="bg-white rounded-xl p-6 border-2 border-purple-200">
                  <h3 className="text-lg font-bold text-gray-700 mb-3">🇨🇳 중국어 원문</h3>
                  <div className="bg-purple-50 p-4 rounded-lg text-lg font-medium text-purple-900">{mainAnswer}</div>
                </div>
                <div className="bg-white rounded-xl p-6">
                  <h3 className="text-lg font-bold text-gray-700 mb-3">🇰🇷 한국어 번역</h3>
                  <textarea
                    className="w-full p-4 border-2 border-gray-300 rounded-lg text-lg"
                    rows={4}
                    value={userZhToKo}
                    onChange={e => setUserZhToKo(e.target.value)}
                    placeholder="한국어로 번역해주세요..."
                  />
                  <div className="text-right text-sm text-gray-500 mt-2">{userZhToKo.length}자</div>
                </div>
                <button
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white py-4 rounded-xl text-xl font-bold"
                  onClick={handleZhToKoSubmit}
                  disabled={!userZhToKo.trim()}
                >
                  번역 제출
                </button>
              </div>
            )}
            {/* 최종 결과 + AI 피드백 + 즉시 개선 */}
            {step === STEPS.ZH_KO_RESULT && current && (
              <div className="max-w-4xl mx-auto space-y-6">
                <div className="bg-purple-50 rounded-xl p-6 border-2 border-purple-200">
                  <h2 className="text-xl font-bold text-purple-800 mb-4">✅ 2단계 완료: 중국어 → 한국어</h2>
                  <div className="space-y-4">
                    <div className="bg-purple-50 p-4 rounded-lg">
                      <h4 className="font-bold text-purple-800 mb-2">🇰🇷 당신의 번역:</h4>
                      <p className="text-lg">{userZhToKo}</p>
                    </div>
                    <div className="bg-blue-50 p-4 rounded-lg">
                      <h4 className="font-bold text-blue-800 mb-2">✅ 원래 한국어:</h4>
                      <p className="text-lg">{current.korean}</p>
                    </div>
                  </div>
                  <div className="text-center mt-6">
                    <div className="text-2xl font-bold text-purple-600 mb-4">
                      {finalScore > 0 ? `+${finalScore}점 획득!` : '다시 도전해보세요!'}
                    </div>
                  </div>
                </div>
                {/* 기본 AI 피드백 표시 (개선 입력 전에도 항상 표시) */}
                {zhToKoFeedback && (
                  <div className="bg-white p-6 rounded-xl border">
                    <h4 className="font-bold text-purple-800 mb-3 flex items-center gap-2">
                      <span>🤖</span>AI 피드백
                    </h4>
                    <div className="space-y-2 text-base">
                      <p><span className="font-bold text-red-600">오류:</span> {zhToKoFeedback.error}</p>
                      <p><span className="font-bold text-blue-600">개선점:</span> {zhToKoFeedback.improvement}</p>
                      <p><span className="font-bold text-green-600">힌트:</span> {zhToKoFeedback.hint}</p>
                    </div>
                  </div>
                )}
                {/* 즉시 개선 입력란 */}
                {!showZhKoImprovement && (
                  <div className="bg-white p-6 rounded-xl border">
                    <h3 className="text-lg font-bold text-gray-700 mb-3">✨ 원문을 참고해서 내 번역을 더 좋게 고쳐보세요</h3>
                    <textarea
                      className="w-full p-4 border-2 border-purple-300 rounded-lg text-lg"
                      rows={3}
                      value={zhToKoImproved}
                      onChange={e => setZhToKoImproved(e.target.value)}
                      placeholder="원문을 참고해서 더 나은 번역을 만들어보세요..."
                    />
                    <button
                      className="w-full bg-purple-600 hover:bg-purple-700 text-white py-4 rounded-xl text-xl font-bold mt-4"
                      onClick={handleZhKoImprovementSubmit}
                      disabled={!zhToKoImproved.trim() || zhToKoImprovementLoading}
                    >
                      {zhToKoImprovementLoading ? '개선 분석 중...' : '개선된 번역 제출'}
                    </button>
                    {zhToKoImprovementError && (
                      <div className="text-red-600 text-sm bg-red-50 p-3 rounded mt-2">{zhToKoImprovementError}</div>
                    )}
                  </div>
                )}
                {/* 개선 전후 비교/점수/AI 피드백 */}
                {showZhKoImprovement && zhToKoImprovementResult && (
                  <div className="bg-indigo-50 p-6 rounded-xl border border-indigo-200 mt-6">
                    <h4 className="font-bold text-indigo-800 mb-3">📊 개선 효과 분석</h4>
                    <div className="flex gap-4">
                      <div className="flex-1 text-center">
                        <div className="text-lg font-bold text-gray-700 mb-1">개선 전</div>
                        <div className="text-2xl text-red-600 font-bold">{zhToKoImprovementResult.originalScore}점</div>
                        <div className="text-sm mt-2">{userZhToKo}</div>
                      </div>
                      <div className="flex-1 text-center">
                        <div className="text-lg font-bold text-gray-700 mb-1">개선 후</div>
                        <div className="text-2xl text-green-600 font-bold">{zhToKoImprovementResult.improvedScore}점</div>
                        <div className="text-sm mt-2">{zhToKoImproved}</div>
                      </div>
                    </div>
                    <div className="text-center mt-4 text-xl font-bold">{zhToKoImprovementResult.message}</div>
                    {zhToKoFeedback && (
                      <div className="mt-6 bg-white p-4 rounded-lg border">
                        <h4 className="font-bold text-purple-800 mb-3 flex items-center gap-2">
                          <span>🤖</span>AI 피드백
                        </h4>
                        <div className="space-y-2 text-base">
                          <p><span className="font-bold text-red-600">오류:</span> {zhToKoFeedback.error}</p>
                          <p><span className="font-bold text-blue-600">개선점:</span> {zhToKoFeedback.improvement}</p>
                          <p><span className="font-bold text-green-600">힌트:</span> {zhToKoFeedback.hint}</p>
                        </div>
                      </div>
                    )}
                    <div className="flex gap-4 mt-6">
                      <button
                        className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-xl text-xl font-bold"
                        onClick={nextProblem}
                      >
                        다음 문제
                      </button>
                      <button
                        className="flex-1 bg-purple-600 hover:bg-purple-700 text-white py-4 rounded-xl text-xl font-bold"
                        onClick={() => {
                          // 현재 문제를 완료된 번역 목록에 추가
                          if (current) {
                            const finalKoZhScore = getFinalKoToZhScore();
                            const finalZhKoScore = getFinalZhToKoScore();
                            const finalKoZhText = getFinalKoToZhText();
                            const finalZhKoText = getFinalZhToKoText();
                            
                            const completed: CompletedTranslation = {
                              id: current.id,
                              originalKorean: current.korean,
                              correctChinese: mainAnswer,
                              userKoToZh: finalKoZhText,
                              userZhToKo: finalZhKoText,
                              koToZhScore: finalKoZhScore,
                              zhToKoScore: finalZhKoScore,
                              difficulty: current.difficulty,
                              field: current.field,
                              completedAt: new Date(),
                              timeSpent: 0
                            };
                            setCompletedTranslations(prev => {
                              // 이미 추가된 번역인지 확인 (중복 방지)
                              const exists = prev.some(t => t.id === current.id);
                              if (!exists) {
                                setScore(prevScore => prevScore + finalKoZhScore + finalZhKoScore);
                                if (finalKoZhScore >= 70 && finalZhKoScore >= 70) {
                                  setStreak(prevStreak => prevStreak + 1);
                                } else {
                                  setStreak(0);
                                }
                                return [...prev, completed];
                              }
                              return prev;
                            });
                          }
                          setStep(STEPS.FINAL_RESULT);
                        }}
                      >
                        세션 분석
                      </button>
                    </div>
                  </div>
                )}
                {/* 개선하지 않은 경우 바로 다음 단계 선택 */}
                {!showZhKoImprovement && (
                  <div className="bg-white p-6 rounded-xl border">
                    <div className="text-center mb-4">
                      <h3 className="text-lg font-bold text-gray-700 mb-2">🎉 양방향 번역 완료!</h3>
                      <p className="text-gray-600">다음 문제로 넘어가거나 세션 분석을 확인해보세요.</p>
                    </div>
                    <div className="flex gap-4">
                      <button
                        className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-xl text-xl font-bold"
                        onClick={nextProblem}
                      >
                        다음 문제
                      </button>
                      <button
                        className="flex-1 bg-purple-600 hover:bg-purple-700 text-white py-4 rounded-xl text-xl font-bold"
                        onClick={() => {
                          // 현재 문제를 완료된 번역 목록에 추가
                          if (current) {
                            const finalKoZhScore = getFinalKoToZhScore();
                            const finalZhKoScore = getFinalZhToKoScore();
                            const finalKoZhText = getFinalKoToZhText();
                            const finalZhKoText = getFinalZhToKoText();
                            
                            const completed: CompletedTranslation = {
                              id: current.id,
                              originalKorean: current.korean,
                              correctChinese: mainAnswer,
                              userKoToZh: finalKoZhText,
                              userZhToKo: finalZhKoText,
                              koToZhScore: finalKoZhScore,
                              zhToKoScore: finalZhKoScore,
                              difficulty: current.difficulty,
                              field: current.field,
                              completedAt: new Date(),
                              timeSpent: 0
                            };
                            setCompletedTranslations(prev => {
                              // 이미 추가된 번역인지 확인 (중복 방지)
                              const exists = prev.some(t => t.id === current.id);
                              if (!exists) {
                                setScore(prevScore => prevScore + finalKoZhScore + finalZhKoScore);
                                if (finalKoZhScore >= 70 && finalZhKoScore >= 70) {
                                  setStreak(prevStreak => prevStreak + 1);
                                } else {
                                  setStreak(0);
                                }
                                return [...prev, completed];
                              }
                              return prev;
                            });
                          }
                          setStep(STEPS.FINAL_RESULT);
                        }}
                      >
                        세션 분석
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
            {/* FINAL_RESULT render block: only dashboard/result tabs, no 즉시 개선 입력 등 */}
            {step === STEPS.FINAL_RESULT && current && (
              <div className="space-y-6 animate-fade-in">
                {/* 탭 UI */}
                <div className="flex gap-4 mb-6">
                  <button
                    className={`px-6 py-3 rounded-lg font-bold ${activeTab === 'result' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'}`}
                    onClick={() => setActiveTab('result')}
                  >
                    📊 번역 결과
                  </button>
                  <button
                    className={`px-6 py-3 rounded-lg font-bold ${activeTab === 'dashboard' ? 'bg-purple-600 text-white' : 'bg-gray-200 text-gray-700'}`}
                    onClick={() => setActiveTab('dashboard')}
                  >
                    📈 세션 분석
                  </button>
                </div>
                {/* 번역 결과 탭 */}
                {activeTab === 'result' && (
                  <>
                    <div className="bg-yellow-50 rounded-xl p-6 border-2 border-yellow-300">
                      <h3 className="text-2xl font-bold text-yellow-800 mb-6">🏁 최종 결과: 양방향 번역 완료</h3>
                      
                      {/* 한→중 결과 */}
                      <div className="bg-white p-6 rounded-lg mb-6">
                        <h4 className="text-xl font-bold text-blue-800 mb-4">🇰🇷→🇨🇳 한국어 → 중국어</h4>
                        <div className="grid grid-cols-2 gap-6 text-base">
                          <div>
                            <p className="font-bold text-gray-700 mb-2 text-lg">내 번역:</p>
                            <p className="text-lg leading-relaxed">{getFinalKoToZhText()}</p>
                            {koToZhImproved.trim() && showKoZhImprovement && (
                              <p className="text-sm text-green-600 mt-2">✅ 개선된 번역</p>
                            )}
                          </div>
                          <div>
                            <p className="font-bold text-gray-700 mb-2 text-lg">정답:</p>
                            <p className="text-lg leading-relaxed">{mainAnswer}</p>
                          </div>
                        </div>
                        <div className="text-center mt-4">
                          <span className="text-2xl font-bold text-blue-600">{getFinalKoToZhScore()}점</span>
                          {koToZhImproved.trim() && showKoZhImprovement && (
                            <p className="text-sm text-green-600 mt-2">🚀 개선된 점수</p>
                          )}
                        </div>
                        {koToZhFeedback && (
                          <div className="mt-4 bg-gray-50 p-4 rounded text-base">
                            <p className="mb-1"><span className="font-bold text-red-600">오류:</span> {koToZhFeedback.error}</p>
                            <p className="mb-1"><span className="font-bold text-blue-600">개선점:</span> {koToZhFeedback.improvement}</p>
                            <p><span className="font-bold text-green-600">힌트:</span> {koToZhFeedback.hint}</p>
                          </div>
                        )}
                      </div>

                      {/* 중→한 결과 */}
                      <div className="bg-white p-6 rounded-lg mb-6">
                        <h4 className="text-xl font-bold text-purple-800 mb-4">🇨🇳→🇰🇷 중국어 → 한국어</h4>
                        <div className="grid grid-cols-2 gap-6 text-base">
                          <div>
                            <p className="font-bold text-gray-700 mb-2 text-lg">내 번역:</p>
                            <p className="text-lg leading-relaxed">{getFinalZhToKoText()}</p>
                            {zhToKoImproved.trim() && showZhKoImprovement && (
                              <p className="text-sm text-green-600 mt-2">✅ 개선된 번역</p>
                            )}
                          </div>
                          <div>
                            <p className="font-bold text-gray-700 mb-2 text-lg">정답:</p>
                            <p className="text-lg leading-relaxed">{current.korean}</p>
                          </div>
                        </div>
                        <div className="text-center mt-4">
                          <span className="text-2xl font-bold text-purple-600">{getFinalZhToKoScore()}점</span>
                          {zhToKoImproved.trim() && showZhKoImprovement && (
                            <p className="text-sm text-green-600 mt-2">🚀 개선된 점수</p>
                          )}
                        </div>
                        {zhToKoFeedback && (
                          <div className="mt-4 bg-gray-50 p-4 rounded text-base">
                            <p className="mb-1"><span className="font-bold text-red-600">오류:</span> {zhToKoFeedback.error}</p>
                            <p className="mb-1"><span className="font-bold text-blue-600">개선점:</span> {zhToKoFeedback.improvement}</p>
                            <p><span className="font-bold text-green-600">힌트:</span> {zhToKoFeedback.hint}</p>
                          </div>
                        )}
                      </div>

                      <div className="text-center mt-8">
                        <div className="text-3xl font-bold text-yellow-600 mb-6">
                          총 {getFinalKoToZhScore() + getFinalZhToKoScore()}점 획득!
                          {((koToZhImproved.trim() && showKoZhImprovement) || (zhToKoImproved.trim() && showZhKoImprovement)) && (
                            <p className="text-lg text-green-600 mt-2">🎆 개선된 최종 점수</p>
                          )}
                        </div>
                        <button
                          className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-4 rounded-xl text-xl font-bold"
                          onClick={nextProblem}
                        >
                          다음 문제
                        </button>
                      </div>
                    </div>
                  </>
                )}
                {/* 세션 분석 탭 */}
                {activeTab === 'dashboard' && (
                  <div className="bg-white/80 rounded-2xl p-8 shadow-xl animate-fade-in">
                    <h2 className="text-2xl font-bold text-purple-700 mb-8 text-center">📈 세션 분석</h2>
                    
                    {completedTranslations.length === 0 ? (
                      <div className="text-center py-16">
                        <div className="text-6xl mb-4">📊</div>
                        <h3 className="text-xl font-bold text-gray-600 mb-2">아직 완료된 번역이 없습니다</h3>
                        <p className="text-gray-500">번역을 완료하고 다음 문제로 넘어가면 분석 데이터가 표시됩니다!</p>
                      </div>
                    ) : (
                      <>
                        {/* 요약 카드 */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-10">
                          <div className="bg-gradient-to-br from-purple-400 to-blue-300 rounded-xl p-6 text-center shadow-lg">
                            <div className="text-lg text-white font-bold mb-2">총 점수</div>
                            <div className="text-3xl font-extrabold text-white">{sessionStats.totalScore}</div>
                          </div>
                          <div className="bg-gradient-to-br from-pink-400 to-purple-300 rounded-xl p-6 text-center shadow-lg">
                            <div className="text-lg text-white font-bold mb-2">평균 점수</div>
                            <div className="text-3xl font-extrabold text-white">{Math.round(sessionStats.averageScore)}</div>
                          </div>
                          <div className="bg-gradient-to-br from-green-400 to-blue-400 rounded-xl p-6 text-center shadow-lg">
                            <div className="text-lg text-white font-bold mb-2">완료 문제</div>
                            <div className="text-3xl font-extrabold text-white">{sessionStats.totalProblems}</div>
                          </div>
                          <div className="bg-gradient-to-br from-yellow-400 to-pink-400 rounded-xl p-6 text-center shadow-lg">
                            <div className="text-lg text-white font-bold mb-2">정확도</div>
                            <div className="text-3xl font-extrabold text-white">{Math.round(sessionStats.accuracyRate * 100)}%</div>
                          </div>
                        </div>
                        
                        {/* 최근 번역 이력 */}
                        <div className="mb-10">
                          <div className="font-bold text-gray-700 mb-4 text-lg">📝 최근 번역 이력</div>
                          <div className="space-y-3">
                            {completedTranslations.slice(-3).reverse().map((translation, index) => (
                              <div key={index} className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
                                <div className="flex justify-between items-start mb-2">
                                  <div className="flex-1">
                                    <p className="font-bold text-gray-800 text-sm mb-1">원문: {translation.originalKorean}</p>
                                    <p className="text-sm text-blue-600">한→중: {translation.userKoToZh} ({translation.koToZhScore}점)</p>
                                    <p className="text-sm text-purple-600">중→한: {translation.userZhToKo} ({translation.zhToKoScore}점)</p>
                                  </div>
                                  <div className="text-right">
                                    <span className="text-lg font-bold text-gray-700">{translation.koToZhScore + translation.zhToKoScore}점</span>
                                    <p className="text-xs text-gray-500">{translation.difficulty} / {translation.field}</p>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* 점수 추이 라인 그래프 */}
                        <div className="mb-10">
                          <div className="font-bold text-gray-700 mb-2">📈 점수 추이</div>
                          <ScoreLineChart translations={completedTranslations} />
                        </div>
                        
                        {/* 난이도별 통계 */}
                        <div className="mb-10">
                          <div className="font-bold text-gray-700 mb-4">📊 난이도별 성과</div>
                          <div className="grid grid-cols-3 gap-4">
                            {['상', '중', '하'].map(difficulty => {
                              const stats = getDifficultyStats(sessionStats.difficultyStats, difficulty as '상'|'중'|'하');
                              return (
                                <div key={difficulty} className="bg-white p-4 rounded-lg border text-center">
                                  <div className="text-2xl font-bold text-gray-800 mb-1">{difficulty}</div>
                                  <div className="text-sm text-gray-600">{stats.attempted}회 도전</div>
                                  <div className="text-lg font-bold text-blue-600">{Math.round(stats.average)}점 평균</div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                        
                        {/* 성과 요약 */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                          <div>
                            <div className="font-bold text-gray-700 mb-2">🎯 정확도</div>
                            <AccuracyDonut accuracy={sessionStats.accuracyRate} />
                          </div>
                          <div>
                            <div className="font-bold text-gray-700 mb-2">🏆 성과 요약</div>
                            <div className="space-y-3 text-sm">
                              <div className="bg-green-50 p-3 rounded">
                                <span className="font-bold text-green-700">최고 연속 정답:</span> {sessionStats.bestStreak}회
                              </div>
                              <div className="bg-blue-50 p-3 rounded">
                                <span className="font-bold text-blue-700">총 번역 문제:</span> {sessionStats.totalProblems}개
                              </div>
                              <div className="bg-purple-50 p-3 rounded">
                                <span className="font-bold text-purple-700">평균 점수:</span> {Math.round(sessionStats.averageScore)}점
                              </div>
                            </div>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

function ScoreLineChart({ translations }: { translations: any[] }) {
  if (!translations.length) return <div className="text-gray-400 text-center py-8">아직 데이터가 없습니다.</div>;
  const width = 400, height = 100, pad = 30;
  const points = translations.map((t, i) => [
    pad + ((width - 2 * pad) * i) / (translations.length - 1 || 1),
    height - pad - ((height - 2 * pad) * ((t.koToZhScore + t.zhToKoScore) / 2)) / 100
  ]);
  const path = points.map(([x, y], i) => (i === 0 ? `M${x},${y}` : `L${x},${y}`)).join(' ');
  return (
    <svg width={width} height={height} className="w-full max-w-xl">
      <rect x={0} y={0} width={width} height={height} rx={16} fill="#f3f4f6" />
      <polyline fill="none" stroke="#7c3aed" strokeWidth={3} points={points.map(([x, y]) => `${x},${y}`).join(' ')} />
      <path d={path} fill="none" stroke="#6366f1" strokeWidth={2} />
      {points.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={4} fill="#a5b4fc" />
      ))}
      <text x={pad} y={height - 5} fontSize={12} fill="#888">1</text>
      <text x={width - pad} y={height - 5} fontSize={12} fill="#888">{translations.length}</text>
      <text x={pad} y={pad - 10} fontSize={12} fill="#888">100</text>
      <text x={pad} y={height - pad + 15} fontSize={12} fill="#888">0</text>
    </svg>
  );
}

function DifficultyBarChart({ stats }: { stats: Record<'상'|'중'|'하', { attempted: number; average: number }> }) {
  const levels = ['상', '중', '하'] as const;
  const colors: Record<'상'|'중'|'하', string> = { '상': '#f472b6', '중': '#818cf8', '하': '#34d399' };
  return (
    <div className="space-y-3">
      {levels.map(lv => (
        <div key={lv} className="flex items-center gap-3">
          <span className="w-10 text-sm font-bold text-gray-700">{lv}</span>
          <div className="flex-1 bg-gray-100 rounded h-6 relative">
            <div className="absolute left-0 top-0 h-6 rounded bg-opacity-80" style={{ width: `${stats[lv as '상'|'중'|'하'].attempted * 10}px`, background: colors[lv as '상'|'중'|'하'], minWidth: 8, transition: 'width 0.5s' }} />
            <div className="absolute left-0 top-0 h-6 rounded bg-opacity-40" style={{ width: `${stats[lv as '상'|'중'|'하'].average}px`, background: colors[lv as '상'|'중'|'하'], minWidth: 8, opacity: 0.5, transition: 'width 0.5s' }} />
          </div>
          <span className="w-16 text-xs text-gray-500">{stats[lv as '상'|'중'|'하'].attempted}회</span>
          <span className="w-12 text-xs text-gray-700 font-bold">{Math.round(stats[lv as '상'|'중'|'하'].average)}점</span>
        </div>
      ))}
    </div>
  );
}

function AccuracyDonut({ accuracy }: { accuracy: number }) {
  const percent = Math.round(accuracy * 100);
  const r = 36, c = 2 * Math.PI * r;
  return (
    <svg width={100} height={100} className="mx-auto block">
      <circle cx={50} cy={50} r={r} fill="#f3f4f6" />
      <circle cx={50} cy={50} r={r} fill="none" stroke="#a5b4fc" strokeWidth={12} strokeDasharray={c} strokeDashoffset={c * (1 - accuracy)} strokeLinecap="round" />
      <text x={50} y={56} textAnchor="middle" fontSize={26} fontWeight="bold" fill="#7c3aed">{percent}%</text>
    </svg>
  );
}

export default ReverseTranslation; 