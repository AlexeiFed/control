import { ShiftLogPanelLazy } from "../../components/operations/shift-log-panel-lazy";
import { assertPermission } from "../../lib/auth/rbac";
import { requireSession } from "../../lib/auth/session";
import { listManagedUsers } from "../../lib/auth/user-service";
import { listRecentShiftLogs } from "../../lib/operations/scheduler-repository";
import { deleteShiftLogAction, toggleShiftLogAccountedAction } from "./actions";

export default async function ShiftLogsPage() {
  const session = await requireSession();
  assertPermission(session.user.role, "schedule:read");

  const [logs, users] = await Promise.all([listRecentShiftLogs(500), listManagedUsers()]);
  const userMap = new Map(users.map((u) => [u.id, u.name]));
  const enrichedLogs = logs.map((log) => ({
    ...log,
    authorName: userMap.get(log.authorUserId) || "Неизвестный",
  }));

  return (
    <main
      className="min-h-screen bg-app-bg p-3 text-app-text md:p-6"
      style={{
        paddingTop:
          "calc(0.75rem + var(--incident-banner-offset, 0px) + var(--compliance-banner-offset, 0px))",
      }}
    >
      <ShiftLogPanelLazy
        logs={enrichedLogs}
        currentRole={session.user.role}
        toggleAccountedAction={toggleShiftLogAccountedAction}
        deleteLogAction={deleteShiftLogAction}
      />
    </main>
  );
}
