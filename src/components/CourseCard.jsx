import React from "react";

export default function CourseCard({ title, level, description, badge, onStart }) {
  return (
    <div className="card p-5 hover:shadow-ring transition">
      <div className="flex items-center justify-between mb-3">
        <span className="badge">{badge || level}</span>
        <span className="text-xs text-ed-gray500">{level}</span>
      </div>
      <h3 className="text-lg font-semibold text-ed-gray900">{title}</h3>
      <p className="text-ed-gray600 mt-2">{description}</p>
      <div className="mt-4 flex gap-2">
        <button className="btn" onClick={onStart}>Start</button>
        <button className="btn-outline">Preview</button>
      </div>
    </div>
  );
}
