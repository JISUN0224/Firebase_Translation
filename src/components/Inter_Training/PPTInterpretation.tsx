import React, { useState, useRef, useEffect } from 'react';
import { auth } from '../../firebase';
import { saveStudySession } from '../Tran_Analysis/studyDataUtils';
import luxePresentationData from '../../assets/luxe_presentation_scripts.json';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

// 오디오 파일 import
import audioFile from '../../assets/luxe-ppt-audio.mp3';

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar, Line, Doughnut, Scatter } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend
);

interface PresentationSlide {
  slideNumber: number;
  title: string;
  koreanScript: string;
  keyPoints: string[];
  image?: string;
  audioStartTime: number;
  audioEndTime: number;
  chartType?: 'bar' | 'line' | 'pie'; // 차트 타입 추가
  chartData?: any; // 차트 데이터 추가
}

interface SlideTranscript {
  title: string;
  content: string[];
  image?: string;
  audioStartTime: number;
  audioEndTime: number;
  interpreterNotes?: string;
}

// JSON 데이터를 SlideTranscript 형태로 변환
const slideTranscripts: SlideTranscript[] = luxePresentationData.slides.map((slide: PresentationSlide) => ({
  title: slide.title,
  content: slide.koreanScript.split('\n').map(item => item.trim()),
  image: slide.image,
  audioStartTime: slide.audioStartTime,
  audioEndTime: slide.audioEndTime,
  interpreterNotes: slide.keyPoints.join(', ')
}));

// 각 슬라이드 컴포넌트 정의
const TitleSlide = () => (
  <div className="h-full w-full bg-white flex flex-col items-center justify-center" style={{ padding: '60px' }}>
    <div className="absolute top-8 right-8 bg-opacity-10 text-amber-800 px-4 py-2 rounded-full text-sm font-medium" style={{ background: 'rgba(139, 69, 19, 0.1)' }}>
      1 / 8
    </div>
    
    <h1 style={{ 
      fontFamily: 'Playfair Display, serif',
      fontSize: '72px',
      fontWeight: 700,
      color: '#8B4513',
      marginBottom: '20px',
      letterSpacing: '8px'
    }}>
      LUXE
    </h1>
    
    <h2 style={{ 
      fontSize: '48px',
      fontWeight: 700,
      color: '#8B4513',
      marginBottom: '30px',
      textAlign: 'center'
    }}>
      프리미엄 뷰티 브랜드 런칭
    </h2>
    
    <p style={{ 
      fontSize: '18px',
      color: '#A0937D',
      marginBottom: '60px'
    }}>
      자연에서 영감을 받은 고급 스킨케어 컬렉션
    </p>
    
    <div style={{ fontSize: '16px', color: '#A0937D' }}>
      <p>2025년 3월 글로벌 런칭</p>
    </div>
  </div>
);

const BrandPositioningSlide = () => {
  const chartData = {
    datasets: [{
      label: 'LUXE (목표)',
      data: [{x: 85, y: 90}],
      backgroundColor: '#8B4513',
      pointRadius: 12
    }, {
      label: '설화수',
      data: [{x: 95, y: 85}],
      backgroundColor: '#D4B5A0',
      pointRadius: 8
    }, {
      label: '라프레리',
      data: [{x: 98, y: 95}],
      backgroundColor: '#A0937D',
      pointRadius: 8
    }]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: { 
        title: { display: true, text: '가격 프리미엄도' }, 
        min: 70, 
        max: 100 
      },
      y: { 
        title: { display: true, text: '브랜드 인지도' }, 
        min: 70, 
        max: 100 
      }
    }
  };

  return (
    <div className="h-full w-full bg-white flex flex-col" style={{ padding: '20px 60px 120px 60px' }}>
      <div className="absolute top-8 right-8 bg-opacity-10 text-amber-800 px-4 py-2 rounded-full text-sm font-medium" style={{ background: 'rgba(139, 69, 19, 0.1)' }}>
        2 / 8
      </div>
      
      {/* 상단 섹션 - 제목과 카드들 */}
      <div className="mb-6 text-center">
        <h2 style={{ 
          fontFamily: 'Playfair Display, serif',
          fontSize: '48px',
          fontWeight: 700,
          color: '#8B4513',
          marginBottom: '12px'
        }}>
          브랜드 포지셔닝
        </h2>
        <p style={{ 
          fontSize: '18px',
          color: '#A0937D',
          marginBottom: '20px'
        }}>
          클린 뷰티 시장에서의 프리미엄 포지션
        </p>
        
        <div className="grid grid-cols-2 gap-6 max-w-4xl mx-auto">
          <div style={{ 
            background: '#FAF7F2',
            padding: '16px',
            borderRadius: '15px',
            boxShadow: '0 8px 20px rgba(139, 69, 19, 0.1)'
          }}>
            <div style={{ color: '#8B4513', fontSize: '20px', fontWeight: 600, marginBottom: '8px' }}>
              타겟 가격대
            </div>
            <div style={{ color: '#A0937D', fontSize: '16px' }}>
              ₩50,000 - ₩120,000
            </div>
          </div>
          <div style={{ 
            background: '#FAF7F2',
            padding: '16px',
            borderRadius: '15px',
            boxShadow: '0 8px 20px rgba(139, 69, 19, 0.1)'
          }}>
            <div style={{ color: '#8B4513', fontSize: '20px', fontWeight: 600, marginBottom: '8px' }}>
              경쟁 브랜드
            </div>
            <div style={{ color: '#A0937D', fontSize: '16px' }}>
              설화수, 라프레리, 에스티로더
            </div>
          </div>
          <div style={{ 
            background: '#FAF7F2',
            padding: '16px',
            borderRadius: '15px',
            boxShadow: '0 8px 20px rgba(139, 69, 19, 0.1)'
          }}>
            <div style={{ color: '#8B4513', fontSize: '20px', fontWeight: 600, marginBottom: '8px' }}>
              차별화 포인트
            </div>
            <div style={{ color: '#A0937D', fontSize: '16px' }}>
              친환경 + 프리미엄
            </div>
          </div>
          <div style={{ 
            background: '#FAF7F2',
            padding: '16px',
            borderRadius: '15px',
            boxShadow: '0 8px 20px rgba(139, 69, 19, 0.1)'
          }}>
            <div style={{ color: '#8B4513', fontSize: '20px', fontWeight: 600, marginBottom: '8px' }}>
              유통 채널
            </div>
            <div style={{ color: '#A0937D', fontSize: '16px' }}>
              백화점, 온라인 플래그십
            </div>
          </div>
        </div>
      </div>

      {/* 하단 차트 섹션 */}
      <div className="mx-auto flex-1" style={{ width: '750px', minHeight: '450px' }}>
        <div style={{ 
          width: '100%',
          height: '100%',
          background: 'white',
          borderRadius: '15px',
          padding: '24px',
          boxShadow: '0 10px 30px rgba(139, 69, 19, 0.1)'
        }}>
          <Scatter data={chartData} options={chartOptions} />
        </div>
      </div>
    </div>
  );
};

