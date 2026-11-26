"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import {
  ROOM_FLOOR_DEPTH,
  ROOM_FLOOR_WIDTH,
  ROOM_WALL_HEIGHT,
  ROOM_WALL_THICKNESS,
  STUDY_TABLES,
} from "@/lib/room-layout";
import type { CampusSubject } from "@/types/domain";

interface ProceduralRoomMeshProps {
  subject: CampusSubject;
  accentHex: string;
  onFloorClick: (point: [number, number, number]) => void;
}

const OAK_PLANK_TONES = [
  "#DFC49F",
  "#D7BA92",
  "#E3CAA7",
  "#D3B489",
  "#DCBE97",
] as const;

function createOakFloorTexture(): THREE.CanvasTexture | null {
  if (typeof document === "undefined") {
    return null;
  }
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return null;
  }

  ctx.fillStyle = "#D8BC94";
  ctx.fillRect(0, 0, 512, 512);

  const plankRows = 8;
  const rowH = 512 / plankRows;
  const cols = 2;
  const colW = 512 / cols;

  for (let r = 0; r < plankRows; r += 1) {
    const stagger = (r % 2) * (colW * 0.5);
    for (let c = -1; c <= cols; c += 1) {
      const x = c * colW + stagger;
      const y = r * rowH;
      const tone = OAK_PLANK_TONES[(r * 3 + c + 4) % OAK_PLANK_TONES.length];
      ctx.fillStyle = tone;
      ctx.fillRect(x, y, colW - 2, rowH - 2);

      // Subtle wood grain lines
      ctx.strokeStyle = "rgba(148, 108, 68, 0.14)";
      ctx.lineWidth = 1;
      for (let g = 1; g <= 3; g += 1) {
        const gy = y + (rowH / 4) * g;
        ctx.beginPath();
        ctx.moveTo(x + 4, gy);
        ctx.lineTo(x + colW - 6, gy);
        ctx.stroke();
      }

      // Seam line
      ctx.strokeStyle = "rgba(120, 86, 54, 0.28)";
      ctx.strokeRect(x, y, colW, rowH);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(4, 4);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function TeacherLecternAndProctor({ accentHex }: { accentHex: string }) {
  const headRef = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    if (headRef.current) {
      headRef.current.rotation.y = Math.sin(clock.elapsedTime * 0.45) * 0.34;
    }
  });

  return (
    <group position={[-5.35, 0, -4.45]} rotation={[0, Math.PI / 4, 0]}>
      {/* Stylized Low-Poly Teacher / Proctor standing behind lectern */}
      <group position={[0, 0, -0.45]}>
        {/* Shoes & Trousers */}
        <mesh position={[-0.09, 0.04, 0.02]} castShadow>
          <boxGeometry args={[0.11, 0.07, 0.17]} />
          <meshStandardMaterial color="#1E293B" roughness={0.65} />
        </mesh>
        <mesh position={[0.09, 0.04, 0.02]} castShadow>
          <boxGeometry args={[0.11, 0.07, 0.17]} />
          <meshStandardMaterial color="#1E293B" roughness={0.65} />
        </mesh>
        <mesh position={[-0.09, 0.28, 0]} castShadow>
          <capsuleGeometry args={[0.075, 0.32, 6, 10]} />
          <meshStandardMaterial color="#334155" roughness={0.75} />
        </mesh>
        <mesh position={[0.09, 0.28, 0]} castShadow>
          <capsuleGeometry args={[0.075, 0.32, 6, 10]} />
          <meshStandardMaterial color="#334155" roughness={0.75} />
        </mesh>

        {/* Blazer Torso & Warm Sweater Shirt */}
        <mesh position={[0, 0.78, 0]} castShadow>
          <capsuleGeometry args={[0.21, 0.38, 8, 16]} />
          <meshStandardMaterial color="#1E3A5F" roughness={0.6} />
        </mesh>
        <mesh position={[0, 0.84, 0.16]}>
          <boxGeometry args={[0.12, 0.24, 0.07]} />
          <meshStandardMaterial color="#F8FAFC" roughness={0.8} />
        </mesh>
        {/* Subtle Tie / Accent Pin */}
        <mesh position={[0, 0.84, 0.2]}>
          <boxGeometry args={[0.035, 0.18, 0.02]} />
          <meshStandardMaterial color={accentHex} roughness={0.5} />
        </mesh>

        {/* Blazer Sleeves & Hands resting near lectern */}
        <mesh
          position={[-0.26, 0.78, 0.14]}
          rotation={[0.9, 0, -0.12]}
          castShadow
        >
          <capsuleGeometry args={[0.055, 0.22, 6, 10]} />
          <meshStandardMaterial color="#1E3A5F" roughness={0.6} />
        </mesh>
        <mesh
          position={[0.26, 0.78, 0.14]}
          rotation={[0.9, 0, 0.12]}
          castShadow
        >
          <capsuleGeometry args={[0.055, 0.22, 6, 10]} />
          <meshStandardMaterial color="#1E3A5F" roughness={0.6} />
        </mesh>

        {/* Animated Head & Glasses sweeping gently across the 3 tables */}
        <group ref={headRef} position={[0, 1.24, 0]}>
          <mesh castShadow>
            <sphereGeometry args={[0.19, 18, 18]} />
            <meshStandardMaterial color="#EBB891" roughness={0.68} />
          </mesh>
          {/* Silver-slate hair */}
          <mesh position={[0, 0.06, -0.02]} castShadow>
            <sphereGeometry
              args={[0.197, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.56]}
            />
            <meshStandardMaterial color="#64748B" roughness={0.78} />
          </mesh>
          {/* Eyes */}
          <mesh position={[-0.06, 0.01, 0.17]}>
            <sphereGeometry args={[0.018, 8, 8]} />
            <meshStandardMaterial color="#0F172A" />
          </mesh>
          <mesh position={[0.06, 0.01, 0.17]}>
            <sphereGeometry args={[0.018, 8, 8]} />
            <meshStandardMaterial color="#0F172A" />
          </mesh>
          {/* Glasses Frames & Bridge */}
          <mesh position={[-0.06, 0.01, 0.185]}>
            <torusGeometry args={[0.04, 0.008, 6, 16]} />
            <meshStandardMaterial color="#1E293B" metalness={0.35} />
          </mesh>
          <mesh position={[0.06, 0.01, 0.185]}>
            <torusGeometry args={[0.04, 0.008, 6, 16]} />
            <meshStandardMaterial color="#1E293B" metalness={0.35} />
          </mesh>
          <mesh position={[0, 0.015, 0.185]}>
            <boxGeometry args={[0.045, 0.01, 0.01]} />
            <meshStandardMaterial color="#1E293B" metalness={0.35} />
          </mesh>
        </group>
      </group>

      {/* Warm Wooden Teacher's Lectern */}
      <group position={[0, 0, 0.18]}>
        <mesh position={[0, 0.04, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.92, 0.08, 0.58]} />
          <meshStandardMaterial color="#A87F52" roughness={0.72} />
        </mesh>
        <mesh position={[0, 0.52, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.78, 0.9, 0.44]} />
          <meshStandardMaterial color="#C69F73" roughness={0.7} />
        </mesh>
        {/* Slanted Lectern Top */}
        <mesh
          position={[0, 1.0, 0.02]}
          rotation={[0.2, 0, 0]}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[0.96, 0.07, 0.62]} />
          <meshStandardMaterial color="#B58B5E" roughness={0.65} />
        </mesh>
        {/* Open Book resting on Lectern */}
        <group position={[0, 1.05, 0.04]} rotation={[0.2, 0, 0]}>
          <mesh position={[0, 0, 0]} castShadow>
            <boxGeometry args={[0.48, 0.02, 0.32]} />
            <meshStandardMaterial color="#1E293B" roughness={0.6} />
          </mesh>
          <mesh position={[-0.11, 0.018, 0]} rotation={[0, 0, 0.06]}>
            <boxGeometry args={[0.21, 0.02, 0.29]} />
            <meshStandardMaterial color="#FFFDF8" roughness={0.85} />
          </mesh>
          <mesh position={[0.11, 0.018, 0]} rotation={[0, 0, -0.06]}>
            <boxGeometry args={[0.21, 0.02, 0.29]} />
            <meshStandardMaterial color="#FFFDF8" roughness={0.85} />
          </mesh>
        </group>
      </group>
    </group>
  );
}

