import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, googleProvider } from '../../firebase';
import { signInWithPopup, signOut } from 'firebase/auth';

interface MenuLink {
  label: string;
  to?: string;
  disabled?: boolean;
  isToggle?: boolean;
  subMenu?: MenuLink[];
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
      { 
        label: '게임으로 학습하기', 
        isToggle: true,
        subMenu: [
          { label: '문맥 어휘 퀴즈', to: '/practice/vocabquiz' },
          { label: '시간제한 번역 게임', to: '/practice/timed' },
        ]
      },
      { label: '자막 번역 연습', to: '/subtitle-intro' },
      { label: '역번역 연습', to: '/practice/reverse-translation' },
    ] as MenuLink[],
    border: 'border-yellow-400',
    hover: 'hover:border-yellow-500',
  },
  {
    icon: '📈',
    title: '학습 분석',
    description: '나의 번역 학습 데이터를 분석해보세요',
    links: [
      { label: '학습 통계', to: '/analysis/stats' },
      { label: 'AI 분석', to: '/analysis/ai' },
    ] as MenuLink[],
    border: 'border-green-400',
    hover: 'hover:border-green-500',
  },
];

const interpretingCards = [
  {
    icon: '📝',
    title: 'AI 비교 분석',
    description: 'AI와 함께 통역 실력을 키워보세요',
    links: [
      { label: '단계별 통역 연습', to: '/interpreting/feedback' },
      { label: '쉐도잉 평가', to: '/interpreting/shadowuing2' },
    ] as MenuLink[],
    border: 'border-purple-400',
    hover: 'hover:border-purple-500',
  },
  {
    icon: '💪',
    title: '실전 연습',
    description: '다양한 방식으로 통역 실력을 향상시켜보세요',
    links: [
      { label: '메모리 트레이닝', to: '/interpreting/memory' },
      { 
        label: '시각자료 통역연습', 
        isToggle: true,
        subMenu: [
          { label: '영상 통역', to: '/translation/visual-interpretation' },
          { label: 'PPT 통역', to: '/translation/ppt-interpretation' },
        ]
      },
    ] as MenuLink[],
    border: 'border-orange-400',
    hover: 'hover:border-orange-500',
  },
  {
    icon: '📈',
    title: '학습 분석',
    description: '나의 통역 학습 데이터를 분석해보세요',
    links: [
      { label: '학습 통계', to: '/analysis/translation-stats' },
    ] as MenuLink[],
    border: 'border-teal-400',
    hover: 'hover:border-teal-500',
  },
];

function GoogleLoginButton() {
  const [user, setUser] = React.useState(() => auth.currentUser);
  React.useEffect(() => {
    const unsub = auth.onAuthStateChanged(u => setUser(u));
    return () => unsub();
  }, []);
  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      alert('로그인 실패');
    }
  };
  const handleLogout = async () => {
    await signOut(auth);
  };
  return user ? (
    <div className="absolute right-12 top-1/2 -translate-y-1/2 flex items-center gap-3">
      <img src={user.photoURL || ''} alt="프로필" className="w-8 h-8 rounded-full border-2 border-white" />
      <span className="text-white font-semibold text-sm">{user.displayName || user.email?.split('@')[0]}</span>
      <button 
        onClick={handleLogout} 
        className="px-3 py-1 bg-white/20 text-white rounded-lg hover:bg-white/30 transition-colors text-sm"
      >
        로그아웃
      </button>
    </div>
  ) : (
    <div className="absolute right-12 top-1/2 -translate-y-1/2">
      <button
        onClick={handleLogin}
        className="flex flex-col items-center gap-1 bg-white/20 px-4 py-3 rounded-lg hover:bg-white/30 transition-colors"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
        <span className="text-white text-sm font-medium">Login</span>
      </button>
    </div>
  );
}