const MarketAnalysisSlide = () => {
  const chartData = {
    labels: ['2020', '2021', '2022', '2023', '2024', '2025 (예측)'],
    datasets: [{
      label: '시장 규모 (십억 달러)',
      data: [145, 158, 165, 172, 180, 195],
      borderColor: '#8B4513',
      backgroundColor: '#8B4513', // 갈색으로 변경
      tension: 0.4,
      fill: true
    }]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } }
  };

  return (
    <div className="h-full w-full bg-white flex flex-col" style={{ padding: '50px 60px 20px 60px' }}>
      <div className="absolute top-8 right-8 bg-opacity-10 text-amber-800 px-4 py-2 rounded-full text-sm font-medium" style={{ background: 'rgba(139, 69, 19, 0.1)' }}>
        3 / 8
      </div>
      
      {/* 제목 섹션 */}
      <div style={{ textAlign: 'center', marginBottom: '25px' }}>
        <h2 style={{ 
          fontFamily: 'Playfair Display, serif',
          fontSize: '48px',
          fontWeight: 700,
          color: '#8B4513',
          marginBottom: '12px'
        }}>
          시장 분석
        </h2>
        <p style={{ 
          fontSize: '18px',
          color: '#A0937D'
        }}>
          프리미엄 스킨케어 시장의 성장 추세
        </p>
      </div>

      {/* 차트 */}
      <div style={{ 
        width: '100%',
        maxWidth: '750px',
        height: '320px',
        background: 'white',
        borderRadius: '15px',
        padding: '20px',
        boxShadow: '0 10px 30px rgba(139, 69, 19, 0.1)',
        margin: '0 auto 20px auto'
      }}>
        <Line data={chartData} options={chartOptions} />
      </div>

      {/* 주요 지표 */}
      <div style={{ 
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '30px',
        maxWidth: '850px',
        margin: '0 auto'
      }}>
        <div style={{ 
          background: '#FAF7F2',
          padding: '30px 20px',
          borderRadius: '15px',
          textAlign: 'center',
          boxShadow: '0 8px 20px rgba(139, 69, 19, 0.1)'
        }}>
          <div style={{ 
            fontSize: '36px',
            fontWeight: 700,
            color: '#8B4513',
            marginBottom: '10px'
          }}>
            195
          </div>
          <div style={{ 
            fontSize: '15px',
            color: '#A0937D',
            textTransform: 'uppercase',
            lineHeight: '1.3'
          }}>
            2025년 예측 시장 규모<br/>(십억 달러)
          </div>
        </div>
        <div style={{ 
          background: '#FAF7F2',
          padding: '30px 20px',
          borderRadius: '15px',
          textAlign: 'center',
          boxShadow: '0 8px 20px rgba(139, 69, 19, 0.1)'
        }}>
          <div style={{ 
            fontSize: '36px',
            fontWeight: 700,
            color: '#8B4513',
            marginBottom: '10px'
          }}>
            15%
          </div>
          <div style={{ 
            fontSize: '15px',
            color: '#A0937D',
            textTransform: 'uppercase',
            lineHeight: '1.3'
          }}>
            연평균 성장률<br/>(2020-2025)
          </div>
        </div>
        <div style={{ 
          background: '#FAF7F2',
          padding: '30px 20px',
          borderRadius: '15px',
          textAlign: 'center',
          boxShadow: '0 8px 20px rgba(139, 69, 19, 0.1)'
        }}>
          <div style={{ 
            fontSize: '36px',
            fontWeight: 700,
            color: '#8B4513',
            marginBottom: '10px'
          }}>
            172
          </div>
          <div style={{ 
            fontSize: '15px',
            color: '#A0937D',
            textTransform: 'uppercase',
            lineHeight: '1.3'
          }}>
            2023년 시장 규모<br/>(십억 달러)
          </div>
        </div>
      </div>
    </div>
  );
};

const ProductPortfolioSlide = () => {
  const chartData = {
    labels: ['세럼 컬렉션', '모이스처라이저', '클렌징 라인', '선케어'],
    datasets: [{
      data: [40, 28, 22, 10],
      backgroundColor: ['#8B4513', '#A0937D', '#D4B5A0', '#E8D5C4']
    }]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { position: 'bottom' as const } }
  };

  return (
    <div className="h-full w-full bg-white flex flex-col" style={{ padding: '60px' }}>
      <div className="absolute top-8 right-8 bg-opacity-10 text-amber-800 px-4 py-2 rounded-full text-sm font-medium" style={{ background: 'rgba(139, 69, 19, 0.1)' }}>
        4 / 8
      </div>
      
      {/* 제목 섹션 */}
      <div style={{ textAlign: 'center', marginBottom: '40px' }}>
        <h2 style={{ 
          fontFamily: 'Playfair Display, serif',
          fontSize: '48px',
          fontWeight: 700,
          color: '#8B4513',
          marginBottom: '20px'
        }}>
          제품 포트폴리오
        </h2>
        <p style={{ 
          fontSize: '18px',
          color: '#A0937D'
        }}>
          카테고리별 매출 기여도 및 마진율
        </p>
      </div>

      {/* 차트 */}
      <div style={{ 
        width: '100%',
        maxWidth: '500px',
        height: '300px',
        background: 'white',
        borderRadius: '15px',
        padding: '20px',
        boxShadow: '0 10px 30px rgba(139, 69, 19, 0.1)',
        margin: '0 auto 30px auto'
      }}>
        <Doughnut data={chartData} options={chartOptions} />
      </div>

      {/* 제품 테이블 */}
      <table style={{
        width: '100%',
        maxWidth: '800px',
        margin: '0 auto',
        borderCollapse: 'collapse',
        background: 'white',
        borderRadius: '15px',
        overflow: 'hidden',
        boxShadow: '0 10px 30px rgba(139, 69, 19, 0.1)'
      }}>
        <thead>
          <tr>
            <th style={{
              background: '#8B4513',
              color: 'white',
              padding: '20px',
              textAlign: 'center',
              fontWeight: 600
            }}>제품 카테고리</th>
            <th style={{
              background: '#8B4513',
              color: 'white',
              padding: '20px',
              textAlign: 'center',
              fontWeight: 600
            }}>평균 가격</th>
            <th style={{
              background: '#8B4513',
              color: 'white',
              padding: '20px',
              textAlign: 'center',
              fontWeight: 600
            }}>예상 마진</th>
            <th style={{
              background: '#8B4513',
              color: 'white',
              padding: '20px',
              textAlign: 'center',
              fontWeight: 600
            }}>매출 기여도</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ padding: '18px', textAlign: 'center', borderBottom: '1px solid #f0f0f0' }}>클렌징 라인</td>
            <td style={{ padding: '18px', textAlign: 'center', borderBottom: '1px solid #f0f0f0' }}>₩55,000</td>
            <td style={{ padding: '18px', textAlign: 'center', borderBottom: '1px solid #f0f0f0' }}>65%</td>
            <td style={{ padding: '18px', textAlign: 'center', borderBottom: '1px solid #f0f0f0' }}>22%</td>
          </tr>
          <tr style={{ background: '#E8D5C4', fontWeight: 600 }}>
            <td style={{ padding: '18px', textAlign: 'center', borderBottom: '1px solid #f0f0f0' }}>세럼 컬렉션</td>
            <td style={{ padding: '18px', textAlign: 'center', borderBottom: '1px solid #f0f0f0' }}>₩100,000</td>
            <td style={{ padding: '18px', textAlign: 'center', borderBottom: '1px solid #f0f0f0' }}>72%</td>
            <td style={{ padding: '18px', textAlign: 'center', borderBottom: '1px solid #f0f0f0' }}>40%</td>
          </tr>
          <tr>
            <td style={{ padding: '18px', textAlign: 'center', borderBottom: '1px solid #f0f0f0' }}>모이스처라이저</td>
            <td style={{ padding: '18px', textAlign: 'center', borderBottom: '1px solid #f0f0f0' }}>₩82,500</td>
            <td style={{ padding: '18px', textAlign: 'center', borderBottom: '1px solid #f0f0f0' }}>68%</td>
            <td style={{ padding: '18px', textAlign: 'center', borderBottom: '1px solid #f0f0f0' }}>28%</td>
          </tr>
          <tr>
            <td style={{ padding: '18px', textAlign: 'center', borderBottom: '1px solid #f0f0f0' }}>선케어</td>
            <td style={{ padding: '18px', textAlign: 'center', borderBottom: '1px solid #f0f0f0' }}>₩65,000</td>
            <td style={{ padding: '18px', textAlign: 'center', borderBottom: '1px solid #f0f0f0' }}>63%</td>
            <td style={{ padding: '18px', textAlign: 'center', borderBottom: '1px solid #f0f0f0' }}>10%</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};

