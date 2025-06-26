import React from 'react';

const ReverseTranslationChallengeMenu: React.FC = () => {
  return (
    <div className="max-w-2xl mx-auto bg-white rounded-xl shadow-lg p-8 mt-8">
      <h1 className="text-2xl font-bold text-indigo-700 mb-4">역반향 번역 챌린지</h1>
      <p className="text-gray-700 mb-6">
        한-중, 중-한 번역을 번갈아가며 실전처럼 연습하는 챌린지 모드입니다.<br/>
        다양한 유형의 문제와 실시간 피드백, 랭킹 시스템이 곧 추가될 예정입니다.
      </p>
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 text-center text-blue-800">
        <span className="font-semibold">아직 준비 중입니다.</span><br/>
        곧 다양한 챌린지와 게임이 추가될 예정입니다!
      </div>
    </div>
  );
};

export default ReverseTranslationChallengeMenu; 