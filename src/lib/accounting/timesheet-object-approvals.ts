/**
 * Настройки блоков согласования/утверждения в Excel-табеле.
 */
export type TimesheetObjectApprovalSettings = {
  directorRole: string;
  directorName: string;
  siteManagerEnabled: boolean;
};

export const TIMESHEET_APPROVAL_SIGNATURE_BLANK = "______________/______________/";

export const TIMESHEET_SITE_MANAGER_ROLE = "Начальник участка";

export const TIMESHEET_VITYAZ_APPROVAL = {
  header: "СОГЛАСОВАНО",
  role: 'Генеральный директор ООО ЧОО "Витязь"',
  signature: "__________/В.В.Ильин/",
} as const;

export function formatTimesheetApprovalSignature(signatoryName: string): string {
  const name = signatoryName.trim();
  if (!name) return TIMESHEET_APPROVAL_SIGNATURE_BLANK;
  return `______________/${name}/`;
}

export function buildTimesheetApprovalBlocks(settings: TimesheetObjectApprovalSettings) {
  const blocks: Array<{ header: string; role: string; signature: string }> = [];

  if (settings.siteManagerEnabled) {
    blocks.push({
      header: "СОГЛАСОВАНО:",
      role: TIMESHEET_SITE_MANAGER_ROLE,
      signature: "__________/__________/",
    });
  }

  blocks.push(TIMESHEET_VITYAZ_APPROVAL);

  const role = settings.directorRole.trim() || "Директор";
  blocks.push({
    header: "УТВЕРЖДАЮ:",
    role,
    signature: formatTimesheetApprovalSignature(settings.directorName),
  });

  return blocks;
}
