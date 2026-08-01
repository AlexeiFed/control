import { ObjectsTableLazy } from "../../components/operations/objects-table-lazy";
import { assertPermission } from "../../lib/auth/rbac";
import { requireSession } from "../../lib/auth/session";
import { listGuards } from "../../lib/operations/guards-repository";
import {
  listObjectRateRulesForObjects,
  type ObjectRateRuleRecord,
} from "../../lib/operations/object-rate-rules-repository";
import { listObjects } from "../../lib/operations/objects-repository";
import { listShiftTemplatesForObjectIds } from "../../lib/operations/shift-templates-repository";
import { activeShiftsSequence } from "../../lib/scheduling/object-shift-templates";
import { getKhabarovskComponents, toDateIsoKhabarovsk } from "../../lib/format/display-date";

export default async function ObjectsPage() {
  const session = await requireSession();
  assertPermission(session.user.role, "objects:manage");
  const [objects, guards] = await Promise.all([listObjects(), listGuards()]);

  const allIds = objects.map((o) => o.id);
  const [templates, rateRules] =
    allIds.length > 0
      ? await Promise.all([listShiftTemplatesForObjectIds(allIds), listObjectRateRulesForObjects(allIds)])
      : [[], []];

  const today = toDateIsoKhabarovsk(new Date());
  const todayKh = getKhabarovskComponents(new Date());
  const currentMonthStart = `${todayKh.year}-${String(todayKh.month0 + 1).padStart(2, "0")}-01`;
  const templateDefaultsByObjectId: Record<string, number[]> = {};
  const templateReinforcementDefaultsByObjectId: Record<string, number[]> = {};
  for (const o of objects) {
    const { regular, reinforcement } = activeShiftsSequence(templates, o.id, today);
    templateDefaultsByObjectId[o.id] = regular;
    templateReinforcementDefaultsByObjectId[o.id] = reinforcement;
  }

  const rateRulesByObjectId: Record<string, ObjectRateRuleRecord[]> = {};
  for (const rule of rateRules) {
    if (!rateRulesByObjectId[rule.objectId]) rateRulesByObjectId[rule.objectId] = [];
    rateRulesByObjectId[rule.objectId]!.push(rule);
  }

  return (
    <main className="min-h-screen bg-app-bg p-3 text-app-text md:p-6">
      <ObjectsTableLazy
        objects={objects}
        guards={guards}
        currentRole={session.user.role}
        templateDefaultsByObjectId={templateDefaultsByObjectId}
        templateReinforcementDefaultsByObjectId={templateReinforcementDefaultsByObjectId}
        templateEffectiveFrom={currentMonthStart}
        rateRulesByObjectId={rateRulesByObjectId}
      />
    </main>
  );
}
