import React, { useState, useEffect } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';

interface TranslationData {
  id: string;
  분야: string;
  한국어: string;
  중국어: string;
  ChatGPT_번역?: string;
  Gemini_번역?: string;
  주요어휘?: Array<{
    chinese: string;
    pinyin: string;
    korean: string;
    importance: string;
  }>;
  난이도?: string;
}

interface ExerciseSettings {
  mode: 'ko-to-zh' | 'zh-to-ko' | 'bidirectional';
  difficulty: 'all' | '상' | '중' | '하';
  category: 'all' | string;
  exerciseCount: 5 | 10 | 15 | 20;
}

interface SelfEvaluation {
  confidence: number; // 1-5
  expectedScore: number; // 0-100
  difficulty: number; // 1-5
}

const BidirectionalTranslation: React.FC = () => {
  const [gameStatus, setGameStatus] = useState<'settings' | 'translating' | 'self-eval' | 'ai-compare' | 'answer-reveal'>('settings');
  const [settings, setSettings] = useState<ExerciseSettings>({
    mode: 'ko-to-zh',
    difficulty: 'all',
    category: 'all',
    exerciseCount: 5
  });
  
  const [problems, setProblems] = useState<TranslationData[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userTranslation, setUserTranslation] = useState('');
  const [selfEval, setSelfEval] = useState<SelfEvaluation>({
    confidence: 3,
    expectedScore: 70,
    difficulty: 3
  });

  const currentProblem = problems[currentIndex];
  
  // 원문과 번역 방향에 따른 텍스트
  const sourceText = settings.mode === 'ko-to-zh' ? currentProblem?.한국어 : currentProblem?.중국어;
  const targetText = settings.mode === 'ko-to-zh' ? currentProblem?.중국어 : currentProblem?.한국어;
  const aiTranslations = settings.mode === 'ko-to-zh' 
    ? [currentProblem?.ChatGPT_번역, currentProblem?.Gemini_번역]
    : ['역방향 AI 번역 없음']; // 중→한 AI 번역이 없는 경우

  // Firestore 데이터 로딩
  useEffect(() => {
    const fetchData = async () => {
      try {
        const querySnapshot = await getDocs(collection(db, 'translationContents'));
        const loadedData: TranslationData[] = [];
        querySnapshot.forEach((doc) => {
          loadedData.push({ id: doc.id, ...doc.data() } as TranslationData);
        });
        setProblems(loadedData);
      } catch (error) {
        console.error('데이터 로딩 실패:', error);
      }
    };
    fetchData();
  }, []);

  // 설정 화면 렌더링
  const renderSettings = () => (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-3xl font-bold text-center mb-8">🔄 양방향 번역 훈련</h1>
      
      {/* 모드 선택 */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold mb-4">번역 방향 선택</h3>
        <div className="grid grid-cols-3 gap-4">
          {[
            { mode: 'ko-to-zh', label: '한국어 → 중국어', emoji: '🇰🇷➡️🇨🇳' },
            { mode: 'zh-to-ko', label: '중국어 → 한국어', emoji: '🇨🇳➡️🇰🇷' },
            { mode: 'bidirectional', label: '양방향 도전', emoji: '🔄' }
          ].map(({ mode, label, emoji }) => (
            <button
              key={mode}
              className={`p-4 rounded-lg border-2 transition-all ${
                settings.mode === mode
                  ? 'bg-indigo-500 text-white border-indigo-500'
                  : 'bg-white border-gray-300 hover:border-indigo-300'
              }`}
              onClick={() => setSettings(prev => ({ ...prev, mode: mode as any }))}
            >
              <div className="text-2xl mb-2">{emoji}</div>
              <div className="font-semibold">{label}</div>
            </button>
          ))}
        </div>
      </div>

      {/* 시작 버튼 */}
      <div className="text-center">
        <button
          className="bg-gradient-to-r from-indigo-500 to-purple-600 text-white px-8 py-4 rounded-xl text-xl font-bold hover:from-indigo-600 hover:to-purple-700 transition-all"
          onClick={() => setGameStatus('translating')}
        >
          🚀 번역 훈련 시작
        </button>
      </div>
    </div>
  );

  // 번역 입력 화면
  const renderTranslation = () => (
    <div className="max-w-4xl mx-auto p-6">
      <div className="bg-white rounded-xl shadow-lg p-8">
        <h2 className="text-2xl font-bold mb-6">
          {settings.mode === 'ko-to-zh' ? '🇰🇷 → 🇨🇳' : '🇨🇳 → 🇰🇷'} 번역하기
        </h2>
        
        {/* 원문 */}
        <div className="bg-blue-50 border-l-4 border-blue-500 p-6 mb-6">
          <h3 className="font-semibold text-gray-700 mb-2">원문</h3>
          <div className="text-xl font-bold text-blue-900">{sourceText}</div>
        </div>

        {/* 번역 입력 */}
        <div className="mb-6">
          <h3 className="font-semibold text-gray-700 mb-2">내 번역</h3>
          <textarea
            className="w-full p-4 border-2 border-gray-300 rounded-lg focus:border-indigo-500 focus:outline-none"
            rows={4}
            value={userTranslation}
            onChange={(e) => setUserTranslation(e.target.value)}
            placeholder="여기에 번역을 입력하세요..."
          />
        </div>

        <button
          className="w-full bg-indigo-500 text-white py-3 rounded-lg font-semibold hover:bg-indigo-600 transition-all"
          onClick={() => setGameStatus('self-eval')}
          disabled={!userTranslation.trim()}
        >
          다음: 자기평가 →
        </button>
      </div>
    </div>
  );

  // 자기평가 화면
  const renderSelfEvaluation = () => (
    <div className="max-w-4xl mx-auto p-6">
      <div className="bg-white rounded-xl shadow-lg p-8">
        <h2 className="text-2xl font-bold mb-6">🤔 내 번역 자기평가</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div>
            <label className="block font-semibold mb-2">번역 신뢰도</label>
            <div className="flex gap-1">
              {[1,2,3,4,5].map(star => (
                <button
                  key={star}
                  className={`text-2xl ${star <= selfEval.confidence ? 'text-yellow-400' : 'text-gray-300'}`}
                  onClick={() => setSelfEval(prev => ({ ...prev, confidence: star }))}
                >
                  ⭐
                </button>
              ))}
            </div>
          </div>
          
          <div>
            <label className="block font-semibold mb-2">예상 점수</label>
            <input
              type="range"
              min="0"
              max="100"
              value={selfEval.expectedScore}
              onChange={(e) => setSelfEval(prev => ({ ...prev, expectedScore: parseInt(e.target.value) }))}
              className="w-full"
            />
            <div className="text-center font-bold text-lg">{selfEval.expectedScore}점</div>
          </div>
          
          <div>
            <label className="block font-semibold mb-2">체감 난이도</label>
            <div className="flex gap-1">
              {[1,2,3,4,5].map(level => (
                <button
                  key={level}
                  className={`text-2xl ${level <= selfEval.difficulty ? 'text-red-400' : 'text-gray-300'}`}
                  onClick={() => setSelfEval(prev => ({ ...prev, difficulty: level }))}
                >
                  🔥
                </button>
              ))}
            </div>
          </div>
        </div>

        <button
          className="w-full bg-green-500 text-white py-3 rounded-lg font-semibold hover:bg-green-600 transition-all"
          onClick={() => setGameStatus('ai-compare')}
        >
          다음: AI 번역과 비교 →
        </button>
      </div>
    </div>
  );

  // AI 비교 화면
  const renderAiComparison = () => (
    <div className="max-w-6xl mx-auto p-6">
      <div className="bg-white rounded-xl shadow-lg p-8">
        <h2 className="text-2xl font-bold mb-6">🤖 AI 번역과 비교</h2>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* 내 번역 */}
          <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4">
            <h3 className="font-bold text-blue-800 mb-2">🙋‍♂️ 내 번역</h3>
            <div className="text-gray-800">{userTranslation}</div>
            <div className="mt-2 text-sm text-blue-600">
              신뢰도: {'⭐'.repeat(selfEval.confidence)} | 예상: {selfEval.expectedScore}점
            </div>
          </div>

          {/* AI 번역들 */}
          {settings.mode === 'ko-to-zh' && (
            <>
              <div className="bg-green-50 border-2 border-green-200 rounded-lg p-4">
                <h3 className="font-bold text-green-800 mb-2">🤖 ChatGPT</h3>
                <div className="text-gray-800">{currentProblem?.ChatGPT_번역 || '번역 없음'}</div>
              </div>
              
              <div className="bg-purple-50 border-2 border-purple-200 rounded-lg p-4">
                <h3 className="font-bold text-purple-800 mb-2">🧠 Gemini</h3>
                <div className="text-gray-800">{currentProblem?.Gemini_번역 || '번역 없음'}</div>
              </div>
            </>
          )}
        </div>

        <button
          className="w-full bg-yellow-500 text-white py-3 rounded-lg font-semibold hover:bg-yellow-600 transition-all"
          onClick={() => setGameStatus('answer-reveal')}
        >
          다음: 정답 공개 →
        </button>
      </div>
    </div>
  );

  // 정답 공개 화면
  const renderAnswerReveal = () => (
    <div className="max-w-6xl mx-auto p-6">
      <div className="bg-white rounded-xl shadow-lg p-8">
        <h2 className="text-2xl font-bold mb-6">✅ 정답 공개</h2>
        
        <div className="bg-yellow-50 border-2 border-yellow-400 rounded-lg p-6 mb-6">
          <h3 className="font-bold text-yellow-800 mb-3">🎯 정답</h3>
          <div className="text-xl font-bold text-gray-800">{targetText}</div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <div>
            <h3 className="font-bold mb-3">📊 번역 비교</h3>
            <div className="space-y-3">
              <div className="p-3 bg-blue-50 rounded border-l-4 border-blue-400">
                <div className="font-semibold text-blue-800">내 번역</div>
                <div>{userTranslation}</div>
              </div>
              <div className="p-3 bg-yellow-50 rounded border-l-4 border-yellow-400">
                <div className="font-semibold text-yellow-800">정답</div>
                <div>{targetText}</div>
              </div>
            </div>
          </div>
          
          <div>
            <h3 className="font-bold mb-3">🎓 학습 포인트</h3>
            {currentProblem?.주요어휘 && (
              <div className="space-y-2">
                {currentProblem.주요어휘.slice(0, 3).map((vocab, idx) => (
                  <div key={idx} className="p-2 bg-gray-50 rounded">
                    <div className="font-semibold">{vocab.chinese} ({vocab.pinyin})</div>
                    <div className="text-sm text-gray-600">{vocab.korean}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-4">
          <button
            className="flex-1 bg-indigo-500 text-white py-3 rounded-lg font-semibold hover:bg-indigo-600 transition-all"
            onClick={() => {
              setCurrentIndex(prev => prev + 1);
              setUserTranslation('');
              setGameStatus('translating');
            }}
            disabled={currentIndex >= problems.length - 1}
          >
            📝 다음 문제
          </button>
          
          {settings.mode === 'bidirectional' && (
            <button
              className="flex-1 bg-purple-500 text-white py-3 rounded-lg font-semibold hover:bg-purple-600 transition-all"
              onClick={() => {
                setSettings(prev => ({ 
                  ...prev, 
                  mode: prev.mode === 'ko-to-zh' ? 'zh-to-ko' : 'ko-to-zh' 
                }));
                setUserTranslation('');
                setGameStatus('translating');
              }}
            >
              🔄 역방향 도전
            </button>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 py-10">
      {gameStatus === 'settings' && renderSettings()}
      {gameStatus === 'translating' && renderTranslation()}
      {gameStatus === 'self-eval' && renderSelfEvaluation()}
      {gameStatus === 'ai-compare' && renderAiComparison()}
      {gameStatus === 'answer-reveal' && renderAnswerReveal()}
    </div>
  );
};

export default BidirectionalTranslation; 