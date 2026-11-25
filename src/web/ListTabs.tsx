import { LISTS, LIST_TITLES, type Card, type ListId } from "../shared/model";
import styles from "./ListTabs.module.css";

/** The narrow layout's tab bar: one list shows at a time, each tab with its count. */
export function ListTabs(props: { cards: Card[]; current: ListId; onSelect: (list: ListId) => void }) {
  return (
    <nav className={styles.tabs} role="tablist" aria-label="Listas">
      {LISTS.map((list) => (
        <button
          key={list}
          type="button"
          role="tab"
          id={`tab-${list}`}
          className={styles.tab}
          aria-selected={props.current === list}
          aria-controls={`list-${list}`}
          onClick={() => props.onSelect(list)}
        >
          {LIST_TITLES[list]}
          <span className={styles.count}>{props.cards.filter((card) => card.list === list).length}</span>
        </button>
      ))}
    </nav>
  );
}
