import { Check, ChevronDown, ExternalLink, Plus } from "lucide-react";
import { useState } from "react";
import type { Me } from "../shared/model";
import { Sheet } from "./Sheet";
import styles from "./WorkspaceSwitcher.module.css";

const plural = (n: number) => `${n} ${n === 1 ? "abierta" : "abiertas"}`;

function Mono({ name, size }: { name: string; size: "small" | "row" }) {
  return (
    <span className={styles.mono} data-size={size} aria-hidden>
      {(name[0] ?? "?").toUpperCase()}
    </span>
  );
}

/** The workspace name and switcher in the header: a bottom sheet on mobile, a popover on desktop. */
export function WorkspaceSwitcher(props: {
  workspaces: Me["workspaces"];
  currentId: string | null;
  name: string;
  /** Live open-card count of the current workspace, from the loaded board. */
  openCount: number;
  reportUrl: string | null;
  onSwitch: (id: string) => void;
  onNewWorkspace: () => void;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

  return (
    <>
      <button
        type="button"
        className={styles.trigger}
        aria-haspopup="dialog"
        aria-expanded={anchor !== null}
        onClick={(event) => setAnchor(anchor ? null : event.currentTarget)}
      >
        <Mono name={props.name} size="small" />
        <span className={styles.name}>{props.name}</span>
        <ChevronDown size={16} className={styles.chevron} aria-hidden />
      </button>
      {anchor && (
        <Sheet anchor={anchor} label="Espacios" onClose={() => setAnchor(null)}>
          <div className={styles.sheet}>
            <p className={styles.heading}>Espacios</p>
            <div role="radiogroup" aria-label="Espacios">
              {props.workspaces.map((workspace) => {
                const current = workspace.id === props.currentId;
                const count = current ? props.openCount : workspace.openCount;
                return (
                  <button
                    key={workspace.id}
                    type="button"
                    role="radio"
                    aria-checked={current}
                    className={styles.workspace}
                    onClick={() => {
                      setAnchor(null);
                      if (!current) props.onSwitch(workspace.id);
                    }}
                  >
                    <Mono name={workspace.name} size="row" />
                    <span className={styles.workspaceText}>
                      <span className={styles.workspaceName}>{workspace.name}</span>
                      <span className={styles.workspaceCount}>{plural(count)}</span>
                    </span>
                    <Check size={16} className={styles.check} data-on={current} aria-hidden />
                  </button>
                );
              })}
            </div>
            <div className={styles.divider} />
            {props.reportUrl && (
              <a href={props.reportUrl} className={styles.action} role="menuitem">
                <span className={styles.actionText}>Informe semanal de {props.name}</span>
                <ExternalLink size={14} className={styles.actionIcon} aria-hidden />
              </a>
            )}
            <button
              type="button"
              role="menuitem"
              className={styles.action}
              onClick={() => {
                setAnchor(null);
                props.onNewWorkspace();
              }}
            >
              <Plus size={16} className={styles.actionIcon} aria-hidden />
              <span className={styles.actionText}>Espacio nuevo</span>
            </button>
          </div>
        </Sheet>
      )}
    </>
  );
}
