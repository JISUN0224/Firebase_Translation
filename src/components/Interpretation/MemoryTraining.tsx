import React, { useState, useEffect } from 'react';
import { TextToSpeech } from 'tts-react';

interface MemoryTrainingData {
  id: string;
  title: string;
  content: string;
  keywords: string[];
  blanks?: string[];
  sentence_order?: string[];
}

const MemoryTraining: React.FC = () => {
  const [selectedVoice, setSelectedVoice] = useState<SpeechSynthesisVoice | null>(null);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [currentData, setCurrentData] = useState<MemoryTrainingData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // 사용 가능한 음성 목록 가져오기
    const loadVoices = () => {
      const availableVoices = window.speechSynthesis.getVoices();
      setVoices(availableVoices);
      
      // 한국어 음성이 있다면 기본으로 설정
      const koreanVoice = availableVoices.find(voice => voice.lang.includes('ko-KR'));
      if (koreanVoice) {
        setSelectedVoice(koreanVoice);
      }
    };

    loadVoices();
    
    if (typeof window !== 'undefined') {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.speechSynthesis.onvoiceschanged = null;
      }
    };
  }, []);

  // JSON 데이터 로드
  useEffect(() => {
    const loadData = async () => {
      try {
        const response = await fetch('/Merged_interpreting_practice.json');
        const data = await response.json();
        if (data && data.length > 0) {
          setCurrentData(data[0]); // 첫 번째 데이터로 시작
        }
        setIsLoading(false);
      } catch (error) {
        console.error('데이터 로드 중 오류:', error);
        setIsLoading(false);
      }
    };

    loadData();
  }, []);

  if (isLoading) {
    return <div>로딩 중...</div>;
  }

  if (!currentData) {
    return <div>데이터를 불러올 수 없습니다.</div>;
  }

  return (
    <div className="p-4">
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          음성 선택:
        </label>
        <select 
          className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
          onChange={(e) => {
            const selectedVoice = voices.find(v => v.voiceURI === e.target.value);
            setSelectedVoice(selectedVoice || null);
          }}
          value={selectedVoice?.voiceURI || ''}
        >
          <option value="">기본 음성</option>
          {voices
            .filter(voice => voice.lang.includes('ko-'))
            .map((voice) => (
              <option key={voice.voiceURI} value={voice.voiceURI}>
                {voice.name} ({voice.lang})
              </option>
          ))}
        </select>
      </div>

      <div className="mt-4">
        <h2 className="text-xl font-bold mb-2">{currentData.title}</h2>
        <div className="bg-white rounded-lg shadow p-4">
          <TextToSpeech 
            voice={selectedVoice || undefined}
            rate={0.9} // 약간 천천히 읽기
            markTextAsSpoken // 읽고 있는 텍스트 하이라이트
          >
            <p className="text-gray-700 text-lg leading-relaxed">
              {currentData.content}
            </p>
          </TextToSpeech>
        </div>
      </div>

      <div className="mt-4">
        <h3 className="text-lg font-semibold mb-2">키워드:</h3>
        <div className="flex flex-wrap gap-2">
          {currentData.keywords.map((keyword, index) => (
            <div key={index} className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full">
              <TextToSpeech voice={selectedVoice || undefined}>
                <span>{keyword}</span>
              </TextToSpeech>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default MemoryTraining; 