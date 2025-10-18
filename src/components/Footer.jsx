import React from "react";

export default function Footer() {
  return (
    <footer className="border-t border-ed-gray200 mt-16">
      <div className="container py-10 grid md:grid-cols-3 gap-8 text-sm text-ed-gray600">
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="h-8 w-8 rounded-xl bg-ed-blue grid place-items-center text-white font-bold">E</div>
            <span className="font-semibold text-ed-gray900">EdLight Academy</span>
          </div>
          <p>Empowering Haitian youth with free, high-quality learning experiences.</p>
        </div>
        <div>
          <h4 className="font-semibold text-ed-gray900 mb-2">Explore</h4>
          <ul className="space-y-1">
            <li><a href="#courses" className="hover:text-ed-blue">Courses</a></li>
            <li><a href="#quizzes" className="hover:text-ed-blue">Quizzes</a></li>
            <li><a href="#about" className="hover:text-ed-blue">About</a></li>
          </ul>
        </div>
        <div>
          <h4 className="font-semibold text-ed-gray900 mb-2">Contact</h4>
          <p>info@edlight.org</p>
          <p>© {new Date().getFullYear()} EdLight Initiative</p>
        </div>
      </div>
    </footer>
  );
}
