import { Plus, Star, Trash2 } from "lucide-react";
import { addObjectHolidayAction, deleteObjectHolidayAction } from "../../app/objects/actions";
import type { ObjectHolidayRecord } from "../../lib/operations/object-holidays-repository";
import { Button } from "../ui/button";

type ObjectHolidaysSectionProps = {
  objectId: string;
  holidays: ObjectHolidayRecord[];
};

export function ObjectHolidaysSection({ objectId, holidays }: ObjectHolidaysSectionProps) {
  return (
    <section className="rounded-card border border-app-border bg-app-surface p-6 shadow-glow">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2 text-accent-warning">
          <Star className="size-5" />
          <h2 className="text-lg font-semibold">Праздники объекта</h2>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div className="flex flex-col justify-center rounded-card border border-dashed border-app-border p-4">
          <h3 className="mb-3 text-sm font-medium">Добавить праздник</h3>
          <form action={addObjectHolidayAction} className="grid gap-2">
            <input type="hidden" name="objectId" value={objectId} />
            <input
              type="date"
              name="date"
              required
              className="rounded-button border border-app-border bg-app-bg px-2 py-1.5 text-sm outline-none focus:border-accent-primary"
            />
            <input
              name="name"
              placeholder="Название праздника"
              required
              className="rounded-button border border-app-border bg-app-bg px-2 py-1.5 text-sm outline-none focus:border-accent-primary"
            />
            <Button type="submit" size="sm">
              <Plus className="mr-1 size-3.5" /> Добавить
            </Button>
          </form>
        </div>
        {holidays.map((h) => (
          <div
            key={h.id}
            className="flex items-center justify-between rounded-card border border-app-border bg-app-elevated p-4"
          >
            <div>
              <p className="font-medium">{h.name}</p>
              <p className="text-xs text-app-muted">
                {new Date(h.holidayDate).toLocaleDateString("ru-RU")}
              </p>
            </div>
            <form action={deleteObjectHolidayAction}>
              <input type="hidden" name="id" value={h.id} />
              <input type="hidden" name="objectId" value={objectId} />
              <Button type="submit" variant="icon" size="icon" className="text-accent-danger hover:bg-accent-danger/10">
                <Trash2 className="size-4" />
              </Button>
            </form>
          </div>
        ))}
      </div>
    </section>
  );
}
