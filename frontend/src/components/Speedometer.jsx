import React, { useState, useEffect } from 'react';

const Speedometer = ({
  value = 0,
  unit = 'Mbps',
  label = 'Ready',
  activeColor = 'var(--color-primary)',
  glowColor = 'var(--color-primary-glow)',
  testState = 'idle', // 'idle' | 'ping' | 'jitter' | 'download' | 'upload' | 'done'
  onStart
}) => {
  const [displayValue, setDisplayValue] = useState(0);

  // Smooth numeric value transition
  useEffect(() => {
    if (testState === 'idle') {
      setDisplayValue(0);
      return;
    }

    let animationFrameId;
    const start = displayValue;
    const end = value;
    const startTime = performance.now();
    const duration = 250; 

    const animate = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      const easeProgress = 1 - Math.pow(1 - progress, 3);
      const currentVal = start + (end - start) * easeProgress;
      
      setDisplayValue(currentVal);

      if (progress < 1) {
        animationFrameId = requestAnimationFrame(animate);
      }
    };

    animationFrameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrameId);
  }, [value, testState]);

  // Explicit SVG Arc Path Calculations for Clockwise rendering
  // Center (150, 150), Radius 120. Starts at bottom-left, runs clockwise, ends at bottom-right.
  const pathLength = 565.48;
  const maxScaleValue = 500;
  const clampedValue = Math.min(displayValue, maxScaleValue);
  const progressPercent = clampedValue / maxScaleValue;
  const dashOffset = pathLength * (1 - progressPercent);

  return (
    <div className="speedometer-container">
      <svg className="gauge-svg" viewBox="0 0 300 300">
        {/* Background Track - 270 degree arc drawing clockwise */}
        <path
          className="gauge-track"
          d="M 65.1 234.9 A 120 120 0 1 1 234.9 234.9"
          strokeWidth="14"
        />
        {/* Dynamic Progress indicator - Clockwise growing */}
        <path
          className="gauge-progress"
          d="M 65.1 234.9 A 120 120 0 1 1 234.9 234.9"
          strokeWidth="14"
          stroke={activeColor}
          strokeDasharray={pathLength}
          strokeDashoffset={dashOffset}
          style={{ '--glow-color': glowColor }}
        />
      </svg>

      <div className="gauge-center-text">
        {testState === 'idle' ? (
          <>
            <span className="gauge-val" style={{ color: 'var(--text-main)', fontSize: '2.5rem' }}>GO</span>
            <span className="gauge-label">Ready</span>
          </>
        ) : (
          <>
            <span className="gauge-val" style={{ color: activeColor }}>
              {displayValue.toFixed(1)}
            </span>
            <span className="gauge-unit">{unit}</span>
            <span className="gauge-label" style={{ color: activeColor }}>
              {label}
            </span>
          </>
        )}
      </div>

      {(testState === 'idle' || testState === 'done') && (
        <button className="btn-start-test" onClick={onStart}>
          {testState === 'done' ? 'Retest' : 'Start Test'}
        </button>
      )}
    </div>
  );
};

export default Speedometer;
