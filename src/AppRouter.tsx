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
import SubtitleTranslation from './components/Trans_Training/SubtitleTranslation';

function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<MainDashboard />} />
      <Route path="/translation/feedback" element={<MainFeedback />} />
      <Route path="/translation/feedback/result" element={<FeedbackPage />} />
      <Route path="/translation/similarity" element={<SimilarityAnalysis />} />
      <Route path="/translation/grading" element={<GradingPage />} />
      <Route path="/practice/timed" element={<TimedTranslationGame />} />
      <Route path="/practice/vocabquiz" element={<ContextVocabQuizGame />} />
      <Route path="/practice/reverse-translation" element={<ReverseTranslation />} />
      <Route path="/practice/subtitle-translation" element={<SubtitleTranslation />} />
      {/* 추후: /translation/grading 등 추가 */}
    </Routes>
  );
}

export default AppRouter; 