const TargetDemographicsSlide = () => {
  const chartData = {
    labels: ['25-35세', '36-45세', '46-55세'],
    datasets: [{
      label: '월평균 지출액 (만원)',
      data: [20, 35, 45],
      backgroundColor: ['#D4B5A0', '#8B4513', '#A0937D']
    }]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } }
  };

  return (
    <div className="h-full w-full bg-white flex flex-col" style={{ padding: '50px 60px 20px 60px' }}>
      <div className="absolute top-8 right-8 bg-opacity-10 text-amber-800 px-4 py-2 rounded-full text-sm font-medium" style={{ background: 'rgba(139, 69, 19, 0.1)' }}>
        5 / 8
      </div>
      
      {/* 제목 섹션 */}
      <div style={{ textAlign: 'center', marginBottom: '25px' }}>
        <h2 style={{ 
          fontFamily: 'Playfair Display, serif',
          fontSize: '48px',
          fontWeight: 700,
          color: '#8B4513',
          marginBottom: '12px'
        }}>
          타겟 고객 분석
        </h2>
        <p style={{ 
          fontSize: '18px',
          color: '#A0937D'
        }}>
          소비자 행동 패턴 및 구매력 분석
        </p>
      </div>

      {/* 차트 */}
      <div style={{ 
        width: '100%',
        maxWidth: '750px',
        height: '280px',
        background: 'white',
        borderRadius: '15px',
        padding: '20px',
        boxShadow: '0 10px 30px rgba(139, 69, 19, 0.1)',
        margin: '0 auto 20px auto'
      }}>
        <Bar data={chartData} options={chartOptions} />
      </div>

      {/* 고객 테이블 */}
      <table style={{
        width: '100%',
        maxWidth: '850px',
        margin: '0 auto',
        borderCollapse: 'collapse',
        background: 'white',
        borderRadius: '15px',
        overflow: 'hidden',
        boxShadow: '0 10px 30px rgba(139, 69, 19, 0.1)'
      }}>
        <thead>
          <tr>
            <th style={{
              background: '#8B4513',
              color: 'white',
              padding: '20px',
              textAlign: 'center',
              fontWeight: 600
            }}>연령대</th>
            <th style={{
              background: '#8B4513',
              color: 'white',
              padding: '20px',
              textAlign: 'center',
              fontWeight: 600
            }}>시장 비중</th>
            <th style={{
              background: '#8B4513',
              color: 'white',
              padding: '20px',
              textAlign: 'center',
              fontWeight: 600
            }}>평균 구매력</th>
            <th style={{
              background: '#8B4513',
              color: 'white',
              padding: '20px',
              textAlign: 'center',
              fontWeight: 600
            }}>구매 빈도</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ padding: '18px', textAlign: 'center', borderBottom: '1px solid #f0f0f0' }}>25-35세</td>
            <td style={{ padding: '18px', textAlign: 'center', borderBottom: '1px solid #f0f0f0' }}>45%</td>
            <td style={{ padding: '18px', textAlign: 'center', borderBottom: '1px solid #f0f0f0' }}>₩200,000/월</td>
            <td style={{ padding: '18px', textAlign: 'center', borderBottom: '1px solid #f0f0f0' }}>2.3회/월</td>
          </tr>
          <tr style={{ background: '#E8D5C4', fontWeight: 600 }}>
            <td style={{ padding: '18px', textAlign: 'center', borderBottom: '1px solid #f0f0f0' }}>36-45세</td>
            <td style={{ padding: '18px', textAlign: 'center', borderBottom: '1px solid #f0f0f0' }}>35%</td>
            <td style={{ padding: '18px', textAlign: 'center', borderBottom: '1px solid #f0f0f0' }}>₩350,000/월</td>
            <td style={{ padding: '18px', textAlign: 'center', borderBottom: '1px solid #f0f0f0' }}>1.8회/월</td>
          </tr>
          <tr>
            <td style={{ padding: '18px', textAlign: 'center', borderBottom: '1px solid #f0f0f0' }}>46-55세</td>
            <td style={{ padding: '18px', textAlign: 'center', borderBottom: '1px solid #f0f0f0' }}>20%</td>
            <td style={{ padding: '18px', textAlign: 'center', borderBottom: '1px solid #f0f0f0' }}>₩450,000/월</td>
            <td style={{ padding: '18px', textAlign: 'center', borderBottom: '1px solid #f0f0f0' }}>1.5회/월</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};

