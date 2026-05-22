/// <reference types="vite/client" />

type VirtualPortStatus = {
	state: 'running' | 'stopped' | 'error'
	pid?: number
	message?: string
	logPath?: string
}

type VirtualPortConfig = {
	leftPath: string
	rightPath: string
	mode: string
	extraOptions: string
}

interface Window {
	virtualPort: {
		start(config: VirtualPortConfig): Promise<VirtualPortStatus>
		stop(): Promise<VirtualPortStatus>
		status(): Promise<VirtualPortStatus>
	}
}
