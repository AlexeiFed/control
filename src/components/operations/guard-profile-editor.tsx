"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { dispatchGuardComplianceRemindersRefresh } from "../../lib/guards/compliance-reminders-refresh";
import { updateGuardProfileAction } from "../../app/guards/actions";
import { toast } from "../../store/toast-store";
import { Button } from "../ui/button";
import { PhoneInput } from "../ui/phone-input";
import type { GuardDetails } from "../../lib/operations/guards-repository";
import { designTokens } from "../../lib/design-tokens";
import { Pencil, X, Check } from "lucide-react";
import {
  uniformHeightOptions,
  uniformSizeLetterOptions,
  uniformSizeNumericOptions,
  uniformSizeToFormValue,
} from "../../lib/format/uniform";
import type { ObjectListRow } from "../../lib/operations/objects-repository";
import { GuardProfileObjectsEditor } from "./guard-profile-objects-editor";
import type { GuardEmploymentType, GuardLicenseType } from "../../lib/scheduling/types";
import {
  guardEmploymentLabels,
  guardLicenseLabels,
} from "../../lib/operations/status-labels";

const licenseGradeOptions = [4, 5, 6] as const;
const fieldClass =
  "rounded-button border border-app-border bg-app-bg px-3 py-2 outline-none focus:border-accent-primary focus:ring-1 focus:ring-accent-primary";

type GuardProfileEditorProps = {
  guard: GuardDetails;
  objects: ObjectListRow[];
};