const LaunchTimelineSlide = () => {
  const chartData = {
    labels: ['Q1 2025', 'Q2 2025', 'Q3 2025', 'Q4 2025'],
    datasets: [{
      label: '분기별 매출 목표 (억원)',
      data: [8, 15, 12, 15],
      borderColor: '#8B4513',
      backgroundColor: 'rgba(139, 69, 19, 0.1)',
      tension: 0.4,
      fill: true
    }]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } }
  };

  return (
    <div className="h-full w-full bg-white flex flex-col" style={{ padding: '45px 60px 20px 60px' }}>
      <div className="absolute top-8 right-8 bg-opacity-10 text-amber-800 px-4 py-2 rounded-full text-sm font-medium" style={{ background: 'rgba(139, 69, 19, 0.1)' }}>
        6 / 8
      </div>
      
      {/* 제목 섹션 */}
      <div style={{ textAlign: 'center', marginBottom: '25px' }}>
        <h2 style={{ 
          fontFamily: 'Playfair Display, serif',
          fontSize: '48px',
          fontWeight: 700,
          color: '#8B4513',
          marginBottom: '12px'
        }}>
          출시 타임라인
        </h2>
        <p style={{ 
          fontSize: '18px',
          color: '#A0937D'
        }}>
          체계적인 단계별 런칭 전략
        </p>
      </div>

      {/* 타임라인 */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        width: '100%',
        maxWidth: '900px',
        margin: '25px auto'
      }}>
        <div style={{
          background: '#FAF7F2',
          borderRadius: '15px',
          padding: '25px 15px',
          textAlign: 'center',
          width: '180px',
          boxShadow: '0 8px 20px rgba(139, 69, 19, 0.1)'
        }}>
          <div style={{
            fontSize: '18px',
            fontWeight: 700,
            color: '#8B4513',
            marginBottom: '15px'
          }}>Q1 2025</div>
          <div style={{
            fontSize: '14px',
            color: '#A0937D',
            lineHeight: 1.6
          }}>
            <strong>소프트 런칭</strong><br />
            플래그십 스토어<br />
            온라인 선주문<br />
            <strong>목표: ₩8억</strong>
          </div>
        </div>
        <div style={{
          background: '#FAF7F2',
          borderRadius: '15px',
          padding: '25px 15px',
          textAlign: 'center',
          width: '180px',
          boxShadow: '0 8px 20px rgba(139, 69, 19, 0.1)'
        }}>
          <div style={{
            fontSize: '18px',
            fontWeight: 700,
            color: '#8B4513',
            marginBottom: '15px'
          }}>Q2 2025</div>
          <div style={{
            fontSize: '14px',
            color: '#A0937D',
            lineHeight: 1.6
          }}>
            <strong>리테일 확장</strong><br />
            백화점 입점<br />
            인플루언서 캠페인<br />
            <strong>목표: ₩15억</strong>
          </div>
        </div>
        <div style={{
          background: '#FAF7F2',
          borderRadius: '15px',
          padding: '25px 15px',
          textAlign: 'center',
          width: '180px',
          boxShadow: '0 8px 20px rgba(139, 69, 19, 0.1)'
        }}>
          <div style={{
            fontSize: '18px',
            fontWeight: 700,
            color: '#8B4513',
            marginBottom: '15px'
          }}>Q3 2025</div>
          <div style={{
            fontSize: '14px',
            color: '#A0937D',
            lineHeight: 1.6
          }}>
            <strong>글로벌 론칭</strong><br />
            아시아 5개국<br />
            디지털 마케팅<br />
            <strong>목표: ₩12억</strong>
          </div>
        </div>
        <div style={{
          background: '#FAF7F2',
          borderRadius: '15px',
          padding: '25px 15px',
          textAlign: 'center',
          width: '180px',
          boxShadow: '0 8px 20px rgba(139, 69, 19, 0.1)'
        }}>
          <div style={{
            fontSize: '18px',
            fontWeight: 700,
            color: '#8B4513',
            marginBottom: '15px'
          }}>Q4 2025</div>
          <div style={{
            fontSize: '14px',
            color: '#A0937D',
            lineHeight: 1.6
          }}>
            <strong>확장 완료</strong><br />
            유럽 진출<br />
            홀리데이 컬렉션<br />
            <strong>목표: ₩15억</strong>
          </div>
        </div>
      </div>

      {/* 차트 */}
      <div style={{ 
        width: '100%',
        maxWidth: '750px',
        height: '280px',
        background: 'white',
        borderRadius: '15px',
        padding: '20px',
        boxShadow: '0 10px 30px rgba(139, 69, 19, 0.1)',
        margin: '0 auto'
      }}>
        <Line data={chartData} options={chartOptions} />
      </div>
    </div>
  );
};

const CompetitiveAnalysisSlide = () => {
  const chartData = {
    labels: ['라프레리', '설화수', 'SK-II', '에스티로더', '랑콤', 'LUXE (목표)'],
    datasets: [{
      label: '시장점유율 (%)',
      data: [25, 20, 18, 15, 12, 15],
      backgroundColor: ['#E8D5C4', '#D4B5A0', '#C4B5A0', '#B5A097', '#A0937D', '#8B4513']
    }]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } }
  };

  return (
    <div className="h-full w-full bg-white flex flex-col" style={{ padding: '50px 60px 20px 60px' }}>
      <div className="absolute top-8 right-8 bg-opacity-10 text-amber-800 px-4 py-2 rounded-full text-sm font-medium" style={{ background: 'rgba(139, 69, 19, 0.1)' }}>
        7 / 8
      </div>
      
      {/* 제목 섹션 */}
      <div style={{ textAlign: 'center', marginBottom: '25px' }}>
        <h2 style={{ 
          fontFamily: 'Playfair Display, serif',
          fontSize: '48px',
          fontWeight: 700,
          color: '#8B4513',
          marginBottom: '20px'
        }}>
          경쟁사 분석
        </h2>
        <p style={{ 
          fontSize: '18px',
          color: '#A0937D'
        }}>
          프리미엄 스킨케어 시장 내 포지셔닝
        </p>
      </div>

      {/* 차트 */}
      <div style={{ 
        width: '100%',
        maxWidth: '800px',
        height: '400px',
        background: 'white',
        borderRadius: '15px',
        padding: '20px',
        boxShadow: '0 10px 30px rgba(139, 69, 19, 0.1)',
        margin: '0 auto 30px auto'
      }}>
        <Bar data={chartData} options={chartOptions} />
      </div>

      {/* 주요 지표 */}
      <div style={{ 
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '30px',
        maxWidth: '800px',
        margin: '0 auto'
      }}>
        <div style={{ 
          background: '#FAF7F2',
          padding: '25px',
          borderRadius: '15px',
          textAlign: 'center',
          boxShadow: '0 8px 20px rgba(139, 69, 19, 0.1)'
        }}>
          <div style={{ 
            fontSize: '32px',
            fontWeight: 700,
            color: '#8B4513',
            marginBottom: '8px'
          }}>
            15%
          </div>
          <div style={{ 
            fontSize: '14px',
            color: '#A0937D',
            textTransform: 'uppercase'
          }}>
            목표 시장점유율
          </div>
        </div>
        <div style={{ 
          background: '#FAF7F2',
          padding: '25px',
          borderRadius: '15px',
          textAlign: 'center',
          boxShadow: '0 8px 20px rgba(139, 69, 19, 0.1)'
        }}>
          <div style={{ 
            fontSize: '32px',
            fontWeight: 700,
            color: '#8B4513',
            marginBottom: '8px'
          }}>
            3위
          </div>
          <div style={{ 
            fontSize: '14px',
            color: '#A0937D',
            textTransform: 'uppercase'
          }}>
            3년차 목표 순위
          </div>
        </div>
        <div style={{ 
          background: '#FAF7F2',
          padding: '25px',
          borderRadius: '15px',
          textAlign: 'center',
          boxShadow: '0 8px 20px rgba(139, 69, 19, 0.1)'
        }}>
          <div style={{ 
            fontSize: '32px',
            fontWeight: 700,
            color: '#8B4513',
            marginBottom: '8px'
          }}>
            67%
          </div>
          <div style={{ 
            fontSize: '14px',
            color: '#A0937D',
            textTransform: 'uppercase'
          }}>
            평균 제품 마진
          </div>
        </div>
      </div>
    </div>
  );
};

