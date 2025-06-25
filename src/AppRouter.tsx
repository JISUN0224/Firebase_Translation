import { Routes, Route } from 'react-router-dom';
import MainDashboard from './components/MainDashboard/MainDashboard';
import MainFeedback from './components/Translation/MainFeedback';
import FeedbackPage from './components/Translation/FeedbackPage';
import App from './App';
import SimilarityAnalysis from './components/Translation/SimilarityAnalysis';
import GradingPage from './components/Translation/GradingPage';

function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<MainDashboard />} />
      <Route path="/translation/feedback" element={<MainFeedback />} />
      <Route path="/translation/feedback/result" element={<FeedbackPage />} />
      <Route path="/translation/similarity" element={<SimilarityAnalysis />} />
      <Route path="/translation/grading" element={<GradingPage />} />
      {/* 추후: /translation/grading 등 추가 */}
    </Routes>
  );
}

export default AppRouter; 