/// <reference types="vite/client" />

type VirtualPortStatus = {
	state: 'running' | 'stopped' | 'error'
	pid?: number
	message?: string
	logPath?: string
	details?: string
}

type VirtualPortConfig = {
	leftPath: string
	rightPath: string
	mode: string
	extraOptions: string
}

type VirtualPortAuth = {
	useSudo: boolean
	password?: string
}

interface Window {
	virtualPort: {
		start(config: VirtualPortConfig, auth: VirtualPortAuth): Promise<VirtualPortStatus>
		stop(auth: VirtualPortAuth): Promise<VirtualPortStatus>
		status(): Promise<VirtualPortStatus>
	}
}
