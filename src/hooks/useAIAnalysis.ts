import { useState, useCallback } from 'react';
import { aiAnalysisService } from '../services/aiAnalysisService';
import type { TranslationMistake } from '../services/aiAnalysisService';

export const useAIAnalysis = () => {
  const [aiResponses, setAiResponses] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<Record<string, string>>({});
  
  const generateAdvice = useCallback(async (userProfile: any, recentPerformance: any) => {
    const cacheKey = 'advice';
    setLoading(prev => ({ ...prev, [cacheKey]: true }));
    setError(prev => ({ ...prev, [cacheKey]: '' }));
    
    try {
      const advice = await aiAnalysisService.generatePersonalizedAdvice(userProfile, recentPerformance);
      setAiResponses(prev => ({ ...prev, [cacheKey]: advice }));
    } catch (err) {
      console.error('AI 조언 생성 실패:', err);
      setError(prev => ({ ...prev, [cacheKey]: '조언 생성에 실패했습니다.' }));
    } finally {
      setLoading(prev => ({ ...prev, [cacheKey]: false }));
    }
  }, []);
  
  const analyzeStyle = useCallback(async (translationSamples: TranslationMistake[]) => {
    const cacheKey = 'style';
    setLoading(prev => ({ ...prev, [cacheKey]: true }));
    setError(prev => ({ ...prev, [cacheKey]: '' }));
    
    try {
      const styleAnalysis = await aiAnalysisService.analyzeTranslationStyle(translationSamples);
      setAiResponses(prev => ({ ...prev, [cacheKey]: styleAnalysis }));
    } catch (err) {
      console.error('AI 스타일 분석 실패:', err);
      setError(prev => ({ ...prev, [cacheKey]: '스타일 분석에 실패했습니다.' }));
    } finally {
      setLoading(prev => ({ ...prev, [cacheKey]: false }));
    }
  }, []);
  
  const analyzeMistakes = useCallback(async (mistakes: TranslationMistake[]) => {
    const cacheKey = 'mistakes';
    setLoading(prev => ({ ...prev, [cacheKey]: true }));
    setError(prev => ({ ...prev, [cacheKey]: '' }));
    
    try {
      const mistakeAnalysis = await aiAnalysisService.analyzeMistakePatterns(mistakes);
      setAiResponses(prev => ({ ...prev, [cacheKey]: mistakeAnalysis }));
    } catch (err) {
      console.error('AI 실수 분석 실패:', err);
      setError(prev => ({ ...prev, [cacheKey]: '실수 분석에 실패했습니다.' }));
    } finally {
      setLoading(prev => ({ ...prev, [cacheKey]: false }));
    }
  }, []);
  
  const optimizePlan = useCallback(async (userProfile: any, currentPlan: any) => {
    const cacheKey = 'plan';
    setLoading(prev => ({ ...prev, [cacheKey]: true }));
    setError(prev => ({ ...prev, [cacheKey]: '' }));
    
    try {
      const optimizedPlan = await aiAnalysisService.optimizeLearningPlan(userProfile, currentPlan);
      setAiResponses(prev => ({ ...prev, [cacheKey]: optimizedPlan }));
    } catch (err) {
      console.error('AI 계획 최적화 실패:', err);
      setError(prev => ({ ...prev, [cacheKey]: '계획 최적화에 실패했습니다.' }));
    } finally {
      setLoading(prev => ({ ...prev, [cacheKey]: false }));
    }
  }, []);
  
  const clearCache = useCallback((key?: string) => {
    if (key) {
      setAiResponses(prev => {
        const newResponses = { ...prev };
        delete newResponses[key];
        return newResponses;
      });
      setLoading(prev => {
        const newLoading = { ...prev };
        delete newLoading[key];
        return newLoading;
      });
      setError(prev => {
        const newError = { ...prev };
        delete newError[key];
        return newError;
      });
    } else {
      setAiResponses({});
      setLoading({});
      setError({});
    }
  }, []);
  
  return {
    aiResponses,
    loading,
    error,
    generateAdvice,
    analyzeStyle,
    analyzeMistakes,
    optimizePlan,
    clearCache
  };
}; 