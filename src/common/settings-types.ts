export interface CompilerSettings {
    executablePath: string;
    includePaths: string[];
    options: string[];
    outputType: string;
    outputPath: string;
};

export interface GameSettings {
    executablePath: string;
    mod: string;
    pluginsIniPath: string;
};

export interface LanguageSettings {
    reparseInterval: number;
};

export interface SyncedSettings {
    compiler: CompilerSettings;
    language: LanguageSettings;
}