const FinancialProjectionsSlide = () => {
  const chartData = {
    labels: ['1년차', '2년차', '3년차'],
    datasets: [{
      label: '매출 (억원)',
      data: [50, 120, 200],
      backgroundColor: '#8B4513'
    }, {
      label: '순이익 (억원)',
      data: [15, 48, 90],
      backgroundColor: '#A0937D'
    }]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false
  };

  return (
    <div className="h-full w-full bg-white flex flex-col" style={{ padding: '40px 60px 120px 60px' }}>
      <div className="absolute top-8 right-8 bg-opacity-10 text-amber-800 px-4 py-2 rounded-full text-sm font-medium" style={{ background: 'rgba(139, 69, 19, 0.1)' }}>
        8 / 8
      </div>
      
      {/* 제목 섹션 */}
      <div style={{ textAlign: 'center', marginBottom: '20px' }}>
        <h2 style={{ 
          fontFamily: 'Playfair Display, serif',
          fontSize: '48px',
          fontWeight: 700,
          color: '#8B4513',
          marginBottom: '12px'
        }}>
          재무 전망
        </h2>
        <p style={{ 
          fontSize: '18px',
          color: '#A0937D'
        }}>
          향후 3년간 성장 시나리오
        </p>
      </div>

      {/* 차트 */}
      <div style={{ 
        width: '100%',
        maxWidth: '750px',
        height: '400px',
        background: 'white',
        borderRadius: '15px',
        padding: '20px',
        boxShadow: '0 10px 30px rgba(139, 69, 19, 0.1)',
        margin: '0 auto 25px auto'
      }}>
        <Bar data={chartData} options={chartOptions} />
      </div>

      {/* 주요 지표 */}
      <div style={{ 
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '25px',
        maxWidth: '750px',
        margin: '0 auto'
      }}>
        <div style={{ 
          background: '#FAF7F2',
          padding: '20px',
          borderRadius: '15px',
          textAlign: 'center',
          boxShadow: '0 8px 20px rgba(139, 69, 19, 0.1)'
        }}>
          <div style={{ 
            fontSize: '28px',
            fontWeight: 700,
            color: '#8B4513',
            marginBottom: '6px'
          }}>
            ₩50억
          </div>
          <div style={{ 
            fontSize: '13px',
            color: '#A0937D',
            textTransform: 'uppercase'
          }}>
            1년차 목표
          </div>
        </div>
        <div style={{ 
          background: '#FAF7F2',
          padding: '20px',
          borderRadius: '15px',
          textAlign: 'center',
          boxShadow: '0 8px 20px rgba(139, 69, 19, 0.1)'
        }}>
          <div style={{ 
            fontSize: '28px',
            fontWeight: 700,
            color: '#8B4513',
            marginBottom: '6px'
          }}>
            ₩120억
          </div>
          <div style={{ 
            fontSize: '13px',
            color: '#A0937D',
            textTransform: 'uppercase'
          }}>
            2년차 목표
          </div>
        </div>
        <div style={{ 
          background: '#FAF7F2',
          padding: '20px',
          borderRadius: '15px',
          textAlign: 'center',
          boxShadow: '0 8px 20px rgba(139, 69, 19, 0.1)'
        }}>
          <div style={{ 
            fontSize: '28px',
            fontWeight: 700,
            color: '#8B4513',
            marginBottom: '6px'
          }}>
            ₩200억
          </div>
          <div style={{ 
            fontSize: '13px',
            color: '#A0937D',
            textTransform: 'uppercase'
          }}>
            3년차 목표
          </div>
        </div>
      </div>
    </div>
  );
};

