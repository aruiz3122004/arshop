import { LocationPicker } from "./location-picker";

export function AnnouncementBar() {
  return (
    <div className="bg-stone border-b border-smoke">
      <div className="mx-auto flex min-h-9 max-w-[1280px] items-center justify-between gap-2 sm:gap-4 px-4 sm:px-5 md:px-6">
        <p className="caption text-graphite hidden md:block">
          Envíos a toda Colombia · Devoluciones gratuitas en 30 días
        </p>
        <p className="caption text-graphite md:hidden text-[12px] truncate">
          Envíos a toda Colombia
        </p>
        <LocationPicker />
      </div>
    </div>
  );
}
