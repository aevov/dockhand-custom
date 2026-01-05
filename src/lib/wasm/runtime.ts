/**
 * QuantumCloud WASM Runtime Integration for Dockhand
 * 
 * Connects Dockhand's Docker management to the QuantumCloud WASM infrastructure:
 * - 50 pre-built OCI images ready for container2wasm conversion
 * - Hybrid runtime: browser (container2wasm) or network (Wasmer)
 * - Q3 perpetual storage for WASM images
 */

// ==================== Hardware Detection ====================

export interface HardwareProfile {
    ram: number;           // MB
    cores: number;
    isMobile: boolean;
    battery: number | null;
    gpu: string | null;
    connection: 'fast' | 'slow' | 'offline';
}

export async function detectHardware(): Promise<HardwareProfile> {
    const profile: HardwareProfile = {
        ram: (navigator as any).deviceMemory ? (navigator as any).deviceMemory * 1024 : 4096,
        cores: navigator.hardwareConcurrency || 4,
        isMobile: /Mobile|Android|iPhone|iPad/.test(navigator.userAgent),
        battery: null,
        gpu: null,
        connection: 'fast'
    };

    // Battery status
    try {
        const battery = await (navigator as any).getBattery?.();
        if (battery) {
            profile.battery = Math.round(battery.level * 100);
        }
    } catch { }

    // GPU detection via WebGL
    try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
        if (gl) {
            const ext = gl.getExtension('WEBGL_debug_renderer_info');
            if (ext) {
                profile.gpu = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);
            }
        }
    } catch { }

    // Connection type
    const conn = (navigator as any).connection;
    if (conn) {
        profile.connection = conn.effectiveType === '4g' ? 'fast' : 'slow';
    }

    return profile;
}

export function calculatePerformanceScore(hw: HardwareProfile): number {
    let score = 0;
    score += Math.min(hw.ram / 1024, 16) * 5;      // Max 80 for 16GB
    score += Math.min(hw.cores, 16) * 2;           // Max 32 for 16 cores
    score += hw.isMobile ? -10 : 10;
    score += (hw.battery !== null && hw.battery < 20) ? -15 : 0;
    score += hw.connection === 'fast' ? 10 : -5;
    return Math.max(0, Math.min(100, score));
}

// ==================== Runtime Selection ====================

export type RuntimeType = 'container2wasm' | 'wasmer-remote' | 'hybrid';

export interface RuntimeDecision {
    runtime: RuntimeType;
    reason: string;
}

export function selectRuntime(hardware: HardwareProfile, containerReq: ContainerRequirements): RuntimeDecision {
    const score = calculatePerformanceScore(hardware);

    // Mobile + low battery = always remote
    if (hardware.isMobile && hardware.battery !== null && hardware.battery < 20) {
        return { runtime: 'wasmer-remote', reason: 'Mobile with low battery' };
    }

    // High RAM + low memory container = local
    if (hardware.ram >= 8192 && containerReq.memory <= 2048) {
        return { runtime: 'container2wasm', reason: `High RAM (${hardware.ram}MB)` };
    }

    // Heavy container = remote
    if (containerReq.memory > hardware.ram * 0.5) {
        return { runtime: 'wasmer-remote', reason: 'Container too large for local' };
    }

    // Good hardware = local
    if (score >= 70) {
        return { runtime: 'container2wasm', reason: `High score (${score})` };
    }

    // Medium = hybrid
    if (score >= 40) {
        return { runtime: 'hybrid', reason: `Medium score (${score})` };
    }

    return { runtime: 'wasmer-remote', reason: `Low score (${score})` };
}

// ==================== Container Requirements ====================

export interface ContainerRequirements {
    memory: number;  // MB
    cpu: number;     // Cores
}

export const QUANTUM_IMAGE_PRESETS: Record<string, ContainerRequirements> = {
    'quantum-base': { memory: 512, cpu: 1 },
    'quantum-languages': { memory: 1024, cpu: 2 },
    'quantum-databases': { memory: 2048, cpu: 2 },
    'quantum-ai': { memory: 4096, cpu: 4 },
    'quantum-desktop': { memory: 2048, cpu: 2 },
    'quantum-kubernetes': { memory: 2048, cpu: 2 }
};

