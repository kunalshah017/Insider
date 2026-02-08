/**
 * AnimatedPrice - Smoothly animated price display component
 *
 * Uses CSS transitions for fluid transitions between price changes.
 * Handles rapid updates by showing the latest value with debouncing.
 */

import { useState, useEffect, useRef, useMemo } from 'react';

interface AnimatedPriceProps {
  /** Price value between 0 and 1 */
  price: number;
  /** Display format: 'percent' shows as 65%, 'cents' shows as 65¢ */
  format?: 'percent' | 'cents';
  /** Font size in pixels */
  fontSize?: number;
  /** Font weight */
  fontWeight?: number;
  /** Text color */
  color?: string;
  /** Font family */
  fontFamily?: string;
  /** Animation duration in ms */
  duration?: number;
  /** Whether price is from live WebSocket (shows indicator) */
  isLive?: boolean;
}

/**
 * Debounce rapid price updates to show readable values
 */
function useDebouncedValue<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastUpdateRef = useRef<number>(0);

  useEffect(() => {
    const now = Date.now();
    const timeSinceLastUpdate = now - lastUpdateRef.current;

    if (timeSinceLastUpdate < delay) {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        setDebouncedValue(value);
        lastUpdateRef.current = Date.now();
      }, delay - timeSinceLastUpdate);
    } else {
      setDebouncedValue(value);
      lastUpdateRef.current = now;
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [value, delay]);

  return debouncedValue;
}

/**
 * Single digit component that rolls up/down to the target value
 */
function RollingDigit({
  value,
  fontSize,
  fontWeight,
  color,
  fontFamily,
  duration,
}: {
  value: string;
  fontSize: number;
  fontWeight: number;
  color: string;
  fontFamily: string;
  duration: number;
}) {
  const isNumber = !isNaN(parseInt(value, 10));

  if (!isNumber) {
    return (
      <span
        style={{
          fontSize: `${fontSize}px`,
          fontWeight,
          color,
          fontFamily,
          display: 'inline-block',
          lineHeight: 1,
        }}
      >
        {value}
      </span>
    );
  }

  const digit = parseInt(value, 10);

  return (
    <span
      style={{
        display: 'inline-block',
        height: `${fontSize}px`,
        width: '0.6em', // Fixed width for digits to prevent jitter
        overflow: 'hidden',
        position: 'relative',
        verticalAlign: 'bottom',
        fontSize: `${fontSize}px`,
        fontWeight,
        color,
        fontFamily,
        lineHeight: 1,
      }}
    >
      <div
        style={{
          transform: `translateY(-${digit * 10}%)`,
          transition: `transform ${duration}ms cubic-bezier(0.34, 1.56, 0.64, 1)`,
          display: 'flex',
          flexDirection: 'column',
          height: '1000%', // 10 digits
        }}
      >
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
          <span
            key={num}
            style={{
              height: '10%', // Each digit is 10% of total height
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {num}
          </span>
        ))}
      </div>
    </span>
  );
}

export function AnimatedPrice({
  price,
  format = 'percent',
  fontSize = 26,
  fontWeight = 700,
  color = '#f0f6fc',
  fontFamily = 'JetBrains Mono, monospace',
  duration = 500,
  isLive = false,
}: AnimatedPriceProps) {
  // Debounce price updates slightly to smooth out rapid websocket jitter
  const debouncedPrice = useDebouncedValue(price, 150);

  // Convert to display value (0-100)
  const displayValue = useMemo(() => {
    const val = Math.round(debouncedPrice * 100);
    return Math.max(0, Math.min(100, val)).toString();
  }, [debouncedPrice]);

  const suffix = format === 'percent' ? '%' : '¢';
  
  // Track trend for color flash (optional enhancement)
  const prevPriceRef = useRef(debouncedPrice);
  const [trend, setTrend] = useState<'up' | 'down' | 'neutral'>('neutral');

  useEffect(() => {
    if (debouncedPrice > prevPriceRef.current) setTrend('up');
    else if (debouncedPrice < prevPriceRef.current) setTrend('down');
    else setTrend('neutral');
    
    // Reset trend after animation
    const timer = setTimeout(() => setTrend('neutral'), duration);
    prevPriceRef.current = debouncedPrice;
    return () => clearTimeout(timer);
  }, [debouncedPrice, duration]);

  // Dynamic color for the flash effect
  const activeColor = trend === 'up' ? '#00d992' : trend === 'down' ? '#ff3b30' : color;
  // We apply the color change only briefly or stick to base color? 
  // Let's keep base color for digits but maybe use trend for a glow effect if requested.
  // For this implementation, we'll keep the text color stable to standard `color` 
  // but use the rolling animation as the primary feedback.

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        fontVariantNumeric: 'tabular-nums', // Enhances alignment
        cursor: 'default',
        position: 'relative'
      }}
    >
      {displayValue.split('').map((char, index) => (
        <RollingDigit
          key={index} 
          value={char}
          fontSize={fontSize}
          fontWeight={fontWeight}
          color={color}
          fontFamily={fontFamily}
          duration={duration}
        />
      ))}
      
      <span
        style={{
          fontSize: `${fontSize}px`,
          fontWeight,
          color,
          fontFamily,
          lineHeight: 1,
          marginLeft: '2px'
        }}
      >
        {suffix}
      </span>
    </span>
  );
}

/**
 * Simple non-animated price display (for when animation is not needed)
 */
export function StaticPrice({
  price,
  format = 'percent',
  fontSize = 26,
  fontWeight = 700,
  color = '#f0f6fc',
  fontFamily = 'JetBrains Mono, monospace',
}: Omit<AnimatedPriceProps, 'duration' | 'isLive'>) {
  const displayValue = Math.round(price * 100);
  const suffix = format === 'percent' ? '%' : '¢';

  return (
    <span
      style={{
        fontSize: `${fontSize}px`,
        fontWeight,
        color,
        fontFamily,
      }}
    >
      {displayValue}{suffix}
    </span>
  );
}
