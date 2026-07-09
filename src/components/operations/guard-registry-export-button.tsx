"use client";

import { FileSpreadsheet } from "lucide-react";
import { Button } from "../ui/button";

export function GuardRegistryExportButton() {
  return (
    <Button
      type="button"
      variant="secondary"
      onClick={() => {
        window.location.href = "/api/guards/export/registry";
      }}
      title="Выгрузить реестр охранников в Excel"
    >
      <FileSpreadsheet className="size-4" />
      Excel
    </Button>
  );
}