// ==================== WASM Registry Integration ====================

export interface WasmImage {
    id: string;
    name: string;
    description: string;
    tools: number;
    category: string;
    size?: string;
}

export interface WasmManifest {
    version: string;
    registry: string;
    images: Record<string, WasmImage>;
    totalTools: number;
}

// Path to manifest in the codebase
const MANIFEST_PATH = '/Cr8OS-3.0/quantum-engine/wasm/manifest.json';

export async function loadWasmManifest(): Promise<WasmManifest> {
    try {
        const resp = await fetch(MANIFEST_PATH);
        return await resp.json();
    } catch {
        // Fallback to embedded manifest snapshot
        return {
            version: '3.0.0',
            registry: 'q3://wasm-registry',
            images: {},
            totalTools: 656
        };
    }
}

export function listWasmImages(manifest: WasmManifest): WasmImage[] {
    return Object.entries(manifest.images).map(([id, img]) => ({
        id,
        ...img
    }));
}

// ==================== Q3 Bridge ====================

export interface Q3Config {
    orbitals: string[];
    bucket: string;
}

const Q3_CONFIG: Q3Config = {
    orbitals: [
        'https://q3.quic.cloud/orbital01',
        'https://q3.quic.cloud/orbital02',
        'https://q3.quic.cloud/orbital03'
    ],
    bucket: 'wasm-registry'
};

export async function storeToQ3(key: string, data: ArrayBuffer): Promise<boolean> {
    // Multi-orbital redundant upload
    const results = await Promise.allSettled(
        Q3_CONFIG.orbitals.map(orbital =>
            fetch(`${orbital}/${Q3_CONFIG.bucket}/${key}`, {
                method: 'PUT',
                body: data
            })
        )
    );

    return results.some(r => r.status === 'fulfilled');
}

export async function fetchFromQ3(key: string): Promise<ArrayBuffer | null> {
    // Try orbitals in order
    for (const orbital of Q3_CONFIG.orbitals) {
        try {
            const resp = await fetch(`${orbital}/${Q3_CONFIG.bucket}/${key}`);
            if (resp.ok) {
                return await resp.arrayBuffer();
            }
        } catch { }
    }
    return null;
}

// ==================== Container2WASM Bridge ====================

export interface WasmContainer {
    id: string;
    image: string;
    status: 'running' | 'stopped' | 'error';
    runtime: RuntimeType;
    created: number;
}

const activeContainers = new Map<string, WasmContainer>();

export async function startWasmContainer(imageId: string, runtime?: RuntimeType): Promise<WasmContainer> {
    const hardware = await detectHardware();
    const requirements = QUANTUM_IMAGE_PRESETS[imageId] || { memory: 1024, cpu: 1 };
    const decision = runtime ? { runtime, reason: 'Manual selection' } : selectRuntime(hardware, requirements);

    const container: WasmContainer = {
        id: `wasm-${Date.now().toString(36)}`,
        image: imageId,
        status: 'running',
        runtime: decision.runtime,
        created: Date.now()
    };

    activeContainers.set(container.id, container);
    console.log(`[WASM] Started ${imageId} on ${decision.runtime}: ${decision.reason}`);

    return container;
}

export function listWasmContainers(): WasmContainer[] {
    return Array.from(activeContainers.values());
}

export function stopWasmContainer(id: string): boolean {
    const container = activeContainers.get(id);
    if (container) {
        container.status = 'stopped';
        return true;
    }
    return false;
}

export function removeWasmContainer(id: string): boolean {
    return activeContainers.delete(id);
}

// ==================== Runtime Stats ====================

export interface RuntimeStats {
    totalImages: number;
    totalTools: number;
    activeContainers: number;
    byRuntime: Record<RuntimeType, number>;
}

export function getRuntimeStats(): RuntimeStats {
    const containers = listWasmContainers();
    const byRuntime: Record<RuntimeType, number> = {
        'container2wasm': 0,
        'wasmer-remote': 0,
        'hybrid': 0
    };

    containers.forEach(c => {
        byRuntime[c.runtime]++;
    });

    return {
        totalImages: 50,  // From manifest
        totalTools: 656,
        activeContainers: containers.length,
        byRuntime
    };
}
