export interface InstallationResponse {
    readonly name: string;
    readonly stdout?: string;
    readonly stderr?: string;
    readonly code?: string;
    readonly somevalue?: string;
    readonly cloudEnv?: string;
}