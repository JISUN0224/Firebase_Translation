import React from 'react';
import { useNavigate } from 'react-router-dom';

const AIAnalysis: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">🤖 AI 학습 분석</h1>
        <p className="text-gray-600 mb-4">AI 분석 기능이 준비 중입니다.</p>
        <button
          onClick={() => navigate('/')}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          홈으로 돌아가기
        </button>
      </div>
    </div>
  );
};

export default AIAnalysis; 