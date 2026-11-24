import { useState, type FormEvent } from "react";
import type { Settings } from "../shared/model";
import { api } from "./api";
import form from "./form.module.css";
import styles from "./SettingsDialog.module.css";

function NameForm(props: { settings: Settings; onChange: (settings: Settings) => void }) {
  const [name, setName] = useState(props.settings.name);
  const [saved, setSaved] = useState(false);
  const [failed, setFailed] = useState(false);
  const next = name.trim();

  async function save(event: FormEvent) {
    event.preventDefault();
    setFailed(false);
    try {
      props.onChange(await api.rename(next));
      setSaved(true);
    } catch (error) {
      console.error(error);
      setFailed(true);
    }
  }

  return (
    <form className={styles.form} onSubmit={save}>
      <div className={form.field}>
        <label className={form.label} htmlFor="account-name">
          Nombre
        </label>
        <input
          id="account-name"
          className={form.input}
          maxLength={80}
          autoComplete="name"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            setSaved(false);
          }}
        />
        <p className={styles.hint}>{props.settings.email}</p>
      </div>
      <div className={form.actions}>
        <button type="submit" className={form.secondary} disabled={!next || next === props.settings.name}>
          Guardar nombre
        </button>
        {saved && <span role="status">Nombre guardado.</span>}
        {failed && (
          <span className={form.error} role="alert">
            No se pudo guardar el nombre.
          </span>
        )}
      </div>
    </form>
  );
}

export function AccountSection(props: { settings: Settings; onChange: (settings: Settings) => void }) {
  return (
    <section className={styles.section} aria-labelledby="account-heading">
      <h3 id="account-heading" className={styles.heading}>
        Cuenta
      </h3>
      <NameForm settings={props.settings} onChange={props.onChange} />
    </section>
  );
}