function ArchitecturalWindow({ z }: { z: number }) {
  return (
    <group position={[-ROOM_FLOOR_WIDTH / 2 + 0.01, 1.55, z]}>
      {/* Dark recessed outer frame */}
      <mesh>
        <boxGeometry args={[0.08, 1.65, 2.25]} />
        <meshStandardMaterial color="#334155" roughness={0.55} />
      </mesh>
      {/* Warm daylight glass glow */}
      <mesh position={[0.02, 0, 0]}>
        <boxGeometry args={[0.05, 1.48, 2.08]} />
        <meshStandardMaterial
          color="#FFFBEB"
          emissive="#FDE68A"
          emissiveIntensity={0.45}
          roughness={0.2}
        />
      </mesh>
      {/* Center vertical & horizontal mullions */}
      <mesh position={[0.04, 0, 0]}>
        <boxGeometry args={[0.04, 1.52, 0.06]} />
        <meshStandardMaterial color="#334155" roughness={0.55} />
      </mesh>
      <mesh position={[0.04, 0.12, 0]}>
        <boxGeometry args={[0.04, 0.06, 2.12]} />
        <meshStandardMaterial color="#334155" roughness={0.55} />
      </mesh>
      {/* Warm oak window sill */}
      <mesh position={[0.09, -0.84, 0]} castShadow>
        <boxGeometry args={[0.18, 0.06, 2.38]} />
        <meshStandardMaterial color="#B8926A" roughness={0.68} />
      </mesh>
    </group>
  );
}

