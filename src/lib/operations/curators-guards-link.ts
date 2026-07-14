import { query } from "../db/pool";
import { createGuard, emptyGuardCompliance } from "./guards-repository";

/** Привязать журналы кураторов к охранникам с должностью Curator; создать журнал без строк. */
export async function ensureAllCuratorGuardsLinked(): Promise<void> {
  await query(
    `
      UPDATE curators c
      SET guard_id = g.id
      FROM guards g
      WHERE g.position = 'Curator'
        AND c.guard_id IS NULL
        AND lower(trim(c.first_name)) = lower(trim(g.first_name))
        AND lower(trim(c.last_name)) = lower(trim(g.last_name))
    `,
  );

  await query(
    `
      INSERT INTO curators (first_name, last_name, guard_id)
      SELECT g.first_name, g.last_name, g.id
      FROM guards g
      WHERE g.position = 'Curator'
        AND NOT EXISTS (SELECT 1 FROM curators c WHERE c.guard_id = g.id)
    `,
  );
}

async function findGuardIdByName(firstName: string, lastName: string): Promise<string | null> {
  const rows = await query<{ id: string }>(
    `
      SELECT id FROM guards
      WHERE lower(trim(first_name)) = lower(trim($1))
        AND lower(trim(last_name)) = lower(trim($2))
      LIMIT 1
    `,
    [firstName, lastName],
  );
  return rows[0]?.id ?? null;
}

/** Журнал начислений для охранника-куратора (создаётся при необходимости). */
export async function ensureCuratorJournalForGuard(
  guardId: string,
  firstName: string,
  lastName: string,
): Promise<string> {
  const linked = await query<{ id: string }>(
    `SELECT id FROM curators WHERE guard_id = $1 LIMIT 1`,
    [guardId],
  );
  if (linked[0]) return linked[0].id;

  const byName = await query<{ id: string }>(
    `
      SELECT id FROM curators
      WHERE lower(trim(first_name)) = lower(trim($1))
        AND lower(trim(last_name)) = lower(trim($2))
      LIMIT 1
    `,
    [firstName, lastName],
  );
  if (byName[0]) {
    await query(`UPDATE curators SET guard_id = $1 WHERE id = $2 AND guard_id IS NULL`, [
      guardId,
      byName[0].id,
    ]);
    return byName[0].id;
  }

  const inserted = await query<{ id: string }>(
    `
      INSERT INTO curators (first_name, last_name, guard_id)
      VALUES ($1, $2, $3)
      RETURNING id
    `,
    [firstName.trim(), lastName.trim(), guardId],
  );
  const id = inserted[0]?.id;
  if (!id) throw new Error("Не удалось создать журнал куратора");
  return id;
}

/** Создать охранника-куратора и журнал начислений. */
export async function createCuratorWithGuard(input: {
  firstName: string;
  lastName: string;
}): Promise<string> {
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();

  let guardId = await findGuardIdByName(firstName, lastName);

  if (guardId) {
    await query(
      `
        UPDATE guards
        SET position = 'Curator'
        WHERE id = $1
      `,
      [guardId],
    );
  } else {
    guardId = await createGuard({
      firstName,
      middleName: "",
      lastName,
      status: "Active",
      dismissedOn: null,
      phone: "",
      contactPhone: "",
      uniformSize: null,
      uniformHeight: null,
      uniformIssued: false,
      uniformIssuedOn: null,
      uniformCondition: null,
      uniformNote: null,
      position: "Curator",
      licenseType: "None",
      employmentType: "Unemployed",
      isTrainee: false,
      traineeUntil: null,
      hasCar: false,
      compliance: emptyGuardCompliance,
    });
  }

  return ensureCuratorJournalForGuard(guardId, firstName, lastName);
}
