// AI 분석 서비스 클래스
interface TranslationMistake {
  original: string;
  userAnswer: string;
  correctAnswer: string;
  category: string;
  timestamp: string;
}

interface AIAnalysisRequest {
  userProfile: {
    totalSessions: number;
    averageScore: number;
    strongAreas: string[];
    weakAreas: string[];
    studyPattern: string;
  };
  recentPerformance: {
    scores: number[];
    mistakes: TranslationMistake[];
    studyTime: number[];
  };
  analysisType: 'advice' | 'style' | 'mistakes' | 'planning' | 'difficulty';
}

interface AIAnalysisResponse {
  type: string;
  content: string;
  confidence: number;
  suggestions: string[];
  metadata?: any;
}

class AIAnalysisService {
  private apiKey: string;
  private baseUrl: string;
  
  constructor() {
    this.apiKey = import.meta.env.VITE_GEMINI_API_KEY || '';
    this.baseUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent';
  }
  
  async generatePersonalizedAdvice(userProfile: any, recentPerformance: any): Promise<string[]> {
    const prompt = this.buildAdvicePrompt(userProfile, recentPerformance);
    
    try {
      const response = await this.callGemini(prompt, 'advice');
      return this.parseAdviceResponse(response);
    } catch (error) {
      console.error('AI 조언 생성 실패:', error);
      // 폴백: 기존 규칙 기반 로직
      return this.fallbackAdvice(userProfile);
    }
  }
  
  async analyzeTranslationStyle(translationSamples: TranslationMistake[]): Promise<{
    style: string;
    tendency: string;
    score: number;
    explanation: string;
  }> {
    const prompt = this.buildStyleAnalysisPrompt(translationSamples);
    
    try {
      const response = await this.callGemini(prompt, 'style');
      return this.parseStyleResponse(response);
    } catch (error) {
      console.error('번역 스타일 분석 실패:', error);
      return this.fallbackStyleAnalysis();
    }
  }
  
  async analyzeMistakePatterns(mistakes: TranslationMistake[]): Promise<{
    patterns: string[];
    causes: string[];
    improvements: string[];
  }> {
    const prompt = this.buildMistakeAnalysisPrompt(mistakes);
    
    try {
      const response = await this.callGemini(prompt, 'mistakes');
      return this.parseMistakeResponse(response);
    } catch (error) {
      console.error('실수 패턴 분석 실패:', error);
      return this.fallbackMistakeAnalysis(mistakes);
    }
  }
  
  async optimizeLearningPlan(userProfile: any, currentPlan: any): Promise<{
    optimizedPlan: any[];
    reasoning: string;
    expectedImprovement: number;
  }> {
    const prompt = this.buildPlanOptimizationPrompt(userProfile, currentPlan);
    
    try {
      const response = await this.callGemini(prompt, 'planning');
      return this.parsePlanResponse(response);
    } catch (error) {
      console.error('학습 계획 최적화 실패:', error);
      return this.fallbackPlanOptimization(currentPlan);
    }
  }
  
