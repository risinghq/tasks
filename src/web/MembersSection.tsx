import { useEffect, useState, type FormEvent } from "react";
import { ROLE_TITLES, ROLES, type Member, type Role } from "../shared/model";
import { api, ApiError } from "./api";
import form from "./form.module.css";
import styles from "./SettingsDialog.module.css";

function RoleSelect(props: {
  id: string;
  label: string;
  value: Role;
  disabled?: boolean;
  onChange: (role: Role) => void;
}) {
  return (
    <select
      id={props.id}
      className={form.input + " " + styles.role}
      aria-label={props.label}
      value={props.value}
      disabled={props.disabled}
      onChange={(event) => props.onChange(event.target.value as Role)}
    >
      {ROLES.map((role) => (
        <option key={role} value={role}>
          {ROLE_TITLES[role]}
        </option>
      ))}
    </select>
  );
}

function AddMember(props: { onAdded: (member: Member) => void }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("member");
  const [error, setError] = useState<string | null>(null);

  async function add(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      props.onAdded(await api.addMember({ email, role }));
      setEmail("");
    } catch (failure) {
      console.error(failure);
      setError(
        failure instanceof ApiError && failure.status === 409
          ? "Ese correo ya tiene una cuenta."
          : "No se pudo añadir al miembro.",
      );
    }
  }

  return (
    <form onSubmit={add}>
      <div className={styles.addRow}>
        <input
          className={form.input}
          type="email"
          required
          aria-label="Correo de Google del miembro"
          placeholder="correo@gmail.com"
          autoComplete="off"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <RoleSelect id="add-role" label="Rol del miembro nuevo" value={role} onChange={setRole} />
        <button type="submit" className={form.primary}>
          Añadir
        </button>
      </div>
      <p className={styles.hint}>Entra con la cuenta de Google que tiene ese correo.</p>
      {error && (
        <p className={form.error} role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

function Row(props: { member: Member; self: boolean; onChange: (member: Member) => void }) {
  const { member } = props;
  const [failed, setFailed] = useState(false);

  async function update(patch: { role?: Role; disabled?: boolean }) {
    setFailed(false);
    try {
      props.onChange(await api.updateMember(member.id, patch));
    } catch (error) {
      console.error(error);
      setFailed(true);
    }
  }

  return (
    <li className={styles.member} data-disabled={member.disabled}>
      <div className={styles.memberHead}>
        <div className={styles.who}>
          <strong>{member.name}</strong>
          <span className={styles.hint}>
            {member.email ?? "Sin correo"}
            {props.self && " · Tú"}
            {member.disabled && " · Desactivado"}
          </span>
        </div>
        <RoleSelect
          id={`role-${member.id}`}
          label={`Rol de ${member.name}`}
          value={member.role}
          disabled={props.self}
          onChange={(role) => update({ role })}
        />
      </div>
      {!props.self && (
        <div className={styles.memberActions}>
          <button
            type="button"
            className={member.disabled ? form.secondary : form.danger}
            onClick={() => update({ disabled: !member.disabled })}
          >
            {member.disabled ? "Activar" : "Desactivar"}
          </button>
        </div>
      )}
      {failed && (
        <p className={form.error} role="alert">
          No se pudo completar la acción.
        </p>
      )}
    </li>
  );
}

export function MembersSection(props: { selfId: string }) {
  const [members, setMembers] = useState<Member[] | null>(null);

  useEffect(() => {
    api.members().then(setMembers, console.error);
  }, []);

  const replace = (next: Member) =>
    setMembers((all) => all?.map((member) => (member.id === next.id ? next : member)) ?? null);
  const append = (next: Member) => setMembers((all) => [...(all ?? []), next]);

  return (
    <section className={styles.section} aria-labelledby="members-heading">
      <h3 id="members-heading" className={styles.heading}>
        Miembros
      </h3>
      <AddMember onAdded={append} />
      <ul className={styles.members} aria-label="Miembros">
        {members?.map((member) => (
          <Row key={member.id} member={member} self={member.id === props.selfId} onChange={replace} />
        ))}
      </ul>
    </section>
  );
}
