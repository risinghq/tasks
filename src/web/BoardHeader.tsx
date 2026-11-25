import { Filter as FilterIcon, Share } from "lucide-react";
import type { Me, Workspace } from "../shared/model";
import styles from "./BoardHeader.module.css";
import { UserMenu } from "./UserMenu";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";

/** The filter button the layout shows: the labelled one when wide, the icon when narrow. */
export function shownFilterButton(): HTMLElement | null {
  const buttons = document.querySelectorAll<HTMLElement>("[data-filter-button]");
  return [...buttons].find((button) => button.offsetParent !== null) ?? null;
}

/** The workspace switcher, the filter, the report and the user menu. */
export function BoardHeader(props: {
  me: Me | null;
  workspace: Workspace | null;
  workspaceName: string;
  userName: string | null;
  openCount: number;
  /** How many filter criteria are set; 0 is no filter. */
  criteria: number;
  filterOpen: boolean;
  onFilter: (anchor: HTMLElement) => void;
  onShare: () => void;
  onSwitch: (id: string) => void;
  onNewWorkspace: () => void;
  onSettings: () => void;
  onShortcuts: () => void;
}) {
  const filterProps = {
    type: "button",
    "data-filter-button": true,
    "aria-haspopup": "dialog",
    "aria-expanded": props.filterOpen,
    onClick: (event: { currentTarget: HTMLElement }) => props.onFilter(event.currentTarget),
  } as const;

  return (
    <header className={styles.header}>
      <div className={styles.left}>
        <h1 className={styles.title}>
          <WorkspaceSwitcher
            workspaces={props.me?.workspaces ?? []}
            currentId={props.workspace?.id ?? null}
            name={props.workspaceName}
            openCount={props.openCount}
            onShare={props.onShare}
            onSwitch={props.onSwitch}
            onNewWorkspace={props.onNewWorkspace}
          />
        </h1>
        <span className={styles.divider} aria-hidden />
        <button {...filterProps} className={styles.filter} data-active={props.criteria > 0}>
          <FilterIcon size={16} aria-hidden /> Filtrar
          {props.criteria > 0 && <span className={styles.filterCount}>{props.criteria}</span>}
        </button>
      </div>
      <div className={styles.actions}>
        <button type="button" className={styles.report} onClick={props.onShare}>
          <Share size={16} aria-hidden /> Compartir informe
        </button>
        <button {...filterProps} className={styles.filterIcon} aria-label="Filtrar">
          <FilterIcon size={16} aria-hidden />
          {props.criteria > 0 && <span className={styles.filterDot} aria-hidden />}
        </button>
        <UserMenu
          name={props.userName}
          email={props.me?.email ?? null}
          onSettings={props.onSettings}
          onShortcuts={props.onShortcuts}
        />
      </div>
    </header>
  );
}
