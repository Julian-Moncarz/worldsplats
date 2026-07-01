'use client';

import React, { useCallback, useRef } from 'react';
import { Canvas } from '@react-three/fiber';

import SparkLayer from '@/components/spark/SparkLayer';
import SplatWorld from '@/components/spark/SplatWorld';
import PlayerController from '@/components/controls/PlayerController';
import PointerLockBridge from '@/components/scene/PointerLockBridge';
import TouchLookController from '@/components/controls/TouchLookController';
import EditCapture from '@/components/edit/EditCapture';
import Markers from '@/components/edit/Markers';
import Exits from '@/components/scene/Exits';
import ArtifactsLayer from '@/components/scene/Artifacts';
import type { WorldDef } from '@/data/presets';
import type { Exit, Artifact } from '@/data/room';

type Props = {
  world: WorldDef;
  playerMoveSpeed?: number;
  onLoadingChange?: (isLoading: boolean, error?: string) => void;
  mobileInputRef?: React.MutableRefObject<{x:number;y:number}>;
  exits?: Exit[];
  onExit?: (to: string) => void;
  onActiveExitChange?: (active: boolean) => void;
  artifacts?: Artifact[];
  onArtifactOpen?: (url: string) => void;
  onActiveArtifactChange?: (active: boolean) => void;
  spawnYaw?: number;
  spawnKey?: string;
};

function SceneInner({
  world,
  playerMoveSpeed,
  onLoadingChange,
  mobileInputRef,
  exits,
  onExit,
  onActiveExitChange,
  artifacts,
  onArtifactOpen,
  onActiveArtifactChange,
  spawnYaw,
  spawnKey }: Props) {
  const localMobileInputRef = useRef<{x:number;y:number}>({x:0,y:0});
  const inputRef = mobileInputRef || localMobileInputRef;

  const handleLoadingChange = useCallback((loading: boolean, error?: string) => {
    onLoadingChange?.(loading, error);
  }, [onLoadingChange]);

  return (
    <>
      {/* FPS-style player controls */}
      <PlayerController
        mobileInputRef={inputRef}
        moveSpeed={playerMoveSpeed}
        spawnYaw={spawnYaw}
        spawnKey={spawnKey}
      />

      {/* Edit-mode marking capture + marker orbs (no-op unless edit mode) */}
      <EditCapture />
      <Markers />

      {/* Exits → links to other rooms */}
      {exits && onExit && (
        <Exits
          exits={exits}
          onExit={onExit}
          onActiveChange={onActiveExitChange ?? (() => {})}
        />
      )}

      {/* Artifacts → open a web URL in an overlay */}
      {artifacts && onArtifactOpen && (
        <ArtifactsLayer
          artifacts={artifacts}
          onOpen={onArtifactOpen}
          onActiveChange={onActiveArtifactChange ?? (() => {})}
        />
      )}

      {/* Touch-based camera look for mobile */}
      <TouchLookController />

      {/* Spark renderer + the current Splat world */}
      <SparkLayer />
      <SplatWorld
        key={world.url}
        url={world.url}
        position={world.position}
        quaternion={world.quaternion}
        scale={world.scale}
        onLoadingChange={handleLoadingChange}
      />

      {/* Usual lighting for mesh-based objects */}
      <ambientLight intensity={0.5} />
      <directionalLight position={[5, 10, 5]} intensity={0.8} />
    </>
  );
}

export default function WorldScene({
  world,
  playerMoveSpeed,
  onLoadingChange,
  mobileInputRef,
  exits,
  onExit,
  onActiveExitChange,
  artifacts,
  onArtifactOpen,
  onActiveArtifactChange,
  spawnYaw,
  spawnKey }: Props) {
  const handleLoadingChange = useCallback((loading: boolean, error?: string) => {
    onLoadingChange?.(loading, error);
  }, [onLoadingChange]);

  // Cap DPR more aggressively on mobile for performance
  const dprCap = typeof window !== 'undefined' && matchMedia('(pointer: coarse)').matches ? 1.0 : 1.5;

  return (
    <div className="canvas-root absolute inset-0">
      <Canvas
      // Spark guidance: leave antialias off for better performance with splats
      gl={{
        antialias: false,
        // Avoid preserveDrawingBuffer; it increases memory pressure
        preserveDrawingBuffer: false,
        // Enable context loss recovery
        failIfMajorPerformanceCaveat: false,
        // Power preference for better compatibility
        powerPreference: "high-performance"
      }}
      dpr={[1, dprCap]}
      // Disable shadows for now to reduce GPU pressure
      shadows={false}
      camera={{ fov: 60, near: 0.1, far: 1000, position: [0, 1.2, 3] }}
    >
      <PointerLockBridge />
      <TouchLookController />

      <SceneInner
        world={world}
        playerMoveSpeed={playerMoveSpeed}
        onLoadingChange={handleLoadingChange}
        mobileInputRef={mobileInputRef}
        exits={exits}
        onExit={onExit}
        onActiveExitChange={onActiveExitChange}
        artifacts={artifacts}
        onArtifactOpen={onArtifactOpen}
        onActiveArtifactChange={onActiveArtifactChange}
        spawnYaw={spawnYaw}
        spawnKey={spawnKey}
      />
    </Canvas>
    </div>
  );
}
