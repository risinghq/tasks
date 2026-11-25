import { ChevronDown } from "lucide-react";
import { useState, type ReactNode } from "react";
import { dayHeading } from "../shared/dates";
import { LIST_TITLES, type Card } from "../shared/model";
import type { Fields } from "./boardState";
import { LabelDot } from "./CardView";
import type { Container } from "./groups";
import { LabelPicker } from "./LabelPicker";
import { AssigneePicker, DatePicker, ListPicker, RequesterPicker } from "./Pickers";
import { Sheet } from "./Sheet";
import styles from "./CardProperties.module.css";
import { useUi } from "./ui";

type Kind = "lista" | "etiqueta" | "responsable" | "solicitante" | "fecha";

const LABEL: Record<Kind, string> = {
  lista: "Lista",
  etiqueta: "Etiqueta",
  responsable: "Responsable",
  solicitante: "Solicitante",
  fecha: "Fecha de término",
};

/** One row of the grid: the name, and a button that opens its picker. */
function Property(props: {
  kind: Kind;
  name: string;
  empty: boolean;
  onOpen: (kind: Kind, anchor: HTMLElement) => void;
  children: ReactNode;
}) {
  const id = `prop-${props.kind}`;
  return (
    <>
      <span className={styles.prop} id={id}>
        {props.name}
      </span>
      <button
        type="button"
        className={styles.value}
        aria-labelledby={id}
        aria-haspopup="dialog"
        data-empty={props.empty}
        onClick={(event) => props.onOpen(props.kind, event.currentTarget)}
      >
        {props.children}
      </button>
    </>
  );
}

/** The card back's list, label, people and date, each edited in a picker sheet. */
export function CardProperties(props: {
  card: Card;
  today: string;
  requesters: string[];
  edit: (fields: Fields) => void;
  move: (to: Container) => void;
}) {
  const { card, edit, move } = props;
  const { labels, members } = useUi();
  const chosen = labels.find((known) => known.id === card.labelId);
  const assignee = members.find((member) => member.id === card.assigneeId);
  const [picker, setPicker] = useState<{ kind: Kind; anchor: HTMLElement } | null>(null);

  const open = (kind: Kind, anchor: HTMLElement) =>
    setPicker((shown) => (shown?.kind === kind ? null : { kind, anchor }));
  const close = () => setPicker(null);

  return (
    <>
      <div className={styles.grid}>
        <Property kind="lista" name="Lista" empty={false} onOpen={open}>
          <span className={styles.valueText}>{LIST_TITLES[card.list]}</span>
          <ChevronDown size={14} className={styles.chevron} aria-hidden />
        </Property>
        <Property kind="etiqueta" name="Etiqueta" empty={!chosen} onOpen={open}>
          <span className={styles.valueText}>
            {chosen && <LabelDot color={chosen.color} />}
            {chosen?.name ?? "Añadir etiqueta"}
          </span>
        </Property>
        {members.length > 1 && (
          <Property kind="responsable" name="Responsable" empty={!assignee} onOpen={open}>
            {assignee && (
              <span className={styles.avatar} data-assignee aria-hidden>
                {assignee.name[0]}
              </span>
            )}
            <span className={styles.valueText}>{assignee?.name ?? "Asignar"}</span>
          </Property>
        )}
        <Property kind="solicitante" name="Solicitante" empty={!card.requester} onOpen={open}>
          {card.requester && (
            <span className={styles.avatar} aria-hidden>
              {card.requester[0]}
            </span>
          )}
          <span className={styles.valueText}>{card.requester ?? "Añadir"}</span>
        </Property>
        <Property kind="fecha" name="Fecha" empty={!card.doneDate} onOpen={open}>
          <span className={styles.valueText}>
            {card.doneDate ? dayHeading(card.doneDate, props.today) : "Añadir fecha"}
          </span>
        </Property>
      </div>

      {picker && (
        <Sheet anchor={picker.anchor} label={LABEL[picker.kind]} onClose={close}>
          <div className={styles.sheet}>
            {picker.kind === "lista" && (
              <ListPicker
                value={card.list}
                onPick={(list) => {
                  move({ list, doneDate: list === "hecho" ? props.today : null });
                  close();
                }}
              />
            )}
            {picker.kind === "etiqueta" && (
              <LabelPicker
                value={card.labelId}
                onPick={(labelId) => {
                  if (labelId !== card.labelId) edit({ labelId });
                  close();
                }}
              />
            )}
            {picker.kind === "responsable" && (
              <AssigneePicker
                value={card.assigneeId}
                members={members}
                onPick={(assigneeId) => {
                  if (assigneeId !== card.assigneeId) edit({ assigneeId });
                  close();
                }}
              />
            )}
            {picker.kind === "solicitante" && (
              <RequesterPicker
                value={card.requester}
                suggestions={props.requesters}
                onSave={(requester) => {
                  if (requester !== card.requester) edit({ requester });
                  close();
                }}
              />
            )}
            {picker.kind === "fecha" && (
              <DatePicker
                value={card.doneDate}
                today={props.today}
                onSave={(date) => {
                  if (date !== card.doneDate) move({ list: "hecho", doneDate: date });
                  close();
                }}
              />
            )}
          </div>
        </Sheet>
      )}
    </>
  );
}
