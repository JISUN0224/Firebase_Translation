import React from 'react';

function TestPage() {
  // 제출 여부 및 입력 상태 관리
  const [submitted, setSubmitted] = React.useState(false);
  const [userTranslation, setUserTranslation] = React.useState('');

  // 제출 핸들러
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
  };

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-2" style={{ fontFamily: `'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', 'SimSun', 'Noto Sans KR', 'Apple SD Gothic Neo', Arial, sans-serif` }}>
      {/* 바깥쪽 넓은 컨테이너 */}
      <div className="max-w-6xl mx-auto">
        {/* 옵션 필터 */}
        <div className="flex flex-wrap gap-4 mb-6">
          <select className="bg-white text-black px-4 py-2 rounded-md border border-gray-300 appearance-none">
            <option>난이도: 전체</option>
            <option>하</option>
            <option>중</option>
            <option>상</option>
          </select>
          <select className="bg-white text-black px-4 py-2 rounded-md border border-gray-300 appearance-none">
            <option>분야: 전체</option>
            <option>교육</option>
            <option>환경</option>
            <option>경제</option>
          </select>
          <select className="bg-white text-black px-4 py-2 rounded-md border border-gray-300 appearance-none">
            <option>언어쌍: 한-중</option>
            <option>한-영</option>
            <option>한-일</option>
          </select>
        </div>
        {/* 문제 카드 */}
        <div className="bg-white border border-gray-200 rounded-xl p-8 mb-6 shadow" style={{ minWidth: 0 }}>
          <p className="font-bold mb-4 text-gray-700 text-xl">아래 문장을 번역해 보세요.</p>
          <div className="bg-blue-100 border border-blue-300 rounded-lg px-6 py-4 text-blue-900 text-base flex items-center justify-between gap-4 mb-6" style={{whiteSpace:'nowrap', overflow:'auto'}}>
            <span className="font-medium text-lg" style={{whiteSpace:'nowrap'}}>기초 회화 패턴 연습을 통해 문장 완성이 가능하며 생활 영어, 초급 문법, 파닉스를 동시에 학습할 수 있습니다.</span>
            <button className="bg-blue-400 text-white px-4 py-2 rounded-md text-sm hover:bg-blue-500 flex items-center gap-1">
              <span role="img" aria-label="search">🔍</span> 힌트 보기
            </button>
          </div>
          <form onSubmit={handleSubmit}>
            <textarea
              className="w-full border border-gray-300 rounded-md p-3 mt-2 resize-y focus:outline-none focus:ring-2 focus:ring-blue-300"
              rows={3}
              placeholder="여기에 번역 입력..."
              style={{fontFamily: `'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', 'SimSun', 'Noto Sans KR', 'Apple SD Gothic Neo', Arial, sans-serif`}}
              value={userTranslation}
              onChange={e => setUserTranslation(e.target.value)}
              required
            />
            <div className="flex justify-center gap-4 mt-8">
              <button type="button" className="bg-white border border-gray-300 px-6 py-2 rounded-md text-gray-700 hover:bg-gray-100">← 이전 문제</button>
              <button type="submit" className="bg-blue-600 text-white px-8 py-2 rounded-md font-bold hover:bg-blue-700">내 번역 제출하기</button>
              <button type="button" className="bg-white border border-gray-300 px-6 py-2 rounded-md text-gray-700 hover:bg-gray-100">다음 문제 →</button>
            </div>
            <div className="text-center text-gray-500 mt-4">2 / 170</div>
          </form>
        </div>
        {/* AI 번역 결과 카드 */}
        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow mb-8">
          <h3 className="font-bold text-lg mb-4">AI 번역 결과</h3>
          <div className="flex flex-wrap gap-4 mt-2">
            <div className="flex-1 min-w-[220px] bg-sky-50 border-2 border-sky-200 rounded-lg p-4">
              <span className="font-bold block mb-2 text-gray-700">ChatGPT 번역</span>
              <p className="text-gray-900 whitespace-pre-line">
                {submitted ? "(예시) AI 번역 결과가 여기에 표시됩니다." : ""}
              </p>
            </div>
            <div className="flex-1 min-w-[220px] bg-sky-50 border-2 border-sky-200 rounded-lg p-4">
              <span className="font-bold block mb-2 text-gray-700">Gemini 번역</span>
              <p className="text-gray-900 whitespace-pre-line">
                {submitted ? "(예시) AI 번역 결과가 여기에 표시됩니다." : ""}
              </p>
            </div>
            <div className="flex-1 min-w-[220px] bg-rose-50 border-2 border-rose-200 rounded-lg p-4">
              <span className="font-bold block mb-2 text-gray-700">나의 번역</span>
              <p className="text-gray-900 whitespace-pre-line">
                {submitted ? userTranslation : ""}
              </p>
            </div>
          </div>
          <div className="text-center mt-6">
            <button 
              className="bg-blue-600 text-white px-6 py-2 rounded-md font-bold flex items-center justify-center gap-2 mx-auto hover:bg-blue-700"
              style={{ visibility: submitted ? 'visible' : 'hidden' }}
            >
              <span>📊</span> 비교 분석 피드백 받기
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default TestPage;