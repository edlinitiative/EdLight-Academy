import React from "react";

export default function Navbar() {
  return (
    <header className="sticky top-0 z-40 bg-white/80 backdrop-blur border-b border-ed-gray200">
      <div className="container h-16 flex items-center justify-between">
        <a href="/" className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-xl bg-ed-blue grid place-items-center text-white font-bold">E</div>
          <span className="font-semibold text-ed-gray900">EdLight Academy</span>
        </a>
        <nav className="hidden md:flex items-center gap-6 text-ed-gray700">
          <a href="#courses" className="hover:text-ed-blue">Courses</a>
          <a href="#quizzes" className="hover:text-ed-blue">Quizzes</a>
          <a href="#about" className="hover:text-ed-blue">About</a>
        </nav>
        <div className="flex items-center gap-3">
          <a href="#signup" className="btn-outline">Sign in</a>
          <a href="#get-started" className="btn">Get started</a>
        </div>
      </div>
    </header>
  );
}
