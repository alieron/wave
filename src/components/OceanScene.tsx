import { useRef, useCallback, useEffect, createContext, useContext } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { type WaveSource, computeWaveHeight, batchComputeWaveHeights } from '@/lib/waveTypes';

interface OceanSceneProps {
  sources: WaveSource[];
  buoyX: number;
  buoyZ: number;
  paused: boolean;
  isResizingRef: React.RefObject<boolean>;
  onSourcesChange: (sources: WaveSource[]) => void;
}

// Shared ref so markers can disable orbit controls during drag
const ControlsContext = createContext<React.RefObject<any> | null>(null);

function WaterSurface({ sources, timeRef, isResizingRef }: {
  sources: WaveSource[];
  timeRef: React.RefObject<number>;
  isResizingRef: React.RefObject<boolean>;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const srcRef = useRef(sources);
  srcRef.current = sources;

  useFrame(() => {
    if (isResizingRef.current) return;
    const mesh = meshRef.current;
    if (!mesh) return;
    const pos = mesh.geometry.attributes.position;
    batchComputeWaveHeights(pos, timeRef.current, srcRef.current);
    pos.needsUpdate = true;
    mesh.geometry.computeVertexNormals();
  });

  return (
    <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[60, 60, 50, 50]} />
      {/* <planeGeometry args={[60, 60, 80, 80]} /> */}
      <meshStandardMaterial
        color="#0a6e8a"
        roughness={0.3}
        metalness={0.05}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

function BuoyMesh({ x, z, sources, timeRef, isResizingRef }: {
  x: number;
  z: number;
  sources: WaveSource[];
  timeRef: React.RefObject<number>;
  isResizingRef: React.RefObject<boolean>;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const srcRef = useRef(sources);
  srcRef.current = sources;

  useFrame(() => {
    if (isResizingRef.current) return;
    if (!groupRef.current) return;
    const h = computeWaveHeight(x, z, timeRef.current, srcRef.current);
    groupRef.current.position.set(x, h, z);
  });

  return (
    <group ref={groupRef}>
      <mesh position={[0, 0.3, 0]}>
        <sphereGeometry args={[0.5, 16, 16]} />
        <meshStandardMaterial color="#ff3333" emissive="#ff0000" emissiveIntensity={0.3} />
      </mesh>
      <mesh position={[0, 1.2, 0]}>
        <cylinderGeometry args={[0.04, 0.04, 1.4, 6]} />
        <meshStandardMaterial color="#ff3333" emissive="#ff0000" emissiveIntensity={0.3} />
      </mesh>
      <mesh position={[0.25, 1.7, 0]}>
        <planeGeometry args={[0.5, 0.3]} />
        <meshStandardMaterial color="#ff3333" emissive="#ff0000" emissiveIntensity={0.4} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

function DraggableSourceMarker({ source, onDrag }: {
  source: WaveSource;
  onDrag: (id: string, x: number, z: number) => void;
}) {
  const ringRef = useRef<THREE.Mesh>(null);
  const groupRef = useRef<THREE.Group>(null);
  const { camera, raycaster, gl } = useThree();
  const controlsRef = useContext(ControlsContext);
  const isDragging = useRef(false);
  const plane = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0));

  useFrame(({ clock }) => {
    if (!ringRef.current) return;
    const s = 1 + 0.3 * Math.sin(clock.getElapsedTime() * source.frequency);
    ringRef.current.scale.set(s, s, 1);
  });

  const onPointerDown = useCallback((e: any) => {
    if (!e.nativeEvent.shiftKey) return;
    e.stopPropagation();
    isDragging.current = true;
    gl.domElement.style.cursor = 'grabbing';
    if (controlsRef?.current) controlsRef.current.enabled = false;
    gl.domElement.setPointerCapture(e.nativeEvent.pointerId);
  }, [gl, controlsRef]);

  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      if (!isDragging.current) return;
      const rect = gl.domElement.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(mouse, camera);
      const intersection = new THREE.Vector3();
      raycaster.ray.intersectPlane(plane.current, intersection);
      if (intersection) {
        onDrag(source.id, Math.round(intersection.x * 10) / 10, Math.round(intersection.z * 10) / 10);
      }
    };

    const onPointerUp = () => {
      if (!isDragging.current) return;
      isDragging.current = false;
      gl.domElement.style.cursor = '';
      if (controlsRef?.current) controlsRef.current.enabled = true;
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [camera, raycaster, gl, source.id, onDrag, controlsRef]);

  return (
    <group ref={groupRef} position={[source.x, 0.5, source.z]} onPointerDown={onPointerDown}>
      <mesh>
        <sphereGeometry args={[0.6, 12, 12]} />
        <meshStandardMaterial
          color={source.color}
          emissive={source.color}
          emissiveIntensity={0.4}
          transparent
          opacity={0.85}
        />
      </mesh>
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.3, 0]}>
        <ringGeometry args={[0.9, 1.1, 24]} />
        <meshBasicMaterial color={source.color} transparent opacity={0.3} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

function Scene({ sources, buoyX, buoyZ, paused, isResizingRef, onSourcesChange }: OceanSceneProps) {
  const srcRef = useRef(sources);
  srcRef.current = sources;
  const onSourcesChangeRef = useRef(onSourcesChange);
  onSourcesChangeRef.current = onSourcesChange;

  const timeRef = useRef(0);
  const controlsRef = useRef<any>(null);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  const handleDrag = useCallback((id: string, x: number, z: number) => {
    onSourcesChangeRef.current(srcRef.current.map(s => s.id === id ? { ...s, x, z } : s));
  }, []);

  useFrame((_, delta) => {
    if (pausedRef.current || isResizingRef.current) return;
    timeRef.current += Math.min(delta, 0.1);
  });

  return (
    <ControlsContext.Provider value={controlsRef}>
      <ambientLight intensity={0.35} />
      <directionalLight position={[10, 25, 10]} intensity={1.2} />
      <directionalLight position={[-15, 10, -10]} intensity={0.3} color="#4488cc" />
      <WaterSurface sources={sources} timeRef={timeRef} isResizingRef={isResizingRef} />
      <BuoyMesh x={buoyX} z={buoyZ} sources={sources} timeRef={timeRef} isResizingRef={isResizingRef} />
      {sources.filter(s => s.enabled).map(s => (
        <DraggableSourceMarker key={s.id} source={s} onDrag={handleDrag} />
      ))}
      <OrbitControls
        ref={controlsRef}
        minPolarAngle={0.2}
        maxPolarAngle={Math.PI / 2.2}
        minDistance={10}
        maxDistance={80}
        target={[0, 0, 0]}
      />
    </ControlsContext.Provider>
  );
}

export default function OceanScene(props: OceanSceneProps) {
  return (
    <div className="w-full h-full">
      <Canvas camera={{ position: [25, 20, 25], fov: 50, near: 0.1, far: 200 }}>
        <color attach="background" args={['#050e18']} />
        <Scene {...props} />
      </Canvas>
    </div>
  );
}
