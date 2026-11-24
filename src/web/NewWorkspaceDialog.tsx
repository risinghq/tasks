import { useState, type FormEvent } from "react";
import { WORKSPACE_NAME_MAX } from "../shared/model";
import { api } from "./api";
import { Dialog } from "./Dialog";
import form from "./form.module.css";
import { chooseWorkspace } from "./workspace";

export function NewWorkspaceDialog(props: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [failed, setFailed] = useState(false);

  async function create(event: FormEvent) {
    event.preventDefault();
    setFailed(false);
    try {
      const workspace = await api.createWorkspace(name.trim());
      chooseWorkspace(workspace.id);
      location.reload();
    } catch (error) {
      console.error(error);
      setFailed(true);
    }
  }

  return (
    <Dialog title="Espacio nuevo" onClose={props.onClose}>
      <form onSubmit={create}>
        <div className={form.field}>
          <label className={form.label} htmlFor="new-workspace-name">
            Nombre
          </label>
          <input
            id="new-workspace-name"
            className={form.input}
            placeholder="Por ejemplo, Empresa A"
            maxLength={WORKSPACE_NAME_MAX}
            required
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className={form.actions}>
          <button type="submit" className={form.primary} disabled={!name.trim()}>
            Crear espacio
          </button>
          {failed && (
            <span className={form.error} role="alert">
              No se pudo crear el espacio.
            </span>
          )}
        </div>
      </form>
    </Dialog>
  );
}
