import { LockKeyhole, ShieldCheck } from "lucide-react";
import { loginByUser } from "./actions";
import { LoginPasswordField } from "../../../components/auth/login-password-field";
import { Button } from "../../../components/ui/button";
import { roleDescriptions, roleLabels } from "../../../lib/auth/rbac";
import { listActiveManagedUsersForLogin } from "../../../lib/auth/user-service";

type LoginPageProps = {
  searchParams?: Promise<{
    error?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const hasError = params?.error === "invalid";
  const users = await listActiveManagedUsersForLogin();

  return (
    <main className="min-h-screen bg-app-bg px-4 py-10 text-app-text">
      <section className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-5xl items-center">
        <div className="grid w-full gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <aside className="rounded-card border border-app-border bg-app-surface p-8 shadow-glow">
            <div className="inline-flex items-center gap-2 rounded-full border border-accent-primary/30 bg-accent-primary/10 px-3 py-1 text-sm text-accent-primary">
              <ShieldCheck className="size-4" />
              Vityaz ERP
            </div>

            <h1 className="mt-6 text-4xl font-semibold tracking-tight">
              Закрытый вход в систему охраны
            </h1>

            <p className="mt-4 text-sm leading-6 text-app-muted">
              Выберите учётную запись и введите пароль. Публичной регистрации нет — пользователей создаёт только
              администратор.
            </p>

            <div className="mt-8 grid gap-3 text-sm text-app-muted">
              <div className="rounded-button border border-app-border bg-app-elevated px-4 py-3">
                Администратор: пользователи, роли, объекты, графики, финансы.
              </div>
              <div className="rounded-button border border-app-border bg-app-elevated px-4 py-3">
                Планировщик: объекты, охранники и смены без финансов.
              </div>
              <div className="rounded-button border border-app-border bg-app-elevated px-4 py-3">
                Бухгалтер: табель, статистика и расчёт часов.
              </div>
            </div>
          </aside>

          <form
            action={loginByUser}
            className="rounded-card border border-app-border bg-app-surface p-8 shadow-glow"
          >
            <div className="flex items-center gap-3">
              <div className="grid size-11 place-items-center rounded-button bg-accent-primary text-white">
                <LockKeyhole className="size-5" />
              </div>
              <div>
                <h2 className="text-2xl font-semibold">Авторизация</h2>
                <p className="text-sm text-app-muted">Учётная запись и пароль</p>
              </div>
            </div>

            {users.length === 0 ? (
              <div className="mt-8 rounded-button border border-accent-warning/40 bg-accent-warning/10 px-4 py-4 text-sm text-app-text">
                Нет активных пользователей. На сервере выполните{" "}
                <code className="rounded bg-app-elevated px-1 py-0.5 text-xs">npm run seed:admin</code> с переменными{" "}
                <code className="rounded bg-app-elevated px-1 py-0.5 text-xs">SEED_ADMIN_EMAIL</code> и{" "}
                <code className="rounded bg-app-elevated px-1 py-0.5 text-xs">SEED_ADMIN_PASSWORD</code>.
              </div>
            ) : (
              <>
                <fieldset className="mt-8">
                  <legend className="text-sm font-medium text-app-muted">Выберите пользователя</legend>
                  <div className="mt-3 grid max-h-[min(22rem,50vh)] gap-3 overflow-y-auto pr-1">
                    {users.map((user, index) => (
                      <label
                        key={user.id}
                        className="group cursor-pointer rounded-button border border-app-border bg-app-elevated p-4 transition hover:border-accent-primary/70 has-[:checked]:border-accent-primary has-[:checked]:bg-accent-primary/10"
                      >
                        <div className="flex items-start gap-3">
                          <input
                            required
                            className="mt-1 size-4 accent-accent-primary"
                            type="radio"
                            name="userId"
                            value={user.id}
                            defaultChecked={index === 0}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="font-semibold text-app-text">{user.name}</div>
                            <div className="mt-0.5 truncate text-xs text-app-muted">{user.email}</div>
                            <div className="mt-1 text-sm font-medium text-accent-primary">
                              {roleLabels[user.role]}
                            </div>
                            <div className="mt-1 text-sm leading-5 text-app-muted">
                              {roleDescriptions[user.role]}
                            </div>
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                </fieldset>

                <LoginPasswordField />
              </>
            )}

            {hasError ? (
              <div className="mt-4 rounded-button border border-accent-danger/40 bg-accent-danger/10 px-4 py-3 text-sm text-accent-danger">
                Неверный пользователь или пароль.
              </div>
            ) : null}

            <Button type="submit" size="lg" className="mt-6 w-full" disabled={users.length === 0}>
              Войти в систему
            </Button>
          </form>
        </div>
      </section>
    </main>
  );
}
