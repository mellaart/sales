"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

type ImplementationNotesFieldProps = {
  label: string;
  value: string;
  className?: string;
  disabled?: boolean;
  maxLength?: number;
  multiline?: boolean;
  placeholder?: string;
  onChange: (value: string) => void;
  onBlur: (value: string) => void;
};

export default function ImplementationNotesField({
  label,
  value,
  className,
  disabled = false,
  maxLength,
  multiline = false,
  placeholder,
  onChange,
  onBlur,
}: ImplementationNotesFieldProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [canScrollUp, setCanScrollUp] = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(false);

  const updateScrollState = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    setCanScrollUp(textarea.scrollTop > 1);
    setCanScrollDown(textarea.scrollTop + textarea.clientHeight < textarea.scrollHeight - 1);
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(updateScrollState);
    return () => window.cancelAnimationFrame(frame);
  }, [updateScrollState, value]);

  function scrollNotes(direction: -1 | 1) {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.scrollBy({ top: direction * Math.max(28, textarea.clientHeight - 10), behavior: "smooth" });
    window.setTimeout(updateScrollState, 180);
  }

  return (
    <div className={`input-wrap implementation-notes${multiline ? " implementation-notes-multiline" : ""}${className ? ` ${className}` : ""}`}>
      <span className="input-label">{label}</span>
      <div className="implementation-notes-control">
        <textarea
          ref={textareaRef}
          className="textarea implementation-notes-textarea"
          value={value}
          disabled={disabled}
          maxLength={maxLength}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          onBlur={(event) => onBlur(event.currentTarget.value)}
          onScroll={updateScrollState}
        />
        <div className="number-stepper-controls implementation-notes-scroll-controls">
          <button
            type="button"
            aria-label={`Omhoog door ${label.toLowerCase()}`}
            title="Omhoog"
            disabled={!canScrollUp}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => scrollNotes(-1)}
          >
            <ChevronUp size={15} strokeWidth={2.4} />
          </button>
          <button
            type="button"
            aria-label={`Omlaag door ${label.toLowerCase()}`}
            title="Omlaag"
            disabled={!canScrollDown}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => scrollNotes(1)}
          >
            <ChevronDown size={15} strokeWidth={2.4} />
          </button>
        </div>
      </div>
    </div>
  );
}