const BOOK_SPINE_COLORS = [
  "#2563EB",
  "#0D9488",
  "#D97706",
  "#475569",
  "#9F1239",
  "#15803D",
  "#CA8A04",
  "#6366F1",
] as const;

function WoodenBookshelf() {
  return (
    <group position={[4.15, 0, -ROOM_FLOOR_DEPTH / 2 + 0.28]}>
      {/* Outer oak cabinet */}
      <mesh position={[0, 1.05, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.0, 2.1, 0.44]} />
        <meshStandardMaterial color="#C69F73" roughness={0.72} />
      </mesh>
      {/* 3 Shelf recesses */}
      {[0.48, 1.04, 1.6].map((shelfY, rowIdx) => (
        <group key={shelfY} position={[0, shelfY, 0.04]}>
          <mesh>
            <boxGeometry args={[1.82, 0.42, 0.38]} />
            <meshStandardMaterial color="#5C4430" roughness={0.85} />
          </mesh>
          {/* Colorful book spines */}
          {Array.from({ length: 7 }, (_, bookIdx) => {
            const bx = -0.74 + bookIdx * 0.21;
            const height = 0.28 + ((rowIdx + bookIdx) % 3) * 0.035;
            const color =
              BOOK_SPINE_COLORS[
                (rowIdx * 5 + bookIdx) % BOOK_SPINE_COLORS.length
              ];
            const tilt = rowIdx === 1 && bookIdx === 6 ? 0.22 : 0;
            return (
              <mesh
                key={bookIdx}
                position={[bx, -0.21 + height / 2, 0.05]}
                rotation={[0, 0, tilt]}
                castShadow
              >
                <boxGeometry args={[0.14, height, 0.26]} />
                <meshStandardMaterial color={color} roughness={0.65} />
              </mesh>
            );
          })}
        </group>
      ))}
    </group>
  );
}

function PottedCornerPlant({
  position,
  scale = 1,
}: {
  position: [number, number, number];
  scale?: number;
}) {
  return (
    <group position={position} scale={scale}>
      {/* Terracotta pot */}
      <mesh position={[0, 0.22, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.26, 0.19, 0.44, 14]} />
        <meshStandardMaterial color="#C27A54" roughness={0.78} />
      </mesh>
      <mesh position={[0, 0.43, 0]} castShadow>
        <cylinderGeometry args={[0.28, 0.27, 0.06, 14]} />
        <meshStandardMaterial color="#B56B45" roughness={0.75} />
      </mesh>
      {/* Soil */}
      <mesh position={[0, 0.43, 0]}>
        <cylinderGeometry args={[0.24, 0.24, 0.02, 12]} />
        <meshStandardMaterial color="#3E2723" roughness={0.95} />
      </mesh>
      {/* Clustered low-poly foliage */}
      <mesh position={[0, 0.72, 0]} castShadow>
        <dodecahedronGeometry args={[0.26, 0]} />
        <meshStandardMaterial color="#4D7C0F" roughness={0.8} />
      </mesh>
      <mesh position={[-0.16, 0.58, 0.12]} castShadow>
        <dodecahedronGeometry args={[0.19, 0]} />
        <meshStandardMaterial color="#65A30D" roughness={0.8} />
      </mesh>
      <mesh position={[0.16, 0.62, -0.1]} castShadow>
        <dodecahedronGeometry args={[0.2, 0]} />
        <meshStandardMaterial color="#15803D" roughness={0.8} />
      </mesh>
      <mesh position={[0.04, 0.94, 0.05]} castShadow>
        <dodecahedronGeometry args={[0.17, 0]} />
        <meshStandardMaterial color="#65A30D" roughness={0.8} />
      </mesh>
    </group>
  );
}

