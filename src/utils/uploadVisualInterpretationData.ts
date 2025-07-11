import { db } from '../firebase';
import { collection, doc, setDoc } from 'firebase/firestore';
import visualInterpretationData from '../assets/visual_interpretation_data.json';

export const uploadVisualInterpretationData = async () => {
  try {
    // 하나의 문서에 모든 세그먼트를 필드로 저장할 객체 생성
    const documentData: Record<string, any> = {
      // video_info 추가
      video_info: visualInterpretationData.video_info
    };
    
    // 각 세그먼트를 필드로 추가
    visualInterpretationData.segments.forEach(segment => {
      const fieldName = `segment_${segment.id.toString().padStart(3, '0')}`;
      documentData[fieldName] = segment;
    });
    
    // 파이어베이스에 업로드
    const docRef = doc(db, 'visual_interpretation_Ted', visualInterpretationData.video_info.id);
    await setDoc(docRef, documentData);
    
    console.log('Visual interpretation data uploaded successfully!');
    console.log(`문서 ID: ${visualInterpretationData.video_info.id}`);
    console.log(`총 필드 수: ${Object.keys(documentData).length} (video_info + 46개 세그먼트)`);
    
  } catch (error) {
    console.error('Error uploading visual interpretation data:', error);
    throw error;
  }
}; 