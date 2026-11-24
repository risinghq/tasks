import type { Me, WorkspaceSettings } from "../shared/model";
import { AccountSection } from "./AccountSection";
import { Dialog } from "./Dialog";
import { MembersSection } from "./MembersSection";
import { ReportSection } from "./ReportSection";
import { TokensSection } from "./TokensSection";
import { WorkspaceSection } from "./WorkspaceSection";

export function SettingsDialog(props: {
  me: Me;
  workspace: WorkspaceSettings;
  onMe: (me: Me) => void;
  onWorkspace: (workspace: WorkspaceSettings) => void;
  onClose: () => void;
}) {
  const { me, workspace } = props;
  return (
    <Dialog title="Ajustes" onClose={props.onClose} wide>
      <AccountSection me={me} onChange={props.onMe} />
      <WorkspaceSection me={me} workspace={workspace} onChange={props.onWorkspace} />
      <ReportSection workspace={workspace} onChange={props.onWorkspace} />
      <TokensSection />
      <MembersSection selfId={me.id} owner={workspace.role === "owner"} personal={workspace.id === me.id} />
    </Dialog>
  );
}
