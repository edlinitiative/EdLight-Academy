import React from 'react';
import { QuizComponent as Quiz } from '../components/Quiz';

const Quizzes = () => {
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">Quizzes</h1>
      <Quiz />
    </div>
  );
};

export default Quizzes;