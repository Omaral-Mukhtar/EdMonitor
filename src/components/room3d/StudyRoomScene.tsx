"use client";

import type { RefObject } from "react";
import { useEffect, useState } from "react";
import { ContactShadows, OrbitControls } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { ProceduralAvatar } from "@/components/room3d/ProceduralAvatar";
import { ProceduralRoomMesh } from "@/components/room3d/ProceduralRoomMesh";
import { StudyTableCluster } from "@/components/room3d/StudyTableCluster";
import { STUDY_TABLES } from "@/lib/room-layout";
import type { CampusSubject, RoomPresenceState } from "@/types/domain";

interface StudyRoomSceneProps {
  subject: CampusSubject;
  accentHex: string;
  selfState: RoomPresenceState;
  remoteMembers: RoomPresenceState[];
  isOverlayOpen?: boolean;
  htmlPortal?: RefObject<HTMLElement | null>;
  onFloorClick: (point: [number, number, number]) => void;
  onSelectSeat: (tableId: string, seatIndex: number) => void;
}

function SceneDisposalManager() {
  const { scene } = useThree();

  useEffect(() => {
    return () => {
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.LineSegments) {
          obj.geometry?.dispose();
          if (Array.isArray(obj.material)) {
            for (const mat of obj.material) {
              mat.dispose();
            }
          } else {
            obj.material?.dispose();
          }
        }
      });
    };
  }, [scene]);

  return null;
}

export function StudyRoomScene({
  subject,
  accentHex,
  selfState,
  remoteMembers,
  isOverlayOpen = false,
  htmlPortal,
  onFloorClick,
  onSelectSeat,
}: StudyRoomSceneProps) {
  const [isTabHidden, setIsTabHidden] = useState<boolean>(() =>
    typeof document !== "undefined"
      ? document.visibilityState === "hidden"
      : false
  );

  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsTabHidden(document.visibilityState === "hidden");
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      document.body.style.cursor = "auto";
    };
  }, []);

  const is3DPaused = isTabHidden || isOverlayOpen;
  const allMembers = [selfState, ...remoteMembers];

  return (
    <div
      data-testid="study-room-canvas-container"
      data-frameloop={is3DPaused ? "never" : "always"}
      className="absolute inset-0 z-0 bg-[#EFEAE2]"
    >
      <Canvas
        dpr={[1, 1.75]}
        shadows
        camera={{ position: [9.5, 9.2, 10.5], fov: 40, near: 0.1, far: 80 }}
        frameloop={is3DPaused ? "never" : "always"}
      >
        <color attach="background" args={["#EFEAE2"]} />

        {/* Soft warm daylight studio lighting */}
        <hemisphereLight args={["#FFFDF7", "#D6CEC2", 1.0]} />
        <directionalLight
          position={[8, 12, 7]}
          intensity={1.1}
          castShadow
          shadow-mapSize={[1024, 1024]}
          shadow-camera-left={-10}
          shadow-camera-right={10}
          shadow-camera-top={10}
          shadow-camera-bottom={-10}
        />

        <ContactShadows
          position={[0, 0.008, 0]}
          opacity={0.32}
          scale={18}
          blur={2.2}
          far={6}
        />

        <OrbitControls
          makeDefault
          target={[0, 0.4, 0]}
          enableDamping
          dampingFactor={0.08}
          minPolarAngle={0.35}
          maxPolarAngle={Math.PI / 2 - 0.12}
          minAzimuthAngle={-Math.PI / 6}
          maxAzimuthAngle={Math.PI * 0.68}
          minDistance={6}
          maxDistance={21}
          enablePan={false}
        />

        <ProceduralRoomMesh
          subject={subject}
          accentHex={accentHex}
          onFloorClick={onFloorClick}
        />

        <StudyTableCluster
          tables={STUDY_TABLES}
          members={allMembers}
          selfTableId={selfState.tableId}
          selfSeatIndex={selfState.seatIndex}
          accentHex={accentHex}
          htmlPortal={htmlPortal}
          onSelectSeat={onSelectSeat}
        />

        <ProceduralAvatar member={selfState} isSelf htmlPortal={htmlPortal} />
        {remoteMembers.map((member, index) => (
          <ProceduralAvatar
            key={member.clientId ?? `${member.userId}-${index}`}
            member={member}
            isSelf={false}
            htmlPortal={htmlPortal}
          />
        ))}

        <SceneDisposalManager />
      </Canvas>
    </div>
  );
}
