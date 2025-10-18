import React from "react";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import CourseCard from "./components/CourseCard";
import PerseusQuiz from "./components/PerseusQuiz";
import { Play, BookOpenCheck } from "lucide-react";

function App() {
  const courses = [
    { title: "Algebra I — Foundations", level: "NSI", description: "Variables, expressions, linear equations, and problem solving.", badge: "Math" },
    { title: "Physics — Mechanics", level: "NSII", description: "Motion, forces, energy, and momentum with real-world labs.", badge: "STEM" },
    { title: "Financial Literacy", level: "All", description: "Budgeting, saving, investing basics for everyday life.", badge: "Life Skills" },
    { title: "Coding — Python Basics", level: "NSI/NSII", description: "Learn programming through practical projects.", badge: "Tech" },
  ];

  return (
    <div className="min-h-screen bg-ed-gray50 text-ed-gray900">
      <Navbar />

      {/* HERO */}
      <section className="section bg-gradient-to-b from-white to-ed-blueLight">
        <div className="container grid md:grid-cols-2 gap-10 items-center">
          <div>
            <span className="badge mb-4">Free & bilingual • Creole • French</span>
            <h1 className="text-4xl md:text-5xl font-extrabold leading-tight">
              Learn with <span className="text-ed-blue">EdLight Academy</span>
            </h1>
            <p className="mt-4 text-lg text-ed-gray700">
              Courses, practice, and quizzes — built for Haitian students and inspired by the best of modern learning.
            </p>
            <div className="mt-6 flex gap-3">
              <a href="#courses" className="btn"><Play className="w-4 h-4" /> Start learning</a>
              <a href="#quizzes" className="btn-outline"><BookOpenCheck className="w-4 h-4" /> Try a quiz</a>
            </div>
            <div className="mt-6 flex items-center gap-3 text-sm text-ed-gray600">
              <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-ed-green"></span> Practice-first</span>
              <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-ed-blue"></span> Community-driven</span>
            </div>
          </div>
          <div className="card p-6">
            <img
              src="https://images.unsplash.com/photo-1513258496099-48168024aec0?q=80&w=1280&auto=format&fit=crop"
              alt="Students learning"
              className="rounded-xl"
            />
            <p className="text-sm text-ed-gray600 mt-3">Real-world skills with guided practice and instant feedback.</p>
          </div>
        </div>
      </section>

      {/* COURSES */}
      <section id="courses" className="section">
        <div className="container">
          <div className="flex items-end justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold">Popular courses</h2>
              <p className="text-ed-gray600">Curated tracks to get you job- and college-ready.</p>
            </div>
            <a className="btn-outline" href="#all-courses">View all</a>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {courses.map((c, idx) => (
              <CourseCard key={idx} {...c} onStart={() => window.location.hash = '#quizzes'} />
            ))}
          </div>
        </div>
      </section>

      {/* QUIZZES */}
      <section id="quizzes" className="section bg-white">
        <div className="container">
          <div className="mb-6">
            <h2 className="text-2xl font-bold">Practice with Perseus</h2>
            <p className="text-ed-gray600">Interactive questions with hints and instant scoring.</p>
          </div>
          <PerseusQuiz />
        </div>
      </section>

      {/* ABOUT */}
      <section id="about" className="section">
        <div className="container grid md:grid-cols-2 gap-10 items-center">
          <div>
            <h2 className="text-2xl font-bold">Built for Haiti, open to the world</h2>
            <p className="text-ed-gray700 mt-2">
              EdLight Academy is a program of EdLight Initiative. Our mission is to empower the youth of Haiti with skills and knowledge to make them better leaders and future citizens.
            </p>
            <ul className="mt-4 space-y-2 text-ed-gray700">
              <li>• Bilingual content (Kreyòl / Français)</li>
              <li>• Offline-friendly recordings</li>
              <li>• Open-source quiz engine (Perseus)</li>
            </ul>
          </div>
          <div className="card p-6">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-3xl font-extrabold text-ed-blue">65+</div>
                <div className="text-sm text-ed-gray600">Alumni</div>
              </div>
              <div>
                <div className="text-3xl font-extrabold text-ed-blue">10k+</div>
                <div className="text-sm text-ed-gray600">Views</div>
              </div>
              <div>
                <div className="text-3xl font-extrabold text-ed-blue">25</div>
                <div className="text-sm text-ed-gray600">Cohort size</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}

export default App;
