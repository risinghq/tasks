import { Check, Ellipsis, ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";
import type { Label, Person, ReportLink } from "../shared/model";
import type { CreateReportLink } from "../shared/schemas";
import { api } from "./api";
import { LabelDot } from "./CardView";
import { Dialog } from "./Dialog";
import form from "./form.module.css";
import { Initial, Select, type Option } from "./Select";
import styles from "./ShareDialog.module.css";
import { Sheet } from "./Sheet";

const urlOf = (link: ReportLink) => `${location.origin}/r/${link.token}`;

/** Who a link is for, in the words the list shows. A phone row has room for the short reach. */
function audienceOf(link: ReportLink, workspace: string) {
  if (link.label)
    return {
      mark: <LabelDot color={link.label.color} />,
      name: link.label.name,
      reach: "Tarjetas con esta etiqueta",
      short: "Tarjetas con esta etiqueta",
    };
  if (link.member)
    return {
      mark: (
        <span className={styles.memberMark} aria-hidden>
          {link.member.name[0]}
        </span>
      ),
      name: link.member.name,
      reach: "Tarjetas de las que es responsable",
      short: "Sus tarjetas",
    };
  return {
    mark: (
      <span className={styles.spaceMark} aria-hidden>
        {workspace[0]}
      </span>
    ),
    name: "Todo el espacio",
    reach: `Todas las tarjetas de ${workspace}`,
    short: "Todas las tarjetas",
  };
}

/** The scope picker's ids carry the kind, so one select holds labels and people. */
function scopeOf(id: string): CreateReportLink | null {
  const [kind, rowId] = id.split(":");
  if (!rowId) return null;
  return kind === "label" ? { labelId: rowId } : { memberId: rowId };
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button type="button" className={styles.copy} data-copied={copied} onClick={copy}>
      {copied && <Check size={16} aria-hidden />}
      {copied ? "Copiado" : "Copiar enlace"}
    </button>
  );
}

/**
 * The row's ··· menu. On a phone it also holds Abrir, which has no room in the
 * row. Changing or deleting a link asks first, because the sent link stops working.
 */
function LinkMenu(props: {
  anchor: HTMLElement;
  name: string;
  url: string;
  owner: boolean;
  deletable: boolean;
  onRegenerate: () => Promise<void>;
  onDelete: () => Promise<void>;
  onClose: () => void;
}) {
  const [confirming, setConfirming] = useState<"regenerate" | "delete" | null>(null);

  return (
    <Sheet anchor={props.anchor} label={`Acciones: ${props.name}`} align="right" onClose={props.onClose}>
      {confirming ? (
        <div className={styles.confirm} role="alertdialog" aria-label={`Confirmar: ${props.name}`}>
          <p>
            {confirming === "regenerate"
              ? "El enlace actual dejará de funcionar. Tendrás que enviar el nuevo."
              : "El enlace dejará de funcionar."}
          </p>
          <div className={form.confirmActions}>
            <button
              type="button"
              className={form.destroy}
              autoFocus
              onClick={async () => {
                await (confirming === "regenerate" ? props.onRegenerate() : props.onDelete());
                props.onClose();
              }}
            >
              {confirming === "regenerate" ? "Sí, cambiar" : "Sí, eliminar"}
            </button>
            <button type="button" className={form.secondary} onClick={() => setConfirming(null)}>
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <div className={styles.menu} role="menu" aria-label={`Acciones: ${props.name}`}>
          <a
            role="menuitem"
            className={styles.menuItem}
            data-narrow-only
            href={props.url}
            target="_blank"
            rel="noreferrer"
            onClick={props.onClose}
          >
            Abrir el informe
          </a>
          {props.owner && (
            <>
              <button
                type="button"
                role="menuitem"
                className={styles.menuItem}
                data-autofocus
                onClick={() => setConfirming("regenerate")}
              >
                Cambiar enlace
                <span className={styles.menuHint}>El enlace actual deja de funcionar.</span>
              </button>
              {props.deletable && (
                <>
                  <div className={styles.menuLine} role="separator" />
                  <button
                    type="button"
                    role="menuitem"
                    className={styles.menuItem}
                    data-danger
                    onClick={() => setConfirming("delete")}
                  >
                    Eliminar enlace
                  </button>
                </>
              )}
            </>
          )}
        </div>
      )}
    </Sheet>
  );
}