  private async callGemini(prompt: string, type: string): Promise<string> {
    if (!this.apiKey) {
      throw new Error('Gemini API 키가 설정되지 않았습니다.');
    }

    const response = await fetch(`${this.baseUrl}?key=${this.apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: this.getSystemPrompt(type) + '\n\n' + prompt
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.7,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 1000,
        },
      }),
    });
    
    if (!response.ok) {
      throw new Error(`Gemini API 호출 실패: ${response.statusText}`);
    }
    
    const data = await response.json();
    return data.candidates[0].content.parts[0].text;
  }
  
  private buildAdvicePrompt(userProfile: any, recentPerformance: any): string {
    return `
번역 학습자 프로필:
- 총 학습 세션: ${userProfile.totalSessions}회
- 평균 점수: ${userProfile.averageScore}점
- 강한 분야: ${userProfile.strongAreas.join(', ')}
- 약한 분야: ${userProfile.weakAreas.join(', ')}
- 최근 5회 점수: ${recentPerformance.scores.join(', ')}점
- 연속 학습일: ${userProfile.streakDays}일

위 데이터를 바탕으로 이 학습자에게 개인화된 학습 조언 3개를 생성해주세요.
각 조언은 구체적이고 실행 가능해야 하며, 격려와 동기부여가 포함되어야 합니다.
JSON 형식으로 응답해주세요: {"advice": ["조언1", "조언2", "조언3"]}
    `;
  }
  
  private buildStyleAnalysisPrompt(samples: TranslationMistake[]): string {
    const sampleTexts = samples.slice(0, 5).map(s => 
      `원문: ${s.original}\n사용자 번역: ${s.userAnswer}\n정답: ${s.correctAnswer}`
    ).join('\n\n');
    
    return `
다음은 한 사용자의 번역 샘플들입니다:

${sampleTexts}

이 사용자의 번역 스타일을 분석해서 다음 정보를 제공해주세요:
1. 번역 성향 (직역형/의역형)
2. 문체 선호도 (격식체/구어체)
3. 번역 스타일 점수 (100점 만점)
4. 스타일 특성에 대한 자세한 설명

JSON 형식으로 응답: {
  "style": "의역형" | "직역형" | "균형형",
  "tendency": "격식체" | "구어체" | "혼합",
  "score": 85,
  "explanation": "상세 설명"
}
    `;
  }
  
  private buildMistakeAnalysisPrompt(mistakes: TranslationMistake[]): string {
    const mistakeTexts = mistakes.slice(0, 10).map(m => 
      `원문: ${m.original}\n사용자: ${m.userAnswer}\n정답: ${m.correctAnswer}\n분야: ${m.category}`
    ).join('\n\n');
    
    return `
다음은 한 사용자가 틀린 번역 문제들입니다:

${mistakeTexts}

이 실수들을 분석해서 다음을 제공해주세요:
1. 공통 실수 패턴 (최대 3개)
2. 실수의 근본 원인 (최대 3개)
3. 구체적인 개선 방안 (최대 3개)

JSON 형식으로 응답: {
  "patterns": ["패턴1", "패턴2", "패턴3"],
  "causes": ["원인1", "원인2", "원인3"],
  "improvements": ["개선방안1", "개선방안2", "개선방안3"]
}
    `;
  }
  
  private buildPlanOptimizationPrompt(userProfile: any, currentPlan: any): string {
    return `
사용자 프로필:
- 총 학습 세션: ${userProfile.totalSessions}회
- 평균 점수: ${userProfile.averageScore}점
- 강한 분야: ${userProfile.strongAreas.join(', ')}
- 약한 분야: ${userProfile.weakAreas.join(', ')}

현재 학습 계획:
${JSON.stringify(currentPlan, null, 2)}

이 사용자의 학습 효율성을 극대화하는 개인 맞춤형 학습 계획을 재구성해주세요.
JSON 형식으로 응답: {
  "optimizedPlan": [계획 배열],
  "reasoning": "최적화 이유",
  "expectedImprovement": 15
}
    `;
  }
  
  private parseAdviceResponse(response: string): string[] {
    try {
      const parsed = JSON.parse(response);
      return parsed.advice || [];
    } catch (error) {
      console.error('AI 응답 파싱 실패:', error);
      return this.fallbackAdvice({});
    }
  }
  
  private parseStyleResponse(response: string): {
    style: string;
    tendency: string;
    score: number;
    explanation: string;
  } {
    try {
      const parsed = JSON.parse(response);
      return {
        style: parsed.style || '균형형',
        tendency: parsed.tendency || '혼합',
        score: parsed.score || 75,
        explanation: parsed.explanation || '분석 중...'
      };
    } catch (error) {
      console.error('스타일 응답 파싱 실패:', error);
      return this.fallbackStyleAnalysis();
    }
  }
  
  private parseMistakeResponse(response: string): {
    patterns: string[];
    causes: string[];
    improvements: string[];
  } {
    try {
      const parsed = JSON.parse(response);
      return {
        patterns: parsed.patterns || [],
        causes: parsed.causes || [],
        improvements: parsed.improvements || []
      };
    } catch (error) {
      console.error('실수 분석 응답 파싱 실패:', error);
      return this.fallbackMistakeAnalysis([]);
    }
  }
  
  private parsePlanResponse(response: string): {
    optimizedPlan: any[];
    reasoning: string;
    expectedImprovement: number;
  } {
    try {
      const parsed = JSON.parse(response);
      return {
        optimizedPlan: parsed.optimizedPlan || [],
        reasoning: parsed.reasoning || '분석 중...',
        expectedImprovement: parsed.expectedImprovement || 10
      };
    } catch (error) {
      console.error('계획 응답 파싱 실패:', error);
      return this.fallbackPlanOptimization([]);
    }
  }
  
  private getSystemPrompt(type: string): string {
    const basePrompt = `당신은 전문 번역 교육자이자 AI 학습 코치입니다. 
사용자의 번역 학습 데이터를 분석해서 개인화된 조언을 제공합니다.`;
    
    const typeSpecific: Record<string, string> = {
      advice: '구체적이고 실행 가능한 학습 조언을 친근하고 격려하는 톤으로 제공하세요.',
      style: '번역 스타일을 객관적으로 분석하고 특성을 명확히 설명하세요.',
      mistakes: '실수 패턴을 체계적으로 분석하고 실용적인 개선 방안을 제시하세요.',
      planning: '학습 효율성을 극대화하는 개인 맞춤형 계획을 수립하세요.'
    };
    
    return `${basePrompt} ${typeSpecific[type] || ''}`;
  }
  
  // 폴백 함수들
  private fallbackAdvice(userProfile: any): string[] {
    return [
      `${userProfile.strongAreas?.[0] || '번역'} 분야에서 탁월한 성과를 보이고 있어요! 이 강점을 활용해 다른 분야도 향상시켜보세요.`,
      '꾸준한 학습이 실력 향상의 핵심이에요. 매일 조금씩이라도 학습하는 습관을 유지해보세요.',
      '어려운 부분이 있다면 천천히, 차근차근 접근해보세요. 실수는 학습의 일부입니다.'
    ];
  }
  
  private fallbackStyleAnalysis(): {
    style: string;
    tendency: string;
    score: number;
    explanation: string;
  } {
    return {
      style: '균형형',
      tendency: '혼합',
      score: 75,
      explanation: '번역 스타일 분석을 위해 더 많은 데이터가 필요합니다.'
    };
  }
  
  private fallbackMistakeAnalysis(mistakes: TranslationMistake[]): {
    patterns: string[];
    causes: string[];
    improvements: string[];
  } {
    return {
      patterns: ['일반적인 실수 패턴'],
      causes: ['학습 부족'],
      improvements: ['더 많은 연습이 필요합니다']
    };
  }
  
  private fallbackPlanOptimization(currentPlan: any): {
    optimizedPlan: any[];
    reasoning: string;
    expectedImprovement: number;
  } {
    return {
      optimizedPlan: currentPlan || [],
      reasoning: '현재 계획을 유지하는 것이 좋겠습니다.',
      expectedImprovement: 5
    };
  }
}

export const aiAnalysisService = new AIAnalysisService();
export type { TranslationMistake, AIAnalysisRequest, AIAnalysisResponse }; 