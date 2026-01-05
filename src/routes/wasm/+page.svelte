<script lang="ts">
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import {
		Play,
		Square,
		Trash2,
		RefreshCw,
		Search,
		Cpu,
		HardDrive,
		Wifi,
		Zap,
		Cloud,
		Server,
		Box
	} from 'lucide-svelte';
	import {
		detectHardware,
		calculatePerformanceScore,
		selectRuntime,
		startWasmContainer,
		listWasmContainers,
		stopWasmContainer,
		removeWasmContainer,
		getRuntimeStats,
		QUANTUM_IMAGE_PRESETS,
		type HardwareProfile,
		type WasmContainer,
		type RuntimeType
	} from '$lib/wasm';

	// State
	let hardware = $state<HardwareProfile | null>(null);
	let performanceScore = $state(0);
	let containers = $state<WasmContainer[]>([]);
	let loading = $state(true);
	let searchQuery = $state('');

	// Available images from manifest
	const wasmImages = [
		{ id: 'quantum-base', name: 'Base Ubuntu', icon: '🏠', tools: 12 },
		{ id: 'quantum-languages', name: 'Languages', icon: '💻', tools: 15 },
		{ id: 'quantum-databases', name: 'Databases', icon: '💾', tools: 15 },
		{ id: 'quantum-ai', name: 'AI/ML', icon: '🤖', tools: 12 },
		{ id: 'quantum-kubernetes', name: 'Kubernetes', icon: '⚙️', tools: 15 },
		{ id: 'quantum-webservers', name: 'Web Servers', icon: '🌐', tools: 12 },
		{ id: 'quantum-devtools', name: 'DevOps', icon: '🔧', tools: 18 },
		{ id: 'quantum-security', name: 'Security', icon: '🔒', tools: 15 }
	];

	// Runtime badge colors
	function getRuntimeColor(runtime: RuntimeType): string {
		switch (runtime) {
			case 'container2wasm': return 'bg-purple-500';
			case 'wasmer-remote': return 'bg-blue-500';
			case 'hybrid': return 'bg-amber-500';
			default: return 'bg-gray-500';
		}
	}

	function getRuntimeLabel(runtime: RuntimeType): string {
		switch (runtime) {
			case 'container2wasm': return 'Local WASM';
			case 'wasmer-remote': return 'Remote';
			case 'hybrid': return 'Hybrid';
			default: return runtime;
		}
	}

	// Actions
	async function refreshHardware() {
		hardware = await detectHardware();
		performanceScore = calculatePerformanceScore(hardware);
	}

	async function launchContainer(imageId: string) {
		try {
			const container = await startWasmContainer(imageId);
			containers = listWasmContainers();
			toast.success(`Started ${imageId} on ${container.runtime}`);
		} catch (e) {
			toast.error(`Failed to start ${imageId}`);
		}
	}

	async function handleStop(id: string) {
		stopWasmContainer(id);
		containers = listWasmContainers();
		toast.info('Container stopped');
	}

	async function handleRemove(id: string) {
		removeWasmContainer(id);
		containers = listWasmContainers();
		toast.info('Container removed');
	}

	// Filtered containers
	const filteredContainers = $derived(
		searchQuery.trim()
			? containers.filter(c => c.image.toLowerCase().includes(searchQuery.toLowerCase()))
			: containers
	);

	// Stats
	const stats = $derived(getRuntimeStats());

	onMount(async () => {
		await refreshHardware();
		containers = listWasmContainers();
		loading = false;
	});
</script>

<svelte:head>
	<title>WASM Containers - Dockhand</title>
</svelte:head>

