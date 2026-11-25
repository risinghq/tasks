import { DndContext, DragOverlay } from "@dnd-kit/core";
import { useEffect, useMemo, useState } from "react";
import type { ListId } from "../shared/model";
import styles from "./Board.module.css";
import { BoardHeader, shownFilterButton } from "./BoardHeader";
import { CardBack } from "./CardBack";
import { CardFace } from "./CardView";
import { FilterPopover } from "./FilterPopover";
import { inContainer, parseContainerId } from "./groups";
import { DoneColumn, FlatColumn } from "./ListColumn";
import { ListTabs } from "./ListTabs";
import { NewWorkspaceDialog } from "./NewWorkspaceDialog";
import { noteContent } from "./noteInput";
import { QuickEdit } from "./QuickEdit";
import { SettingsDialog } from "./SettingsDialog";
import { ShareDialog } from "./ShareDialog";
import { ShortcutsDialog } from "./ShortcutsDialog";
import { Toasts } from "./Toasts";
import { UiContext, type Ui } from "./ui";
import { useBoard } from "./useBoard";
import { useCardFileDrop } from "./useCardFileDrop";
import { useCardRoute } from "./useCardRoute";
import type { NoteActions } from "./useNotes";
import { dragAnnouncements, useCardDrag } from "./useCardDrag";
import { criteria as countCriteria, matches, useFilter } from "./useFilter";
import { useOpenDays } from "./useOpenDays";
import { useAccount } from "./useAccount";
import { useShortcuts } from "./useShortcuts";

const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

