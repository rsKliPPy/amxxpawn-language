export interface CompilerSettings {
    executablePath: string;
    includePaths: string[];
    options: string[];
    outputType: string;
    outputPath: string;
    showInfoMessages: boolean
};

export interface LanguageSettings {
    reparseInterval: number;
    webApiLinks: boolean;
};

export interface SyncedSettings {
    compiler: CompilerSettings;
    language: LanguageSettings;
}