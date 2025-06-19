import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

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
export const db = getFirestore(app); 