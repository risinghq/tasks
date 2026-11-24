import { Keyboard, LogOut, Settings } from "lucide-react";
import { useState } from "react";
import { Sheet } from "./Sheet";
import styles from "./UserMenu.module.css";
import { readTheme, saveTheme, THEME_TITLES, THEMES, type Theme } from "./theme";

function Avatar({ name, size }: { name: string; size: "trigger" | "header" }) {
  return (
    <span className={styles.avatar} data-size={size} aria-hidden>
      {(name[0] ?? "?").toUpperCase()}
    </span>
  );
}

export function UserMenu(props: {
  name: string | null;
  email: string | null;
  onSettings: () => void;
  onShortcuts: () => void;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [theme, setTheme] = useState<Theme>(readTheme);
  const name = props.name ?? "Cuenta";

  const choose = (action: () => void) => () => {
    setAnchor(null);
    action();
  };

  return (
    <>
      <button
        type="button"
        className={styles.trigger}
        aria-label="Cuenta"
        aria-haspopup="menu"
        aria-expanded={anchor !== null}
        onClick={(event) => setAnchor(anchor ? null : event.currentTarget)}
      >
        <Avatar name={name} size="trigger" />
      </button>
      {anchor && (
        <Sheet anchor={anchor} label="Cuenta" align="right" role="menu" onClose={() => setAnchor(null)}>
          <div className={styles.menu}>
            <header className={styles.account}>
              <Avatar name={name} size="header" />
              <span className={styles.accountText}>
                <span className={styles.accountName}>{name}</span>
                {props.email && <span className={styles.accountEmail}>{props.email}</span>}
              </span>
            </header>
            <div className={styles.divider} />
            <button type="button" role="menuitem" className={styles.item} onClick={choose(props.onSettings)}>
              <Settings size={16} aria-hidden /> Ajustes
            </button>
            <div className={styles.theme}>
              <span className={styles.itemLabel}>Tema</span>
              <div className={styles.segment} role="group" aria-label="Tema">
                {THEMES.map((option) => (
                  <button
                    key={option}
                    type="button"
                    role="menuitemradio"
                    aria-checked={theme === option}
                    className={styles.segmentItem}
                    onClick={() => {
                      saveTheme(option);
                      setTheme(option);
                    }}
                  >
                    {THEME_TITLES[option]}
                  </button>
                ))}
              </div>
            </div>
            <button type="button" role="menuitem" className={styles.item} onClick={choose(props.onShortcuts)}>
              <Keyboard size={16} aria-hidden /> Atajos de teclado
              <kbd className={styles.key} aria-hidden>
                ?
              </kbd>
            </button>
            <div className={styles.divider} />
            <form method="post" action="/logout">
              <button type="submit" role="menuitem" className={styles.item} data-quiet>
                <LogOut size={16} aria-hidden /> Salir
              </button>
            </form>
          </div>
        </Sheet>
      )}
    </>
  );
}
