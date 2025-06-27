import React from 'react';

const SubtitleTranslation: React.FC = () => {
  return (
    <div className="w-full h-screen flex bg-[#1a1a1a] text-white font-sans overflow-hidden">
      {/* 왼쪽: 비디오 + 타임라인 */}
      <div className="flex-[3] flex flex-col">
        {/* 비디오 영역 */}
        <div className="flex-1 relative bg-black flex items-center justify-center">
          <span className="text-3xl text-gray-400">🎬 YouTube 비디오 영역<br /><span className="text-lg">(실제 구현시 YouTube/video 태그)</span></span>
          {/* 자막 오버레이 */}
          <div className="absolute bottom-16 left-1/2 -translate-x-1/2 bg-black/80 text-white px-8 py-4 rounded text-xl max-w-[90%] text-center shadow-2xl">
            <span>把行李带好 <span className="text-gray-400">(짐 잘 챙기거라)</span></span>
          </div>
        </div>
        {/* 타임라인 */}
        <div className="h-[220px] bg-[#232323] border-t border-[#444] flex flex-col">
          <div className="flex items-center gap-3 px-8 py-3 bg-[#333] text-lg">
            <button className="bg-[#555] hover:bg-[#666] rounded px-5 py-2">⏮</button>
            <button className="bg-[#007acc] text-white rounded px-5 py-2">⏸</button>
            <button className="bg-[#555] hover:bg-[#666] rounded px-5 py-2">⏭</button>
            <span className="ml-8 text-base">00:02:07 / 01:35:42</span>
            <button className="ml-auto bg-[#555] hover:bg-[#666] rounded px-5 py-2">연습모드</button>
          </div>
          <div className="flex-1 relative bg-[#1e1e1e] overflow-x-auto px-8 py-3">
            <div className="timeline-track h-16 relative mb-2">
              {/* 자막 블록 예시 */}
              <div className="absolute left-[60px] w-[100px] h-12 bg-[#007acc] rounded px-3 py-2 text-base flex items-center justify-center cursor-pointer border-2 border-transparent hover:border-white text-white" title="안녕하세요">자막1</div>
              <div className="absolute left-[200px] w-[120px] h-12 bg-[#007acc] rounded px-3 py-2 text-base flex items-center justify-center cursor-pointer border-2 border-transparent hover:border-white text-white" title="저는 김철수입니다">자막2</div>
              <div className="absolute left-[360px] w-[110px] h-12 bg-gradient-to-r from-[#007acc] to-[#9c27b0] rounded px-3 py-2 text-base flex items-center justify-center cursor-pointer border-2 border-yellow-300 text-white" title="把行李带好">자막3</div>
              <div className="absolute left-[510px] w-[140px] h-12 bg-[#007acc] rounded px-3 py-2 text-base flex items-center justify-center cursor-pointer border-2 border-transparent hover:border-white text-white" title="다음 대화">자막4</div>
            </div>
          </div>
        </div>
      </div>
      {/* 오른쪽: 편집 패널 */}
      <div className="flex-[2] bg-[#232323] border-l border-[#444] flex flex-col">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-10 py-6 bg-[#333] border-b border-[#444]">
          <h3 className="text-2xl font-bold">자막 편집</h3>
          <div className="flex gap-3">
            <button className="px-6 py-3 rounded bg-[#007acc] text-white font-bold text-lg">학습모드</button>
            <button className="px-6 py-3 rounded bg-[#555] text-white font-bold text-lg">실전모드</button>
          </div>
        </div>
        {/* 콘텐츠 영역 */}
        <div className="flex-1 p-10 overflow-y-auto text-lg">
          <div className="bg-[#1e1e1e] p-6 rounded mb-8 font-mono text-base">여기에 자막/번역/퀴즈/힌트 등 편집 UI</div>

          {/* 원문 강조 영역 (예시) */}
          <div className="original-text text-black">
              <p>이것은 한국어로 된 원문 문장입니다. 중국어로 번역해주세요.</p>
          </div>

          {/* 주요 어휘 영역 (예시) */}
          <div className="keywords-row">
              <span className="keyword-tooltip">
                  <span className="keyword-icon">📚</span>불꽃 튀는
                  <span className="tooltip-content">
                      <p>중국어: 火花四溅 (huǒhuā sìjiàn)</p>
                      <p>의미: 불꽃이 사방으로 튀다; 경쟁이 치열하다</p>
                  </span>
              </span>
              <span className="keyword-tooltip">
                  <span className="keyword-icon">📚</span>승부욕
                  <span className="tooltip-content">
                      <p>중국어: 胜负欲 (shèngfùyù)</p>
                      <p>의미: 이기고 지는 것에 대한 강한 욕구</p>
                  </span>
              </span>
          </div>

          {/* 난이도/분야 정보 (예시) */}
          <div className="meta-info">
              <span className="difficulty">난이도: 중간</span>
              <span className="domain">분야: K-POP</span>
          </div>

          {/* 번역 입력 영역 (Textarea) */}
          <textarea
            className="w-full min-h-[120px] bg-[#333] text-white border border-[#555] rounded-lg p-4 text-base resize-y focus:border-[#007acc] focus:ring-1 focus:ring-[#007acc]"
            placeholder="여기에 번역을 입력하세요..."
          ></textarea>

          {/* 제출 버튼 */}
          <button className="submit-btn">번역 제출</button>

          {/* AI/피드백 영역 (예시) */}
          <div className="ai-section text-black">
              <h4 className="text-blue-700 font-bold mb-3">🤖 AI의 피드백:</h4>
              <p className="text-gray-700">당신의 번역은 의미는 잘 전달되지만, 어순이 약간 어색합니다. 예를 들어, '일요일 밤을 꽉 채웠다'는 '填满周日晚'으로 표현하는 것이 더 자연스럽습니다.</p>
              <p className="ai-feedback-summary good">⭐ 매우 정확함</p> {/* 또는 average/poor */}
          </div>

          {/* 힌트 섹션 (예시) */}
          <div className="hint-section text-yellow-300 bg-[#2a2a1a] border-l-4 border-yellow-500 rounded-r p-3 mt-4">
              💡 <strong>번역 팁:</strong> '把...带好'는 '~을 잘 챙기다'라는 의미로, 명령문에서 자주 사용됩니다.
          </div>

          {/* 액션 버튼들 (예시) */}
          <div className="flex gap-3 mt-8">
              <button className="btn btn-primary">이전 자막</button>
              <button className="btn btn-success">다음 자막</button>
              <button className="btn btn-secondary">힌트 보기</button>
          </div>
        </div>
        {/* 상태바 */}
        <div className="bg-[#333] px-10 py-4 text-base text-gray-400 border-t border-[#444]">
          진행률: 6/167 자막 완료 | 퀴즈: 2/52 완료 | 정확도: 87%
        </div>
      </div>
    </div>
  );
};

export default SubtitleTranslation; 