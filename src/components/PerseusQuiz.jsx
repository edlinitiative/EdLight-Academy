import React, { useEffect, useRef, useState } from "react";

/**
 * Light-weight Perseus integration using a global renderer (loaded from CDN in public/index.html).
 * We provide a sample item to demonstrate. Replace `sampleItem` with your own item JSON.
 */
const sampleItem = {
  "question": {
    "content": "What is \\({x}+{x}\\)?",
    "widgets": {
      "expression 1": {
        "graded": true,
        "version": {"major": 1, "minor": 0},
        "options": {
          "buttonSet": "basic",
          "times": true,
          "extraKeys": ["pi", "theta", "phi"],
          "value": "\\blue{x}+\\blue{x}",
          "functions": ["sqrt", "pi", "sin", "cos"],
          "answerForms": [{"type": "expression", "simplify": true}]
        },
        "type": "expression"
      }
    }
  },
  "answerArea": {"type": "multiple", "options": {}},
  "hints": [{"content": "Combine like terms."}, {"content": "x + x = 2x."}],
  "itemDataVersion": { "major": 0, "minor": 1 }
};

export default function PerseusQuiz() {
  const containerRef = useRef(null);
  const [score, setScore] = useState(null);

  useEffect(() => {
    const init = async () => {
      if (!window.Perseus) return;

      const renderer = await window.Perseus.ItemRenderer.mount(
        sampleItem,
        containerRef.current,
        {},
        { isMobile: false }
      );

      // Simple check button
      const button = document.getElementById("perseus-check");
      const hintBtn = document.getElementById("perseus-hint");

      button?.addEventListener("click", async () => {
        const r = await renderer.score();
        setScore(r);
      });
      hintBtn?.addEventListener("click", () => renderer.showHint());
    };

    init();
  }, []);

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-ed-gray900">Quick Quiz</h3>
        <div className="text-sm text-ed-gray600">
          {score ? (score.correct ? "✅ Correct!" : "❌ Try again") : "—"}
        </div>
      </div>

      <div ref={containerRef} className="mt-4"></div>

      <div className="mt-4 flex gap-2">
        <button id="perseus-check" className="btn">Check</button>
        <button id="perseus-hint" className="btn-outline">Hint</button>
      </div>
      <p className="text-xs text-ed-gray500 mt-3">
        This uses the global Perseus renderer. Replace the sample item with your own JSON to build full quizzes.
      </p>
    </div>
  );
}