function MathWallBoard() {
  return (
    <group position={[0.2, 1.55, -ROOM_FLOOR_DEPTH / 2 + 0.06]}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[3.4, 1.45, 0.08]} />
        <meshStandardMaterial color="#8C6A47" roughness={0.65} />
      </mesh>
      <mesh position={[0, 0, 0.045]}>
        <boxGeometry args={[3.18, 1.24, 0.02]} />
        <meshStandardMaterial color="#FFFDF8" roughness={0.85} />
      </mesh>
      {/* Coordinate axes */}
      <mesh position={[0, 0, 0.06]}>
        <boxGeometry args={[2.5, 0.022, 0.01]} />
        <meshStandardMaterial color="#64748B" />
      </mesh>
      <mesh position={[0, 0, 0.06]}>
        <boxGeometry args={[0.022, 0.92, 0.01]} />
        <meshStandardMaterial color="#64748B" />
      </mesh>
      {/* Riemann bars */}
      <mesh position={[-0.45, 0.18, 0.06]}>
        <boxGeometry args={[0.2, 0.34, 0.015]} />
        <meshStandardMaterial color="#93C5FD" />
      </mesh>
      <mesh position={[-0.2, 0.26, 0.06]}>
        <boxGeometry args={[0.2, 0.5, 0.015]} />
        <meshStandardMaterial color="#60A5FA" />
      </mesh>
      <mesh position={[0.05, 0.34, 0.06]}>
        <boxGeometry args={[0.2, 0.66, 0.015]} />
        <meshStandardMaterial color="#3B82F6" />
      </mesh>
      <mesh position={[0.3, 0.22, 0.06]}>
        <boxGeometry args={[0.2, 0.42, 0.015]} />
        <meshStandardMaterial color="#2563EB" />
      </mesh>
    </group>
  );
}

function GeneralAcousticPanel() {
  return (
    <group position={[0.2, 1.55, -ROOM_FLOOR_DEPTH / 2 + 0.06]}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[3.4, 1.4, 0.05]} />
        <meshStandardMaterial color="#EDE6DA" roughness={0.9} />
      </mesh>
      {Array.from({ length: 11 }, (_, index) => {
        const offsetX = -1.5 + index * 0.3;
        return (
          <mesh key={index} position={[offsetX, 0, 0.04]} castShadow>
            <boxGeometry args={[0.08, 1.24, 0.04]} />
            <meshStandardMaterial color="#9A7B56" roughness={0.75} />
          </mesh>
        );
      })}
    </group>
  );
}

