import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { db, auth } from '../../firebase';
import { doc, getDoc } from 'firebase/firestore';
import { saveStudySession } from '../Tran_Analysis/studyDataUtils';

// YouTube API 타입 정의
declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

interface Segment {
  id: number;
  start_time: string;
  end_time: string;
  start_seconds: number;
  end_seconds: number;
  duration: number;
  original_text: string;
  translation_suggestion: string;
  keywords: string[];
}

interface VideoInfo {
  id: string;
  title: string;
  speaker: string;
  duration: string;
  language: string;
  description: string;
}

const VisualInterpretation: React.FC = () => {
  const navigate = useNavigate();
  const [currentScript, setCurrentScript] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [player, setPlayer] = useState<any>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [pauseMode, setPauseMode] = useState<'segment' | 'sentence' | 'manual'>('sentence');
  const [youtubeAPIReady, setYoutubeAPIReady] = useState(false);
  const [playerError, setPlayerError] = useState<string | null>(null);
  
  // 녹음 관련 상태
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [accumulatedText, setAccumulatedText] = useState('');
  const [currentText, setCurrentText] = useState('');
  const [recordedSegments, setRecordedSegments] = useState<{[key: number]: string}>({});
  
  // 통역 연습 모드 상태
  const [practiceMode, setPracticeMode] = useState<'listen' | 'interpret' | 'review'>('listen');
  const [isAutoMode, setIsAutoMode] = useState(true);
  const [practiceSegmentIndex, setPracticeSegmentIndex] = useState(0); // 통역 연습 중인 세그먼트
  const [autoDetectionEnabled, setAutoDetectionEnabled] = useState(true); // 자동 감지 활성화 여부
  const [lastAutoDetectionEnabledTime, setLastAutoDetectionEnabledTime] = useState(0);
  const [hideOriginalText, setHideOriginalText] = useState(false); // 원문 숨기기 여부
  
  // 세션 관리
  const [sessionStartTime, setSessionStartTime] = useState<number>(Date.now());
  const [completedSegments, setCompletedSegments] = useState<number[]>([]);
  const [totalScore, setTotalScore] = useState(0);
  
  // 음성 재생 관련 상태
  const [isPlayingUserAudio, setIsPlayingUserAudio] = useState(false);
  const [isPlayingModelAudio, setIsPlayingModelAudio] = useState(false);
  const userAudioRef = useRef<HTMLAudioElement>(null);
  const modelAudioRef = useRef<HTMLAudioElement>(null);
  
  // 고정 YouTube URL - 원래 작동했던 영상으로 복원
  const youtubeUrl = 'https://www.youtube.com/watch?v=2sfSd89akeE';
  const youtubeVideoId = '2sfSd89akeE'; // 원본 ID로 다시 시도
  
  // Refs for recording functionality
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recognitionRef = useRef<any>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isRecordingRef = useRef<boolean>(false);
  const scriptContainerRef = useRef<HTMLDivElement | null>(null); // 자막 스크립트 컨테이너 ref
  const [isDataLoaded, setIsDataLoaded] = useState(false);

  // YouTube API 로드
  useEffect(() => {
    // 데이터가 로드되지 않았으면 YouTube 초기화를 하지 않음
    if (!isDataLoaded) return;

    let isSubscribed = true;

    const loadYouTubeAPI = () => {
      return new Promise<void>((resolve) => {
        if (window.YT && window.YT.Player) {
          resolve();
          return;
        }

        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        const firstScriptTag = document.getElementsByTagName('script')[0];
        firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);

        window.onYouTubeIframeAPIReady = () => {
          if (isSubscribed) {
            resolve();
          }
        };
      });
    };

    const initializePlayer = async () => {
      try {
        await loadYouTubeAPI();
        
        if (!isSubscribed) return;

        // DOM이 준비될 때까지 대기
        let retryCount = 0;
        const maxRetries = 5;
        
        const waitForElement = () => {
          return new Promise<void>((resolve, reject) => {
            const element = document.getElementById('youtube-player');
            if (element) {
              resolve();
            } else if (retryCount >= maxRetries) {
              reject(new Error('YouTube player element not found after maximum retries'));
            } else {
              retryCount++;
              setTimeout(() => waitForElement().then(resolve).catch(reject), 1000);
            }
          });
        };

        await waitForElement();

        const ytPlayer = new window.YT.Player('youtube-player', {
          height: '100%',
          width: '100%',
          videoId: youtubeVideoId,
          playerVars: {
            autoplay: 0,
            controls: 1,
            rel: 0,
            modestbranding: 1,
            origin: window.location.origin,
          },
          events: {
            onReady: (event: any) => {
              if (!isSubscribed) return;
              console.log('YouTube 플레이어 준비 완료');
              setPlayer(event.target);
              setPlayerError(null);
              setYoutubeAPIReady(true);
            },
            onStateChange: (event: any) => {
              if (!isSubscribed) return;
              if (event.data === window.YT.PlayerState.PLAYING) {
                setIsPlaying(true);
              } else {
                setIsPlaying(false);
              }
            },
            onError: (event: any) => {
              if (!isSubscribed) return;
              console.error('YouTube 플레이어 에러:', event.data);
              let errorMsg = '';
              switch(event.data) {
                case 2:
                  errorMsg = '유효하지 않은 비디오 ID입니다.';
                  break;
                case 5:
                  errorMsg = 'HTML5 플레이어에서 재생할 수 없는 콘텐츠입니다.';
                  break;
                case 100:
                  errorMsg = '비디오를 찾을 수 없습니다.';
                  break;
                case 101:
                case 150:
                  errorMsg = '비디오 소유자가 임베드를 허용하지 않았습니다.';
                  break;
                default:
                  errorMsg = `알 수 없는 에러 (코드: ${event.data})`;
              }
              setPlayerError(errorMsg);
            },
          },
        });
      } catch (error) {
        if (!isSubscribed) return;
        console.error('YouTube 플레이어 초기화 실패:', error);
        setPlayerError('YouTube 플레이어를 초기화할 수 없습니다.');
      }
    };

    // 컴포넌트 마운트 시 바로 초기화 시작
    initializePlayer();

    // Cleanup function
    return () => {
      isSubscribed = false;
      // 기존 onYouTubeIframeAPIReady 핸들러 제거
      window.onYouTubeIframeAPIReady = () => {};
    };
  }, [isDataLoaded]); // 빈 dependency array로 마운트 시에만 실행

  // 파이어베이스에서 데이터 로드
  useEffect(() => {
    const loadVisualInterpretationData = async () => {
      try {
        setLoading(true);
        const docRef = doc(db, 'visual_interpretation_Ted', 'audio_1751897317');
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
          const data = docSnap.data();
          console.log('파이어베이스 데이터 전체:', data);
          
          // video_info 설정
          setVideoInfo(data.video_info);
          console.log('video_info:', data.video_info);
          
          // segments 배열로 변환 (data.segments 사용)
          if (data.segments && Array.isArray(data.segments)) {
            setSegments(data.segments);
            console.log('데이터 로드 완료:', data.segments.length, '개 세그먼트');
            console.log('첫 번째 세그먼트:', data.segments[0]);
          } else {
            console.log('segments 배열을 찾을 수 없음. 데이터 구조:', Object.keys(data));
            
            // 혹시 segment_001, segment_002... 형태로 저장되어 있다면
            const segmentArray: Segment[] = [];
            for (let i = 1; i <= 46; i++) {
              const segmentKey = `segment_${i.toString().padStart(3, '0')}`;
              if (data[segmentKey]) {
                segmentArray.push(data[segmentKey]);
              }
            }
            if (segmentArray.length > 0) {
              setSegments(segmentArray);
              console.log('segment_xxx 형태로 데이터 로드:', segmentArray.length, '개 세그먼트');
              console.log('첫 번째 세그먼트:', segmentArray[0]);
            }
          }
          setIsDataLoaded(true);
        } else {
          console.error('문서를 찾을 수 없습니다.');
        }
      } catch (error) {
        console.error('데이터 로드 실패:', error);
      } finally {
        setLoading(false);
      }
    };

    loadVisualInterpretationData();
  }, []);

  // 시간 문자열을 초로 변환 (00:01:23,456 -> 83.456)
  const timeToSeconds = (timeStr: string): number => {
    const parts = timeStr.split(':');
    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    const secondsParts = parts[2].split(',');
    const seconds = parseInt(secondsParts[0], 10);
    const milliseconds = parseInt(secondsParts[1], 10) / 1000;
    
    return hours * 3600 + minutes * 60 + seconds + milliseconds;
  };

  // 현재 재생 시간 기반으로 현재 세그먼트 찾기
  const findCurrentSegmentIndex = (currentTimeInSeconds: number): number => {
    for (let i = 0; i < segments.length; i++) {
      const startTime = timeToSeconds(segments[i].start_time);
      const endTime = timeToSeconds(segments[i].end_time);
      
      if (currentTimeInSeconds >= startTime && currentTimeInSeconds <= endTime) {
        return i;
      }
    }
    return -1;
  };

  // 문장이 완전한지 확인하는 함수 (중국어 문장 부호로 판단)
  const isCompleteSentence = (text: string): boolean => {
    const chineseEndPunctuations = ['。', '！', '？', '；'];
    return chineseEndPunctuations.some(punct => text.trim().endsWith(punct));
  };

  // 다음 완전한 문장이 끝나는 세그먼트 찾기
  const findNextCompleteSentenceEnd = (startIndex: number): number => {
    for (let i = startIndex; i < segments.length; i++) {
      if (isCompleteSentence(segments[i].original_text)) {
        return i;
      }
    }
    return startIndex; // 완전한 문장을 찾지 못하면 현재 세그먼트 반환
  };

  // 자동 감지 활성화/비활성화 함수
  const updateAutoDetection = (enabled: boolean) => {
    setAutoDetectionEnabled(enabled);
    if (enabled) {
      setLastAutoDetectionEnabledTime(Date.now());
    }
  };

  // 비디오 시간 추적
  useEffect(() => {
    if (!player || !segments.length) return;

    const interval = setInterval(() => {
      if (player.getCurrentTime) {
        const time = player.getCurrentTime();
        setCurrentTime(time);
        
        const segmentIndex = findCurrentSegmentIndex(time);
        if (segmentIndex !== -1 && segmentIndex !== currentScript) {
          setCurrentScript(segmentIndex);
        }
        
        // 일시정지 모드에 따라 처리 (듣기 모드일 때만, 자동 감지가 활성화된 경우에만)
        if (pauseMode !== 'manual' && practiceMode === 'listen' && autoDetectionEnabled && currentScript < segments.length && isPlaying && !isRecording) {
          const currentSegment = segments[currentScript];
          const endTime = timeToSeconds(currentSegment.end_time);
          const startTime = timeToSeconds(currentSegment.start_time);
          
          // 세그먼트의 시작 후 최소 1초는 지났는지 확인
          if (time >= endTime && time - startTime >= 1) {
            // 자동 감지가 방금 활성화된 경우는 일시정지하지 않음
            const timeSinceAutoDetectionEnabled = Date.now() - lastAutoDetectionEnabledTime;
            if (timeSinceAutoDetectionEnabled > 1000) {
              if (pauseMode === 'segment') {
                player.pauseVideo();
                console.log(`세그먼트 ${currentScript + 1} 종료 - 자동 일시정지`);
                
                if (isAutoMode) {
                  setPracticeSegmentIndex(currentScript);
                  setPracticeMode('interpret');
                }
              } else if (pauseMode === 'sentence') {
                if (isCompleteSentence(currentSegment.original_text)) {
                  player.pauseVideo();
                  console.log(`완전한 문장 종료 (세그먼트 ${currentScript + 1}) - 자동 일시정지`);
                  
                  if (isAutoMode) {
                    setPracticeSegmentIndex(currentScript);
                    setPracticeMode('interpret');
                  }
                }
              }
            }
          }
        }
      }
    }, 100);

    return () => clearInterval(interval);
  }, [player, segments, currentScript, isPlaying, pauseMode, isRecording, isAutoMode, practiceMode, autoDetectionEnabled, lastAutoDetectionEnabledTime]);

  // 자막 스크립트 자동 스크롤
  useEffect(() => {
    if (scriptContainerRef.current && segments.length > 0) {
      const currentElement = scriptContainerRef.current.children[currentScript] as HTMLElement;
      if (currentElement) {
        // 스크롤을 부드럽게 이동
        currentElement.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      }
    }
  }, [currentScript, segments.length]);



  // 녹음 시간 포맷팅
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // 녹음 토글
  const toggleRecording = async () => {
    if (!isRecordingRef.current) {
      await startRecording();
    } else {
      stopRecording();
    }
  };

  // 녹음 시작
  const startRecording = async () => {
    try {
      console.log('녹음 시작 시도...');
      
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert('이 브라우저는 미디어 녹음을 지원하지 않습니다.');
        return;
      }

      if (!streamRef.current) {
        console.log('마이크 접근 권한 요청 중...');
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          }
        });
        streamRef.current = stream;
        console.log('마이크 접근 성공');
      }

      const mediaRecorder = new MediaRecorder(streamRef.current);
      mediaRecorderRef.current = mediaRecorder;
      const chunks: BlobPart[] = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/wav' });
        setAudioBlob(blob);
        console.log('녹음 완료, 파일 크기:', blob.size);
      };

      mediaRecorder.start();
      setIsRecording(true);
      isRecordingRef.current = true;
      setRecordingTime(0);
      console.log('MediaRecorder 시작됨');

      // 타이머 시작
      intervalRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

      // 음성 인식 시작
      startSpeechRecognition();

      // 자동 모드일 때 영상 일시정지
      if (isAutoMode && player && isPlaying) {
        player.pauseVideo();
      }

    } catch (error: any) {
      console.error('녹음 시작 실패:', error);
      
      if (error.name === 'NotAllowedError') {
        alert('마이크 접근 권한이 거부되었습니다. 브라우저 설정에서 마이크 권한을 허용해주세요.');
      } else if (error.name === 'NotFoundError') {
        alert('마이크를 찾을 수 없습니다. 마이크가 연결되어 있는지 확인해주세요.');
      } else {
        alert(`녹음 오류: ${error.message || error}`);
      }
    }
  };

  // 녹음 중지
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecordingRef.current) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      isRecordingRef.current = false;

      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }

      if (recognitionRef.current) {
        recognitionRef.current.abort();
        recognitionRef.current = null;
      }

      // 현재 연습 중인 세그먼트에 녹음된 텍스트 저장
      if (accumulatedText.trim()) {
        setRecordedSegments(prev => ({
          ...prev,
          [practiceSegmentIndex]: accumulatedText.trim()
        }));
      }

      // 자동 모드일 때 검토 모드로 전환
      if (isAutoMode) {
        setPracticeMode('review');
      }
    }
  };

  // 음성 인식 시작
  const startSpeechRecognition = () => {
    console.log('음성 인식 시작 시도...');
    
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.error('이 브라우저는 음성 인식을 지원하지 않습니다.');
      return;
    }

    // 중국어 → 한국어 통역이므로 한국어로 음성 인식
    console.log('음성 인식 언어 설정: ko-KR');

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'ko-KR'; // 통역 결과는 한국어

    recognition.onstart = () => {
      console.log('음성 인식이 시작되었습니다.');
    };

    recognition.onresult = (event: any) => {
      console.log('음성 인식 결과 수신:', event);
      let finalTranscript = '';
      let interimTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }

      console.log('최종 텍스트:', finalTranscript, '임시 텍스트:', interimTranscript);

      if (finalTranscript) {
        setAccumulatedText(prev => prev + finalTranscript + ' ');
      }
      setCurrentText(interimTranscript);
    };

    recognition.onerror = (event: any) => {
      console.error('음성 인식 오류:', event.error);
      
      if (event.error === 'not-allowed') {
        alert('마이크 접근 권한이 필요합니다. 브라우저 설정에서 마이크 권한을 허용해주세요.');
      } else if (event.error === 'no-speech') {
        console.log('음성이 감지되지 않았습니다.');
      } else if (event.error === 'network') {
        alert('네트워크 오류가 발생했습니다. 인터넷 연결을 확인해주세요.');
      } else {
        console.error(`음성 인식 오류: ${event.error}`);
      }
    };

    recognition.onend = () => {
      console.log('음성 인식이 종료되었습니다.');
      if (isRecordingRef.current) {
        console.log('녹음 중이므로 음성 인식을 재시작합니다.');
        setTimeout(() => {
          if (isRecordingRef.current) {
            try {
              recognition.start();
            } catch (err) {
              console.error('음성 인식 재시작 실패:', err);
            }
          }
        }, 100);
      }
    };

    try {
      recognition.start();
      recognitionRef.current = recognition;
      console.log('음성 인식 시작 성공');
    } catch (error) {
      console.error('음성 인식 시작 실패:', error);
    }
  };

  // 다음 세그먼트로 이동
  const goToNextSegment = () => {
    if (practiceSegmentIndex < segments.length - 1) {
      const nextIndex = practiceSegmentIndex + 1;
      setPracticeSegmentIndex(nextIndex);
      setCurrentScript(nextIndex);
      setPracticeMode('listen');
      setAccumulatedText('');
      setCurrentText('');
      setRecordingTime(0);
      
      // 현재 세그먼트 완료 처리
      if (accumulatedText.trim() && !completedSegments.includes(practiceSegmentIndex)) {
        setCompletedSegments(prev => [...prev, practiceSegmentIndex]);
        // 간단한 점수 계산 (텍스트 길이 기반)
        const segmentScore = Math.min(accumulatedText.trim().length * 2, 100);
        setTotalScore(prev => prev + segmentScore);
      }
      
      // 자동 감지 잠시 비활성화 (세그먼트 전환 시 즉시 종료 방지)
      setAutoDetectionEnabled(false);
      
      // 자동 모드일 때 다음 세그먼트 자동 재생
      if (isAutoMode && player) {
        const nextSegment = segments[nextIndex];
        if (nextSegment) {
          const startTime = timeToSeconds(nextSegment.start_time);
          player.seekTo(startTime);
          player.playVideo();
          
          // 1초 후 자동 감지 재활성화 (세그먼트가 충분히 재생된 후)
          setTimeout(() => {
            setAutoDetectionEnabled(true);
          }, 1000);
        }
      } else {
        // 수동 모드에서는 바로 자동 감지 재활성화
        setTimeout(() => {
          setAutoDetectionEnabled(true);
        }, 500);
      }
    } else {
      // 마지막 세그먼트 완료 시 세션 저장
      saveVisualInterpretationSession();
    }
  };

  // 현재 세그먼트 다시 재생
  const replayCurrentSegment = () => {
    if (player && segments[practiceSegmentIndex]) {
      const currentSegment = segments[practiceSegmentIndex];
      const startTime = timeToSeconds(currentSegment.start_time);
      
      // 자동 감지 잠시 비활성화
      setAutoDetectionEnabled(false);
      
      player.seekTo(startTime);
      player.playVideo();
      setPracticeMode('listen');
      setCurrentScript(practiceSegmentIndex); // 실제 재생 위치도 동기화
      
      // 1초 후 자동 감지 재활성화
      setTimeout(() => {
        setAutoDetectionEnabled(true);
      }, 1000);
    }
  };

  // 사용자 녹음 음성 재생/일시정지
  const toggleUserRecording = () => {
    if (audioBlob && userAudioRef.current) {
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
          // 새로 시작 - 실제 녹음된 오디오 재생
          const audioUrl = URL.createObjectURL(audioBlob);
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

  // 최적의 한국어 음성 선택 함수
  const getBestKoreanVoice = () => {
    const voices = speechSynthesis.getVoices();
    console.log('사용 가능한 음성들:', voices.map(v => ({ name: v.name, lang: v.lang, localService: v.localService })));
    
    // 우선순위별로 한국어 음성 찾기
    const koreanVoicePreferences = [
      // 구글 음성 (가장 자연스러움)
      'Google 한국의',
      'Google Korean',
      'Google 한국어',
      // 마이크로소프트 음성
      'Microsoft Heami - Korean (Korea)',
      'Microsoft Heami Desktop - Korean (Korea)', 
      'Microsoft InSun Desktop - Korean (Korea)',
      'Microsoft 한국어',
      // 애플 음성 (macOS/iOS)
      'Yuna',
      'Siri Female (Korean)',
      // 기타 한국어 음성
      'Korean Female',
      'Korean Male',
      'ko-KR-Standard-A',
      'ko-KR-Standard-B',
      'ko-KR-Wavenet-A',
      'ko-KR-Wavenet-B'
    ];
    
    // 우선순위에 따라 음성 선택
    for (const preference of koreanVoicePreferences) {
      const voice = voices.find(v => 
        v.name.includes(preference) && 
        (v.lang.startsWith('ko') || v.lang.includes('KR'))
      );
      if (voice) {
        console.log('선택된 음성:', voice.name, voice.lang);
        return voice;
      }
    }
    
    // 대안: 한국어 언어 코드를 가진 모든 음성 중 첫 번째
    const koreanVoice = voices.find(v => 
      v.lang.startsWith('ko') || v.lang.includes('KR')
    );
    
    if (koreanVoice) {
      console.log('대안 음성 선택:', koreanVoice.name, koreanVoice.lang);
      return koreanVoice;
    }
    
    console.log('한국어 음성을 찾을 수 없어 기본 음성 사용');
    return null;
  };

  // TTS로 AI 제안 답안 음성 생성/일시정지
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
          
          // 음성이 로드될 때까지 대기
          const initVoices = () => {
            const utterance = new SpeechSynthesisUtterance(segments[practiceSegmentIndex].translation_suggestion);
            
            // 최적의 한국어 음성 선택
            const bestVoice = getBestKoreanVoice();
            if (bestVoice) {
              utterance.voice = bestVoice;
            }
            
            utterance.lang = 'ko-KR'; // 한국어 설정
            utterance.rate = 0.85; // 조금 더 느리게 (더 자연스럽게)
            utterance.pitch = 1.0; // 자연스러운 음높이
            utterance.volume = 0.9; // 볼륨
            
            utterance.onstart = () => {
              console.log('TTS 재생 시작 - 음성:', utterance.voice?.name || '기본');
              setIsPlayingModelAudio(true);
            };
            utterance.onend = () => setIsPlayingModelAudio(false);
            utterance.onerror = (e) => {
              console.error('TTS 오류:', e);
              setIsPlayingModelAudio(false);
            };
            
            speechSynthesis.speak(utterance);
          };
          
          // 음성 목록이 로드되지 않았다면 대기
          if (speechSynthesis.getVoices().length === 0) {
            speechSynthesis.onvoiceschanged = () => {
              initVoices();
              speechSynthesis.onvoiceschanged = null; // 한 번만 실행
            };
          } else {
            initVoices();
          }
        }
      }
    }
  };

  // 세션 저장 함수
  const saveVisualInterpretationSession = async () => {
    if (!auth.currentUser || completedSegments.length === 0) {
      return;
    }

    try {
      const studyTime = Math.floor((Date.now() - sessionStartTime) / 1000);
      const averageScore = totalScore / completedSegments.length;
      
      const sessionData = {
        date: new Date().toISOString().split('T')[0],
        gameType: '영상_통역',
        totalScore: totalScore,
        problemCount: completedSegments.length,
        studyTime: studyTime,
        averageScore: averageScore,
        metadata: {
          difficulty: '중급',
          domain: '영상통역',
          targetLanguage: '한국어',
          videoTitle: videoInfo?.title || 'TED 영상',
          totalSegments: segments.length,
          completedSegments: completedSegments.length,
          completionRate: (completedSegments.length / segments.length) * 100
        }
      };

      await saveStudySession(sessionData);
      console.log('영상 통역 세션 저장 완료:', sessionData);
      
      // 성공 알림
      alert('🎉 학습 데이터가 저장되었습니다! 대시보드에서 확인할 수 있습니다.');
      
    } catch (error) {
      console.error('세션 저장 실패:', error);
      alert('❌ 데이터 저장에 실패했습니다. 나중에 다시 시도해주세요.');
    }
  };

  // TTS 음성 목록 미리 로드
  useEffect(() => {
    // 컴포넌트 마운트 시 음성 목록 미리 로드
    if ('speechSynthesis' in window) {
      // 음성 목록이 비어있다면 강제로 로드
      if (speechSynthesis.getVoices().length === 0) {
        speechSynthesis.onvoiceschanged = () => {
          console.log('음성 목록 로드 완료:', speechSynthesis.getVoices().length, '개');
          getBestKoreanVoice(); // 최적 음성 미리 확인
        };
        // 강제로 음성 목록 로드 트리거
        speechSynthesis.getVoices();
      } else {
        getBestKoreanVoice(); // 최적 음성 미리 확인
      }
    }
  }, []);

  // 컴포넌트 언마운트 시 리소스 정리
  useEffect(() => {
    return () => {
      // 녹음 중지
      if (isRecordingRef.current) {
        stopRecording();
      }
      
      // 스트림 정리
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
      
      // 타이머 정리
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      
      // 음성 인식 정리
      if (recognitionRef.current) {
        recognitionRef.current.abort();
        recognitionRef.current = null;
      }
      
      // TTS 정리
      speechSynthesis.cancel();
    };
  }, []);

  // 로딩 중일 때
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-lg text-gray-600">TED 강연 데이터를 로드하는 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* 홈으로 버튼 추가 */}
      <button
        onClick={() => navigate('/')}
        className="absolute top-4 left-4 z-50 px-4 py-2 bg-white hover:bg-gray-100 text-gray-800 rounded-lg shadow-md transition-colors duration-200 flex items-center space-x-2"
      >
        <span>🏠</span>
        <span>홈으로</span>
      </button>

      {/* 기존 컴포넌트 내용 */}
      <div className="min-h-screen bg-gray-50 p-5">
        <div className="max-w-7xl mx-auto">
          {/* 헤더 */}
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-gray-900 mb-3">🎥 시각자료 통역 연습</h1>
            <p className="text-lg text-gray-600">TED 영상을 보면서 실제 통역 환경에서 연습해보세요</p>
            {videoInfo && (
              <div className="mt-4 p-4 bg-blue-50 rounded-lg inline-block">
                <h2 className="text-lg font-semibold text-blue-800 mb-2">{videoInfo.title}</h2>
                <p className="text-sm text-blue-700">
                  🎤 강연자: <span className="font-semibold">{videoInfo.speaker}</span> | 
                  ⏱️ 길이: {videoInfo.duration} | 
                  🌏 언어: {videoInfo.language}
                </p>
                <p className="text-xs text-blue-600 mt-2">{videoInfo.description}</p>
              </div>
            )}
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 min-h-[calc(100vh-200px)]">
            {/* 왼쪽: 비디오 및 컨트롤 영역 (2/3) */}
            <div className="lg:col-span-2 bg-white rounded-2xl p-6 shadow-lg">
              {/* 비디오 플레이어 */}
              <div className="mb-5">
                {/* 숨겨진 오디오 엘리먼트들 */}
                <audio ref={userAudioRef} style={{ display: 'none' }} />
                <audio ref={modelAudioRef} style={{ display: 'none' }} />
                
                <div className="w-full h-96 rounded-xl overflow-hidden bg-black relative">
                  <div id="youtube-player" className="w-full h-full"></div>
                  
                  {/* YouTube API 로딩 상태 */}
                  {!youtubeAPIReady && !playerError && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-80">
                      <div className="text-center text-white">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-3"></div>
                        <p>YouTube 플레이어 로딩 중...</p>
                      </div>
                    </div>
                  )}
                  
                  {/* 에러 상태 */}
                  {playerError && (
                    <div className="absolute inset-0 flex items-center justify-center bg-red-600 bg-opacity-90">
                      <div className="text-center text-white p-6">
                        <div className="text-4xl mb-3">⚠️</div>
                        <h3 className="text-lg font-semibold mb-2">비디오 로드 실패</h3>
                        <p className="text-sm mb-4">{playerError}</p>
                        <button 
                          onClick={() => {
                            setPlayerError(null);
                            setYoutubeAPIReady(false);
                            window.location.reload();
                          }}
                          className="px-4 py-2 bg-white text-red-600 rounded-lg font-semibold hover:bg-gray-100"
                        >
                          다시 시도
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              
              {/* 자막 표시 */}
              <div className="bg-gray-900 text-white p-4 rounded-lg text-center min-h-[80px] flex flex-col justify-center mb-6 relative">
                {/* 원문 숨기기 버튼 */}
                <button
                  onClick={() => setHideOriginalText(!hideOriginalText)}
                  className="absolute top-2 right-2 px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white text-xs rounded-md transition-colors"
                >
                  {hideOriginalText ? '원문 보이기' : '원문 숨기기'}
                </button>
                
                {segments.length > 0 && currentScript < segments.length ? (
                  <>
                    {!hideOriginalText && (
                      <div className="text-lg mb-2 text-yellow-300">
                        {segments[currentScript].original_text}
                      </div>
                    )}
                    {hideOriginalText && (
                      <div className="text-gray-400 italic text-sm">
                        원문이 숨겨져 있습니다
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-gray-400">자막을 선택해주세요</div>
                )}
              </div>
              


              {/* 일시정지 모드 선택 */}
              <div className="mb-6">
                <h4 className="text-lg font-semibold text-gray-900 mb-3">⏸️ 자동 일시정지 설정</h4>
                <div className="flex gap-3">
                  <button
                    onClick={() => setPauseMode('sentence')}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                      pauseMode === 'sentence'
                        ? 'bg-green-500 text-white border-2 border-green-500'
                        : 'bg-white text-gray-700 border-2 border-gray-300 hover:border-green-500'
                    }`}
                  >
                    🧠 문장별 (추천)
                  </button>
                  <button
                    onClick={() => setPauseMode('segment')}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                      pauseMode === 'segment'
                        ? 'bg-yellow-500 text-white border-2 border-yellow-500'
                        : 'bg-white text-gray-700 border-2 border-gray-300 hover:border-yellow-500'
                    }`}
                  >
                    ⏱️ 세그먼트별
                  </button>
                  <button
                    onClick={() => setPauseMode('manual')}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                      pauseMode === 'manual'
                        ? 'bg-gray-500 text-white border-2 border-gray-500'
                        : 'bg-white text-gray-700 border-2 border-gray-300 hover:border-gray-500'
                    }`}
                  >
                    🎛️ 수동 제어
                  </button>
                </div>
                <div className="mt-2 text-sm text-gray-600">
                  {pauseMode === 'sentence' && "완전한 문장이 끝날 때만 자동 일시정지 (문장이 중간에 끊어지지 않음)"}
                  {pauseMode === 'segment' && "각 세그먼트가 끝날 때마다 자동 일시정지 (기존 방식)"}
                  {pauseMode === 'manual' && "자동 일시정지 없음 (사용자가 직접 제어)"}
                </div>
              </div>
              
              {/* 통역 연습 모드 상태 표시 */}
              <div className="mb-6 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-200">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-lg font-semibold text-blue-800">🎯 통역 연습 상태</h4>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-600">자동 모드:</span>
                    <button
                      onClick={() => setIsAutoMode(!isAutoMode)}
                      className={`px-3 py-1 rounded-full text-sm font-medium transition-all ${
                        isAutoMode 
                          ? 'bg-green-500 text-white' 
                          : 'bg-gray-300 text-gray-700'
                      }`}
                    >
                      {isAutoMode ? 'ON' : 'OFF'}
                    </button>
                  </div>
                </div>
                
                <div className="flex items-center gap-4">
                  {/* 현재 모드 표시 */}
                  <div className="flex items-center gap-6">
                    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${
                      practiceMode === 'listen' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-600'
                    }`}>
                      <span>🔊</span>
                      <span className="text-sm font-medium">듣기</span>
                    </div>
                    <div className="text-gray-400">→</div>
                    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${
                      practiceMode === 'interpret' ? 'bg-red-500 text-white' : 'bg-gray-200 text-gray-600'
                    }`}>
                      <span>🎙️</span>
                      <span className="text-sm font-medium">통역</span>
                    </div>
                    <div className="text-gray-400">→</div>
                    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${
                      practiceMode === 'review' ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-600'
                    }`}>
                      <span>📝</span>
                      <span className="text-sm font-medium">검토</span>
                    </div>
                  </div>
                  
                  {/* 세그먼트 진행률 */}
                  <div className="ml-auto text-right">
                    <div className="text-sm font-semibold text-gray-700">
                      {practiceMode === 'listen' 
                        ? `듣기: ${currentScript + 1} / ${segments.length}`
                        : `통역: ${practiceSegmentIndex + 1} / ${segments.length}`
                      }
                    </div>
                    <div className="text-xs text-gray-500">
                      시간: {Math.floor(currentTime / 60)}:{(currentTime % 60).toFixed(0).padStart(2, '0')}
                    </div>
                  </div>
                </div>
              </div>

              {/* 통역 연습 컨트롤 */}
              {practiceMode === 'listen' && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 mb-6">
                  <h4 className="text-lg font-semibold text-blue-800 mb-4 flex items-center gap-2">
                    <span>🔊</span> 원문 듣기 단계
                  </h4>
                  
                  {/* 버튼을 정가운데 배치 */}
                  <div className="flex justify-center mb-4">
                    <button 
                      onClick={() => {
                        if (player && segments[currentScript]) {
                          const startTime = timeToSeconds(segments[currentScript].start_time);
                          player.seekTo(startTime);
                          player.playVideo();
                        }
                      }}
                      disabled={!player || segments.length === 0}
                      className={`w-24 h-24 rounded-full text-4xl font-bold transition-all duration-300 shadow-lg flex items-center justify-center ${
                        !player || segments.length === 0
                          ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                          : isPlaying
                          ? 'bg-orange-500 text-white hover:bg-orange-600 animate-pulse'
                          : 'bg-blue-500 text-white hover:bg-blue-600 hover:scale-105'
                      }`}
                      style={{ lineHeight: '1' }}
                    >
                      {isPlaying ? '⏸️' : '▶️'}
                    </button>
                  </div>
                  
                  {/* 텍스트들을 별도로 중앙 정렬 */}
                  <div className="text-center">
                    <div className="text-gray-600 mb-2">
                      {isPlaying ? '재생 중...' : '현재 세그먼트 재생'}
                    </div>
                    {isAutoMode && (
                      <div className="text-sm text-blue-600">
                        자동 모드: 세그먼트가 끝나면 통역 단계로 자동 전환됩니다
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 통역 녹음 컨트롤 */}
              {practiceMode === 'interpret' && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-6 mb-6">
                  <h4 className="text-lg font-semibold text-red-800 mb-4 flex items-center gap-2">
                    <span>🎙️</span> 통역 녹음 단계
                  </h4>
                  
                  {/* 녹음 버튼을 정가운데 배치 */}
                  <div className="flex justify-center mb-4">
                    <button
                      onClick={toggleRecording}
                      className={`w-24 h-24 rounded-full text-4xl font-bold transition-all duration-300 shadow-lg flex items-center justify-center ${
                        isRecording
                          ? 'bg-red-600 text-white animate-pulse hover:bg-red-700'
                          : 'bg-red-500 text-white hover:bg-red-600 hover:scale-105'
                      }`}
                      style={{ lineHeight: '1' }}
                    >
                      {isRecording ? '⏹️' : '🎙️'}
                    </button>
                  </div>
                  
                  {/* 녹음 타이머와 텍스트를 별도로 중앙 정렬 */}
                  <div className="text-center mb-6">
                    <div className="text-3xl font-mono font-bold text-red-600 mb-2">
                      {formatTime(recordingTime)}
                    </div>
                    <div className="text-gray-600">
                      {isRecording ? '녹음 중... 한국어로 통역해주세요' : '녹음 시작하기'}
                    </div>
                  </div>

                  {/* 실시간 음성 인식 결과 */}
                  <div className="bg-white border-2 border-red-200 rounded-xl p-4 min-h-[100px]">
                    <div className="text-sm font-medium text-red-700 mb-2">실시간 음성 인식 결과:</div>
                    {(accumulatedText || currentText) ? (
                      <div className="text-lg text-gray-800 leading-relaxed">
                        <span className="font-medium">{accumulatedText}</span>
                        <span className="text-gray-500 italic">{currentText}</span>
                      </div>
                    ) : (
                      <div className="text-gray-400 italic text-center py-6">
                        {isRecording ? '음성을 인식하고 있습니다...' : '녹음을 시작하면 실시간으로 텍스트가 표시됩니다'}
                      </div>
                    )}
                  </div>

                  {/* 컨트롤 버튼들 */}
                  <div className="flex gap-3 mt-4">
                    <button
                      onClick={replayCurrentSegment}
                      className="flex-1 py-3 px-4 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                    >
                      🔁 다시 듣기
                    </button>
                    {accumulatedText.trim() && (
                      <button
                        onClick={() => {
                          setAccumulatedText('');
                          setCurrentText('');
                          setRecordingTime(0);
                        }}
                        className="py-3 px-4 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors"
                      >
                        🗑️ 초기화
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* 검토 단계 */}
              {practiceMode === 'review' && (
                <div className="bg-green-50 border border-green-200 rounded-xl p-6 mb-6">
                  <h4 className="text-lg font-semibold text-green-800 mb-4 flex items-center gap-2">
                    <span>📝</span> 검토 단계
                  </h4>
                  
                  {/* 내 통역 결과 */}
                  <div className="bg-white border border-green-200 rounded-lg p-4 mb-4">
                    <div className="flex justify-between items-center mb-2">
                      <h5 className="font-semibold text-green-700">
                        내 통역 결과 (세그먼트 {practiceSegmentIndex + 1}):
                      </h5>
                      <button
                        onClick={toggleUserRecording}
                        disabled={!audioBlob}
                        className={`px-3 py-1 rounded text-xs ${
                          isPlayingUserAudio
                            ? 'bg-red-100 text-red-600 hover:bg-red-200'
                            : 'bg-green-100 text-green-600 hover:bg-green-200'
                        }`}
                      >
                        {isPlayingUserAudio ? '⏸️ 일시정지' : '🔊 듣기'}
                      </button>
                    </div>
                    <p className="text-gray-800 leading-relaxed">
                      {recordedSegments[practiceSegmentIndex] || accumulatedText || '녹음된 내용이 없습니다.'}
                    </p>
                    {/* 디버그 정보 */}
                    <div className="mt-2 text-xs text-gray-500 border-t pt-2">
                      듣기 연습한 원문: {segments[practiceSegmentIndex]?.original_text || '원문 없음'}
                    </div>
                  </div>

                  {/* AI 제안 답안 */}
                  {segments[practiceSegmentIndex] && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                      <div className="flex justify-between items-center mb-2">
                        <h5 className="font-semibold text-blue-700">
                          AI 제안 답안 (세그먼트 {practiceSegmentIndex + 1}):
                        </h5>
                        <button
                          onClick={toggleModelInterpretation}
                          className={`px-3 py-1 rounded text-xs ${
                            isPlayingModelAudio
                              ? 'bg-red-100 text-red-600 hover:bg-red-200'
                              : 'bg-blue-100 text-blue-600 hover:bg-blue-200'
                          }`}
                        >
                          {isPlayingModelAudio ? '⏸️ 일시정지' : '🔊 듣기'}
                        </button>
                      </div>
                      <p className="text-gray-800 leading-relaxed mb-3">
                        {segments[practiceSegmentIndex].translation_suggestion}
                      </p>
                      
                      {/* 키워드 */}
                      {segments[practiceSegmentIndex].keywords && segments[practiceSegmentIndex].keywords.length > 0 && (
                        <div className="mb-3">
                          <div className="text-sm font-medium text-blue-700 mb-2">🔑 핵심 키워드:</div>
                          <div className="flex flex-wrap gap-2">
                            {segments[practiceSegmentIndex].keywords.map((keyword, keyIndex) => (
                              <span 
                                key={keyIndex}
                                className="bg-yellow-100 text-yellow-800 text-sm px-3 py-1 rounded-full font-medium"
                              >
                                {keyword}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {/* 디버그 정보 */}
                      <div className="text-xs text-gray-500 border-t pt-2">
                        원문: {segments[practiceSegmentIndex].original_text}
                      </div>
                    </div>
                  )}

                  {/* 다음 단계 버튼들 */}
                  <div className="flex gap-3">
                    <button
                      onClick={() => {
                        setPracticeMode('listen');
                        setAccumulatedText('');
                        setCurrentText('');
                        setRecordingTime(0);
                      }}
                      className="flex-1 py-3 px-4 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                    >
                      🔁 다시 연습
                    </button>
                    <button
                      onClick={goToNextSegment}
                      disabled={practiceSegmentIndex >= segments.length - 1}
                                          className={`flex-1 py-3 px-4 rounded-lg transition-colors ${
                        practiceSegmentIndex >= segments.length - 1
                          ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                          : 'bg-green-500 text-white hover:bg-green-600'
                      }`}
                    >
                      ➡️ 다음 세그먼트
                    </button>
                  </div>
                </div>
              )}

              {/* 기본 컨트롤 버튼들 (수동 모드용) */}
              {!isAutoMode && (
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                  <h4 className="text-sm font-semibold text-gray-700 mb-3">수동 제어</h4>
                  <div className="flex gap-3">
                    <button 
                      onClick={() => {
                        if (player) {
                          if (isPlaying) {
                            player.pauseVideo();
                          } else {
                            player.playVideo();
                          }
                        }
                      }}
                      disabled={!player}
                      className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                        !player 
                          ? 'bg-gray-400 text-gray-600 cursor-not-allowed'
                          : 'bg-green-500 text-white hover:bg-green-600'
                      }`}
                    >
                      {isPlaying ? '⏸️ 일시정지' : '▶️ 재생'}
                    </button>
                    <button 
                      onClick={() => {
                        if (player && segments.length > 0) {
                          // 통역 연습 상태 초기화
                          setPracticeMode('listen');
                          setPracticeSegmentIndex(0);
                          setCurrentScript(0);
                          setAccumulatedText('');
                          setCurrentText('');
                          setRecordingTime(0);
                          
                          // 녹음 중이었다면 중지
                          if (isRecordingRef.current) {
                            stopRecording();
                          }
                          
                          // 자동 감지 잠시 비활성화
                          setAutoDetectionEnabled(false);
                          
                          const startTime = timeToSeconds(segments[0].start_time);
                          player.seekTo(startTime);
                          
                          // 1초 후 자동 감지 재활성화
                          setTimeout(() => {
                            setAutoDetectionEnabled(true);
                          }, 1000);
                        }
                      }}
                      disabled={!player}
                      className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                        !player 
                          ? 'bg-gray-400 text-gray-600 cursor-not-allowed'
                          : 'bg-yellow-500 text-white hover:bg-yellow-600'
                      }`}
                    >
                      🔄 처음부터
                    </button>
                    <button 
                      onClick={() => {
                        if (player && currentScript < segments.length) {
                          // 통역 연습 상태 초기화
                          setPracticeMode('listen');
                          setPracticeSegmentIndex(currentScript);
                          setAccumulatedText('');
                          setCurrentText('');
                          setRecordingTime(0);
                          
                          // 녹음 중이었다면 중지
                          if (isRecordingRef.current) {
                            stopRecording();
                          }
                          
                          // 자동 감지 잠시 비활성화
                          setAutoDetectionEnabled(false);
                          
                          const startTime = timeToSeconds(segments[currentScript].start_time);
                          player.seekTo(startTime);
                          player.playVideo();
                          
                          // 1초 후 자동 감지 재활성화
                          setTimeout(() => {
                            setAutoDetectionEnabled(true);
                          }, 1000);
                        }
                      }}
                      disabled={!player || segments.length === 0}
                      className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                        !player || segments.length === 0
                          ? 'bg-gray-400 text-gray-600 cursor-not-allowed'
                          : 'bg-blue-500 text-white hover:bg-blue-600'
                      }`}
                    >
                      🎯 현재 세그먼트
                    </button>
                  </div>
                </div>
              )}
            </div>
            
            {/* 오른쪽: 연습 설정 및 자막 패널 (1/3) */}
            <div className="bg-white rounded-2xl p-6 shadow-lg">
              
              {/* 통역 설정 */}
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">⚙️ 통역 설정</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-gray-700 font-medium mb-1">재생 속도</label>
                    <select className="w-full p-2 border-2 border-gray-300 rounded-md">
                      <option>정상 속도 (1.0x)</option>
                      <option>느림 (0.8x)</option>
                      <option>더 느림 (0.6x)</option>
                      <option>빠름 (1.2x)</option>
                    </select>
                  </div>
                </div>
              </div>
              
              {/* 연습 상태 */}
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">📊 연습 현황</h3>
                <div className="space-y-2">
                  <div className="flex justify-between p-3 bg-gray-100 rounded-md">
                    <span className="text-gray-700 font-medium">총 세그먼트</span>
                    <span className="text-gray-900 font-semibold">{segments.length}개</span>
                  </div>
                  <div className="flex justify-between p-3 bg-gray-100 rounded-md">
                    <span className="text-gray-700 font-medium">현재 구간</span>
                    <span className="text-gray-900 font-semibold">#{currentScript + 1}</span>
                  </div>
                  <div className="flex justify-between p-3 bg-gray-100 rounded-md">
                    <span className="text-gray-700 font-medium">진행률</span>
                    <span className="text-gray-900 font-semibold">
                      {Math.round(((currentScript + 1) / segments.length) * 100)}%
                    </span>
                  </div>
                  <div className="flex justify-between p-3 bg-gray-100 rounded-md">
                    <span className="text-gray-700 font-medium">남은 구간</span>
                    <span className="text-gray-900 font-semibold">{segments.length - currentScript - 1}개</span>
                  </div>
                </div>
              </div>
              
              {/* 자막 스크립트 */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">📝 자막 스크립트</h3>
                <div 
                  ref={scriptContainerRef}
                  className="h-[28rem] overflow-y-auto border-2 border-gray-300 rounded-lg p-4 bg-gray-50"
                >
                  {segments.map((segment, index) => (
                    <div
                      key={segment.id}
                      onClick={() => {
                        // 통역 연습 상태 초기화
                        setPracticeMode('listen');
                        setPracticeSegmentIndex(index);
                        setCurrentScript(index);
                        setAccumulatedText('');
                        setCurrentText('');
                        setRecordingTime(0);
                        
                        // 녹음 중이었다면 중지
                        if (isRecordingRef.current) {
                          stopRecording();
                        }
                        
                        if (player) {
                          const startTime = timeToSeconds(segment.start_time);
                          
                          // 자동 감지는 유지하고, 현재 시간만 업데이트
                          setLastAutoDetectionEnabledTime(Date.now());
                          
                          // 영상 위치 이동 및 재생 시작
                          player.seekTo(startTime);
                          player.playVideo();
                        }
                      }}
                      className={`p-3 mb-2 rounded cursor-pointer transition-all ${
                        currentScript === index
                          ? 'bg-blue-100 border-l-4 border-blue-500 shadow-md scale-105'
                          : 'hover:bg-gray-200'
                      }`}
                    >
                      <div className="text-gray-600 text-xs mb-1">
                        [{segment.start_time} - {segment.end_time}]
                      </div>
                      <div className="text-gray-900 font-medium text-sm">
                        {segment.original_text}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VisualInterpretation; 