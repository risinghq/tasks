import { Search, X } from "lucide-react";
import { labelStyle, type Label } from "../shared/model";
import { LabelDot } from "./CardView";
import styles from "./FilterPopover.module.css";
import select from "./Select.module.css";
import { Initial, Select, type Option } from "./Select";
import { Sheet } from "./Sheet";
import { NO_LABEL, type Filter } from "./useFilter";

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
          className={select.emptyDot}
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
