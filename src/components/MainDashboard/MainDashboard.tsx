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
      { label: 'AI통역 피드백', to: '/interpreting/feedback' },
    ] as MenuLink[],
    border: 'border-purple-400',
    hover: 'hover:border-purple-500',
  },
  {
    icon: '💪',
    title: '실전 연습',
    description: '다양한 방식으로 통역 실력을 향상시켜보세요',
    links: [
      { label: '🎯 단계별 통역 연습', to: '/interpreting/step-by-step' },
    ] as MenuLink[],
    border: 'border-orange-400',
    hover: 'hover:border-orange-500',
  },
  {
    icon: '📈',
    title: '학습 분석',
    description: '나의 통역 학습 데이터를 분석해보세요',
    links: [] as MenuLink[],
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
    <div className="flex items-center gap-3 mb-4 justify-end">
      <img src={user.photoURL || ''} alt="프로필" className="w-8 h-8 rounded-full border" />
      <span className="font-semibold text-gray-700">{user.displayName || user.email}</span>
      <button onClick={handleLogout} className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 text-sm">로그아웃</button>
    </div>
  ) : (
    <div style={{ position: 'absolute', top: '4.5rem', right: '2rem', zIndex: 50 }}>
      <button
        onClick={handleLogin}
        className="flex flex-col items-center px-6 py-3 bg-white border border-gray-300 rounded-xl shadow hover:shadow-md hover:bg-gray-50 transition-all"
        style={{ minWidth: 160 }}
      >
        <span className="flex items-center justify-center">
          <svg width="28" height="28" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
            <g clipPath="url(#clip0_17_40)">
              <path d="M47.5 24.5C47.5 22.8333 47.3333 21.3333 47.0833 19.8333H24V28.5H37.3333C36.8333 31.3333 35.1667 33.6667 32.6667 35.1667V40.1667H40.1667C44.1667 36.5 47.5 31.1667 47.5 24.5Z" fill="#4285F4"/>
              <path d="M24 48C30.5 48 35.8333 45.8333 40.1667 40.1667L32.6667 35.1667C30.6667 36.5 28.1667 37.3333 24 37.3333C17.8333 37.3333 12.5 33.1667 10.6667 27.6667H2.83334V32.8333C7.16667 41.1667 15.1667 48 24 48Z" fill="#34A853"/>
              <path d="M10.6667 27.6667C10.1667 26.3333 10 24.8333 10 23.3333C10 21.8333 10.1667 20.3333 10.6667 19H10.6667V13.8333H2.83334C1.16667 17.1667 0 20.8333 0 24.5C0 28.1667 1.16667 31.8333 2.83334 35.1667L10.6667 27.6667Z" fill="#FBBC05"/>
              <path d="M24 9.66667C28.1667 9.66667 31.1667 11.3333 32.8333 12.8333L40.3333 6.16667C35.8333 2.16667 30.5 0 24 0C15.1667 0 7.16667 6.83333 2.83334 13.8333L10.6667 19C12.5 13.5 17.8333 9.66667 24 9.66667Z" fill="#EA4335"/>
            </g>
            <defs>
              <clipPath id="clip0_17_40">
                <rect width="48" height="48" fill="white"/>
              </clipPath>
            </defs>
          </svg>
        </span>
        <span className="mt-2 text-gray-800 font-semibold text-base">구글로 로그인</span>
      </button>
    </div>
  );
}

const MainDashboard: React.FC = () => {
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
    <div className="w-full h-screen py-8 px-2">
      <GoogleLoginButton />
      <div className="text-center mb-6">
        <div className="text-3xl md:text-4xl font-bold text-blue-800 flex items-center justify-center gap-2 mb-2">
          <span role="img" aria-label="globe">🌐</span> 번역 학습 플랫폼
        </div>
        <div className="text-lg text-gray-600 flex items-center justify-center gap-2 mb-2">
          <span role="img" aria-label="wave">👋</span> 안녕하세요! 어떤 학습을 시작해보실까요?
        </div>
      </div>
      
      {/* 번역 섹션 */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-800 mb-4 text-center">📄 번역 (Translation)</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {menuCards.map((card) => (
            <div
              key={card.title}
              className={`rounded-2xl bg-white shadow-lg p-7 border-2 ${card.border} ${card.hover} transition-all duration-200 cursor-pointer group
                hover:shadow-2xl hover:scale-105 hover:bg-blue-50
              `}
              tabIndex={0}
              onClick={() => handleCardClick(card)}
              onKeyDown={e => { if (e.key === 'Enter') handleCardClick(card); }}
            >
              <div className="text-4xl mb-2">{card.icon}</div>
              <div className="font-bold text-xl mb-1">{card.title}</div>
              <div className="text-gray-600 mb-3 text-sm">{card.description}</div>
              <ul className="space-y-1 mt-2">
                {card.links.map(link => (
                  <li key={link.label}>
                    <button
                      className={`flex items-center gap-2 text-blue-700 hover:underline text-base ${link.disabled ? 'text-gray-400 cursor-not-allowed' : ''}`}
                      onClick={e => handleMenuClick(link, e)}
                      disabled={!!link.disabled}
                    >
                      <span className="text-xs">
                        {link.isToggle ? (toggledMenus[link.label] ? '▼' : '▶') : '▶'}
                      </span> 
                      {link.label}
                    </button>
                    {link.isToggle && link.subMenu && toggledMenus[link.label] && (
                      <ul className="ml-4 mt-1 space-y-1">
                        {link.subMenu.map(subLink => (
                          <li key={subLink.label}>
                            <button
                              className="flex items-center gap-2 text-blue-600 hover:underline text-sm"
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
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-800 mb-4 text-center">🎤 통역 (Interpreting)</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {interpretingCards.map((card) => (
            <div
              key={card.title}
              className={`rounded-2xl bg-white shadow-lg p-7 border-2 ${card.border} ${card.hover} transition-all duration-200 cursor-pointer group
                hover:shadow-2xl hover:scale-105 hover:bg-purple-50
              `}
              tabIndex={0}
              onClick={() => handleCardClick(card)}
              onKeyDown={e => { if (e.key === 'Enter') handleCardClick(card); }}
            >
              <div className="text-4xl mb-2">{card.icon}</div>
              <div className="font-bold text-xl mb-1">{card.title}</div>
              <div className="text-gray-600 mb-3 text-sm">{card.description}</div>
              <ul className="space-y-1 mt-2">
                {card.links.map(link => (
                  <li key={link.label}>
                    <button
                      className={`flex items-center gap-2 text-purple-700 hover:underline text-base ${link.disabled ? 'text-gray-400 cursor-not-allowed' : ''}`}
                      onClick={e => handleMenuClick(link, e)}
                      disabled={!!link.disabled}
                    >
                      <span className="text-xs">
                        {link.isToggle ? (toggledMenus[link.label] ? '▼' : '▶') : '▶'}
                      </span> 
                      {link.label}
                    </button>
                    {link.isToggle && link.subMenu && toggledMenus[link.label] && (
                      <ul className="ml-4 mt-1 space-y-1">
                        {link.subMenu.map(subLink => (
                          <li key={subLink.label}>
                            <button
                              className="flex items-center gap-2 text-purple-600 hover:underline text-sm"
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

      <div className="bg-blue-50 rounded-xl p-6 mt-8">
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