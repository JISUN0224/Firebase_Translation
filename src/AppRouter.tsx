import React from 'react';
import { Routes, Route } from 'react-router-dom';
import MainDashboard from './components/MainDashboard/MainDashboard';
import MainFeedback from './components/Translation/MainFeedback';
import FeedbackPage from './components/Translation/FeedbackPage';
import SimilarityAnalysis from './components/Translation/SimilarityAnalysis';
import GradingPage from './components/Translation/GradingPage';
import TimedTranslationGame from './components/Trans_Training/TimedTranslationGame';
import ContextVocabQuizGame from './components/Trans_Training/ContextVocabQuizGame';
import ReverseTranslation from './components/Trans_Training/reverseTranslation';
import SubtitleIntro from './components/Trans_Training/SubtitleIntro';
import SubtitleTranslation from './components/Trans_Training/SubtitleTranslation';
import StudyStats from './components/Tran_Analysis/StudyStats';
import AIAnalysis from './components/Tran_Analysis/AIAnalysis';
import InterStats from './components/Tran_Analysis/InterStats';
import StepByStepInterpretation from './components/Interpretation/StepByStepInterpretation';
import ShadowingPractice from './components/Interpretation/ShadowingPractice';
import MemoryTraining from './components/Inter_Training/MemoryTraining';
import VisualInterpretation from './components/Inter_Training/VisualInterpretation';
import PPTInterpretation from './components/Inter_Training/PPTInterpretation';

const AppRouter = () => (
  <Routes>
    <Route path="/" element={<MainDashboard />} />
    
    {/* 번역 관련 라우트 */}
    <Route path="/translation/feedback" element={<MainFeedback />} />
    <Route path="/translation/feedback/result" element={<FeedbackPage />} />
    <Route path="/translation/similarity" element={<SimilarityAnalysis />} />
    <Route path="/translation/grading" element={<GradingPage />} />
    <Route path="/translation/visual-interpretation" element={<VisualInterpretation />} />
    <Route path="/translation/ppt-interpretation" element={<PPTInterpretation />} />

    {/* 연습 관련 라우트 */}
    <Route path="/practice/vocabquiz" element={<ContextVocabQuizGame />} />
    <Route path="/practice/timed" element={<TimedTranslationGame />} />
    <Route path="/practice/reverse-translation" element={<ReverseTranslation />} />
    <Route path="/subtitle-intro" element={<SubtitleIntro />} />
    <Route path="/subtitle-translation" element={<SubtitleTranslation />} />

    {/* 분석 관련 라우트 */}
    <Route path="/analysis/stats" element={<StudyStats />} />
    <Route path="/analysis/ai" element={<AIAnalysis />} />
            <Route path="/analysis/translation-stats" element={<InterStats />} />

    {/* 통역 관련 라우트 */}
    <Route path="/interpreting/feedback" element={<StepByStepInterpretation />} />
    <Route path="/interpreting/memory" element={<MemoryTraining />} />
    <Route path="/interpreting/shadowing" element={<ShadowingPractice />} />
  </Routes>
);

export default AppRouter; 