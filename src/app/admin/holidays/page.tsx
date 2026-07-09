import { CalendarHeart } from "lucide-react";
import { createHolidayAction, deleteHolidayAction } from "./actions";
import { Button, ButtonLink } from "../../../components/ui/button";
import { assertPermission } from "../../../lib/auth/rbac";
import { requireSession } from "../../../lib/auth/session";
import { listAllHolidays } from "../../../lib/operations/holidays-repository";
import { formatDisplayDateFromIso } from "../../../lib/format/display-date";

export default async function AdminHolidaysPage() {
  const session = await requireSession();
  assertPermission(session.user.role, "holidays:manage");

  const holidays = await listAllHolidays();

  return (
    <main className="min-h-screen bg-app-bg p-6 text-app-text">
      <section className="rounded-card border border-app-border bg-app-surface p-6 shadow-glow">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex items-center gap-2 text-accent-primary">
              <CalendarHeart className="size-5" />
              <span className="text-sm uppercase tracking-[0.24em]">Календарь</span>
            </div>
            <h1 className="mt-3 text-3xl font-semibold">Праздничные дни</h1>
            <p className="mt-2 text-sm text-app-muted">
              Даты попадают в расчёт праздничных часов и подсветку в графике. Дубли по дате обновляют название.
            </p>
          </div>
          <ButtonLink href="/dashboard" variant="secondary">
            Назад
          </ButtonLink>
        </div>

        <form action={createHolidayAction} className="mt-6 flex flex-wrap items-end gap-3 rounded-card border border-app-border bg-app-elevated p-4">
          <label className="grid gap-1 text-xs text-app-muted">
            Дата
            <input
              required
              type="date"
              name="holidayDate"
              className="rounded-button border border-app-border bg-app-bg px-3 py-2 text-sm outline-none focus:border-accent-primary"
            />
          </label>
          <label className="grid min-w-[12rem] flex-1 gap-1 text-xs text-app-muted">
            Название
            <input
              required
              name="name"
              placeholder="Например, День Победы"
              className="rounded-button border border-app-border bg-app-bg px-3 py-2 text-sm outline-none focus:border-accent-primary"
            />
          </label>
          <Button type="submit">
            Добавить
          </Button>
        </form>

        <div className="mt-6 overflow-hidden rounded-card border border-app-border">
          <table className="w-full border-separate border-spacing-0 text-left text-sm">
            <thead className="bg-app-elevated text-app-muted">
              <tr>
                <th className="border-b border-app-border px-3 py-2 font-medium">Дата</th>
                <th className="border-b border-app-border px-3 py-2 font-medium">Название</th>
                <th className="border-b border-app-border px-3 py-2 font-medium w-28" />
              </tr>
            </thead>
            <tbody>
              {holidays.map((row) => (
                <tr
                  key={row.id}
                  className="[&>td]:border-b [&>td]:border-app-border last:[&>td]:border-b-0"
                >
                  <td className="px-3 py-2 font-mono text-xs">{formatDisplayDateFromIso(row.holidayDate)}</td>
                  <td className="px-3 py-2">{row.name}</td>
                  <td className="px-3 py-2">
                    <form action={deleteHolidayAction}>
                      <input type="hidden" name="id" value={row.id} />
                      <Button type="submit" variant="danger" size="sm">
                        Удалить
                      </Button>
                    </form>
                  </td>
                </tr>
              ))}
              {holidays.length === 0 ? (
                <tr>
                  <td className="px-3 py-6 text-app-muted" colSpan={3}>
                    Праздников пока нет.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
