# 번역 학습 플랫폼 (Translation Learning Platform)

React + TypeScript + Vite 기반의 AI 통역 피드백 시스템입니다.

## 🚀 기능

- 🎙️ **실시간 음성 인식**: Web Speech API를 사용한 중국어 음성 인식
- 🤖 **AI 품질 분석**: Google Gemini API를 사용한 통역 품질 평가
- 📊 **세부 평가**: 정확성, 유창성, 문법, 완성도 4개 항목 평가
- 🎯 **맞춤 피드백**: 잘한 점과 개선점 제시

## 🎯 현재 설정된 영상

**URL**: `https://www.youtube.com/watch?v=2sfSd89akeE`

다른 영상을 처리하려면 `youtube_to_transcript.py` 파일의 175번째 줄에서 URL을 변경하세요:
```python
youtube_url = "새로운_유튜브_URL"
```

## 🚀 사용법

### Windows
1. `run_youtube_converter.bat` 파일을 더블클릭
2. 자동으로 필요한 패키지 설치 및 변환 시작

### Mac/Linux
1. 터미널에서 다음 명령어 실행:
```bash
bash run_youtube_converter.sh
```

### 수동 실행
```bash
python youtube_to_transcript.py
```

## 📁 결과 파일

변환 완료 후 `output/` 폴더에 다음 파일들이 생성됩니다:

1. **📄 `영상제목.txt`** - 순수 텍스트
2. **🎬 `영상제목.srt`** - 비디오 플레이어용 자막
3. **🌐 `영상제목.vtt`** - 웹브라우저용 자막
4. **🎵 `영상제목.mp3`** - 추출된 음성 파일

## 📝 SRT 자막 파일 예시

```srt
1
00:00:00,000 --> 00:00:03,200
大家好，我今天想跟大家分享

2
00:00:03,200 --> 00:00:07,840
关于人工智能的未来发展趋势

3
00:00:07,840 --> 00:00:12,160
首先，让我们来看看AI技术
```

## ⚙️ 시스템 요구사항

- **Python 3.7+** (자동 설치됨)
- **인터넷 연결** (패키지 설치 및 YouTube 다운로드용)
- **충분한 저장공간** (음성 파일 + Whisper 모델)

## 🔧 수동 설치 (선택사항)

자동 설치가 안 될 경우:
```bash
pip install openai-whisper yt-dlp
```

## ⚡ 성능 정보

- **첫 실행**: Whisper 모델 다운로드로 시간이 걸립니다 (1-2GB)
- **이후 실행**: 빠른 변환 속도
- **정확도**: 중국어 인식률 95%+ (표준 중국어 기준)

## 🎯 지원 언어

현재 **중국어**로 설정되어 있으며, 다른 언어로 변경 가능:
```python
# youtube_to_transcript.py 85번째 줄
language="zh",  # 중국어
# language="ko",  # 한국어
# language="en",  # 영어
# language="ja",  # 일본어
```

## 🔍 문제 해결

### 1. "yt-dlp를 찾을 수 없습니다"
```bash
pip install yt-dlp
```

### 2. "Whisper를 찾을 수 없습니다"
```bash
pip install openai-whisper
```

### 3. "YouTube 다운로드 실패"
- 인터넷 연결 확인
- 영상 URL이 올바른지 확인
- 비공개/제한된 영상인지 확인

### 4. "음성 인식 실패"
- 음성이 너무 작거나 잡음이 많을 수 있음
- 다른 Whisper 모델 시도: `base` → `small` → `medium` → `large-v2`

## 📞 지원

문제가 발생하면 다음을 확인해주세요:
1. Python 버전 3.7 이상
2. 인터넷 연결 상태
3. 충분한 디스크 공간 (3GB+)

## 🗑️ 파일 정리

작업 완료 후 임시 파일들을 삭제하려면:
- `youtube_to_transcript.py`
- `run_youtube_converter.bat`
- `run_youtube_converter.sh`
- `README.md`
- `output/` 폴더 (필요시)

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
