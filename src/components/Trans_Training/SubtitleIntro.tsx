import React from 'react';
import { useNavigate } from 'react-router-dom';

// 포스터/프로필 이미지 URL은 아래 상수만 바꿔주면 됩니다!
const POSTER_URL = "https://i.namu.wiki/i/oWAcVStR3R3QHQT047aHlE1rJUe5ejq8ZjO4If7Wtz6A-mH38HtqlaVkj-DlXzaz7T8O1vCn645teJQ6SLc6OA.webp";
const CHARACTER_IMAGES = {
  jingchu: "https://an2-img.amz.wtchn.net/image/v2/D-8HDDP8dtceT3P-uDG0rA.jpg?jwt=ZXlKaGJHY2lPaUpJVXpJMU5pSjkuZXlKdmNIUnpJanBiSW1KbklsMHNJbkFpT2lJdmRqSXZjM1J2Y21VdmFXMWhaMlV2TVRZM01EUTRPRE00TkRZek9UTTVORFEwTUNKOS5wVFU4ZnN0SWlyVERuLUFUREllVUZxUW1HNkJtU0FSdmtiekpfd2RSMGlZ",
  laosan: "https://watching-img.pickle.plus/person/ad7aa7a2-2616-4a16-b0f8-1ff3591a35cb-1707484449349.jpg?w=256&q=75&format=webp",
  mother: "data:image/jpeg;base64,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",
  teacher: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&h=150&fit=crop&crop=face",
};

