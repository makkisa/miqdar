import { useRef } from "react";

export default function PercentWheel({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  const pointer = useRef({ y: 0, remainder: 0 });
  const setValue = (next: number) => onChange(Math.max(0, Math.min(100, next)));

  return (
    <div
      className="percent-wheel"
      role="spinbutton"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
      aria-valuetext={`${value}%`}
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "ArrowUp" || event.key === "ArrowRight") {
          event.preventDefault();
          setValue(value + 1);
        } else if (event.key === "ArrowDown" || event.key === "ArrowLeft") {
          event.preventDefault();
          setValue(value - 1);
        } else if (event.key === "PageUp") {
          event.preventDefault();
          setValue(value + 10);
        } else if (event.key === "PageDown") {
          event.preventDefault();
          setValue(value - 10);
        } else if (event.key === "Home") {
          event.preventDefault();
          setValue(0);
        } else if (event.key === "End") {
          event.preventDefault();
          setValue(100);
        }
      }}
      onWheel={(event) => {
        event.preventDefault();
        if (event.deltaY) setValue(value + (event.deltaY > 0 ? 1 : -1));
      }}
      onPointerDown={(event) => {
        if (event.pointerType === "mouse" && event.button !== 0) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        pointer.current = { y: event.clientY, remainder: 0 };
      }}
      onPointerMove={(event) => {
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
        const moved = pointer.current.y - event.clientY;
        pointer.current.y = event.clientY;
        pointer.current.remainder += moved;
        let steps = 0;
        while (Math.abs(pointer.current.remainder) >= 18) {
          const step = pointer.current.remainder > 0 ? 1 : -1;
          steps += step;
          pointer.current.remainder -= step * 18;
        }
        if (steps) setValue(value + steps);
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
      {[value - 2, value - 1, value, value + 1, value + 2].map(
        (option, index) => (
          <span
            key={`${option}-${index}`}
            className={`percent-wheel-value ${index === 2 ? "selected" : ""}`}
            aria-hidden="true"
          >
            {option < 0 || option > 100 ? "·" : `${option}%`}
          </span>
        ),
      )}
    </div>
  );
}
