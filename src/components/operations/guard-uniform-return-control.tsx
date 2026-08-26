"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { returnGuardTshirtAction, returnGuardUniformAction } from "../../app/guards/actions";
import { toDateIsoKhabarovsk } from "../../lib/format/display-date";
import { toast } from "../../store/toast-store";
import { DateInput } from "../ui/date-input";

type Props = {
  guardId: string;
  uniformIssued: boolean;
  uniformIssuedOn: string | null;
  tshirtIssued: boolean;
  tshirtIssuedOn: string | null;
};

export function GuardUniformReturnControl({
  guardId,
  uniformIssued,
  uniformIssuedOn,
  tshirtIssued,
  tshirtIssuedOn,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [uniformReturnedOn, setUniformReturnedOn] = useState(() => toDateIsoKhabarovsk(new Date()));
  const [tshirtReturnedOn, setTshirtReturnedOn] = useState(() => toDateIsoKhabarovsk(new Date()));
  const [uniformChecked, setUniformChecked] = useState(false);
  const [tshirtChecked, setTshirtChecked] = useState(false);

  function submitUniform() {
    if (!uniformReturnedOn) {
      setUniformChecked(false);
      toast({
        variant: "error",
        title: "Укажите дату сдачи",
        message: "Выберите дату или введите её вручную (дд.мм.гггг)",
        durationMs: 3500,
      });
      return;
    }
    const formData = new FormData();
    formData.set("guardId", guardId);
    formData.set("returnedOn", uniformReturnedOn);

    startTransition(async () => {
      const result = await returnGuardUniformAction(formData);
      if (!result.ok) {
        setUniformChecked(false);
        toast({
          variant: "error",
          title: "Не удалось сдать форму",
          message: result.error,
          durationMs: 4500,
        });
        return;
      }
      router.refresh();
      toast({
        variant: "success",
        title: "Форма сдана",
        message: "В реестре колонка «Форма» — нет",
        durationMs: 3200,
      });
    });
  }

  function submitTshirt() {
    if (!tshirtReturnedOn) {
      setTshirtChecked(false);
      toast({
        variant: "error",
        title: "Укажите дату сдачи",
        message: "Выберите дату или введите её вручную (дд.мм.гггг)",
        durationMs: 3500,
      });
      return;
    }
    const formData = new FormData();
    formData.set("guardId", guardId);
    formData.set("returnedOn", tshirtReturnedOn);

    startTransition(async () => {
      const result = await returnGuardTshirtAction(formData);
      if (!result.ok) {
        setTshirtChecked(false);
        toast({
          variant: "error",
          title: "Не удалось сдать футболку",
          message: result.error,
          durationMs: 4500,
        });
        return;
      }
      router.refresh();
      toast({
        variant: "success",
        title: "Футболка сдана",
        message: "Отметка о выдаче снята",
        durationMs: 3200,
      });
    });
  }

  if (!uniformIssued && !tshirtIssued) return null;

  return (
    <div className="col-span-2 mt-1 flex flex-col gap-3 rounded-button border border-app-border bg-app-bg/60 p-2.5">
      {uniformIssued ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="flex min-h-9 items-center gap-2 text-sm text-app-text">
            <input
              type="checkbox"
              checked={uniformChecked}
              disabled={isPending}
              onChange={(event) => {
                if (!event.target.checked) return;
                setUniformChecked(true);
                submitUniform();
              }}
              className="size-4"
            />
            Форма сдана
          </label>
          <label className="grid min-w-0 flex-1 gap-1 text-xs text-app-muted">
            Дата сдачи
            <DateInput
              value={uniformReturnedOn}
              min={uniformIssuedOn ?? undefined}
              disabled={isPending}
              onChange={setUniformReturnedOn}
              className="min-h-9 rounded-button border border-app-border bg-app-surface px-3 py-1.5 text-sm outline-none focus:border-accent-primary"
            />
          </label>
        </div>
      ) : null}
      {tshirtIssued ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="flex min-h-9 items-center gap-2 text-sm text-app-text">
            <input
              type="checkbox"
              checked={tshirtChecked}
              disabled={isPending}
              onChange={(event) => {
                if (!event.target.checked) return;
                setTshirtChecked(true);
                submitTshirt();
              }}
              className="size-4"
            />
            Футболка сдана
          </label>
          <label className="grid min-w-0 flex-1 gap-1 text-xs text-app-muted">
            Дата сдачи
            <DateInput
              value={tshirtReturnedOn}
              min={tshirtIssuedOn ?? undefined}
              disabled={isPending}
              onChange={setTshirtReturnedOn}
              className="min-h-9 rounded-button border border-app-border bg-app-surface px-3 py-1.5 text-sm outline-none focus:border-accent-primary"
            />
          </label>
        </div>
      ) : null}
    </div>
  );
}
