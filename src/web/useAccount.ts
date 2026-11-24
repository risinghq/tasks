import { useEffect, useState } from "react";
import type { Me, WorkspaceSettings } from "../shared/model";
import { api } from "./api";
import { chooseWorkspace } from "./workspace";

/** The signed-in user and the workspace the board shows. */
export function useAccount() {
  const [me, setMe] = useState<Me | null>(null);
  const [workspace, setWorkspace] = useState<WorkspaceSettings | null>(null);

  useEffect(() => {
    api.me().then(setMe, console.error);
    api.workspace().then(setWorkspace, console.error);
  }, []);

  /** Another workspace holds other cards, so the page reloads on it. */
  const switchWorkspace = (id: string) => {
    chooseWorkspace(id === me?.id ? null : id);
    location.assign("/");
  };

  /** A rename shows in the workspace list of the menu as well. */
  const renameWorkspace = (next: WorkspaceSettings) => {
    setWorkspace(next);
    setMe(
      (current) =>
        current && {
          ...current,
          workspaces: current.workspaces.map((w) => (w.id === next.id ? { ...w, name: next.name } : w)),
        },
    );
  };

  /** The name the menu shows: the workspace's own name unless it is the personal one. */
  const shownName = workspace && me && workspace.id !== me.id ? workspace.name : (me?.name ?? null);

  return { me, setMe, workspace, renameWorkspace, switchWorkspace, shownName };
}
