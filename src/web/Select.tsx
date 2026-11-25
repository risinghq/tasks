import { Check, ChevronDown } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import styles from "./Select.module.css";

export type Option = { id: string; name: string; mark?: ReactNode };

/** An initial inside a ringed circle, as the requester mark. */
export function Initial({ name }: { name: string }) {
  return (
    <span className={styles.initial} aria-hidden>
      {name[0]}
    </span>
  );
}

/** The listbox the options live in, on its own for a sheet or below a Select. */
export function OptionList(props: {
  label: string;
  value: string | null;
  options: Option[];
  onPick: (id: string) => void;
}) {
  const autofocus = props.options.some((option) => option.id === props.value)
    ? props.value
    : props.options[0]?.id;
  return (
    <div className={styles.listbox} role="listbox" aria-label={props.label}>
      {props.options.map((option) => {
        const selected = option.id === props.value;
        return (
          <button
            key={option.id}
            type="button"
            role="option"
            aria-selected={selected}
            className={styles.option}
            tabIndex={-1}
            data-autofocus={option.id === autofocus || undefined}
            onClick={() => props.onPick(option.id)}
          >
            <span className={styles.optionText}>
              {option.mark}
              {option.name}
            </span>
            <Check size={16} className={styles.optionCheck} data-on={selected} aria-hidden />
          </button>
        );
      })}
    </div>
  );
}

/** A select whose options open in place inside the sheet. */
export function Select(props: {
  label: string;
  value: string;
  options: Option[];
  onPick: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const chosen = props.options.find((option) => option.id === props.value);

  useEffect(() => {
    if (open) root.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
  }, [open]);
  const close = () => {
    setOpen(false);
    button.current?.focus();
  };

  return (
    <div ref={root} className={styles.select} data-open={open}>
      <button
        ref={button}
        type="button"
        className={styles.selectButton}
        aria-label={props.label}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span className={styles.selectLabel}>{props.label}</span>
        <span className={styles.selectValue}>
          {chosen?.mark}
          {chosen?.name}
        </span>
        <ChevronDown size={16} className={styles.selectChevron} aria-hidden />
      </button>
      {open && (
        <div
          className={styles.inline}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.stopPropagation();
              close();
            }
          }}
        >
          <OptionList
            label={props.label}
            value={props.value}
            options={props.options}
            onPick={(id) => {
              props.onPick(id);
              close();
            }}
          />
        </div>
      )}
    </div>
  );
}
