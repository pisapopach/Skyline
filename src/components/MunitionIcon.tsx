import type { AirDefenseId, BuildingId, MunitionId } from '../data/munitions';
import type { RussianAircraftId } from '../data/airfields';
import {
  getAircraftSpriteDataUrl,
  getBuildingSpriteDataUrl,
  getLauncherSpriteDataUrl,
  getPvoSpriteDataUrl,
} from '../utils/realisticSprites';

interface MunitionIconProps {
  id: MunitionId;
  className?: string;
}

export function MunitionIcon({ id, className = 'w-14 h-10' }: MunitionIconProps) {
  const src = getLauncherSpriteDataUrl(id);
  if (!src) return null;
  return (
    <img
      src={src}
      alt=""
      aria-hidden="true"
      draggable={false}
      referrerPolicy="no-referrer"
      className={`${className} object-contain select-none pointer-events-none`}
    />
  );
}

interface AirDefenseIconProps {
  id: AirDefenseId;
  className?: string;
}

export function AirDefenseIcon({ id, className = 'w-14 h-10' }: AirDefenseIconProps) {
  const src = getPvoSpriteDataUrl(id);
  if (!src) return null;
  return (
    <img
      src={src}
      alt=""
      aria-hidden="true"
      draggable={false}
      referrerPolicy="no-referrer"
      className={`${className} object-contain select-none pointer-events-none`}
    />
  );
}

interface BuildingIconProps {
  id: BuildingId;
  className?: string;
}

export function BuildingIcon({ id, className = 'w-14 h-10' }: BuildingIconProps) {
  const src = getBuildingSpriteDataUrl(id);
  if (!src) return null;
  return (
    <img
      src={src}
      alt=""
      aria-hidden="true"
      draggable={false}
      referrerPolicy="no-referrer"
      className={`${className} object-contain select-none pointer-events-none`}
    />
  );
}

export function AirfieldIcon({ className = 'w-14 h-10' }: { className?: string }) {
  const src = getBuildingSpriteDataUrl('airfield');
  if (!src) return null;
  return (
    <img
      src={src}
      alt=""
      aria-hidden="true"
      draggable={false}
      referrerPolicy="no-referrer"
      className={`${className} object-contain select-none pointer-events-none`}
    />
  );
}

export function RussianAircraftIcon({
  id,
  className = 'w-12 h-8',
}: {
  id: RussianAircraftId;
  className?: string;
}) {
  const src = getAircraftSpriteDataUrl(id);
  if (!src) return null;
  return (
    <img
      src={src}
      alt=""
      aria-hidden="true"
      draggable={false}
      referrerPolicy="no-referrer"
      className={`${className} object-contain select-none pointer-events-none`}
    />
  );
}
