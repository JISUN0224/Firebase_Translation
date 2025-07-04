# 번역 학습 플랫폼 (Translation Learning Platform)

React + TypeScript + Vite 기반의 AI 통역 피드백 시스템입니다.

## 🚀 기능

- 🎙️ **실시간 음성 인식**: Web Speech API를 사용한 중국어 음성 인식
- 🤖 **AI 품질 분석**: Google Gemini API를 사용한 통역 품질 평가
- 📊 **세부 평가**: 정확성, 유창성, 문법, 완성도 4개 항목 평가
- 🎯 **맞춤 피드백**: 잘한 점과 개선점 제시

## 🔧 설정 방법

### 1. Gemini API 키 설정

1. [Google AI Studio](https://makersuite.google.com/app/apikey)에서 API 키 생성
2. 프로젝트 루트에 `.env` 파일 생성:
```bash
VITE_GEMINI_API_KEY=your_gemini_api_key_here
```

### 2. 설치 및 실행

```bash
npm install
npm run dev
```

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default tseslint.config({
  extends: [
    // Remove ...tseslint.configs.recommended and replace with this
    ...tseslint.configs.recommendedTypeChecked,
    // Alternatively, use this for stricter rules
    ...tseslint.configs.strictTypeChecked,
    // Optionally, add this for stylistic rules
    ...tseslint.configs.stylisticTypeChecked,
  ],
  languageOptions: {
    // other options...
    parserOptions: {
      project: ['./tsconfig.node.json', './tsconfig.app.json'],
      tsconfigRootDir: import.meta.dirname,
    },
  },
})
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default tseslint.config({
  plugins: {
    // Add the react-x and react-dom plugins
    'react-x': reactX,
    'react-dom': reactDom,
  },
  rules: {
    // other rules...
    // Enable its recommended typescript rules
    ...reactX.configs['recommended-typescript'].rules,
    ...reactDom.configs.recommended.rules,
  },
})
```
