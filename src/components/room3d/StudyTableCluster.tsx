"use client";

import type { RefObject } from "react";
import { useState } from "react";
import { Html, RoundedBox } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import {
  SEAT_LOCAL_OFFSETS,
  type StudyTableDefinition,
} from "@/lib/room-layout";
import type { RoomPresenceState } from "@/types/domain";

interface StudyTableClusterProps {
  tables: readonly StudyTableDefinition[];
  members: RoomPresenceState[];
  selfTableId: string | null;
  selfSeatIndex: number | null;
  accentHex: string;
  htmlPortal?: RefObject<HTMLElement | null>;
  onSelectSeat: (tableId: string, seatIndex: number) => void;
}

const TABLE_LEG_OFFSETS: readonly [number, number][] = [
  [-1.02, -0.58],
  [1.02, -0.58],
  [-1.02, 0.58],
  [1.02, 0.58],
];

const CHAIR_LEG_OFFSETS: readonly [number, number][] = [
  [-0.18, -0.18],
  [0.18, -0.18],
  [-0.18, 0.18],
  [0.18, 0.18],
];

function CenterDeskProps({ tableId }: { tableId: string }) {
  if (tableId === "table-1") {
    return (
      <group position={[0, 0.77, 0]}>
        {/* Stacked notebook */}
        <mesh position={[-0.22, 0.018, 0.04]} rotation={[0, 0.12, 0]} castShadow>
          <boxGeometry args={[0.32, 0.03, 0.24]} />
          <meshStandardMaterial color="#2563EB" roughness={0.65} />
        </mesh>
        <mesh position={[-0.22, 0.036, 0.04]} rotation={[0, 0.12, 0]}>
          <boxGeometry args={[0.29, 0.015, 0.21]} />
          <meshStandardMaterial color="#FFFDF8" roughness={0.85} />
        </mesh>
        {/* Ceramic mug */}
        <mesh position={[0.28, 0.055, -0.08]} castShadow>
          <cylinderGeometry args={[0.055, 0.05, 0.11, 14]} />
          <meshStandardMaterial color="#F8FAFC" roughness={0.4} />
        </mesh>
        <mesh position={[0.28, 0.105, -0.08]}>
          <cylinderGeometry args={[0.046, 0.046, 0.01, 12]} />
          <meshStandardMaterial color="#5C4033" roughness={0.3} />
        </mesh>
      </group>
    );
  }

  if (tableId === "table-2") {
    return (
      <group position={[0, 0.77, 0]}>
        {/* Compact warm desk lamp */}
        <group position={[-0.36, 0, -0.1]}>
          <mesh position={[0, 0.015, 0]} castShadow>
            <cylinderGeometry args={[0.085, 0.095, 0.03, 14]} />
            <meshStandardMaterial color="#334155" roughness={0.5} />
          </mesh>
          <mesh position={[0.02, 0.14, 0]} rotation={[0, 0, -0.18]}>
            <cylinderGeometry args={[0.014, 0.014, 0.25, 8]} />
            <meshStandardMaterial color="#64748B" metalness={0.35} />
          </mesh>
          <mesh position={[0.07, 0.25, 0]} rotation={[0, 0, 0.45]} castShadow>
            <coneGeometry args={[0.095, 0.12, 14]} />
            <meshStandardMaterial color="#334155" roughness={0.45} />
          </mesh>
          <mesh position={[0.08, 0.21, 0]}>
            <sphereGeometry args={[0.034, 10, 10]} />
            <meshStandardMaterial
              color="#FEF3C7"
              emissive="#FDE68A"
              emissiveIntensity={0.8}
            />
          </mesh>
        </group>
        {/* Open notebook */}
        <mesh position={[0.18, 0.014, 0.06]} rotation={[0, -0.08, 0]} castShadow>
          <boxGeometry args={[0.38, 0.024, 0.25]} />
          <meshStandardMaterial color="#FFFDF8" roughness={0.85} />
        </mesh>
      </group>
    );
  }

  // table-3
  return (
    <group position={[0, 0.77, 0]}>
      {/* Open study book */}
      <mesh position={[-0.16, 0.015, 0.04]} castShadow>
        <boxGeometry args={[0.38, 0.024, 0.26]} />
        <meshStandardMaterial color="#334155" roughness={0.65} />
      </mesh>
      <mesh position={[-0.16, 0.028, 0.04]}>
        <boxGeometry args={[0.35, 0.016, 0.23]} />
        <meshStandardMaterial color="#FFFDF8" roughness={0.85} />
      </mesh>
      {/* Pen cup & mug */}
      <mesh position={[0.28, 0.055, -0.06]} castShadow>
        <cylinderGeometry args={[0.048, 0.044, 0.11, 12]} />
        <meshStandardMaterial color="#0D9488" roughness={0.5} />
      </mesh>
      <mesh position={[0.14, 0.05, -0.14]} castShadow>
        <cylinderGeometry args={[0.052, 0.048, 0.1, 12]} />
        <meshStandardMaterial color="#F1F5F9" roughness={0.4} />
      </mesh>
    </group>
  );
}