<div class="flex flex-col h-full">
	<PageHeader title="WASM Containers">
		<div slot="actions" class="flex items-center gap-2">
			<Button variant="outline" size="sm" onclick={refreshHardware}>
				<RefreshCw class="w-4 h-4 mr-2" />
				Refresh
			</Button>
		</div>
	</PageHeader>

	<div class="flex-1 overflow-auto p-6 space-y-6">
		<!-- Hardware Profile -->
		<div class="rounded-lg border bg-card p-6">
			<h2 class="text-lg font-semibold mb-4">Hardware Profile</h2>
			{#if hardware}
				<div class="grid grid-cols-2 md:grid-cols-4 gap-4">
					<div class="flex items-center gap-3 p-3 rounded-lg bg-muted">
						<HardDrive class="w-5 h-5 text-blue-500" />
						<div>
							<div class="text-sm text-muted-foreground">RAM</div>
							<div class="font-medium">{hardware.ram} MB</div>
						</div>
					</div>
					<div class="flex items-center gap-3 p-3 rounded-lg bg-muted">
						<Cpu class="w-5 h-5 text-green-500" />
						<div>
							<div class="text-sm text-muted-foreground">CPU Cores</div>
							<div class="font-medium">{hardware.cores}</div>
						</div>
					</div>
					<div class="flex items-center gap-3 p-3 rounded-lg bg-muted">
						<Wifi class="w-5 h-5 text-purple-500" />
						<div>
							<div class="text-sm text-muted-foreground">Connection</div>
							<div class="font-medium capitalize">{hardware.connection}</div>
						</div>
					</div>
					<div class="flex items-center gap-3 p-3 rounded-lg bg-muted">
						<Zap class="w-5 h-5 text-amber-500" />
						<div>
							<div class="text-sm text-muted-foreground">Score</div>
							<div class="font-medium">{performanceScore}/100</div>
						</div>
					</div>
				</div>
				<div class="mt-4 text-sm text-muted-foreground">
					{#if performanceScore >= 70}
						<Badge class="bg-green-500">Local WASM Recommended</Badge>
					{:else if performanceScore >= 40}
						<Badge class="bg-amber-500">Hybrid Mode</Badge>
					{:else}
						<Badge class="bg-blue-500">Remote Execution Recommended</Badge>
					{/if}
				</div>
			{:else}
				<div class="text-muted-foreground">Detecting hardware...</div>
			{/if}
		</div>

		<!-- Quick Launch -->
		<div class="rounded-lg border bg-card p-6">
			<h2 class="text-lg font-semibold mb-4">Quick Launch</h2>
			<div class="grid grid-cols-2 md:grid-cols-4 gap-3">
				{#each wasmImages as img}
					<button
						class="flex flex-col items-center gap-2 p-4 rounded-lg border hover:bg-muted transition-colors"
						onclick={() => launchContainer(img.id)}
					>
						<span class="text-2xl">{img.icon}</span>
						<span class="font-medium text-sm">{img.name}</span>
						<span class="text-xs text-muted-foreground">{img.tools} tools</span>
					</button>
				{/each}
			</div>
		</div>

		<!-- Running Containers -->
		<div class="rounded-lg border bg-card p-6">
			<div class="flex items-center justify-between mb-4">
				<h2 class="text-lg font-semibold">Running WASM Containers</h2>
				<div class="relative">
					<Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
					<Input
						placeholder="Search..."
						class="pl-9 w-64"
						bind:value={searchQuery}
					/>
				</div>
			</div>

			{#if filteredContainers.length === 0}
				<div class="text-center py-12 text-muted-foreground">
					<Box class="w-12 h-12 mx-auto mb-4 opacity-50" />
					<p>No WASM containers running</p>
					<p class="text-sm">Launch one from Quick Launch above</p>
				</div>
			{:else}
				<div class="space-y-2">
					{#each filteredContainers as container}
						<div class="flex items-center justify-between p-4 rounded-lg border bg-muted/50">
							<div class="flex items-center gap-4">
								<div class="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
									<Server class="w-5 h-5 text-purple-500" />
								</div>
								<div>
									<div class="font-medium">{container.image}</div>
									<div class="text-sm text-muted-foreground">
										ID: {container.id}
									</div>
								</div>
							</div>
							<div class="flex items-center gap-3">
								<Badge class={getRuntimeColor(container.runtime)}>
									{getRuntimeLabel(container.runtime)}
								</Badge>
								<Badge variant={container.status === 'running' ? 'default' : 'secondary'}>
									{container.status}
								</Badge>
								<Button variant="ghost" size="icon" onclick={() => handleStop(container.id)}>
									<Square class="w-4 h-4" />
								</Button>
								<Button variant="ghost" size="icon" onclick={() => handleRemove(container.id)}>
									<Trash2 class="w-4 h-4 text-red-500" />
								</Button>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>

		<!-- Stats -->
		<div class="rounded-lg border bg-card p-6">
			<h2 class="text-lg font-semibold mb-4">Runtime Statistics</h2>
			<div class="grid grid-cols-3 gap-4">
				<div class="text-center p-4 rounded-lg bg-purple-500/10">
					<div class="text-2xl font-bold text-purple-500">
						{stats.byRuntime['container2wasm']}
					</div>
					<div class="text-sm text-muted-foreground">Local WASM</div>
				</div>
				<div class="text-center p-4 rounded-lg bg-blue-500/10">
					<div class="text-2xl font-bold text-blue-500">
						{stats.byRuntime['wasmer-remote']}
					</div>
					<div class="text-sm text-muted-foreground">Remote</div>
				</div>
				<div class="text-center p-4 rounded-lg bg-amber-500/10">
					<div class="text-2xl font-bold text-amber-500">
						{stats.byRuntime['hybrid']}
					</div>
					<div class="text-sm text-muted-foreground">Hybrid</div>
				</div>
			</div>
			<div class="mt-4 text-sm text-muted-foreground text-center">
				{stats.totalImages} images available • {stats.totalTools} tools
			</div>
		</div>
	</div>
</div>
