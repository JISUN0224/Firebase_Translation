import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db, auth } from '../../firebase';
import ChatbotWidget from '../../ChatbotWidget';
import { saveStudySession } from '../Analysis/studyDataUtils';

// YouTube iframe CSS 전역 스타일 추가
const injectYouTubeCSS = () => {
  const style = document.createElement('style');
  style.textContent = `
    #youtube-player iframe {
      width: 100% !important;
      height: 100% !important;
      position: absolute !important;
      top: 0 !important;
      left: 0 !important;
      object-fit: cover !important;
    }
  `;
  document.head.appendChild(style);
};

// YouTube API 타입 정의
declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

// 타입 정의
interface VocabularyQuiz {
  quiz_type: string;
  text_cn: string;
  tokens: string[];
}

interface Vocabulary {
  word: string;
  meaning: string;
  pinyin: string;
  example: string;
  quiz?: VocabularyQuiz;
}

interface SubtitleItem {
  id: string;
  line: number;
  start_time: string;
  end_time: string;
  text_cn: string;
  text_kr: string;
  vocabulary?: Vocabulary[];
  userTranslation?: string;
  completed?: boolean;
}

const SubtitleTranslation: React.FC = () => {
  const [subtitles, setSubtitles] = useState<SubtitleItem[]>([]);
  const [currentSubtitleIndex, setCurrentSubtitleIndex] = useState(0);
  const [displaySubtitleIndex, setDisplaySubtitleIndex] = useState<number | null>(null); // 화면에 표시될 자막 인덱스
  const [userTranslation, setUserTranslation] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isLearningMode, setIsLearningMode] = useState(true);
  const [showHint, setShowHint] = useState(false);
  const [isLooping, setIsLooping] = useState(false);
  const [loopStartTime, setLoopStartTime] = useState(0);
  const [loopEndTime, setLoopEndTime] = useState(0);
  const [loopInterval, setLoopInterval] = useState<NodeJS.Timeout | null>(null); // 반복 인터벌 추가
  const [player, setPlayer] = useState<any>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0); // 현재 재생 시간 추가
  const [syncOffset, setSyncOffset] = useState(4.7); // 싱크 오프셋 추가 (기존 웹앱과 동일)
  const [showChineseText, setShowChineseText] = useState(true); // 중국어 표시 옵션
  const [liveTranslation, setLiveTranslation] = useState(''); // 실시간 번역 미리보기
  const [showKoreanAnswer, setShowKoreanAnswer] = useState(false); // 한국어 정답 표시 옵션
  const [characterCount, setCharacterCount] = useState(0); // 글자 수 카운터 추가
  const [showShortcuts, setShowShortcuts] = useState(false); // 단축키 도움말 표시 상태
  const [playbackRate, setPlaybackRate] = useState(1); // 재생 속도 상태 추가

  // YouTube iframe API 로드 및 플레이어 초기화
  useEffect(() => {
    console.log('현재 URL:', window.location.origin);
    console.log('YouTube API 초기화 시작');
    
    // CSS 주입
    injectYouTubeCSS();
    
    const initializeYouTubePlayer = () => {
      console.log('YouTube Player 초기화 시도...');
      console.log('window.YT:', window.YT);
      
      if (window.YT && window.YT.Player) {
        try {
          const newPlayer = new window.YT.Player('youtube-player', {
            height: '100%',
            width: '100%',
            videoId: 'K9LGQu3QnpU', // 실제 비디오 ID로 교체하세요
            playerVars: {
              autoplay: 0,
              controls: 1,
              modestbranding: 1,
              rel: 0,
              iv_load_policy: 3,
              cc_load_policy: 0, // YouTube 기본 자막 끄기
              origin: window.location.origin,
              enablejsapi: 1, // JS API 활성화
              fs: 0, // 전체화면 비활성화
              disablekb: 1 // 키보드 비활성화
            },
            events: {
              onReady: (event: any) => {
                console.log('YouTube player ready!', event.target);
                setPlayer(event.target);
                
                // 플레이어 로드 후 iframe 크기 강제 조정
                setTimeout(() => {
                  const iframe = document.querySelector('#youtube-player iframe') as HTMLElement;
                  if (iframe) {
                    iframe.style.setProperty('width', '100%', 'important');
                    iframe.style.setProperty('height', '100%', 'important');
                    iframe.style.setProperty('position', 'absolute', 'important');
                    iframe.style.setProperty('top', '0', 'important');
                    iframe.style.setProperty('left', '0', 'important');
                  }
                  
                  // 플레이어 준비 후 초기 자막 동기화 시도
                  if (subtitles.length > 0) {
                    try {
                      const time = event.target.getCurrentTime();
                      const syncedTime = time + syncOffset;
                      const foundIndex = getCurrentDisplaySubtitleIndex(syncedTime);
                      setDisplaySubtitleIndex(foundIndex);
                      if (foundIndex !== null) {
                        setCurrentSubtitleIndex(foundIndex);
                      }
                    } catch (err) {
                      console.log('초기 동기화 오류:', err);
                    }
                  }
                }, 500);
              },
              onStateChange: (event: any) => {
                console.log('Player state changed:', event.data);
                setIsPlaying(event.data === window.YT.PlayerState.PLAYING);
                
                // 상태 변경 시에도 시간 체크 및 자막 동기화
                setTimeout(() => {
                  try {
                    const time = event.target.getCurrentTime();
                    const syncedTime = time + syncOffset;
                    setCurrentTime(syncedTime);
                    const foundIndex = getCurrentDisplaySubtitleIndex(syncedTime);
                    setDisplaySubtitleIndex(foundIndex);
                    if (foundIndex !== null) {
                      setCurrentSubtitleIndex(foundIndex);
                    }
                  } catch (error) {
                    console.error('상태 변경 시 자막 동기화 오류:', error);
                  }
                }, 100);
                
                // 영상 종료 시 반복 재생 (기존 웹앱 방식)
                if (event.data === window.YT.PlayerState.ENDED && isLooping) {
                  console.log('영상 종료 - 구간반복 중이므로 다시 재생');
                  setTimeout(() => {
                    event.target.seekTo(loopStartTime, true);
                    event.target.playVideo();
                  }, 100);
                }
              },
              onError: (event: any) => {
                console.error('YouTube player error:', event.data);
                // 에러 코드 설명
                const errorMessages: { [key: number]: string } = {
                  2: '비디오 ID가 잘못되었습니다.',
                  5: 'HTML5 플레이어 오류입니다.',
                  100: '비디오를 찾을 수 없습니다.',
                  101: '비디오 소유자가 임베드를 허용하지 않습니다.',
                  150: '비디오 소유자가 임베드를 허용하지 않습니다.'
                };
                alert(`YouTube 에러: ${errorMessages[event.data] || '알 수 없는 오류'} (코드: ${event.data})`);
              }
            }
          });
          console.log('YouTube Player 생성 완료');
        } catch (error) {
          console.error('YouTube Player 생성 실패:', error);
        }
      } else {
        console.log('YouTube API가 아직 준비되지 않았습니다.');
      }
    };

    // YouTube API 스크립트 로드
    const loadYouTubeAPI = () => {
      if (!window.YT) {
        console.log('YouTube API 스크립트 로드 중...');
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        tag.async = true;
        document.head.appendChild(tag);
        
        // API 로드 완료 콜백
        window.onYouTubeIframeAPIReady = () => {
          console.log('YouTube API 로드 완료!');
          setTimeout(initializeYouTubePlayer, 200); // 약간의 지연으로 안정성 확보
        };
      } else {
        console.log('YouTube API가 이미 로드되어 있습니다.');
        initializeYouTubePlayer();
      }
    };

    // DOM이 완전히 준비된 후 실행
    const timer = setTimeout(() => {
      console.log('DOM 준비 완료, YouTube API 로드 시작');
      const playerElement = document.getElementById('youtube-player');
      console.log('Player element found:', playerElement);
      loadYouTubeAPI();
    }, 1000); // 1초로 지연 증가
    
    return () => {
      clearTimeout(timer);
      if (player && player.destroy) {
        console.log('YouTube Player 정리 중...');
        player.destroy();
      }
    };
  }, []);

  // Firebase에서 movieSubtitles 데이터 가져오기 (최적화된 버전)
  useEffect(() => {
    const fetchSubtitles = async () => {
      try {
        setLoading(true);
        const subtitlesRef = collection(db, 'movieSubtitles');
        const q = query(subtitlesRef, orderBy('line', 'asc'));
        const querySnapshot = await getDocs(q);
        
        const subtitleData: SubtitleItem[] = [];
        let processedCount = 0;
        
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          
          // 첫 번째 자막만 로그로 확인
          if (processedCount === 0) {
            console.log('첫 번째 자막 데이터:', data);
          }
          
          subtitleData.push({
            id: doc.id,
            line: data.line || processedCount,
            start_time: data.start_time || '',
            end_time: data.end_time || '',
            text_cn: data.text_cn || '',
            text_kr: data.text_kr || '',
            vocabulary: data.vocabulary || [],
            userTranslation: '',
            completed: false
          });
          
          processedCount++;
        });
        
        console.log(`총 ${subtitleData.length}개 자막 로드 완료`);
        console.log('자막 샘플:', subtitleData.slice(0, 3));
        
        setSubtitles(subtitleData);
        setLoading(false);
      } catch (err) {
        console.error('Error fetching subtitles:', err);
        setError('자막 데이터를 불러오는데 실패했습니다.');
        setLoading(false);
      }
    };

    fetchSubtitles();
  }, []);

  // 자막 데이터 로드 후 초기 동기화
  useEffect(() => {
    if (player && subtitles.length > 0) {
      try {
        const time = player.getCurrentTime();
        const syncedTime = time + syncOffset;
        const foundIndex = getCurrentDisplaySubtitleIndex(syncedTime);
        setDisplaySubtitleIndex(foundIndex);
        if (foundIndex !== null) {
          setCurrentSubtitleIndex(foundIndex);
        }
      } catch (error) {
        console.error('초기 자막 동기화 오류:', error);
      }
    }
  }, [player, subtitles]);

  // 현재 자막 변경시 사용자 번역 및 실시간 미리보기 초기화
  useEffect(() => {
    if (subtitles[currentSubtitleIndex]) {
      const currentTranslation = subtitles[currentSubtitleIndex].userTranslation || '';
      setUserTranslation(currentTranslation);
      setLiveTranslation(currentTranslation); // 실시간 미리보기도 동기화
      setCharacterCount(currentTranslation.length); // 글자 수 업데이트
      setShowHint(false);
    }
  }, [currentSubtitleIndex, subtitles]);

  // 영상 시간 업데이트 및 자막 동기화 (기존 웹앱과 동일한 방식)
  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (player && subtitles.length > 0) {
      interval = setInterval(() => {
        try {
          // 실제 영상 시간 (싱크 오프셋 적용하지 않음)
          const actualVideoTime = player.getCurrentTime();
          
          // 자막 동기화용 시간 (싱크 오프셋 적용)
          const syncedTime = actualVideoTime + syncOffset;
          setCurrentTime(syncedTime);

          // 화면 표시용 자막 인덱스 업데이트 (end_time 지나면 null로 설정)
          const displayIndex = getCurrentDisplaySubtitleIndex(syncedTime);
          if (displayIndex !== displaySubtitleIndex) {
            setDisplaySubtitleIndex(displayIndex);
            if (displayIndex !== null) {
              console.log(`자막 표시 변경: ${displaySubtitleIndex} -> ${displayIndex}, 시간: ${syncedTime.toFixed(2)}초`);
            } else {
              console.log(`자막 숨김: 시간 ${syncedTime.toFixed(2)}초`);
            }
          }
          
          // 편집용 현재 자막 인덱스 업데이트 (유효한 자막이 있을 때만)
          if (displayIndex !== null && displayIndex !== currentSubtitleIndex) {
            console.log(`편집 자막 변경: ${currentSubtitleIndex} -> ${displayIndex}, 시간: ${syncedTime.toFixed(2)}초`);
            setCurrentSubtitleIndex(displayIndex);
          }
        } catch (error) {
          console.error('시간 업데이트 오류:', error);
        }
      }, 100); // 기존 웹앱과 동일한 100ms
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [player, subtitles.length, currentSubtitleIndex, displaySubtitleIndex, syncOffset]);

  // 컴포넌트 언마운트 시 인터벌 정리
  useEffect(() => {
    return () => {
      if (loopInterval) {
        clearInterval(loopInterval);
      }
    };
  }, [loopInterval]);

  // 키보드 단축키 핸들러
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Textarea에 포커스가 있을 때는 단축키 비활성화 (텍스트 입력 우선)
      const activeElement = document.activeElement;
      if (activeElement && (activeElement.tagName === 'TEXTAREA' || activeElement.tagName === 'INPUT')) {
        // Escape 키만 예외적으로 처리 (포커스 해제)
        if (e.key === 'Escape') {
          (activeElement as HTMLElement).blur();
        }
        return;
      }

      // 단축키 처리
      switch (e.key) {
        case ' ': // 스페이스바 - 재생/일시정지
          e.preventDefault();
          togglePlayPause();
          break;
        case 'ArrowLeft': // 왼쪽 화살표 - 이전 자막
          e.preventDefault();
          goToPrevious();
          break;
        case 'ArrowRight': // 오른쪽 화살표 - 다음 자막
          e.preventDefault();
          goToNext();
          break;
        case 'r': // R키 - 구간반복
        case 'R':
          e.preventDefault();
          handleLoopCurrentSection();
          break;
        case 'h': // H키 - 힌트 토글
        case 'H':
          e.preventDefault();
          handleShowHint();
          break;
        case 'k': // K키 - 한국어 정답 토글
        case 'K':
          e.preventDefault();
          setShowKoreanAnswer(!showKoreanAnswer);
          break;
        case 'Enter': // 엔터키 - 번역 제출
          if (e.ctrlKey || e.metaKey) { // Ctrl+Enter 또는 Cmd+Enter
            e.preventDefault();
            handleSubmitTranslation();
          }
          break;
        case 'f': // F키 - 번역 입력창에 포커스
        case 'F':
          e.preventDefault();
          const textarea = document.querySelector('textarea') as HTMLTextAreaElement;
          if (textarea) {
            textarea.focus();
          }
          break;
        case '?': // ?키 - 단축키 도움말 토글
          e.preventDefault();
          setShowShortcuts(!showShortcuts);
          break;
        default:
          break;
      }
    };

    // 키보드 이벤트 리스너 등록
    document.addEventListener('keydown', handleKeyDown);

    // 정리 함수
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isPlaying, currentSubtitleIndex, subtitles.length, showKoreanAnswer, showShortcuts, userTranslation]);

  // 기존 웹앱과 동일한 간단한 자막 검색
  const findSubtitleByTimeSimple = (currentTimeSeconds: number): number => {
    for (let i = 0; i < subtitles.length; i++) {
      const startTime = parseTimeToSeconds(subtitles[i].start_time);
      const endTime = parseTimeToSeconds(subtitles[i].end_time);
      
      if (currentTimeSeconds >= startTime && currentTimeSeconds <= endTime) {
        return i;
      }
    }
    return -1;
  };

  // 현재 시간에 표시될 자막 인덱스 (null이면 자막 숨김)
  const getCurrentDisplaySubtitleIndex = (currentTimeSeconds: number): number | null => {
    const foundIndex = findSubtitleByTimeSimple(currentTimeSeconds);
    return foundIndex !== -1 ? foundIndex : null;
  };

  // 재생/일시정지 토글
  const togglePlayPause = () => {
    if (player) {
      if (isPlaying) {
        player.pauseVideo();
      } else {
        player.playVideo();
      }
    }
  };

  // 이전/다음 자막으로 이동 (영상 시간도 함께 이동)
  const goToPrevious = () => {
    if (currentSubtitleIndex > 0) {
      const newIndex = currentSubtitleIndex - 1;
      setCurrentSubtitleIndex(newIndex);
      
      // 영상 시간 이동 (초 단위로 변환)
      if (player && subtitles[newIndex]) {
        const timeInSeconds = parseTimeToSeconds(subtitles[newIndex].start_time);
        player.seekTo(timeInSeconds, true);
      }
    }
  };

  const goToNext = () => {
    if (currentSubtitleIndex < subtitles.length - 1) {
      const newIndex = currentSubtitleIndex + 1;
      setCurrentSubtitleIndex(newIndex);
      
      // 영상 시간 이동
      if (player && subtitles[newIndex]) {
        const timeInSeconds = parseTimeToSeconds(subtitles[newIndex].start_time);
        player.seekTo(timeInSeconds, true);
      }
    }
  };

  // 시간 문자열을 초 단위로 변환 (HH:MM:SS 또는 MM:SS -> seconds)
  const parseTimeToSeconds = (timeString: string): number => {
    if (!timeString) return 0;
    
    // 쉼표를 점으로 변환 (00:00:14,878 -> 00:00:14.878)
    const cleanedTime = timeString.replace(',', '.');
    const parts = cleanedTime.split(':');
    
    if (parts.length === 3) {
      // HH:MM:SS.ms 형식
      const hours = parseInt(parts[0]) || 0;
      const minutes = parseInt(parts[1]) || 0;
      const secondsWithMs = parseFloat(parts[2]) || 0;
      return hours * 3600 + minutes * 60 + secondsWithMs;
    } else if (parts.length === 2) {
      // MM:SS 형식
      const minutes = parseInt(parts[0]) || 0;
      const seconds = parseFloat(parts[1]) || 0;
      return minutes * 60 + seconds;
    }
    
    return 0;
  };

  // 시간을 "MM:SS" 형식으로 포맷팅
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // 번역 제출 함수 (로컬 상태만 업데이트)
  const handleSubmitTranslation = async () => {
    if (!subtitles[currentSubtitleIndex] || !userTranslation.trim()) {
      alert('번역을 입력해주세요.');
      return;
    }

    // 로컬 상태만 업데이트 (Firebase 저장 없음)
    const updatedSubtitles = [...subtitles];
    updatedSubtitles[currentSubtitleIndex] = {
      ...updatedSubtitles[currentSubtitleIndex],
      userTranslation: userTranslation,
      completed: true
    };
    setSubtitles(updatedSubtitles);

    alert('번역이 저장되었습니다!');
    
    // 모든 자막이 완료되었는지 확인
    const allCompleted = updatedSubtitles.every(s => s.completed);
    if (allCompleted) {
      // 학습 결과 저장
      await saveStudyResults();
      alert('🎉 모든 자막 번역이 완료되었습니다! 학습 데이터가 저장되었습니다.');
    }
    
    // 다음 자막으로 자동 이동
    if (currentSubtitleIndex < subtitles.length - 1) {
      setTimeout(() => {
        setCurrentSubtitleIndex(currentSubtitleIndex + 1);
      }, 500);
    }
  };

  // 퀴즈 토큰 클릭 핸들러
  const handleTokenClick = (token: string) => {
    // 퀴즈 관련 함수들은 제거됨
  };

  // 선택된 토큰 제거
  const handleSelectedTokenClick = (index: number) => {
    // 퀴즈 관련 함수들은 제거됨
  };

  // 퀴즈 정답 확인
  const checkQuizAnswer = () => {
    // 퀴즈 관련 함수들은 제거됨
  };

  // 정확도 계산
  const calculateAccuracy = () => {
    const completed = subtitles.filter(s => s.completed).length;
    return completed > 0 ? Math.round((completed / subtitles.length) * 100) : 0;
  };

  // 진행률 계산
  const calculateProgress = () => {
    const completed = subtitles.filter(s => s.completed).length;
    return subtitles.length > 0 ? (completed / subtitles.length) * 100 : 0;
  };

  // 학습 결과 저장 함수
  const saveStudyResults = async () => {
    if (!auth.currentUser || subtitles.length === 0) return;
    
    try {
      const completedCount = subtitles.filter(s => s.completed).length;
      const accuracy = calculateAccuracy();
      
      const sessionData = {
        date: new Date().toISOString().split('T')[0], // "2025-01-20"
        gameType: '자막_번역',
        totalScore: completedCount * 10, // 완료된 자막당 10점
        problemCount: subtitles.length,
        studyTime: Math.floor((Date.now() - (window as any).sessionStartTime || Date.now()) / 1000),
        averageScore: completedCount > 0 ? (completedCount * 10) / subtitles.length : 0,
        metadata: {
          difficulty: '중급',
          domain: '자막번역',
          targetLanguage: '중국어',
          completedCount: completedCount,
          accuracy: accuracy,
          totalSubtitles: subtitles.length
        }
      };
      
      await saveStudySession(sessionData);
      console.log('자막 번역 결과 저장 완료:', sessionData);
    } catch (error) {
      console.error('자막 번역 결과 저장 실패:', error);
    }
  };

  const handleShowHint = () => {
    setShowHint(!showHint);
  };

  const handleLoopCurrentSection = () => {
    if (!player || subtitles.length === 0) {
      console.log('구간반복 실패: 플레이어 또는 자막 없음');
      return;
    }
    
    // 이미 반복 중이면 중지
    if (isLooping) {
      stopLooping();
      return;
    }
    
    const currentVideoTime = player.getCurrentTime();
    
    // 현재 실제 영상 시간에 맞는 자막 찾기 (싱크 오프셋 적용 안 함)
    const actualSubtitleIndex = findSubtitleByTimeSimple(currentVideoTime);
    
    console.log('실제 영상 시간 기반 자막 검색:', {
      currentVideoTime: currentVideoTime.toFixed(2) + '초',
      currentSubtitleIndex: currentSubtitleIndex,
      actualSubtitleIndex: actualSubtitleIndex,
      syncedTime: (currentVideoTime + syncOffset).toFixed(2) + '초'
    });
    
    // 실제 영상 시간에 맞는 자막이 없으면 현재 인덱스 사용
    const targetSubtitleIndex = actualSubtitleIndex !== -1 ? actualSubtitleIndex : currentSubtitleIndex;
    
    if (!subtitles[targetSubtitleIndex]) {
      console.log('대상 자막 없음:', targetSubtitleIndex);
      alert('현재 시점에 맞는 자막이 없습니다.');
      return;
    }
    
    const targetSubtitle = subtitles[targetSubtitleIndex];
    const startTime = parseTimeToSeconds(targetSubtitle.start_time);
    const endTime = parseTimeToSeconds(targetSubtitle.end_time);
    
    console.log('구간반복 대상 자막:', {
      index: targetSubtitleIndex,
      line: targetSubtitle.line,
      text_cn: targetSubtitle.text_cn,
      startTimeStr: targetSubtitle.start_time,
      endTimeStr: targetSubtitle.end_time,
      startTime: startTime.toFixed(2) + '초',
      endTime: endTime.toFixed(2) + '초',
      duration: (endTime - startTime).toFixed(2) + '초'
    });
    
    // 시간 유효성 검사
    if (startTime >= endTime || endTime - startTime < 0.5) {
      console.log('구간반복 실패: 잘못된 시간 범위', { startTime, endTime });
      alert('자막 시간 정보가 잘못되었거나 너무 짧습니다.');
      return;
    }
    
    // 현재 영상 시간이 자막 구간 안에 있는지 확인
    const isVideoTimeInRange = currentVideoTime >= startTime && currentVideoTime <= endTime;
    
    console.log('시간 유효성 검사:', {
      currentVideoTime: currentVideoTime.toFixed(2),
      startTime: startTime.toFixed(2),
      endTime: endTime.toFixed(2),
      isVideoTimeInRange: isVideoTimeInRange,
      timeDiffFromStart: (currentVideoTime - startTime).toFixed(2) + '초'
    });
    
    setLoopStartTime(startTime);
    setLoopEndTime(endTime);
    setIsLooping(true);
    
    // 자막 인덱스도 업데이트 (자막 동기화)
    setCurrentSubtitleIndex(targetSubtitleIndex);
    
    console.log('구간반복 시작:', {
      fromTime: currentVideoTime.toFixed(2) + '초',
      toTime: startTime.toFixed(2) + '초 ~ ' + endTime.toFixed(2) + '초'
    });
    
    // 시작 지점으로 이동
    player.seekTo(startTime, true);
    player.playVideo();
    
    // 반복 체크 인터벌 시작
    const interval = setInterval(() => {
      try {
        const currentTime = player.getCurrentTime();
        
        if (currentTime >= endTime) {
          console.log('구간 끝 도달:', {
            currentTime: currentTime.toFixed(2),
            endTime: endTime.toFixed(2),
            backToStart: startTime.toFixed(2)
          });
          player.seekTo(startTime, true);
        }
      } catch (error) {
        console.error('구간반복 체크 오류:', error);
        stopLooping();
      }
    }, 100);
    
    setLoopInterval(interval);
    console.log('=== 구간반복 활성화 완료 ===');
  };

  const stopLooping = () => {
    console.log('구간반복 중지');
    setIsLooping(false);
    setLoopStartTime(0);
    setLoopEndTime(0);
    
    // 반복 인터벌 정리
    if (loopInterval) {
      clearInterval(loopInterval);
      setLoopInterval(null);
      console.log('반복 인터벌 정리 완료');
    }
  };

  // 재생 속도 조절 함수
  const changePlaybackRate = (rate: number) => {
    if (player && player.setPlaybackRate) {
      try {
        player.setPlaybackRate(rate);
        setPlaybackRate(rate);
        console.log(`재생 속도 변경: ${rate}x`);
      } catch (error) {
        console.error('재생 속도 변경 오류:', error);
      }
    }
  };

  // SRT 내보내기 함수
  const exportToSRT = () => {
    try {
      // 완료된 번역만 필터링 (completed: true)
      const completedSubtitles = subtitles.filter(subtitle => 
        subtitle.completed === true && subtitle.userTranslation && subtitle.userTranslation.trim() !== ''
      );

      if (completedSubtitles.length === 0) {
        alert('내보낼 완료된 번역이 없습니다.\n\n번역을 작성한 후 "내 번역 저장하기" 버튼을 눌러주세요.');
        return;
      }

      // SRT 형식으로 변환
      let srtContent = '';
      completedSubtitles.forEach((subtitle, index) => {
        const sequenceNumber = index + 1;
        const startTime = formatTimeForSRT(subtitle.start_time);
        const endTime = formatTimeForSRT(subtitle.end_time);
        const text = subtitle.userTranslation;

        srtContent += `${sequenceNumber}\n`;
        srtContent += `${startTime} --> ${endTime}\n`;
        srtContent += `${text}\n\n`;
      });

      // 파일 다운로드
      const blob = new Blob([srtContent], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `my_translation_${new Date().toISOString().slice(0, 10)}.srt`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      alert(`${completedSubtitles.length}개의 완료된 번역이 SRT 파일로 내보내졌습니다!`);
    } catch (error) {
      console.error('SRT 내보내기 오류:', error);
      alert('내보내기 중 오류가 발생했습니다.');
    }
  };

  // SRT 시간 형식 변환 함수 (HH:MM:SS,mmm)
  const formatTimeForSRT = (timeString: string): string => {
    if (!timeString) return '00:00:00,000';
    
    // 이미 SRT 형식이면 그대로 반환
    if (timeString.includes(',') && timeString.length >= 12) {
      return timeString;
    }
    
    // 시간 문자열을 초 단위로 변환
    const totalSeconds = parseTimeToSeconds(timeString);
    
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.floor(totalSeconds % 60);
    const milliseconds = Math.floor((totalSeconds % 1) * 1000);
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')},${milliseconds.toString().padStart(3, '0')}`;
  };

  if (loading) {
    return (
      <div className="w-full h-screen flex items-center justify-center bg-[#1a1a1a] text-white">
        <div className="text-2xl">자막 데이터를 불러오는 중...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full h-screen flex items-center justify-center bg-[#1a1a1a] text-white">
        <div className="text-2xl text-red-400">{error}</div>
      </div>
    );
  }

  const currentSubtitle = subtitles[currentSubtitleIndex];
  const completedCount = subtitles.filter(s => s.completed).length;
  const quizCount = subtitles.filter(s => s.vocabulary && s.vocabulary.some(v => v.quiz)).length;

  return (
    <div 
      className="w-full h-screen flex bg-[#1a1a1a] text-white overflow-hidden" 
      style={{ 
        fontFamily: 'Segoe UI, Tahoma, Geneva, Verdana, sans-serif', 
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        maxWidth: 'none',
        zIndex: 1000
      }}
    >
      {/* 왼쪽: 비디오 + 타임라인 - 더 넓게 */}
      <div className="h-screen flex flex-col" style={{ flex: '3' }}>
        {/* 비디오 영역 */}
        <div className="flex-1 relative bg-black min-h-0">
          {/* YouTube 플레이어 컨테이너 */}
          <div 
            id="youtube-player" 
            className="w-full h-full absolute inset-0"
          ></div>
          
          {/* 로딩 메시지 (플레이어가 준비되지 않은 경우) */}
          {!player && (
            <div className="absolute inset-0 flex items-center justify-center bg-black">
              <div className="text-center">
                <span className="text-white text-xl block mb-2">🎬 YouTube 비디오 영역</span>
                <small className="text-gray-400">실제 구현시 YouTube iframe 또는 video 태그</small>
              </div>
            </div>
          )}
          
          {/* 자막 오버레이 - displaySubtitleIndex를 사용 */}
          {displaySubtitleIndex !== null && subtitles[displaySubtitleIndex] && (
            <div className="absolute bottom-12 left-1/2 -translate-x-1/2 bg-black/80 text-white px-5 py-2.5 rounded text-2xl max-w-[80%] text-center shadow-2xl z-10">
              {/* 중국어 자막만 표시 */}
              <div className="mb-2">
                <span dangerouslySetInnerHTML={{ __html: subtitles[displaySubtitleIndex].text_cn }} />
              </div>
              {/* 사용자 입력 번역이 있으면 실시간으로 표시 (현재 편집 중인 자막에만 표시) */}
              {displaySubtitleIndex === currentSubtitleIndex && liveTranslation && (
                <div className="text-yellow-300 text-xl">
                  {liveTranslation}
                </div>
              )}
            </div>
          )}
        </div>
        
        {/* 타임라인 */}
        <div className="h-[200px] bg-[#2a2a2a] border-t border-[#444] flex flex-col shrink-0">
          <div className="flex items-center gap-2 px-4 py-2.5 bg-[#333] text-sm">
            <button className="bg-[#555] hover:bg-[#666] rounded px-4 py-2 text-white border-none cursor-pointer" onClick={goToPrevious}>⏮</button>
            <button 
              className={`rounded px-4 py-2 text-white border-none cursor-pointer ${isPlaying ? 'bg-[#007acc]' : 'bg-[#555] hover:bg-[#666]'}`}
              onClick={togglePlayPause}
            >
              {isPlaying ? '⏸' : '▶'}
            </button>
            <button className="bg-[#555] hover:bg-[#666] rounded px-4 py-2 text-white border-none cursor-pointer" onClick={goToNext}>⏭</button>
            <div className="flex gap-2 ml-auto">
              <button 
                className="bg-[#555] hover:bg-[#666] rounded px-3 py-1 text-white border-none cursor-pointer text-xs"
                onClick={() => setSyncOffset(prev => prev - 0.5)}
              >
                싱크 -0.5초
              </button>
              <button 
                className="bg-[#555] hover:bg-[#666] rounded px-3 py-1 text-white border-none cursor-pointer text-xs"
                onClick={() => setSyncOffset(prev => prev + 0.5)}
              >
                싱크 +0.5초
              </button>
            </div>
          </div>
          <div className="flex-1 relative bg-[#1e1e1e] overflow-x-auto p-2.5">
            <div className="h-15 relative mb-2.5">
              {/* 재생 속도 조절 버튼들 - 가운데 정렬 */}
              <div className="flex justify-center items-center h-full">
                <div className="flex items-center gap-2 bg-[#333] rounded-lg px-3 py-2">
                  <span className="text-gray-300 text-xs mr-2">속도:</span>
                  {[0.5, 0.75, 1, 1.25, 1.5, 2].map((rate) => (
                    <button
                      key={rate}
                      onClick={() => changePlaybackRate(rate)}
                      className={`px-2 py-1 rounded text-xs transition-colors ${
                        playbackRate === rate 
                          ? 'bg-[#007acc] text-white' 
                          : 'bg-[#555] text-gray-300 hover:bg-[#666]'
                      }`}
                    >
                      {rate}x
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* 오른쪽: 편집 패널 - 전체 넓이 */}
      <div className="h-screen bg-[#2a2a2a] border-l border-[#444] flex flex-col" style={{ flex: '2' }}>
        {/* 헤더 */}
        <div className="flex items-center justify-between px-4 py-3.5 bg-[#333] border-b border-[#444] shrink-0">
          <h3 className="text-lg font-bold">자막 편집</h3>
        </div>
        
        {/* 콘텐츠 영역 */}
        <div className="flex-1 p-5 overflow-y-auto text-sm min-h-0" style={{ fontSize: '17px', textAlign: 'center' }}>
          {currentSubtitle ? (
            <>
              {/* 진행률 바 */}
              <div className="bg-[#333] h-1 rounded-sm mb-5">
                <div 
                  className="bg-gradient-to-r from-[#007acc] to-[#9c27b0] h-full rounded-sm transition-all duration-300"
                  style={{ width: `${calculateProgress()}%` }}
                ></div>
              </div>

              {/* 원문 영역 */}
              <div className="mb-5">
                <label className="block mb-1 font-bold" style={{ fontSize: '17px', textAlign: 'center' }}>원문 (중국어)</label>
                <div className="bg-[#1e1e1e] p-3.5 rounded mb-2.5 border-l-4 border-[#007acc]" style={{ fontSize: '19px', textAlign: 'center' }}>
                  <div className="text-base" dangerouslySetInnerHTML={{ __html: currentSubtitle.text_cn }}></div>
                </div>

                <div className="flex items-center justify-center mb-1" style={{ fontSize: '17px' }}>
                  <label className="font-bold" style={{ fontSize: '17px', textAlign: 'center' }}>번역 (한국어)</label>
                  <button 
                    className="text-xs bg-[#555] hover:bg-[#666] px-2 py-1 rounded text-white ml-2"
                    style={{ fontSize: '15px' }}
                    onClick={() => setShowKoreanAnswer(!showKoreanAnswer)}
                  >
                    {showKoreanAnswer ? '숨기기' : '보기'}
                  </button>
                </div>
                <div className="bg-[#1e1e1e] p-3.5 rounded mb-2.5 border-l-4 border-[#28a745]" style={{ fontSize: '19px', textAlign: 'center' }}>
                  {showKoreanAnswer ? (
                    <div className="text-base" dangerouslySetInnerHTML={{ __html: currentSubtitle.text_kr }}></div>
                  ) : (
                    <div className="text-gray-400 text-sm" style={{ fontSize: '15px', textAlign: 'center' }}>번역 참고문을 보려면 '보기' 버튼을 누르세요</div>
                  )}
                </div>

                <div className="flex items-center justify-between mb-1">
                  <label className="font-bold" style={{ fontSize: '17px', textAlign: 'center' }}>내 번역</label>
                  <span
                    className={`px-3 py-1 rounded font-bold ml-2 ${
                      characterCount <= 30
                        ? 'bg-green-600 text-white'
                        : characterCount <= 45
                        ? 'bg-yellow-500 text-white'
                        : 'bg-red-600 text-white'
                    }`}
                    style={{ fontSize: '18px', minWidth: '60px', textAlign: 'center', display: 'inline-block' }}
                  >
                    {characterCount}자
                  </span>
                </div>
                <textarea
                  className="w-full min-h-[80px] bg-[#333] text-white border border-[#555] rounded p-3.5 text-sm resize-y focus:border-[#007acc] focus:outline-none"
                  style={{ fontSize: '17px', textAlign: 'center' }}
                  placeholder="여기에 번역을 입력하면, 왼쪽 화면에 번역이 실시간 반영됩니다! 글자수를 고려하여 번역해보세요!"
                  value={userTranslation}
                  onChange={(e) => {
                    setUserTranslation(e.target.value);
                    setLiveTranslation(e.target.value);
                    setCharacterCount(e.target.value.length);
                  }}
                />
                <div className="mt-2 text-gray-400" style={{ fontSize: '15px', textAlign: 'center' }}>
                  권장: 30자 이하
                </div>
              </div>

              {/* 힌트 섹션 */}
              {showHint && (
                <div className="bg-[#2a2a1a] border-l-4 border-[#ffc107] p-3.5 mt-2.5 rounded-r">
                  <div className="flex items-center mb-2">
                    <span className="text-[#ffc107] mr-2">💡</span>
                    <strong className="text-[#ffc107]">번역 힌트</strong>
                  </div>
                  
                  {currentSubtitle.vocabulary && currentSubtitle.vocabulary.length > 0 ? (
                    <div className="space-y-3">
                      {currentSubtitle.vocabulary.map((vocab, index) => (
                        <div key={index} className="bg-[#333] p-3 rounded">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-bold text-[#ffff00] text-base">{vocab.word}</span>
                            <span className="text-[#aaa] text-sm">({vocab.pinyin})</span>
                            <span className="text-[#28a745] text-sm">{vocab.meaning}</span>
                          </div>
                          <div className="text-[#ccc] text-sm">
                            예시: {vocab.example}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-[#ccc] text-sm">
                      해당 라인에는 힌트가 없습니다. 도움이 필요하면 오른쪽의 챗봇에게 물어보세요
                    </div>
                  )}
                </div>
              )}

              {/* 액션 버튼들 */}
              <div className="space-y-3 mt-4">
                {/* 첫 번째 줄: 내비게이션 및 기본 기능 */}
                <div className="flex justify-center space-x-3">
                  <button
                    onClick={goToPrevious}
                    disabled={currentSubtitleIndex === 0}
                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-500 disabled:cursor-not-allowed"
                  >
                    이전 자막
                  </button>
                  <button
                    onClick={goToNext}
                    disabled={currentSubtitleIndex === subtitles.length - 1}
                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-500 disabled:cursor-not-allowed"
                  >
                    다음 자막
                  </button>
                  <button
                    onClick={handleLoopCurrentSection}
                    className={`px-4 py-2 rounded ${
                      isLooping 
                        ? 'bg-red-600 text-white hover:bg-red-700' 
                        : 'bg-gray-600 text-white hover:bg-gray-700'
                    }`}
                  >
                    {isLooping ? '반복중지' : '구간반복'}
                  </button>
                  <button
                    onClick={handleShowHint}
                    className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700"
                  >
                    힌트
                  </button>
                </div>

                {/* 두 번째 줄: 저장 및 내보내기 기능 */}
                <div className="flex justify-center space-x-3">
                  <button
                    onClick={handleSubmitTranslation}
                    disabled={!userTranslation.trim()}
                    className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-500 disabled:cursor-not-allowed font-bold"
                  >
                    내 번역 저장하기
                  </button>
                  <button
                    onClick={exportToSRT}
                    className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 font-bold"
                    title="완료된 번역들을 SRT 파일로 내보내기"
                  >
                    SRT 내보내기
                  </button>
                  <button
                    onClick={() => setShowShortcuts(!showShortcuts)}
                    className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
                    title="단축키 도움말 (?)"
                  >
                    단축키
                  </button>
                </div>
              </div>

              {/* 번역 가이드 - 편집 패널 하단에 추가 */}
              <div className="mt-6 p-4">
                <div className="flex items-center mb-3">
                  <span className="text-2xl mr-2">💡</span>
                  <h4 className="text-white font-bold text-lg">자막 번역, 이것만 기억하세요!</h4>
                </div>
                <div className="space-y-2 text-base leading-relaxed">
                  <div className="flex items-start">
                    <span className="mr-1.5 mt-0.5 text-base">📝</span>
                    <span className="text-gray-300"><strong>길이 제한:</strong> 한 화면에 짧게, 보통 한 줄에 12~15자, 최대 2줄 유지!</span>
                  </div>
                  <div className="flex items-start">
                    <span className="mr-1.5 mt-0.5 text-base">⏱️</span>
                    <span className="text-gray-300"><strong>읽기 속도:</strong> 영상 대사보다 빠르게 읽히게!</span>
                  </div>
                  <div className="flex items-start">
                    <span className="mr-1.5 mt-0.5 text-base">🗣️</span>
                    <span className="text-gray-300"><strong>구어체 사용:</strong> 영상처럼 자연스러운 대화체로!</span>
                  </div>
                  <div className="flex items-start">
                    <span className="mr-1.5 mt-0.5 text-base">✨</span>
                    <span className="text-gray-300"><strong>핵심 전달:</strong> 불필요한 말은 과감히 생략!</span>
                  </div>
                  <div className="flex items-start">
                    <span className="mr-1.5 mt-0.5 text-base">⏰</span>
                    <span className="text-gray-300"><strong>정확한 싱크:</strong> 대사 시작/끝에 칼같이 맞춰!</span>
                  </div>
                  <div className="flex items-start">
                    <span className="mr-1.5 mt-0.5 text-base">✅</span>
                    <span className="text-gray-300"><strong>한국어 규칙:</strong> 띄어쓰기, 맞춤법은 기본!</span>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="bg-[#1e1e1e] p-2.5 rounded mb-5 font-mono text-sm">
              자막을 선택하세요
            </div>
          )}
        </div>
        
        {/* 상태바 */}
        <div className="bg-[#333] px-3.5 py-2 text-xs text-[#aaa] border-t border-[#444] shrink-0">
          진행률: {completedCount}/{subtitles.length} 자막 완료 | 퀴즈: {quizCount}개 | 정확도: {calculateAccuracy()}%
        </div>
      </div>

      {/* 단축키 도움말 모달 */}
      {showShortcuts && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-[#2a2a2a] text-white p-6 rounded-lg max-w-md w-full mx-4 border border-[#444]">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold flex items-center">
                <span className="mr-2">⌨️</span>
                키보드 단축키
              </h3>
              <button
                onClick={() => setShowShortcuts(false)}
                className="text-gray-400 hover:text-white text-xl"
              >
                ×
              </button>
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="font-mono bg-[#444] px-2 py-1 rounded text-xs">스페이스</span>
                <span>재생/일시정지</span>
              </div>
              <div className="flex justify-between">
                <span className="font-mono bg-[#444] px-2 py-1 rounded text-xs">← →</span>
                <span>이전/다음 자막</span>
              </div>
              <div className="flex justify-between">
                <span className="font-mono bg-[#444] px-2 py-1 rounded text-xs">R</span>
                <span>구간반복 토글</span>
              </div>
              <div className="flex justify-between">
                <span className="font-mono bg-[#444] px-2 py-1 rounded text-xs">H</span>
                <span>힌트 표시/숨기기</span>
              </div>
              <div className="flex justify-between">
                <span className="font-mono bg-[#444] px-2 py-1 rounded text-xs">K</span>
                <span>한국어 정답 토글</span>
              </div>
              <div className="flex justify-between">
                <span className="font-mono bg-[#444] px-2 py-1 rounded text-xs">F</span>
                <span>번역창 포커스</span>
              </div>
              <div className="flex justify-between">
                <span className="font-mono bg-[#444] px-2 py-1 rounded text-xs">Ctrl+Enter</span>
                <span>번역 제출</span>
              </div>
              <div className="flex justify-between">
                <span className="font-mono bg-[#444] px-2 py-1 rounded text-xs">Esc</span>
                <span>포커스 해제</span>
              </div>
              <div className="flex justify-between">
                <span className="font-mono bg-[#444] px-2 py-1 rounded text-xs">?</span>
                <span>단축키 도웄말</span>
              </div>
            </div>
            <div className="mt-4 text-xs text-gray-400 text-center">
              팁: 번역 입력 중에는 단축키가 비활성화됩니다.
            </div>
          </div>
        </div>
      )}

      {/* 챗봇 위젯 */}
      <ChatbotWidget initialContext={`현재 자막: ${currentSubtitle?.text_cn || ''}\n번역: ${currentSubtitle?.text_kr || ''}\n내 번역: ${userTranslation || ''}`} />
    </div>
  );
};

export default SubtitleTranslation;