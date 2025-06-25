import React from 'react';
import { useNavigate } from 'react-router-dom';

interface MenuLink {
  label: string;
  to: string;
  disabled?: boolean;
}

const menuCards = [
  {
    icon: '📝',
    title: 'AI 비교 분석',
    description: 'AI와 함께 번역 실력을 키워보세요',
    links: [
      { label: 'AI번역 피드백', to: '/translation/feedback' },
      { label: 'AI번역 일치도 분석', to: '/translation/similarity' },
      { label: 'AI번역 채점하기', to: '/translation/grading' },
    ] as MenuLink[],
    border: 'border-blue-400',
    hover: 'hover:border-blue-500',
  },
  {
    icon: '💪',
    title: '실전 연습',
    description: '다양한 방식으로 번역 실력을 향상시켜보세요',
    links: [
      { label: '시간제한 번역', to: '/practice/timed', disabled: true },
      { label: '어휘카드 학습', to: '/practice/vocab', disabled: true },
    ] as MenuLink[],
    border: 'border-yellow-400',
    hover: 'hover:border-yellow-500',
  },
  {
    icon: '📈',
    title: '학습 분석',
    description: '나의 번역 학습 데이터를 분석해보세요',
    links: [
      { label: '학습 통계', to: '/analysis/stats', disabled: true },
      { label: 'AI 분석', to: '/analysis/ai', disabled: true },
    ] as MenuLink[],
    border: 'border-green-400',
    hover: 'hover:border-green-500',
  },
];

const MainDashboard: React.FC = () => {
  const navigate = useNavigate();
  return (
    <div className="w-full max-w-5xl mx-auto py-8 px-2">
      <div className="text-center mb-6">
        <div className="text-3xl md:text-4xl font-bold text-blue-800 flex items-center justify-center gap-2 mb-2">
          <span role="img" aria-label="globe">🌐</span> 번역 학습 플랫폼
        </div>
        <div className="text-lg text-gray-600 flex items-center justify-center gap-2 mb-2">
          <span role="img" aria-label="wave">👋</span> 안녕하세요! 어떤 학습을 시작해보실까요?
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-10">
        {menuCards.map((card) => (
          <div
            key={card.title}
            className={`rounded-2xl bg-white shadow-lg p-7 border-2 ${card.border} ${card.hover} transition-all duration-200 cursor-pointer group
              hover:shadow-2xl hover:scale-105 hover:bg-blue-50
            `}
            tabIndex={0}
            onClick={() => card.links[0] && !card.links[0].disabled && navigate(card.links[0].to)}
            onKeyDown={e => { if (e.key === 'Enter') card.links[0] && !card.links[0].disabled && navigate(card.links[0].to); }}
          >
            <div className="text-4xl mb-2">{card.icon}</div>
            <div className="font-bold text-xl mb-1">{card.title}</div>
            <div className="text-gray-600 mb-3 text-sm">{card.description}</div>
            <ul className="space-y-1 mt-2">
              {card.links.map(link => (
                <li key={link.label}>
                  <button
                    className={`flex items-center gap-2 text-blue-700 hover:underline text-base ${link.disabled ? 'text-gray-400 cursor-not-allowed' : ''}`}
                    onClick={e => { e.stopPropagation(); if (!link.disabled) navigate(link.to); }}
                    disabled={!!link.disabled}
                  >
                    <span className="text-xs">▶</span> {link.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="bg-blue-50 rounded-xl p-6 mt-8 max-w-3xl mx-auto">
        <div className="font-bold text-blue-700 mb-2 flex items-center gap-2">
          <span role="img" aria-label="bulb">💡</span> 추천 학습 경로
        </div>
        <ul className="text-gray-700 text-base ml-2 space-y-1">
          <li>• <b>초급자</b>: 어휘카드 → 번역 대결 → 일치도</li>
          <li>• <b>중급자</b>: 번역 대결 → 번역평가 → 시간제한</li>
          <li>• <b>고급자</b>: 시간제한 → AI분석 → 학습통계</li>
        </ul>
      </div>
    </div>
  );
};

export default MainDashboard; 