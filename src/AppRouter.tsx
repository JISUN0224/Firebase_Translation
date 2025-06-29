import React from 'react';
import { Routes, Route } from 'react-router-dom';
import MainDashboard from './components/MainDashboard/MainDashboard';
import MainFeedback from './components/Translation/MainFeedback';
import FeedbackPage from './components/Translation/FeedbackPage';
import App from './App';
import SimilarityAnalysis from './components/Translation/SimilarityAnalysis';
import GradingPage from './components/Translation/GradingPage';
import TimedTranslationGame from './components/Trans_Training/TimedTranslationGame';
import ContextVocabQuizGame from './components/Trans_Training/ContextVocabQuizGame';
import ReverseTranslation from './components/Trans_Training/reverseTranslation';
import SubtitleIntro from './components/Trans_Training/SubtitleIntro';
import SubtitleTranslation from './components/Trans_Training/SubtitleTranslation';
import StudyStats from './components/Analysis/StudyStats';
import AIAnalysis from './components/Analysis/AIAnalysis';

const AppRouter = () => (
  <Routes>
    <Route path="/" element={<MainDashboard />} />
    <Route path="/translation/feedback" element={<MainFeedback />} />
    <Route path="/translation/feedback/result" element={<FeedbackPage />} />
    <Route path="/translation/grading" element={<GradingPage />} />
    <Route path="/translation/similarity" element={<SimilarityAnalysis />} />
    <Route path="/practice/vocabquiz" element={<ContextVocabQuizGame />} />
    <Route path="/practice/timed" element={<TimedTranslationGame />} />
    <Route path="/practice/reverse-translation" element={<ReverseTranslation />} />
    <Route path="/subtitle-intro" element={<SubtitleIntro />} />
    <Route path="/subtitle-translation" element={<SubtitleTranslation />} />
    <Route path="/analysis/stats" element={<StudyStats />} />
    <Route path="/analysis/ai" element={<AIAnalysis />} />
    {/* 기타 라우트 추가 */}
  </Routes>
);

export default AppRouter; 