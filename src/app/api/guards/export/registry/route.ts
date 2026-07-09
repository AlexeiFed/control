import { assertPermission } from "../../../../../lib/auth/rbac";
import { requireSession } from "../../../../../lib/auth/session";
import { buildGuardRegistryWorkbook } from "../../../../../lib/guards/guard-registry-xlsx";
import { listGuards } from "../../../../../lib/operations/guards-repository";

export async function GET() {
  const session = await requireSession();
  assertPermission(session.user.role, "guards:manage");

  const guards = await listGuards();
  const buffer = await buildGuardRegistryWorkbook(guards);
  const filename = "reestr_ohrannikov.xlsx";

  return new Response(new Uint8Array(buffer), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
}
