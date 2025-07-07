const { initializeApp } = require('firebase/app');
const { getFirestore, collection, writeBatch, doc } = require('firebase/firestore');
const memoryTrainingData = require('../src/assets/memory_training_data.json');

const firebaseConfig = {
  apiKey: "AIzaSyCagWLn4xDgzdogd0Ov50U5jVK-n1ng2Uk",
  authDomain: "translation-test-311b9.firebaseapp.com",
  projectId: "translation-test-311b9",
  storageBucket: "translation-test-311b9.firebasestorage.app",
  messagingSenderId: "236901580580",
  appId: "1:236901580580:web:d01458d2cc8318827f7db1",
  measurementId: "G-NJCESWVLF8"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function uploadData() {
  try {
    const batch = writeBatch(db);
    const exercisesRef = collection(db, 'memory_training_exercises');

    memoryTrainingData.exercises.forEach((exercise) => {
      const docRef = doc(exercisesRef, exercise.id);
      batch.set(docRef, exercise);
    });

    await batch.commit();
    console.log('데이터가 성공적으로 업로드되었습니다!');
  } catch (error) {
    console.error('데이터 업로드 중 오류 발생:', error);
  }
}

uploadData(); 