const PPTInterpretation = () => {
  const navigate = useNavigate();
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isFirstPlay, setIsFirstPlay] = useState(true); // 새로운 상태 추가
  const [isRecording, setIsRecording] = useState(false);
  const [recordedText, setRecordedText] = useState('');
  const [showKoreanScript, setShowKoreanScript] = useState(false);
  const [showKeyPoints, setShowKeyPoints] = useState(false);
  const [showComparison, setShowComparison] = useState(false);
  const [recordedAudioBlob, setRecordedAudioBlob] = useState<Blob | null>(null);
  const [isPlayingUserAudio, setIsPlayingUserAudio] = useState(false);
  const [isPlayingModelAudio, setIsPlayingModelAudio] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<any>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [playMode, setPlayMode] = useState<'current' | 'all'>('current');
  const audioRef = useRef<HTMLAudioElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const userAudioRef = useRef<HTMLAudioElement>(null);
  const modelAudioRef = useRef<HTMLAudioElement>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  const slides = [
    TitleSlide,
    BrandPositioningSlide,
    MarketAnalysisSlide,
    ProductPortfolioSlide,
    TargetDemographicsSlide,
    LaunchTimelineSlide,
    CompetitiveAnalysisSlide,
    FinancialProjectionsSlide
  ];

  const CurrentSlideComponent = slides[currentSlide];
  const currentSlideData = luxePresentationData.slides[currentSlide];

  // 음성 인식 설정
  useEffect(() => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = 'ko-KR';

      recognitionRef.current.onresult = (event: any) => {
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          }
        }
        if (finalTranscript) {
          setRecordedText(prev => prev + finalTranscript + ' ');
        }
      };
    }
  }, []);

  // 오디오 설정
  useEffect(() => {
    if (audioRef.current) {
      const audio = audioRef.current;
      audio.src = audioFile; // 오디오 파일 경로 설정
      
      const updateTime = () => setCurrentTime(audio.currentTime);
      const updateDuration = () => setDuration(audio.duration);
      const handleEnd = () => setIsPlaying(false);
      
      audio.addEventListener('timeupdate', updateTime);
      audio.addEventListener('loadedmetadata', updateDuration);
      audio.addEventListener('ended', handleEnd);
      
      return () => {
        audio.removeEventListener('timeupdate', updateTime);
        audio.removeEventListener('loadedmetadata', updateDuration);
        audio.removeEventListener('ended', handleEnd);
      };
    }
  }, []);

  // 키보드 네비게이션
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') handlePrevSlide();
      if (event.key === 'ArrowRight') handleNextSlide();
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [currentSlide]);

  // 슬라이드 변경 시 isFirstPlay 초기화
  const handlePrevSlide = () => {
    if (currentSlide > 0) {
      setCurrentSlide(currentSlide - 1);
      setIsFirstPlay(true);
    }
  };

  const handleNextSlide = () => {
    if (currentSlide < slides.length - 1) {
      setCurrentSlide(currentSlide + 1);
      setIsFirstPlay(true);
    }
  };

  // 오디오 재생/정지
  const toggleAudio = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
      } else {
        audioRef.current.play();
        setIsPlaying(true);
      }
    }
  };

  // 오디오 재생 함수 수정
  const playAudio = (mode: 'current' | 'all') => {
    if (audioRef.current) {
      const audio = audioRef.current;
      
      // 이미 재생 중이고 같은 모드면 정지
      if (isPlaying && playMode === mode) {
        audio.pause();
        setIsPlaying(false);
        return;
      }
      
      // 다른 모드로 변경하거나 처음 재생할 때
      if (mode === 'current' && (isFirstPlay || playMode !== mode)) {
        // 처음 재생이거나 모드가 바뀔 때만 시작 시간으로 이동
        audio.currentTime = currentSlideData.audioStartTime;
        setIsFirstPlay(false);
      }
      
      // 현재 슬라이드의 종료 시간에 정지하도록 이벤트 리스너 설정
      const stopAtEnd = () => {
        if (mode === 'current' && audio.currentTime >= currentSlideData.audioEndTime) {
          audio.pause();
          setIsPlaying(false);
          setIsFirstPlay(true); // 구간이 끝나면 다시 처음 재생 상태로 초기화
          audio.removeEventListener('timeupdate', stopAtEnd);
        }
      };
      
      if (mode === 'current') {
        audio.addEventListener('timeupdate', stopAtEnd);
      }
      
      audio.play();
      setIsPlaying(true);
      setPlayMode(mode);
    }
  };

  // 시간 포맷팅
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // 녹음 시작/중지
  const toggleRecording = async () => {
    if (!isRecording) {
      try {
        // 1. 마이크 권한 요청 및 스트림 얻기
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
        
        // 2. MediaRecorder 설정
        const mediaRecorder = new MediaRecorder(stream);
        mediaRecorderRef.current = mediaRecorder;
        recordedChunksRef.current = []; // 초기화
        
        // 오디오 데이터 수집
        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            recordedChunksRef.current.push(event.data);
          }
        };

        // 녹음 완료 시 처리
        mediaRecorder.onstop = () => {
          const audioBlob = new Blob(recordedChunksRef.current, { type: 'audio/wav' });
          setRecordedAudioBlob(audioBlob);
          setShowComparison(true); // 비교 UI 표시
        };
        
        // 3. 음성 인식 설정 및 시작 - 중국어로 변경
        if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
          const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
          recognitionRef.current = new SpeechRecognition();
          recognitionRef.current.continuous = true;
          recognitionRef.current.interimResults = true;
          recognitionRef.current.lang = 'zh-CN'; // 중국어로 변경

          recognitionRef.current.onresult = (event: any) => {
            let finalTranscript = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
              if (event.results[i].isFinal) {
                finalTranscript += event.results[i][0].transcript;
              }
            }
            if (finalTranscript) {
              setRecordedText(prev => prev + finalTranscript + ' ');
            }
          };

          recognitionRef.current.start();
        }

        // 4. 녹음 시작
        mediaRecorder.start();
        setIsRecording(true);
      } catch (error) {
        console.error('녹음 시작 실패:', error);
        alert('마이크 접근 권한이 필요합니다.');
      }
    } else {
      // 녹음 중지
      if (mediaRecorderRef.current) {
        mediaRecorderRef.current.stop();
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setIsRecording(false);
    }
  };

  // TTS로 모범 통역 음성 생성/일시정지
  const toggleModelInterpretation = () => {
    if ('speechSynthesis' in window) {
      if (isPlayingModelAudio) {
        // 일시정지
        speechSynthesis.pause();
        setIsPlayingModelAudio(false);
      } else {
        if (speechSynthesis.paused) {
          // 재개
          speechSynthesis.resume();
          setIsPlayingModelAudio(true);
        } else {
          // 새로 시작
          speechSynthesis.cancel();
          
          const utterance = new SpeechSynthesisUtterance(currentSlideData.interpretation);
          utterance.lang = 'zh-CN'; // 중국어 설정
          utterance.rate = 0.9; // 약간 느리게
          utterance.pitch = 1.0;
          
          utterance.onstart = () => setIsPlayingModelAudio(true);
          utterance.onend = () => setIsPlayingModelAudio(false);
          utterance.onerror = () => setIsPlayingModelAudio(false);
          
          speechSynthesis.speak(utterance);
        }
      }
    }
  };

  // 사용자 녹음 음성 재생/일시정지
  const toggleUserRecording = () => {
    if (recordedAudioBlob && userAudioRef.current) {
      if (isPlayingUserAudio) {
        // 일시정지
        userAudioRef.current.pause();
        setIsPlayingUserAudio(false);
      } else {
        if (userAudioRef.current.src && !userAudioRef.current.ended) {
          // 재개
          userAudioRef.current.play();
          setIsPlayingUserAudio(true);
        } else {
          // 새로 시작
          const audioUrl = URL.createObjectURL(recordedAudioBlob);
          userAudioRef.current.src = audioUrl;
          userAudioRef.current.play();
          setIsPlayingUserAudio(true);
          
          userAudioRef.current.onended = () => {
            setIsPlayingUserAudio(false);
            URL.revokeObjectURL(audioUrl);
          };
          
          userAudioRef.current.onpause = () => {
            if (!userAudioRef.current?.ended) {
              setIsPlayingUserAudio(false);
            }
          };
        }
      }
    }
  };

  // AI 분석 요청
  const analyzeInterpretation = async () => {
    if (!recordedText.trim()) return;
    
    setAnalysisLoading(true);
    try {
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
      
      const analysisPrompt = `당신은 중국어 통역 전문가입니다. 간단하고 실용적인 평가를 해주세요.

[원문 한국어]
${currentSlideData.koreanScript}

[모범 통역]
${currentSlideData.interpretation}

[사용자 통역 (음성인식 결과)]
${recordedText}

중국어 음성인식의 특성을 고려하여 평가해주세요:
- 성조 차이로 인한 오인식 가능성 (重要→中药, 公司→工厂, 会议→回忆, 市场→时常 등)
- 사용자가 실제 의도했을 올바른 표현 추정
- PPT 통역 상황에 적합한 평가

JSON 형식으로 응답:
{
  "scores": {
    "strengths": 85,
    "improvements": 70,
    "pronunciation": 80
  },
  "feedback": {
    "strengths": ["구체적인 좋은 점1", "구체적인 좋은 점2"],
    "improvements": ["구체적인 아쉬운 점1", "구체적인 아쉬운 점2"],
    "pronunciation": ["발음 문제1: 인식된단어 → 의도된단어 (성조설명)", "발음 문제2"]
  }
}

점수는 0-100점 사이로 주세요.`;

      const data = { contents: [{ parts: [{ text: analysisPrompt }] }] };
      const response = await axios.post(url, data, { 
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000
      });
      
      const text = response.data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const jsonStart = text.indexOf('{');
      const jsonEnd = text.lastIndexOf('}');
      
      if (jsonStart === -1 || jsonEnd === -1) {
        throw new Error('AI 응답 형식이 올바르지 않습니다.');
      }
      
      const analysis = JSON.parse(text.substring(jsonStart, jsonEnd + 1));
      setAiAnalysis(analysis);
    } catch (error) {
      console.error('AI 분석 실패:', error);
      // 오류 시 기본 분석 제공
      setAiAnalysis({
        scores: { strengths: 75, improvements: 70, pronunciation: 80 },
        feedback: {
          strengths: ["전체적인 문맥 파악이 좋았습니다", "핵심 내용 전달이 정확했습니다"],
          improvements: ["일부 표현을 더 자연스럽게 할 수 있습니다", "문장 연결을 부드럽게 해보세요"],
          pronunciation: ["음성 인식 정확도를 높이기 위해 명확한 발음을 연습해보세요"]
        }
      });
    } finally {
      setAnalysisLoading(false);
    }
  };

  // 모든 기록 지우기
  const clearAllRecords = () => {
    setRecordedText('');
    setRecordedAudioBlob(null);
    setShowComparison(false);
    setAiAnalysis(null);
    if (userAudioRef.current) {
      userAudioRef.current.src = '';
    }
    speechSynthesis.cancel(); // TTS 중지
  };

  // 컴포넌트 언마운트 시 정리
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      speechSynthesis.cancel();
    };
  }, []);

  return (
    <div className="flex h-screen max-h-screen overflow-hidden">
      {/* 슬라이드 미리보기 패널 - 크기 조정 */}
      <div className="w-[15%] bg-gray-100 border-r border-gray-300 flex flex-col overflow-hidden">
        <div className="p-2 border-b border-gray-300 bg-gray-50">
          <h3 className="text-sm font-semibold text-gray-700">슬라이드</h3>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-2">
          {slides.map((SlideComponent, index) => (
            <div
              key={index}
              onClick={() => setCurrentSlide(index)}
              className={`relative cursor-pointer transition-all duration-200 border-2 rounded-lg overflow-hidden ${
                currentSlide === index
                  ? 'border-blue-500 shadow-md scale-105'
                  : 'border-gray-300 hover:border-gray-400 hover:shadow-sm'
              }`}
              style={{ aspectRatio: '16/9' }}
            >
              <div className="absolute top-1 left-1 bg-black bg-opacity-60 text-white text-xs px-1.5 py-0.5 rounded z-10">
                {index + 1}
              </div>
              <div 
                className="w-full h-full transform scale-[0.2] origin-top-left pointer-events-none"
                style={{ 
                  width: '500%', 
                  height: '500%',
                  transformOrigin: '0 0'
                }}
              >
                <SlideComponent />
              </div>
              {currentSlide === index && (
                <div className="absolute inset-0 bg-blue-500 bg-opacity-10 pointer-events-none" />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* PPT 메인 영역 - 크기 조정 */}
      <div className="w-[55%] relative bg-white overflow-hidden">
        <div className="w-full h-full flex items-center justify-center">
          <div className="w-full max-w-[90%] aspect-[16/9]">
            <CurrentSlideComponent />
          </div>
        </div>
        
        {/* PPT 네비게이션 */}
        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-white bg-opacity-95 px-4 py-3 rounded-xl shadow-lg z-10">
          <div className="flex gap-3">
            <button
              onClick={handlePrevSlide}
              disabled={currentSlide === 0}
              className={`px-4 py-2 rounded-lg text-sm ${
                currentSlide === 0 
                ? 'bg-gray-200 text-gray-500 cursor-not-allowed' 
                : 'bg-[#8B4513] text-white hover:bg-[#6d3610]'
              }`}
            >
              이전
            </button>
            <button
              onClick={handleNextSlide}
              disabled={currentSlide === slides.length - 1}
              className={`px-4 py-2 rounded-lg text-sm ${
                currentSlide === slides.length - 1
                ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                : 'bg-[#8B4513] text-white hover:bg-[#6d3610]'
              }`}
            >
              다음
            </button>
          </div>
        </div>
      </div>

      {/* 통역 패널 - 크기 조정 */}
      <div className="w-[30%] bg-white border-l border-gray-200 flex flex-col overflow-hidden">
        {/* 헤더 */}
        <div className="p-6 border-b border-gray-200 bg-gray-50">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">통역 연습 패널</h2>
              <p className="text-base text-gray-600 mt-2">슬라이드 {currentSlide + 1} / {slides.length}</p>
            </div>
            <button
              onClick={() => navigate('/')}
              className="px-4 py-2 bg-white hover:bg-gray-100 text-gray-800 rounded-lg shadow-md transition-colors duration-200 flex items-center space-x-2"
            >
              <span>🏠</span>
              <span>홈으로</span>
            </button>
          </div>
        </div>

        {/* 오디오 플레이어 */}
        <div className="p-6 border-b border-gray-200 bg-blue-50">
          <h3 className="text-base font-medium text-blue-800 mb-4">🎵 프레젠테이션 오디오</h3>
          
          <audio 
            ref={audioRef} 
            src="/src/assets/luxe-ppt-audio.mp3" 
            preload="metadata"
          />
          
          {/* 숨겨진 오디오 엘리먼트들 */}
          <audio ref={userAudioRef} style={{ display: 'none' }} />
          <audio ref={modelAudioRef} style={{ display: 'none' }} />
          
          <div className="space-y-4">
            {/* 재생 버튼들 */}
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => playAudio('current')}
                className={`py-3 px-4 rounded-lg font-medium transition-colors ${
                  isPlaying && playMode === 'current'
                    ? 'bg-red-500 hover:bg-red-600 text-white'
                    : 'bg-blue-500 hover:bg-blue-600 text-white'
                }`}
              >
                {isPlaying && playMode === 'current' ? '⏸️ 정지' : '▶️ 현재 페이지'}
              </button>
              <button
                onClick={() => playAudio('all')}
                className={`py-3 px-4 rounded-lg font-medium transition-colors ${
                  isPlaying && playMode === 'all'
                    ? 'bg-red-500 hover:bg-red-600 text-white'
                    : 'bg-blue-500 hover:bg-blue-600 text-white'
                }`}
              >
                {isPlaying && playMode === 'all' ? '⏸️ 정지' : '▶️ 전체 듣기'}
              </button>
            </div>
            
            {/* 진행 바 */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-gray-600">
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(duration)}</span>
              </div>
              <div className="relative">
                <div className="w-full h-2 bg-gray-200 rounded-full">
                  <div 
                    className="h-2 bg-blue-500 rounded-full"
                    style={{ width: `${(currentTime / duration) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 스크립트 영역 */}
        <div className="flex-1 p-4 overflow-y-auto">
          {/* 한국어 스크립트 */}
          <div className="mb-4">
            <button
              onClick={() => setShowKoreanScript(!showKoreanScript)}
              className="w-full text-left p-3 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 transition-colors"
            >
              <div className="flex justify-between items-center">
                <span className="font-medium text-green-800">한국어 스크립트 보기</span>
                <span className="text-green-600">{showKoreanScript ? '▼' : '▶'}</span>
              </div>
            </button>
            
            {showKoreanScript && (
              <div className="mt-2 p-3 bg-green-50 border rounded-lg">
                <p className="text-sm text-green-800 leading-relaxed">
                  {currentSlideData.koreanScript}
                </p>
              </div>
            )}
          </div>

          {/* 키포인트 */}
          <div className="mb-4">
            <button
              onClick={() => setShowKeyPoints(!showKeyPoints)}
              className="w-full text-left p-3 bg-yellow-50 border border-yellow-200 rounded-lg hover:bg-yellow-100 transition-colors"
            >
              <div className="flex justify-between items-center">
                <span className="font-medium text-yellow-800">주요 포인트 보기</span>
                <span className="text-yellow-600">{showKeyPoints ? '▼' : '▶'}</span>
              </div>
            </button>
            
            {showKeyPoints && (
              <div className="mt-2 p-3 bg-yellow-50 border rounded-lg">
                <ul className="list-disc pl-4 space-y-1">
                  {currentSlideData.keyPoints.map((point: string, index: number) => (
                    <li key={index} className="text-sm text-yellow-700">{point}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>



          {/* 통역 시작 버튼 - 새로운 위치와 디자인 */}
          <div className="mb-4 text-center">
            <div className="mb-2">
              <span className="text-4xl cursor-pointer" onClick={toggleRecording}>
                {isRecording ? '🔴' : '🎤'}
              </span>
            </div>
            <button
              onClick={toggleRecording}
              className={`px-6 py-2 rounded-full font-medium text-sm transition-all duration-200 ${
                isRecording
                  ? 'bg-red-100 text-red-600 hover:bg-red-200'
                  : 'bg-green-100 text-green-600 hover:bg-green-200'
              }`}
            >
              {isRecording ? '통역 중지' : '통역 시작'}
            </button>
          </div>

          {/* 통역 기록 */}
          {!showComparison ? (
            <div className="mb-4">
              <div className="min-h-32 p-3 bg-gray-50 border rounded-lg">
                {recordedText ? (
                  <p className="text-sm text-gray-800">{recordedText}</p>
                ) : (
                  <p className="text-sm text-gray-500 italic">통역을 시작하려면 마이크를 눌러주세요</p>
                )}
              </div>
              {recordedText && (
                <button
                  onClick={clearAllRecords}
                  className="mt-2 w-full py-2 px-4 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg transition-colors text-sm"
                >
                  🗑️ 기록 지우기
                </button>
              )}
            </div>
          ) : (
            /* 비교 모드 UI */
            <div className="mb-4 space-y-4">
              {/* 사용자 통역 카드 */}
              <div className="border rounded-lg overflow-hidden">
                <div className="bg-blue-50 p-3 border-b">
                  <div className="flex justify-between items-center">
                    <h4 className="font-medium text-blue-800">내 통역</h4>
                    <button
                      onClick={toggleUserRecording}
                      disabled={!recordedAudioBlob}
                      className={`px-3 py-1 rounded text-xs ${
                        isPlayingUserAudio
                          ? 'bg-red-100 text-red-600 hover:bg-red-200'
                          : 'bg-blue-100 text-blue-600 hover:bg-blue-200'
                      }`}
                    >
                      {isPlayingUserAudio ? '⏸️ 일시정지' : '🔊 듣기'}
                    </button>
                  </div>
                </div>
                <div className="p-3 bg-white">
                  <p className="text-sm text-gray-800 leading-relaxed">
                    {recordedText || '음성 인식 결과가 없습니다.'}
                  </p>
                </div>
              </div>

              {/* 모범 통역 카드 */}
              <div className="border rounded-lg overflow-hidden">
                <div className="bg-green-50 p-3 border-b">
                  <div className="flex justify-between items-center">
                    <h4 className="font-medium text-green-800">모범 통역</h4>
                    <button
                      onClick={toggleModelInterpretation}
                      className={`px-3 py-1 rounded text-xs ${
                        isPlayingModelAudio
                          ? 'bg-red-100 text-red-600 hover:bg-red-200'
                          : 'bg-green-100 text-green-600 hover:bg-green-200'
                      }`}
                    >
                      {isPlayingModelAudio ? '⏸️ 일시정지' : '🔊 듣기'}
                    </button>
                  </div>
                </div>
                <div className="p-3 bg-white">
                  <p className="text-sm text-gray-800 leading-relaxed">
                    {currentSlideData.interpretation}
                  </p>
                </div>
              </div>

              {/* AI 분석 버튼 */}
              {!aiAnalysis && (
                <button
                  onClick={analyzeInterpretation}
                  disabled={analysisLoading || !recordedText.trim()}
                  className={`w-full py-3 px-4 rounded-lg font-medium text-sm transition-colors mb-3 ${
                    analysisLoading
                      ? 'bg-gray-100 text-gray-400'
                      : 'bg-purple-500 hover:bg-purple-600 text-white'
                  }`}
                >
                  {analysisLoading ? '⏳ 분석중...' : '🤖 AI 분석하기'}
                </button>
              )}

              {/* AI 분석 결과 */}
              {aiAnalysis && (
                <div className="border rounded-lg overflow-hidden mb-3">
                  <div className="bg-purple-50 p-3 border-b">
                    <h4 className="font-medium text-purple-800">AI 분석 결과</h4>
                  </div>
                  <div className="p-4 bg-white space-y-4">
                    {/* 1) 좋은 점 */}
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-sm font-medium text-gray-700">1) 좋은 점</span>
                        <span className="text-sm text-gray-500">{aiAnalysis.scores.strengths}/100</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                        <div 
                          className="bg-green-500 h-2 rounded-full transition-all duration-500"
                          style={{ width: `${aiAnalysis.scores.strengths}%` }}
                        />
                      </div>
                      <ul className="text-sm text-gray-600 space-y-1">
                        {aiAnalysis.feedback.strengths.map((item: string, idx: number) => (
                          <li key={idx}>• {item}</li>
                        ))}
                      </ul>
                    </div>

                    {/* 2) 아쉬운 점 */}
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-sm font-medium text-gray-700">2) 아쉬운 점</span>
                        <span className="text-sm text-gray-500">{aiAnalysis.scores.improvements}/100</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                        <div 
                          className="bg-orange-500 h-2 rounded-full transition-all duration-500"
                          style={{ width: `${aiAnalysis.scores.improvements}%` }}
                        />
                      </div>
                      <ul className="text-sm text-gray-600 space-y-1">
                        {aiAnalysis.feedback.improvements.map((item: string, idx: number) => (
                          <li key={idx}>• {item}</li>
                        ))}
                      </ul>
                    </div>

                    {/* 3) 발음 */}
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-sm font-medium text-gray-700">3) 발음</span>
                        <span className="text-sm text-gray-500">{aiAnalysis.scores.pronunciation}/100</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                        <div 
                          className="bg-blue-500 h-2 rounded-full transition-all duration-500"
                          style={{ width: `${aiAnalysis.scores.pronunciation}%` }}
                        />
                      </div>
                      <ul className="text-sm text-gray-600 space-y-1">
                        {aiAnalysis.feedback.pronunciation.map((item: string, idx: number) => (
                          <li key={idx}>• {item}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              {/* 초기화 버튼 */}
              <button
                onClick={clearAllRecords}
                className="w-full py-2 px-4 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg transition-colors text-sm"
              >
                🗑️ 새로 시작하기
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PPTInterpretation; 