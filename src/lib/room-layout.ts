export interface StudyTableDefinition {
  id: string;
  label: string;
  position: readonly [number, number, number];
}

export interface SeatLocalOffset {
  seatIndex: number;
  label: string;
  localPosition: readonly [number, number, number];
  rotationY: number;
}

export const ROOM_FLOOR_WIDTH = 14;
export const ROOM_FLOOR_DEPTH = 12;
export const ROOM_WALL_HEIGHT = 2.8;
export const ROOM_WALL_THICKNESS = 0.22;

export const WALK_BOUNDS = {
  minX: -6.1,
  maxX: 6.1,
  minZ: -5.1,
  maxZ: 5.1,
} as const;

export const STUDY_TABLES: readonly StudyTableDefinition[] = [
  { id: "table-1", label: "Table 1", position: [-3.4, 0, -1.6] },
  { id: "table-2", label: "Table 2", position: [3.4, 0, -1.6] },
  { id: "table-3", label: "Table 3", position: [0, 0, 2.5] },
] as const;

export const SEAT_LOCAL_OFFSETS: readonly SeatLocalOffset[] = [
  {
    seatIndex: 0,
    label: "North",
    localPosition: [0, 0, -1.22],
    rotationY: 0,
  },
  {
    seatIndex: 1,
    label: "East",
    localPosition: [1.58, 0, 0],
    rotationY: -Math.PI / 2,
  },
  {
    seatIndex: 2,
    label: "South",
    localPosition: [0, 0, 1.22],
    rotationY: Math.PI,
  },
  {
    seatIndex: 3,
    label: "West",
    localPosition: [-1.58, 0, 0],
    rotationY: Math.PI / 2,
  },
] as const;

export function clampFloorPosition(
  x: number,
  z: number
): [number, number, number] {
  const clampedX = Math.max(WALK_BOUNDS.minX, Math.min(WALK_BOUNDS.maxX, x));
  const clampedZ = Math.max(WALK_BOUNDS.minZ, Math.min(WALK_BOUNDS.maxZ, z));
  return [Number(clampedX.toFixed(3)), 0, Number(clampedZ.toFixed(3))];
}

export function getSeatWorldTransform(
  tableId: string,
  seatIndex: number
): { position: [number, number, number]; rotationY: number } | null {
  const table = STUDY_TABLES.find((t) => t.id === tableId);
  const seat = SEAT_LOCAL_OFFSETS.find((s) => s.seatIndex === seatIndex);
  if (!table || !seat) {
    return null;
  }

  return {
    position: [
      Number((table.position[0] + seat.localPosition[0]).toFixed(3)),
      0,
      Number((table.position[2] + seat.localPosition[2]).toFixed(3)),
    ],
    rotationY: seat.rotationY,
  };
}

export function getSpawnPosition(seed: string): [number, number, number] {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  const offsetX = ((Math.abs(hash) % 9) - 4) * 0.4;
  return clampFloorPosition(offsetX, 4.6);
}
