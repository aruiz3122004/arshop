"use client";

import { MfaSettings } from "@/components/mfa-settings";

export default function AdminSettingsPage() {
  return (
    <div className="flex flex-col gap-8 max-w-2xl">
      <div>
        <h2 className="font-serif text-xl text-carbon mb-1">Configuración</h2>
        <p className="caption text-[12px] text-graphite">
          Opciones de seguridad de tu cuenta de administración.
        </p>
      </div>

      <MfaSettings />
    </div>
  );
}
