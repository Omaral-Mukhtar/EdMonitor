"use client";

import type { RefObject } from "react";
import { useRef } from "react";
import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { STUDY_TECHNIQUES } from "@/lib/study-timer";
import type { FocusHalo, RoomPresenceState } from "@/types/domain";

interface ProceduralAvatarProps {
  member: RoomPresenceState;
  isSelf: boolean;
  htmlPortal?: RefObject<HTMLElement | null>;
}

const HALO_STYLES: Record<
  FocusHalo,
  {
    color: string;
    emissive: string;
    emissiveIntensity: number;
    dotClass: string;
  }
> = {
  green: {
    color: "#22C55E",
    emissive: "#16A34A",
    emissiveIntensity: 0.65,
    dotClass: "bg-[#16A34A]",
  },
  red: {
    color: "#EF4444",
    emissive: "#DC2626",
    emissiveIntensity: 0.9,
    dotClass: "bg-[#DC2626]",
  },
  yellow: {
    color: "#EAB308",
    emissive: "#CA8A04",
    emissiveIntensity: 0.6,
    dotClass: "bg-[#CA8A04]",
  },
};

function shortestAngleLerp(current: number, target: number, alpha: number) {
  let diff = ((target - current + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) {
    diff += Math.PI * 2;
  }
  return current + diff * alpha;
}

export function ProceduralAvatar({
  member,
  isSelf,
  htmlPortal,
}: ProceduralAvatarProps) {
  const rootRef = useRef<THREE.Group>(null);
  const facingRef = useRef<THREE.Group>(null);
  const upperBodyRef = useRef<THREE.Group>(null);
  const legsRef = useRef<THREE.Group>(null);
  const leftHandRef = useRef<THREE.Mesh>(null);
  const rightHandRef = useRef<THREE.Mesh>(null);
  const initializedRef = useRef(false);
  const walkPhaseRef = useRef(0);

  const isSeated = member.tableId !== null && member.seatIndex !== null;
  const haloStyle = HALO_STYLES[member.halo];
  const techniqueLabel =
    STUDY_TECHNIQUES[member.technique]?.shortLabel ?? member.technique;

  useFrame((_, delta) => {
    const root = rootRef.current;
    const facing = facingRef.current;
    const upperBody = upperBodyRef.current;
    const legs = legsRef.current;
    if (!root || !facing || !upperBody || !legs) {
      return;
    }

    const targetX = member.position[0];
    const targetZ = member.position[2];

    if (!initializedRef.current) {
      root.position.set(targetX, 0, targetZ);
      facing.rotation.y = member.rotationY;
      initializedRef.current = true;
      return;
    }

    const dx = targetX - root.position.x;
    const dz = targetZ - root.position.z;
    const distance = Math.hypot(dx, dz);
    const isMoving = distance > 0.04;

    const moveAlpha = 1 - Math.exp(-delta * 8);
    root.position.x = THREE.MathUtils.lerp(root.position.x, targetX, moveAlpha);
    root.position.z = THREE.MathUtils.lerp(root.position.z, targetZ, moveAlpha);

    const targetRotY = isMoving ? Math.atan2(dx, dz) : member.rotationY;
    facing.rotation.y = shortestAngleLerp(
      facing.rotation.y,
      targetRotY,
      moveAlpha
    );

    if (isMoving) {
      walkPhaseRef.current += delta * 10;
      const bobY = Math.abs(Math.sin(walkPhaseRef.current)) * 0.075;
      upperBody.position.y = THREE.MathUtils.lerp(
        upperBody.position.y,
        0.38 + bobY,
        0.35
      );
      upperBody.rotation.x = THREE.MathUtils.lerp(
        upperBody.rotation.x,
        0.05,
        0.25
      );
      legs.position.set(0, 0.22 + bobY * 0.4, 0);
      legs.rotation.x = THREE.MathUtils.lerp(legs.rotation.x, 0, 0.25);

      const swing = Math.sin(walkPhaseRef.current) * 0.12;
      if (leftHandRef.current && rightHandRef.current) {
        leftHandRef.current.position.z = 0.06 + swing;
        rightHandRef.current.position.z = 0.06 - swing;
      }
    } else if (isSeated) {
      // Rest hips cleanly on top of chair cushion (y = 0.44) in front of backrest
      upperBody.position.y = THREE.MathUtils.lerp(
        upperBody.position.y,
        0.46,
        0.25
      );
      upperBody.rotation.x = THREE.MathUtils.lerp(
        upperBody.rotation.x,
        0.1,
        0.25
      );
      // Fold legs horizontally forward toward the table
      legs.position.y = THREE.MathUtils.lerp(legs.position.y, 0.44, 0.25);
      legs.position.z = THREE.MathUtils.lerp(legs.position.z, 0.14, 0.25);
      legs.rotation.x = THREE.MathUtils.lerp(
        legs.rotation.x,
        -Math.PI / 2.25,
        0.25
      );
      if (leftHandRef.current && rightHandRef.current) {
        leftHandRef.current.position.z = THREE.MathUtils.lerp(
          leftHandRef.current.position.z,
          0.22,
          0.25
        );
        rightHandRef.current.position.z = THREE.MathUtils.lerp(
          rightHandRef.current.position.z,
          0.22,
          0.25
        );
      }
    } else {
      upperBody.position.y = THREE.MathUtils.lerp(
        upperBody.position.y,
        0.38,
        0.25
      );
      upperBody.rotation.x = THREE.MathUtils.lerp(
        upperBody.rotation.x,
        0,
        0.25
      );
      legs.position.y = THREE.MathUtils.lerp(legs.position.y, 0.22, 0.25);
      legs.position.z = THREE.MathUtils.lerp(legs.position.z, 0, 0.25);
      legs.rotation.x = THREE.MathUtils.lerp(legs.rotation.x, 0, 0.25);
      if (leftHandRef.current && rightHandRef.current) {
        leftHandRef.current.position.z = THREE.MathUtils.lerp(
          leftHandRef.current.position.z,
          0.06,
          0.25
        );
        rightHandRef.current.position.z = THREE.MathUtils.lerp(
          rightHandRef.current.position.z,
          0.06,
          0.25
        );
      }
    }
  });

  return (
    <group ref={rootRef}>
      {/* Crisp 3-State Floor Halo Ring */}
      <mesh position={[0, 0.025, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.41, 0.032, 12, 32]} />
        <meshStandardMaterial
          color={haloStyle.color}
          emissive={haloStyle.emissive}
          emissiveIntensity={haloStyle.emissiveIntensity}
          roughness={0.35}
        />
      </mesh>

      <group ref={facingRef}>
        {/* Legs & Shoes Group (vertical when standing, folded forward when seated) */}
        <group ref={legsRef} position={[0, 0.22, 0]}>
          <mesh position={[-0.085, 0, 0]} castShadow>
            <capsuleGeometry args={[0.068, 0.2, 6, 10]} />
            <meshStandardMaterial color="#334155" roughness={0.75} />
          </mesh>
          <mesh position={[0.085, 0, 0]} castShadow>
            <capsuleGeometry args={[0.068, 0.2, 6, 10]} />
            <meshStandardMaterial color="#334155" roughness={0.75} />
          </mesh>
          <mesh position={[-0.085, -0.17, 0.03]} castShadow>
            <boxGeometry args={[0.11, 0.07, 0.16]} />
            <meshStandardMaterial color="#1E293B" roughness={0.65} />
          </mesh>
          <mesh position={[0.085, -0.17, 0.03]} castShadow>
            <boxGeometry args={[0.11, 0.07, 0.16]} />
            <meshStandardMaterial color="#1E293B" roughness={0.65} />
          </mesh>
        </group>

        {/* Stylized Student Upper Body (Hoodie + Warm Skin Head + Headphones) */}
        <group ref={upperBodyRef} position={[0, 0.38, 0]}>
          {/* Colored Hoodie Torso */}
          <mesh position={[0, 0.31, 0]} castShadow>
            <capsuleGeometry args={[0.19, 0.3, 8, 16]} />
            <meshStandardMaterial color={member.avatarColor} roughness={0.55} />
          </mesh>

          {/* Subtle Shoulder & Hoodie Collar Accent */}
          <mesh position={[0, 0.56, -0.02]} rotation={[0.18, 0, 0]} castShadow>
            <torusGeometry args={[0.135, 0.042, 8, 20]} />
            <meshStandardMaterial color={member.avatarColor} roughness={0.65} />
          </mesh>

          {/* Warm Skin-Tone Head */}
          <mesh position={[0, 0.8, 0]} castShadow>
            <sphereGeometry args={[0.185, 18, 18]} />
            <meshStandardMaterial color="#F1C29B" roughness={0.68} />
          </mesh>

          {/* Stylized Hair Cap */}
          <mesh position={[0, 0.855, -0.025]} castShadow>
            <sphereGeometry
              args={[0.192, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.56]}
            />
            <meshStandardMaterial color="#2D3748" roughness={0.8} />
          </mesh>

          {/* Friendly Eyes (+Z facing direction) */}
          <mesh position={[-0.058, 0.805, 0.165]}>
            <sphereGeometry args={[0.02, 8, 8]} />
            <meshStandardMaterial color="#1E293B" roughness={0.3} />
          </mesh>
          <mesh position={[0.058, 0.805, 0.165]}>
            <sphereGeometry args={[0.02, 8, 8]} />
            <meshStandardMaterial color="#1E293B" roughness={0.3} />
          </mesh>

          {/* Headphones Headband & Earcups */}
          <mesh position={[0, 0.82, 0]} rotation={[0, 0, 0]}>
            <torusGeometry args={[0.2, 0.02, 8, 20, Math.PI]} />
            <meshStandardMaterial color="#1E293B" roughness={0.4} />
          </mesh>
          <mesh position={[-0.195, 0.8, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.052, 0.052, 0.04, 12]} />
            <meshStandardMaterial color="#334155" roughness={0.45} />
          </mesh>
          <mesh position={[0.195, 0.8, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.052, 0.052, 0.04, 12]} />
            <meshStandardMaterial color="#334155" roughness={0.45} />
          </mesh>

          {/* Hoodie Sleeves & Hands */}
          <mesh
            ref={leftHandRef}
            position={[-0.25, 0.34, 0.06]}
            rotation={[Math.PI / 2, 0, 0]}
            castShadow
          >
            <capsuleGeometry args={[0.05, 0.11, 6, 10]} />
            <meshStandardMaterial color={member.avatarColor} roughness={0.55} />
          </mesh>
          <mesh
            ref={rightHandRef}
            position={[0.25, 0.34, 0.06]}
            rotation={[Math.PI / 2, 0, 0]}
            castShadow
          >
            <capsuleGeometry args={[0.05, 0.11, 6, 10]} />
            <meshStandardMaterial color={member.avatarColor} roughness={0.55} />
          </mesh>
        </group>

        {/* Single-line Floating HUD Pill */}
        <Html
          position={[0, 1.66, 0]}
          center
          distanceFactor={10}
          zIndexRange={[10, 20]}
          portal={htmlPortal as RefObject<HTMLElement>}
        >
          <div className="pointer-events-none flex select-none items-center gap-1.5 whitespace-nowrap rounded-full border border-slate-200/80 bg-white/90 px-2.5 py-0.5 text-xs font-medium text-slate-800 shadow-sm backdrop-blur-sm">
            <span
              className={`size-2 shrink-0 rounded-full ${haloStyle.dotClass}`}
            />
            <span>
              {member.displayName}
              {isSelf ? " (You)" : ""} · {techniqueLabel}
            </span>
          </div>
        </Html>
      </group>
    </group>
  );
}