export function ProceduralRoomMesh({
  subject,
  accentHex,
  onFloorClick,
}: ProceduralRoomMeshProps) {
  const oakTexture = useMemo(() => createOakFloorTexture(), []);

  useEffect(() => {
    return () => {
      oakTexture?.dispose();
    };
  }, [oakTexture]);

  const handleFloorClick = (event: ThreeEvent<MouseEvent>) => {
    if (event.delta > 5) {
      return;
    }
    event.stopPropagation();
    onFloorClick([event.point.x, 0, event.point.z]);
  };

  const rugBorderColor = subject === "math" ? "#93C5FD" : "#CBD5E1";

  return (
    <group>
      {/* Warm Light-Oak Wood Floor Slab */}
      <mesh
        position={[0, -0.06, 0]}
        receiveShadow
        onClick={handleFloorClick}
        onPointerOver={() => {
          document.body.style.cursor = "crosshair";
        }}
        onPointerOut={() => {
          document.body.style.cursor = "auto";
        }}
      >
        <boxGeometry args={[ROOM_FLOOR_WIDTH, 0.12, ROOM_FLOOR_DEPTH]} />
        <meshStandardMaterial
          map={oakTexture ?? undefined}
          color={oakTexture ? "#FFFFFF" : "#DFC49F"}
          roughness={0.82}
          metalness={0.03}
        />
      </mesh>

      {/* Soft Rectangular Rugs Under Each Study Table */}
      {STUDY_TABLES.map((table) => (
        <group
          key={table.id}
          position={[table.position[0], 0.009, table.position[2]]}
        >
          <mesh receiveShadow>
            <boxGeometry args={[3.75, 0.016, 3.05]} />
            <meshStandardMaterial color={rugBorderColor} roughness={0.95} />
          </mesh>
          <mesh position={[0, 0.002, 0]} receiveShadow>
            <boxGeometry args={[3.5, 0.016, 2.8]} />
            <meshStandardMaterial color="#EAE4D9" roughness={0.96} />
          </mesh>
        </group>
      ))}

      {/* Warm Off-White Plaster Back Wall (North) */}
      <mesh
        position={[
          -ROOM_WALL_THICKNESS / 2,
          ROOM_WALL_HEIGHT / 2,
          -ROOM_FLOOR_DEPTH / 2 - ROOM_WALL_THICKNESS / 2,
        ]}
        castShadow
        receiveShadow
      >
        <boxGeometry
          args={[
            ROOM_FLOOR_WIDTH + ROOM_WALL_THICKNESS,
            ROOM_WALL_HEIGHT,
            ROOM_WALL_THICKNESS,
          ]}
        />
        <meshStandardMaterial color="#FAF6F0" roughness={0.88} />
      </mesh>

      {/* Thin Top Wall Trim (Back Wall) */}
      <mesh
        position={[
          -ROOM_WALL_THICKNESS / 2,
          ROOM_WALL_HEIGHT + 0.03,
          -ROOM_FLOOR_DEPTH / 2 - ROOM_WALL_THICKNESS / 2,
        ]}
      >
        <boxGeometry
          args={[
            ROOM_FLOOR_WIDTH + ROOM_WALL_THICKNESS,
            0.06,
            ROOM_WALL_THICKNESS + 0.02,
          ]}
        />
        <meshStandardMaterial color={accentHex} roughness={0.5} />
      </mesh>

      {/* Warm Off-White Plaster Left Wall (West) */}
      <mesh
        position={[
          -ROOM_FLOOR_WIDTH / 2 - ROOM_WALL_THICKNESS / 2,
          ROOM_WALL_HEIGHT / 2,
          0,
        ]}
        castShadow
        receiveShadow
      >
        <boxGeometry
          args={[ROOM_WALL_THICKNESS, ROOM_WALL_HEIGHT, ROOM_FLOOR_DEPTH]}
        />
        <meshStandardMaterial color="#FAF6F0" roughness={0.88} />
      </mesh>

      {/* Thin Top Wall Trim (Left Wall) */}
      <mesh
        position={[
          -ROOM_FLOOR_WIDTH / 2 - ROOM_WALL_THICKNESS / 2,
          ROOM_WALL_HEIGHT + 0.03,
          0,
        ]}
      >
        <boxGeometry
          args={[ROOM_WALL_THICKNESS + 0.02, 0.06, ROOM_FLOOR_DEPTH]}
        />
        <meshStandardMaterial color={accentHex} roughness={0.5} />
      </mesh>

      {/* Warm Wood Baseboards */}
      <mesh position={[0, 0.07, -ROOM_FLOOR_DEPTH / 2 + 0.015]}>
        <boxGeometry args={[ROOM_FLOOR_WIDTH, 0.14, 0.03]} />
        <meshStandardMaterial color="#B8926A" roughness={0.72} />
      </mesh>
      <mesh position={[-ROOM_FLOOR_WIDTH / 2 + 0.015, 0.07, 0]}>
        <boxGeometry args={[0.03, 0.14, ROOM_FLOOR_DEPTH]} />
        <meshStandardMaterial color="#B8926A" roughness={0.72} />
      </mesh>

      {/* Tall Architectural Windows on Left Wall */}
      <ArchitecturalWindow z={-1.75} />
      <ArchitecturalWindow z={2.25} />

      {/* Back-Right Wooden Bookshelf with Varied Books */}
      <WoodenBookshelf />

      {/* Potted Corner Plants */}
      <PottedCornerPlant position={[-6.25, 0, 5.2]} scale={1.05} />
      <PottedCornerPlant position={[6.15, 0, -5.2]} scale={0.92} />

      {/* Teacher Lectern & Animated Proctor Figure */}
      <TeacherLecternAndProctor accentHex={accentHex} />

      {/* Zone Back-Wall Focus Element */}
      {subject === "math" ? <MathWallBoard /> : <GeneralAcousticPanel />}
    </group>
  );
}