const SubtitleIntro: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #ffe0ec 0%, #ffd6e0 100%)', color: '#a14c6c', fontFamily: `'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif` }}>
      <style>{`
        .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
        .header { text-align: center; color: #d72660; margin-bottom: 40px; padding: 40px 0; }
        .header h1 { font-size: 3rem; margin-bottom: 10px; text-shadow: 2px 2px 8px #ffd6e0; letter-spacing: 2px; }
        .header .subtitle { font-size: 1.2rem; opacity: 0.9; margin-bottom: 20px; color: #a14c6c; }
        .main-content { display: grid; grid-template-columns: 1fr 2fr; gap: 40px; background: #fff0f6; border: 1px solid #ffd6e0; border-radius: 20px; padding: 40px; box-shadow: 0 20px 60px rgba(255,192,203,0.15); margin-bottom: 30px; }
        .movie-poster { position: relative; }
        .poster-image { width: 100%; border-radius: 15px; box-shadow: 0 10px 30px rgba(255,192,203,0.25); transition: transform 0.3s ease; border: 3px solid #ffd6e0; }
        .poster-image:hover { transform: scale(1.05); }
        .movie-info h2 { color: #d72660; font-size: 2rem; margin-bottom: 20px; border-bottom: 3px solid #ffb6c1; padding-bottom: 10px; display: flex; align-items: center; gap: 10px; }
        .info-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px; margin-bottom: 30px; }
        .info-item { background: #ffe0ec; padding: 15px; border-radius: 10px; border-left: 4px solid #ffb6c1; border: 1px solid #ffd6e0; }
        .info-label { font-weight: bold; color: #d72660; margin-bottom: 5px; }
        .info-value { color: #a14c6c; }
        .synopsis { background: #fff0f6; border: 1px solid #ffd6e0; border-radius: 20px; padding: 40px; box-shadow: 0 20px 60px rgba(255,192,203,0.12); margin-bottom: 30px; }
        .synopsis h3 { color: #d72660; font-size: 1.8rem; margin-bottom: 20px; text-align: center; }
        .synopsis p { font-size: 1.1rem; line-height: 1.8; text-align: justify; color: #a14c6c; }
        .characters { background: #fff0f6; border: 1px solid #ffd6e0; border-radius: 20px; padding: 40px; box-shadow: 0 20px 60px rgba(255,192,203,0.12); margin-bottom: 30px; }
        .characters h3 { color: #d72660; font-size: 1.8rem; margin-bottom: 30px; text-align: center; }
        .character-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 25px; }
        .character-card { background: linear-gradient(135deg, #ffe0ec 0%, #ffd6e0 100%); padding: 25px; border-radius: 15px; text-align: center; transition: transform 0.3s, box-shadow 0.3s; border: 2px solid #ffd6e0; box-shadow: 0 5px 20px rgba(255,192,203,0.10); }
        .character-card:hover { transform: translateY(-5px); box-shadow: 0 15px 35px rgba(255,182,193,0.25); border-color: #ffb6c1; }
        .character-avatar { width: 80px; height: 80px; border-radius: 50%; margin: 0 auto 15px; border: 3px solid #ffb6c1; overflow: hidden; box-shadow: 0 5px 15px rgba(255,182,193,0.18); }
        .character-avatar img { width: 100%; height: 100%; object-fit: cover; }
        .character-name { font-size: 1.3rem; font-weight: bold; color: #d72660; margin-bottom: 10px; }
        .actor-name { font-size: 1rem; color: #a14c6c; margin-bottom: 15px; }
        .character-desc { font-size: 0.95rem; line-height: 1.6; color: #a14c6c; }
        .cta-section { text-align: center; padding: 60px 20px; }
        .cta-button { display: inline-block; background: linear-gradient(135deg, #ffb6c1 0%, #ff69b4 100%); color: white; text-decoration: none; padding: 20px 50px; border-radius: 50px; font-size: 1.3rem; font-weight: bold; transition: all 0.3s; box-shadow: 0 10px 30px rgba(255,182,193,0.25); text-transform: uppercase; letter-spacing: 1px; }
        .cta-button:hover { transform: translateY(-3px); box-shadow: 0 20px 40px rgba(255,182,193,0.35); background: linear-gradient(135deg, #ff69b4 0%, #d72660 100%); }
        .highlight { background: linear-gradient(120deg, #ffb6c1 0%, #ff69b4 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; font-weight: bold; }
        @media (max-width: 768px) { .main-content { grid-template-columns: 1fr; padding: 20px; } .header h1 { font-size: 2rem; } .info-grid { grid-template-columns: 1fr; } .character-grid { grid-template-columns: 1fr; } }
      `}</style>
      <div className="container">
        {/* 헤더 */}
        <div className="header">
          <h1>산사나무 아래</h1>
          <div className="subtitle">山楂樹之戀 | Under the Hawthorn Tree</div>
          <div className="subtitle">장이모우 감독의 순수 로맨스 걸작</div>
        </div>
        {/* 메인 콘텐츠 */}
        <div className="main-content">
          <div className="movie-poster">
            <img src={POSTER_URL} alt="산사나무 아래 포스터" className="poster-image" />
          </div>
          <div className="movie-info">
            <h2>영화 정보 <span role="img" aria-label="slate">🎬</span></h2>
            <div className="info-grid">
              <div className="info-item">
                <div className="info-label">감독</div>
                <div className="info-value">장이모우 (張藝謀)</div>
              </div>
              <div className="info-item">
                <div className="info-label">장르</div>
                <div className="info-value">로맨스, 드라마</div>
              </div>
              <div className="info-item">
                <div className="info-label">개봉년도</div>
                <div className="info-value">2010년</div>
              </div>
              <div className="info-item">
                <div className="info-label">러닝타임</div>
                <div className="info-value">114분</div>
              </div>
              <div className="info-item">
                <div className="info-label">국가</div>
                <div className="info-value">중국</div>
              </div>
              <div className="info-item">
                <div className="info-label">언어</div>
                <div className="info-value">중국어 (표준중국어)</div>
              </div>
            </div>
          </div>
        </div>
        {/* 줄거리 */}
        <div className="synopsis">
          <h3>🌸 줄거리</h3>
          <p>
            1970년대 중국 문화대혁명 시기, 도시에서 온 고등학생 <span className="highlight">징추</span>는 농촌 체험을 위해 시골마을에 내려간다. 
            그곳에서 지질학도인 <span className="highlight">라오싼</span>을 만나게 되고, 두 사람은 아름다운 산사나무 아래에서 순수한 사랑에 빠진다. 
            하지만 당시의 엄격한 사회 분위기와 계급의 벽, 그리고 예상치 못한 시련들이 두 사람의 사랑을 시험에 들게 한다. 
            장이모우 감독이 그려내는 순수하고 애틋한 첫사랑의 이야기는 관객들에게 깊은 감동과 여운을 남긴다.
            이 영화는 실화를 바탕으로 제작되어 더욱 진실성 있는 감동을 전달하며, 중국 현대사의 격동기를 배경으로 한 아름다운 러브스토리로 평가받고 있다.
          </p>
        </div>
        {/* 등장인물 */}
        <div className="characters">
          <h3>👥 주요 등장인물</h3>
          <div className="character-grid">
            <div className="character-card">
              <div className="character-avatar">
                <img src={CHARACTER_IMAGES.jingchu} alt="징추" />
              </div>
              <div className="character-name">징추 (靜秋)</div>
              <div className="actor-name">저우둥위 (周冬雨) 분</div>
              <div className="character-desc">
                도시에서 온 순수한 고등학생. 농촌 체험 중 라오싼을 만나 첫사랑에 빠진다. 
                성실하고 착한 성격의 소유자로, 가족에 대한 책임감이 강하다.
              </div>
            </div>
            <div className="character-card">
              <div className="character-avatar">
                <img src={CHARACTER_IMAGES.laosan} alt="라오싼" />
              </div>
              <div className="character-name">라오싼 (老三)</div>
              <div className="actor-name">두오둬 (窦骁) 분</div>
              <div className="character-desc">
                지질학을 전공하는 대학생. 징추에게 깊은 사랑을 느끼지만 
                사회적 제약과 개인적 비밀로 인해 고뇌한다. 따뜻하고 배려심 깊은 청년.
              </div>
            </div>
            <div className="character-card">
              <div className="character-avatar">
                <img src={CHARACTER_IMAGES.mother} alt="징추 어머니" />
              </div>
              <div className="character-name">징추 어머니</div>
              <div className="actor-name">사쳰 (奚春) 분</div>
              <div className="character-desc">
                딸을 사랑하지만 현실적인 면을 강조하는 어머니. 
                문화대혁명의 영향으로 신중한 삶을 살아가고 있다.
              </div>
            </div>
          </div>
        </div>
        {/* CTA 섹션 */}
        <div className="cta-section">
          <h2 style={{ color: 'white', marginBottom: 30, fontSize: '2rem' }}>
            📚 이제 이 아름다운 사랑 이야기의 <br />
            <span className="highlight" style={{ color: '#fff' }}>자막 번역에 참여해보세요!</span>
          </h2>
          <button
            className="cta-button"
            onClick={() => navigate('/subtitle-translation')}
          >
            🎬 자막 번역 하러가기
          </button>
        </div>
      </div>
    </div>
  );
};

export default SubtitleIntro; 