export function StudyTableCluster({
  tables,
  members,
  selfTableId,
  selfSeatIndex,
  accentHex,
  htmlPortal,
  onSelectSeat,
}: StudyTableClusterProps) {
  const [hoveredSeatKey, setHoveredSeatKey] = useState<string | null>(null);

  return (
    <group>
      {tables.map((table) => {
        const seatedAtTable = members.filter((m) => m.tableId === table.id);

        return (
          <group
            key={table.id}
            position={[table.position[0], table.position[1], table.position[2]]}
          >
            {/* Warm Wood Beveled Tabletop */}
            <RoundedBox
              args={[2.42, 0.075, 1.5]}
              radius={0.04}
              smoothness={4}
              position={[0, 0.73, 0]}
              castShadow
              receiveShadow
            >
              <meshStandardMaterial color="#D4AF82" roughness={0.62} />
            </RoundedBox>
            {/* Under-bevel trim apron */}
            <RoundedBox
              args={[2.22, 0.045, 1.32]}
              radius={0.02}
              smoothness={3}
              position={[0, 0.68, 0]}
              castShadow
            >
              <meshStandardMaterial color="#B88F5E" roughness={0.7} />
            </RoundedBox>

            {/* Soft Felt Desk Blotter */}
            <mesh position={[0, 0.77, 0]} receiveShadow>
              <boxGeometry args={[1.55, 0.008, 0.82]} />
              <meshStandardMaterial color="#F4F1EA" roughness={0.92} />
            </mesh>

            {/* Non-blocking center desk props */}
            <CenterDeskProps tableId={table.id} />

            {/* Tapered Matte-Charcoal Table Legs */}
            {TABLE_LEG_OFFSETS.map(([lx, lz], idx) => (
              <mesh
                key={idx}
                position={[lx, 0.34, lz]}
                castShadow
                receiveShadow
              >
                <cylinderGeometry args={[0.042, 0.03, 0.68, 12]} />
                <meshStandardMaterial
                  color="#273244"
                  roughness={0.5}
                  metalness={0.2}
                />
              </mesh>
            ))}

            {/* Subtle Table Nameplate */}
            <Html
              position={[0, 1.02, 0]}
              center
              distanceFactor={13}
              zIndexRange={[1, 10]}
              portal={htmlPortal as RefObject<HTMLElement>}
            >
              <div className="pointer-events-none select-none whitespace-nowrap rounded-full border border-stone-200/90 bg-white/88 px-2 py-0.5 text-[10px] font-semibold text-slate-700 shadow-2xs backdrop-blur-xs">
                {table.label} · {seatedAtTable.length}/4
              </div>
            </Html>

            {/* 4 Refined Chairs */}
            {SEAT_LOCAL_OFFSETS.map((seat) => {
              const seatKey = `${table.id}:${seat.seatIndex}`;
              const isSelfSeat =
                selfTableId === table.id && selfSeatIndex === seat.seatIndex;
              const occupier = members.find(
                (m) =>
                  m.tableId === table.id && m.seatIndex === seat.seatIndex
              );
              const isOccupied = Boolean(occupier);
              const isHovered = hoveredSeatKey === seatKey && !isOccupied;

              const cushionColor = isSelfSeat
                ? accentHex
                : isOccupied
                  ? occupier?.avatarColor ?? "#64748B"
                  : isHovered
                    ? "#93C5FD"
                    : "#CBD5E1";

              return (
                <group
                  key={seat.seatIndex}
                  position={[
                    seat.localPosition[0],
                    seat.localPosition[1],
                    seat.localPosition[2],
                  ]}
                  rotation={[0, seat.rotationY, 0]}
                  onClick={(event: ThreeEvent<MouseEvent>) => {
                    if (event.delta > 5) {
                      return;
                    }
                    event.stopPropagation();
                    if (!isOccupied) {
                      onSelectSeat(table.id, seat.seatIndex);
                    }
                  }}
                  onPointerOver={(event: ThreeEvent<PointerEvent>) => {
                    event.stopPropagation();
                    if (!isOccupied) {
                      setHoveredSeatKey(seatKey);
                      document.body.style.cursor = "pointer";
                    }
                  }}
                  onPointerOut={() => {
                    setHoveredSeatKey((prev) =>
                      prev === seatKey ? null : prev
                    );
                    document.body.style.cursor = "auto";
                  }}
                >
                  {/* Oak Seat Base Frame */}
                  <RoundedBox
                    args={[0.5, 0.04, 0.5]}
                    radius={0.02}
                    smoothness={3}
                    position={[0, 0.39, 0]}
                    castShadow
                  >
                    <meshStandardMaterial color="#B88F5E" roughness={0.7} />
                  </RoundedBox>

                  {/* Upholstered Seat Cushion (top at y = 0.44) */}
                  <RoundedBox
                    args={[0.46, 0.06, 0.46]}
                    radius={0.025}
                    smoothness={3}
                    position={[0, 0.41, 0.01]}
                    castShadow
                    receiveShadow
                  >
                    <meshStandardMaterial color={cushionColor} roughness={0.65} />
                  </RoundedBox>

                  {/* Backrest Posts & Curved Wood/Upholstered Backrest (at local -Z) */}
                  <mesh position={[-0.18, 0.62, -0.22]} castShadow>
                    <cylinderGeometry args={[0.02, 0.02, 0.44, 8]} />
                    <meshStandardMaterial color="#9A7B56" roughness={0.68} />
                  </mesh>
                  <mesh position={[0.18, 0.62, -0.22]} castShadow>
                    <cylinderGeometry args={[0.02, 0.02, 0.44, 8]} />
                    <meshStandardMaterial color="#9A7B56" roughness={0.68} />
                  </mesh>
                  <RoundedBox
                    args={[0.44, 0.26, 0.055]}
                    radius={0.02}
                    smoothness={3}
                    position={[0, 0.72, -0.22]}
                    castShadow
                  >
                    <meshStandardMaterial color="#334155" roughness={0.6} />
                  </RoundedBox>

                  {/* 4 Refined Tapered Chair Legs */}
                  {CHAIR_LEG_OFFSETS.map(([cx, cz], idx) => (
                    <mesh key={idx} position={[cx, 0.19, cz]} castShadow>
                      <cylinderGeometry args={[0.022, 0.016, 0.38, 8]} />
                      <meshStandardMaterial color="#9A7B56" roughness={0.65} />
                    </mesh>
                  ))}

                  {/* Open-seat floor target ring */}
                  {!isOccupied ? (
                    <mesh
                      position={[0, 0.018, 0]}
                      rotation={[-Math.PI / 2, 0, 0]}
                    >
                      <ringGeometry args={[0.26, 0.33, 24]} />
                      <meshStandardMaterial
                        color={isHovered ? accentHex : "#94A3B8"}
                        transparent
                        opacity={isHovered ? 0.88 : 0.32}
                      />
                    </mesh>
                  ) : null}
                </group>
              );
            })}
          </group>
        );
      })}
    </group>
  );
}
