import { useEffect, useState, type FormEvent } from "react";
import { ROLE_TITLES, WORKSPACE_ROLES, type Member, type WorkspaceRole } from "../shared/model";
import { api, ApiError } from "./api";
import form from "./form.module.css";
import styles from "./SettingsDialog.module.css";
import { chooseWorkspace } from "./workspace";

function RoleSelect(props: {
  id: string;
  label: string;
  value: WorkspaceRole;
  disabled?: boolean;
  onChange: (role: WorkspaceRole) => void;
}) {
  return (
    <select
      id={props.id}
      className={form.input + " " + styles.role}
      aria-label={props.label}
      value={props.value}
      disabled={props.disabled}
      onChange={(event) => props.onChange(event.target.value as WorkspaceRole)}
    >
      {WORKSPACE_ROLES.map((role) => (
        <option key={role} value={role}>
          {ROLE_TITLES[role]}
        </option>
      ))}
    </select>
  );
}

function AddMember(props: { onAdded: (member: Member) => void }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<WorkspaceRole>("member");
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
          ? "Ese correo ya está en este espacio."
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

function Row(props: {
  member: Member;
  self: boolean;
  owner: boolean;
  personal: boolean;
  onChange: (member: Member) => void;
  onRemoved: (member: Member) => void;
}) {
  const { member, self } = props;
  const [failed, setFailed] = useState(false);

  async function run(action: () => Promise<void>) {
    setFailed(false);
    try {
      await action();
    } catch (error) {
      console.error(error);
      setFailed(true);
    }
  }

  const changeRole = (role: WorkspaceRole) =>
    run(async () => props.onChange(await api.updateMember(member.id, role)));
  const remove = () =>
    run(async () => {
      await api.removeMember(member.id);
      if (self) {
        chooseWorkspace(null);
        location.reload();
      } else props.onRemoved(member);
    });

  const canRemove = props.owner ? !self : self && !props.personal;

  return (
    <li className={styles.member}>
      <div className={styles.memberHead}>
        <div className={styles.who}>
          <strong>{member.name}</strong>
          <span className={styles.hint}>
            {member.email}
            {self && " · Tú"}
          </span>
        </div>
        <RoleSelect
          id={`role-${member.id}`}
          label={`Rol de ${member.name}`}
          value={member.role}
          disabled={!props.owner || self}
          onChange={changeRole}
        />
      </div>
      {canRemove && (
        <div className={styles.memberActions}>
          <button type="button" className={form.danger} onClick={remove}>
            {self ? "Salir del espacio" : "Quitar"}
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

export function MembersSection(props: { selfId: string; owner: boolean; personal: boolean }) {
  const [members, setMembers] = useState<Member[] | null>(null);

  useEffect(() => {
    api.members().then(setMembers, console.error);
  }, []);

  const replace = (next: Member) =>
    setMembers((all) => all?.map((member) => (member.id === next.id ? next : member)) ?? null);
  const append = (next: Member) => setMembers((all) => [...(all ?? []), next]);
  const drop = (gone: Member) => setMembers((all) => all?.filter((member) => member.id !== gone.id) ?? null);

  return (
    <section className={styles.section} aria-labelledby="members-heading">
      <h3 id="members-heading" className={styles.heading}>
        Miembros
      </h3>
      {props.owner && <AddMember onAdded={append} />}
      <ul className={styles.members} aria-label="Miembros">
        {members?.map((member) => (
          <Row
            key={member.id}
            member={member}
            self={member.id === props.selfId}
            owner={props.owner}
            personal={props.personal}
            onChange={replace}
            onRemoved={drop}
          />
        ))}
      </ul>
    </section>
  );
}
