"use client";

import { Activity, AlertTriangle, KeyRound, Pencil, Shield, Trash2, UserPlus, X } from "lucide-react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState, useTransition, type ReactNode } from "react";
import {
  adminCreateUserAction,
  adminDeleteUserAction,
  adminSetUserPasswordAction,
  adminUpdateUserAction,
} from "../../app/admin/users/actions";
import { Button, ButtonLink } from "../ui/button";
import { PasswordInput } from "../ui/password-input";
import type { AuthUser } from "../../lib/auth/session";
import type { ManagedUser } from "../../lib/auth/user-service";
import { roleLabels, roles, type Role } from "../../lib/auth/rbac";
import { designTokens } from "../../lib/design-tokens";
import { formatDisplayDateTimeLocal } from "../../lib/format/display-date";

type UserManagementDashboardProps = {
  currentUser: AuthUser;
  initialUsers?: ManagedUser[];
};

export function UserManagementDashboard({
  currentUser,
  initialUsers = [],
}: UserManagementDashboardProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [createOpen, setCreateOpen] = useState(false);
  const [passwordUser, setPasswordUser] = useState<ManagedUser | null>(null);
  const [editUser, setEditUser] = useState<ManagedUser | null>(null);
  const [deleteUser, setDeleteUser] = useState<ManagedUser | null>(null);

  const activeUsers = useMemo(() => initialUsers.filter((user) => user.active).length, [initialUsers]);

  const refresh = useCallback(() => {
    router.refresh();
  }, [router]);

  return (
    <main className="min-h-screen bg-app-bg p-6 text-app-text">
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-card border border-app-border bg-app-surface p-6 shadow-glow"
      >
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2 text-accent-primary">
              <Shield className="size-5" />
              <span className="text-sm uppercase tracking-[0.24em]">Admin Console</span>
            </div>
            <h1 className="mt-3 text-3xl font-semibold">Управление пользователями</h1>
            <p className="mt-2 text-sm text-app-muted">Текущий доступ: {currentUser.name}</p>
          </div>

          <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
            <Button type="button" onClick={() => setCreateOpen(true)}>
              <UserPlus className="size-4" />
              Создать пользователя
            </Button>
            <ButtonLink href="/dashboard" variant="secondary">
              Назад
            </ButtonLink>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <HealthCard label="Активные сессии" value="—" />
          <HealthCard label="Пользователи" value={String(initialUsers.length)} />
          <HealthCard label="Активные аккаунты" value={String(activeUsers)} tone="emerald" />
        </div>

        <div className="mt-6 overflow-hidden rounded-card border border-app-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-app-elevated text-app-muted">
              <tr>
                <th className="px-4 py-3">Имя</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Роль</th>
                <th className="px-4 py-3">Пароль</th>
                <th className="px-4 py-3">Статус</th>
                <th className="px-4 py-3">Последний вход</th>
                <th className="px-4 py-3 w-28"> </th>
              </tr>
            </thead>
            <tbody>
              {initialUsers.length > 0 ? (
                initialUsers.map((user) => (
                  <tr key={user.id} className="border-t border-app-border">
                    <td className="px-4 py-3">{user.name}</td>
                    <td className="px-4 py-3 text-app-muted">{user.email}</td>
                    <td className="px-4 py-3">{roleLabels[user.role]}</td>
                    <td className="px-4 py-3 text-app-muted">
                      <span className="select-none tracking-widest">••••••••</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="ml-2 align-middle"
                        onClick={() => setPasswordUser(user)}
                      >
                        <KeyRound className="size-3.5" />
                        Сменить
                      </Button>
                    </td>
                    <td className="px-4 py-3">
                      <span className={user.active ? "text-status-active" : "text-status-inactive"}>
                        {user.active ? "Активен" : "Отключён"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-app-muted">
                      {user.lastLoginAt ? formatDisplayDateTimeLocal(new Date(user.lastLoginAt)) : "не входил"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditUser(user)}
                        >
                          <Pencil className="size-3.5" />
                          Изменить
                        </Button>
                        {user.id !== currentUser.id ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-accent-danger hover:bg-accent-danger/10"
                            onClick={() => setDeleteUser(user)}
                          >
                            <Trash2 className="size-3.5" />
                            Удалить
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr className="border-t border-app-border">
                  <td className="px-4 py-6 text-app-muted" colSpan={7}>
                    Пользователи ещё не созданы. Запустите seed администратора.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </motion.section>

      {createOpen ? (
        <CreateUserModal
          onClose={() => setCreateOpen(false)}
          pending={pending}
          startTransition={startTransition}
          onSuccess={() => {
            setCreateOpen(false);
            refresh();
          }}
        />
      ) : null}

      {passwordUser ? (
        <SetPasswordModal
          user={passwordUser}
          onClose={() => setPasswordUser(null)}
          pending={pending}
          startTransition={startTransition}
          onSuccess={() => {
            setPasswordUser(null);
            refresh();
          }}
        />
      ) : null}

      {editUser ? (
        <EditUserModal
          user={editUser}
          currentUserId={currentUser.id}
          onClose={() => setEditUser(null)}
          pending={pending}
          startTransition={startTransition}
          onSuccess={() => {
            setEditUser(null);
            refresh();
          }}
        />
      ) : null}

      {deleteUser ? (
        <DeleteUserModal
          user={deleteUser}
          onClose={() => setDeleteUser(null)}
          pending={pending}
          startTransition={startTransition}
          onSuccess={() => {
            setDeleteUser(null);
            refresh();
          }}
        />
      ) : null}
    </main>
  );
}

function CreateUserModal({
  onClose,
  pending,
  startTransition,
  onSuccess,
}: {
  onClose: () => void;
  pending: boolean;
  startTransition: (fn: () => void) => void;
  onSuccess: () => void;
}) {
  const [error, setError] = useState<string | null>(null);

  return (
    <ModalShell title="Новый пользователь" onClose={onClose}>
      <p className="text-sm text-app-muted">
        Пароль хранится только как хеш — скопируйте его из полей ниже и передайте сотруднику до сохранения, если
        нужна «бумажка» с доступом.
      </p>
      <form
        className="mt-4 grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const name = String(fd.get("name") ?? "").trim();
          const email = String(fd.get("email") ?? "").trim();
          const role = String(fd.get("role") ?? "") as Role;
          const password = String(fd.get("password") ?? "");
          const confirm = String(fd.get("confirm") ?? "");
          setError(null);
          if (password !== confirm) {
            setError("Пароли не совпадают");
            return;
          }
          if (!roles.includes(role)) {
            setError("Выберите роль");
            return;
          }
          startTransition(async () => {
            const res = await adminCreateUserAction({ name, email, role, password });
            if (res.ok) onSuccess();
            else setError(res.error);
          });
        }}
      >
        <label className="grid gap-1 text-sm">
          <span className="text-app-muted">Имя</span>
          <input
            required
            name="name"
            className="rounded-button border border-app-border bg-app-elevated px-3 py-2 text-app-text outline-none focus:border-accent-primary"
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-app-muted">Email (логин)</span>
          <input
            required
            type="email"
            name="email"
            className="rounded-button border border-app-border bg-app-elevated px-3 py-2 text-app-text outline-none focus:border-accent-primary"
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-app-muted">Роль</span>
          <select
            name="role"
            required
            className="rounded-button border border-app-border bg-app-elevated px-3 py-2 text-app-text outline-none focus:border-accent-primary"
          >
            {roles.map((r) => (
              <option key={r} value={r}>
                {roleLabels[r]}
              </option>
            ))}
          </select>
        </label>
        <PasswordInput
          label="Пароль (мин. 8 символов)"
          required
          name="password"
          minLength={8}
          autoComplete="new-password"
          className="focus:ring-0"
        />
        <PasswordInput
          label="Повтор пароля"
          required
          name="confirm"
          minLength={8}
          autoComplete="new-password"
          className="focus:ring-0"
        />
        {error ? (
          <div className="rounded-button border border-accent-danger/40 bg-accent-danger/10 px-3 py-2 text-sm text-accent-danger">
            {error}
          </div>
        ) : null}
        <div className="mt-2 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
            Отмена
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Сохранение…" : "Создать"}
          </Button>
        </div>
      </form>
    </ModalShell>
  );
}

function EditUserModal({
  user,
  currentUserId,
  onClose,
  pending,
  startTransition,
  onSuccess,
}: {
  user: ManagedUser;
  currentUserId: string;
  onClose: () => void;
  pending: boolean;
  startTransition: (fn: () => void) => void;
  onSuccess: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const isSelf = user.id === currentUserId;

  return (
    <ModalShell title={`Редактирование: ${user.name}`} onClose={onClose}>
      <p className="text-sm text-app-muted">
        При смене роли, email или отключении аккаунта активные сессии пользователя сбрасываются.
      </p>
      <form
        className="mt-4 grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const name = String(fd.get("name") ?? "").trim();
          const email = String(fd.get("email") ?? "").trim();
          const role = String(fd.get("role") ?? "") as Role;
          const active = fd.get("active") === "on";
          setError(null);
          if (!roles.includes(role)) {
            setError("Выберите роль");
            return;
          }
          startTransition(async () => {
            const res = await adminUpdateUserAction({
              userId: user.id,
              name,
              email,
              role,
              active,
            });
            if (res.ok) onSuccess();
            else setError(res.error);
          });
        }}
      >
        <label className="grid gap-1 text-sm">
          <span className="text-app-muted">Имя</span>
          <input
            required
            name="name"
            defaultValue={user.name}
            className="rounded-button border border-app-border bg-app-elevated px-3 py-2 text-app-text outline-none focus:border-accent-primary"
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-app-muted">Email (логин)</span>
          <input
            required
            type="email"
            name="email"
            defaultValue={user.email}
            className="rounded-button border border-app-border bg-app-elevated px-3 py-2 text-app-text outline-none focus:border-accent-primary"
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-app-muted">Роль</span>
          <select
            name="role"
            required
            defaultValue={user.role}
            className="rounded-button border border-app-border bg-app-elevated px-3 py-2 text-app-text outline-none focus:border-accent-primary"
          >
            {roles.map((r) => (
              <option key={r} value={r}>
                {roleLabels[r]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="active"
            value="on"
            defaultChecked={user.active}
            disabled={isSelf}
            className="size-4"
          />
          <span className={isSelf ? "text-app-muted" : undefined}>Активен</span>
        </label>
        {isSelf ? (
          <p className="text-xs text-app-muted">Свой аккаунт нельзя отключить — только другим администратором.</p>
        ) : null}
        {error ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="rounded-button border border-accent-danger/40 bg-accent-danger/10 px-3 py-2 text-sm text-accent-danger"
          >
            {error}
          </motion.div>
        ) : null}
        <motion.div layout className="mt-2 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
            Отмена
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Сохранение…" : "Сохранить"}
          </Button>
        </motion.div>
      </form>
    </ModalShell>
  );
}

function DeleteUserModal({
  user,
  onClose,
  pending,
  startTransition,
  onSuccess,
}: {
  user: ManagedUser;
  onClose: () => void;
  pending: boolean;
  startTransition: (fn: () => void) => void;
  onSuccess: () => void;
}) {
  const [error, setError] = useState<string | null>(null);

  return (
    <ModalShell title="Удалить пользователя?" onClose={onClose}>
      <div className="flex items-start gap-3">
        <AlertTriangle className="size-6 shrink-0 text-accent-warning" />
        <div className="text-sm text-app-muted">
          <p>
            Будет удалён аккаунт <span className="font-semibold text-app-text">{user.name}</span> (
            {user.email}).
          </p>
          <p className="mt-2">Действие необратимо. Пользователь исчезнет из списка входа.</p>
        </div>
      </div>
      {error ? (
        <div className="mt-4 rounded-button border border-accent-danger/40 bg-accent-danger/10 px-3 py-2 text-sm text-accent-danger">
          {error}
        </div>
      ) : null}
      <div className="mt-6 flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
          Отмена
        </Button>
        <Button
          type="button"
          variant="danger"
          disabled={pending}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              const res = await adminDeleteUserAction({ userId: user.id });
              if (res.ok) onSuccess();
              else setError(res.error);
            });
          }}
        >
          {pending ? "Удаление…" : "Удалить"}
        </Button>
      </div>
    </ModalShell>
  );
}

function SetPasswordModal({
  user,
  onClose,
  pending,
  startTransition,
  onSuccess,
}: {
  user: ManagedUser;
  onClose: () => void;
  pending: boolean;
  startTransition: (fn: () => void) => void;
  onSuccess: () => void;
}) {
  const [error, setError] = useState<string | null>(null);

  return (
    <ModalShell title={`Новый пароль: ${user.name}`} onClose={onClose}>
      <p className="text-sm text-app-muted">
        После смены пароля активные сессии этого пользователя сбросятся. Старый пароль из базы прочитать нельзя — только
        задать новый.
      </p>
      <form
        className="mt-4 grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const password = String(fd.get("password") ?? "");
          const confirm = String(fd.get("confirm") ?? "");
          setError(null);
          if (password !== confirm) {
            setError("Пароли не совпадают");
            return;
          }
          startTransition(async () => {
            const res = await adminSetUserPasswordAction({ userId: user.id, password });
            if (res.ok) onSuccess();
            else setError(res.error);
          });
        }}
      >
        <PasswordInput
          label="Новый пароль"
          required
          name="password"
          minLength={8}
          autoComplete="new-password"
          className="focus:ring-0"
        />
        <PasswordInput
          label="Повтор"
          required
          name="confirm"
          minLength={8}
          autoComplete="new-password"
          className="focus:ring-0"
        />
        {error ? (
          <div className="rounded-button border border-accent-danger/40 bg-accent-danger/10 px-3 py-2 text-sm text-accent-danger">
            {error}
          </div>
        ) : null}
        <div className="mt-2 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
            Отмена
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Сохранение…" : "Сохранить"}
          </Button>
        </div>
      </form>
    </ModalShell>
  );
}

function ModalShell({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: `${designTokens.color.text}99` }}
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-card border border-app-border bg-app-surface p-6 shadow-glow"
        role="dialog"
        aria-modal="true"
        aria-labelledby="user-modal-title"
      >
        <button
          type="button"
          className="absolute right-3 top-3 rounded-button p-2 text-app-muted hover:bg-app-elevated hover:text-app-text"
          onClick={onClose}
          aria-label="Закрыть"
        >
          <X className="size-4" />
        </button>
        <h2 id="user-modal-title" className="pr-10 text-xl font-semibold">
          {title}
        </h2>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

function HealthCard({
  label,
  value,
  tone = "cyan",
}: {
  label: string;
  value: string;
  tone?: "cyan" | "emerald";
}) {
  const toneClass = tone === "emerald" ? "text-accent-success" : "text-accent-primary";

  return (
    <div className="rounded-card border border-app-border bg-app-elevated p-4">
      <div className={`flex items-center gap-2 ${toneClass}`}>
        <Activity className="size-4" />
        <span className="text-xs uppercase tracking-[0.2em]">{label}</span>
      </div>
      <div className="mt-3 text-2xl font-semibold">{value}</div>
    </div>
  );
}