export function GuardProfileEditor({ guard, objects }: GuardProfileEditorProps) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, startSave] = useTransition();
  const [employmentType, setEmploymentType] = useState<GuardEmploymentType>(guard.employmentType);
  const [licenseType, setLicenseType] = useState<GuardLicenseType>(guard.licenseType ?? "None");

  if (!isEditing) {
    return (
      <div className="mt-4 flex items-center justify-end">
        <Button
          type="button"
          onClick={() => setIsEditing(true)}
          className="flex w-full items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold transition-all duration-200 sm:w-auto"
          variant="outline"
        >
          <Pencil className="size-4 text-accent-primary" />
          Редактировать профиль
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-4 animate-fadeIn rounded-card border border-app-border bg-app-elevated p-3 shadow-glow sm:mt-6 sm:p-5">
      <div className="mb-4 flex flex-col gap-3 border-b border-app-border pb-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Pencil className="size-4 text-accent-primary" />
          <h3 className="text-sm font-bold text-app-text sm:text-base">Редактирование профиля охранника</h3>
        </div>
        <Button
          type="button"
          onClick={() => setIsEditing(false)}
          variant="ghost"
          size="sm"
          className="flex items-center gap-1 text-app-muted hover:text-accent-danger"
        >
          <X className="size-4" />
          <span>Свернуть</span>
        </Button>
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          const formData = new FormData(event.currentTarget);
          startSave(async () => {
            const result = await updateGuardProfileAction(formData);
            if (!result.ok) {
              toast({
                title: "Не удалось сохранить профиль",
                message: result.error,
                variant: "error",
                durationMs: 6500,
              });
              return;
            }
            toast({
              title: "Профиль сохранён",
              message: "Изменения успешно записаны",
              variant: "success",
              durationMs: 4000,
            });
            setIsEditing(false);
            dispatchGuardComplianceRemindersRefresh();
            router.refresh();
          });
        }}
        className="grid gap-4 md:grid-cols-2"
      >
        <input type="hidden" name="guardId" value={guard.id} />
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-app-muted font-medium">Фамилия</span>
          <input required name="lastName" defaultValue={guard.lastName} className={fieldClass} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-app-muted font-medium">Имя</span>
          <input required name="firstName" defaultValue={guard.firstName} className={fieldClass} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-app-muted font-medium">Отчество</span>
          <input name="middleName" defaultValue={guard.middleName} className={fieldClass} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-app-muted font-medium">Дата рождения</span>
          <input type="date" name="birthDate" defaultValue={guard.birthDate ?? ""} className={fieldClass} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-app-muted font-medium">Телефон</span>
          <PhoneInput name="phone" defaultValue={guard.phone} className={`w-full ${fieldClass}`} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-app-muted font-medium">Контактный телефон</span>
          <PhoneInput
            name="contactPhone"
            defaultValue={guard.contactPhone}
            ariaLabel="Контактный телефон"
            className={`w-full ${fieldClass}`}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-app-muted font-medium">Размер формы</span>
          <select name="uniformSize" defaultValue={uniformSizeToFormValue(guard.uniformSize)} className={fieldClass}>
            <option value="">—</option>
            <optgroup label="Буквенный">
              {uniformSizeLetterOptions.map((size) => (
                <option key={size.value} value={size.value}>
                  {size.label}
                </option>
              ))}
            </optgroup>
            <optgroup label="Числовой (44–70)">
              {uniformSizeNumericOptions.map((size) => (
                <option key={size.value} value={size.value}>
                  {size.label}
                </option>
              ))}
            </optgroup>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-app-muted font-medium">Рост</span>
          <select name="uniformHeight" defaultValue={guard.uniformHeight ?? ""} className={fieldClass}>
            <option value="">—</option>
            {uniformHeightOptions.map((height) => (
              <option key={height} value={height}>
                {height}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-app-muted font-medium">Трудоустройство</span>
          <select
            name="employmentType"
            value={employmentType}
            onChange={(event) => setEmploymentType(event.target.value as GuardEmploymentType)}
            className={fieldClass}
          >
            <option value="Employed">{guardEmploymentLabels.Employed}</option>
            <option value="Unemployed">{guardEmploymentLabels.Unemployed}</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-app-muted font-medium">Дата офиц. трудоустройства</span>
          <input type="date" name="employedOn" defaultValue={guard.employedOn ?? ""} className={fieldClass} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-app-muted font-medium">Удостоверение</span>
          <select
            name="licenseType"
            value={licenseType}
            onChange={(event) => setLicenseType(event.target.value as GuardLicenseType)}
            className={fieldClass}
          >
            <option value="None">{guardLicenseLabels.None}</option>
            <option value="Licensed">{guardLicenseLabels.Licensed}</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-app-muted font-medium">Разряд</span>
          <select
            name="licenseGrade"
            defaultValue={guard.licenseGrade != null ? String(guard.licenseGrade) : ""}
            className={fieldClass}
          >
            <option value="">—</option>
            {licenseGradeOptions.map((grade) => (
              <option key={grade} value={grade}>
                {grade}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-app-muted font-medium">Удостоверение действует до</span>
          <input
            type="date"
            name="licenseValidUntil"
            defaultValue={guard.licenseValidUntil ?? ""}
            className={fieldClass}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-app-muted font-medium">Медкомиссия</span>
          <input
            type="date"
            name="medicalCommissionPassedOn"
            defaultValue={guard.medicalCommissionPassedOn ?? ""}
            className={fieldClass}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-app-muted font-medium">Периодическая проверка</span>
          <input
            type="date"
            name="periodicCheckPassedOn"
            defaultValue={guard.periodicCheckPassedOn ?? ""}
            className={fieldClass}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-app-muted font-medium">Личная карточка</span>
          <input
            type="date"
            name="personalCardAssignedOn"
            defaultValue={guard.personalCardAssignedOn ?? ""}
            className={fieldClass}
          />
        </label>
        {guard.dismissedOn ? (
          <label className="flex flex-col gap-1 text-sm md:col-span-2">
            <span className="text-app-muted font-medium">Дата увольнения</span>
            <input
              type="date"
              name="dismissedOnDisplay"
              defaultValue={guard.dismissedOn}
              disabled
              className={`${fieldClass} opacity-70`}
            />
            <span className="text-xs text-app-muted">Меняется через смену статуса в реестре.</span>
          </label>
        ) : null}

        <div className="flex flex-col gap-3 md:col-span-2 bg-app-bg/50 p-3 rounded-button border border-app-border/40 my-1">
          <label className="flex items-center gap-2.5 text-sm select-none cursor-pointer">
            <input
              type="checkbox"
              name="hasCar"
              value="on"
              defaultChecked={guard.hasCar}
              className="size-4 rounded-button border-app-border text-accent-primary focus:ring-accent-primary"
            />
            <span className="font-medium text-app-text">Есть автомобиль (Авто)</span>
          </label>
        </div>

        {guard.traineeExpired ? (
          <p
            className="md:col-span-2 text-xs font-semibold px-3 py-2 rounded-button bg-accent-warning/15 border border-accent-warning/20"
            style={{ color: designTokens.color.accent.warning }}
          >
            Дата окончания стажировки прошла — измените период стажировки в послужном списке.
          </p>
        ) : null}

        <div className="md:col-span-2 border-t border-app-border/40 pt-4 mt-1">
          <GuardProfileObjectsEditor
            guardId={guard.id}
            objects={objects}
            initialObjectIds={guard.objects.map((object) => object.id)}
            initialObjectNames={guard.objects.map((object) => object.name)}
          />
        </div>
        <div className="flex flex-col sm:flex-row items-center gap-2.5 md:col-span-2 border-t border-app-border/40 pt-4 mt-2">
          <Button
            type="submit"
            disabled={isSaving}
            className="w-full sm:flex-1 flex items-center justify-center gap-2 py-2.5"
          >
            <Check className="size-4" />
            {isSaving ? "Сохранение…" : "Сохранить изменения"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setIsEditing(false)}
            className="w-full sm:w-auto px-5 py-2.5"
          >
            Отмена
          </Button>
        </div>
      </form>
    </div>
  );
}
