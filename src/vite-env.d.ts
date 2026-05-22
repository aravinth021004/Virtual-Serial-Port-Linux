/// <reference types="vite/client" />

type VirtualPortStatus = {
	state: 'running' | 'stopped' | 'error'
	pid?: number
	message?: string
	logPath?: string
	details?: string
}

type VirtualPortConfig = {
	id: string
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
		stop(id: string, auth: VirtualPortAuth): Promise<VirtualPortStatus>
		status(id: string): Promise<VirtualPortStatus>
		readLog(id: string): Promise<string>
	}
}