function LinkRow(props: {
  link: ReportLink;
  workspace: string;
  owner: boolean;
  onRegenerate: () => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const { link } = props;
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  const audience = audienceOf(link, props.workspace);
  const url = urlOf(link);

  return (
    <li className={styles.link}>
      <span className={styles.mark}>{audience.mark}</span>
      <span className={styles.audience}>
        <span className={styles.name}>{audience.name}</span>
        <span className={styles.reach}>
          <span className={styles.reachLong}>{audience.reach}</span>
          <span className={styles.reachShort}>{audience.short}</span>
        </span>
      </span>
      <CopyButton value={url} />
      <a
        className={styles.open}
        href={url}
        target="_blank"
        rel="noreferrer"
        aria-label="Abrir"
        title="Abrir el informe"
      >
        <ExternalLink size={16} aria-hidden />
      </a>
      <button
        type="button"
        className={styles.more}
        data-owner={props.owner}
        aria-label={`Más acciones: ${audience.name}`}
        aria-haspopup="menu"
        aria-expanded={Boolean(menu)}
        onClick={(event) => setMenu(menu ? null : event.currentTarget)}
      >
        <Ellipsis size={16} aria-hidden />
      </button>
      {menu && (
        <LinkMenu
          anchor={menu}
          name={audience.name}
          url={url}
          owner={props.owner}
          deletable={Boolean(link.label || link.member)}
          onRegenerate={props.onRegenerate}
          onDelete={props.onDelete}
          onClose={() => setMenu(null)}
        />
      )}
    </li>
  );
}

/**
 * The weekly report's share links: the whole workspace, and one per label or
 * person, so each client or boss sees only their own work.
 */
export function ShareDialog(props: {
  workspace: string;
  owner: boolean;
  labels: Label[];
  /** Offered as audiences when more than one person works in the space. */
  members: Person[];
  onClose: () => void;
}) {
  const [links, setLinks] = useState<ReportLink[] | null>(null);
  const [scope, setScope] = useState("");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    api.reportLinks().then(setLinks, (error: unknown) => {
      console.error(error);
      setFailed(true);
    });
  }, []);

  async function run(action: () => Promise<void>) {
    setFailed(false);
    try {
      await action();
    } catch (error) {
      console.error(error);
      setFailed(true);
    }
  }

  const replace = (next: ReportLink) =>
    setLinks((all) => all?.map((l) => (l.id === next.id ? next : l)) ?? null);

  const linked = new Set(links?.flatMap((l) => [l.label?.id, l.member?.id]).filter(Boolean));
  const free: Option[] = [
    ...props.labels
      .filter((label) => !linked.has(label.id))
      .map((label) => ({
        id: `label:${label.id}`,
        name: label.name,
        mark: <LabelDot color={label.color} />,
      })),
    ...(props.members.length > 1 ? props.members : [])
      .filter((person) => !linked.has(person.id))
      .map((person) => ({
        id: `member:${person.id}`,
        name: person.name,
        mark: <Initial name={person.name} />,
      })),
  ];
  const chosen = free.find((option) => option.id === scope);

  const create = () =>
    run(async () => {
      const wanted = scopeOf(scope);
      if (!wanted) return;
      const link = await api.createReportLink(wanted);
      setLinks((all) => [...(all ?? []), link]);
      setScope("");
    });

  return (
    <Dialog title="Compartir informe" sheet className={styles.dialog} onClose={props.onClose}>
      <p className={styles.intro}>
        Cada enlace abre el informe semanal sin contraseña. Envía a cada cliente o persona solo el suyo.
      </p>

      <ul className={styles.links} aria-label="Enlaces del informe">
        {links?.map((link) => (
          <LinkRow
            key={link.id}
            link={link}
            workspace={props.workspace}
            owner={props.owner}
            onRegenerate={() => run(async () => replace(await api.regenerateReportLink(link.id)))}
            onDelete={() =>
              run(async () => {
                await api.deleteReportLink(link.id);
                setLinks((all) => all?.filter((l) => l.id !== link.id) ?? null);
              })
            }
          />
        ))}
      </ul>

      {failed && (
        <p className={form.error} role="alert">
          No se pudo completar la acción.
        </p>
      )}

      {props.owner && links && (
        <section className={styles.create} aria-labelledby="new-link-heading">
          <h3 id="new-link-heading" className={styles.createHeading}>
            Enlace nuevo
          </h3>
          {free.length > 0 ? (
            <>
              <div className={styles.createRow}>
                <div className={styles.picker}>
                  <Select
                    label="Para"
                    value={scope}
                    options={[{ id: "", name: "Elegir etiqueta o persona" }, ...free]}
                    onPick={setScope}
                  />
                </div>
                <button type="button" className={styles.createButton} disabled={!chosen} onClick={create}>
                  Crear enlace
                </button>
              </div>
              <p className={styles.hint}>
                {chosen
                  ? `Quien tenga este enlace ve solo las tarjetas de ${chosen.name}.`
                  : "Un enlace por cliente (etiqueta) o por persona del equipo."}
              </p>
            </>
          ) : (
            <p className={styles.hint}>
              {props.labels.length === 0
                ? "Crea una etiqueta por cliente para compartir con cada uno solo su trabajo."
                : "Cada etiqueta y persona ya tiene su enlace."}
            </p>
          )}
        </section>
      )}
    </Dialog>
  );
}
