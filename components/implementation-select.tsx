"use client";

import { Children, Fragment, isValidElement, useEffect, useId, useRef, useState, type ReactNode } from "react";
import * as Select from "@radix-ui/react-select";
import { Check, ChevronDown, ChevronUp } from "lucide-react";

type Props = {
  value: string;
  onValueChange: (value: string) => void;
  children: ReactNode;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
};

function getOptions(children: ReactNode): { value: string; label: ReactNode; disabled?: boolean }[] {
  return Children.toArray(children).flatMap((child) => {
    if (!isValidElement<{ value?: string; children?: ReactNode; disabled?: boolean }>(child)) return [];
    if (child.type === Fragment) return getOptions(child.props.children);
    if (child.type !== "option") return [];
    return [{ value: String(child.props.value ?? ""), label: child.props.children, disabled: child.props.disabled }];
  });
}

export function ImplementationSelect({ value, onValueChange, children, disabled, className, "aria-label": ariaLabel }: Props) {
  const [standard, setStandard] = useState(false);
  const [label, setLabel] = useState(ariaLabel);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const options = getOptions(children);

  useEffect(() => {
    const update = () => setStandard(!document.documentElement.dataset.appTheme || document.documentElement.dataset.appTheme === "standard");
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-app-theme"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setLabel(ariaLabel || trigger.current?.closest("label")?.querySelector(".input-label")?.textContent || undefined);
  }, [ariaLabel, standard]);

  if (!standard) {
    return <select className={className} value={value} disabled={disabled} aria-label={ariaLabel}
      onChange={(event) => onValueChange(event.target.value)}>{children}</select>;
  }

  const selected = options.findIndex((option) => option.value === value);
  return (
    <Select.Root value={selected < 0 ? "" : `option-${selected}`} disabled={disabled}
      onValueChange={(key) => {
        const option = options[Number(key.slice(7))];
        if (option) onValueChange(option.value);
      }}>
      <Select.Trigger ref={trigger} id={id} aria-label={label} className={`${className ?? "implementation-task-status-select"} implementation-select-trigger`}>
        <Select.Value placeholder="Selecteer..." />
        <Select.Icon className="implementation-select-icon"><ChevronDown size={16} /></Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content position="popper" sideOffset={5} collisionPadding={12} className="implementation-select-menu">
          <Select.ScrollUpButton className="implementation-select-scroll"><ChevronUp size={16} /></Select.ScrollUpButton>
          <Select.Viewport>
            {options.map((option, index) => (
              <Select.Item key={option.value} value={`option-${index}`} disabled={option.disabled} className="implementation-select-option">
                <Select.ItemIndicator className="implementation-select-check"><Check size={16} /></Select.ItemIndicator>
                <Select.ItemText>{option.label}</Select.ItemText>
              </Select.Item>
            ))}
          </Select.Viewport>
          <Select.ScrollDownButton className="implementation-select-scroll"><ChevronDown size={16} /></Select.ScrollDownButton>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}
