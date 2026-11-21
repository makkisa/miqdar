import { useRef } from "react";

export default function PercentWheel({
  label,
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  suffix = "%",
  orientation = "vertical",
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  orientation?: "vertical" | "horizontal";
}) {
  const pointer = useRef({ x: 0, y: 0, remainder: 0, value });
  const normalizeValue = (next: number) =>
    Math.max(min, Math.min(max, Math.round((next - min) / step) * step + min));
  const setValue = (next: number) =>
    onChange(normalizeValue(next));
  const format = (number: number) => `${number.toLocaleString()}${suffix}`;

  return (
    <div
      className={`percent-wheel ${orientation}`}
      role="spinbutton"
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={format(value)}
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "ArrowUp" || event.key === "ArrowRight") {
          event.preventDefault();
          setValue(value + step);
        } else if (event.key === "ArrowDown" || event.key === "ArrowLeft") {
          event.preventDefault();
          setValue(value - step);
        } else if (event.key === "PageUp") {
          event.preventDefault();
          setValue(value + step * 10);
        } else if (event.key === "PageDown") {
          event.preventDefault();
          setValue(value - step * 10);
        } else if (event.key === "Home") {
          event.preventDefault();
          setValue(min);
        } else if (event.key === "End") {
          event.preventDefault();
          setValue(max);
        }
      }}
      onWheel={(event) => {
        event.preventDefault();
        if (event.deltaY) setValue(value + (event.deltaY > 0 ? step : -step));
      }}
      onPointerDown={(event) => {
        if (event.pointerType === "mouse" && event.button !== 0) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        pointer.current = {
          x: event.clientX,
          y: event.clientY,
          remainder: 0,
          value,
        };
      }}
      onPointerMove={(event) => {
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
        const moved =
          orientation === "horizontal"
            ? event.clientX - pointer.current.x
            : pointer.current.y - event.clientY;
        pointer.current.x = event.clientX;
        pointer.current.y = event.clientY;
        pointer.current.remainder += moved;
        let steps = 0;
        while (Math.abs(pointer.current.remainder) >= 10) {
          const step = pointer.current.remainder > 0 ? 1 : -1;
          steps += step;
          pointer.current.remainder -= step * 10;
        }
        if (steps) {
          pointer.current.value = normalizeValue(
            pointer.current.value + steps * step,
          );
          onChange(pointer.current.value);
        }
      }}
      onPointerUp={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId))
          event.currentTarget.releasePointerCapture(event.pointerId);
        pointer.current.remainder = 0;
      }}
      onPointerCancel={() => {
        pointer.current.remainder = 0;
      }}
    >
      {[
        value - step * 2,
        value - step,
        value,
        value + step,
        value + step * 2,
      ].map((option, index) => (
        <span
          key={`${option}-${index}`}
          className={`percent-wheel-value ${index === 2 ? "selected" : ""}`}
          aria-hidden="true"
        >
          {option < min || option > max ? "·" : format(option)}
        </span>
      ))}
    </div>
  );
}
