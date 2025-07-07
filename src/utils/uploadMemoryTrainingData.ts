import { db } from '../firebase';
import { collection, writeBatch, doc } from 'firebase/firestore';
import memoryTrainingData from '../assets/memory_training_data.json';

export const uploadMemoryTrainingData = async () => {
  try {
    const batch = writeBatch(db);
    const exercisesRef = collection(db, 'memory_training_exercises');

    memoryTrainingData.exercises.forEach((exercise) => {
      const docRef = doc(exercisesRef, exercise.id);
      batch.set(docRef, exercise);
    });

    await batch.commit();
    console.log('Memory training data uploaded successfully!');
  } catch (error) {
    console.error('Error uploading memory training data:', error);
    throw error;
  }
}; 