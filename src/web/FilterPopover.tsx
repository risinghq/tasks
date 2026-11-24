import { Check, ChevronDown, Search, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { labelStyle, type Label } from "../shared/model";
import { LabelDot } from "./CardView";
import styles from "./FilterPopover.module.css";
import { Sheet } from "./Sheet";
import { NO_LABEL, type Filter } from "./useFilter";

type Option = { id: string; name: string; mark?: ReactNode };

/** A select whose options open in place inside the sheet. */
function Select(props: { label: string; value: string; options: Option[]; onPick: (id: string) => void }) {
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
          className={styles.listbox}
          role="listbox"
          aria-label={props.label}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.stopPropagation();
              close();
            }
          }}
        >
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
                data-autofocus={selected || undefined}
                onClick={() => {
                  props.onPick(option.id);
                  close();
                }}
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
      )}
    </div>
  );
}

/** An initial inside a ringed circle, as the requester mark. */
function Initial({ name }: { name: string }) {
  return (
    <span className={styles.initial} aria-hidden>
      {name[0]}
    </span>
  );
}

export function FilterPopover(props: {
  anchor: HTMLElement;
  filter: Filter;
  /** The cards matching the filter. */
  matches: number;
  labels: Label[];
  requesters: string[];
  onChange: (filter: Filter) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const { filter } = props;
  const filtering = Boolean(filter.q || filter.label || filter.requester);
  const cards = `${props.matches} ${props.matches === 1 ? "tarjeta" : "tarjetas"}`;

  const labelOptions: Option[] = [
    { id: "", name: "Todas" },
    ...props.labels.map((label) => ({
      id: label.id,
      name: label.name,
      mark: <LabelDot color={label.color} />,
    })),
    {
      id: NO_LABEL,
      name: "Sin etiqueta",
      mark: (
        <span
          className={styles.emptyDot}
          style={{ boxShadow: `inset 0 0 0 1px ${labelStyle("blue").color}` }}
        />
      ),
    },
  ];

  const requesterOptions: Option[] = [
    { id: "", name: "Todos" },
    ...props.requesters.map((name) => ({ id: name, name, mark: <Initial name={name} /> })),
  ];

  return (
    <Sheet anchor={props.anchor} label="Filtrar" onClose={props.onClose}>
      <div className={styles.sheet}>
        <header className={styles.header}>
          <h3 className={styles.title}>Filtrar</h3>
          <button type="button" className={styles.close} aria-label="Cerrar" onClick={props.onClose}>
            <X size={16} aria-hidden />
          </button>
        </header>

        <label className={styles.label} htmlFor="filter-text">
          Texto
        </label>
        <div className={styles.field}>
          <Search size={16} className={styles.fieldIcon} aria-hidden />
          <input
            id="filter-text"
            className={styles.input}
            data-autofocus
            autoComplete="off"
            placeholder="Título o descripción"
            value={filter.q}
            onChange={(event) => props.onChange({ ...filter, q: event.target.value })}
          />
        </div>

        <Select
          label="Etiqueta"
          value={filter.label}
          options={labelOptions}
          onPick={(label) => props.onChange({ ...filter, label })}
        />
        <Select
          label="Solicitante"
          value={filter.requester}
          options={requesterOptions}
          onPick={(requester) => props.onChange({ ...filter, requester })}
        />

        <div className={styles.footer}>
          <button type="button" className={styles.clear} data-active={filtering} onClick={props.onClear}>
            Limpiar filtro
          </button>
          <span className={styles.count}>{cards}</span>
          <button type="button" className={styles.view} onClick={props.onClose}>
            Ver {cards}
          </button>
        </div>
      </div>
    </Sheet>
  );
}
