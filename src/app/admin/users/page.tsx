import { UserManagementDashboard } from "../../../components/admin/user-management-dashboard";
import { assertPermission } from "../../../lib/auth/rbac";
import { requireSession } from "../../../lib/auth/session";
import { listManagedUsers } from "../../../lib/auth/user-service";

export default async function AdminUsersPage() {
  const session = await requireSession();
  assertPermission(session.user.role, "users:manage");
  const users = await listManagedUsers();

  return <UserManagementDashboard currentUser={session.user} initialUsers={users} />;
}
