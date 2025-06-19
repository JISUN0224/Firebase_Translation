import { Routes, Route } from 'react-router-dom';
import App from './App';
import FeedbackPage from './FeedbackPage';

function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<App />} />
      <Route path="/feedback" element={<FeedbackPage />} />
    </Routes>
  );
}

export default AppRouter; 