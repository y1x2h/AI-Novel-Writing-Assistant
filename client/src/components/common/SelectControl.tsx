import * as React from "react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  SELECT_CONTROL_EMPTY_VALUE,
  deduplicateSelectControlOptions,
  toSelectControlItemValue,
} from "./selectControlOptions";

type SelectChangeHandler = React.ChangeEventHandler<HTMLSelectElement>;

interface ParsedOption {
  value: string;
  label: React.ReactNode;
  disabled?: boolean;
  group?: string;
}

export interface SelectControlProps
  extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "children" | "onChange" | "value" | "defaultValue" | "size"> {
  value?: string | number | readonly string[] | null;
  defaultValue?: string | number | readonly string[] | null;
  onChange?: SelectChangeHandler;
  children: React.ReactNode;
  triggerClassName?: string;
  contentClassName?: string;
  placeholder?: string;
}

function normalizeValue(value: SelectControlProps["value"]): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  const rawValue = Array.isArray(value) ? value[0] : value;
  const stringValue = String(rawValue ?? "");
  return toSelectControlItemValue(stringValue);
}

function optionValue(value: unknown, fallback: React.ReactNode): string {
  if (value !== undefined && value !== null) {
    return String(value);
  }
  if (typeof fallback === "string" || typeof fallback === "number") {
    return String(fallback);
  }
  return "";
}

function collectOptions(children: React.ReactNode, group?: string): ParsedOption[] {
  const options: ParsedOption[] = [];

  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) {
      return;
    }
    if (child.type === React.Fragment) {
      const fragment = child as React.ReactElement<{ children?: React.ReactNode }>;
      options.push(...collectOptions(fragment.props.children, group));
      return;
    }
    if (child.type === "optgroup") {
      const optgroup = child as React.ReactElement<{ children?: React.ReactNode; label?: React.ReactNode }>;
      const label = typeof optgroup.props.label === "string" ? optgroup.props.label : undefined;
      options.push(...collectOptions(optgroup.props.children, label));
      return;
    }
    if (child.type !== "option") {
      return;
    }
    const props = child.props as React.OptionHTMLAttributes<HTMLOptionElement>;
    options.push({
      value: optionValue(props.value, props.children),
      label: props.children,
      disabled: props.disabled,
      group,
    });
  });

  return options;
}

function emitNativeLikeChange(onChange: SelectChangeHandler | undefined, value: string) {
  if (!onChange) {
    return;
  }
  const nativeValue = value === SELECT_CONTROL_EMPTY_VALUE ? "" : value;
  onChange({
    target: { value: nativeValue },
    currentTarget: { value: nativeValue },
  } as React.ChangeEvent<HTMLSelectElement>);
}

export default function SelectControl({
  value,
  defaultValue,
  onChange,
  children,
  className,
  triggerClassName,
  contentClassName,
  placeholder = "请选择",
  disabled,
  id,
  name,
  required,
  "aria-label": ariaLabel,
  ...props
}: SelectControlProps) {
  const options = React.useMemo(
    () => deduplicateSelectControlOptions(collectOptions(children)),
    [children],
  );
  const normalizedValue = normalizeValue(value);
  const normalizedDefaultValue = normalizeValue(defaultValue);
  const items = React.useMemo(() => {
    const nodes: React.ReactNode[] = [];
    let groupLabel: string | null = null;
    let groupIndex = 0;
    let groupBuffer: React.ReactNode[] = [];
    const flushGroup = () => {
      if (groupLabel === null) {
        return;
      }
      const label = groupLabel;
      nodes.push(
        <SelectGroup key={`group-${label}-${groupIndex}`}>
          <SelectLabel>{label}</SelectLabel>
          {groupBuffer}
        </SelectGroup>,
      );
      groupIndex += 1;
      groupBuffer = [];
      groupLabel = null;
    };

    options.forEach((option, index) => {
      const itemValue = toSelectControlItemValue(option.value);
      const item = (
        <SelectItem
          key={`${itemValue}-${index}`}
          value={itemValue}
          disabled={option.disabled}
        >
          {option.label}
        </SelectItem>
      );

      if (option.group) {
        if (groupLabel !== option.group) {
          flushGroup();
          groupLabel = option.group;
        }
        groupBuffer.push(item);
        return;
      }

      flushGroup();
      nodes.push(item);
    });

    flushGroup();
    return nodes;
  }, [options]);

  return (
    <Select
      value={normalizedValue}
      defaultValue={normalizedDefaultValue}
      onValueChange={(nextValue) => emitNativeLikeChange(onChange, nextValue)}
      disabled={disabled}
      name={name}
      required={required}
    >
      <SelectTrigger
        id={id}
        aria-label={ariaLabel ?? props.title ?? placeholder}
        className={cn(className, triggerClassName)}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className={contentClassName}>
        {items}
      </SelectContent>
    </Select>
  );
}
