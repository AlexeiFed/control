"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Undo2 } from "lucide-react";
import { returnGuardToWorkAction } from "../../app/guards/actions";
import { toDateIsoKhabarovsk } from "../../lib/format/display-date";
import { designTokens } from "../../lib/design-tokens";
import { toast } from "../../store/toast-store";
import { Button } from "../ui/button";

type GuardReturnToWorkButtonProps = {
  guardId: string;
  dismissedOn: string | null;
};

export function GuardReturnToWorkButton({ guardId, dismissedOn }: GuardReturnToWorkButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [returnedOn, setReturnedOn] = useState(() => toDateIsoKhabarovsk(new Date()));

  function submit() {
    const formData = new FormData();
    formData.set("guardId", guardId);
    formData.set("returnedOn", returnedOn);

    startTransition(async () => {
      const result = await returnGuardToWorkAction(formData);
      if (!result.ok) {
        toast({
          variant: "error",
          title: "Не удалось вернуть",
          message: result.error,
          durationMs: 4500,
        });
        return;
      }
      setOpen(false);
      router.refresh();
      toast({
        variant: "success",
        title: "Вернули в работу",
        message: "Active + Б/У. Дата увольнения сохранена в истории.",
        durationMs: 3200,
      });
    });
  }

  if (!open) {
    return (
      <Button
        type="button"
        variant="secondary"
        className="w-full justify-center gap-2 sm:w-auto"
        disabled={isPending}
        onClick={() => setOpen(true)}
        style={{ borderColor: designTokens.color.status.active }}
      >
        <Undo2 className="size-4" style={{ color: designTokens.color.status.active }} />
        Вернуть в работу
      </Button>
    );
  }

  return (
    <div className="flex w-full flex-col gap-2 rounded-button border border-app-border bg-app-elevated p-3 sm:w-auto sm:min-w-[16rem]">
      <p className="text-xs font-medium text-app-text">Дата возврата (Б/У)</p>
      <input
        type="date"
        value={returnedOn}
        min={dismissedOn ?? undefined}
        onChange={(e) => setReturnedOn(e.target.value)}
        disabled={isPending}
        className="h-9 w-full rounded-button border border-app-border bg-app-bg px-2 text-sm outline-none focus:border-accent-primary disabled:opacity-60"
      />
      <div className="flex gap-2">
        <Button
          type="button"
          variant="primary"
          size="sm"
          className="flex-1"
          disabled={isPending || !returnedOn}
          onClick={submit}
        >
          Подтвердить
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={isPending}
          onClick={() => setOpen(false)}
        >
          Отмена
        </Button>
      </div>
    </div>
  );
}