const MainDashboard = () => {
  const navigate = useNavigate();
  const [showGameMenu, setShowGameMenu] = useState(false);
  const [showInterpretingGameMenu, setShowInterpretingGameMenu] = useState(false);
  const [toggledMenus, setToggledMenus] = useState<Record<string, boolean>>({});

  const handleMenuClick = (link: MenuLink, e: React.MouseEvent) => {
    e.stopPropagation();
    if (link.isToggle) {
      setToggledMenus(prev => ({
        ...prev,
        [link.label]: !prev[link.label]
      }));
    } else if (link.to && !link.disabled) {
      navigate(link.to);
    }
  };

  const handleCardClick = (card: any) => {
    const firstNonToggleLink = card.links.find((link: MenuLink) => !link.isToggle && link.to && !link.disabled);
    if (firstNonToggleLink) {
      navigate(firstNonToggleLink.to);
    }
  };
  
  return (
    <div className="min-h-screen bg-gray-50 py-8">
      {/* 상단 헤더 섹션 */}
      <div className="w-full bg-blue-400/80 mb-8 relative">
        <div className="max-w-5xl mx-auto px-4 py-6">
          <div className="flex justify-center items-center">
            <h1 className="text-3xl md:text-4xl font-bold text-white">
              번역 학습 플랫폼
            </h1>
          </div>
        </div>
        
        {/* 로그인 버튼 */}
        <GoogleLoginButton />
      </div>

      <div className="max-w-5xl mx-auto px-4">
        {/* 번역 섹션 */}
        <div className="mb-12">
          <h2 className="text-2xl font-bold text-gray-800 mb-6 pl-2 border-l-4 border-blue-500">
            번역
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-6">
            {menuCards.map((card) => (
              <div
                key={card.title}
                className={`rounded-xl bg-white shadow-lg p-2 sm:p-3 lg:p-4 border-2 ${card.border} ${card.hover} transition-all duration-200 cursor-pointer group
                  hover:shadow-2xl hover:scale-105 hover:bg-blue-50 w-full
                `}
                tabIndex={0}
                onClick={() => handleCardClick(card)}
                onKeyDown={e => { if (e.key === 'Enter') handleCardClick(card); }}
              >
                <div className="text-2xl mb-1">{card.icon}</div>
                <div className="font-bold text-base mb-0.5">{card.title}</div>
                <div className="text-gray-600 mb-1 text-xs">{card.description}</div>
                <ul className="space-y-2 mt-1">
                  {card.links.map(link => (
                    <li key={link.label}>
                      <button
                        className={`flex items-center gap-2 text-blue-700 hover:underline text-sm ${link.disabled ? 'text-gray-400 cursor-not-allowed' : ''}`}
                        onClick={e => handleMenuClick(link, e)}
                        disabled={!!link.disabled}
                      >
                        <span className="text-xs">
                          {link.isToggle ? (toggledMenus[link.label] ? '▼' : '▶') : '▶'}
                        </span> 
                        {link.label}
                      </button>
                      {link.isToggle && link.subMenu && toggledMenus[link.label] && (
                        <ul className="ml-3 mt-2 space-y-2">
                          {link.subMenu.map(subLink => (
                            <li key={subLink.label}>
                              <button
                                className="flex items-center gap-2 text-blue-600 hover:underline text-xs"
                                onClick={e => handleMenuClick(subLink, e)}
                              >
                                <span className="text-xs">•</span> {subLink.label}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* 통역 섹션 */}
        <div className="mb-12">
          <h2 className="text-2xl font-bold text-gray-800 mb-6 pl-2 border-l-4 border-blue-500">
            통역
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {interpretingCards.map((card) => (
              <div
                key={card.title}
                className={`rounded-xl bg-white shadow-lg p-4 border-2 ${card.border} ${card.hover} transition-all duration-200 cursor-pointer group
                  hover:shadow-2xl hover:scale-105 hover:bg-purple-50 max-w-xs mx-auto w-full
                `}
                tabIndex={0}
                onClick={() => handleCardClick(card)}
                onKeyDown={e => { if (e.key === 'Enter') handleCardClick(card); }}
              >
                <div className="text-2xl mb-1">{card.icon}</div>
                <div className="font-bold text-base mb-0.5">{card.title}</div>
                <div className="text-gray-600 mb-1 text-xs">{card.description}</div>
                <ul className="space-y-2 mt-1">
                  {card.links.map(link => (
                    <li key={link.label}>
                      <button
                        className={`flex items-center gap-2 text-blue-700 hover:underline text-sm ${link.disabled ? 'text-gray-400 cursor-not-allowed' : ''}`}
                        onClick={e => handleMenuClick(link, e)}
                        disabled={!!link.disabled}
                      >
                        <span className="text-xs">
                          {link.isToggle ? (toggledMenus[link.label] ? '▼' : '▶') : '▶'}
                        </span> 
                        {link.label}
                      </button>
                      {link.isToggle && link.subMenu && toggledMenus[link.label] && (
                        <ul className="ml-3 mt-2 space-y-2">
                          {link.subMenu.map(subLink => (
                            <li key={subLink.label}>
                              <button
                                className="flex items-center gap-2 text-blue-600 hover:underline text-xs"
                                onClick={e => handleMenuClick(subLink, e)}
                              >
                                <span className="text-xs">•</span> {subLink.label}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* 학습 분석 섹션 - 번역/통역 루트 카드 */}
        <div>
          <h2 className="text-2xl font-bold text-gray-800 mb-6 pl-2 border-l-4 border-blue-500">
            추천 루트
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* 번역 루트 카드 */}
            <div className="rounded-2xl bg-white shadow-lg p-6 border-2 border-blue-300 hover:border-blue-500 transition-all duration-200">
              <h3 className="text-xl font-bold text-blue-700 mb-4">번역 학습 루트</h3>
              <div className="mb-3">
                <span className="inline-block px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-semibold mr-2">초급</span>
                {[
                  { label: '어휘카드', url: '/practice/vocabquiz' },
                  { label: '번역 대결', url: '/practice/timed' },
                  { label: '일치도', url: '/translation/similarity' }
                ].map((item, idx, arr) => (
                  <span key={item.label} className="inline-flex items-center">
                    <span
                      className="font-bold text-blue-700 underline cursor-pointer hover:text-blue-900 transition-colors px-1"
                      onClick={() => navigate(item.url)}
                      onMouseOver={e => (e.currentTarget.style.textDecoration = 'underline')}
                      onMouseOut={e => (e.currentTarget.style.textDecoration = 'underline')}
                      tabIndex={0}
                      style={{ cursor: 'pointer' }}
                    >
                      {item.label}
                    </span>
                    {idx < arr.length - 1 && <span className="mx-1 text-gray-400">→</span>}
                  </span>
                ))}
              </div>
              <div>
                <span className="inline-block px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-semibold mr-2">중급</span>
                {[
                  { label: '번역 대결', url: '/practice/timed' },
                  { label: '번역평가', url: '/translation/grading' },
                  { label: '시간제한', url: '/practice/timed' }
                ].map((item, idx, arr) => (
                  <span key={item.label} className="inline-flex items-center">
                    <span
                      className="font-bold text-blue-700 underline cursor-pointer hover:text-blue-900 transition-colors px-1"
                      onClick={() => navigate(item.url)}
                      onMouseOver={e => (e.currentTarget.style.textDecoration = 'underline')}
                      onMouseOut={e => (e.currentTarget.style.textDecoration = 'underline')}
                      tabIndex={0}
                      style={{ cursor: 'pointer' }}
                    >
                      {item.label}
                    </span>
                    {idx < arr.length - 1 && <span className="mx-1 text-gray-400">→</span>}
                  </span>
                ))}
              </div>
            </div>
            {/* 통역 루트 카드 */}
            <div className="rounded-2xl bg-white shadow-lg p-6 border-2 border-purple-300 hover:border-purple-500 transition-all duration-200">
              <h3 className="text-xl font-bold text-purple-700 mb-4">통역 학습 루트</h3>
              <div className="mb-3">
                <span className="inline-block px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-sm font-semibold mr-2">초급</span>
                {[
                  { label: '메모리 트레이닝', url: '/interpreting/memory' },
                  { label: '쉐도잉', url: '/interpreting/shadowing' },
                  { label: '단계별 통역', url: '/interpreting/feedback' }
                ].map((item, idx, arr) => (
                  <span key={item.label} className="inline-flex items-center">
                    <span
                      className="font-bold text-purple-700 underline cursor-pointer hover:text-purple-900 transition-colors px-1"
                      onClick={() => navigate(item.url)}
                      onMouseOver={e => (e.currentTarget.style.textDecoration = 'underline')}
                      onMouseOut={e => (e.currentTarget.style.textDecoration = 'underline')}
                      tabIndex={0}
                      style={{ cursor: 'pointer' }}
                    >
                      {item.label}
                    </span>
                    {idx < arr.length - 1 && <span className="mx-1 text-gray-400">→</span>}
                  </span>
                ))}
              </div>
              <div>
                <span className="inline-block px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-sm font-semibold mr-2">중급</span>
                {[
                  { label: '쉐도잉', url: '/interpreting/shadowing' },
                  { label: '영상 통역', url: '/translation/visual-interpretation' },
                  { label: 'PPT 통역', url: '/translation/ppt-interpretation' }
                ].map((item, idx, arr) => (
                  <span key={item.label} className="inline-flex items-center">
                    <span
                      className="font-bold text-purple-700 underline cursor-pointer hover:text-purple-900 transition-colors px-1"
                      onClick={() => navigate(item.url)}
                      onMouseOver={e => (e.currentTarget.style.textDecoration = 'underline')}
                      onMouseOut={e => (e.currentTarget.style.textDecoration = 'underline')}
                      tabIndex={0}
                      style={{ cursor: 'pointer' }}
                    >
                      {item.label}
                    </span>
                    {idx < arr.length - 1 && <span className="mx-1 text-gray-400">→</span>}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MainDashboard; 