export function Board() {
  const board = useBoard();
  const route = useCardRoute();
  const { filter, active: filtering, set: setFilter, clear: clearFilter } = useFilter();
  const days = useOpenDays(board.today);

  const [composer, setComposer] = useState<string | null>(null);
  const [quick, setQuick] = useState<{ id: string; rect: DOMRect } | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [newWorkspaceOpen, setNewWorkspaceOpen] = useState(false);
  const { me, setMe, workspace, renameWorkspace, switchWorkspace, shownName } = useAccount();
  // The narrow layout shows one list at a time.
  const [tab, setTab] = useState<ListId>("en_curso");
  const [filterAnchor, setFilterAnchor] = useState<HTMLElement | null>(null);

  const shown = useMemo(() => board.cards.filter((card) => matches(card, filter)), [board.cards, filter]);
  const drag = useCardDrag(shown, board.move);

  const quickEdit = (id: string) => {
    const rect = document.querySelector(`[data-card-id="${id}"]`)?.getBoundingClientRect();
    if (rect) setQuick({ id, rect });
  };

  const toggleDone = (id: string) => {
    const card = board.cards.find((c) => c.id === id);
    if (!card) return;
    if (card.list === "hecho") {
      board.move(id, { list: "en_curso", doneDate: null }, null);
      return;
    }
    const today = { list: "hecho", doneDate: board.today } as const;
    board.move(id, today, inContainer(board.cards, today)[0]?.id ?? null);
    days.open(board.today);
  };

  const addCard = (containerId: string, title: string) => {
    const container = parseContainerId(containerId);
    if (!container) return;
    if (container.list === "hecho" && container.doneDate) days.open(container.doneDate);
    const id = board.add(title, container);
    requestAnimationFrame(() =>
      document.querySelector(`[data-card-id="${id}"]`)?.scrollIntoView({ block: "nearest" }),
    );
  };

  // The card opened with `a`: its back opens with the note box focused.
  const [noteFocus, setNoteFocus] = useState<string | null>(null);
  const takeNote = (id: string) => {
    setNoteFocus(id);
    route.open(id);
  };
  const noteActions: NoteActions = {
    list: board.notes,
    add: board.addNote,
    update: board.updateNote,
    remove: board.removeNote,
  };

  /** Adds pasted or dropped pieces to a card from the board, where the toasts show. */
  const noteOnCard = async (id: string, contents: (string | File)[]) => {
    if (!contents.length) return;
    const results = await Promise.all(contents.map((content) => board.addNote(id, content)));
    const errors = results.flatMap((result) => ("error" in result ? [result.error] : []));
    const saved = results.length - errors.length;
    const open = { label: "Ver", run: () => route.open(id) };
    const [error] = errors;
    if (error) board.notify(error, saved ? open : undefined);
    else board.notify(saved === 1 ? "Nota añadida." : `${saved} notas añadidas.`, open);
  };
  const fileDrop = useCardFileDrop((id, files) => void noteOnCard(id, files));

  const ui: Ui = {
    today: board.today,
    openCard: route.open,
    quickEdit,
    toggleDone,
    composer,
    quickEditing: quick !== null,
    fileOver: fileDrop.over,
    setComposer,
    addCard,
    labels: board.labels,
    members: board.members,
    createLabel: board.createLabel,
    updateLabel: board.updateLabel,
    removeLabel: board.removeLabel,
  };

  const openCard = route.id ? board.cards.find((card) => card.id === route.id) : undefined;
  const quickCard = quick && board.cards.find((card) => card.id === quick.id);

  // A card URL names a card the loaded weeks may not hold. If the server has none, say so.
  useEffect(() => {
    if (!board.ready || !route.id) return;
    void board.open(route.id).then((found) => {
      if (found) return;
      board.notify("No se encontró la tarjeta.");
      route.close();
    });
    // Only a new URL or the first load decides this. A card deleted while open must not trigger it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board.ready, route.id]);

  useEffect(() => {
    document.documentElement.dataset.dragging = String(drag.dragging !== null);
  }, [drag.dragging]);

  /** The keyboard 'f' opens the filter anchored to whichever button is showing. */
  const openFilter = (from?: HTMLElement | null) => {
    setFilterAnchor(from ?? shownFilterButton());
    setFilterOpen(true);
  };

  const modalOpen =
    Boolean(route.id) ||
    quick !== null ||
    settingsOpen ||
    shareOpen ||
    newWorkspaceOpen ||
    helpOpen ||
    filterOpen;
  const pointer = useShortcuts(modalOpen, {
    composer: setComposer,
    quickEdit,
    note: takeNote,
    paste: (id, data) => void noteOnCard(id, noteContent(data)),
    filter: () => openFilter(),
    clearFilter,
    help: () => setHelpOpen(true),
  });

  const dragged = drag.dragging && drag.cards.find((card) => card.id === drag.dragging?.id);
  const shared = { cards: drag.cards, dragging: drag.dragging !== null, filtering, current: tab };
  const workspaceName = workspace?.name ?? "Espacio";
  const openCount = board.cards.filter((card) => card.list !== "hecho").length;

  return (
    <UiContext.Provider value={ui}>
      <div className={styles.page} {...pointer} {...fileDrop.props}>
        <BoardHeader
          me={me}
          workspace={workspace}
          workspaceName={workspaceName}
          userName={shownName}
          openCount={openCount}
          criteria={countCriteria(filter)}
          filterOpen={filterOpen}
          onFilter={(anchor) => (filterOpen ? setFilterOpen(false) : openFilter(anchor))}
          onShare={() => setShareOpen(true)}
          onSwitch={switchWorkspace}
          onNewWorkspace={() => setNewWorkspaceOpen(true)}
          onSettings={() => setSettingsOpen(true)}
          onShortcuts={() => setHelpOpen(true)}
        />
        <ListTabs cards={drag.cards} current={tab} onSelect={setTab} />

        {board.loadError && (
          <div className={styles.error} role="alert">
            No se pudo cargar el tablero.
            <button type="button" onClick={() => location.reload()}>
              Recargar
            </button>
          </div>
        )}

        {board.ready && (
          <DndContext
            sensors={drag.sensors}
            collisionDetection={drag.collisionDetection}
            accessibility={dragAnnouncements}
            onDragStart={drag.onDragStart}
            onDragOver={drag.onDragOver}
            onDragEnd={drag.onDragEnd}
            onDragCancel={drag.onDragCancel}
          >
            <main className={styles.lists}>
              <FlatColumn {...shared} list="pendiente" />
              <FlatColumn {...shared} list="esta_semana" />
              <FlatColumn {...shared} list="en_curso" />
              <DoneColumn
                {...shared}
                today={board.today}
                days={days}
                hasOlder={board.olderWeek !== null}
                onLoadOlder={board.loadOlder}
              />
            </main>
            <DragOverlay dropAnimation={reducedMotion() ? null : { duration: 150, easing: "ease-out" }}>
              {dragged ? <CardFace card={dragged} lifted /> : null}
            </DragOverlay>
          </DndContext>
        )}
      </div>

      {openCard && (
        <CardBack
          key={openCard.id}
          card={openCard}
          today={board.today}
          workspace={workspaceName}
          requesters={board.requesters}
          actions={{
            edit: (fields) => board.edit(openCard.id, fields),
            move: (to) => board.move(openCard.id, to, null),
            remove: () => board.remove(openCard.id),
            toggleDone: () => toggleDone(openCard.id),
          }}
          noteActions={noteActions}
          focusNotes={noteFocus === openCard.id}
          onClose={() => {
            setNoteFocus(null);
            route.close();
          }}
        />
      )}

      {quick && quickCard && (
        <QuickEdit
          key={quick.id}
          card={quickCard}
          rect={quick.rect}
          today={board.today}
          requesters={board.requesters}
          actions={{
            edit: (fields) => board.edit(quickCard.id, fields),
            move: (to) => board.move(quickCard.id, to, null),
          }}
          onOpenCard={() => route.open(quickCard.id)}
          onDelete={() => {
            board.remove(quickCard.id);
            setQuick(null);
          }}
          onClose={() => setQuick(null)}
        />
      )}

      {filterOpen && filterAnchor && (
        <FilterPopover
          anchor={filterAnchor}
          filter={filter}
          matches={shown.length}
          labels={board.labels}
          members={board.members}
          requesters={board.requesters}
          onChange={setFilter}
          onClear={clearFilter}
          onClose={() => setFilterOpen(false)}
        />
      )}

      {settingsOpen && me && workspace && (
        <SettingsDialog
          me={me}
          workspace={workspace}
          onMe={setMe}
          onWorkspace={renameWorkspace}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      {shareOpen && (
        <ShareDialog
          workspace={workspaceName}
          owner={workspace?.role === "owner"}
          labels={board.labels}
          members={board.members}
          onClose={() => setShareOpen(false)}
        />
      )}
      {newWorkspaceOpen && <NewWorkspaceDialog onClose={() => setNewWorkspaceOpen(false)} />}
      {helpOpen && <ShortcutsDialog onClose={() => setHelpOpen(false)} />}
      <Toasts toasts={board.toasts} onClose={board.closeToast} />
    </UiContext.Provider>
  );
}
