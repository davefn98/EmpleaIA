import React from 'react';
import { Check } from 'lucide-react';

/**
 * ProgressIndicator can render either a step-by-step Wizard indicator
 * or a circular profile completeness indicator.
 */
export default function ProgressIndicator({ type = 'wizard', currentStep = 1, steps = [], percentage = 0 }) {
  if (type === 'circle') {
    const radius = 36;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (percentage / 100) * circumference;

    return (
      <div className="relative flex items-center justify-center h-28 w-28 shrink-0">
        <svg className="w-full h-full transform -rotate-90">
          {/* Background circle */}
          <circle
            cx="56"
            cy="56"
            r={radius}
            className="stroke-slate-100 fill-none"
            strokeWidth="8"
          />
          {/* Foreground progress circle */}
          <circle
            cx="56"
            cy="56"
            r={radius}
            className="stroke-indigo-600 fill-none transition-all duration-550 ease-out"
            strokeWidth="8"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute text-center">
          <span className="text-xl font-black text-slate-900">{percentage}%</span>
        </div>
      </div>
    );
  }

  // Default: Wizard stepper
  return (
    <div className="w-full">
      {/* Desktop & Tablet Layout (Horizontal) */}
      <div className="hidden md:flex items-center justify-between w-full">
        {steps.map((step, idx) => {
          const stepNumber = idx + 1;
          const isCompleted = currentStep > stepNumber;
          const isActive = currentStep === stepNumber;

          return (
            <React.Fragment key={stepNumber}>
              <div className="flex items-center gap-3 text-left">
                <div
                  className={`h-9 w-9 rounded-full flex items-center justify-center text-xs font-bold border transition-all duration-200 ${
                    isCompleted
                      ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                      : isActive
                      ? 'bg-indigo-50 border-indigo-600 text-indigo-600 shadow-sm ring-2 ring-indigo-600/10'
                      : 'bg-white border-slate-200 text-slate-400'
                  }`}
                >
                  {isCompleted ? <Check className="h-4 w-4" /> : stepNumber}
                </div>
                <div className="min-w-0">
                  <p className={`text-xs font-bold leading-tight ${isActive ? 'text-indigo-600' : 'text-slate-800'}`}>
                    {step.title}
                  </p>
                  <p className="text-[10px] text-slate-400 font-semibold">{step.subtitle}</p>
                </div>
              </div>
              {idx < steps.length - 1 && (
                <div
                  className={`flex-1 h-0.5 mx-4 border-t-2 border-dashed transition-colors duration-300 ${
                    isCompleted ? 'border-indigo-600' : 'border-slate-200'
                  }`}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Mobile Layout (Vertical Stepper) */}
      <div className="flex md:hidden flex-col gap-3.5">
        {steps.map((step, idx) => {
          const stepNumber = idx + 1;
          const isCompleted = currentStep > stepNumber;
          const isActive = currentStep === stepNumber;

          if (!isActive && !isCompleted) return null; // Show current and past steps to keep it compact

          return (
            <div key={stepNumber} className="flex items-start gap-3.5 text-left border-l-2 border-indigo-600/20 pl-4 py-0.5 relative">
              <div
                className={`absolute -left-[11px] top-0 h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold border transition-all duration-200 ${
                  isCompleted
                    ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                    : 'bg-indigo-50 border-indigo-600 text-indigo-600 shadow-sm'
                }`}
              >
                {isCompleted ? <Check className="h-3 w-3" /> : stepNumber}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-extrabold text-indigo-600 uppercase tracking-wide">
                  Paso {stepNumber} de {steps.length}
                </p>
                <p className="text-sm font-bold text-slate-900 leading-snug">{step.title}</p>
                <p className="text-[11px] text-slate-400">{step.subtitle}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
