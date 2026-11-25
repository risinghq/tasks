import { useState, type FormEvent } from "react";
import { WORKSPACE_NAME_MAX, type Me, type Workspace } from "../shared/model";
import { api } from "./api";
import form from "./form.module.css";
import styles from "./SettingsDialog.module.css";
import { chooseWorkspace } from "./workspace";

export function WorkspaceSection(props: {
  me: Me;
  workspace: Workspace;
  onChange: (workspace: Workspace) => void;
}) {
  const { workspace } = props;
  const personal = workspace.id === props.me.id;
  const owner = workspace.role === "owner";
  const [name, setName] = useState(workspace.name);
  const [confirming, setConfirming] = useState(false);
  const [failed, setFailed] = useState(false);
  const next = name.trim();

  async function rename(event: FormEvent) {
    event.preventDefault();
    setFailed(false);
    try {
      props.onChange(await api.renameWorkspace(next));
    } catch (error) {
      console.error(error);
      setFailed(true);
    }
  }

  async function remove() {
    try {
      await api.deleteWorkspace();
      chooseWorkspace(null);
      location.reload();
    } catch (error) {
      console.error(error);
      setFailed(true);
    }
  }

  return (
    <section className={styles.section} aria-labelledby="workspace-heading">
      <h3 id="workspace-heading" className={styles.heading}>
        Espacio de trabajo
      </h3>
      <form className={styles.form} onSubmit={rename}>
        <div className={form.field}>
          <label className={form.label} htmlFor="workspace-name">
            Nombre
          </label>
          <input
            id="workspace-name"
            className={form.input}
            maxLength={WORKSPACE_NAME_MAX}
            disabled={!owner}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <p className={styles.hint}>
            {personal
              ? "Tu espacio personal. No se puede borrar."
              : "Quien esté en este espacio ve las mismas tarjetas."}
          </p>
        </div>
        {owner && (
          <div className={form.actions}>
            <button type="submit" className={form.secondary} disabled={!next || next === workspace.name}>
              Guardar nombre
            </button>
            <span className={form.spacer} />
            {!personal && !confirming && (
              <button type="button" className={form.danger} onClick={() => setConfirming(true)}>
                Borrar espacio
              </button>
            )}
          </div>
        )}
        {failed && (
          <p className={form.error} role="alert">
            No se pudo completar la acción.
          </p>
        )}
      </form>
      {confirming && (
        <div className={form.confirm} role="alertdialog" aria-label="Confirmar borrado del espacio">
          <p>Se borran sus tarjetas, etiquetas y tokens para todos. ¿Borrar “{workspace.name}”?</p>
          <div className={form.confirmActions}>
            <button type="button" className={form.destroy} onClick={remove}>
              Sí, borrar
            </button>
            <button type="button" className={form.secondary} onClick={() => setConfirming(false)}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
