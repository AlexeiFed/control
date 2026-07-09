import Link from "next/link";
import {
  CalendarDays,
  CalendarHeart,
  ClipboardList,
  DoorOpen,
  FileSpreadsheet,
  ShieldCheck,
  ShieldPlus,
  Users,
  Wallet,
} from "lucide-react";
import { Button } from "../../components/ui/button";
import { assertPermission, hasPermission, type Permission } from "../../lib/auth/rbac";
import { requireSession } from "../../lib/auth/session";
import { logout } from "./actions";

const navigationItems: Array<{
  title: string;
  href: string;
  description: string;
  permission: Permission;
  icon: typeof Users;
}> = [
  {
    title: "Праздники",
    href: "/admin/holidays",
    description: "Календарь праздничных дат для часов и графика",
    permission: "holidays:manage",
    icon: CalendarHeart,
  },
  {
    title: "Пользователи",
    href: "/admin/users",
    description: "Создание и отключение пользователей",
    permission: "users:manage",
    icon: Users,
  },
  {
    title: "Кураторы",
    href: "/admin/curators",
    description: "Работы по дням, ставки и расчёт начислений",
    permission: "curators:manage",
    icon: ClipboardList,
  },
  {
    title: "Объекты",
    href: "/objects",
    description: "Карточка объекта и назначенные охранники",
    permission: "objects:manage",
    icon: ShieldPlus,
  },
  {
    title: "Охранники",
    href: "/guards",
    description: "Статусы, доступность и история смен",
    permission: "guards:manage",
    icon: Users,
  },
  {
    title: "Графики смен",
    href: "/scheduler",
    description: "Сетка смен, конфликты и журналы",
    permission: "schedule:read",
    icon: CalendarDays,
  },
  {
    title: "Аванс",
    href: "/accounting/advances",
    description: "Выдача авансов охранникам по полупериодам",
    permission: "advances:manage",
    icon: Wallet,
  },
  {
    title: "Табель",
    href: "/accounting/timesheet",
    description: "Часы, ночные, праздничные и экспорт",
    permission: "timesheet:read",
    icon: FileSpreadsheet,
  },
];

export default async function DashboardPage() {
  const session = await requireSession();
  assertPermission(session.user.role, "schedule:read");

  return (
    <main className="min-h-screen bg-app-bg p-6 text-app-text">
      <section className="rounded-card border border-app-border bg-app-surface p-6 shadow-glow">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex items-center gap-2 text-accent-primary">
              <ShieldCheck className="size-5" />
              <span className="text-sm uppercase tracking-[0.24em]">Vityaz ERP</span>
            </div>
            <h1 className="mt-3 text-3xl font-semibold">Рабочая панель</h1>
            <p className="mt-2 text-sm text-app-muted">
              Вы вошли как {session.user.name}. Доступные разделы показаны ниже.
            </p>
          </div>

          <form action={logout}>
            <Button type="submit" variant="secondary">
              <DoorOpen className="size-4" />
              Выйти
            </Button>
          </form>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {navigationItems
            .filter((item) => hasPermission(session.user.role, item.permission))
            .map((item) => (
              <Link
                key={item.href}
                href={item.href}
                prefetch={false}
                className="rounded-card border border-app-border bg-app-elevated p-5 transition hover:border-accent-primary hover:shadow-glow"
              >
                <div className="flex items-center justify-between gap-3">
                  <item.icon className="size-5 text-accent-primary" />
                  <span className="text-xs uppercase tracking-[0.2em] text-app-muted">
                    Открыть
                  </span>
                </div>
                <h2 className="mt-4 font-semibold">{item.title}</h2>
                <p className="mt-1 text-sm text-app-muted">{item.description}</p>
              </Link>
            ))}
        </div>
      </section>
    </main>
  );
}
