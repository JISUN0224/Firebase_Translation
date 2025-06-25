import React from 'react';
import { NavLink } from 'react-router-dom';

const navItems = [
  { label: 'AI 비교 분석', to: '/translation' },
  { label: '실전 연습', to: '/practice', disabled: true },
  { label: '학습 분석', to: '/analysis', disabled: true },
];

const Navigation: React.FC = () => (
  <nav className="w-full flex items-center justify-between py-4 px-6 bg-white shadow-sm border-b border-gray-100">
    <div className="flex items-center gap-2 text-2xl font-bold text-blue-700">
      <span role="img" aria-label="globe">🌐</span>
      번역 학습 플랫폼
    </div>
    <div className="flex gap-6">
      {navItems.map(item => (
        <NavLink
          key={item.label}
          to={item.to}
          className={({ isActive }) =>
            `text-lg px-3 py-1 rounded-md transition font-semibold ${isActive ? 'bg-blue-100 text-blue-700' : 'text-gray-700 hover:bg-blue-50'} ${item.disabled ? 'opacity-40 pointer-events-none' : ''}`
          }
        >
          {item.label}
        </NavLink>
      ))}
    </div>
  </nav>
);

export default Navigation; 