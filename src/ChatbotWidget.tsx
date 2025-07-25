import React, { useState, useRef } from 'react';
import axios from 'axios';

interface ChatbotWidgetProps {
  initialContext: string; // 피드백 내용
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${import.meta.env.VITE_GEMINI_API_KEY}`;

const ChatbotWidget: React.FC<ChatbotWidgetProps> = ({ initialContext }) => {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Gemini API 호출
  const sendMessage = async (userMessage: string) => {
    setLoading(true);
    setError(null);
    try {
      // 현재 자막 정보에서 데이터 추출
      const contextParts = initialContext.split('\n');
      const currentText = contextParts.find(line => line.startsWith('현재 자막:'))?.replace('현재 자막:', '').trim() || '';
      const referenceTranslation = contextParts.find(line => line.startsWith('번역:'))?.replace('번역:', '').trim() || '';
      const userTranslation = contextParts.find(line => line.startsWith('내 번역:'))?.replace('내 번역:', '').trim() || '';

      // 개선된 프롬프트
      const prompt = `당신은 중국어-한국어 자막 번역 전문가입니다.

【현재 자막 정보】
• 중국어 원문: ${currentText}
• 정답 번역: ${referenceTranslation}
• 사용자 번역: ${userTranslation || '(아직 번역하지 않음)'}

【자막 번역 규칙】
• 글자 수: 30자 이하 권장 (최대 45자)
• 구어체 사용, 자연스러운 대화체
• 핵심 의미 전달, 불필요한 표현 생략
• 읽기 속도 고려
• 정답 번역을 기준으로, 격식체 또는 반말을 사용했는지 고려할 것

【답변 규칙】
- 간결하고 실용적으로 답변
- 불필요한 설명 최소화
- "**" 같은 강조 기호 사용 금지
- 번호나 • 기호로 구조화할 것
- 한 줄당 최대 30자 내외로 작성

【출력 예시】
• "입니다~"보다는 편한 말투가 더 적합합니다
• 글자수가 비교적 깁니다. 자막이라는 걸 고려하여 더 핵심 내용만 번역하도록 하세요

질문: ${userMessage}`;
      
      const data = {
        contents: [
          { parts: [ { text: prompt } ] }
        ]
      };
      const response = await axios.post(GEMINI_API_URL, data, { headers: { 'Content-Type': 'application/json' } });
      const answer = response.data.candidates?.[0]?.content?.parts?.[0]?.text || '답변을 받아오지 못했습니다.';
      setMessages(prev => [
        ...prev,
        { role: 'user', content: userMessage },
        { role: 'assistant', content: answer }
      ]);
      setInput('');
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    } catch (err: any) {
      setError('Gemini API 호출에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // 전송 핸들러
  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    sendMessage(input.trim());
  };

  // 최소화/닫기
  if (!open) {
    return (
      <div style={{ position: 'fixed', right: 32, bottom: '50%', transform: 'translateY(50%)', zIndex: 1000, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ marginBottom: 8, color: '#2563eb', fontWeight: 600, fontSize: '1.05rem', background: 'rgba(237,242,255,0.95)', borderRadius: 8, padding: '4px 14px', boxShadow: '0 2px 8px #2563eb11' }}>
          무엇이든 질문하세요
        </div>
        <button
          onClick={() => setOpen(true)}
          style={{
            width: 60,
            height: 60,
            borderRadius: '50%',
            background: '#2563eb',
            color: '#fff',
            fontSize: '1.5rem',
            boxShadow: '0 2px 12px rgba(30,64,175,0.13)',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          title="Gemini 챗봇 열기"
        >
          💬
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        position: 'fixed',
        right: 32,
        bottom: '50%',
        transform: 'translateY(50%)',
        width: 360,
        maxWidth: '90vw',
        height: 600,
        background: '#fff',
        borderRadius: 16,
        boxShadow: '0 4px 24px rgba(30,64,175,0.13)',
        zIndex: 1001,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* 헤더 */}
      <div style={{
        background: '#2563eb',
        color: '#fff',
        padding: '12px 20px',
        fontWeight: 700,
        fontSize: '1.1rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        Gemini 챗봇
        <button
          onClick={() => setOpen(false)}
          style={{ background: 'none', border: 'none', color: '#fff', fontSize: '1.3rem', cursor: 'pointer' }}
          title="닫기"
        >×</button>
      </div>
      {/* 대화 내역 */}
      <div style={{ flex: 1, padding: 16, overflowY: 'auto', background: '#f8fafc' }}>
        <div style={{ color: '#888', fontSize: '0.98em', marginBottom: 10 }}>
          아래는 번역 피드백입니다. 이 내용을 바탕으로 Gemini에게 추가 질문을 해보세요.<br/>
          <span style={{ color: '#2563eb', fontWeight: 600 }}>피드백 요약:</span>
          <div style={{ background: '#eef2ff', color: '#222', borderRadius: 8, padding: 8, margin: '8px 0', fontSize: '0.97em', maxHeight: 80, overflow: 'auto' }}>{initialContext.slice(0, 400)}{initialContext.length > 400 ? '...' : ''}</div>
        </div>
        {messages.length === 0 && (
          <div style={{ color: '#bbb', fontSize: '0.98em', textAlign: 'center', marginTop: 40 }}>
            질문을 입력해보세요!
          </div>
        )}
        {messages.map((msg, idx) => (
          <div key={idx} style={{
            marginBottom: 12,
            textAlign: msg.role === 'user' ? 'right' : 'left',
          }}>
            <div style={{
              display: 'inline-block',
              background: msg.role === 'user' ? '#dbeafe' : '#fff',
              color: '#222',
              borderRadius: 8,
              padding: '8px 12px',
              maxWidth: '80%',
              fontSize: '1em',
              boxShadow: msg.role === 'user' ? '0 1px 4px #93c5fd33' : '0 1px 4px #e0e7ff33',
            }}>
              {msg.content}
            </div>
          </div>
        ))}
        {error && <div style={{ color: 'red', marginTop: 8 }}>{error}</div>}
      </div>
      {/* 입력창 */}
      <form onSubmit={handleSend} style={{ display: 'flex', borderTop: '1px solid #e5e7eb', background: '#ffffff', padding: 10 }}>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="질문을 입력하세요..."
          style={{
            flex: 1,
            border: '1px solid #d1d5db',
            outline: 'none',
            background: '#ffffff',
            fontSize: '1em',
            padding: '8px 12px',
            color: '#111827',
            borderRadius: '6px',
            marginRight: '8px',
            boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.1)',
          }}
          disabled={loading}
        />
        <button
          type="submit"
          style={{
            background: '#2563eb',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            padding: '8px 16px',
            fontWeight: 700,
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.6 : 1,
            fontSize: '1em',
          }}
          disabled={loading || !input.trim()}
        >
          {loading ? '전송 중...' : '전송'}
        </button>
      </form>
    </div>
  );
};

export default ChatbotWidget; 