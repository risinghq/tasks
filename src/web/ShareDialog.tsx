import { Check, Copy, ExternalLink, Layers } from "lucide-react";
import { useEffect, useState } from "react";
import type { Label, Person, ReportLink } from "../shared/model";
import type { CreateReportLink } from "../shared/schemas";
import { api } from "./api";
import { LabelDot } from "./CardView";
import { Dialog } from "./Dialog";
import form from "./form.module.css";
import { Initial, Select, type Option } from "./Select";
import styles from "./ShareDialog.module.css";

const urlOf = (link: ReportLink) => `${location.origin}/r/${link.token}`;

/** Who a link is for, in the words the list shows. */
function audienceOf(link: ReportLink, workspace: string) {
  if (link.label)
    return {
      mark: <LabelDot color={link.label.color} />,
      name: link.label.name,
      reach: "Solo las tarjetas con esta etiqueta.",
    };
  if (link.member)
    return {
      mark: <Initial name={link.member.name} />,
      name: link.member.name,
      reach: "Solo las tarjetas asignadas a esta persona.",
    };
  return {
    mark: <Layers size={14} className={styles.wholeMark} aria-hidden />,
    name: "Todo el espacio",
    reach: `Todas las tarjetas de ${workspace}.`,
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
    <button type="button" className={form.secondary} onClick={copy}>
      {copied ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}
      {copied ? "Copiado" : "Copiar enlace"}
    </button>
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
  const [confirming, setConfirming] = useState<"regenerate" | "delete" | null>(null);
  const audience = audienceOf(link, props.workspace);
  const whole = !link.label && !link.member;

  return (
    <li className={styles.link}>
      <div className={styles.audience}>
        <span className={styles.mark}>{audience.mark}</span>
        <span className={styles.audienceText}>
          <strong className={styles.audienceName}>{audience.name}</strong>
          <span className={styles.reach}>{audience.reach}</span>
        </span>
      </div>
      <div className={styles.actions}>
        <CopyButton value={urlOf(link)} />
        <a
          className={form.ghost + " " + styles.open}
          href={urlOf(link)}
          target="_blank"
          rel="noreferrer"
          aria-label="Abrir"
          title="Abrir el informe"
        >
          <ExternalLink size={16} aria-hidden />
        </a>
        {props.owner && !confirming && (
          <span className={styles.manage}>
            <button type="button" className={form.ghost} onClick={() => setConfirming("regenerate")}>
              Cambiar enlace
            </button>
            {!whole && (
              <button type="button" className={form.danger} onClick={() => setConfirming("delete")}>
                Eliminar
              </button>
            )}
          </span>
        )}
      </div>
      {confirming && (
        <div className={form.confirm} role="alertdialog" aria-label={`Confirmar: ${audience.name}`}>
          <p>
            {confirming === "regenerate"
              ? "El enlace actual dejará de funcionar. Tendrás que enviar el nuevo."
              : "El enlace dejará de funcionar."}
          </p>
          <div className={form.confirmActions}>
            <button
              type="button"
              className={form.destroy}
              onClick={async () => {
                await (confirming === "regenerate" ? props.onRegenerate() : props.onDelete());
                setConfirming(null);
              }}
            >
              {confirming === "regenerate" ? "Sí, cambiar" : "Sí, eliminar"}
            </button>
            <button type="button" className={form.secondary} onClick={() => setConfirming(null)}>
              Cancelar
            </button>
          </div>
        </div>
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
    <Dialog title="Compartir informe" onClose={props.onClose}>
      <p className={styles.intro}>
        Cada enlace abre el informe semanal sin contraseña. Envía a cada cliente o responsable solo el suyo.
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
              <Select
                label="Para"
                value={scope}
                options={[{ id: "", name: "Elegir etiqueta o persona" }, ...free]}
                onPick={setScope}
              />
              <p className={styles.reach}>
                {chosen
                  ? `Quien tenga este enlace ve solo las tarjetas de ${chosen.name}.`
                  : "Un enlace por cliente (etiqueta) o por persona del equipo."}
              </p>
              <div className={form.actions}>
                <button type="button" className={form.primary} disabled={!chosen} onClick={create}>
                  Crear enlace
                </button>
              </div>
            </>
          ) : (
            <p className={styles.reach}>
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
